import { beforeEach, describe, expect, it, vi } from "vitest";

const { addDocMock, collectionMock, getDocsMock, orderByMock, queryMock } = vi.hoisted(() => ({
  addDocMock: vi.fn(),
  collectionMock: vi.fn(),
  getDocsMock: vi.fn(),
  orderByMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock("./client", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  addDoc: addDocMock,
  collection: collectionMock,
  getDocs: getDocsMock,
  orderBy: orderByMock,
  query: queryMock,
}));

import { createMemberOrderRepository, type MemberOrderAdapter } from "./member-orders";

const draft = {
  customerName: "홍길동",
  phone: "010-1234-5678",
  postcode: "12345",
  address: "서울시 중구 세종대로",
  addressDetail: "101호",
  deliveryNote: "문 앞에 놓아 주세요",
  paymentMethod: "card" as const,
  lines: [{
    productId: "omega",
    name: "오메가3",
    thumbnailUrl: "/omega.jpg",
    unitPrice: 16_000,
    stock: 8,
    quantity: 2,
    selected: true,
  }],
  subtotal: 32_000,
  shippingFee: 0,
  total: 32_000,
};

const olderOrder = {
  id: "older",
  data: () => ({
    userId: "user-1",
    orderNumber: "VL-20260823-OLDER1",
    status: "mock-received",
    paymentMethod: "card",
    customerName: "홍길동",
    phone: "010-1234-5678",
    shippingAddress: { postcode: "12345", address: "서울", addressDetail: "101호" },
    deliveryNote: "",
    lines: [{ productId: "omega", name: "오메가3", quantity: 1, unitPrice: 16_000 }],
    subtotal: 16_000,
    shippingFee: 0,
    total: 16_000,
    createdAt: new Date("2026-08-23T02:00:00.000Z"),
  }),
};

const newerOrder = {
  id: "newer",
  data: () => ({
    ...olderOrder.data(),
    orderNumber: "VL-20260824-NEWER1",
    createdAt: new Date("2026-08-24T02:00:00.000Z"),
  }),
};

beforeEach(() => {
  addDocMock.mockReset().mockResolvedValue({ id: "firestore-order" });
  collectionMock.mockReset().mockImplementation((_db: unknown, ...path: string[]) => path);
  getDocsMock.mockReset().mockResolvedValue({ docs: [] });
  orderByMock.mockReset().mockReturnValue({ order: "createdAt-desc" });
  queryMock.mockReset().mockImplementation((...constraints: unknown[]) => constraints);
});

describe("member order repository", () => {
  it("stores a member-owned immutable order snapshot", async () => {
    const adapter: MemberOrderAdapter = { add: vi.fn().mockResolvedValue("order-1"), list: vi.fn() };
    const repository = createMemberOrderRepository(adapter);

    await expect(repository.create("user-1", draft, {
      orderNumber: "VL-20260824-ABC123",
      receivedAt: "2026-08-24T02:00:00.000Z",
    })).resolves.toBe("order-1");

    expect(adapter.add).toHaveBeenCalledWith("user-1", expect.objectContaining({
      userId: "user-1",
      orderNumber: "VL-20260824-ABC123",
      status: "mock-received",
      lines: [{ productId: "omega", name: "오메가3", quantity: 2, unitPrice: 16_000 }],
      total: 32_000,
      createdAt: new Date("2026-08-24T02:00:00.000Z"),
    }));
    expect(adapter.add).toHaveBeenCalledWith("user-1", expect.not.objectContaining({
      lines: expect.arrayContaining([expect.objectContaining({ selected: true, stock: 8 })]),
    }));
  });

  it("returns newest orders first", async () => {
    const adapter: MemberOrderAdapter = {
      add: vi.fn(),
      list: vi.fn().mockResolvedValue([olderOrder, newerOrder]),
    };

    await expect(createMemberOrderRepository(adapter).list("user-1")).resolves.toEqual([
      expect.objectContaining({ id: "newer", orderNumber: "VL-20260824-NEWER1" }),
      expect.objectContaining({ id: "older", orderNumber: "VL-20260823-OLDER1" }),
    ]);
  });
});
