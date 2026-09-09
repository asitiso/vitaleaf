import { afterEach, expect, it, vi } from "vitest";

import type { PaymentResult } from "../payment/process-payment";

import { GuestOrderClientError, createGuestOrder, lookupGuestOrder } from "./client";
import { createGuestOrderService } from "./service";
import type { GuestOrderCreateInput, GuestOrderRepository, GuestOrderStored } from "./types";

const order: GuestOrderCreateInput = {
  customerName: "홍길동",
  phone: "010-1234-5678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로 123",
  addressDetail: "4층",
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card",
  lines: [{
    productId: "omega-3",
    purchaseOptionId: "default",
    quantity: 2,
  }],
};

const payment: PaymentResult = {
  orderNumber: "VL-20260810-ABC123",
  receivedAt: "2026-08-10T09:00:00.000Z",
};
const shippedLookupResponse = (shippingCarrier: string, trackingNumber: string) => ({
  order: {
    orderNumber: payment.orderNumber,
    status: "shipped",
    isTestOrder: false,
    shippingCarrier,
    trackingNumber,
    statusUpdatedAt: "2026-08-10T10:00:00.000Z",
    receivedAt: payment.receivedAt,
    customerNameMasked: "홍**",
    phoneMasked: "010-****-5678",
    addressMasked: "06236 서울특별시 강남구 ***",
    lines: [{
      productId: "omega-3",
      purchaseOptionId: "default",
      purchaseOptionLabel: "기본 구성",
      sku: "",
      name: "데일리 오메가3",
      thumbnailUrl: "/omega-3.jpg",
      basePrice: 16_000,
      priceAdjustment: 0,
      unitPrice: 16_000,
      quantity: 2,
      lineTotal: 32_000,
    }],
    subtotal: 32_000,
    shippingFee: 0,
    total: 32_000,
  },
});
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("sends only minimal product-option line identity with the checkout idempotency key", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    ...payment,
    privatePhone: "01012345678",
  }, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(createGuestOrder(order, payment, idempotencyKey)).resolves.toEqual(payment);
  expect(fetchMock).toHaveBeenCalledWith("/api/guest-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order, payment, idempotencyKey }),
  });
});

it("rejects a malformed guest order receipt instead of returning raw API data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    orderNumber: payment.orderNumber,
    receivedAt: "not-a-date",
  }, { status: 201 })));

  await expect(createGuestOrder(order, payment, idempotencyKey)).rejects.toThrow(GuestOrderClientError);
});

it("parses a sample guest order lookup whose optional thumbnail URL is empty", async () => {
  let storedOrder: GuestOrderStored | null = null;
  const repository: GuestOrderRepository = {
    loadProducts: async (ids) => ids.map(() => null),
    async createOrder(nextOrder) {
      storedOrder = nextOrder;
      return nextOrder;
    },
    getOrderByIdempotency: async () => null,
    getOrder: async () => storedOrder,
    getAttempt: async () => null,
    setAttempt: async (_fingerprint, now) => ({
      failureCount: 1,
      expiresAt: new Date(now.getTime() + 600_000),
    }),
    deleteAttempt: async () => undefined,
  };
  const service = createGuestOrderService({
    repository,
    lookupSecret: "test-only-secret",
    now: () => new Date("2026-08-10T09:00:00.000Z"),
    createOrderCode: () => "SAMPLE",
  });
  const receipt = await service.create({
    ...order,
    lines: [{
      productId: "sample-daily-multivitamin",
      purchaseOptionId: "4-month",
      quantity: 1,
    }],
  }, payment, idempotencyKey);
  const persistedOrder = await repository.getOrder(receipt.orderNumber);
  if (!persistedOrder) throw new Error("Expected the service to persist the order.");
  storedOrder = {
    ...persistedOrder,
    status: "shipped",
    isTestOrder: true,
    shippingCarrier: "CJ대한통운",
    trackingNumber: "1234-5678",
    statusUpdatedAt: new Date("2026-08-10T10:00:00.000Z"),
    statusUpdatedBy: "admin-1",
  };
  const publicOrder = await service.lookup({
    orderNumber: receipt.orderNumber,
    phone: order.phone,
  }, "client-a");
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ order: publicOrder }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(lookupGuestOrder(receipt.orderNumber, order.phone)).resolves.toEqual(publicOrder);
  expect(publicOrder.lines[0]).toMatchObject({
    productId: "sample-daily-multivitamin",
    thumbnailUrl: "",
  });
  expect(fetchMock).toHaveBeenCalledWith("/api/guest-orders/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderNumber: receipt.orderNumber, phone: order.phone }),
  });
});

