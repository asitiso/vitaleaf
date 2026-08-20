import { beforeEach, describe, expect, it, vi } from "vitest";

type Reference = { collection: string; id?: string };
type StoredRecord = Record<string, unknown>;

const {
  authMock,
  collectionMock,
  docMock,
  firebaseState,
  getDocMock,
  onSnapshotMock,
  runTransactionMock,
  serverTimestampMock,
  transactionDeleteMock,
  transactionSetMock,
} = vi.hoisted(() => ({
  authMock: { currentUser: { uid: "admin-a" } as { uid: string } | null },
  collectionMock: vi.fn(),
  docMock: vi.fn(),
  firebaseState: {
    productDrafts: new Map<string, Record<string, unknown>>(),
    products: new Map<string, Record<string, unknown>>(),
    nextId: 1,
  },
  getDocMock: vi.fn(),
  onSnapshotMock: vi.fn(),
  runTransactionMock: vi.fn(),
  serverTimestampMock: vi.fn(),
  transactionDeleteMock: vi.fn(),
  transactionSetMock: vi.fn(),
}));

vi.mock("./client", () => ({ auth: authMock, db: { kind: "database" } }));
vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  doc: docMock,
  getDoc: getDocMock,
  onSnapshot: onSnapshotMock,
  runTransaction: runTransactionMock,
  serverTimestamp: serverTimestampMock,
}));

import {
  createDraftId,
  createProductDraftRepository,
  duplicateProductToDraft,
  getDraft,
  publishDraft,
  saveDraft,
  subscribeDrafts,
  unpublishProduct,
  type ProductDraftRepositoryAdapter,
} from "./product-drafts";
import type { Product, ProductDraft } from "../products/types";

const productFields = {
  name: "Daily Omega",
  slug: "daily-omega",
  category: "heart",
  concerns: ["circulation"],
  price: 28_000,
  originalPrice: null,
  thumbnailUrl: "https://example.com/omega.jpg",
  images: ["https://example.com/omega.jpg"],
  media: [{
    url: "https://example.com/omega.jpg",
    storagePath: "products/product-1/image.jpg",
    alt: "Daily Omega",
    order: 0,
  }],
  description: "Omega-3 supplement",
  benefits: ["Supports heart health"],
  ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
  dosage: "Once daily",
  origin: "Korea",
  certifications: ["GMP"],
  cautions: ["Take with food"],
  stock: 12,
  isBest: true,
  isNew: false,
  salesRank: 2,
  ratingAverage: 4.8,
  reviewCount: 31,
};

const makeDraft = (overrides: Partial<ProductDraft> = {}): ProductDraft => ({
  id: "draft-1",
  ...productFields,
  status: "draft",
  mode: "create",
  sessionId: null,
  revision: 0,
  sourceProductId: null,
  sourceProductRevision: null,
  sourceCreatedAt: null,
  sourceCreatedBy: null,
  currentStep: 1,
  createdAt: null,
  updatedAt: null,
  createdBy: null,
  updatedBy: null,
  ...overrides,
});

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "product-1",
  ...productFields,
  revision: 4,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  createdBy: "admin-original",
  updatedBy: "admin-editor",
  ...overrides,
});

const referenceKey = (reference: Reference): keyof Pick<typeof firebaseState, "productDrafts" | "products"> => (
  reference.collection as "productDrafts" | "products"
);

beforeEach(() => {
  authMock.currentUser = { uid: "admin-a" };
  firebaseState.productDrafts.clear();
  firebaseState.products.clear();
  firebaseState.nextId = 1;
  collectionMock.mockReset().mockImplementation((_database, name: string) => ({ collection: name }));
  docMock.mockReset().mockImplementation((first: Reference, second?: string, third?: string) => {
    if (first.collection && second === undefined) return { collection: first.collection, id: `generated-${firebaseState.nextId++}` };
    return { collection: second!, id: third! };
  });
  getDocMock.mockReset().mockImplementation(async (reference: Reference) => {
    const value = firebaseState[referenceKey(reference)].get(reference.id!);
    return { id: reference.id, exists: () => value !== undefined, data: () => structuredClone(value) };
  });
  onSnapshotMock.mockReset().mockImplementation((reference: Reference, next) => {
    const documents = [...firebaseState[referenceKey(reference)]].map(([id, value]) => ({
      id,
      data: () => structuredClone(value),
    }));
    next({ docs: documents });
    return () => undefined;
  });
  serverTimestampMock.mockReset().mockImplementation(() => new Date("2026-08-11T12:00:00.000Z"));
  transactionDeleteMock.mockReset();
  transactionSetMock.mockReset();
  runTransactionMock.mockReset().mockImplementation(async (_database, operation) => {
    const writes: Array<{ reference: Reference; value: StoredRecord | null }> = [];
    const transaction = {
      get: async (reference: Reference) => {
        const value = firebaseState[referenceKey(reference)].get(reference.id!);
        return { id: reference.id, exists: () => value !== undefined, data: () => structuredClone(value) };
      },
      set: (reference: Reference, value: StoredRecord) => {
        transactionSetMock(reference, value);
        writes.push({ reference, value: structuredClone(value) });
      },
      delete: (reference: Reference) => {
        transactionDeleteMock(reference);
        writes.push({ reference, value: null });
      },
    };
    const result = await operation(transaction);
    for (const { reference, value } of writes) {
      const target = firebaseState[referenceKey(reference)];
      if (value) target.set(reference.id!, value);
      else target.delete(reference.id!);
    }
    return result;
  });
});

