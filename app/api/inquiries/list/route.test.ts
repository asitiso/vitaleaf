// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listForGuestOrder: vi.fn(),
  listForMember: vi.fn(),
  resolveInquirySubject: vi.fn(),
}));

vi.mock("../../../../lib/firebase/inquiries", () => ({
  inquiryRepository: {
    listForGuestOrder: mocks.listForGuestOrder,
    listForMember: mocks.listForMember,
  },
}));

vi.mock("../../../../lib/inquiries/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/inquiries/server")>();
  return { ...actual, resolveInquirySubject: mocks.resolveInquirySubject };
});

import { ServerAuthenticationError } from "../../../../lib/firebase/admin-auth";
import type { InquiryRecord } from "../../../../lib/inquiries/types";
import { POST } from "./route";

const NOW = new Date("2026-09-02T01:02:03.000Z");
const guestOrder = "VL-20260826-ABC123";
const privateRecord: InquiryRecord = {
  id: "inquiry-1",
  ownerType: "member",
  memberUid: "member-private-id",
  guestOrderNumber: null,
  orderNumber: null,
  category: "product",
  title: "상품 문의",
  body: "섭취 방법을 알려주세요.",
  status: "waiting",
  attachments: [{ id: "image-1", storagePath: "inquiries/inquiry-1/image-1", originalName: "image.png", contentType: "image/png", size: 1 }],
  adminReply: null,
  repliedAt: null,
  repliedBy: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const requestFor = (body: unknown = { category: "product", pageSize: 10 }): Request => new Request(
  "http://localhost/api/inquiries/list",
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
);

beforeEach(() => {
  mocks.listForGuestOrder.mockReset().mockResolvedValue([privateRecord]);
  mocks.listForMember.mockReset().mockResolvedValue([privateRecord]);
  mocks.resolveInquirySubject.mockReset().mockResolvedValue({ kind: "member", uid: "member-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/inquiries/list", () => {
  it("selects only the verified member repository method and omits internal fields", async () => {
    const response = await POST(requestFor());

    expect(response.status).toBe(200);
    expect(mocks.listForMember).toHaveBeenCalledWith("member-1", {
      category: "product", status: null, pageSize: 10, cursor: null,
    });
    expect(mocks.listForGuestOrder).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toMatchObject({ inquiries: [{ id: "inquiry-1", ownerType: "member" }] });
    expect(JSON.stringify(body)).not.toContain("member-private-id");
    expect(JSON.stringify(body)).not.toContain("storagePath");
  });

  it("selects only the verified guest-order repository method", async () => {
    mocks.resolveInquirySubject.mockResolvedValueOnce({ kind: "guest", orderNumber: guestOrder });

    const response = await POST(requestFor({ status: "waiting", pageSize: 20 }));

    expect(response.status).toBe(200);
    expect(mocks.listForGuestOrder).toHaveBeenCalledWith(guestOrder, {
      category: null, status: "waiting", pageSize: 20, cursor: null,
    });
    expect(mocks.listForMember).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed filters and 401 for unauthenticated access", async () => {
    const malformed = await POST(requestFor({ pageSize: 51 }));
    mocks.resolveInquirySubject.mockRejectedValueOnce(new ServerAuthenticationError(401));
    const unauthenticated = await POST(requestFor());

    expect(malformed.status).toBe(400);
    expect(unauthenticated.status).toBe(401);
  });

  it("uses a generic safe 500 response for repository failures", async () => {
    mocks.listForMember.mockRejectedValueOnce(new Error("member-private-id failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(requestFor());

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("Inquiry list API failure", {
      errorClass: "Error",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("member-private-id");
  });
});
