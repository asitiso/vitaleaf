import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  batchCommitMock,
  batchDeleteMock,
  batchSetMock,
  collectionMock,
  deleteDocMock,
  docMock,
  getDocMock,
  onSnapshotMock,
  runTransactionMock,
  serverTimestampMock,
  setDocMock,
  transactionGetMock,
  transactionSetMock,
  writeBatchMock,
} = vi.hoisted(() => ({
  authMock: { currentUser: { uid: "admin-boundary" } as { uid: string } | null },
  batchCommitMock: vi.fn(),
  batchDeleteMock: vi.fn(),
  batchSetMock: vi.fn(),
  collectionMock: vi.fn(),
  deleteDocMock: vi.fn(),
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  onSnapshotMock: vi.fn(),
  runTransactionMock: vi.fn(),
  serverTimestampMock: vi.fn(),
  setDocMock: vi.fn(),
  transactionGetMock: vi.fn(),
  transactionSetMock: vi.fn(),
  writeBatchMock: vi.fn(),
}));

vi.mock("./client", () => ({ auth: authMock, db: { kind: "database" } }));
vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  deleteDoc: deleteDocMock,
  doc: docMock,
  getDoc: getDocMock,
  onSnapshot: onSnapshotMock,
  runTransaction: runTransactionMock,
  serverTimestamp: serverTimestampMock,
  setDoc: setDocMock,
  writeBatch: writeBatchMock,
}));

import {
  ProductDraftValidationError,
  createProductDraftRepository,
  publishDraft,
  saveDraft,
  unpublishProduct,
  type ProductDraftRepositoryAdapter,
} from "./product-drafts";
import type { Product, ProductDraft } from "../products/types";

