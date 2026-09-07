import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Product } from "../products/types";
import type { GuestOrderStored } from "../guest-orders/types";
import { GuestOrderDuplicateError } from "../guest-orders/service";

const adminMocks = vi.hoisted(() => ({
  cert: vi.fn((value: unknown) => ({ credential: value })),
  getApps: vi.fn<() => { name: string }[]>(() => []),
  getFirestore: vi.fn((app: unknown) => ({ app })),
  initializeApp: vi.fn((options: unknown, name: string) => ({ name, options })),
}));

vi.mock("firebase-admin/app", () => ({
  cert: adminMocks.cert,
  getApps: adminMocks.getApps,
  initializeApp: adminMocks.initializeApp,
}));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: adminMocks.getFirestore }));

import { getAdminFirestore } from "./admin";
import { createFirestoreGuestOrderRepository, normalizeGuestOrder } from "./guest-orders";

const NOW = new Date("2026-08-26T03:00:00.000Z");
const order: GuestOrderStored = {
  orderNumber: "VL-20260826-ABC123",
  status: "mock-received",
  isTestOrder: false,
  shippingCarrier: "",
  trackingNumber: "",
  statusUpdatedAt: null,
  statusUpdatedBy: "",
  paymentMethod: "card",
  customerName: "김민수",
  phoneNormalized: "01012345678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로",
  addressDetail: "4층 401호",
  deliveryNote: "문 앞에 놓아 주세요.",
  lines: [{
    productId: "p1",
    purchaseOptionId: "2-month",
    purchaseOptionLabel: "2개월분",
    sku: "VITAMIN-C-2M",
    name: "비타민 C",
    thumbnailUrl: "/products/vitamin-c.jpg",
    basePrice: 12_000,
    priceAdjustment: -2_000,
    unitPrice: 10_000,
    quantity: 2,
    lineTotal: 20_000,
  }],
  subtotal: 20_000,
  shippingFee: 3_000,
  total: 23_000,
  createdAt: NOW,
  receivedAt: new Date("2026-08-26T02:59:00.000Z"),
};

const environmentNames = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
] as const;
const savedEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  adminMocks.cert.mockClear();
  adminMocks.getApps.mockReset().mockReturnValue([]);
  adminMocks.getFirestore.mockClear();
  adminMocks.initializeApp.mockClear();
  for (const name of environmentNames) delete process.env[name];
});

afterEach(() => {
  for (const name of environmentNames) {
    const saved = savedEnvironment[name];
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
});

describe("Firebase Admin initialization", () => {
  it("does not initialize Firebase Admin when server modules are imported", () => {
    expect(adminMocks.initializeApp).not.toHaveBeenCalled();
    expect(adminMocks.getFirestore).not.toHaveBeenCalled();
  });

  it("validates required credentials only when Firestore is requested", () => {
    expect(() => getAdminFirestore()).toThrow(/FIREBASE_ADMIN_.* is required for Firebase Admin/u);
    expect(adminMocks.initializeApp).not.toHaveBeenCalled();
  });

  it("reuses the named vitaleaf-server app instead of the first app", () => {
    const unrelatedApp = { name: "unrelated" };
    const serverApp = { name: "vitaleaf-server" };
    adminMocks.getApps.mockReturnValue([unrelatedApp, serverApp]);
    adminMocks.getFirestore.mockReturnValue({ app: serverApp });

    expect(getAdminFirestore()).toEqual({ app: serverApp });
    expect(adminMocks.getFirestore).toHaveBeenCalledWith(serverApp);
    expect(adminMocks.initializeApp).not.toHaveBeenCalled();
  });

  it("initializes a named app and restores private-key newlines", () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "vitaleaf-test";
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "server@example.test";
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = "line-1\\nline-2";

    getAdminFirestore();

    expect(adminMocks.cert).toHaveBeenCalledWith({
      projectId: "vitaleaf-test",
      clientEmail: "server@example.test",
      privateKey: "line-1\nline-2",
    });
    expect(adminMocks.initializeApp).toHaveBeenCalledWith({
      credential: { credential: {
        projectId: "vitaleaf-test",
        clientEmail: "server@example.test",
        privateKey: "line-1\nline-2",
      } },
    }, "vitaleaf-server");
  });
});

