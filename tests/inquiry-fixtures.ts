import type { InquiryPublic } from "../lib/inquiries/types";

export const inquiryFixture: InquiryPublic = {
  id: "new-1",
  ownerType: "member",
  category: "other",
  title: "문의 제목",
  body: "문의 내용입니다.",
  orderNumber: null,
  status: "waiting",
  attachments: [],
  adminReply: null,
  repliedAt: null,
  createdAt: "2026-09-03T01:00:00.000Z",
  updatedAt: "2026-09-03T01:00:00.000Z",
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function pngFile(name = "leaf.png") {
  return new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  ], name, { type: "image/png" });
}

export function uploadResponse(index: number) {
  return Response.json({
    uploadUrl: `https://storage.example.test/put-${index}`,
    receipt: `receipt-${index}`,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
}
