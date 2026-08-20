import { describe, expect, it } from "vitest";

import { AGE_TARGETS, HEALTH_CONCERNS, PRODUCT_CATEGORIES } from "../catalog/taxonomy";
import { AGE_CONCERN_GROUPS, parseProductQuery, resolveMenuState } from "./menu-state";

describe("parseProductQuery", () => {
  it.each([
    ["q", { q: "오메가" }],
    ["promotion today", { promotion: "today" }],
    ["promotion trial", { promotion: "trial" }],
    ["view concerns", { view: "concerns" }],
    ["view ingredients", { view: "ingredients" }],
    ["sort popular", { sort: "popular" }],
    ["sort newest", { sort: "newest" }],
    ["sort ascending price", { sort: "price-asc" }],
    ["sort descending price", { sort: "price-desc" }],
    ["minPrice", { minPrice: "0" }],
    ["maxPrice", { maxPrice: "30000" }],
    ["stock numeric", { stock: "1" }],
    ["stock boolean", { stock: "true" }],
  ])("accepts the supported scalar %s contract", (_name, params) => {
    expect(parseProductQuery(params)).toEqual({ isSupported: true, query: params });
  });

  it.each(PRODUCT_CATEGORIES)("accepts the supported category $value", ({ value }) => {
    expect(parseProductQuery({ category: value })).toEqual({ isSupported: true, query: { category: value } });
  });

  it.each(HEALTH_CONCERNS)("accepts the supported concern $value", ({ value }) => {
    expect(parseProductQuery({ concern: value })).toEqual({ isSupported: true, query: { concern: value } });
  });

  it.each(AGE_TARGETS)("accepts the supported age $value", ({ value }) => {
    expect(parseProductQuery({ age: value })).toEqual({ isSupported: true, query: { age: value } });
  });

  it.each([
    ["array q", { q: ["오메가", "선물"] }],
    ["unknown category", { category: "unknown" }],
    ["unknown concern", { concern: "unknown" }],
    ["unknown age", { age: "99" }],
    ["unknown promotion", { promotion: "expired" }],
    ["unknown view", { view: "other" }],
    ["unknown sort", { sort: "random" }],
    ["malformed minimum", { minPrice: "nope" }],
    ["negative minimum", { minPrice: "-1" }],
    ["hexadecimal minimum", { minPrice: "0x10" }],
    ["fractional minimum", { minPrice: "10.5" }],
    ["space-padded minimum", { minPrice: " 1000" }],
    ["array minimum", { minPrice: ["1000", "2000"] }],
    ["exponential maximum", { maxPrice: "1e3" }],
    ["negative maximum", { maxPrice: "-1" }],
    ["empty maximum", { maxPrice: "" }],
    ["unsupported stock", { stock: "garbage" }],
    ["zero stock", { stock: "0" }],
    ["false stock", { stock: "false" }],
    ["unknown key", { campaign: "summer" }],
    ["prototype-named key", { constructor: "value" }],
  ])("rejects the unsupported %s contract", (_name, params) => {
    expect(parseProductQuery(params).isSupported).toBe(false);
  });
});

describe("resolveMenuState", () => {
  it.each([
    [{ sort: "popular" }, "베스트 상품"],
    [{ promotion: "today" }, "오늘의 혜택"],
    [{ view: "concerns" }, "건강 고민별 상품"],
    [{ category: "gift" }, "선물세트"],
    [{ age: "40" }, "40대 추천"],
  ])("resolves supported menu state", (params, title) => {
    expect(resolveMenuState(params)).toMatchObject({ title });
  });

  it("keeps supported product filters while invalid menu values reset to the catalog", () => {
    expect(resolveMenuState({
      category: "unknown",
      concern: "not-a-concern",
      promotion: "expired",
      age: "99",
      view: "other",
      q: "오메가",
      minPrice: "10000",
      sort: "price-desc",
    })).toMatchObject({
      title: "전체 상품",
      description: "필요한 기준으로 건강기능식품을 비교해 보세요.",
      filters: {
        query: "오메가",
        category: "",
        concern: "",
        minPrice: 10_000,
        sort: "price-desc",
      },
      promotion: null,
      age: null,
      discoveryView: null,
    });
  });

  it("rejects duplicate menu query values instead of accepting the first value", () => {
    expect(resolveMenuState({ category: ["gift", "unknown"] })).toMatchObject({
      title: "전체 상품",
      filters: { category: "" },
    });
    expect(resolveMenuState({ promotion: ["today", "expired"] })).toMatchObject({
      title: "전체 상품",
      promotion: null,
    });
  });

  it("resets multi-valued ordinary filters instead of accepting their first value", () => {
    expect(resolveMenuState({
      q: ["오메가", "선물"],
      minPrice: ["10000", "20000"],
      maxPrice: ["20000", "30000"],
      stock: ["true", "false"],
      sort: ["popular", "newest"],
    })).toMatchObject({
      title: "전체 상품",
      filters: { query: "", minPrice: null, maxPrice: null, inStockOnly: false, sort: "popular" },
    });
  });

  it.each([" 10000", "0x10", "1e3", "10.5", "-1"])("rejects malformed decimal price filter %s", (price) => {
    expect(resolveMenuState({ minPrice: price, maxPrice: price })).toMatchObject({
      filters: { minPrice: null, maxPrice: null },
    });
  });

  it("preserves the established age recommendation concern groups", () => {
    expect(AGE_CONCERN_GROUPS).toMatchObject({
      "30": ["gut", "energy"],
      "40": ["eyes", "circulation"],
      "50": ["brain", "bones"],
    });
  });

  it("keeps menu filter values canonical instead of converting them to display labels", () => {
    expect(resolveMenuState({ category: "probiotic", concern: "gut" }).filters).toMatchObject({
      category: "probiotic",
      concern: "gut",
    });
  });
});
