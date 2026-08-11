import { beforeEach, expect, it, vi } from "vitest";

const {
  collectionMock,
  getDocsMock,
  onSnapshotMock,
  productCollection,
  unsubscribeMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  getDocsMock: vi.fn(),
  onSnapshotMock: vi.fn(),
  productCollection: { kind: "products-collection" },
  unsubscribeMock: vi.fn(),
}));

vi.mock("./client", () => ({ db: {}, auth: {} }));
vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: collectionMock,
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: getDocsMock,
  onSnapshot: onSnapshotMock,
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

import { getProducts, subscribeProducts } from "./products";

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
  ratingAverage: 0,
  reviewCount: 0,
};

const documents = [
  { id: "unranked", data: () => baseProduct },
  { id: "ranked", data: () => ({ ...baseProduct, name: "Ranked", salesRank: 1 }) },
];

beforeEach(() => {
  collectionMock.mockReset();
  getDocsMock.mockReset();
  onSnapshotMock.mockReset();
  unsubscribeMock.mockReset();
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
