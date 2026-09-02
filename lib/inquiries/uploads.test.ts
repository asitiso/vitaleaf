import { describe, expect, it } from "vitest";

import {
  InquiryUploadError,
  detectImageType,
  validateUploadRequest,
} from "./uploads";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_SIGNATURE = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("inquiry image upload policy", () => {
  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    [PNG_SIGNATURE, "image/png"],
    [WEBP_SIGNATURE, "image/webp"],
  ] as const)("detects a valid %s signature", (bytes, expected) => {
    expect(detectImageType(bytes)).toBe(expected);
  });

  it.each(["image/gif", "IMAGE/JPEG", "image/jpeg; charset=utf-8"])(
    "rejects unsupported or non-canonical MIME %s",
    (contentType) => {
      expect(() => validateUploadRequest({ contentType, size: 100 })).toThrow(InquiryUploadError);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, 5 * 1024 * 1024 + 1])(
    "rejects unsafe declared size %s",
    (size) => {
      expect(() => validateUploadRequest({ contentType: "image/jpeg", size })).toThrow(InquiryUploadError);
    },
  );

  it("accepts the exact five-MiB boundary", () => {
    expect(validateUploadRequest({
      contentType: "image/webp",
      size: 5 * 1024 * 1024,
    })).toEqual({ contentType: "image/webp", size: 5 * 1024 * 1024 });
  });

  it("rejects a reported fourth attachment without trusting the count for finalization", () => {
    expect(() => validateUploadRequest({
      contentType: "image/png",
      size: 100,
      currentAttachmentCount: 3,
    })).toThrow(InquiryUploadError);
  });

  it("detects a MIME/signature mismatch independently of the declared MIME", () => {
    expect(detectImageType(PNG_SIGNATURE)).not.toBe("image/jpeg");
  });

  it("rejects executable bytes renamed as an image", () => {
    const windowsExecutable = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

    expect(() => detectImageType(windowsExecutable)).toThrow(InquiryUploadError);
  });
});
