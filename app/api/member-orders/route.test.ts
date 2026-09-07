// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createOrder: vi.fn(),
  getOrderByIdempotency: vi.fn(),
  loadProducts: vi.fn(),
  useRealService: false,
  verifyBearerMember: vi.fn(),
}));

vi.mock("../../../lib/firebase/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/firebase/admin-auth")>();
  return { ...actual, verifyBearerMember: mocks.verifyBearerMember };
});

vi.mock("../../../lib/firebase/member-orders.server", () => ({
  memberOrderRepository: {
    createOrder: mocks.createOrder,
    getOrderByIdempotency: mocks.getOrderByIdempotency,
    loadProducts: mocks.loadProducts,
  },
}));

vi.mock("../../../lib/member-orders/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/member-orders/service")>();
  return {
    ...actual,
    createMemberOrderService: vi.fn((
      dependencies: Parameters<typeof actual.createMemberOrderService>[0],
    ) => mocks.useRealService
      ? actual.createMemberOrderService(dependencies)
      : { create: mocks.create }),
  };
});

import { ServerAuthenticationError } from "../../../lib/firebase/admin-auth";
import { MemberOrderUnavailableError } from "../../../lib/member-orders/service";
import { POST } from "./route";

const payment = {
  orderNumber: "VL-20260831-ABC123",
  receivedAt: "2026-08-31T03:00:00.000Z",
};

const order = {
  customerName: "김민수",
  phone: "010-1234-5678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로",
  addressDetail: "4층 401호",
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card",
  lines: [{ productId: "p1", purchaseOptionId: "2-month", quantity: 2 }],
};

const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
const savedTestCustomerUid = process.env.TEST_CUSTOMER_UID;

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
  }],
};

const createRequest = (body: unknown, authorization?: string): Request => new Request(
  "http://localhost/api/member-orders",
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  },
);

beforeEach(() => {
  mocks.useRealService = false;
  mocks.create.mockReset().mockResolvedValue(payment);
  mocks.createOrder.mockReset().mockImplementation(async (
    _uid,
    storedOrder,
    _key,
    requestFingerprint,
  ) => ({ order: storedOrder, requestFingerprint }));
  mocks.getOrderByIdempotency.mockReset().mockResolvedValue(null);
  mocks.loadProducts.mockReset().mockResolvedValue([product]);
  mocks.verifyBearerMember.mockReset().mockImplementation(async (request: Request) => {
    if (!request.headers.get("authorization")) throw new ServerAuthenticationError(401);
    return { uid: "verified-member" };
  });
});

afterEach(() => {
  if (savedTestCustomerUid === undefined) delete process.env.TEST_CUSTOMER_UID;
  else process.env.TEST_CUSTOMER_UID = savedTestCustomerUid;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/member-orders", () => {
  it("returns 401 when the request has no verified bearer token", async () => {
    const response = await POST(createRequest({ order, payment, idempotencyKey }));

    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns 401 before parsing an unauthenticated malformed request", async () => {
    const response = await POST(new Request("http://localhost/api/member-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));

    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("derives the persisted owner from the verified token instead of browser userId", async () => {
    const response = await POST(createRequest({
      order: { ...order, userId: "attacker-controlled-user" },
      payment,
      idempotencyKey,
    }, "Bearer member-token"));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      "verified-member",
      expect.objectContaining({ userId: "attacker-controlled-user" }),
      payment,
      idempotencyKey,
    );
  });

  it("labels an order when the verified UID matches the server test customer UID", async () => {
    process.env.TEST_CUSTOMER_UID = "member-uid";
    mocks.useRealService = true;
    mocks.verifyBearerMember.mockResolvedValueOnce({ uid: "member-uid" });

    const response = await POST(createRequest({ order, payment, idempotencyKey }, "Bearer member-token"));

    expect(response.status).toBe(201);
    expect(mocks.createOrder).toHaveBeenCalledWith(
      "member-uid",
      expect.objectContaining({ isTestOrder: true }),
      idempotencyKey,
      expect.any(String),
    );
  });

  it("returns 409 when the authoritative option resolver rejects an unavailable option", async () => {
    mocks.create.mockRejectedValueOnce(new MemberOrderUnavailableError());

    const response = await POST(createRequest({
      order: { ...order, lines: [{ productId: "p1", purchaseOptionId: "unknown", quantity: 2 }] },
      payment,
      idempotencyKey,
    }, "Bearer member-token"));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "주문할 수 없는 상품이 포함되어 있습니다." });
  });

  it("returns the safe receipt with 201 after a valid authoritative create", async () => {
    const response = await POST(createRequest({ order, payment, idempotencyKey }, "Bearer member-token"));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(payment);
  });

  it("returns a logged generic 500 for infrastructure failures", async () => {
    mocks.create.mockRejectedValueOnce(new Error(`${order.phone} repository unavailable`));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(createRequest({ order, payment, idempotencyKey }, "Bearer member-token"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(consoleError).toHaveBeenCalledWith("Member order API failure", {
      errorClass: "Error",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(order.phone);
  });
});
