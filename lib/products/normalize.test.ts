import { describe, expect, it } from "vitest";

import { normalizeProduct } from "./normalize";
import { getProductAvailableStock } from "./purchase-options";

describe("normalizeProduct", () => {
  it("normalizes missing arrays and timestamps without hiding invalid required fields", () => {
    expect(() => normalizeProduct("p1", { price: 1000 })).toThrow(
      "상품명이 필요합니다",
    );

    const product = normalizeProduct("p1", {
      name: "루테인",
      category: "눈 건강",
      price: 28000,
      stock: 3,
    });

    expect(product.images).toEqual([]);
    expect(product.originalPrice).toBeNull();
    expect(product.createdAt).toBeNull();
    expect(product.updatedAt).toBeNull();
  });

  it("rejects invalid price and stock values", () => {
    const requiredFields = { name: "루테인", price: 28000, stock: 3 };

    expect(() => normalizeProduct("p1", { ...requiredFields, price: -1 })).toThrow(
      "가격은 0 이상의 유한한 숫자여야 합니다",
    );
    expect(() => normalizeProduct("p1", { ...requiredFields, price: Infinity })).toThrow(
      "가격은 0 이상의 유한한 숫자여야 합니다",
    );
    expect(() => normalizeProduct("p1", { ...requiredFields, stock: -1 })).toThrow(
      "재고는 0 이상의 숫자여야 합니다",
    );
  });

  it("keeps zero KRW prices but rejects fractional and unsafe base prices", () => {
    const requiredFields = { name: "루테인", stock: 3 };

    expect(normalizeProduct("zero-price", { ...requiredFields, price: 0 }).price).toBe(0);
    expect(() => normalizeProduct("fractional-price", { ...requiredFields, price: 10_000.5 })).toThrow();
    expect(() => normalizeProduct("unsafe-price", {
      ...requiredFields,
      price: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow();
  });

  it("drops fractional and unsafe original KRW prices while retaining zero", () => {
    const requiredFields = { name: "루테인", price: 28_000, stock: 3 };

    expect(normalizeProduct("zero-original", { ...requiredFields, originalPrice: 0 }).originalPrice).toBe(0);
    expect(normalizeProduct("fractional-original", {
      ...requiredFields,
      originalPrice: 30_000.5,
    }).originalPrice).toBeNull();
    expect(normalizeProduct("unsafe-original", {
      ...requiredFields,
      originalPrice: Number.MAX_SAFE_INTEGER + 1,
    }).originalPrice).toBeNull();
  });

  it("defaults optional collections and flags, clamps ratings, and reads Firestore timestamps", () => {
    const createdAt = new Date("2026-08-10T00:00:00.000Z");
    const updatedAt = new Date("2026-08-11T00:00:00.000Z");

    const product = normalizeProduct("p1", {
      name: "오메가3",
      price: 35000,
      stock: 10,
      concerns: "혈행",
      images: null,
      benefits: {},
      ingredients: "EPA",
      certifications: undefined,
      cautions: 1,
      isBest: "true",
      isNew: 1,
      ratingAverage: 7,
      createdAt: { toDate: () => createdAt },
      updatedAt: { toDate: () => updatedAt },
    });

    expect(product.concerns).toEqual([]);
    expect(product.images).toEqual([]);
    expect(product.benefits).toEqual([]);
    expect(product.ingredients).toEqual([]);
    expect(product.certifications).toEqual([]);
    expect(product.cautions).toEqual([]);
    expect(product.isBest).toBe(false);
    expect(product.isNew).toBe(false);
    expect(product.ratingAverage).toBe(5);
    expect(product.createdAt).toBe(createdAt);
    expect(product.updatedAt).toBe(updatedAt);
  });

  it("normalizes product purchase options and synchronizes compatibility stock", () => {
    const product = normalizeProduct("options", {
      name: "옵션 상품",
      price: 80_000,
      stock: 999,
      purchaseOptions: [
        {
          id: "two-month",
          label: "2개월분",
          durationMonths: 2,
          sku: "VITA-2M",
          priceAdjustment: -35_000,
          stock: 12,
          active: true,
          isDefault: false,
        },
        {
          id: "four-month",
          label: "4개월분",
          durationMonths: 4,
          sku: "VITA-4M",
          priceAdjustment: 0,
          stock: 20,
          active: true,
          isDefault: true,
        },
      ],
    });

    expect(product.purchaseOptions).toHaveLength(2);
    expect(product.stock).toBe(32);
  });

  it("gives option-less products the implicit default option", () => {
    const product = normalizeProduct("legacy-optionless", {
      name: "기존 상품",
      price: 24_900,
      stock: 8,
    });

    expect(product.purchaseOptions).toEqual([
      expect.objectContaining({ id: "default", stock: 8, active: true, isDefault: true }),
    ]);
    expect(getProductAvailableStock(product)).toBe(8);
  });

  it("normalizes only supported age targets", () => {
    const product = normalizeProduct("p1", {
      name: "Age target product",
      price: 10_000,
      stock: 1,
      ageTargets: ["어린이", "20", "unknown", "20"],
    });

    expect(product.ageTargets).toEqual(["child", "20"]);
  });

  it("drops malformed or blank-name ingredients and trims valid names", () => {
    const product = normalizeProduct("ingredients", {
      name: "Ingredient product",
      price: 10_000,
      stock: 1,
      ingredients: [null, "EPA", {}, { name: "   " }, { name: " EPA ", amount: "600mg" }],
    });

    expect(product.ingredients).toEqual([{ name: "EPA", amount: "600mg", dailyValue: "" }]);
  });

  it("normalizes legacy image fields into ordered media", () => {
    const product = normalizeProduct("legacy", {
      name: "Legacy product",
      category: "supplements",
      price: 10_000,
      stock: 3,
      thumbnailUrl: "a.jpg",
      images: ["b.jpg"],
    });

    expect(product.media).toEqual([
      { url: "a.jpg", storagePath: null, alt: "상품 대표 이미지", order: 0 },
      { url: "b.jpg", storagePath: null, alt: "상품 상세 이미지 2", order: 1 },
    ]);
  });

  it("renumbers legacy fallback media after duplicate URLs are removed", () => {
    const product = normalizeProduct("legacy-duplicates", {
      name: "Legacy product",
      category: "supplements",
      price: 10_000,
      stock: 3,
      thumbnailUrl: "a.jpg",
      images: ["a.jpg", "b.jpg", "b.jpg", "c.jpg"],
    });

    expect(product.media).toEqual([
      { url: "a.jpg", storagePath: null, alt: "상품 대표 이미지", order: 0 },
      { url: "b.jpg", storagePath: null, alt: "상품 상세 이미지 2", order: 1 },
      { url: "c.jpg", storagePath: null, alt: "상품 상세 이미지 3", order: 2 },
    ]);
  });

  it("prefers deduplicated standard media ordered by its order field", () => {
    const product = normalizeProduct("standard", {
      name: "Standard product",
      category: "supplements",
      price: 10_000,
      stock: 3,
      thumbnailUrl: "legacy.jpg",
      images: ["legacy-detail.jpg"],
      media: [
        { url: "second.jpg", storagePath: "products/second.jpg", alt: "Second", order: 2 },
        { url: "first.jpg", storagePath: null, alt: "First", order: 1 },
        { url: "first.jpg", storagePath: "ignored", alt: "Duplicate", order: 0 },
      ],
    });

    expect(product.media).toEqual([
      { url: "first.jpg", storagePath: null, alt: "First", order: 1 },
      { url: "second.jpg", storagePath: "products/second.jpg", alt: "Second", order: 2 },
    ]);
  });

  it("derives legacy image fields from canonical media when legacy fields are absent", () => {
    const product = normalizeProduct("media-only", {
      name: "Media only product",
      category: "supplements",
      price: 10_000,
      stock: 3,
      media: [
        { url: "detail.jpg", storagePath: null, alt: "Detail", order: 2 },
        { url: "main.jpg", storagePath: null, alt: "Main", order: 1 },
      ],
    });

    expect(product.thumbnailUrl).toBe("main.jpg");
    expect(product.images).toEqual(["main.jpg", "detail.jpg"]);
  });

  it("uses canonical media instead of conflicting legacy image fields", () => {
    const product = normalizeProduct("media-conflict", {
      name: "Conflicting product",
      category: "supplements",
      price: 10_000,
      stock: 3,
      thumbnailUrl: "outdated-main.jpg",
      images: ["outdated-detail.jpg"],
      media: [{ url: "current-main.jpg", storagePath: null, alt: "Main", order: 0 }],
    });

    expect(product.thumbnailUrl).toBe("current-main.jpg");
    expect(product.images).toEqual(["current-main.jpg"]);
  });
});
