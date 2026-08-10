import { ProductBrowser, defaultProductFilters } from "../../components/commerce/product-browser";
import { getProducts } from "../../lib/firebase/products";
import type { Product, ProductFilters } from "../../lib/products/types";

type SearchParams = Record<string, string | string[] | undefined>;

const categoryLabels: Record<string, string> = {
  nutrition: "영양제",
  vitamin: "비타민",
  probiotic: "유산균",
  wellness: "웰니스",
  food: "건강식품",
  gift: "선물세트",
};

const concernLabels: Record<string, string> = {
  energy: "피로·활력",
  immunity: "면역",
  sleep: "수면",
  eyes: "눈 건강",
  gut: "장 건강",
  brain: "뇌 건강",
};

export const TRIAL_MAX_PRICE_WON = 30_000;

// Age recommendations intentionally use the existing concern schema. The first
// concern is the primary label shown to customers; the second broadens matching.
export const AGE_CONCERN_GROUPS: Record<string, readonly string[]> = {
  "30": ["장 건강", "피로·활력"],
  "40": ["눈 건강", "혈행"],
  "50": ["뇌 건강", "관절·뼈 건강"],
};

const firstValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

const nonNegativeNumber = (value: string | string[] | undefined): number | null => {
  const text = firstValue(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const productSort = (value: string | string[] | undefined): ProductFilters["sort"] => {
  const sort = firstValue(value);
  return ["popular", "newest", "price-asc", "price-desc"].includes(sort)
    ? sort as ProductFilters["sort"]
    : "popular";
};

const catalogValue = (value: string | string[] | undefined, labels: Record<string, string>): string => {
  const text = firstValue(value);
  return labels[text] ?? text;
};

export default async function ProductsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params: SearchParams = await (searchParams ?? Promise.resolve({} as SearchParams));
  let products: Product[] = [];
  let loadError = false;

  try {
    products = await getProducts();
  } catch {
    loadError = true;
  }

  const promotion = firstValue(params.promotion);
  if (promotion === "today") {
    products = products.filter(
      (product) => product.originalPrice !== null && product.originalPrice > product.price,
    );
  } else if (promotion === "trial") {
    products = products.filter((product) => product.stock > 0 && product.price <= TRIAL_MAX_PRICE_WON);
  }

  const ageConcerns = AGE_CONCERN_GROUPS[firstValue(params.age)];
  if (ageConcerns) {
    products = products.filter((product) =>
      product.concerns.some((concern) => ageConcerns.includes(concern)),
    );
  }

  const view = firstValue(params.view);
  const discoveryView = view === "concerns" || view === "ingredients" ? view : null;
  const contextLabel = ageConcerns
    ? `연령 추천 기준: ${ageConcerns[0]}`
    : promotion === "today"
      ? "오늘의 할인 상품"
      : promotion === "trial"
        ? `체험 추천 기준: 재고 있음 · ${TRIAL_MAX_PRICE_WON.toLocaleString("ko-KR")}원 이하`
        : undefined;

  const initialFilters: ProductFilters = {
    ...defaultProductFilters,
    query: firstValue(params.q),
    category: catalogValue(params.category, categoryLabels),
    concern: catalogValue(params.concern, concernLabels),
    minPrice: nonNegativeNumber(params.minPrice),
    maxPrice: nonNegativeNumber(params.maxPrice),
    inStockOnly: ["1", "true"].includes(firstValue(params.stock)),
    sort: productSort(params.sort),
  };

  return (
    <main className="products-page">
      <header className="products-page__header">
        <p>VITALEAF SHOP</p>
        <h1>내 몸에 필요한 기준으로 찾기</h1>
        <span>기능성, 성분, 가격을 한곳에서 비교해 보세요.</span>
      </header>
      <ProductBrowser
        initialProducts={products}
        initialFilters={initialFilters}
        loadError={loadError}
        discoveryView={discoveryView}
        contextLabel={contextLabel}
      />
    </main>
  );
}
