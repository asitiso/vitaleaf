import { deleteObject, getDownloadURL, ref, uploadBytesResumable, type StorageReference } from "firebase/storage";

import type { ProductMedia } from "../products/types";
import { storage } from "./client";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type ResumableUploadTask = {
  on(
    event: "state_changed",
    next: (snapshot: { bytesTransferred: number; totalBytes: number }) => void,
    error: (error: unknown) => void,
    complete: () => void,
  ): void;
  cancel(): void;
};

export type UploadTaskController = {
  promise: Promise<ProductMedia>;
  cancel(): void;
};

export type ProductMediaStorageAdapter = {
  createRef(path: string): unknown;
  startResumable(reference: unknown, file: File): ResumableUploadTask;
  getDownloadUrl(reference: unknown): Promise<string>;
  delete(reference: unknown): Promise<void>;
  randomUUID(): string;
};

type UploadProductImageArgs = {
  productId: string;
  file: File;
  alt: string;
  order: number;
  onProgress(percent: number): void;
};

type DeleteProductImageArgs = {
  productId: string;
  storagePath: string;
};

export type ImageFileValidation = { ok: true } | { ok: false; message: string };

const safeProductId = (productId: string): boolean => (
  productId.trim().length > 0
  && productId === productId.trim()
  && !productId.includes("/")
  && !productId.includes("\\")
  && productId !== "."
  && productId !== ".."
);

const requireSafeProductId = (productId: string): void => {
  if (!safeProductId(productId)) throw new Error("안전한 상품 식별자가 필요합니다.");
};

const getExtension = (file: File): string | null => imageExtensions[file.type] ?? null;

const uploadErrorMessage = (error: unknown): string => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

  if (code === "storage/canceled") return "업로드가 취소되었습니다.";
  if (code === "storage/unauthorized") return "관리자 권한이 없어 이미지를 업로드할 수 없습니다.";
  if (code === "storage/quota-exceeded") return "저장 공간이 부족합니다. 관리자에게 문의해 주세요.";
  return "이미지 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.";
};

export const validateImageFile = (file: Pick<File, "type" | "size">): ImageFileValidation => {
  if (!(file.type in imageExtensions)) {
    return { ok: false, message: "지원하지 않는 파일 형식입니다. JPEG, PNG 또는 WebP 이미지를 선택해 주세요." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "이미지 파일은 10 MiB 이하만 업로드할 수 있습니다." };
  }
  return { ok: true };
};

const validStoragePath = (productId: string, storagePath: string): boolean => {
  const prefix = `products/${productId}/`;
  const fileName = storagePath.startsWith(prefix) ? storagePath.slice(prefix.length) : "";
  return fileName.length > 0 && !fileName.includes("/") && !fileName.includes("\\") && fileName !== "." && fileName !== "..";
};

export const createProductMediaAdapter = (adapter: ProductMediaStorageAdapter) => ({
  uploadProductImage(args: UploadProductImageArgs): UploadTaskController {
    const validation = validateImageFile(args.file);
    if (validation.ok === false) return { promise: Promise.reject(new Error(validation.message)), cancel: () => undefined };

    try {
      requireSafeProductId(args.productId);
      const extension = getExtension(args.file);
      if (!extension) return { promise: Promise.reject(new Error("지원하지 않는 파일 형식입니다. JPEG, PNG 또는 WebP 이미지를 선택해 주세요.")), cancel: () => undefined };

      const storagePath = `products/${args.productId}/${adapter.randomUUID()}.${extension}`;
      const reference = adapter.createRef(storagePath);
      const task = adapter.startResumable(reference, args.file);
      const promise = new Promise<ProductMedia>((resolve, reject) => {
        task.on(
          "state_changed",
          (snapshot) => {
            const percent = snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
            args.onProgress(Math.min(100, Math.max(0, percent)));
          },
          (error) => reject(new Error(uploadErrorMessage(error))),
          () => {
            void adapter.getDownloadUrl(reference).then((url) => resolve({
              url,
              storagePath,
              alt: args.alt,
              order: args.order,
            }), (error) => reject(new Error(uploadErrorMessage(error))));
          },
        );
      });

      return { promise, cancel: () => task.cancel() };
    } catch (error) {
      return { promise: Promise.reject(error), cancel: () => undefined };
    }
  },

  async deleteProductImage({ productId, storagePath }: DeleteProductImageArgs): Promise<void> {
    requireSafeProductId(productId);
    if (!validStoragePath(productId, storagePath)) throw new Error("해당 상품의 이미지 경로만 삭제할 수 있습니다.");
    try {
      await adapter.delete(adapter.createRef(storagePath));
    } catch (error) {
      throw new Error(uploadErrorMessage(error));
    }
  },
});

const firebaseProductMediaAdapter: ProductMediaStorageAdapter = {
  createRef: (path) => ref(storage, path),
  startResumable: (reference, file) => uploadBytesResumable(reference as StorageReference, file, { contentType: file.type }),
  getDownloadUrl: (reference) => getDownloadURL(reference as StorageReference),
  delete: (reference) => deleteObject(reference as StorageReference),
  randomUUID: () => crypto.randomUUID(),
};

const productMedia = createProductMediaAdapter(firebaseProductMediaAdapter);

export const uploadProductImage = productMedia.uploadProductImage;
export const deleteProductImage = productMedia.deleteProductImage;