const completeDraft = (overrides: Partial<ProductDraft> = {}): ProductDraft => ({
  id: "draft-1",
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
    storagePath: "products/draft-1/image.jpg",
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
  status: "draft",
  sourceProductId: null,
  currentStep: 1,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const publishedProduct = (overrides: Partial<Product> = {}): Product => {
  const draft = completeDraft();
  return {
    id: "product-1",
    name: draft.name,
    slug: draft.slug,
    category: draft.category,
    concerns: draft.concerns,
    price: draft.price,
    originalPrice: draft.originalPrice,
    thumbnailUrl: draft.thumbnailUrl,
    images: draft.images,
    media: draft.media,
    description: draft.description,
    benefits: draft.benefits,
    ingredients: draft.ingredients,
    dosage: draft.dosage,
    origin: draft.origin,
    certifications: draft.certifications,
    cautions: draft.cautions,
    stock: draft.stock,
    isBest: draft.isBest,
    isNew: draft.isNew,
    salesRank: draft.salesRank,
    ratingAverage: draft.ratingAverage,
    reviewCount: draft.reviewCount,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
};

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const createAdapter = (overrides: Partial<ProductDraftRepositoryAdapter> = {}): ProductDraftRepositoryAdapter => ({
  createId: () => "generated-draft",
  save: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn(() => vi.fn()),
  commitPublish: vi.fn().mockResolvedValue(undefined),
  commitUnpublish: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  timestamp: () => ({ marker: "server-time" }),
  ...overrides,
});

describe("createProductDraftRepository", () => {
  it("creates a stable id before media upload or draft saving begins", () => {
    const createId = vi.fn(() => "generated-draft");
    const repository = createProductDraftRepository(createAdapter({ createId }));

    expect(repository.createDraftId()).toBe("generated-draft");
    expect(createId).toHaveBeenCalledOnce();
  });

  it("saves an incomplete new draft with one server timestamp and owner metadata", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const timestamp = { marker: "server-time" };
    const timestampFactory = vi.fn(() => timestamp);
    const repository = createProductDraftRepository(createAdapter({ save, timestamp: timestampFactory }));
    const draft = completeDraft({ name: "", media: [], images: [], thumbnailUrl: "" });

    await repository.saveDraft(draft, "admin-1");

    expect(timestampFactory).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      name: "",
      media: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: "admin-1",
      updatedBy: "admin-1",
    }));
    expect(save.mock.calls[0]?.[1]).not.toHaveProperty("id");
  });

  it("preserves original creation metadata when saving a loaded draft", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repository = createProductDraftRepository(createAdapter({ save }));

    await repository.saveDraft(completeDraft({
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    }), "admin-2");

    const write = save.mock.calls[0]?.[1];
    expect(write).not.toHaveProperty("createdAt");
    expect(write).not.toHaveProperty("createdBy");
    expect(write).toMatchObject({ updatedBy: "admin-2" });
  });

  it("does not reset creation metadata on repeated autosaves of a locally new draft", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repository = createProductDraftRepository(createAdapter({ save }));
    const draft = completeDraft({ createdAt: null, updatedAt: null });

    await repository.saveDraft(draft, "admin-1");
    await repository.saveDraft({ ...draft, name: "Updated locally" }, "admin-1");

    expect(save.mock.calls[0]?.[1]).toMatchObject({ createdBy: "admin-1" });
    expect(save.mock.calls[1]?.[1]).not.toHaveProperty("createdAt");
    expect(save.mock.calls[1]?.[1]).not.toHaveProperty("createdBy");
  });

  it("loads and subscribes to incomplete drafts while normalizing timestamps and media", async () => {
    const timestamp = new Date("2026-02-03T04:05:06.000Z");
    const rawDraft: Record<string, unknown> = {
      ...completeDraft({ name: "", media: [] }),
      createdAt: { toDate: () => timestamp },
      updatedAt: { toDate: () => timestamp },
      thumbnailUrl: "legacy.jpg",
      images: ["legacy.jpg"],
    };
    delete rawDraft.id;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((onData: (documents: Array<{ id: string; data(): unknown }>) => void) => {
      onData([{ id: "draft-1", data: () => rawDraft }]);
      return unsubscribe;
    });
    const repository = createProductDraftRepository(createAdapter({
      get: vi.fn().mockResolvedValue({ id: "draft-1", data: () => rawDraft }),
      subscribe,
    }));
    const onData = vi.fn();

    await expect(repository.getDraft("draft-1")).resolves.toMatchObject({
      id: "draft-1",
      name: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      media: [expect.objectContaining({ url: "legacy.jpg" })],
    });
    expect(repository.subscribeDrafts(onData, vi.fn())).toBe(unsubscribe);
    expect(onData).toHaveBeenCalledWith([
      expect.objectContaining({ id: "draft-1", name: "", createdAt: timestamp }),
    ]);
  });

  it("rejects publish validation before any adapter write", async () => {
    const commitPublish = vi.fn();
    const repository = createProductDraftRepository(createAdapter({ commitPublish }));

    await expect(repository.publishDraft(completeDraft({ name: "" }))).rejects.toBeInstanceOf(ProductDraftValidationError);
    expect(commitPublish).not.toHaveBeenCalled();
  });

  it("waits for the latest save, publishes once on double-submit, and blocks a late save", async () => {
    const saveGate = deferred<void>();
    const publishGate = deferred<void>();
    const save = vi.fn(() => saveGate.promise);
    const commitPublish = vi.fn(() => publishGate.promise);
    const repository = createProductDraftRepository(createAdapter({ save, commitPublish }));
    const draft = completeDraft();

    const pendingSave = repository.saveDraft(draft, "admin-1");
    const firstPublish = repository.publishDraft(draft);
    const secondPublish = repository.publishDraft(draft);

    expect(commitPublish).not.toHaveBeenCalled();
    await expect(repository.saveDraft(draft, "admin-1")).rejects.toThrow("being published");

    saveGate.resolve();
    await pendingSave;
    await vi.waitFor(() => expect(commitPublish).toHaveBeenCalledOnce());
    expect(commitPublish).toHaveBeenCalledWith("draft-1", expect.objectContaining({ name: "Daily Omega" }));

    publishGate.resolve();
    await expect(Promise.all([firstPublish, secondPublish])).resolves.toEqual([undefined, undefined]);
  });

  it("keeps a failed atomic publish retryable", async () => {
    const commitPublish = vi.fn()
      .mockRejectedValueOnce(new Error("batch rejected"))
      .mockResolvedValueOnce(undefined);
    const repository = createProductDraftRepository(createAdapter({ commitPublish }));
    const draft = completeDraft();

    await expect(repository.publishDraft(draft)).rejects.toThrow("batch rejected");
    await expect(repository.publishDraft(draft)).resolves.toBeUndefined();
    expect(commitPublish).toHaveBeenCalledTimes(2);
  });

  it("duplicates as a zero-stock draft without social proof", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const repository = createProductDraftRepository(createAdapter({ save }));
    const source = publishedProduct();

    const copy = await repository.duplicateProductToDraft(source, "admin-1");

    expect(copy).toMatchObject({
      id: "generated-draft",
      name: "Daily Omega (복사본)",
      stock: 0,
      ratingAverage: 0,
      reviewCount: 0,
      salesRank: null,
      status: "published-copy",
      sourceProductId: "product-1",
    });
    expect(copy.media).not.toBe(source.media);
    expect(save).toHaveBeenCalledWith("generated-draft", expect.objectContaining({
      stock: 0,
      ratingAverage: 0,
      reviewCount: 0,
      salesRank: null,
      createdBy: "admin-1",
    }));
  });

  it("unpublishes by atomically writing its same-id draft and removing the product", async () => {
    const commitUnpublish = vi.fn().mockResolvedValue(undefined);
    const repository = createProductDraftRepository(createAdapter({ commitUnpublish }));

    const draft = await repository.unpublishProduct(publishedProduct(), "admin-1");

    expect(draft).toMatchObject({ id: "product-1", status: "draft", sourceProductId: "product-1" });
    expect(commitUnpublish).toHaveBeenCalledWith("product-1", expect.objectContaining({
      name: "Daily Omega",
      createdBy: "admin-1",
      updatedBy: "admin-1",
    }));
  });

  it("discards a draft only after its pending save settles", async () => {
    const saveGate = deferred<void>();
    const remove = vi.fn().mockResolvedValue(undefined);
    const repository = createProductDraftRepository(createAdapter({
      save: vi.fn(() => saveGate.promise),
      delete: remove,
    }));
    const draft = completeDraft();

    const saving = repository.saveDraft(draft, "admin-1");
    const discarding = repository.discardDraft(draft.id);
    expect(remove).not.toHaveBeenCalled();

    saveGate.resolve();
    await saving;
    await discarding;
    expect(remove).toHaveBeenCalledWith("draft-1");
  });

  it("does not publish while the same draft is being discarded", async () => {
    const deleteGate = deferred<void>();
    const commitPublish = vi.fn().mockResolvedValue(undefined);
    const repository = createProductDraftRepository(createAdapter({
      delete: vi.fn(() => deleteGate.promise),
      commitPublish,
    }));
    const draft = completeDraft();

    const discarding = repository.discardDraft(draft.id);
    await expect(repository.publishDraft(draft)).rejects.toThrow("being discarded");
    expect(commitPublish).not.toHaveBeenCalled();

    deleteGate.resolve();
    await discarding;
  });
});

