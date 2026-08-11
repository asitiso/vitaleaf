import { describe, expect, it } from "vitest";

import { normalizeProduct } from "./normalize";

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
