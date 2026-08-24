import { ProductBrowser } from "../../components/commerce/product-browser";
import { getServerProducts } from "../../lib/firebase/server-read";
import { AGE_CONCERN_GROUPS, resolveMenuState, TRIAL_MAX_PRICE_WON } from "../../lib/navigation/menu-state";
import type { Product } from "../../lib/products/types";
import { HEALTH_CONCERNS, taxonomyValuesMatch } from "../../lib/catalog/taxonomy";
import { SAMPLE_PRODUCTS } from "../../lib/products/sample-products";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params: SearchParams = await (searchParams ?? Promise.resolve({} as SearchParams));
  const menuState = resolveMenuState(params);
  let products: Product[] = [];
  let isSampleCatalog = false;

  try {
    products = await getServerProducts();
    if (products.length === 0) {
      products = SAMPLE_PRODUCTS;
      isSampleCatalog = true;
    }
  } catch {
    products = SAMPLE_PRODUCTS;
    isSampleCatalog = true;
  }

  if (menuState.promotion === "today") {
    products = products.filter((product) => product.originalPrice !== null && product.originalPrice > product.price);
  } else if (menuState.promotion === "trial") {
    products = products.filter((product) => product.stock > 0 && product.price <= TRIAL_MAX_PRICE_WON);
  }

  const ageConcerns = menuState.age ? AGE_CONCERN_GROUPS[menuState.age] : undefined;
  if (ageConcerns) products = products.filter((product) => product.concerns.some((concern) => (
    ageConcerns.some((ageConcern) => taxonomyValuesMatch(HEALTH_CONCERNS, concern, ageConcern))
  )));

  return <main className="products-page">
    <header className="products-page__header"><p>VITALEAF SHOP</p><h1>{menuState.title}</h1><span>{menuState.description}</span></header>
    {isSampleCatalog ? <p className="sample-catalog-notice sample-catalog-notice--products">샘플 상품으로 쇼핑몰 기능을 미리 확인하고 있습니다.</p> : null}
    <ProductBrowser initialProducts={products} initialFilters={menuState.filters} discoveryView={menuState.discoveryView} contextLabel={menuState.contextLabel} resultsTitle={menuState.title} />
  </main>;
}
