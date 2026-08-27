import { afterEach, expect, it, vi } from "vitest";

import type { OrderDraft, PaymentResult } from "../payment/process-payment";

import { GuestOrderClientError, createGuestOrder, lookupGuestOrder } from "./client";

const order: OrderDraft = {
  customerName: "홍길동",
  phone: "010-1234-5678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로 123",
  addressDetail: "4층",
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card",
  lines: [{
    productId: "omega-3",
    name: "데일리 오메가3",
    thumbnailUrl: "/omega-3.jpg",
    unitPrice: 16_000,
    stock: 3,
    quantity: 2,
    selected: true,
  }],
  subtotal: 32_000,
  shippingFee: 0,
  total: 32_000,
};

const payment: PaymentResult = {
  orderNumber: "VL-20260810-ABC123",
  receivedAt: "2026-08-10T09:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it("creates a guest order with the payment receipt and returns only a parsed receipt", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    ...payment,
    privatePhone: "01012345678",
  }, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(createGuestOrder(order, payment)).resolves.toEqual(payment);
  expect(fetchMock).toHaveBeenCalledWith("/api/guest-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order, payment }),
  });
});

it("rejects a malformed guest order receipt instead of returning raw API data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    orderNumber: payment.orderNumber,
    receivedAt: "not-a-date",
  }, { status: 201 })));

  await expect(createGuestOrder(order, payment)).rejects.toThrow(GuestOrderClientError);
});

it("returns a fully parsed public guest order lookup result", async () => {
  const publicOrder = {
    orderNumber: payment.orderNumber,
    status: "mock-received",
    receivedAt: payment.receivedAt,
    customerNameMasked: "홍**",
    phoneMasked: "010-****-5678",
    addressMasked: "06236 서울특별시 강남구 ***",
    lines: [{
      productId: "omega-3",
      name: "데일리 오메가3",
      thumbnailUrl: "/omega-3.jpg",
      unitPrice: 16_000,
      quantity: 2,
    }],
    subtotal: 32_000,
    shippingFee: 0,
    total: 32_000,
  };
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ order: publicOrder }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(lookupGuestOrder(payment.orderNumber, "010-1234-5678")).resolves.toEqual(publicOrder);
  expect(fetchMock).toHaveBeenCalledWith("/api/guest-orders/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderNumber: payment.orderNumber, phone: "010-1234-5678" }),
  });
});

it("rejects a lookup response with an invalid public order shape", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    order: { orderNumber: payment.orderNumber },
  })));

  await expect(lookupGuestOrder(payment.orderNumber, "010-1234-5678")).rejects.toThrow(GuestOrderClientError);
});
