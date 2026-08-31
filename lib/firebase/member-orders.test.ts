import { beforeEach, describe, expect, it, vi } from "vitest";

const { collectionMock, getDocsMock, orderByMock, queryMock } = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  getDocsMock: vi.fn(),
  orderByMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("./client", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  getDocs: getDocsMock,
  orderBy: orderByMock,
  query: queryMock,
}));

import { createMemberOrderReadRepository, listMemberOrders, type MemberOrderReadAdapter } from "./member-orders";

const olderOrder = {
  id: "older",
  data: () => ({
    orderNumber: "VL-20260823-OLDER1",
    paymentMethod: "card",
    customerName: "홍길동",
    phone: "010-1234-5678",
    shippingAddress: { postcode: "12345", address: "서울", addressDetail: "101호" },
    deliveryNote: "",
    lines: [{ productId: "omega", name: "오메가3", quantity: 1, unitPrice: 0 }],
    subtotal: 0,
    shippingFee: 0,
    total: 0,
    createdAt: new Date("2026-08-23T02:00:00.000Z"),
  }),
};

const newerOrder = {
  id: "newer",
  data: () => ({
    ...olderOrder.data(),
    orderNumber: "VL-20260824-NEWER1",
    lines: [{
      productId: "omega",
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
    total: 90_000,
    receivedAt: new Date("2026-08-24T02:00:00.000Z"),
    createdAt: new Date("2026-08-24T02:00:00.000Z"),
  }),
};

beforeEach(() => {
  collectionMock.mockReset().mockImplementation((_db: unknown, ...path: string[]) => path);
  getDocsMock.mockReset().mockResolvedValue({ docs: [] });
  orderByMock.mockReset().mockReturnValue({ order: "createdAt-desc" });
  queryMock.mockReset().mockImplementation((...constraints: unknown[]) => constraints);
});

describe("member order read repository", () => {
  it("keeps historical zero-priced orders readable while normalizing their implicit option snapshot", async () => {
    const adapter: MemberOrderReadAdapter = { list: vi.fn().mockResolvedValue([olderOrder]) };

    await expect(createMemberOrderReadRepository(adapter).list("user-1")).resolves.toEqual([
      expect.objectContaining({
        id: "older",
        lines: [expect.objectContaining({
          purchaseOptionId: "default",
          purchaseOptionLabel: "기본 구성",
          unitPrice: 0,
          lineTotal: 0,
        })],
      }),
    ]);
  });

  it("returns newest orders first", async () => {
    const adapter: MemberOrderReadAdapter = {
      list: vi.fn().mockResolvedValue([olderOrder, newerOrder]),
    };

    await expect(createMemberOrderReadRepository(adapter).list("user-1")).resolves.toEqual([
      expect.objectContaining({ id: "newer", orderNumber: "VL-20260824-NEWER1" }),
      expect.objectContaining({ id: "older", orderNumber: "VL-20260823-OLDER1" }),
    ]);
  });

  it("queries the browser-readable owner subcollection newest first", async () => {
    getDocsMock.mockResolvedValue({ docs: [newerOrder] });

    await expect(listMemberOrders("user-1")).resolves.toEqual([
      expect.objectContaining({ id: "newer", receivedAt: new Date("2026-08-24T02:00:00.000Z") }),
    ]);

    expect(collectionMock).toHaveBeenCalledWith({}, "users", "user-1", "orders");
    expect(orderByMock).toHaveBeenCalledWith("createdAt", "desc");
    expect(queryMock).toHaveBeenCalledWith(
      ["users", "user-1", "orders"],
      { order: "createdAt-desc" },
    );
  });
});