describe("repository boundaries", () => {
  it("creates draft ids without a write", () => {
    expect(createDraftId()).toBe("generated-1");
    expect(firebaseState.productDrafts.size).toBe(0);
  });

  it("loads and subscribes to incomplete drafts while dropping malformed ingredients", async () => {
    firebaseState.productDrafts.set("incomplete", {
      ...makeDraft(),
      id: undefined,
      name: "",
      category: "유산균",
      concerns: ["장 건강", "면역"],
      sessionId: "session-existing",
      revision: 3,
      ingredients: [null, {}, { name: "   " }, { name: " EPA ", amount: "600mg" }],
    });
    const onData = vi.fn();

    await expect(getDraft("incomplete")).resolves.toMatchObject({
      id: "incomplete",
      name: "",
      category: "probiotic",
      concerns: ["gut", "immunity"],
      revision: 3,
      ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    });
    subscribeDrafts(onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([
      expect.objectContaining({ id: "incomplete", sessionId: "session-existing", revision: 3 }),
    ]);
  });

  it("duplicates as a separately versioned zero-stock draft without social proof", async () => {
    const product = makeProduct();
    const { id, ...record } = product;
    firebaseState.products.set(id, record as StoredRecord);

    const copy = await duplicateProductToDraft(product);

    expect(copy).toMatchObject({
      id: "generated-1",
      name: "Daily Omega (복사본)",
      mode: "create",
      revision: 1,
      sourceProductId: "product-1",
      sourceProductRevision: 4,
      stock: 0,
      ratingAverage: 0,
      reviewCount: 0,
      salesRank: null,
    });
  });
});

describe("Firebase transaction boundary", () => {
  it("resolves owner metadata inside the save transaction", async () => {
    const pendingOwner = { current: "admin-a" };
    authMock.currentUser = { get uid() { return pendingOwner.current; } };
    pendingOwner.current = "admin-b";

    const saved = await saveDraft(makeDraft({ id: "owner-draft" }));

    expect(runTransactionMock).toHaveBeenCalledOnce();
    expect(firebaseState.productDrafts.get(saved.id)).toMatchObject({
      sessionId: expect.any(String),
      revision: 1,
      createdBy: "admin-b",
      updatedBy: "admin-b",
    });
  });

  it("publishes authoritative draft data with one atomic transaction", async () => {
    const saved = await saveDraft(makeDraft({ id: "publish-draft" }));
    firebaseState.productDrafts.set(saved.id, {
      ...firebaseState.productDrafts.get(saved.id),
      name: "Authoritative Firestore Name",
    });
    transactionSetMock.mockClear();
    transactionDeleteMock.mockClear();

    await publishDraft(saved);

    expect(transactionSetMock).toHaveBeenCalledWith(
      { collection: "products", id: saved.id },
      expect.objectContaining({
        name: "Authoritative Firestore Name",
        revision: 1,
        createdBy: "admin-a",
        updatedBy: "admin-a",
      }),
    );
    expect(transactionDeleteMock).toHaveBeenCalledWith({ collection: "productDrafts", id: saved.id });
    expect(firebaseState.products.has(saved.id)).toBe(true);
    expect(firebaseState.productDrafts.has(saved.id)).toBe(false);
  });

  it("unpublishes by atomically creating a restore session and deleting the product", async () => {
    const product = makeProduct();
    const { id, ...record } = product;
    firebaseState.products.set(id, record as StoredRecord);

    const draft = await unpublishProduct(product);

    expect(draft).toMatchObject({
      id: "product-1",
      mode: "restore",
      revision: 1,
      sourceProductRevision: 4,
      sourceCreatedAt: product.createdAt,
      sourceCreatedBy: "admin-original",
    });
    expect(firebaseState.productDrafts.has(id)).toBe(true);
    expect(firebaseState.products.has(id)).toBe(false);
  });
});

describe("adapter contract", () => {
  it("returns null and preserves unsubscribe for an empty adapter", async () => {
    const unsubscribe = vi.fn();
    const adapter: ProductDraftRepositoryAdapter = {
      createId: () => "draft",
      createSessionId: () => "session",
      get: async () => null,
      subscribe: (onData) => {
        onData([]);
        return unsubscribe;
      },
      runTransaction: async () => {
        throw new Error("not used");
      },
    };
    const repository = createProductDraftRepository(adapter);
    const onData = vi.fn();

    await expect(repository.getDraft("missing")).resolves.toBeNull();
    expect(repository.subscribeDrafts(onData, vi.fn())).toBe(unsubscribe);
    expect(onData).toHaveBeenCalledWith([]);
  });
});
