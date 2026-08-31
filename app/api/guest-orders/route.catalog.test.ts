// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createOrder: vi.fn(),
  deleteAttempt: vi.fn(),
  getAttempt: vi.fn(),
  getOrder: vi.fn(),
  getOrderByIdempotency: vi.fn(),
  loadProducts: vi.fn(),
  setAttempt: vi.fn(),
}));

vi.mock("../../../lib/firebase/guest-orders", () => ({
  guestOrderRepository: repository,
}));

import { OrderCatalogInvalidError } from "../../../lib/orders/resolve-order-lines";
import { POST } from "./route";

const savedLookupSecret = process.env.GUEST_ORDER_LOOKUP_SECRET;
const createJsonRequest = (): Request => new Request("http://localhost/api/guest-orders", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    order: {
      customerName: "김민수",
      phone: "010-1234-5678",
      postcode: "06236",
      address: "서울특별시 강남구 테헤란로",
      addressDetail: "4층 401호",
      deliveryNote: "문 앞에 놓아 주세요.",
      paymentMethod: "card",
      lines: [{ productId: "p1", purchaseOptionId: "2-month", quantity: 1 }],
    },
    payment: {
      orderNumber: "VL-20260826-ABC123",
      receivedAt: "2026-08-26T03:00:00.000Z",
    },
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }),
});

beforeEach(() => {
  process.env.GUEST_ORDER_LOOKUP_SECRET = "test-only-secret";
  repository.getOrderByIdempotency.mockResolvedValue(null);
});

afterEach(() => {
  if (savedLookupSecret === undefined) delete process.env.GUEST_ORDER_LOOKUP_SECRET;
  else process.env.GUEST_ORDER_LOOKUP_SECRET = savedLookupSecret;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/guest-orders catalog failures", () => {
  it("returns the safe 409 response for a typed invalid production catalog snapshot", async () => {
    repository.loadProducts.mockRejectedValueOnce(new OrderCatalogInvalidError());
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(createJsonRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "주문할 수 없는 상품이 포함되어 있습니다.",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("keeps infrastructure failures on the generic 500 path", async () => {
    repository.loadProducts.mockRejectedValueOnce(new Error("Firestore unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(createJsonRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(consoleError).toHaveBeenCalledWith("Guest order API failure", {
      errorClass: "Error",
      requestId: expect.any(String),
    });
  });
});
