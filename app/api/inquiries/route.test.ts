// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  deleteObjects: vi.fn(),
  finalizeUploads: vi.fn(),
  requiredSecret: vi.fn(),
  resolveInquirySubject: vi.fn(),
}));

vi.mock("../../../lib/firebase/inquiries", () => ({
  inquiryRepository: { create: mocks.create },
}));

vi.mock("../../../lib/firebase/inquiry-uploads", () => ({
  deleteInquiryObjects: mocks.deleteObjects,
  finalizeInquiryUploads: mocks.finalizeUploads,
}));

vi.mock("../../../lib/inquiries/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/inquiries/server")>();
  return {
    ...actual,
    requiredInquiryTokenSecret: mocks.requiredSecret,
    resolveInquirySubject: mocks.resolveInquirySubject,
  };
});

import { FirebaseAdminConfigurationError } from "../../../lib/firebase/admin";
import { ServerAuthenticationError } from "../../../lib/firebase/admin-auth";
import { InquiryConfigurationError } from "../../../lib/inquiries/server";
import { InquiryUploadError } from "../../../lib/inquiries/uploads";
import { POST } from "./route";

const guestOrder = "VL-20260826-ABC123";
const input = {
  category: "product",
  title: "상품 문의",
  body: "섭취 방법을 알려주세요.",
  orderNumber: "VL-20260826-ZZZZZZ",
  uploadReceipts: [],
};

const requestFor = (body: unknown = input, headers: Record<string, string> = {}): Request => new Request(
  "http://localhost/api/inquiries",
  {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  },
);

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue(undefined);
  mocks.deleteObjects.mockReset().mockResolvedValue(undefined);
  mocks.finalizeUploads.mockReset().mockResolvedValue([]);
  mocks.requiredSecret.mockReset().mockReturnValue("test-only-inquiry-secret-that-is-long-enough");
  mocks.resolveInquirySubject.mockReset().mockResolvedValue({ kind: "member", uid: "verified-member" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/inquiries", () => {
  it("derives a member record from the verified subject and returns only public fields", async () => {
    const response = await POST(requestFor({
      ...input,
      memberUid: "attacker-member",
      ownerType: "guest",
      guestOrderNumber: guestOrder,
      phone: "010-1234-5678",
      accessToken: "attacker-token",
    }));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      ownerType: "member",
      memberUid: "verified-member",
      guestOrderNumber: null,
      orderNumber: input.orderNumber,
      status: "waiting",
      attachments: [],
      adminReply: null,
      repliedAt: null,
      repliedBy: null,
    }));
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ ownerType: "member", orderNumber: input.orderNumber });
    const serialized = JSON.stringify({ record: mocks.create.mock.calls[0][0], responseBody });
    expect(serialized).not.toContain("attacker-member");
    expect(serialized).not.toContain("010-1234-5678");
    expect(serialized).not.toContain("attacker-token");
    expect(JSON.stringify(responseBody)).not.toContain("verified-member");
    expect(mocks.finalizeUploads).not.toHaveBeenCalled();
    expect(mocks.deleteObjects).not.toHaveBeenCalled();
    expect(mocks.requiredSecret).not.toHaveBeenCalled();
  });

  it("forces a guest record and public order number to the verified token order", async () => {
    mocks.resolveInquirySubject.mockResolvedValueOnce({ kind: "guest", orderNumber: guestOrder });

    const response = await POST(requestFor());

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      ownerType: "guest",
      memberUid: null,
      guestOrderNumber: guestOrder,
      orderNumber: guestOrder,
    }));
    expect(await response.json()).toMatchObject({ ownerType: "guest", orderNumber: guestOrder });
  });

  it("finalizes verified receipts into attachments without exposing private paths", async () => {
    const attachment = {
      id: "uploadId123",
      storagePath: "inquiries/inquiry-1234/uploadId123",
      originalName: "첨부 이미지 1.png",
      contentType: "image/png",
      size: 8,
    } as const;
    mocks.finalizeUploads.mockResolvedValueOnce([attachment]);

    const response = await POST(requestFor({ ...input, uploadReceipts: ["verified-upload-receipt"] }));

    expect(response.status).toBe(201);
    expect(mocks.finalizeUploads).toHaveBeenCalledWith(expect.objectContaining({
      subject: { kind: "member", uid: "verified-member" },
      receipts: ["verified-upload-receipt"],
      inquiryId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      now: expect.any(Date),
      secret: "test-only-inquiry-secret-that-is-long-enough",
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ attachments: [attachment] }));
    const responseBody = await response.json();
    expect(responseBody.attachments).toEqual([{
      id: attachment.id,
      originalName: attachment.originalName,
      contentType: attachment.contentType,
      size: attachment.size,
      readUrl: null,
    }]);
    expect(JSON.stringify(responseBody)).not.toContain("storagePath");
    expect(JSON.stringify(responseBody)).not.toContain(attachment.storagePath);
  });

  it("deletes every finalized object when repository creation fails", async () => {
    const attachment = {
      id: "uploadId123",
      storagePath: "inquiries/inquiry-1234/uploadId123",
      originalName: "첨부 이미지 1.jpg",
      contentType: "image/jpeg",
      size: 3,
    } as const;
    mocks.finalizeUploads.mockResolvedValueOnce([attachment]);
    mocks.create.mockRejectedValueOnce(new Error("private repository failure"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(requestFor({ ...input, uploadReceipts: ["verified-upload-receipt"] }));

    expect(response.status).toBe(500);
    expect(mocks.deleteObjects).toHaveBeenCalledWith([attachment.storagePath]);
  });

  it("returns 400 for a rejected receipt and 503 for Storage configuration failure", async () => {
    mocks.finalizeUploads.mockRejectedValueOnce(new InquiryUploadError());
    const invalid = await POST(requestFor({ ...input, uploadReceipts: ["expired-receipt"] }));
    mocks.finalizeUploads.mockRejectedValueOnce(new FirebaseAdminConfigurationError("FIREBASE_STORAGE_BUCKET"));
    const configuration = await POST(requestFor({ ...input, uploadReceipts: ["verified-receipt"] }));

    expect(invalid.status).toBe(400);
    expect(configuration.status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed request content", async () => {
    const response = await POST(requestFor({ ...input, category: "invalid" }));

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns 401 before parsing an unauthenticated request", async () => {
    mocks.resolveInquirySubject.mockRejectedValueOnce(new ServerAuthenticationError(401));

    const response = await POST(new Request("http://localhost/api/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));

    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns safe configuration status and safe generic logging for server failures", async () => {
    mocks.resolveInquirySubject.mockRejectedValueOnce(new InquiryConfigurationError());
    const config = await POST(requestFor());
    mocks.create.mockRejectedValueOnce(new Error("010-1234-5678 private repository failure"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const infrastructure = await POST(requestFor());

    expect(config.status).toBe(503);
    expect(infrastructure.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("Inquiry create API failure", {
      errorClass: "Error",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("010-1234-5678");
    expect(mocks.deleteObjects).not.toHaveBeenCalled();
  });
});
