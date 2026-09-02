// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  resolveInquirySubject: vi.fn(),
}));

vi.mock("../../../../lib/firebase/inquiries", () => ({
  inquiryRepository: { get: mocks.get },
}));

vi.mock("../../../../lib/inquiries/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/inquiries/server")>();
  return { ...actual, resolveInquirySubject: mocks.resolveInquirySubject };
});

import type { InquiryRecord } from "../../../../lib/inquiries/types";
import { POST } from "./route";

const NOW = new Date("2026-09-02T01:02:03.000Z");
const guestOrder = "VL-20260826-ABC123";
const memberRecord: InquiryRecord = {
  id: "inquiry-member-1",
  ownerType: "member",
  memberUid: "member-1",
  guestOrderNumber: null,
  orderNumber: null,
  category: "product",
  title: "상품 문의",
  body: "섭취 방법을 알려주세요.",
  status: "answered",
  attachments: [{ id: "image-1", storagePath: "inquiries/inquiry-member-1/image-1", originalName: "image.png", contentType: "image/png", size: 1 }],
  adminReply: "안내드립니다.",
  repliedAt: NOW,
  repliedBy: "admin-private-id",
  createdAt: NOW,
  updatedAt: NOW,
};

const requestFor = (id = memberRecord.id): Request => new Request("http://localhost/api/inquiries/detail", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id }),
});

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(memberRecord);
  mocks.resolveInquirySubject.mockReset().mockResolvedValue({ kind: "member", uid: "member-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/inquiries/detail", () => {
  it("returns a browser-safe inquiry only for its exact member owner", async () => {
    const response = await POST(requestFor());

    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(memberRecord.id);
    const body = await response.json();
    expect(body).toMatchObject({ inquiry: { id: memberRecord.id, ownerType: "member" } });
    expect(JSON.stringify(body)).not.toContain("memberUid");
    expect(JSON.stringify(body)).not.toContain("admin-private-id");
    expect(JSON.stringify(body)).not.toContain("storagePath");
  });

  it("returns the exact same 404 body for missing and cross-member records", async () => {
    mocks.get.mockResolvedValueOnce(null);
    const missing = await POST(requestFor());
    mocks.resolveInquirySubject.mockResolvedValueOnce({ kind: "member", uid: "member-2" });
    const crossOwner = await POST(requestFor());

    expect(missing.status).toBe(404);
    expect(crossOwner.status).toBe(404);
    expect(await missing.json()).toEqual(await crossOwner.json());
    expect(await POST(requestFor()).then((response) => response.status)).toBe(200);
  });

  it("returns the same 404 for a guest token from another order", async () => {
    mocks.resolveInquirySubject.mockResolvedValueOnce({ kind: "guest", orderNumber: guestOrder });

    const response = await POST(requestFor());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "문의 정보를 찾을 수 없습니다." });
  });

  it("returns 400 for an unsafe detail ID and 500 with safe logging for repository failures", async () => {
    const invalid = await POST(requestFor("inquiries/other"));
    mocks.get.mockRejectedValueOnce(new Error("member-1 backend failure"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = await POST(requestFor());

    expect(invalid.status).toBe(400);
    expect(failed.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("Inquiry detail API failure", {
      errorClass: "Error",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("member-1");
  });
});
