import { afterEach, expect, it, vi } from "vitest";

import type { CartLine } from "@/features/cart/cart-types";

import { processPayment, type OrderDraft } from "./process-payment";

const line: CartLine = {
  productId: "omega-3",
  name: "데일리 오메가3",
  thumbnailUrl: "/omega-3.jpg",
  unitPrice: 16_000,
  stock: 3,
  quantity: 2,
  selected: true,
};

const orderDraft: OrderDraft = {
  customerName: "홍길동",
  phone: "010-1234-5678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로 123",
  addressDetail: "4층",
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card",
  lines: [line],
  subtotal: 32_000,
  shippingFee: 0,
  total: 32_000,
};

afterEach(() => {
  vi.restoreAllMocks();
});

it("returns the mock order number and received time for the payment boundary", async () => {
  const result = await processPayment(orderDraft, new Date("2026-08-10T09:00:00Z"));

  expect(result.orderNumber).toMatch(/^VL-20260810-[A-Z0-9]{6}$/);
  expect(result.receivedAt).toBe("2026-08-10T09:00:00.000Z");
});

it("does not persist the order draft or personal data", async () => {
  const setItem = vi.spyOn(Storage.prototype, "setItem");

  await processPayment(orderDraft, new Date("2026-08-10T09:00:00Z"));

  expect(setItem).not.toHaveBeenCalled();
});
