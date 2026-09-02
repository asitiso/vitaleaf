// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUploadUrl: vi.fn(),
  requiredSecret: vi.fn(),
  resolveInquirySubject: vi.fn(),
}));

vi.mock("../../../../lib/firebase/inquiry-uploads", () => ({
  createInquiryUploadUrl: mocks.createUploadUrl,
}));

vi.mock("../../../../lib/inquiries/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/inquiries/server")>();
  return {
    ...actual,
    requiredInquiryTokenSecret: mocks.requiredSecret,
    resolveInquirySubject: mocks.resolveInquirySubject,
  };
});

import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import { ServerAuthenticationError } from "../../../../lib/firebase/admin-auth";
import { InquiryConfigurationError } from "../../../../lib/inquiries/server";
import { POST } from "./route";

const SECRET = "test-only-inquiry-secret-that-is-long-enough";
const result = {
  uploadUrl: "https://storage.example.test/signed-put",
  receipt: "signed-upload-receipt",
  expiresAt: new Date("2026-09-02T03:05:00.000Z"),
};

const requestFor = (
  body: unknown = { contentType: "image/png", size: 8, currentAttachmentCount: 0 },
  headers: Record<string, string> = {},
): Request => new Request("http://localhost/api/inquiries/upload-url", {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

beforeEach(() => {
  mocks.createUploadUrl.mockReset().mockResolvedValue(result);
  mocks.requiredSecret.mockReset().mockReturnValue(SECRET);
  mocks.resolveInquirySubject.mockReset().mockResolvedValue({ kind: "member", uid: "member-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/inquiries/upload-url", () => {
  it.each([
    { kind: "member", uid: "member-1" },
    { kind: "guest", orderNumber: "VL-20260826-ABC123" },
  ] as const)("returns exact public signed-upload fields for a verified $kind", async (subject) => {
    mocks.resolveInquirySubject.mockResolvedValueOnce(subject);

    const response = await POST(requestFor());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploadUrl: result.uploadUrl,
      receipt: result.receipt,
      expiresAt: result.expiresAt.toISOString(),
    });
    expect(mocks.createUploadUrl).toHaveBeenCalledWith(expect.objectContaining({
      subject,
      contentType: "image/png",
      declaredSize: 8,
      secret: SECRET,
      now: expect.any(Date),
    }));
  });

  it("returns 400 for malformed JSON and invalid upload policy without signing", async () => {
    const malformed = await POST(new Request("http://localhost/api/inquiries/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    const invalid = await POST(requestFor({ contentType: "image/gif", size: 0 }));

    expect(malformed.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(mocks.createUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["empty guest access", { "x-inquiry-access": "", authorization: "Bearer valid-member" }],
    ["invalid bearer", { authorization: "Bearer invalid-member" }],
  ])("returns 401 for %s without falling through to signing", async (_description, headers) => {
    mocks.resolveInquirySubject.mockRejectedValueOnce(new ServerAuthenticationError(401));

    const response = await POST(requestFor(undefined, headers));

    expect(response.status).toBe(401);
    expect(mocks.createUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    new InquiryConfigurationError(),
    new FirebaseAdminConfigurationError("FIREBASE_STORAGE_BUCKET"),
  ])("returns a safe 503 for configuration failure %s", async (error) => {
    if (error instanceof InquiryConfigurationError) {
      mocks.requiredSecret.mockImplementationOnce(() => { throw error; });
    } else {
      mocks.createUploadUrl.mockRejectedValueOnce(error);
    }

    const response = await POST(requestFor());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: "문의 이미지 서버 설정이 필요합니다." });
  });

  it("returns 500 with safe class-only logging for a generic signing failure", async () => {
    mocks.createUploadUrl.mockRejectedValueOnce(new Error(`${result.uploadUrl} private-token`));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(requestFor());

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("Inquiry upload URL API failure", {
      errorClass: "Error",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(result.uploadUrl);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("private-token");
  });
});
