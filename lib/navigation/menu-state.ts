import { AGE_TARGETS, HEALTH_CONCERNS, PRODUCT_CATEGORIES, type TaxonomyOption } from "../catalog/taxonomy";
import type { ProductFilters } from "../products/types";

export const TRIAL_MAX_PRICE_WON = 30_000;

export const AGE_CONCERN_GROUPS: Record<string, readonly string[]> = {
  "30": ["장 건강", "피로·활력"],
  "40": ["눈 건강", "혈행"],
  "50": ["뇌 건강", "관절·뼈 건강"],
};

export type MenuPageState = {
  title: string;
  description: string;
  filters: ProductFilters;
  promotion: "today" | "trial" | null;
  age: "30" | "40" | "50" | null;
  discoveryView: "concerns" | "ingredients" | null;
  contextLabel?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_FILTERS: ProductFilters = {
  query: "", category: "", concern: "", minPrice: null, maxPrice: null, inStockOnly: false, sort: "popular",
};

const firstValue = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const singleMenuValue = (value: string | string[] | undefined): string => Array.isArray(value) ? "" : value ?? "";

const readAllowed = <T extends readonly TaxonomyOption[]>(value: string | string[] | undefined, options: T) => {
  const text = singleMenuValue(value);
  return options.find((option) => option.value === text) ?? null;
};

const nonNegativeNumber = (value: string | string[] | undefined): number | null => {
  const text = firstValue(value);
  const parsed = Number(text);
  return text && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parseExistingFilters = (params: SearchParams): ProductFilters => ({
  ...DEFAULT_FILTERS,
  query: firstValue(params.q),
  minPrice: nonNegativeNumber(params.minPrice),
  maxPrice: nonNegativeNumber(params.maxPrice),
  inStockOnly: ["1", "true"].includes(firstValue(params.stock)),
  sort: (["popular", "newest", "price-asc", "price-desc"].includes(singleMenuValue(params.sort))
    ? singleMenuValue(params.sort) : "popular") as ProductFilters["sort"],
});

export function resolveMenuState(params: SearchParams): MenuPageState {
  const category = readAllowed(params.category, PRODUCT_CATEGORIES);
  const concern = readAllowed(params.concern, HEALTH_CONCERNS);
  const ageOption = readAllowed(params.age, AGE_TARGETS);
  const age = ageOption?.value as MenuPageState["age"] ?? null;
  const promotionValue = singleMenuValue(params.promotion);
  const promotion = promotionValue === "today" || promotionValue === "trial" ? promotionValue : null;
  const viewValue = singleMenuValue(params.view);
  const discoveryView = viewValue === "concerns" || viewValue === "ingredients" ? viewValue : null;
  const filters = { ...parseExistingFilters(params), category: category?.label ?? "", concern: concern?.label ?? "" };
  const base = { filters, promotion, age, discoveryView };

  if (ageOption) return { ...base, title: `${ageOption.label} 추천`, description: `${ageOption.label}의 일상 건강 관리에 맞춰 상품을 살펴보세요.`, contextLabel: `연령 추천 기준: ${AGE_CONCERN_GROUPS[age]?.[0] ?? ""}` };
  if (category) return { ...base, title: category.label, description: category.description };
  if (concern) return { ...base, title: `${concern.label} 상품`, description: concern.description };
  if (promotion === "today") return { ...base, title: "오늘의 혜택", description: "오늘 확인할 수 있는 혜택 상품을 모았습니다.", contextLabel: "오늘의 할인 상품" };
  if (promotion === "trial") return { ...base, title: "첫 구매 추천", description: "부담 없이 시작할 수 있는 상품을 살펴보세요.", contextLabel: `체험 추천 기준: 재고 있음 · ${TRIAL_MAX_PRICE_WON.toLocaleString("ko-KR")}원 이하` };
  if (discoveryView === "concerns") return { ...base, title: "건강 고민별 상품", description: "지금 필요한 건강 고민을 선택해 상품을 찾아보세요." };
  if (discoveryView === "ingredients") return { ...base, title: "성분별 상품", description: "관심 있는 성분을 기준으로 상품을 찾아보세요." };
  if (singleMenuValue(params.sort) === "popular") return { ...base, title: "베스트 상품", description: "많이 찾는 건강기능식품을 인기순으로 살펴보세요." };
  return { ...base, title: "전체 상품", description: "필요한 기준으로 건강기능식품을 비교해 보세요." };
}
