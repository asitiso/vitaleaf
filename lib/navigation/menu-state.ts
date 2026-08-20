import { AGE_TARGETS, HEALTH_CONCERNS, PRODUCT_CATEGORIES, taxonomyLabel, type TaxonomyOption } from "../catalog/taxonomy";
import type { ProductFilters } from "../products/types";

export const TRIAL_MAX_PRICE_WON = 30_000;

export const AGE_CONCERN_GROUPS: Record<string, readonly string[]> = {
  "30": ["gut", "energy"],
  "40": ["eyes", "circulation"],
  "50": ["brain", "bones"],
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

export type ProductQueryKey =
  | "q"
  | "category"
  | "concern"
  | "age"
  | "promotion"
  | "view"
  | "sort"
  | "minPrice"
  | "maxPrice"
  | "stock";

export type ParsedProductQuery = {
  isSupported: boolean;
  query: Record<string, string>;
};

const DEFAULT_FILTERS: ProductFilters = {
  query: "", category: "", concern: "", minPrice: null, maxPrice: null, inStockOnly: false, sort: "popular",
};

const isTaxonomyValue = (options: readonly TaxonomyOption[]) => (value: string) =>
  options.some((option) => option.value === value);

const isNonNegativeDecimal = (value: string): boolean => /^\d+$/.test(value) && Number.isFinite(Number(value));

const PRODUCT_QUERY_VALIDATORS: Record<ProductQueryKey, (value: string) => boolean> = {
  q: () => true,
  category: isTaxonomyValue(PRODUCT_CATEGORIES),
  concern: isTaxonomyValue(HEALTH_CONCERNS),
  age: isTaxonomyValue(AGE_TARGETS),
  promotion: (value) => value === "today" || value === "trial",
  view: (value) => value === "concerns" || value === "ingredients",
  sort: (value) => ["popular", "newest", "price-asc", "price-desc"].includes(value),
  minPrice: isNonNegativeDecimal,
  maxPrice: isNonNegativeDecimal,
  stock: (value) => value === "1" || value === "true",
};

export function parseProductQuery(params: SearchParams): ParsedProductQuery {
  const query: Record<string, string> = {};
  let isSupported = true;

  for (const [key, value] of Object.entries(params)) {
    if (!Object.prototype.hasOwnProperty.call(PRODUCT_QUERY_VALIDATORS, key)) {
      isSupported = false;
      continue;
    }
    const validator = PRODUCT_QUERY_VALIDATORS[key as ProductQueryKey];
    if (typeof value !== "string" || !validator(value)) {
      isSupported = false;
      continue;
    }
    query[key] = value;
  }

  return { isSupported, query };
}

const readAllowed = <T extends readonly TaxonomyOption[]>(value: string | undefined, options: T): T[number] | null =>
  (options.find((option) => option.value === value) as T[number] | undefined) ?? null;

const nonNegativeNumber = (value: string | undefined): number | null => value === undefined ? null : Number(value);

const parseExistingFilters = (params: Record<string, string>): ProductFilters => ({
  ...DEFAULT_FILTERS,
  query: params.q ?? "",
  minPrice: nonNegativeNumber(params.minPrice),
  maxPrice: nonNegativeNumber(params.maxPrice),
  inStockOnly: params.stock === "1" || params.stock === "true",
  sort: (params.sort ?? "popular") as ProductFilters["sort"],
});

export function resolveMenuState(params: SearchParams): MenuPageState {
  const { query } = parseProductQuery(params);
  const category = readAllowed(query.category, PRODUCT_CATEGORIES);
  const concern = readAllowed(query.concern, HEALTH_CONCERNS);
  const ageOption = readAllowed(query.age, AGE_TARGETS);
  const age: MenuPageState["age"] = ageOption?.value ?? null;
  const promotionValue = query.promotion;
  const promotion: MenuPageState["promotion"] = promotionValue === "today" || promotionValue === "trial" ? promotionValue : null;
  const viewValue = query.view;
  const discoveryView: MenuPageState["discoveryView"] = viewValue === "concerns" || viewValue === "ingredients" ? viewValue : null;
  const filters = { ...parseExistingFilters(query), category: category?.value ?? "", concern: concern?.value ?? "" };
  const base = { filters, promotion, age, discoveryView };

  if (ageOption) {
    const firstConcern = AGE_CONCERN_GROUPS[ageOption.value]?.[0] ?? "";
    return { ...base, title: `${ageOption.label} 추천`, description: `${ageOption.label}의 일상 건강 관리에 맞춰 상품을 살펴보세요.`, contextLabel: `연령 추천 기준: ${taxonomyLabel(HEALTH_CONCERNS, firstConcern)}` };
  }
  if (category) return { ...base, title: category.label, description: category.description };
  if (concern) return { ...base, title: `${concern.label} 상품`, description: concern.description };
  if (promotion === "today") return { ...base, title: "오늘의 혜택", description: "오늘 확인할 수 있는 혜택 상품을 모았습니다.", contextLabel: "오늘의 할인 상품" };
  if (promotion === "trial") return { ...base, title: "첫 구매 추천", description: "부담 없이 시작할 수 있는 상품을 살펴보세요.", contextLabel: `체험 추천 기준: 재고 있음 · ${TRIAL_MAX_PRICE_WON.toLocaleString("ko-KR")}원 이하` };
  if (discoveryView === "concerns") return { ...base, title: "건강 고민별 상품", description: "지금 필요한 건강 고민을 선택해 상품을 찾아보세요." };
  if (discoveryView === "ingredients") return { ...base, title: "성분별 상품", description: "관심 있는 성분을 기준으로 상품을 찾아보세요." };
  if (query.sort === "popular") return { ...base, title: "베스트 상품", description: "많이 찾는 건강기능식품을 인기순으로 살펴보세요." };
  return { ...base, title: "전체 상품", description: "필요한 기준으로 건강기능식품을 비교해 보세요." };
}
