import { deleteObject, getDownloadURL, ref, uploadBytesResumable, type StorageReference } from "firebase/storage";

import type { ProductMedia } from "../products/types";
import { storage } from "./client";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DRAFT_ID_BYTES = 1500;

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

export class ProductMediaOperationError extends Error {
  readonly storagePath: string | null;
  readonly cause: unknown;
  readonly cleanupCause: unknown;

  constructor(message: string, details: { storagePath: string | null; cause: unknown; cleanupCause?: unknown }) {
    super(message);
    this.name = "ProductMediaOperationError";
    this.storagePath = details.storagePath;
    this.cause = details.cause;
    this.cleanupCause = details.cleanupCause;
  }
}

const safeProductId = (productId: string): boolean => (
  productId.length > 0
  && new TextEncoder().encode(productId).byteLength <= MAX_DRAFT_ID_BYTES
  && !productId.includes("/")
  && !productId.includes("\\")
  && !productId.includes(".")
  && !/\p{Cc}/u.test(productId)
);

const requireSafeProductId = (productId: string): void => {
  if (!safeProductId(productId)) throw new Error("안전한 상품 식별자가 필요합니다.");
};

const getExtension = (file: File): string | null => imageExtensions[file.type] ?? null;
const generatedImageFileName = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

const uploadErrorMessage = (error: unknown): string => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

  if (code === "storage/canceled") return "업로드가 취소되었습니다.";
  if (code === "storage/unauthorized") return "관리자 권한이 없어 이미지를 업로드할 수 없습니다.";
  if (code === "storage/quota-exceeded") return "저장 공간이 부족합니다. 관리자에게 문의해 주세요.";
  return "이미지 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.";
};

const uploadOperationError = (storagePath: string, error: unknown, cleanupCause?: unknown): ProductMediaOperationError => (
  new ProductMediaOperationError(uploadErrorMessage(error), { storagePath, cause: error, cleanupCause })
);

const deleteErrorMessage = (error: unknown): string => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

  if (code === "storage/unauthorized") return "관리자 권한이 없어 이미지를 삭제할 수 없습니다.";
  if (code === "storage/object-not-found") return "삭제할 이미지를 찾을 수 없습니다. 목록을 새로고침해 주세요.";
  return "이미지 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.";
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
  return generatedImageFileName.test(fileName);
};

export const createProductMediaAdapter = (adapter: ProductMediaStorageAdapter) => ({
  uploadProductImage(args: UploadProductImageArgs): UploadTaskController {
    const validation = validateImageFile(args.file);
    if (validation.ok === false) return { promise: Promise.reject(new Error(validation.message)), cancel: () => undefined };

    try {
      requireSafeProductId(args.productId);
      const extension = getExtension(args.file);
      if (!extension) return { promise: Promise.reject(new Error("지원하지 않는 파일 형식입니다. JPEG, PNG 또는 WebP 이미지를 선택해 주세요.")), cancel: () => undefined };

      const fileName = `${adapter.randomUUID()}.${extension}`;
      if (!generatedImageFileName.test(fileName)) {
        return { promise: Promise.reject(new Error("안전한 이미지 파일명을 만들지 못했습니다. 다시 시도해 주세요.")), cancel: () => undefined };
      }
      const storagePath = `products/${args.productId}/${fileName}`;
      const reference = adapter.createRef(storagePath);
      const task = adapter.startResumable(reference, args.file);
      let state: "uploading" | "resolving-url" | "canceled" | "settled" = "uploading";
      let cleanupPromise: Promise<void> | null = null;
      let resolvePromise!: (media: ProductMedia) => void;
      let rejectPromise!: (error: ProductMediaOperationError) => void;
      const cleanup = (): Promise<void> => {
        cleanupPromise ??= Promise.resolve().then(() => adapter.delete(reference));
        return cleanupPromise;
      };
      const rejectWithoutCleanup = (error: unknown) => {
        if (state === "settled") return;
        state = "settled";
        rejectPromise(uploadOperationError(storagePath, error));
      };
      const rejectAfterCleanup = (error: unknown) => {
        if (state === "settled") return;
        state = "settled";
        void cleanup().then(
          () => rejectPromise(uploadOperationError(storagePath, error)),
          (cleanupCause) => rejectPromise(uploadOperationError(storagePath, error, cleanupCause)),
        );
      };
      const promise = new Promise<ProductMedia>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
        task.on(
          "state_changed",
          (snapshot) => {
            const percent = snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
            args.onProgress(Math.min(100, Math.max(0, percent)));
          },
          (error) => {
            if (state === "settled") return;
            if (state === "resolving-url") {
              rejectAfterCleanup(error);
              return;
            }
            rejectWithoutCleanup(error);
          },
          () => {
            if (state === "settled") return;
            if (state === "canceled") {
              rejectAfterCleanup({ code: "storage/canceled" });
              return;
            }
            state = "resolving-url";
            void adapter.getDownloadUrl(reference).then((url) => {
              if (state !== "resolving-url") return;
              state = "settled";
              resolvePromise({ url, storagePath, alt: args.alt, order: args.order });
            }, (error) => rejectAfterCleanup(error));
          },
        );
      });

      return {
        promise,
        cancel: () => {
          if (state === "settled" || state === "canceled") return;
          const resolvingUrl = state === "resolving-url";
          state = "canceled";
          task.cancel();
          if (resolvingUrl) rejectAfterCleanup({ code: "storage/canceled" });
        },
      };
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
      throw new ProductMediaOperationError(deleteErrorMessage(error), { storagePath, cause: error });
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
