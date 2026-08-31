import { describe, expect, it } from "vitest";

import { calculateCart, cartLineId, clampQuantity, normalizeStoredCart } from "./cart-utils";
import type { CartLine } from "./cart-types";

const line: CartLine = {
  lineId: '["omega-3","default"]',
  productId: "omega-3",
  purchaseOptionId: "default",
  purchaseOptionLabel: "기본 구성",
  sku: "",
  name: "오메가3",
  thumbnailUrl: "/omega-3.jpg",
  unitPrice: 16_000,
  stock: 5,
  quantity: 1,
  selected: true,
};

describe("cartLineId", () => {
  it("keeps ambiguous product and option text pairs as different line identities", () => {
    expect(cartLineId("a", "bc")).not.toBe(cartLineId("ab", "c"));
    expect(cartLineId("p1", "2-month")).toBe('["p1","2-month"]');
  });
});

describe("normalizeStoredCart", () => {
  it("migrates legacy v1 lines to the implicit default option without losing valid neighbors", () => {
    expect(normalizeStoredCart([
      {
        productId: "legacy",
        name: "기존 상품",
        thumbnailUrl: "/legacy.jpg",
        unitPrice: 12_000,
        stock: 3,
        quantity: 7,
        selected: true,
      },
      { productId: "broken" },
      {
        ...line,
        lineId: "untrusted-stored-id",
        quantity: 2,
      },
    ])).toEqual([
      {
        lineId: '["legacy","default"]',
        productId: "legacy",
        purchaseOptionId: "default",
        purchaseOptionLabel: "기본 구성",
        sku: "",
        name: "기존 상품",
        thumbnailUrl: "/legacy.jpg",
        unitPrice: 12_000,
        stock: 3,
        quantity: 3,
        selected: true,
      },
      { ...line, quantity: 2 },
    ]);
  });

  it("rejects partially corrupted option snapshots while retaining valid rows", () => {
    expect(normalizeStoredCart([
      { ...line, purchaseOptionId: 42 },
      line,
    ])).toEqual([line]);
  });
});

describe("calculateCart", () => {
  it("calculates selected totals and free shipping at 30,000 won", () => {
    expect(calculateCart([{ ...line, quantity: 2 }])).toEqual({
      subtotal: 32_000,
      shippingFee: 0,
      total: 32_000,
      remainingForFreeShipping: 0,
    });
  });

  it("charges shipping from selected lines below the free-shipping threshold", () => {
    expect(calculateCart([{ ...line, quantity: 1 }, { ...line, productId: "unselected", selected: false }])).toEqual({
      subtotal: 16_000,
      shippingFee: 3_000,
      total: 19_000,
      remainingForFreeShipping: 14_000,
    });
  });

  it("returns zero totals when no lines are selected", () => {
    expect(calculateCart([{ ...line, selected: false }])).toEqual({
      subtotal: 0,
      shippingFee: 0,
      total: 0,
      remainingForFreeShipping: 0,
    });
  });
});

describe("clampQuantity", () => {
  it("clamps quantity between one and stock", () => {
    expect(clampQuantity({ ...line, stock: 3 }, 7)).toBe(3);
    expect(clampQuantity({ ...line, stock: 3 }, 0)).toBe(1);
  });

  it("falls back to one for a non-finite requested quantity", () => {
    expect(clampQuantity({ ...line, stock: 3 }, Number.NaN)).toBe(1);
  });
});
