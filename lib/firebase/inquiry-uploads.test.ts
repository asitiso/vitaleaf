// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { InquiryAccessError, issueUploadReceipt } from "../inquiries/access";
import { InquiryUploadError } from "../inquiries/uploads";
import type { InquiryAttachment } from "../inquiries/types";
import {
  createInquiryAttachmentReadUrls,
  createInquiryUploadUrl,
  deleteInquiryObjects,
  finalizeInquiryUploads,
} from "./inquiry-uploads";

const NOW = new Date("2026-09-02T03:00:00.000Z");
const SECRET = "test-only-inquiry-secret-that-is-long-enough";
const MEMBER = { kind: "member", uid: "private-member-uid" } as const;
const GUEST = { kind: "guest", orderNumber: "VL-20260826-ABC123" } as const;

type FakeFile = {
  delete: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  getMetadata: ReturnType<typeof vi.fn>;
  getSignedUrl: ReturnType<typeof vi.fn>;
  move: ReturnType<typeof vi.fn>;
};

const files = new Map<string, FakeFile>();

const fakeFile = (path: string): FakeFile => {
  const existing = files.get(path);
  if (existing) return existing;
  const file: FakeFile = {
    delete: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([Buffer.from([0xff, 0xd8, 0xff])]),
    getMetadata: vi.fn().mockResolvedValue([{
      size: "3",
      contentType: "image/jpeg",
      generation: "1700000000000001",
    }]),
    getSignedUrl: vi.fn().mockResolvedValue(["https://storage.example.test/signed"]),
    move: vi.fn().mockImplementation(async (destination: string) => [fakeFile(destination)]),
  };
  files.set(path, file);
  return file;
};

const bucket = { file: vi.fn((path: string, options?: unknown) => {
  void options;
  return fakeFile(path);
}) };
const dependencies = { getBucket: () => bucket as never };

const receiptFor = (
  objectPath: string,
  contentType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
  declaredSize = 3,
  subject: typeof MEMBER | typeof GUEST = MEMBER,
  issuedAt = NOW,
): string => issueUploadReceipt(
  subject,
  objectPath,
  contentType,
  declaredSize,
  issuedAt,
  SECRET,
);

beforeEach(() => {
  files.clear();
  bucket.file.mockClear();
});

describe("signed inquiry upload URLs", () => {
  it.each([MEMBER, GUEST])("uses a non-reversible subject path and exact five-minute signed PUT", async (subject) => {
    const result = await createInquiryUploadUrl({
      subject,
      contentType: "image/webp",
      declaredSize: 12,
      now: NOW,
      secret: SECRET,
    }, {
      ...dependencies,
      randomSegment: () => "safe_upload_id_1234",
    });

    expect(result).toEqual({
      uploadUrl: "https://storage.example.test/signed",
      receipt: expect.any(String),
      expiresAt: new Date("2026-09-02T03:05:00.000Z"),
    });
    const [pendingPath] = bucket.file.mock.calls[0];
    expect(pendingPath).toMatch(/^inquiryPending\/[A-Za-z0-9_-]{8,64}\/safe_upload_id_1234$/u);
    expect(pendingPath).not.toContain(subject.kind === "member" ? subject.uid : subject.orderNumber);
    expect(fakeFile(pendingPath).getSignedUrl).toHaveBeenCalledWith({
      version: "v4",
      action: "write",
      contentType: "image/webp",
      extensionHeaders: { "content-length": "12" },
      expires: new Date("2026-09-02T03:05:00.000Z"),
    });
  });

  it("rejects a weak receipt secret before asking Storage to sign a PUT", async () => {
    await expect(createInquiryUploadUrl({
      subject: MEMBER,
      contentType: "image/jpeg",
      declaredSize: 3,
      now: NOW,
      secret: "weak",
    }, {
      ...dependencies,
      randomSegment: () => "safe_upload_id_1234",
    })).rejects.toBeInstanceOf(InquiryAccessError);

    expect(bucket.file).not.toHaveBeenCalled();
  });
});

