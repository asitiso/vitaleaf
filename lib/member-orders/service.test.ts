import { describe, expect, it, vi } from "vitest";

import type { MemberOrderServerRepository } from "../firebase/member-orders.server";
import type { Product } from "../products/types";
import {
  createMemberOrderService,
  MemberOrderIdempotencyConflictError,
  MemberOrderUnavailableError,
} from "./service";

const payment = {
  orderNumber: "VL-20260831-ABC123",
  receivedAt: "2026-08-31T03:00:00.000Z",
};
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
const input = {
  customerName: "김민수",
  phone: "010-1234-5678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로",
  addressDetail: "4층 401호",
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card",
  lines: [
    { productId: "p1", purchaseOptionId: "2-month", quantity: 2 },
    { productId: "p1", purchaseOptionId: "4-month", quantity: 1 },
  ],
};

const product = {
  id: "p1",
  name: "오메가3",
  thumbnailUrl: "/omega.jpg",
  price: 80_000,
  stock: 5,
  purchaseOptions: [{
    id: "2-month",
    label: "2개월분",
    durationMonths: 2,
    sku: "OMEGA-2M",
    priceAdjustment: -35_000,
    stock: 5,
    active: true,
    isDefault: true,
  }, {
    id: "4-month",
    label: "4개월분",
    durationMonths: 4,
    sku: "OMEGA-4M",
    priceAdjustment: 0,
    stock: 5,
    active: true,
    isDefault: false,
  }],
} as Product;

const createRepository = (): MemberOrderServerRepository => {
  const records = new Map<string, Awaited<ReturnType<MemberOrderServerRepository["createOrder"]>>>();
  return {
    loadProducts: vi.fn(async (ids: string[]) => ids.map((id) => id === "p1" ? product : null)),
    getOrderByIdempotency: vi.fn(async (_uid, key) => records.get(key) ?? null),
    createOrder: vi.fn(async (_uid, order, key, requestFingerprint) => {
      const existing = records.get(key);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new MemberOrderIdempotencyConflictError();
        }
        return existing;
      }
      const created = { order, requestFingerprint };
      records.set(key, created);
      return created;
    }),
  };
};

describe("member order service", () => {
  it("recalculates option prices and stores immutable option snapshots after one load per product", async () => {
    const repository = createRepository();
    const service = createMemberOrderService({ repository });

    await expect(service.create("member-1", input, payment, idempotencyKey)).resolves.toEqual(payment);

    expect(repository.loadProducts).toHaveBeenCalledWith(["p1"]);
    expect(repository.createOrder).toHaveBeenCalledWith(
      "member-1",
      expect.objectContaining({
        userId: "member-1",
        subtotal: 170_000,
        shippingFee: 0,
        total: 170_000,
        lines: [{
          productId: "p1",
          purchaseOptionId: "2-month",
          purchaseOptionLabel: "2개월분",
          sku: "OMEGA-2M",
          name: "오메가3",
          thumbnailUrl: "/omega.jpg",
          basePrice: 80_000,
          priceAdjustment: -35_000,
          unitPrice: 45_000,
          quantity: 2,
          lineTotal: 90_000,
        }, {
          productId: "p1",
          purchaseOptionId: "4-month",
          purchaseOptionLabel: "4개월분",
          sku: "OMEGA-4M",
          name: "오메가3",
          thumbnailUrl: "/omega.jpg",
          basePrice: 80_000,
          priceAdjustment: 0,
          unitPrice: 80_000,
          quantity: 1,
          lineTotal: 80_000,
        }],
      }),
      idempotencyKey,
      expect.any(String),
    );
  });

  it("marks only the configured authenticated UID as a test order", async () => {
    const repository = createRepository();
    const service = createMemberOrderService({
      repository,
      testCustomerUid: "test-uid",
    });

    await service.create("test-uid", input, payment, idempotencyKey);

    expect(repository.createOrder).toHaveBeenCalledWith(
      "test-uid",
      expect.objectContaining({ isTestOrder: true }),
      idempotencyKey,
      expect.any(String),
    );
  });

  it("ignores a client-supplied test flag for an ordinary member", async () => {
    const repository = createRepository();
    const service = createMemberOrderService({ repository, testCustomerUid: "test-uid" });

    await service.create(
      "member-uid",
      { ...input, isTestOrder: true },
      payment,
      idempotencyKey,
    );

    expect(repository.createOrder).toHaveBeenCalledWith(
      "member-uid",
      expect.objectContaining({ isTestOrder: false }),
      idempotencyKey,
      expect.any(String),
    );
  });

  it("returns the original order for an identical idempotency key and rejects a conflicting payload", async () => {
    const repository = createRepository();
    const service = createMemberOrderService({ repository });

    await service.create("member-1", input, payment, idempotencyKey);
    await expect(service.create("member-1", input, {
      ...payment,
      orderNumber: "VL-20260831-OTHER1",
    }, idempotencyKey)).resolves.toEqual(payment);
    await expect(service.create("member-1", {
      ...input,
      lines: [{ productId: "p1", purchaseOptionId: "2-month", quantity: 1 }],
    }, payment, idempotencyKey)).rejects.toBeInstanceOf(MemberOrderIdempotencyConflictError);
    expect(repository.createOrder).toHaveBeenCalledOnce();
  });

  it("maps an unknown or inactive purchase option to a safe unavailable error", async () => {
    const service = createMemberOrderService({ repository: createRepository() });

    await expect(service.create("member-1", {
      ...input,
      lines: [{ productId: "p1", purchaseOptionId: "missing", quantity: 1 }],
    }, payment, idempotencyKey)).rejects.toBeInstanceOf(MemberOrderUnavailableError);
  });
});
