import { describe, expect, it } from "vitest";

import { AGE_CONCERN_GROUPS, resolveMenuState } from "./menu-state";

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

  it("preserves the established age recommendation concern groups", () => {
    expect(AGE_CONCERN_GROUPS).toMatchObject({
      "30": ["장 건강", "피로·활력"],
      "40": ["눈 건강", "혈행"],
      "50": ["뇌 건강", "관절·뼈 건강"],
    });
  });
});
