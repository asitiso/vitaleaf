import { afterEach, describe, expect, it } from "vitest";

import type { PaymentResult } from "../payment/process-payment";
import type { Product } from "../products/types";
import {
  createGuestOrderService,
  GuestOrderDuplicateError,
  GuestOrderNotFoundError,
  GuestOrderRateLimitError,
  GuestOrderUnavailableError,
} from "./service";
import type {
  GuestOrderAttempt,
  GuestOrderRepository,
  GuestOrderStored,
} from "./types";
import { GuestOrderValidationError } from "./validation";

const NOW = new Date("2026-08-26T03:00:00.000Z");
const paymentResult: PaymentResult = {
  orderNumber: "VL-20260826-ABC123",
  receivedAt: "2026-08-26T02:59:00.000Z",
};

const savedLookupSecret = process.env.GUEST_ORDER_LOOKUP_SECRET;

afterEach(() => {
  if (savedLookupSecret === undefined) delete process.env.GUEST_ORDER_LOOKUP_SECRET;
  else process.env.GUEST_ORDER_LOOKUP_SECRET = savedLookupSecret;
});

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "p1",
  name: "비타민 C",
  slug: "vitamin-c",
  category: "비타민",
  concerns: ["활력"],
  ageTargets: [],
  price: 12_000,
  originalPrice: null,
  thumbnailUrl: "/products/vitamin-c.jpg",
  images: ["/products/vitamin-c.jpg"],
  media: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 5,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  revision: 1,
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: "admin",
  updatedBy: "admin",
  ...overrides,
});

const createInput = (overrides: Record<string, unknown> = {}) => ({
  customerName: "김민수",
  phone: "010-1234-5678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로",
  addressDetail: "4층 401호",
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card",
  lines: [{ productId: "p1", quantity: 2, unitPrice: 1 }],
  ...overrides,
});

const storedOrder: GuestOrderStored = {
  orderNumber: paymentResult.orderNumber,
  status: "mock-received",
  paymentMethod: "card",
  customerName: "김민수",
  phoneNormalized: "01012345678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로",
  addressDetail: "4층 401호",
  deliveryNote: "문 앞에 놓아 주세요.",
  lines: [{
    productId: "p1",
    name: "비타민 C",
    thumbnailUrl: "/products/vitamin-c.jpg",
    unitPrice: 12_000,
    quantity: 2,
  }],
  subtotal: 24_000,
  shippingFee: 3_000,
  total: 27_000,
  createdAt: NOW,
  receivedAt: new Date(paymentResult.receivedAt),
};

type InMemoryOptions = {
  products?: Product[];
  storedOrder?: GuestOrderStored;
  sampleProducts?: Product[];
};

const inMemoryDependencies = (options: InMemoryOptions = {}) => {
  const products = new Map((options.products ?? [product()]).map((item) => [item.id, item]));
  const sampleProducts = new Map((options.sampleProducts ?? []).map((item) => [item.id, item]));
  const orders = new Map<string, GuestOrderStored>();
  if (options.storedOrder) orders.set(options.storedOrder.orderNumber, options.storedOrder);
  const attempts = new Map<string, GuestOrderAttempt>();
  let deletedAttemptCount = 0;

  const repository: GuestOrderRepository = {
    async loadProducts(ids) {
      return ids.map((id) => products.get(id) ?? null);
    },
    async createOrder(order) {
      if (orders.has(order.orderNumber)) throw new GuestOrderDuplicateError();
      orders.set(order.orderNumber, order);
    },
    async getOrder(orderNumber) {
      return orders.get(orderNumber) ?? null;
    },
    async getAttempt(fingerprint) {
      return attempts.get(fingerprint) ?? null;
    },
    async setAttempt(fingerprint, now) {
      const current = attempts.get(fingerprint);
      const active = current && current.expiresAt.getTime() > now.getTime();
      const next = {
        failureCount: active ? current.failureCount + 1 : 1,
        expiresAt: active
          ? current.expiresAt
          : new Date(now.getTime() + 10 * 60 * 1000),
      };
      attempts.set(fingerprint, next);
      return next;
    },
    async deleteAttempt(fingerprint) {
      attempts.delete(fingerprint);
      deletedAttemptCount += 1;
    },
  };

  return {
    repository,
    lookupSecret: "test-only-secret",
    now: () => new Date(NOW),
    ...(options.sampleProducts === undefined
      ? {}
      : { findSampleProduct: (id: string) => sampleProducts.get(id) ?? null }),
    state: { orders, attempts, deletedAttemptCount: () => deletedAttemptCount },
  };
};

