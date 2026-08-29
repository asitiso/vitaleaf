import { describe, expect, it } from "vitest";

import { getPurchaseOptionPrice, normalizePurchaseOptions } from "./purchase-options";
import { SAMPLE_PRODUCTS } from "./sample-products";

describe("sample product purchase options", () => {
  it("uses valid sealed two- and four-month options with unique sample SKUs", () => {
    const options = SAMPLE_PRODUCTS.flatMap((product) => (
      normalizePurchaseOptions(product.purchaseOptions, product.price, product.stock)
    ));

    expect(SAMPLE_PRODUCTS.every((product) => product.purchaseOptions?.map((option) => option.id).join(",") === "2-month,4-month")).toBe(true);
    expect(options).toHaveLength(SAMPLE_PRODUCTS.length * 2);
    expect(new Set(options.map((option) => option.sku)).size).toBe(options.length);
    expect(SAMPLE_PRODUCTS.every((product) => product.purchaseOptions?.filter((option) => option.active && option.isDefault).length === 1)).toBe(true);
  });

  it("includes exact-half and above-half two-month price patterns", () => {
    const twoMonthPrices = SAMPLE_PRODUCTS.map((product) => {
      const option = product.purchaseOptions?.find((candidate) => candidate.id === "2-month");
      if (!option) throw new Error("Expected a two-month sample option.");
      return { price: product.price, optionPrice: getPurchaseOptionPrice(product.price, option) };
    });

    expect(twoMonthPrices.some(({ price, optionPrice }) => optionPrice * 2 === price)).toBe(true);
    expect(twoMonthPrices.some(({ price, optionPrice }) => optionPrice * 2 > price)).toBe(true);
  });
});
