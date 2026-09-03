import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentFirebaseIdTokenMock = vi.hoisted(() => vi.fn());

vi.mock("../firebase/id-token", () => ({
  getCurrentFirebaseIdToken: getCurrentFirebaseIdTokenMock,
}));

import {
  InquiryClientError,
  createInquiry,
  getInquiry,
  listInquiries,
  requestInquiryUploadUrl,
  putInquiryUpload,
  verifyGuestInquiryAccess,
} from "./client";

const orderNumber = "VL-20260826-ABC123";
const publicOrder = {
  orderNumber,
  status: "mock-received" as const,
  receivedAt: "2026-08-26T03:00:00.000Z",
  customerNameMasked: "김**",
  phoneMasked: "010-****-5678",
  addressMasked: "06236 서울특별시 강남구 ***",
  lines: [{
    productId: "p1",
    purchaseOptionId: "default",
    purchaseOptionLabel: "기본 구성",
    sku: "",
    name: "비타민 C",
    thumbnailUrl: "/products/vitamin-c.jpg",
    basePrice: 12_000,
    priceAdjustment: 0,
    unitPrice: 12_000,
    quantity: 2,
    lineTotal: 24_000,
  }],
  subtotal: 24_000,
  shippingFee: 3_000,
  total: 27_000,
};
const inquiry = {
  id: "inquiry-1",
  ownerType: "guest" as const,
  orderNumber,
  category: "product" as const,
  title: "상품 문의",
  body: "섭취 방법을 알려주세요.",
  status: "waiting" as const,
  attachments: [{ id: "image-1", originalName: "image.png", contentType: "image/png" as const, size: 1, readUrl: null }],
  adminReply: null,
  repliedAt: null,
  createdAt: "2026-09-02T01:02:03.000Z",
  updatedAt: "2026-09-02T01:02:03.000Z",
};
const input = {
  category: "product" as const,
  title: "상품 문의",
  body: "섭취 방법을 알려주세요.",
  orderNumber,
  uploadReceipts: [],
};

beforeEach(() => {
  getCurrentFirebaseIdTokenMock.mockReset().mockResolvedValue("member-token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("guest inquiry verification client", () => {
  it("posts order verification data and returns only a strict in-memory access result", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      order: publicOrder,
      accessToken: "guest-access-token",
      expiresAt: "2026-09-02T01:32:03.000Z",
    }));

    await expect(verifyGuestInquiryAccess(orderNumber, "010-1234-5678")).resolves.toEqual({
      order: publicOrder,
      accessToken: "guest-access-token",
      expiresAt: "2026-09-02T01:32:03.000Z",
    });

    expect(fetch).toHaveBeenCalledWith("/api/inquiries/guest-verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderNumber, phone: "010-1234-5678" }),
    });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).not.toContain(orderNumber);
    expect(String(url)).not.toContain("010-1234-5678");
  });

  it.each([
    ["guest verification wrapper secret", {
      order: publicOrder,
      accessToken: "guest-access-token",
      expiresAt: "2026-09-02T01:32:03.000Z",
      secret: "server-secret",
    }],
    ["raw guest order phone and address", {
      order: { ...publicOrder, phone: "01012345678", address: "서울시 비공개 주소" },
      accessToken: "guest-access-token",
      expiresAt: "2026-09-02T01:32:03.000Z",
    }],
    ["unknown nested guest order line field", {
      order: {
        ...publicOrder,
        lines: [{ ...publicOrder.lines[0], storagePath: "inquiries/private.png" }],
      },
      accessToken: "guest-access-token",
      expiresAt: "2026-09-02T01:32:03.000Z",
    }],
  ])("rejects an extra private %s instead of returning it to UI code", async (_description, body) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body));

    await expect(verifyGuestInquiryAccess(orderNumber, "010-1234-5678"))
      .rejects.toThrow(InquiryClientError);
  });
});