describe("guest order creation", () => {
  it.each([
    ["empty name", createInput({ customerName: "" })],
    ["overlong name", createInput({ customerName: "가".repeat(51) })],
    ["malformed phone", createInput({ phone: "123" })],
    ["overlong phone input", createInput({ phone: "0".repeat(31) })],
    ["control character in address", createInput({ address: "서울\u0000강남" })],
    ["overlong postcode", createInput({ postcode: "1".repeat(11) })],
    ["overlong base address", createInput({ address: "가".repeat(201) })],
    ["overlong address detail", createInput({ addressDetail: "가".repeat(101) })],
    ["overlong delivery note", createInput({ deliveryNote: "가".repeat(201) })],
    ["more than twenty lines", createInput({
      lines: Array.from({ length: 21 }, (_, index) => ({ productId: `p${index}`, quantity: 1 })),
    })],
    ["duplicate product IDs", createInput({
      lines: [{ productId: "p1", quantity: 1 }, { productId: "p1", quantity: 2 }],
    })],
    ["zero quantity", createInput({ lines: [{ productId: "p1", quantity: 0 }] })],
    ["quantity above 999", createInput({ lines: [{ productId: "p1", quantity: 1000 }] })],
    ["fractional quantity", createInput({ lines: [{ productId: "p1", quantity: 1.5 }] })],
  ])("rejects %s", async (_label, input) => {
    const service = createGuestOrderService(inMemoryDependencies());
    await expect(service.create(input, paymentResult)).rejects.toThrow(GuestOrderValidationError);
  });

  it("recalculates totals and stored line details from server products", async () => {
    const dependencies = inMemoryDependencies({
      products: [product({ price: 12_000, stock: 5, name: "서버 상품명" })],
    });

    const result = await createGuestOrderService(dependencies).create(createInput(), paymentResult);

    expect(result).toEqual(paymentResult);
    expect(dependencies.state.orders.get(paymentResult.orderNumber)).toMatchObject({
      phoneNormalized: "01012345678",
      subtotal: 24_000,
      shippingFee: 3_000,
      total: 27_000,
      lines: [{
        productId: "p1",
        name: "서버 상품명",
        thumbnailUrl: "/products/vitamin-c.jpg",
        unitPrice: 12_000,
        quantity: 2,
      }],
    });
  });

  it("returns only the validated public payment fields", async () => {
    const dependencies = inMemoryDependencies();
    const paymentWithInjectedData = {
      ...paymentResult,
      customerName: "반환되면 안 되는 값",
    } as PaymentResult;

    await expect(
      createGuestOrderService(dependencies).create(createInput(), paymentWithInjectedData),
    ).resolves.toEqual(paymentResult);
  });

  it("uses a legacy sample only when the server product read returns null", async () => {
    const dependencies = inMemoryDependencies({
      products: [],
    });

    await createGuestOrderService(dependencies).create(createInput({
      lines: [{ productId: "sample-daily-multivitamin", quantity: 1 }],
    }), paymentResult);

    expect(dependencies.state.orders.get(paymentResult.orderNumber)).toMatchObject({
      subtotal: 24_900,
      shippingFee: 3_000,
      total: 27_900,
      lines: [{
        productId: "sample-daily-multivitamin",
        name: "[샘플] 데일리 멀티비타민",
        unitPrice: 24_900,
      }],
    });
  });

  it("rejects missing and insufficient-stock products", async () => {
    const missing = createGuestOrderService(inMemoryDependencies({ products: [], sampleProducts: [] }));
    const insufficient = createGuestOrderService(inMemoryDependencies({
      products: [product({ stock: 1 })],
    }));

    await expect(missing.create(createInput(), paymentResult)).rejects.toThrow(GuestOrderUnavailableError);
    await expect(insufficient.create(createInput(), paymentResult)).rejects.toThrow(GuestOrderUnavailableError);
  });

  it("preserves create-only semantics for duplicate order numbers", async () => {
    const dependencies = inMemoryDependencies({ storedOrder });

    await expect(
      createGuestOrderService(dependencies).create(createInput(), paymentResult),
    ).rejects.toThrow(GuestOrderDuplicateError);
    expect(dependencies.state.orders.get(paymentResult.orderNumber)).toBe(storedOrder);
  });
});