it("keeps a historical zero-priced guest order readable through lookup", async () => {
  const legacyOrder: GuestOrderStored = {
    orderNumber: payment.orderNumber,
    status: "mock-received",
    paymentMethod: "card",
    customerName: "홍길동",
    phoneNormalized: "01012345678",
    postcode: "06236",
    address: "서울특별시 강남구 테헤란로 123",
    addressDetail: "",
    deliveryNote: "",
    lines: [{
      productId: "legacy-free-sample",
      purchaseOptionId: "default",
      purchaseOptionLabel: "기본 구성",
      sku: "",
      name: "과거 무료 샘플",
      thumbnailUrl: "",
      basePrice: 0,
      priceAdjustment: 0,
      unitPrice: 0,
      quantity: 1,
      lineTotal: 0,
    }],
    subtotal: 0,
    shippingFee: 0,
    total: 0,
    createdAt: new Date(payment.receivedAt),
    receivedAt: new Date(payment.receivedAt),
  };
  const repository: GuestOrderRepository = {
    loadProducts: async () => [],
    createOrder: async (nextOrder) => nextOrder,
    getOrderByIdempotency: async () => null,
    getOrder: async () => legacyOrder,
    getAttempt: async () => null,
    setAttempt: async (_fingerprint, now) => ({
      failureCount: 1,
      expiresAt: new Date(now.getTime() + 600_000),
    }),
    deleteAttempt: async () => undefined,
  };
  const publicOrder = await createGuestOrderService({
    repository,
    lookupSecret: "test-only-secret",
  }).lookup({ orderNumber: payment.orderNumber, phone: order.phone }, "client-zero");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ order: publicOrder })));

  await expect(lookupGuestOrder(payment.orderNumber, order.phone)).resolves.toMatchObject({
    lines: [{ unitPrice: 0, lineTotal: 0 }],
    subtotal: 0,
    total: 0,
  });
});

it("accepts guest shipping fields at the 200-character boundary", async () => {
  const shippingCarrier = "가".repeat(200);
  const trackingNumber = "1".repeat(200);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
    shippedLookupResponse(shippingCarrier, trackingNumber),
  )));

  await expect(lookupGuestOrder(payment.orderNumber, order.phone)).resolves.toMatchObject({
    shippingCarrier,
    trackingNumber,
  });
});

it.each([
  ["201-character carrier", "가".repeat(201), "1234"],
  ["201-character tracking number", "CJ대한통운", "1".repeat(201)],
  ["C0 carrier control", "CJ\u0000대한통운", "1234"],
  ["DEL tracking control", "CJ대한통운", "12\u007f34"],
  ["C1 carrier control", "CJ\u0085대한통운", "1234"],
])("rejects guest shipping fields with a %s", async (_case, shippingCarrier, trackingNumber) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
    shippedLookupResponse(shippingCarrier, trackingNumber),
  )));

  await expect(lookupGuestOrder(payment.orderNumber, order.phone))
    .rejects.toThrow(GuestOrderClientError);
});

it.each([
  ["fractional quantity", { quantity: 1.5 }],
  ["zero quantity", { quantity: 0 }],
  ["quantity above 999", { quantity: 1_000 }],
  ["unsafe unit price", { unitPrice: Number.MAX_SAFE_INTEGER + 1 }],
  ["unreasonably large total", { total: 1_000_000_001 }],
])("rejects a lookup response with %s", async (_label, override) => {
  const publicOrder = {
    orderNumber: payment.orderNumber,
    status: "mock-received",
    receivedAt: payment.receivedAt,
    customerNameMasked: "홍**",
    phoneMasked: "010-****-5678",
    addressMasked: "06236 서울특별시 강남구 ***",
    lines: [{
      productId: "omega-3",
      purchaseOptionId: "default",
      purchaseOptionLabel: "기본 구성",
      sku: "",
      name: "데일리 오메가3",
      thumbnailUrl: "/omega-3.jpg",
      basePrice: 16_000,
      priceAdjustment: 0,
      unitPrice: 16_000,
      quantity: 2,
      lineTotal: 32_000,
      ...override,
    }],
    subtotal: 32_000,
    shippingFee: 0,
    total: 32_000,
    ...override,
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ order: publicOrder })));

  await expect(lookupGuestOrder(payment.orderNumber, "010-1234-5678"))
    .rejects.toThrow(GuestOrderClientError);
});

it.each([
  "2026-08-10 09:00:00",
  "2026-08-10T09:00:00Z",
  "2026-02-30T09:00:00.000Z",
])("rejects a non-canonical receivedAt value: %s", async (receivedAt) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    order: {
      orderNumber: payment.orderNumber,
      status: "mock-received",
      receivedAt,
      customerNameMasked: "홍**",
      phoneMasked: "010-****-5678",
      addressMasked: "06236 서울특별시 강남구 ***",
      lines: [{
        productId: "omega-3",
        purchaseOptionId: "default",
        purchaseOptionLabel: "기본 구성",
        sku: "",
        name: "데일리 오메가3",
        thumbnailUrl: "/omega-3.jpg",
        basePrice: 16_000,
        priceAdjustment: 0,
        unitPrice: 16_000,
        quantity: 2,
        lineTotal: 32_000,
      }],
      subtotal: 32_000,
      shippingFee: 0,
      total: 32_000,
    },
  })));

  await expect(lookupGuestOrder(payment.orderNumber, "010-1234-5678"))
    .rejects.toThrow(GuestOrderClientError);
});

it("rejects a lookup response with an invalid public order shape", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    order: { orderNumber: payment.orderNumber },
  })));

  await expect(lookupGuestOrder(payment.orderNumber, "010-1234-5678")).rejects.toThrow(GuestOrderClientError);
});
