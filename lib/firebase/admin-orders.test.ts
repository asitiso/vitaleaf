import { describe, expect, it, vi } from "vitest";
import { AdminOrderAccessError, AdminOrderNotFoundError, createAdminOrderService } from "../admin-orders/service";
import { adminOrderClient } from "../admin-orders/client";
import { createFirestoreAdminOrderRepository } from "./admin-orders";
import { normalizeGuestOrder } from "./guest-orders";

vi.mock("./id-token", () => ({ getCurrentFirebaseIdToken: async () => "admin-test-token" }));

const now = new Date("2026-09-07T00:00:00Z");
const raw = { userId: "u1", orderNumber: "M-1", customerName: "테스트", phone: "01012345678", total: 5000,
  createdAt: { toDate: () => now }, receivedAt: { toDate: () => now },
  status: "legacy", lines: [{ productId: "p1", name: "비타민", quantity: 2, unitPrice: 1000 }],
};
const memberRef = { source: "member", ownerId: "u1", orderNumber: "M-1" } as const;
const guestRef = { source: "guest", ownerId: null, orderNumber: "G-1" } as const;
const harness = () => {
  const records = new Map<string, unknown>();
  const snapshot = (path: string) => ({ id: path.split("/").at(-1)!, ref: { path }, exists: records.has(path), data: () => records.get(path) });
  const doc = vi.fn((path: string) => ({ path, get: vi.fn(async () => snapshot(path)) }));
  const query = (paths: string[]) => ({
    orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
    get: vi.fn(async () => ({ docs: paths.map(snapshot) })),
  });
  const memberPaths: string[] = [], guestPaths: string[] = [];
  const memberQuery = query(memberPaths), guestQuery = query(guestPaths);
  const update = vi.fn((ref: { path: string }, fields: object) => {
    records.set(ref.path, { ...records.get(ref.path) as object, ...fields });
  });
  const firestore = {
    doc, collectionGroup: vi.fn(() => memberQuery), collection: vi.fn(() => guestQuery),
    runTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      get: async (ref: { path: string }) => snapshot(ref.path), update,
    })),
  };
  return { records, memberPaths, guestPaths, memberQuery, guestQuery, update, firestore,
    repository: createFirestoreAdminOrderRepository({ getFirestore: () => firestore as never }) };
};

