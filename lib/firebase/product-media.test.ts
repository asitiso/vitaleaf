import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ storage: {} }));

import {
  createProductMediaAdapter,
  deleteProductImage,
  uploadProductImage,
  validateImageFile,
} from "./product-media";

const MIB = 1024 * 1024;

const fakeFile = ({ type, size }: { type: string; size: number }) => new File([new Uint8Array(size)], "source-file", { type });

const createTask = () => {
  let next: ((snapshot: { bytesTransferred: number; totalBytes: number }) => void) | undefined;
  let fail: ((error: unknown) => void) | undefined;
  let complete: (() => void) | undefined;

  return {
    task: {
      on: vi.fn((event: string, onNext, onError, onComplete) => {
        expect(event).toBe("state_changed");
        next = onNext;
        fail = onError;
        complete = onComplete;
      }),
      cancel: vi.fn(),
    },
    progress: (bytesTransferred: number, totalBytes: number) => next?.({ bytesTransferred, totalBytes }),
    reject: (error: unknown) => fail?.(error),
    complete: () => complete?.(),
  };
};

describe("validateImageFile", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s at the 10 MiB limit", (type) => {
    expect(validateImageFile(fakeFile({ type, size: 10 * MIB }))).toEqual({ ok: true });
  });

  it("rejects unsupported or oversized files before an upload begins", () => {
    expect(validateImageFile(fakeFile({ type: "image/gif", size: 1 }))).toMatchObject({ ok: false });
    expect(validateImageFile(fakeFile({ type: "image/png", size: 10 * MIB + 1 }))).toMatchObject({ ok: false });
  });
});

describe("product image adapter", () => {
  it("uploads to the product draft path, reports progress, and resolves media only after its download URL exists", async () => {
    const upload = createTask();
    const getDownloadUrl = vi.fn().mockResolvedValue("https://storage.example/products/draft-1/image.jpg");
    const createRef = vi.fn((path) => ({ path }));
    const adapter = createProductMediaAdapter({
      createRef,
      startResumable: vi.fn(() => upload.task),
      getDownloadUrl,
      delete: vi.fn(),
      randomUUID: () => "uuid-123",
    });
    const onProgress = vi.fn();

    const controller = adapter.uploadProductImage({
      productId: "draft-1",
      file: fakeFile({ type: "image/jpeg", size: 1 }),
      alt: "Front package",
      order: 2,
      onProgress,
    });
    upload.progress(1, 4);
    expect(onProgress).toHaveBeenCalledWith(25);
    expect(getDownloadUrl).not.toHaveBeenCalled();

    upload.complete();
    await expect(controller.promise).resolves.toEqual({
      url: "https://storage.example/products/draft-1/image.jpg",
      storagePath: "products/draft-1/uuid-123.jpg",
      alt: "Front package",
      order: 2,
    });
    expect(createRef).toHaveBeenCalledWith("products/draft-1/uuid-123.jpg");
  });

  it("does not start an upload for an invalid image and returns an operator-readable error", async () => {
    const startResumable = vi.fn();
    const adapter = createProductMediaAdapter({
      createRef: vi.fn(),
      startResumable,
      getDownloadUrl: vi.fn(),
      delete: vi.fn(),
      randomUUID: () => "uuid-123",
    });

    const controller = adapter.uploadProductImage({
      productId: "draft-1",
      file: fakeFile({ type: "image/gif", size: 1 }),
      alt: "Animated image",
      order: 0,
      onProgress: vi.fn(),
    });

    await expect(controller.promise).rejects.toThrow("JPEG, PNG 또는 WebP");
    expect(startResumable).not.toHaveBeenCalled();
  });

  it("cancels the underlying resumable upload and exposes a readable cancellation error", async () => {
    const upload = createTask();
    const adapter = createProductMediaAdapter({
      createRef: vi.fn((path) => ({ path })),
      startResumable: vi.fn(() => upload.task),
      getDownloadUrl: vi.fn(),
      delete: vi.fn(),
      randomUUID: () => "uuid-123",
    });
    const controller = adapter.uploadProductImage({
      productId: "draft-1",
      file: fakeFile({ type: "image/png", size: 1 }),
      alt: "Front package",
      order: 0,
      onProgress: vi.fn(),
    });

    controller.cancel();
    upload.reject({ code: "storage/canceled" });

    expect(upload.task.cancel).toHaveBeenCalledOnce();
    await expect(controller.promise).rejects.toThrow("업로드가 취소되었습니다");
  });

  it("deletes only a validated direct child of the matching product path", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const adapter = createProductMediaAdapter({
      createRef: vi.fn((path) => ({ path })),
      startResumable: vi.fn(),
      getDownloadUrl: vi.fn(),
      delete: remove,
      randomUUID: () => "uuid-123",
    });

    await expect(adapter.deleteProductImage({ productId: "draft-1", storagePath: "products/draft-1/uuid-123.webp" })).resolves.toBeUndefined();
    await expect(adapter.deleteProductImage({ productId: "draft-1", storagePath: "products/other/uuid-123.webp" })).rejects.toThrow("해당 상품의 이미지 경로");
    await expect(adapter.deleteProductImage({ productId: "draft-1", storagePath: "products/draft-1/nested/uuid-123.webp" })).rejects.toThrow("해당 상품의 이미지 경로");
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("Firebase product image boundary", () => {
  it("rejects a product id that cannot form a safe products/{draftId} path", async () => {
    const controller = uploadProductImage({
      productId: "draft-1/other",
      file: fakeFile({ type: "image/png", size: 1 }),
      alt: "Front package",
      order: 0,
      onProgress: vi.fn(),
    });

    await expect(controller.promise).rejects.toThrow("안전한 상품 식별자");
    await expect(deleteProductImage({ productId: "draft-1", storagePath: "products/draft-1/nested/file.png" })).rejects.toThrow("해당 상품의 이미지 경로");
  });
});
