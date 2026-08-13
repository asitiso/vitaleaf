import type { ProductDraft } from "../../../lib/products/types";

type SalesErrors = Partial<Record<"price" | "stock", string>>;

const numberOrZero = (value: string): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const optionalNumber = (value: string): number | null => value.trim() === "" ? null : numberOrZero(value);

export function SalesStep({ draft, errors, onChange }: { draft: ProductDraft; errors: SalesErrors; onChange(next: ProductDraft): void }) {
  return (
    <section className="product-wizard__step-content" aria-labelledby="wizard-sales-title">
      <h2 id="wizard-sales-title">판매 설정을 확인하세요</h2>
      <p>고객에게 보여 줄 가격과 재고, 노출 여부를 정합니다.</p>
      <div className="product-wizard__fields">
        <label><span>판매가</span><input id="wizard-price" name="price" type="number" min="0" value={draft.price || ""} onChange={(event) => onChange({ ...draft, price: numberOrZero(event.target.value) })} aria-invalid={Boolean(errors.price)} aria-describedby={errors.price ? "wizard-price-error" : undefined} />{errors.price && <small id="wizard-price-error">{errors.price}</small>}</label>
        <label><span>정상가 (선택)</span><input type="number" min="0" value={draft.originalPrice ?? ""} onChange={(event) => onChange({ ...draft, originalPrice: optionalNumber(event.target.value) })} /></label>
        <label><span>재고 수량</span><input id="wizard-stock" name="stock" type="number" min="0" value={draft.stock} onChange={(event) => onChange({ ...draft, stock: numberOrZero(event.target.value) })} aria-invalid={Boolean(errors.stock)} aria-describedby={errors.stock ? "wizard-stock-error" : undefined} />{errors.stock && <small id="wizard-stock-error">{errors.stock}</small>}</label>
        <label><span>판매 순위 (선택)</span><input type="number" min="0" value={draft.salesRank ?? ""} onChange={(event) => onChange({ ...draft, salesRank: optionalNumber(event.target.value) })} /></label>
      </div>
      <fieldset className="product-wizard__checks"><legend>상품 표시</legend><label><input type="checkbox" checked={draft.isBest} onChange={(event) => onChange({ ...draft, isBest: event.target.checked })} />베스트 상품</label><label><input type="checkbox" checked={draft.isNew} onChange={(event) => onChange({ ...draft, isNew: event.target.checked })} />신상품</label></fieldset>
    </section>
  );
}
