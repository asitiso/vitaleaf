import { describe, expect, it } from "vitest";

import { filterProducts } from "./filter-products";
import type { Product, ProductFilters } from "./types";

const defaultFilters: ProductFilters = {
  query: "",
  category: "",
  concern: "",
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  sort: "popular",
};

const makeProduct = (overrides: Partial<Product>): Product => ({
  id: "product",
  name: "기본 상품",
  slug: "product",
  category: "기타",
  concerns: [],
  price: 10_000,
  originalPrice: null,
  thumbnailUrl: "",
  images: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 1,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const products = [
  makeProduct({
    id: "omega",
    name: "데일리 오메가3",
    category: "혈행 건강",
    concerns: ["혈행", "기억력"],
    price: 35_000,
    benefits: ["혈행 개선에 도움"],
    ingredients: [{ name: "EPA 및 DHA", amount: "600mg", dailyValue: "" }],
    salesRank: 2,
    reviewCount: 31,
    createdAt: new Date("2026-08-03T00:00:00.000Z"),
  }),
  makeProduct({
    id: "probiotic",
    name: "장 건강 유산균",
    category: "유산균",
    concerns: ["장 건강"],
    price: 25_000,
    ingredients: [{ name: "락토바실러스", amount: "100억 CFU", dailyValue: "" }],
    salesRank: 1,
    reviewCount: 12,
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
  }),
  makeProduct({
    id: "vitamin",
    name: "비타민C",
    category: "비타민",
    concerns: ["면역"],
    price: 15_000,
    benefits: ["항산화에 도움"],
    stock: 0,
    salesRank: 3,
    reviewCount: 45,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  }),
];

describe("filterProducts", () => {
  it.each([
    ["name query", { query: "  오메가  " }, ["omega"]],
    ["benefit query", { query: "혈행" }, ["omega"]],
    ["ingredient query", { query: "락토바실러스" }, ["probiotic"]],
    ["category and stock", { category: "유산균", inStockOnly: true }, ["probiotic"]],
    ["concern and inclusive price range", { concern: "장 건강", minPrice: 25_000, maxPrice: 25_000 }, ["probiotic"]],
    ["price ascending", { sort: "price-asc" }, ["vitamin", "probiotic", "omega"]],
  ] as const)("returns matching products for %s", (_name, partial, expectedIds) => {
    const result = filterProducts(products, { ...defaultFilters, ...partial });

    expect(result.map((product) => product.id)).toEqual(expectedIds);
  });

  it("sorts popular products by sales rank, review count, then name", () => {
    const result = filterProducts(
      [
        makeProduct({ id: "later-name", name: "나", salesRank: 1, reviewCount: 10 }),
        makeProduct({ id: "higher-reviews", name: "다", salesRank: 1, reviewCount: 20 }),
        makeProduct({ id: "first-name", name: "가", salesRank: 1, reviewCount: 10 }),
        makeProduct({ id: "unranked", name: "라", salesRank: null, reviewCount: 99 }),
      ],
      defaultFilters,
    );

    expect(result.map((product) => product.id)).toEqual(["higher-reviews", "first-name", "later-name", "unranked"]);
  });

  it("keeps equal sort values in their input order without mutating the input", () => {
    const input = [
      makeProduct({ id: "first", name: "첫째", price: 20_000, createdAt: new Date("2026-08-04T00:00:00.000Z") }),
      makeProduct({ id: "second", name: "둘째", price: 20_000, createdAt: new Date("2026-08-04T00:00:00.000Z") }),
    ];

    const result = filterProducts(input, { ...defaultFilters, sort: "price-desc" });

    expect(result.map((product) => product.id)).toEqual(["first", "second"]);
    expect(input.map((product) => product.id)).toEqual(["first", "second"]);
    expect(result).not.toBe(input);
  });

  it("sorts newest products by descending creation time and leaves missing dates last", () => {
    const result = filterProducts(
      [
        makeProduct({ id: "undated", createdAt: null }),
        makeProduct({ id: "older", createdAt: new Date("2026-08-01T00:00:00.000Z") }),
        makeProduct({ id: "newer", createdAt: new Date("2026-08-02T00:00:00.000Z") }),
      ],
      { ...defaultFilters, sort: "newest" },
    );

    expect(result.map((product) => product.id)).toEqual(["newer", "older", "undated"]);
  });
});
