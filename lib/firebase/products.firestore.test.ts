import { beforeEach, expect, it, vi } from "vitest";

const {
  collectionMock,
  addDocMock,
  docMock,
  getDocsMock,
  onSnapshotMock,
  productCollection,
  runTransactionMock,
  serverTimestampMock,
  transactionGetMock,
  transactionSetMock,
  unsubscribeMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  addDocMock: vi.fn(),
  docMock: vi.fn(),
  getDocsMock: vi.fn(),
  onSnapshotMock: vi.fn(),
  productCollection: { kind: "products-collection" },
  runTransactionMock: vi.fn(),
  serverTimestampMock: vi.fn(),
  transactionGetMock: vi.fn(),
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

import { getProducts, saveProduct, subscribeProducts } from "./products";

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
  docMock.mockReset().mockReturnValue({ kind: "existing-product" });
  getDocsMock.mockReset();
  onSnapshotMock.mockReset();
  unsubscribeMock.mockReset();
  addDocMock.mockReset().mockResolvedValue({ id: "created-product" });
  serverTimestampMock.mockReset().mockReturnValue({ marker: "server-time" });
  transactionGetMock.mockReset().mockResolvedValue({ exists: () => true, data: () => ({ revision: 4 }) });
  transactionSetMock.mockReset();
  runTransactionMock.mockReset().mockImplementation(async (_database, operation) => (
    operation({ get: transactionGetMock, set: transactionSetMock })
  ));
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

  await expect(saveProduct(baseProduct, "existing")).resolves.toBe("existing");
  expect(transactionSetMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ revision: 5, updatedBy: "admin-1" }),
    { merge: true },
  );
});
