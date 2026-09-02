import type { InquiryImageContentType } from "./types";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;

const IMAGE_CONTENT_TYPES: ReadonlySet<InquiryImageContentType> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export class InquiryUploadError extends Error {
  constructor() {
    super("문의 이미지를 다시 확인해 주세요.");
    this.name = "InquiryUploadError";
  }
}

type UploadRequest = {
  contentType?: unknown;
  size?: unknown;
  currentAttachmentCount?: unknown;
};

export type ValidatedUploadRequest = {
  contentType: InquiryImageContentType;
  size: number;
};

const asRecord = (value: unknown): UploadRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InquiryUploadError();
  }
  return value as UploadRequest;
};

export const validateUploadRequest = (value: unknown): ValidatedUploadRequest => {
  const request = asRecord(value);
  if (
    typeof request.contentType !== "string"
    || !IMAGE_CONTENT_TYPES.has(request.contentType as InquiryImageContentType)
    || typeof request.size !== "number"
    || !Number.isSafeInteger(request.size)
    || request.size < 1
    || request.size > MAX_ATTACHMENT_SIZE
  ) {
    throw new InquiryUploadError();
  }
  if (
    request.currentAttachmentCount !== undefined
    && (
      typeof request.currentAttachmentCount !== "number"
      || !Number.isSafeInteger(request.currentAttachmentCount)
      || request.currentAttachmentCount < 0
      || request.currentAttachmentCount >= MAX_ATTACHMENTS
    )
  ) {
    throw new InquiryUploadError();
  }
  return {
    contentType: request.contentType as InquiryImageContentType,
    size: request.size,
  };
};

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean => (
  bytes.length >= signature.length
  && signature.every((value, index) => bytes[index] === value)
);

export const detectImageType = (bytes: Uint8Array): InquiryImageContentType => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && bytes.length >= 12
    && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  throw new InquiryUploadError();
};
