import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ auth: {}, db: {} }));

import {
  ProductDraftConflictError,
  createProductDraftRepository,
  type ProductDraftRepositoryAdapter,
  type ProductDraftTransaction,
} from "./product-drafts";
import { createCsvDraft } from "../csv/products-csv";
import type { Product, ProductDraft } from "../products/types";

type StoredRecord = Record<string, unknown>;
type CollectionName = "drafts" | "products";

const clone = <T>(value: T): T => structuredClone(value);

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

type Pause = {
  reached: Promise<void>;
  release(): void;
};

type SharedState = {
  drafts: Map<string, StoredRecord>;
  products: Map<string, StoredRecord>;
  versions: Map<string, number>;
  currentOwnerId: string | null;
  nextId: number;
  nextSession: number;
  clock: number;
  startPauses: Array<{ reached(): void; gate: Promise<void> }>;
  commitPauses: Array<{ reached(): void; gate: Promise<void> }>;
  commitCount: number;
  retryCount: number;
};

const createState = (): SharedState => ({
  drafts: new Map(),
  products: new Map(),
  versions: new Map(),
  currentOwnerId: "admin-a",
  nextId: 1,
  nextSession: 1,
  clock: Date.parse("2026-08-11T00:00:00.000Z"),
  startPauses: [],
  commitPauses: [],
  commitCount: 0,
  retryCount: 0,
});

const pauseNext = (queue: SharedState["startPauses"]): Pause => {
  const reached = deferred<void>();
  const gate = deferred<void>();
  queue.push({ reached: () => reached.resolve(), gate: gate.promise });
  return { reached: reached.promise, release: () => gate.resolve() };
};

const keyOf = (collectionName: CollectionName, id: string): string => `${collectionName}/${id}`;

const documentOf = (id: string, value: StoredRecord | undefined) => (
  value ? { id, data: () => clone(value) } : null
);

const createSharedAdapter = (state: SharedState): ProductDraftRepositoryAdapter => {
  const read = (collectionName: CollectionName, id: string): StoredRecord | undefined => (
    state[collectionName].get(id)
  );

  const runTransaction = async <T>(
    operation: (transaction: ProductDraftTransaction) => Promise<T>,
  ): Promise<T> => {
    const startPause = state.startPauses.shift();
    const commitPause = state.commitPauses.shift();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt === 0 && startPause) {
        startPause.reached();
        await startPause.gate;
      }

      const readVersions = new Map<string, number>();
      const writes = new Map<string, StoredRecord | null>();
      const get = async (collectionName: CollectionName, id: string) => {
        const key = keyOf(collectionName, id);
        readVersions.set(key, state.versions.get(key) ?? 0);
        return documentOf(id, read(collectionName, id));
      };
      const set = (collectionName: CollectionName, id: string, value: StoredRecord) => {
        writes.set(keyOf(collectionName, id), clone(value));
      };
      const remove = (collectionName: CollectionName, id: string) => {
        writes.set(keyOf(collectionName, id), null);
      };
      const transaction: ProductDraftTransaction = {
        getDraft: (id) => get("drafts", id),
        getProduct: (id) => get("products", id),
        setDraft: (id, value) => set("drafts", id, value as StoredRecord),
        setProduct: (id, value) => set("products", id, value as StoredRecord),
        deleteDraft: (id) => remove("drafts", id),
        deleteProduct: (id) => remove("products", id),
        timestamp: () => new Date(state.clock += 1_000),
        ownerId: () => state.currentOwnerId,
      };

      const result = await operation(transaction);
      if (attempt === 0 && commitPause) {
        commitPause.reached();
        await commitPause.gate;
      }

      const conflicted = [...readVersions].some(([key, version]) => (state.versions.get(key) ?? 0) !== version);
      if (conflicted) {
        state.retryCount += 1;
        continue;
      }

      for (const [key, value] of writes) {
        const separator = key.indexOf("/");
        const collectionName = key.slice(0, separator) as CollectionName;
        const id = key.slice(separator + 1);
        if (value) state[collectionName].set(id, clone(value));
        else state[collectionName].delete(id);
        state.versions.set(key, (state.versions.get(key) ?? 0) + 1);
      }
      state.commitCount += 1;
      return result;
    }

    throw new Error("Transaction retry limit exceeded.");
  };

  return {
    createId: () => `draft-${state.nextId++}`,
    createSessionId: () => `session-${state.nextSession++}`,
    get: async (id) => documentOf(id, state.drafts.get(id)),
    subscribe(onData) {
      onData([...state.drafts].map(([id, value]) => documentOf(id, value)!));
      return () => undefined;
    },
    runTransaction,
  };
};

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