describe("inquiry upload finalization", () => {
  it("verifies metadata and a range-limited signature before moving to a strict final path", async () => {
    const pendingPath = "inquiryPending/subjectHash123/uploadId123";
    const pending = fakeFile(pendingPath);
    pending.getMetadata.mockResolvedValueOnce([{
      size: "12",
      contentType: "image/webp",
      generation: "1700000000000012",
    }]);
    pending.download.mockResolvedValueOnce([Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ])]);

    const attachments = await finalizeInquiryUploads({
      subject: MEMBER,
      receipts: [receiptFor(pendingPath, "image/webp", 12)],
      inquiryId: "inquiry-1234",
      now: NOW,
      secret: SECRET,
    }, dependencies);

    expect(pending.download).toHaveBeenCalledWith({ start: 0, end: 11 });
    expect(bucket.file).toHaveBeenCalledWith(pendingPath, {
      generation: "1700000000000012",
    });
    expect(pending.move).toHaveBeenCalledWith("inquiries/inquiry-1234/uploadId123");
    expect(attachments).toEqual([{
      id: "uploadId123",
      storagePath: "inquiries/inquiry-1234/uploadId123",
      originalName: "첨부 이미지 1.webp",
      contentType: "image/webp",
      size: 12,
    }]);
  });

  it.each([
    ["expired", receiptFor("inquiryPending/subjectHash123/uploadExpired", "image/jpeg", 3, MEMBER, new Date(NOW.getTime() - 10 * 60_000))],
    ["wrong subject", receiptFor("inquiryPending/subjectHash123/uploadWrongSub", "image/jpeg", 3, GUEST)],
  ])("rejects an %s receipt before touching Storage", async (_description, receipt) => {
    await expect(finalizeInquiryUploads({
      subject: MEMBER,
      receipts: [receipt],
      inquiryId: "inquiry-1234",
      now: NOW,
      secret: SECRET,
    }, dependencies)).rejects.toBeInstanceOf(InquiryUploadError);

    expect(bucket.file).not.toHaveBeenCalled();
  });

  it("rejects duplicate receipt tokens and duplicate verified paths", async () => {
    const path = "inquiryPending/subjectHash123/uploadDuplicate";
    const receipt = receiptFor(path);
    await expect(finalizeInquiryUploads({
      subject: MEMBER,
      receipts: [receipt, receipt],
      inquiryId: "inquiry-1234",
      now: NOW,
      secret: SECRET,
    }, dependencies)).rejects.toBeInstanceOf(InquiryUploadError);

    await expect(finalizeInquiryUploads({
      subject: MEMBER,
      receipts: [receipt, receiptFor(path, "image/jpeg", 3, MEMBER, new Date(NOW.getTime() + 1))],
      inquiryId: "inquiry-1234",
      now: new Date(NOW.getTime() + 2),
      secret: SECRET,
    }, dependencies)).rejects.toBeInstanceOf(InquiryUploadError);

    expect(bucket.file).not.toHaveBeenCalled();
  });

  it("rejects a fourth receipt before touching Storage", async () => {
    const receipts = [1, 2, 3, 4].map((index) => receiptFor(
      `inquiryPending/subjectHash123/uploadId000${index}`,
    ));

    await expect(finalizeInquiryUploads({
      subject: MEMBER,
      receipts,
      inquiryId: "inquiry-1234",
      now: NOW,
      secret: SECRET,
    }, dependencies)).rejects.toBeInstanceOf(InquiryUploadError);
    expect(bucket.file).not.toHaveBeenCalled();
  });

  it.each([
    ["size", { size: "4", contentType: "image/jpeg", generation: "1700000000000001" }],
    ["content type", { size: "3", contentType: "image/png", generation: "1700000000000001" }],
  ])("deletes a pending object whose metadata %s does not match its receipt", async (_description, metadata) => {
    const path = "inquiryPending/subjectHash123/uploadMetadata";
    const pending = fakeFile(path);
    pending.getMetadata.mockResolvedValueOnce([metadata]);

    await expect(finalizeInquiryUploads({
      subject: MEMBER,
      receipts: [receiptFor(path)],
      inquiryId: "inquiry-1234",
      now: NOW,
      secret: SECRET,
    }, dependencies)).rejects.toBeInstanceOf(InquiryUploadError);

    expect(pending.delete).toHaveBeenCalledTimes(1);
    expect(pending.move).not.toHaveBeenCalled();
  });

  it.each([
    ["MIME mismatch", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["executable bytes", Buffer.from([0x4d, 0x5a, 0x90])],
  ])("deletes a pending object with %s", async (_description, bytes) => {
    const path = "inquiryPending/subjectHash123/uploadSignature";
    const pending = fakeFile(path);
    pending.download.mockResolvedValueOnce([bytes]);

    await expect(finalizeInquiryUploads({
      subject: MEMBER,
      receipts: [receiptFor(path)],
      inquiryId: "inquiry-1234",
      now: NOW,
      secret: SECRET,
    }, dependencies)).rejects.toBeInstanceOf(InquiryUploadError);

    expect(pending.delete).toHaveBeenCalledTimes(1);
    expect(pending.move).not.toHaveBeenCalled();
  });

  it("removes already-finalized objects when a later move fails", async () => {
    const firstPath = "inquiryPending/subjectHash123/uploadFirst";
    const secondPath = "inquiryPending/subjectHash123/uploadSecond";
    fakeFile(secondPath).move.mockRejectedValueOnce(new Error("private move failure"));

    await expect(finalizeInquiryUploads({
      subject: MEMBER,
      receipts: [receiptFor(firstPath), receiptFor(secondPath)],
      inquiryId: "inquiry-1234",
      now: NOW,
      secret: SECRET,
    }, dependencies)).rejects.toThrow("private move failure");

    expect(fakeFile("inquiries/inquiry-1234/uploadFirst").delete).toHaveBeenCalledTimes(1);
    expect(fakeFile("inquiries/inquiry-1234/uploadSecond").delete).toHaveBeenCalledTimes(1);
    expect(fakeFile(secondPath).delete).toHaveBeenCalledTimes(1);
  });
});

describe("inquiry attachment cleanup and authorized reads", () => {
  it("treats deletion of a missing strict final object as an idempotent success", async () => {
    const path = "inquiries/inquiry-1234/uploadId123";
    fakeFile(path).delete.mockRejectedValueOnce({ code: 404 });

    await expect(deleteInquiryObjects([path], dependencies)).resolves.toBeUndefined();
  });

  it("issues only short-lived HTTPS signed GET URLs for strict attachment paths", async () => {
    const attachment: InquiryAttachment = {
      id: "uploadId123",
      storagePath: "inquiries/inquiry-1234/uploadId123",
      originalName: "첨부 이미지 1.png",
      contentType: "image/png",
      size: 8,
    };

    await expect(createInquiryAttachmentReadUrls([attachment], NOW, dependencies)).resolves.toEqual([
      "https://storage.example.test/signed",
    ]);
    expect(fakeFile(attachment.storagePath).getSignedUrl).toHaveBeenCalledWith({
      version: "v4",
      action: "read",
      expires: new Date("2026-09-02T03:05:00.000Z"),
    });
  });
});
