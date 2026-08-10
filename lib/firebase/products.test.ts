import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ db: {}, auth: {} }));

import { createProductRepository } from "./products";

const product = {
  name: "Daily Omega",
  slug: "daily-omega",
  category: "heart",
  concerns: ["circulation"],
  price: 28000,
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
  isBest: true,
  isNew: false,
  salesRank: 2,
  ratingAverage: 4.8,
  reviewCount: 31,
};

describe("createProductRepository", () => {
  it("returns normalized products in sales-rank order and preserves an empty collection", async () => {
    const repository = createProductRepository({
      list: async () => [
        { id: "later", data: () => ({ ...product, name: "Later", salesRank: 8 }) },
        { id: "first", data: () => product },
      ],
    });

    await expect(repository.getProducts()).resolves.toMatchObject([
      { id: "first", name: "Daily Omega", salesRank: 2 },
      { id: "later", name: "Later", salesRank: 8 },
    ]);

    const emptyRepository = createProductRepository({ list: async () => [] });
    await expect(emptyRepository.getProducts()).resolves.toEqual([]);
  });

  it("normalizes an individual product and reports a missing document as null", async () => {
    const repository = createProductRepository({
      list: async () => [],
      get: async (id) => (id === "omega" ? { id, data: () => product } : null),
    });

    await expect(repository.getProduct("omega")).resolves.toMatchObject({ id: "omega", name: "Daily Omega" });
    await expect(repository.getProduct("missing")).resolves.toBeNull();
  });

  it("passes normalized subscription data to its consumer and retains the unsubscribe handle", () => {
    const unsubscribe = vi.fn();
    const onData = vi.fn();
    const repository = createProductRepository({
      list: async () => [],
      subscribe: (next) => {
        next([{ id: "omega", data: () => product }]);
        return unsubscribe;
      },
    });

    expect(repository.subscribeProducts(onData, vi.fn())).toBe(unsubscribe);
    expect(onData).toHaveBeenCalledWith([expect.objectContaining({ id: "omega", name: "Daily Omega" })]);
  });

  it("writes created and updated timestamps for a new product and returns its id", async () => {
    const save = vi.fn().mockResolvedValue("new-product");
    const timestamp = { marker: "server-timestamp" };
    const repository = createProductRepository({
      list: async () => [],
      save,
      timestamp: () => timestamp,
    });

    await expect(repository.saveProduct(product)).resolves.toBe("new-product");
    expect(save).toHaveBeenCalledWith(undefined, {
      ...product,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
});
