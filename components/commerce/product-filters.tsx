import type { ProductFilters as ProductFilterValues } from "../../lib/products/types";

type ProductFiltersProps = {
  filters: ProductFilterValues;
  categories: string[];
  concerns: string[];
  onChange: (changes: Partial<ProductFilterValues>) => void;
  onReset: () => void;
};

const numberValue = (value: string): number | null => {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function ProductFilters({ filters, categories, concerns, onChange, onReset }: ProductFiltersProps) {
  return (
    <aside className="product-filters" aria-label="상품 필터">
      <div className="product-filters__heading">
        <h2>필터</h2>
        <button type="button" onClick={onReset}>전체 초기화</button>
      </div>

      <label className="product-filters__field product-filters__field--wide">
        <span>상품 검색</span>
        <input
          type="search"
          value={filters.query}
          placeholder="상품명, 성분, 기능성 검색"
          onChange={(event) => onChange({ query: event.target.value })}
        />
      </label>

      <label className="product-filters__field">
        <span>카테고리</span>
        <select value={filters.category} onChange={(event) => onChange({ category: event.target.value })}>
          <option value="">전체 카테고리</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>

      <label className="product-filters__field">
        <span>건강 고민</span>
        <select value={filters.concern} onChange={(event) => onChange({ concern: event.target.value })}>
          <option value="">모든 건강 고민</option>
          {concerns.map((concern) => <option key={concern} value={concern}>{concern}</option>)}
        </select>
      </label>

      <fieldset className="product-filters__price">
        <legend>가격 범위</legend>
        <label>
          <span>최소 가격</span>
          <input type="number" min="0" step="1000" value={filters.minPrice ?? ""} onChange={(event) => onChange({ minPrice: numberValue(event.target.value) })} />
        </label>
        <span aria-hidden="true">–</span>
        <label>
          <span>최대 가격</span>
          <input type="number" min="0" step="1000" value={filters.maxPrice ?? ""} onChange={(event) => onChange({ maxPrice: numberValue(event.target.value) })} />
        </label>
      </fieldset>

      <label className="product-filters__stock">
        <input type="checkbox" checked={filters.inStockOnly} onChange={(event) => onChange({ inStockOnly: event.target.checked })} />
        <span>구매 가능한 상품만</span>
      </label>
    </aside>
  );
}
