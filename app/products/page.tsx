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

  const initialFilters: ProductFilters = {
    ...defaultProductFilters,
    query: firstValue(params.q) || (firstValue(params.age) ? `${firstValue(params.age)}대` : ""),
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
      <ProductBrowser initialProducts={products} initialFilters={initialFilters} loadError={loadError} />
    </main>
  );
}