describe("Firebase product draft boundary", () => {
  beforeEach(() => {
    authMock.currentUser = { uid: "admin-boundary" };
    batchCommitMock.mockReset().mockResolvedValue(undefined);
    batchDeleteMock.mockReset();
    batchSetMock.mockReset();
    collectionMock.mockReset().mockImplementation((_database, name: string) => ({ kind: "collection", name }));
    deleteDocMock.mockReset();
    docMock.mockReset().mockImplementation((first: { kind?: string; name?: string }, second?: string, third?: string) => {
      if (first.kind === "collection" && second === undefined) return { kind: "document", collection: first.name, id: "generated" };
      return { kind: "document", collection: second, id: third };
    });
    getDocMock.mockReset();
    onSnapshotMock.mockReset();
    transactionGetMock.mockReset().mockResolvedValue({ exists: () => false });
    transactionSetMock.mockReset();
    runTransactionMock.mockReset().mockImplementation(async (_database, update) => (
      update({ get: transactionGetMock, set: transactionSetMock })
    ));
    serverTimestampMock.mockReset().mockReturnValue({ marker: "firebase-server-time" });
    setDocMock.mockReset();
    writeBatchMock.mockReset().mockReturnValue({
      set: batchSetMock,
      delete: batchDeleteMock,
      commit: batchCommitMock,
    });
  });

  it("publishes with one batch, server metadata, and removal of the completed draft", async () => {
    await publishDraft(completeDraft({ id: "boundary-draft" }));

    expect(batchSetMock).toHaveBeenCalledWith(
      { kind: "document", collection: "products", id: "boundary-draft" },
      expect.objectContaining({
        name: "Daily Omega",
        createdAt: { marker: "firebase-server-time" },
        updatedAt: { marker: "firebase-server-time" },
        createdBy: "admin-boundary",
        updatedBy: "admin-boundary",
      }),
    );
    expect(batchDeleteMock).toHaveBeenCalledWith({
      kind: "document",
      collection: "productDrafts",
      id: "boundary-draft",
    });
    expect(batchCommitMock).toHaveBeenCalledOnce();
  });

  it("guards a late autosave transaction against an already-published same-id product", async () => {
    await saveDraft(completeDraft({ id: "guarded-draft" }));

    expect(runTransactionMock).toHaveBeenCalledOnce();
    expect(transactionGetMock).toHaveBeenCalledWith({
      kind: "document",
      collection: "products",
      id: "guarded-draft",
    });
    expect(transactionGetMock).toHaveBeenCalledWith({
      kind: "document",
      collection: "productDrafts",
      id: "guarded-draft",
    });
    expect(transactionSetMock).toHaveBeenCalledWith(
      { kind: "document", collection: "productDrafts", id: "guarded-draft" },
      expect.objectContaining({ name: "Daily Omega", updatedBy: "admin-boundary" }),
      { merge: true },
    );
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("rejects autosave when another client has already published the product", async () => {
    transactionGetMock.mockImplementation(async (reference: { collection: string }) => ({
      exists: () => reference.collection === "products",
    }));

    await expect(saveDraft(completeDraft({ id: "published-elsewhere" }))).rejects.toThrow("already published");
    expect(transactionSetMock).not.toHaveBeenCalled();
  });

  it("rejects an update when another client has discarded its existing draft", async () => {
    const draft = completeDraft({ id: "discarded-elsewhere" });
    await saveDraft(draft);
    transactionGetMock.mockClear();
    transactionSetMock.mockClear();

    await expect(saveDraft({ ...draft, name: "Late autosave" })).rejects.toThrow("no longer exists");
    expect(transactionSetMock).not.toHaveBeenCalled();
  });

  it("unpublishes with one batch that creates the draft before removing the public product", async () => {
    await unpublishProduct(publishedProduct({ id: "boundary-product" }));

    expect(batchSetMock).toHaveBeenCalledWith(
      { kind: "document", collection: "productDrafts", id: "boundary-product" },
      expect.objectContaining({
        name: "Daily Omega",
        status: "draft",
        sourceProductId: "boundary-product",
        createdAt: { marker: "firebase-server-time" },
        updatedAt: { marker: "firebase-server-time" },
        createdBy: "admin-boundary",
        updatedBy: "admin-boundary",
      }),
    );
    expect(batchDeleteMock).toHaveBeenCalledWith({
      kind: "document",
      collection: "products",
      id: "boundary-product",
    });
    expect(batchCommitMock).toHaveBeenCalledOnce();
  });
});
