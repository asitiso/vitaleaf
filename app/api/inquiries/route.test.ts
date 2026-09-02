// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  resolveInquirySubject: vi.fn(),
}));

vi.mock("../../../lib/firebase/inquiries", () => ({
  inquiryRepository: { create: mocks.create },
}));

vi.mock("../../../lib/inquiries/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/inquiries/server")>();
  return { ...actual, resolveInquirySubject: mocks.resolveInquirySubject };
});

import { ServerAuthenticationError } from "../../../lib/firebase/admin-auth";
import { InquiryConfigurationError } from "../../../lib/inquiries/server";
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

  it("rejects nonempty upload receipts until Task 5 finalization exists", async () => {
    const response = await POST(requestFor({ ...input, uploadReceipts: ["unverified-upload-receipt"] }));

    expect(response.status).toBe(400);
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
  });
});
