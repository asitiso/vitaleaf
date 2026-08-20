import { beforeEach, expect, it, vi } from "vitest";

const {
  collectionMock,
  addDocMock,
  docMock,
  getDocsMock,
  onSnapshotMock,
  productState,
  productCollection,
  runTransactionMock,
  serverTimestampMock,
  transactionGetMock,
  transactionDeleteMock,
  transactionSetMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  addDocMock: vi.fn(),
  docMock: vi.fn(),
  getDocsMock: vi.fn(),
  onSnapshotMock: vi.fn(),
  productState: { value: {} as Record<string, unknown> },
  productCollection: { kind: "products-collection" },
  runTransactionMock: vi.fn(),
  serverTimestampMock: vi.fn(),
  transactionGetMock: vi.fn(),
  transactionDeleteMock: vi.fn(),
  transactionSetMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}));

vi.mock("./client", () => ({ db: {}, auth: { currentUser: { uid: "admin-1" } } }));
vi.mock("firebase/firestore", () => ({
  addDoc: addDocMock,
  collection: collectionMock,
  deleteDoc: vi.fn(),
  doc: docMock,
  getDoc: vi.fn(),
  getDocs: getDocsMock,
  onSnapshot: onSnapshotMock,
  runTransaction: runTransactionMock,
  serverTimestamp: serverTimestampMock,
  setDoc: vi.fn(),
}));

import {
  ProductRevisionConflictError,
  deleteProduct,
  getProducts,
  saveProduct,
  subscribeProducts,
  type ProductDeleteTarget,
  type ProductUpdateTarget,
} from "./products";

const baseProduct = {
  name: "Daily Omega",
  slug: "daily-omega",
  category: "heart",
  concerns: ["circulation"],
  price: 28_000,
  originalPrice: null,
  thumbnailUrl: "https://example.com/omega.jpg",
  images: [],
  description: "Omega-3 supplement",
  benefits: ["Supports heart health"],
  ingredients: [],
  dosage: "Once daily",
  origin: "Korea",
  certifications: [],
  cautions: [],
  stock: 12,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
};

const documents = [
  { id: "unranked", data: () => baseProduct },
  { id: "ranked", data: () => ({ ...baseProduct, name: "Ranked", salesRank: 1 }) },
];

beforeEach(() => {
  collectionMock.mockReset();
  docMock.mockReset().mockImplementation((_database, collectionName: string) => ({
    kind: collectionName === "productDrafts" ? "existing-draft" : "existing-product",
  }));
  getDocsMock.mockReset();
  onSnapshotMock.mockReset();
  unsubscribeMock.mockReset();
  addDocMock.mockReset().mockResolvedValue({ id: "created-product" });
  serverTimestampMock.mockReset().mockReturnValue({ marker: "server-time" });
  productState.value = { revision: 4, name: "Daily Omega", stock: 12 };
  transactionGetMock.mockReset().mockImplementation(async (reference: { kind: string }) => (
    reference.kind === "existing-draft"
      ? { exists: () => false, data: () => undefined }
      : { exists: () => true, data: () => structuredClone(productState.value) }
  ));
  transactionDeleteMock.mockReset();
  transactionSetMock.mockReset();
  runTransactionMock.mockReset().mockImplementation(async (_database, operation) => {
    let nextValue: Record<string, unknown> | null = null;
    const result = await operation({
      get: transactionGetMock,
      delete: transactionDeleteMock,
      set: (reference: unknown, value: Record<string, unknown>, options: unknown) => {
        transactionSetMock(reference, value, options);
        nextValue = { ...productState.value, ...structuredClone(value) };
      },
    });
    if (nextValue) productState.value = nextValue;
    return result;
  });
  collectionMock.mockReturnValue(productCollection);
});

it("loads the whole products collection and retains documents without salesRank", async () => {
  getDocsMock.mockResolvedValue({ docs: documents });

  await expect(getProducts()).resolves.toMatchObject([
    { id: "ranked", salesRank: 1 },
    { id: "unranked", salesRank: null },
  ]);
  expect(getDocsMock).toHaveBeenCalledWith(productCollection);
});

