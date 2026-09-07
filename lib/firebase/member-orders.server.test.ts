import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { MemberOrderIdempotencyConflictError } from "../member-orders/errors";
import { createFirestoreMemberOrderRepository } from "./member-orders.server";

const order = {
  userId: "member-1",
  orderNumber: "VL-20260831-ABC123",
  status: "mock-received" as const,
  isTestOrder: false,
  shippingCarrier: "",
  trackingNumber: "",
  statusUpdatedAt: null,
  statusUpdatedBy: "",
  paymentMethod: "card" as const,
  customerName: "김민수",
  phone: "01012345678",
  shippingAddress: { postcode: "06236", address: "서울", addressDetail: "401호" },
  deliveryNote: "",
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
  }],
  subtotal: 90_000,
  shippingFee: 0,
  total: 90_000,
  createdAt: new Date("2026-08-31T03:00:00.000Z"),
  receivedAt: new Date("2026-08-31T03:00:00.000Z"),
};

const createFakeFirestore = () => {
  const records = new Map<string, unknown>();
  const doc = (path: string) => ({
    path,
    get: async () => ({
      exists: records.has(path),
      data: () => records.get(path),
    }),
  });
  const firestore = {
    doc,
    runTransaction: async <T>(callback: (transaction: {
      get(reference: ReturnType<typeof doc>): Promise<Awaited<ReturnType<typeof reference.get>>>;
      create(reference: ReturnType<typeof doc>, value: unknown): void;
    }) => Promise<T>) => callback({
      get: (reference) => reference.get(),
      create: (reference, value) => {
        if (records.has(reference.path)) throw { code: "already-exists" };
        records.set(reference.path, value);
      },
    }),
  };
  return { firestore: firestore as unknown as Firestore, records };
};

describe("Firestore member order repository", () => {
  it("writes with Admin transaction idempotency and returns the original snapshot for a retry", async () => {
    const fake = createFakeFirestore();
    const repository = createFirestoreMemberOrderRepository({ getFirestore: () => fake.firestore });
    const key = "550e8400-e29b-41d4-a716-446655440000";

    await expect(repository.createOrder("member-1", order, key, "payload-a")).resolves.toEqual({
      order,
      requestFingerprint: "payload-a",
    });
    await expect(repository.getOrderByIdempotency("member-1", key)).resolves.toEqual({
      order,
      requestFingerprint: "payload-a",
    });
    await expect(repository.createOrder("member-1", {
      ...order,
      total: 1,
    }, key, "payload-a")).resolves.toEqual({
      order,
      requestFingerprint: "payload-a",
    });
    await expect(repository.createOrder("member-1", order, key, "payload-b"))
      .rejects.toBeInstanceOf(MemberOrderIdempotencyConflictError);
  });
});
