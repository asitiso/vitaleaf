"use client";

import { useMemo, useState } from "react";

import { formatWon } from "../../lib/format";
import { filterProducts } from "../../lib/products/filter-products";
import type { Product, ProductFilters as ProductFilterValues } from "../../lib/products/types";
import { ProductFilters } from "./product-filters";
import { ProductGrid } from "./product-grid";

export const defaultProductFilters: ProductFilterValues = {
  query: "",
  category: "",
  concern: "",
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  sort: "popular",
};

type ProductBrowserProps = {
  initialProducts: Product[];
  initialFilters?: Partial<ProductFilterValues>;
  loadError?: boolean;
};

type Chip = {
  key: keyof ProductFilterValues;
  label: string;
  reset: Partial<ProductFilterValues>;
};

const uniqueValues = (values: string[]): string[] =>
  [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, "ko-KR"));

const activeChips = (filters: ProductFilterValues): Chip[] => {
  const chips: Chip[] = [];
  if (filters.query) chips.push({ key: "query", label: `검색어 ${filters.query}`, reset: { query: "" } });
  if (filters.category) chips.push({ key: "category", label: `카테고리 ${filters.category}`, reset: { category: "" } });
  if (filters.concern) chips.push({ key: "concern", label: `건강 고민 ${filters.concern}`, reset: { concern: "" } });
  if (filters.minPrice !== null) chips.push({ key: "minPrice", label: `최소 가격 ${formatWon(filters.minPrice)}`, reset: { minPrice: null } });
  if (filters.maxPrice !== null) chips.push({ key: "maxPrice", label: `최대 가격 ${formatWon(filters.maxPrice)}`, reset: { maxPrice: null } });
  if (filters.inStockOnly) chips.push({ key: "inStockOnly", label: "재고 있음", reset: { inStockOnly: false } });
  return chips;
};

export function ProductBrowser({ initialProducts, initialFilters, loadError = false }: ProductBrowserProps) {
  const startingFilters = useMemo(() => ({ ...defaultProductFilters, ...initialFilters }), [initialFilters]);
  const [filters, setFilters] = useState<ProductFilterValues>(startingFilters);
  const categories = useMemo(() => uniqueValues(initialProducts.map((product) => product.category)), [initialProducts]);
  const concerns = useMemo(() => uniqueValues(initialProducts.flatMap((product) => product.concerns)), [initialProducts]);
  const visibleProducts = useMemo(() => filterProducts(initialProducts, filters), [filters, initialProducts]);
  const chips = activeChips(filters);

  const updateFilters = (changes: Partial<ProductFilterValues>) => {
    setFilters((current) => ({ ...current, ...changes }));
  };

  return (
    <div className="product-browser">
      <ProductFilters
        filters={filters}
        categories={categories}
        concerns={concerns}
        onChange={updateFilters}
        onReset={() => setFilters(defaultProductFilters)}
      />

      <section className="product-browser__results" aria-labelledby="product-results-title">
        <div className="product-browser__toolbar">
          <div>
            <h2 id="product-results-title">전체 상품</h2>
            <p aria-live="polite">총 {visibleProducts.length.toLocaleString("ko-KR")}개 상품</p>
          </div>
          <label>
            <span>정렬</span>
            <select value={filters.sort} onChange={(event) => updateFilters({ sort: event.target.value as ProductFilterValues["sort"] })}>
              <option value="popular">인기순</option>
              <option value="newest">최신순</option>
              <option value="price-asc">낮은 가격순</option>
              <option value="price-desc">높은 가격순</option>
            </select>
          </label>
        </div>

        {chips.length ? (
          <div className="product-browser__chips" aria-label="적용된 필터">
            {chips.map((chip) => (
              <button key={chip.key} type="button" aria-label={`${chip.label} 해제`} onClick={() => updateFilters(chip.reset)}>
                {chip.label} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}

        <ProductGrid
          status={loadError ? "error" : visibleProducts.length ? "ready" : "empty"}
          products={visibleProducts}
          retry={loadError ? () => window.location.reload() : undefined}
        />
      </section>
    </div>
  );
}