it("subscribes to the whole products collection and sorts locally", () => {
  const onData = vi.fn();
  onSnapshotMock.mockImplementation((reference, next) => {
    expect(reference).toBe(productCollection);
    next({ docs: documents });
    return unsubscribeMock;
  });

  expect(subscribeProducts(onData, vi.fn())).toBe(unsubscribeMock);
  expect(onData).toHaveBeenCalledWith([
    expect.objectContaining({ id: "ranked", salesRank: 1 }),
    expect.objectContaining({ id: "unranked", salesRank: null }),
  ]);
});

it("adds owner metadata and revision checks to direct admin product writes", async () => {
  await expect(saveProduct(baseProduct)).resolves.toBe("created-product");
  expect(addDocMock).toHaveBeenCalledWith(productCollection, expect.objectContaining({
    revision: 1,
    createdBy: "admin-1",
    updatedBy: "admin-1",
  }));

  await expect(saveProduct(baseProduct, { id: "existing", expectedRevision: 4 })).resolves.toBe("existing");
  expect(transactionSetMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ revision: 5, updatedBy: "admin-1" }),
    { merge: true },
  );
});

it("rejects a stale whole-product update instead of overwriting a newer revision", async () => {
  await expect(saveProduct(
    { ...baseProduct, name: "Writer A" },
    { id: "existing", expectedRevision: 4 },
  )).resolves.toBe("existing");

  await expect(saveProduct(
    { ...baseProduct, stock: 0 },
    { id: "existing", expectedRevision: 4 },
  )).rejects.toThrow("changed in another session");

  expect(productState.value).toMatchObject({ name: "Writer A", stock: 12, revision: 5 });
});

it("atomically rejects direct stock updates and deletion when a same-id draft exists", async () => {
  docMock.mockImplementation((_database, collectionName: string) => ({
    kind: collectionName === "productDrafts" ? "existing-draft" : "existing-product",
  }));
  transactionGetMock.mockImplementation(async (reference: { kind: string }) => (
    reference.kind === "existing-draft"
      ? { exists: () => true, data: () => ({ mode: "edit" }) }
      : { exists: () => true, data: () => structuredClone(productState.value) }
  ));

  await expect(saveProduct(
    { ...baseProduct, stock: 0 },
    { id: "existing", expectedRevision: 4 },
  )).rejects.toThrow("same-id edit draft");
  await expect(deleteProduct({ id: "existing", expectedRevision: 4 }))
    .rejects.toThrow("same-id edit draft");

  expect(transactionSetMock).not.toHaveBeenCalled();
  expect(transactionDeleteMock).not.toHaveBeenCalled();
  expect(productState.value).toMatchObject({ stock: 12, revision: 4 });
});

it("rejects an update target that omits its expected revision before starting a transaction", async () => {
  const error = await saveProduct(
    baseProduct,
    { id: "existing" } as ProductUpdateTarget,
  ).catch((reason: unknown) => reason);

  expect(error).toBeInstanceOf(ProductRevisionConflictError);
  expect(error).toMatchObject({ message: "Product updates require a valid id and expected revision." });
  expect(runTransactionMock).not.toHaveBeenCalled();
});

it("rejects a stale published-product deletion and leaves the newer product intact", async () => {
  productState.value = { revision: 5, name: "Newer writer", stock: 7 };

  await expect(deleteProduct({ id: "existing", expectedRevision: 4 }))
    .rejects.toThrow("changed in another session");

  expect(transactionDeleteMock).not.toHaveBeenCalled();
  expect(productState.value).toEqual({ revision: 5, name: "Newer writer", stock: 7 });
});

it("deletes a published product exactly once when its rendered revision is current", async () => {
  await expect(deleteProduct({ id: "existing", expectedRevision: 4 })).resolves.toBeUndefined();

  expect(transactionDeleteMock).toHaveBeenCalledTimes(1);
  expect(transactionDeleteMock).toHaveBeenCalledWith({ kind: "existing-product" });
});

it("rejects a deletion target without an expected revision before starting a transaction", async () => {
  const error = await deleteProduct({ id: "existing" } as ProductDeleteTarget)
    .catch((reason: unknown) => reason);

  expect(error).toBeInstanceOf(ProductRevisionConflictError);
  expect(error).toMatchObject({ message: "Product deletions require a valid id and expected revision." });
  expect(runTransactionMock).not.toHaveBeenCalled();
});
