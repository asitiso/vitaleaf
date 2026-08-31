import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentFirebaseIdTokenMock = vi.hoisted(() => vi.fn());

vi.mock("../firebase/id-token", () => ({
  getCurrentFirebaseIdToken: getCurrentFirebaseIdTokenMock,
}));

import { createMemberOrder } from "./client";

const payment = {
  orderNumber: "VL-20260831-ABC123",
  receivedAt: "2026-08-31T03:00:00.000Z",
};

const draft = {
  customerName: "김민수",
  phone: "010-1234-5678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로",
  addressDetail: "4층 401호",
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card" as const,
  userId: "attacker-controlled-user",
  lines: [{
    productId: "p1",
    purchaseOptionId: "2-month",
    quantity: 2,
    name: "브라우저 표시 이름",
    purchaseOptionLabel: "브라우저 옵션 라벨",
    sku: "BROWSER-SKU",
    unitPrice: 1,
    stock: 999,
    lineTotal: 2,
  }],
  subtotal: 2,
  shippingFee: 0,
  total: 2,
};

beforeEach(() => {
  getCurrentFirebaseIdTokenMock.mockReset().mockResolvedValue("member-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payment), {
    status: 201,
    headers: { "content-type": "application/json" },
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createMemberOrder", () => {
  it("sends the Firebase bearer token and only authoritative line identity", async () => {
    await expect(createMemberOrder(
      draft as never,
      payment,
      "550e8400-e29b-41d4-a716-446655440000",
    )).resolves.toEqual(payment);

    expect(getCurrentFirebaseIdTokenMock).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/member-orders", expect.objectContaining({
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer member-token",
      },
    }));
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual({
      order: {
        customerName: "김민수",
        phone: "010-1234-5678",
        postcode: "06236",
        address: "서울특별시 강남구 테헤란로",
        addressDetail: "4층 401호",
        deliveryNote: "문 앞에 놓아 주세요.",
        paymentMethod: "card",
        lines: [{ productId: "p1", purchaseOptionId: "2-month", quantity: 2 }],
      },
      payment,
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});
