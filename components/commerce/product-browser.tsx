"use client";

import { useMemo, useRef, useState } from "react";

import { formatWon } from "../../lib/format";
import { canonicalTaxonomyValues, HEALTH_CONCERNS, PRODUCT_CATEGORIES, taxonomyLabel } from "../../lib/catalog/taxonomy";
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
  discoveryView?: "concerns" | "ingredients" | null;
  contextLabel?: string;
  resultsTitle?: string;
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
  if (filters.category) chips.push({ key: "category", label: `카테고리 ${taxonomyLabel(PRODUCT_CATEGORIES, filters.category)}`, reset: { category: "" } });
  if (filters.concern) chips.push({ key: "concern", label: `건강 고민 ${taxonomyLabel(HEALTH_CONCERNS, filters.concern)}`, reset: { concern: "" } });
  if (filters.minPrice !== null) chips.push({ key: "minPrice", label: `최소 가격 ${formatWon(filters.minPrice)}`, reset: { minPrice: null } });
  if (filters.maxPrice !== null) chips.push({ key: "maxPrice", label: `최대 가격 ${formatWon(filters.maxPrice)}`, reset: { maxPrice: null } });
  if (filters.inStockOnly) chips.push({ key: "inStockOnly", label: "재고 있음", reset: { inStockOnly: false } });
  return chips;
};

export function ProductBrowser({
  initialProducts,
  initialFilters,
  loadError = false,
  discoveryView = null,
  contextLabel,
  resultsTitle = "전체 상품",
}: ProductBrowserProps) {
  const startingFilters = useMemo(() => ({ ...defaultProductFilters, ...initialFilters }), [initialFilters]);
  const [filters, setFilters] = useState<ProductFilterValues>(startingFilters);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const mobileFilterToggleRef = useRef<HTMLButtonElement>(null);
  const [previousStartingFilters, setPreviousStartingFilters] = useState(startingFilters);
  const categories = useMemo(() => uniqueValues(canonicalTaxonomyValues(PRODUCT_CATEGORIES, initialProducts.map((product) => product.category))), [initialProducts]);
  const concerns = useMemo(() => uniqueValues(canonicalTaxonomyValues(HEALTH_CONCERNS, initialProducts.flatMap((product) => product.concerns))), [initialProducts]);
  const ingredients = useMemo(
    () => uniqueValues(initialProducts.flatMap((product) => product.ingredients.map((ingredient) => ingredient.name))),
    [initialProducts],
  );
  const visibleProducts = useMemo(() => filterProducts(initialProducts, filters), [filters, initialProducts]);
  const chips = activeChips(filters);

  if (previousStartingFilters !== startingFilters) {
    setPreviousStartingFilters(startingFilters);
    setFilters(startingFilters);
    setMobileFiltersOpen(false);
  }

  const updateFilters = (changes: Partial<ProductFilterValues>) => {
    setFilters((current) => ({ ...current, ...changes }));
  };

  const closeMobileFilters = () => {
    setMobileFiltersOpen(false);
    mobileFilterToggleRef.current?.focus();
  };

  return (
    <div className="product-browser">
      <button
        ref={mobileFilterToggleRef}
        type="button"
        className="product-browser__filter-toggle"
        aria-label="상품 필터"
        aria-expanded={mobileFiltersOpen}
        aria-controls="product-filter-panel"
        onClick={() => setMobileFiltersOpen((current) => !current)}
      >
        <span>필터</span>
        {chips.length ? <strong>{chips.length}</strong> : null}
        <span aria-hidden="true">{mobileFiltersOpen ? "접기" : "열기"}</span>
      </button>

      <div
        id="product-filter-panel"
        className={`product-browser__filter-panel${mobileFiltersOpen ? " product-browser__filter-panel--open" : ""}`}
      >
        <ProductFilters
          filters={filters}
          categories={categories}
          concerns={concerns}
          onChange={updateFilters}
          onReset={() => setFilters(defaultProductFilters)}
        />
        <button
          type="button"
          className="product-browser__filter-done"
          onClick={closeMobileFilters}
        >
          결과 {visibleProducts.length.toLocaleString("ko-KR")}개 보기
        </button>
      </div>

      <section className="product-browser__results" aria-labelledby="product-results-title">
        {discoveryView ? (
          <section className="product-browser__discovery" aria-labelledby="product-discovery-title">
            <h2 id="product-discovery-title">
              {discoveryView === "concerns" ? "건강 고민으로 찾기" : "성분으로 찾기"}
            </h2>
            <p>{discoveryView === "concerns" ? "지금 가장 필요한 건강 고민을 선택하세요." : "확인하고 싶은 주요 성분을 선택하세요."}</p>
            <div>
              {(discoveryView === "concerns" ? concerns : ingredients).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateFilters(discoveryView === "concerns" ? { concern: value } : { query: value })}
                >
                  {discoveryView === "concerns" ? taxonomyLabel(HEALTH_CONCERNS, value) : value}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <div className="product-browser__toolbar">
          <div>
            <h2 id="product-results-title">{resultsTitle}</h2>
            <p aria-live="polite">총 {visibleProducts.length.toLocaleString("ko-KR")}개 상품</p>
            {contextLabel ? <p className="product-browser__context">{contextLabel}</p> : null}
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
          emptyAction={initialProducts.length ? () => setFilters(defaultProductFilters) : undefined}
        />
      </section>
    </div>
  );
}
