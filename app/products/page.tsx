import { ProductBrowser } from "../../components/commerce/product-browser";
import { getServerProducts } from "../../lib/firebase/server-read";
import { AGE_CONCERN_GROUPS, resolveMenuState, TRIAL_MAX_PRICE_WON } from "../../lib/navigation/menu-state";
import type { Product } from "../../lib/products/types";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params: SearchParams = await (searchParams ?? Promise.resolve({} as SearchParams));
  const menuState = resolveMenuState(params);
  let products: Product[] = [];
  let loadError = false;

  try {
    products = await getServerProducts();
  } catch {
    loadError = true;
  }

  if (menuState.promotion === "today") {
    products = products.filter((product) => product.originalPrice !== null && product.originalPrice > product.price);
  } else if (menuState.promotion === "trial") {
    products = products.filter((product) => product.stock > 0 && product.price <= TRIAL_MAX_PRICE_WON);
  }

  const ageConcerns = menuState.age ? AGE_CONCERN_GROUPS[menuState.age] : undefined;
  if (ageConcerns) products = products.filter((product) => product.concerns.some((concern) => ageConcerns.includes(concern)));

  return <main className="products-page">
    <header className="products-page__header"><p>VITALEAF SHOP</p><h1>{menuState.title}</h1><span>{menuState.description}</span></header>
    <ProductBrowser initialProducts={products} initialFilters={menuState.filters} loadError={loadError} discoveryView={menuState.discoveryView} contextLabel={menuState.contextLabel} resultsTitle={menuState.title} />
  </main>;
}
