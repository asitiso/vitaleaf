import { describe, expect, it } from "vitest";

import {
  getDefaultPurchaseOption,
  getProductAvailableStock,
  getProductDisplayPrice,
  getPurchaseOptionPrice,
  normalizePurchaseOptions,
} from "./purchase-options";

const option = (overrides: Record<string, unknown> = {}) => ({
  id: "four-month",
  label: "4개월분",
  durationMonths: 4,
  sku: "VITA-4M",
  priceAdjustment: 0,
  stock: 20,
  active: true,
  isDefault: true,
  ...overrides,
});

describe("purchase options", () => {
  it("creates the implicit default option for a legacy product", () => {
    expect(normalizePurchaseOptions(undefined, 24_900, 8)).toEqual([
      {
        id: "default",
        label: "기본 구성",
        sku: "",
        durationMonths: null,
        priceAdjustment: 0,
        stock: 8,
        active: true,
        isDefault: true,
      },
    ]);
  });

  it("calculates a final price from the signed option adjustment", () => {
    expect(getPurchaseOptionPrice(80_000, option({ priceAdjustment: -35_000 }))).toBe(45_000);
  });

  it("uses the cheapest active option for display and reports varying active prices", () => {
    const product = {
      price: 80_000,
      stock: 20,
      purchaseOptions: [
        option({ id: "two-month", label: "2개월분", sku: "VITA-2M", priceAdjustment: -35_000, stock: 12, isDefault: false }),
        option(),
      ],
    };

    expect(getProductDisplayPrice(product)).toEqual({ price: 45_000, varies: true });
    expect(getDefaultPurchaseOption(product)).toMatchObject({ id: "four-month" });
  });

  it("sums only active option stock", () => {
    expect(getProductAvailableStock({
      price: 80_000,
      stock: 999,
      purchaseOptions: [
        option({ id: "two-month", label: "2개월분", sku: "VITA-2M", stock: 12, isDefault: false }),
        option({ stock: 20 }),
        option({ id: "retired", label: "판매 종료", sku: "VITA-OLD", stock: 7, active: false, isDefault: false }),
      ],
    })).toBe(32);
  });

  it("rejects duplicate IDs and non-empty SKUs", () => {
    expect(() => normalizePurchaseOptions([
      option({ id: "same", sku: "VITA-2M", isDefault: false }),
      option({ id: "same", sku: "VITA-4M" }),
    ], 80_000, 20)).toThrow(/id/i);

    expect(() => normalizePurchaseOptions([
      option({ id: "two-month", sku: "VITA-SAME", isDefault: false }),
      option({ sku: "VITA-SAME" }),
    ], 80_000, 20)).toThrow(/SKU/i);
  });

  it("rejects blank SKUs on explicit purchase options", () => {
    expect(() => normalizePurchaseOptions([option({ sku: "" })], 80_000, 20)).toThrow(/SKU/i);
    expect(() => normalizePurchaseOptions([
      option({ id: "two-month", label: "2개월분", sku: "   ", isDefault: false }),
      option(),
    ], 80_000, 20)).toThrow(/SKU/i);
  });

  it("rejects non-integer adjustments, negative stock, and invalid duration", () => {
    expect(() => normalizePurchaseOptions([option({ priceAdjustment: 0.5 })], 80_000, 20)).toThrow(/priceAdjustment/i);
    expect(() => normalizePurchaseOptions([option({ stock: -1 })], 80_000, 20)).toThrow(/stock/i);
    expect(() => normalizePurchaseOptions([option({ durationMonths: 1.5 })], 80_000, 20)).toThrow(/durationMonths/i);
  });

  it("rejects an unsafe signed price adjustment", () => {
    expect(() => normalizePurchaseOptions([
      option({ priceAdjustment: Number.MAX_SAFE_INTEGER + 1 }),
    ], 80_000, 20)).toThrow(/priceAdjustment/i);
  });

  it("rejects an option whose safe adjustment makes the final price unsafe", () => {
    expect(() => normalizePurchaseOptions([
      option({ priceAdjustment: 1 }),
    ], Number.MAX_SAFE_INTEGER, 20)).toThrow(/final price/i);
  });

  it("accepts a negative safe adjustment when the final price stays positive", () => {
    expect(normalizePurchaseOptions([
      option({ priceAdjustment: -79_999 }),
    ], 80_000, 20)).toMatchObject([
      { priceAdjustment: -79_999 },
    ]);
  });

  it("requires one active default and never allows an inactive default", () => {
    expect(() => normalizePurchaseOptions([option({ isDefault: false })], 80_000, 20)).toThrow(/default/i);
    expect(() => normalizePurchaseOptions([option({ active: false })], 80_000, 20)).toThrow(/default/i);
  });

  it("rejects an option whose final price is below one won", () => {
    expect(() => normalizePurchaseOptions([option({ priceAdjustment: -80_000 })], 80_000, 20)).toThrow(/price/i);
  });
});