describe("Firestore admin order repository", () => {
  const malformedDates = [
    undefined, null, "not-a-date", new Date(NaN),
    { toDate: () => new Date(NaN) },
    { toDate: () => "not-a-date" },
    { toDate: () => { throw new Error("broken timestamp"); } },
  ];

  it.each(malformedDates)("keeps malformed guest creation dates nullable without losing other orders: %j", async (createdAt) => {
    const h = harness();
    const stored = { ...raw, createdAt };
    h.records.set("guestOrders/G-1", stored);
    h.records.set("users/u1/orders/M-1", raw);
    h.guestPaths.push("guestOrders/G-1"); h.memberPaths.push("users/u1/orders/M-1");
    const service = createAdminOrderService(h.repository);

    expect(await h.repository.listGuest(100)).toMatchObject([{ createdAt: null, receivedAt: now }]);
    expect(await service.list()).toEqual([
      expect.objectContaining({ orderNumber: "M-1", createdAt: now.toISOString() }),
      expect.objectContaining({ orderNumber: "G-1", createdAt: null }),
    ]);
    expect(await service.detail(guestRef)).toMatchObject({ createdAt: null, receivedAt: now.toISOString() });
    expect(() => normalizeGuestOrder("G-1", stored)).toThrow();
  });

  it.each(malformedDates)("does not substitute a creation date for a malformed guest received date: %j", async (receivedAt) => {
    const h = harness();
    const stored = { ...raw, receivedAt };
    h.records.set("guestOrders/G-1", stored); h.guestPaths.push("guestOrders/G-1");
    const service = createAdminOrderService(h.repository, () => now);

    expect(await h.repository.get(guestRef)).toMatchObject({ createdAt: now, receivedAt: null });
    expect(await service.list()).toEqual([expect.objectContaining({ orderNumber: "G-1", createdAt: now.toISOString() })]);
    expect(await service.detail(guestRef)).toMatchObject({ receivedAt: null });
    expect(await service.update(guestRef, { status: "preparing" }, "admin-1"))
      .toMatchObject({ status: "preparing", createdAt: now.toISOString(), receivedAt: null });
    expect(h.update).toHaveBeenCalledWith(expect.anything(), {
      status: "preparing", shippingCarrier: "", trackingNumber: "", statusUpdatedAt: now, statusUpdatedBy: "admin-1",
    });
    expect(h.records.get("guestOrders/G-1")).toMatchObject({ receivedAt });
    expect(() => normalizeGuestOrder("G-1", stored)).toThrow();
  });

  it("keeps valid guest normalization identical to the customer record projection", async () => {
    const h = harness();
    const stored = { ...raw, phoneNormalized: "01098765432", postcode: "12345", address: "테스트 주소",
      addressDetail: "1층", deliveryNote: "배송 메모", paymentMethod: "easy", subtotal: 2000, shippingFee: 3000,
      status: "shipped", shippingCarrier: "CJ", trackingNumber: "123", statusUpdatedAt: raw.createdAt, statusUpdatedBy: "admin-1", isTestOrder: true,
      lines: [{ productId: "p1", name: "비타민", unitPrice: 1000, quantity: 2, priceAdjustment: -100 }],
    };
    h.records.set("guestOrders/G-1", stored);
    expect(await h.repository.get(guestRef)).toEqual(normalizeGuestOrder("G-1", stored));
  });

  it("sends missing guest dates as null through the strict admin list/detail/update client boundary", async () => {
    const h = harness();
    const { createdAt: _createdAt, receivedAt: _receivedAt, ...stored } = raw;
    void _createdAt; void _receivedAt;
    h.records.set("guestOrders/G-1", stored); h.guestPaths.push("guestOrders/G-1");
    const service = createAdminOrderService(h.repository, () => now);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const result = url === "/api/admin/orders" ? { orders: await service.list() }
        : url === "/api/admin/orders/detail" ? { order: await service.detail(guestRef) }
          : { order: await service.update(guestRef, { status: "preparing" }, "admin-1") };
      return Response.json(result);
    });
    try {
      expect(await adminOrderClient.list()).toEqual([expect.objectContaining({ createdAt: null })]);
      expect(await adminOrderClient.get(guestRef)).toMatchObject({ createdAt: null, receivedAt: null });
      expect(await adminOrderClient.update(guestRef, { status: "preparing", shippingCarrier: "", trackingNumber: "" }))
        .toMatchObject({ status: "preparing", createdAt: null, receivedAt: null });
    } finally {
      fetch.mockRestore();
    }
  });

  it("queries only the existing sources with bounded newest-first reads and normalizes legacy data", async () => {
    const h = harness();
    h.records.set("users/u1/orders/M-1", raw);
    h.records.set("guestOrders/G-1", raw);
    h.memberPaths.push("users/u1/orders/M-1"); h.guestPaths.push("guestOrders/G-1");
    expect(await h.repository.listMember(100)).toMatchObject([{ userId: "u1", createdAt: now, status: "mock-received", isTestOrder: false,
      lines: [{ purchaseOptionId: "default", lineTotal: 2000 }] }]);
    expect(await h.repository.listGuest(100)).toMatchObject([{ orderNumber: "G-1", createdAt: now, status: "mock-received" }]);
    expect(h.firestore.collectionGroup).toHaveBeenCalledWith("orders");
    expect(h.firestore.collection).toHaveBeenCalledWith("guestOrders");
    for (const query of [h.memberQuery, h.guestQuery]) {
      expect(query.orderBy).toHaveBeenCalledWith("createdAt", "desc");
      expect(query.limit).toHaveBeenCalledWith(100);
    }
  });

  it("filters collection-group rows outside exact member document paths", async () => {
    const h = harness();
    for (const path of ["users/u1/orders/M-1", "shops/u1/orders/M-1", "users/u1/nested/x/orders/M-1", "users//orders/M-1", "users/u\n1/orders/M-1"]) {
      h.records.set(path, raw); h.memberPaths.push(path);
    }
    expect(await h.repository.listMember(100)).toHaveLength(1);
  });

  it.each(["list", "get", "update"])("rejects raw ownership mismatch before normalization for %s", async (operation) => {
    const h = harness();
    h.records.set("users/u1/orders/M-1", { ...raw, userId: "other" });
    h.memberPaths.push("users/u1/orders/M-1");
    const promise = operation === "list" ? h.repository.listMember(100) : operation === "get" ? h.repository.get(memberRef)
      : h.repository.update(memberRef, { status: "preparing", shippingCarrier: "", trackingNumber: "" }, "admin-1", now);
    await expect(promise).rejects.toThrow(AdminOrderAccessError);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("reads exact documents and returns null when absent", async () => {
    const h = harness();
    expect(await h.repository.get(memberRef)).toBeNull();
    h.records.set("guestOrders/G-1", raw);
    expect(await h.repository.get(guestRef)).toMatchObject({ orderNumber: "G-1", createdAt: now });
    expect(h.firestore.doc).toHaveBeenCalledWith("users/u1/orders/M-1");
    expect(h.firestore.doc).toHaveBeenCalledWith("guestOrders/G-1");
  });

  it.each([memberRef, guestRef])("updates only operational fields transactionally: $source", async (reference) => {
    const h = harness();
    const path = reference.source === "member" ? "users/u1/orders/M-1" : "guestOrders/G-1";
    h.records.set(path, raw);
    const result = await h.repository.update(reference, { status: "shipped", shippingCarrier: "CJ", trackingNumber: "123" }, "admin-1", now);
    expect(h.firestore.runTransaction).toHaveBeenCalledOnce();
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ path }), {
      status: "shipped", shippingCarrier: "CJ", trackingNumber: "123", statusUpdatedAt: now, statusUpdatedBy: "admin-1",
    });
    expect(result).toMatchObject({ total: 5000, customerName: "테스트", status: "shipped", shippingCarrier: "CJ", trackingNumber: "123", statusUpdatedAt: now, statusUpdatedBy: "admin-1" });
    expect(h.records.get(path)).toMatchObject({ phone: "01012345678", total: 5000 });
  });

  it("never writes a missing order", async () => {
    const h = harness();
    await expect(h.repository.update(memberRef, { status: "preparing", shippingCarrier: "", trackingNumber: "" }, "admin-1", now))
      .rejects.toThrow(AdminOrderNotFoundError);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("rejects invalid references before accessing Firestore", async () => {
    const h = harness();
    const reference = { ...memberRef, orderNumber: "a/b" };
    await expect(h.repository.get(reference)).rejects.toThrow();
    await expect(h.repository.update(reference, { status: "preparing", shippingCarrier: "", trackingNumber: "" }, "admin-1", now)).rejects.toThrow();
    expect(h.firestore.doc).not.toHaveBeenCalled();
  });
});