const purchaseOptions = [
  {
    id: "2-month",
    label: "2개월분",
    durationMonths: 2,
    sku: "OMEGA-2M",
    priceAdjustment: -14_000,
    stock: 4,
    active: true,
    isDefault: false,
  },
  {
    id: "4-month",
    label: "4개월분",
    durationMonths: 4,
    sku: "OMEGA-4M",
    priceAdjustment: 0,
    stock: 8,
    active: true,
    isDefault: true,
  },
];

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "product-1",
  ...productFields,
  revision: 7,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  createdBy: "admin-original",
  updatedBy: "admin-editor",
  ...overrides,
});

const makeCreateDraft = (overrides: Partial<ProductDraft> = {}): ProductDraft => ({
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

const seedProduct = (state: SharedState, product: Product): void => {
  const { id, ...record } = product;
  state.products.set(id, clone(record as StoredRecord));
  state.versions.set(keyOf("products", id), 1);
};

const productFromState = (state: SharedState, id: string): Product => {
  const value = state.products.get(id);
  if (!value) throw new Error(`Missing product ${id}`);
  return { id, ...clone(value) } as Product;
};

describe("product draft lifecycle transactions", () => {
  it("preserves CSV purchase options through draft save, reload, and publish", async () => {
    const state = createState();
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const csvDraft = repository.startDraftSession(createCsvDraft({
      ...productFields,
      purchaseOptions,
    }, "csv-options"));

    const saved = await repository.saveDraft(csvDraft);
    const reloaded = await repository.getDraft(saved.id);
    if (!reloaded) throw new Error("Expected the saved CSV draft.");

    expect(state.drafts.get(saved.id)).toMatchObject({ purchaseOptions });
    expect(reloaded.purchaseOptions).toEqual(purchaseOptions);
    await repository.publishDraft(reloaded);
    expect(state.products.get(saved.id)).toMatchObject({ purchaseOptions });
  });

  it("resets every copied explicit purchase-option stock while preserving option data", async () => {
    const state = createState();
    const product = makeProduct({
      purchaseOptions: [
        ...purchaseOptions,
        {
          id: "retired",
          label: "판매 종료 구성",
          durationMonths: 6,
          sku: "OMEGA-RETIRED",
          priceAdjustment: 7_000,
          stock: 21,
          active: false,
          isDefault: false,
        },
      ],
    });
    seedProduct(state, product);
    const repository = createProductDraftRepository(createSharedAdapter(state));

    const duplicate = await repository.duplicateProductToDraft(product);

    expect(duplicate.purchaseOptions).toEqual([
      {
        id: "2-month",
        label: "2개월분",
        durationMonths: 2,
        sku: "OMEGA-2M",
        priceAdjustment: -14_000,
        stock: 0,
        active: true,
        isDefault: false,
      },
      {
        id: "4-month",
        label: "4개월분",
        durationMonths: 4,
        sku: "OMEGA-4M",
        priceAdjustment: 0,
        stock: 0,
        active: true,
        isDefault: true,
      },
      {
        id: "retired",
        label: "판매 종료 구성",
        durationMonths: 6,
        sku: "OMEGA-RETIRED",
        priceAdjustment: 7_000,
        stock: 0,
        active: false,
        isDefault: false,
      },
    ]);
    expect(duplicate.media).toEqual(product.media);
    expect(state.drafts.get(duplicate.id)).toMatchObject({ purchaseOptions: duplicate.purchaseOptions });
  });

  it("preserves purchase option inventory for edit and unpublish drafts", async () => {
    const state = createState();
    const product = makeProduct({ purchaseOptions });
    seedProduct(state, product);
    const repository = createProductDraftRepository(createSharedAdapter(state));

    const edit = await repository.saveDraft(repository.createProductEditDraft(product));
    await repository.discardDraft(edit);
    const restore = await repository.unpublishProduct(product);

    expect(edit.purchaseOptions).toEqual(purchaseOptions);
    expect(restore.purchaseOptions).toEqual(purchaseOptions);
    expect(state.drafts.get(product.id)).toMatchObject({ purchaseOptions });
  });

  it("publishes an optioned duplicate with zero compatibility and option stock", async () => {
    const state = createState();
    const product = makeProduct({ purchaseOptions });
    seedProduct(state, product);
    const repository = createProductDraftRepository(createSharedAdapter(state));

    const duplicate = await repository.duplicateProductToDraft(product);
    await repository.publishDraft(duplicate);

    expect(state.products.get(duplicate.id)).toMatchObject({
      stock: 0,
      purchaseOptions: [
        expect.objectContaining({ id: "2-month", stock: 0 }),
        expect.objectContaining({ id: "4-month", stock: 0 }),
      ],
    });
  });

  it("reuses its committed local session for sequential saves of the original unsaved object", async () => {
    const state = createState();
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const localDraft = makeCreateDraft();

    await repository.saveDraft(localDraft);
    localDraft.name = "Second local snapshot";
    const second = await repository.saveDraft(localDraft);

    expect(second).toMatchObject({
      sessionId: "session-1",
      revision: 2,
      name: "Second local snapshot",
    });
    expect(state.drafts.get(localDraft.id)).toMatchObject({
      sessionId: "session-1",
      revision: 2,
      name: "Second local snapshot",
    });
  });

  it("publishes after the first save when the caller keeps the original local object", async () => {
    const state = createState();
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const localDraft = makeCreateDraft();

    await repository.saveDraft(localDraft);
    await repository.publishDraft(localDraft);

    expect(state.products.get(localDraft.id)).toMatchObject({ name: "Daily Omega", revision: 1 });
    expect(state.drafts.has(localDraft.id)).toBe(false);
  });

  it("discards after the first save when the caller keeps the original local object", async () => {
    const state = createState();
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const localDraft = makeCreateDraft();

    await repository.saveDraft(localDraft);
    await repository.discardDraft(localDraft);

    expect(state.drafts.has(localDraft.id)).toBe(false);
    expect(state.products.has(localDraft.id)).toBe(false);
  });

  it("keeps the retired local object tombstoned across an explicit same-ID session restart", async () => {
    const state = createState();
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const localDraft = makeCreateDraft();

    await repository.saveDraft(localDraft);
    await repository.discardDraft(localDraft);
    await expect(repository.saveDraft(localDraft)).rejects.toBeInstanceOf(ProductDraftConflictError);
    expect(state.drafts.has(localDraft.id)).toBe(false);

    const restarted = repository.startDraftSession({ ...localDraft, name: "Explicit restart" });
    expect(restarted).toMatchObject({ sessionId: "session-2", revision: 0 });
    await repository.saveDraft(restarted);
    await expect(repository.saveDraft(localDraft)).rejects.toBeInstanceOf(ProductDraftConflictError);
    expect(state.drafts.get(localDraft.id)).toMatchObject({
      sessionId: "session-2",
      revision: 1,
      name: "Explicit restart",
    });
  });

  it("does not retain a provisional local session when the first transaction fails", async () => {
    const state = createState();
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const localDraft = makeCreateDraft();
    state.currentOwnerId = null;

    await expect(repository.saveDraft(localDraft)).rejects.toThrow("authenticated admin");
    state.currentOwnerId = "admin-a";
    const saved = await repository.saveDraft(localDraft);

    expect(saved).toMatchObject({ sessionId: "session-2", revision: 1 });
    expect(state.drafts.get(localDraft.id)).toMatchObject({ sessionId: "session-2", revision: 1 });
  });

  it("creates a same-ID edit draft without removing its published product, then revision-checks updates", async () => {
    const state = createState();
    const product = makeProduct();
    seedProduct(state, product);
    const repository = createProductDraftRepository(createSharedAdapter(state));

    const first = await repository.saveDraft(repository.createProductEditDraft(product));
    const second = await repository.saveDraft({ ...first, name: "Edited Omega" });

    expect(first).toMatchObject({
      id: "product-1",
      mode: "edit",
      sessionId: "session-1",
      revision: 1,
      sourceProductRevision: 7,
    });
    expect(second).toMatchObject({ name: "Edited Omega", revision: 2, sessionId: "session-1" });
    expect(state.products.get("product-1")).toMatchObject({ name: "Daily Omega", revision: 7 });
    expect(state.drafts.get("product-1")).toMatchObject({ name: "Edited Omega", revision: 2 });
  });

  it("rejects the losing whole-snapshot autosave instead of overwriting a newer revision", async () => {
    const state = createState();
    const repositoryA = createProductDraftRepository(createSharedAdapter(state));
    const repositoryB = createProductDraftRepository(createSharedAdapter(state));
    const saved = await repositoryA.saveDraft(makeCreateDraft());
    const snapshotA = await repositoryA.getDraft(saved.id);
    const snapshotB = await repositoryB.getDraft(saved.id);
    if (!snapshotA || !snapshotB) throw new Error("Expected shared draft snapshots.");

    await repositoryA.saveDraft({ ...snapshotA, name: "Writer A" });
    await expect(repositoryB.saveDraft({ ...snapshotB, name: "Writer B" })).rejects.toBeInstanceOf(ProductDraftConflictError);

    expect(state.drafts.get(saved.id)).toMatchObject({ name: "Writer A", revision: 2 });
  });

  it("publishes the latest authoritative draft after its pending autosave commits", async () => {
    const state = createState();
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const saved = await repository.saveDraft(makeCreateDraft());
    const pause = pauseNext(state.commitPauses);

    const saving = repository.saveDraft({ ...saved, name: "Latest authoritative name" });
    await pause.reached;
    const publishing = repository.publishDraft(saved);
    pause.release();

    const latest = await saving;
    await publishing;
    expect(latest.revision).toBe(2);
    expect(state.products.get(saved.id)).toMatchObject({ name: "Latest authoritative name", revision: 1 });
    expect(state.drafts.has(saved.id)).toBe(false);
  });

  it("does not recreate a remotely discarded draft when a delayed autosave transaction retries", async () => {
    const state = createState();
    const repositoryA = createProductDraftRepository(createSharedAdapter(state));
    const repositoryB = createProductDraftRepository(createSharedAdapter(state));
    const saved = await repositoryA.saveDraft(makeCreateDraft());
    const stale = await repositoryB.getDraft(saved.id);
    if (!stale) throw new Error("Expected a stale draft snapshot.");
    const pause = pauseNext(state.commitPauses);

    const delayedSave = repositoryB.saveDraft({ ...stale, name: "Delayed write" });
    await pause.reached;
    await repositoryA.discardDraft(saved);
    pause.release();

    await expect(delayedSave).rejects.toBeInstanceOf(ProductDraftConflictError);
    expect(state.retryCount).toBeGreaterThan(0);
    expect(state.drafts.has(saved.id)).toBe(false);
    expect(state.products.has(saved.id)).toBe(false);
  });

  it("rejects a stale publish after another repository discards the session", async () => {
    const state = createState();
    const repositoryA = createProductDraftRepository(createSharedAdapter(state));
    const repositoryB = createProductDraftRepository(createSharedAdapter(state));
    const saved = await repositoryA.saveDraft(makeCreateDraft());
    const stale = await repositoryB.getDraft(saved.id);
    if (!stale) throw new Error("Expected a stale draft snapshot.");

    await repositoryA.discardDraft(saved);
    await expect(repositoryB.publishDraft(stale)).rejects.toBeInstanceOf(ProductDraftConflictError);
    expect(state.drafts.has(saved.id)).toBe(false);
    expect(state.products.has(saved.id)).toBe(false);
  });

  it("allows exactly one of two cross-repository publish attempts to commit", async () => {
    const state = createState();
    const repositoryA = createProductDraftRepository(createSharedAdapter(state));
    const repositoryB = createProductDraftRepository(createSharedAdapter(state));
    const saved = await repositoryA.saveDraft(makeCreateDraft());
    const snapshotB = await repositoryB.getDraft(saved.id);
    if (!snapshotB) throw new Error("Expected a second draft snapshot.");
    const pause = pauseNext(state.commitPauses);

    const publishA = repositoryA.publishDraft(saved);
    await pause.reached;
    const publishB = repositoryB.publishDraft(snapshotB);
    await publishB;
    pause.release();

    await expect(publishA).rejects.toBeInstanceOf(ProductDraftConflictError);
    expect(state.retryCount).toBeGreaterThan(0);
    expect(state.products.get(saved.id)).toMatchObject({ revision: 1 });
    expect(state.drafts.has(saved.id)).toBe(false);
  });

  it("rejects publishing an edit when the source product revision changed", async () => {
    const state = createState();
    const product = makeProduct();
    seedProduct(state, product);
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const draft = await repository.saveDraft(repository.createProductEditDraft(product));
    state.products.set(product.id, { ...state.products.get(product.id), name: "Other editor", revision: 8 });
    state.versions.set(keyOf("products", product.id), 2);

    await expect(repository.publishDraft(draft)).rejects.toBeInstanceOf(ProductDraftConflictError);
    expect(state.products.get(product.id)).toMatchObject({ name: "Other editor", revision: 8 });
    expect(state.drafts.has(product.id)).toBe(true);
  });

  it("never lets unpublish overwrite a same-ID edit draft", async () => {
    const state = createState();
    const product = makeProduct();
    seedProduct(state, product);
    const repositoryA = createProductDraftRepository(createSharedAdapter(state));
    const repositoryB = createProductDraftRepository(createSharedAdapter(state));
    await repositoryA.saveDraft(repositoryA.createProductEditDraft(product));

    await expect(repositoryB.unpublishProduct(product)).rejects.toBeInstanceOf(ProductDraftConflictError);
    expect(state.products.has(product.id)).toBe(true);
    expect(state.drafts.get(product.id)).toMatchObject({ mode: "edit" });
  });

  it("preserves original product lineage through edit publish, unpublish, and restore publish", async () => {
    const state = createState();
    const product = makeProduct();
    seedProduct(state, product);
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const edit = await repository.saveDraft(repository.createProductEditDraft(product));

    await repository.publishDraft({ ...edit, name: "Republished Omega" });
    const editedProduct = productFromState(state, product.id);
    expect(editedProduct).toMatchObject({
      name: "Daily Omega",
      revision: 8,
      createdAt: product.createdAt,
      createdBy: "admin-original",
      updatedBy: "admin-a",
    });

    const unpublished = await repository.unpublishProduct(editedProduct);
    expect(unpublished).toMatchObject({
      mode: "restore",
      sourceProductRevision: 8,
      sourceCreatedAt: product.createdAt,
      sourceCreatedBy: "admin-original",
    });
    await repository.publishDraft(unpublished);

    expect(state.products.get(product.id)).toMatchObject({
      revision: 9,
      createdAt: product.createdAt,
      createdBy: "admin-original",
      updatedBy: "admin-a",
    });
  });

  it("resolves the owner when each queued transaction starts and ignores spoofed owner arguments", async () => {
    const state = createState();
    const repository = createProductDraftRepository(createSharedAdapter(state));
    const saved = await (repository.saveDraft as unknown as (
      draft: ProductDraft,
      spoofedOwner: string,
    ) => Promise<ProductDraft>)(makeCreateDraft(), "spoofed-admin");
    expect(state.drafts.get(saved.id)).toMatchObject({ createdBy: "admin-a", updatedBy: "admin-a" });
    const pause = pauseNext(state.commitPauses);

    const firstSave = repository.saveDraft({ ...saved, name: "First queued snapshot" });
    await pause.reached;
    const secondSave = repository.saveDraft({ ...saved, name: "Second queued snapshot" });
    state.currentOwnerId = "admin-b";
    pause.release();

    await firstSave;
    const latest = await secondSave;
    expect(latest.revision).toBe(3);
    expect(state.drafts.get(saved.id)).toMatchObject({
      name: "Second queued snapshot",
      createdBy: "admin-a",
      updatedBy: "admin-b",
    });
  });
});