type DocumentSnapshot = { exists: boolean; data(): unknown };

const firestoreHarness = () => {
  const snapshots = new Map<string, DocumentSnapshot>();
  const references = new Map<string, {
    path: string;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  }>();
  const transactionGet = vi.fn(async (reference: { path: string }) =>
    snapshots.get(reference.path) ?? { exists: false, data: () => undefined });
  const transactionSet = vi.fn();
  const transactionCreate = vi.fn();
  const runTransaction = vi.fn(async (operation: (transaction: unknown) => Promise<unknown>) =>
    operation({ create: transactionCreate, get: transactionGet, set: transactionSet }));
  const doc = vi.fn((path: string) => {
    const existing = references.get(path);
    if (existing) return existing;
    const reference = {
      path,
      create: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(async () => snapshots.get(path) ?? { exists: false, data: () => undefined }),
    };
    references.set(path, reference);
    return reference;
  });

  return {
    firestore: { doc, runTransaction },
    references,
    snapshots,
    transactionGet,
    transactionCreate,
    transactionSet,
    runTransaction,
  };
};

describe("Firestore guest-order repository", () => {
  it("exports the same shipped-order normalization used by lookup", async () => {
    const harness = firestoreHarness();
    const statusUpdatedAt = new Date("2026-09-07T03:00:00.000Z");
    const stored = {
      ...order,
      status: "shipped",
      isTestOrder: false,
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234-5678",
      statusUpdatedAt: { toDate: () => statusUpdatedAt },
      statusUpdatedBy: "admin-1",
    };
    harness.snapshots.set(`guestOrders/${order.orderNumber}`, {
      exists: true,
      data: () => stored,
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });
    const expected = {
      ...order,
      status: "shipped",
      isTestOrder: false,
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234-5678",
      statusUpdatedAt,
      statusUpdatedBy: "admin-1",
    };

    expect(normalizeGuestOrder(order.orderNumber, stored)).toEqual(expected);
    await expect(repository.getOrder(order.orderNumber)).resolves.toEqual(expected);
  });

  it("falls back to received operations for an invalid legacy status", () => {
    expect(normalizeGuestOrder(order.orderNumber, {
      ...order,
      status: "paid",
    })).toMatchObject({
      status: "mock-received",
      isTestOrder: false,
      shippingCarrier: "",
      trackingNumber: "",
      statusUpdatedAt: null,
      statusUpdatedBy: "",
    });
  });

  it("loads every requested public server product", async () => {
    const harness = firestoreHarness();
    const p1 = { id: "p1" } as Product;
    const loadProduct = vi.fn(async (id: string) => id === "p1" ? p1 : null);
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct,
    });

    await expect(repository.loadProducts(["p1", "missing"])).resolves.toEqual([p1, null]);
    expect(loadProduct).toHaveBeenNthCalledWith(1, "p1");
    expect(loadProduct).toHaveBeenNthCalledWith(2, "missing");
  });

  it("reads the latest Admin product snapshot for every checkout verification", async () => {
    const harness = firestoreHarness();
    const path = "products/p1";
    harness.snapshots.set(path, {
      exists: true,
      data: () => ({ name: "비타민 C", price: 12_000, stock: 5 }),
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
    });

    await expect(repository.loadProducts(["p1"])).resolves.toEqual([
      expect.objectContaining({ id: "p1", price: 12_000, stock: 5 }),
    ]);

    harness.snapshots.set(path, {
      exists: true,
      data: () => ({ name: "비타민 C", price: 15_000, stock: 0 }),
    });

    await expect(repository.loadProducts(["p1"])).resolves.toEqual([
      expect.objectContaining({ id: "p1", price: 15_000, stock: 0 }),
    ]);
    expect(harness.references.get(path)?.get).toHaveBeenCalledTimes(2);
  });

  it("types invalid Admin product snapshots without hiding Firestore failures", async () => {
    const harness = firestoreHarness();
    const path = "products/p1";
    harness.snapshots.set(path, {
      exists: true,
      data: () => ({
        name: "비타민 C",
        price: 100,
        stock: 5,
        purchaseOptions: [{
          id: "2-month",
          label: "2개월분",
          durationMonths: 2,
          sku: "VITAMIN-C-2M",
          priceAdjustment: -100,
          stock: 5,
          active: true,
          isDefault: true,
        }],
      }),
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
    });

    await expect(repository.loadProducts(["p1"])).rejects.toMatchObject({
      name: "OrderCatalogInvalidError",
    });

    const infrastructureError = new Error("Firestore unavailable");
    harness.references.get(path)?.get.mockRejectedValueOnce(infrastructureError);

    await expect(repository.loadProducts(["p1"])).rejects.toBe(infrastructureError);
  });

  it("atomically creates an order and its hashed idempotency mapping", async () => {
    const harness = firestoreHarness();
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await expect(repository.createOrder(order, "idempotency-fingerprint")).resolves.toBe(order);

    expect(harness.runTransaction).toHaveBeenCalledOnce();
    expect(harness.transactionCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: `guestOrders/${order.orderNumber}` }),
      order,
    );
    expect(harness.transactionCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: "guestOrderIdempotency/idempotency-fingerprint" }),
      { orderNumber: order.orderNumber, createdAt: order.createdAt },
    );
  });

  it("returns the existing order for an idempotent retry without creating another document", async () => {
    const harness = firestoreHarness();
    harness.snapshots.set("guestOrderIdempotency/idempotency-fingerprint", {
      exists: true,
      data: () => ({ orderNumber: order.orderNumber }),
    });
    harness.snapshots.set(`guestOrders/${order.orderNumber}`, {
      exists: true,
      data: () => order,
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await expect(repository.createOrder({ ...order, total: 999 }, "idempotency-fingerprint"))
      .resolves.toEqual(order);
    expect(harness.transactionCreate).not.toHaveBeenCalled();
  });

  it("resolves an idempotency mapping before checkout revalidation", async () => {
    const harness = firestoreHarness();
    harness.snapshots.set("guestOrderIdempotency/idempotency-fingerprint", {
      exists: true,
      data: () => ({ orderNumber: order.orderNumber }),
    });
    harness.snapshots.set(`guestOrders/${order.orderNumber}`, {
      exists: true,
      data: () => order,
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await expect(repository.getOrderByIdempotency("idempotency-fingerprint"))
      .resolves.toEqual(order);
  });

  it("maps Firestore create conflicts to the domain duplicate error", async () => {
    const harness = firestoreHarness();
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });
    harness.runTransaction.mockRejectedValueOnce({ code: 6 });

    await expect(repository.createOrder(order, "idempotency-fingerprint"))
      .rejects.toThrow(GuestOrderDuplicateError);
  });

  it("converts order and attempt Firestore timestamps to domain Dates", async () => {
    const harness = firestoreHarness();
    const createdAt = new Date("2026-08-26T03:00:00.000Z");
    const receivedAt = new Date("2026-08-26T02:59:00.000Z");
    const expiresAt = new Date("2026-08-26T03:10:00.000Z");
    harness.snapshots.set(`guestOrders/${order.orderNumber}`, {
      exists: true,
      data: () => ({
        ...order,
        createdAt: { toDate: () => createdAt },
        receivedAt: { toDate: () => receivedAt },
      }),
    });
    harness.snapshots.set("guestOrderLookupAttempts/fingerprint", {
      exists: true,
      data: () => ({ failureCount: 4, expiresAt: { toDate: () => expiresAt } }),
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await expect(repository.getOrder(order.orderNumber)).resolves.toMatchObject({
      createdAt,
      receivedAt,
    });
    await expect(repository.getAttempt("fingerprint")).resolves.toEqual({
      failureCount: 4,
      expiresAt,
    });
  });

  it("backfills immutable default-option fields when reading an older guest order", async () => {
    const harness = firestoreHarness();
    const legacyOrderNumber = "VL-20260826-LEGACY";
    harness.snapshots.set(`guestOrders/${legacyOrderNumber}`, {
      exists: true,
      data: () => ({
        ...order,
        lines: [{
          productId: "p1",
          name: "과거 비타민 C",
          thumbnailUrl: "/legacy.jpg",
          unitPrice: 12_000,
          quantity: 2,
        }],
      }),
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await expect(repository.getOrder(legacyOrderNumber)).resolves.toMatchObject({
      lines: [{
        productId: "p1",
        purchaseOptionId: "default",
        purchaseOptionLabel: "기본 구성",
        sku: "",
        name: "과거 비타민 C",
        thumbnailUrl: "/legacy.jpg",
        basePrice: 12_000,
        priceAdjustment: 0,
        unitPrice: 12_000,
        quantity: 2,
        lineTotal: 24_000,
      }],
    });
  });

  it("atomically reserves an active lookup slot in a transaction", async () => {
    const harness = firestoreHarness();
    const expiresAt = new Date("2026-08-26T03:10:00.000Z");
    harness.snapshots.set("guestOrderLookupAttempts/fingerprint", {
      exists: true,
      data: () => ({ failureCount: 4, expiresAt: { toDate: () => expiresAt } }),
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await expect(repository.setAttempt("fingerprint", NOW)).resolves.toEqual({
      failureCount: 5,
      expiresAt,
    });

    expect(harness.runTransaction).toHaveBeenCalledOnce();
    expect(harness.transactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "guestOrderLookupAttempts/fingerprint" }),
      { failureCount: 5, expiresAt },
    );
  });

  it("returns an over-limit sixth reservation from the transaction", async () => {
    const harness = firestoreHarness();
    const expiresAt = new Date("2026-08-26T03:10:00.000Z");
    harness.snapshots.set("guestOrderLookupAttempts/fingerprint", {
      exists: true,
      data: () => ({ failureCount: 5, expiresAt: { toDate: () => expiresAt } }),
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await expect(repository.setAttempt("fingerprint", NOW)).resolves.toEqual({
      failureCount: 6,
      expiresAt,
    });

    expect(harness.runTransaction).toHaveBeenCalledOnce();
    expect(harness.transactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "guestOrderLookupAttempts/fingerprint" }),
      { failureCount: 6, expiresAt },
    );
  });

  it("starts a new ten-minute window after an attempt expires", async () => {
    const harness = firestoreHarness();
    harness.snapshots.set("guestOrderLookupAttempts/fingerprint", {
      exists: true,
      data: () => ({
        failureCount: 5,
        expiresAt: { toDate: () => new Date("2026-08-26T02:59:59.999Z") },
      }),
    });
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await expect(repository.setAttempt("fingerprint", NOW)).resolves.toEqual({
      failureCount: 1,
      expiresAt: new Date("2026-08-26T03:10:00.000Z"),
    });
  });

  it("deletes the fingerprint document after a successful lookup", async () => {
    const harness = firestoreHarness();
    const repository = createFirestoreGuestOrderRepository({
      getFirestore: () => harness.firestore as never,
      loadProduct: vi.fn(),
    });

    await repository.deleteAttempt("fingerprint");

    expect(harness.references.get("guestOrderLookupAttempts/fingerprint")?.delete)
      .toHaveBeenCalledOnce();
  });
});