describe("private inquiry browser client", () => {
  it("requests a strict member upload URL and PUTs the original file directly", async () => {
    const file = new File(["image-bytes"], "leaf.png", { type: "image/png" });
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({
        uploadUrl: "https://storage.example.test/upload?signature=temporary",
        receipt: "receipt-123",
        expiresAt: "2026-09-02T01:12:03.000Z",
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const signed = await requestInquiryUploadUrl({ kind: "member" }, { contentType: "image/png", size: file.size });
    await putInquiryUpload(signed.uploadUrl, file);

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/inquiries/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer member-token" },
      body: JSON.stringify({ contentType: "image/png", size: file.size }),
    });
    expect(fetch).toHaveBeenNthCalledWith(2, signed.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: file,
    });
  });

  it.each([
    { uploadUrl: "http://storage.example.test/upload", receipt: "receipt-123", expiresAt: "2026-09-02T01:12:03.000Z" },
    { uploadUrl: "https://storage.example.test/upload", receipt: "x".repeat(2049), expiresAt: "2026-09-02T01:12:03.000Z" },
    { uploadUrl: "https://storage.example.test/upload", receipt: "receipt-123", expiresAt: "not-a-date" },
    { uploadUrl: "https://storage.example.test/upload", receipt: "receipt-123", expiresAt: "2026-09-02T01:12:03.000Z", storagePath: "private" },
  ])("rejects malformed or private upload URL responses", async (body) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body));
    await expect(requestInquiryUploadUrl({ kind: "member" }, { contentType: "image/png", size: 1 }))
      .rejects.toThrow(InquiryClientError);
  });

  it("maps a failed direct PUT to the generic safe upload error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(putInquiryUpload("https://storage.example.test/upload", new File(["x"], "x.png", { type: "image/png" })))
      .rejects.toThrow("문의 이미지를 업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("uses a fresh member bearer and POST-only body without browser owner fields", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(inquiry, { status: 201 }));

    await expect(createInquiry({ kind: "member" }, {
      ...input,
      ownerType: "guest",
      memberUid: "attacker-member",
      guestOrderNumber: "VL-20260826-ZZZZZZ",
    } as typeof input)).resolves.toEqual(inquiry);

    expect(getCurrentFirebaseIdTokenMock).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/inquiries", expect.objectContaining({
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer member-token" },
    }));
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("/api/inquiries");
    expect(JSON.parse(String(request?.body))).toEqual(input);
  });

  it("sends guest access only as a header and keeps token and identifiers out of URLs", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ inquiries: [inquiry] }))
      .mockResolvedValueOnce(Response.json({ inquiry }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await expect(listInquiries({ kind: "guest", token: "guest-access-token" }, { status: "waiting" }))
      .resolves.toEqual([inquiry]);
    await expect(getInquiry({ kind: "guest", token: "guest-access-token" }, inquiry.id))
      .resolves.toEqual(inquiry);

    expect(getCurrentFirebaseIdTokenMock).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/inquiries/list", {
      method: "POST",
      headers: { "content-type": "application/json", "x-inquiry-access": "guest-access-token" },
      body: JSON.stringify({ status: "waiting" }),
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/inquiries/detail", {
      method: "POST",
      headers: { "content-type": "application/json", "x-inquiry-access": "guest-access-token" },
      body: JSON.stringify({ id: inquiry.id }),
    });
    for (const [url] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).not.toContain("guest-access-token");
      expect(String(url)).not.toContain(inquiry.id);
    }
    expect(setItem).not.toHaveBeenCalled();
  });

  it("gets a new Firebase token for each member operation", async () => {
    getCurrentFirebaseIdTokenMock
      .mockResolvedValueOnce("member-token-one")
      .mockResolvedValueOnce("member-token-two");
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ inquiries: [] }))
      .mockResolvedValueOnce(Response.json({ inquiry }));

    await listInquiries({ kind: "member" });
    await getInquiry({ kind: "member" }, inquiry.id);

    expect(getCurrentFirebaseIdTokenMock).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ headers: expect.objectContaining({ authorization: "Bearer member-token-one" }) });
    expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({ headers: expect.objectContaining({ authorization: "Bearer member-token-two" }) });
  });

  it("fails closed on malformed success payloads and maps common status codes to useful Korean errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ inquiry: { id: inquiry.id } }));
    await expect(getInquiry({ kind: "guest", token: "guest-access-token" }, inquiry.id))
      .rejects.toThrow(InquiryClientError);

    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: "private server detail" }, { status: 401 }));
    await expect(listInquiries({ kind: "guest", token: "guest-access-token" }))
      .rejects.toThrow("로그인이 필요하거나 비회원 인증이 만료되었습니다.");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: "private server detail" }, { status: 404 }));
    await expect(getInquiry({ kind: "guest", token: "guest-access-token" }, inquiry.id))
      .rejects.toThrow("문의 정보를 찾을 수 없습니다.");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: "private server detail" }, { status: 429 }));
    await expect(verifyGuestInquiryAccess(orderNumber, "010-1234-5678"))
      .rejects.toThrow("잠시 후 다시 시도해 주세요.");
  });

  it("rejects semantically inconsistent public inquiry responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      inquiry: { ...inquiry, adminReply: "답변이 있으면 안 됩니다.", repliedAt: inquiry.createdAt },
    }));
    await expect(getInquiry({ kind: "guest", token: "guest-access-token" }, inquiry.id))
      .rejects.toThrow(InquiryClientError);

    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      inquiry: { ...inquiry, orderNumber: null },
    }));
    await expect(getInquiry({ kind: "guest", token: "guest-access-token" }, inquiry.id))
      .rejects.toThrow(InquiryClientError);
  });

  it("keeps a future HTTPS authorized attachment read URL parseable", async () => {
    const readUrl = "https://storage.example.test/inquiries/inquiry-1/image-1?signature=temporary";
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      inquiry: { ...inquiry, attachments: [{ ...inquiry.attachments[0], readUrl }] },
    }));

    await expect(getInquiry({ kind: "guest", token: "guest-access-token" }, inquiry.id))
      .resolves.toMatchObject({ attachments: [{ readUrl }] });
  });

  it.each([
    ["create inquiry private member identity", () => createInquiry({ kind: "guest", token: "guest-access-token" }, input), {
      ...inquiry,
      memberUid: "private-member",
    }],
    ["list wrapper token", () => listInquiries({ kind: "guest", token: "guest-access-token" }), {
      inquiries: [inquiry],
      token: "private-token",
    }],
    ["list inquiry private guest owner", () => listInquiries({ kind: "guest", token: "guest-access-token" }), {
      inquiries: [{ ...inquiry, guestOrderNumber: orderNumber }],
    }],
    ["detail wrapper unknown field", () => getInquiry({ kind: "guest", token: "guest-access-token" }, inquiry.id), {
      inquiry,
      arbitrary: true,
    }],
    ["detail attachment path and reply author", () => getInquiry({ kind: "guest", token: "guest-access-token" }, inquiry.id), {
      inquiry: {
        ...inquiry,
        attachments: [{ ...inquiry.attachments[0], storagePath: "inquiries/private.png" }],
        repliedBy: "admin-private-id",
      },
    }],
  ])("rejects an extra private %s at every inquiry success level", async (_description, operation, body) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body));

    await expect(operation()).rejects.toThrow(InquiryClientError);
  });
});
