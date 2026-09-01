import { describe, expect, it } from "vitest";

import { OrderLineUnavailableError, resolveOrderLines } from "./resolve-order-lines";
import type { Product } from "../products/types";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "omega-3",
  name: "오메가3",
  slug: "omega-3",
  category: "nutrition",
  concerns: [],
  price: 15_000,
  originalPrice: null,
  thumbnailUrl: "/omega-3.jpg",
  images: ["/omega-3.jpg"],
  media: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "한국",
  certifications: [],
  cautions: [],
  stock: 4,
  purchaseOptions: [{
    id: "discounted",
    label: "할인 구성",
    durationMonths: null,
    sku: "OMEGA-DISCOUNT",
    priceAdjustment: -5_000,
    stock: 4,
    active: true,
    isDefault: true,
  }],
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

describe("resolveOrderLines", () => {
  it("accepts a safe-integer base price with a signed safe-integer adjustment", () => {
    const lines = resolveOrderLines([
      { productId: "omega-3", purchaseOptionId: "discounted", quantity: 2 },
    ], [product()]);

    expect(lines).toEqual([expect.objectContaining({
      basePrice: 15_000,
      priceAdjustment: -5_000,
      unitPrice: 10_000,
      lineTotal: 20_000,
    })]);
  });

  it("rejects a fractional catalog base price", () => {
    expect(() => resolveOrderLines([
      { productId: "omega-3", purchaseOptionId: "discounted", quantity: 1 },
    ], [product({ price: 15_000.5 })])).toThrow(OrderLineUnavailableError);
  });
});