describe("guest order lookup", () => {
  const correctLookup = { orderNumber: storedOrder.orderNumber, phone: "010-1234-5678" };
  const wrongLookup = { ...correctLookup, phone: "010-9999-9999" };

  it("reads GUEST_ORDER_LOOKUP_SECRET lazily when no secret is injected", async () => {
    process.env.GUEST_ORDER_LOOKUP_SECRET = "test-only-environment-secret";
    const dependencies = inMemoryDependencies({ storedOrder });

    const service = createGuestOrderService({
      ...dependencies,
      lookupSecret: undefined,
    });

    await expect(service.lookup(correctLookup, "client-a")).resolves.toMatchObject({
      orderNumber: storedOrder.orderNumber,
    });
  });

  it("returns only masked contact data for a matching phone", async () => {
    const dependencies = inMemoryDependencies({ storedOrder });

    const result = await createGuestOrderService(dependencies).lookup(correctLookup, "client-a");

    expect(result).toEqual({
      orderNumber: storedOrder.orderNumber,
      status: "mock-received",
      receivedAt: "2026-08-26T02:59:00.000Z",
      customerNameMasked: "김**",
      phoneMasked: "010-****-5678",
      addressMasked: "06236 서울특별시 강남구 ***",
      lines: storedOrder.lines,
      subtotal: 24_000,
      shippingFee: 3_000,
      total: 27_000,
    });
    expect(JSON.stringify(result)).not.toContain(storedOrder.addressDetail);
    expect(JSON.stringify(result)).not.toContain(storedOrder.phoneNormalized);
  });

  it("uses the same not-found error for an unknown order and an incorrect phone", async () => {
    const service = createGuestOrderService(inMemoryDependencies({ storedOrder }));

    await expect(service.lookup(wrongLookup, "client-a")).rejects.toThrow(GuestOrderNotFoundError);
    await expect(service.lookup({ ...correctLookup, orderNumber: "VL-20260826-ZZZZZZ" }, "client-b"))
      .rejects.toThrow(GuestOrderNotFoundError);
  });

  it("blocks the sixth lookup in a ten-minute window", async () => {
    const service = createGuestOrderService(inMemoryDependencies({ storedOrder }));

    for (let count = 0; count < 5; count += 1) {
      await expect(service.lookup(wrongLookup, "client-a")).rejects.toThrow(GuestOrderNotFoundError);
    }
    await expect(service.lookup(correctLookup, "client-a")).rejects.toThrow(GuestOrderRateLimitError);
  });

  it("clears prior failures after a successful lookup", async () => {
    const dependencies = inMemoryDependencies({ storedOrder });
    const service = createGuestOrderService(dependencies);
    await expect(service.lookup(wrongLookup, "client-a")).rejects.toThrow(GuestOrderNotFoundError);

    await expect(service.lookup(correctLookup, "client-a")).resolves.toMatchObject({
      orderNumber: storedOrder.orderNumber,
    });

    expect(dependencies.state.attempts.size).toBe(0);
    expect(dependencies.state.deletedAttemptCount()).toBe(1);
  });

  it("stores only an HMAC fingerprint for failed client lookups", async () => {
    const dependencies = inMemoryDependencies({ storedOrder });

    await expect(
      createGuestOrderService(dependencies).lookup(wrongLookup, "198.51.100.42"),
    ).rejects.toThrow(GuestOrderNotFoundError);

    const keys = [...dependencies.state.attempts.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(keys[0]).not.toContain("198.51.100.42");
  });
});
