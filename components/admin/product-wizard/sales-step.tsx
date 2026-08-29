import type { ProductDraft, PurchaseOption } from "../../../lib/products/types";
import { PurchaseOptionsEditor } from "./purchase-options-editor";

type SalesErrors = Partial<Record<"price" | "stock" | "purchaseOptions", string>>;

const numberOrZero = (value: string): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const optionalNumber = (value: string): number | null => value.trim() === "" ? null : numberOrZero(value);

const isImplicitLegacyOptions = (draft: ProductDraft): boolean => {
  const options = draft.purchaseOptions;
  if (!options || options.length === 0) return true;
  if (options.length !== 1) return false;
  const option = options[0]!;
  return option.id === "default"
    && option.label === "기본 구성"
    && option.durationMonths === null
    && option.sku === ""
    && option.priceAdjustment === 0
    && option.stock === draft.stock
    && option.active
    && option.isDefault;
};

const activeStockTotal = (options: PurchaseOption[]): number | null => {
  const activeOptions = options.filter((option) => option.active);
  if (activeOptions.some((option) => !Number.isInteger(option.stock) || option.stock < 0)) return null;
  return activeOptions.reduce((total, option) => total + option.stock, 0);
};

export function SalesStep({ draft, errors, onChange }: { draft: ProductDraft; errors: SalesErrors; onChange(next: ProductDraft): void }) {
  const usesLegacyStock = isImplicitLegacyOptions(draft);
  const explicitOptions = usesLegacyStock ? [] : draft.purchaseOptions ?? [];
  const optionStock = activeStockTotal(explicitOptions);

  const updateLegacyStock = (stock: number) => {
    const purchaseOptions = draft.purchaseOptions?.length === 1
      ? [{ ...draft.purchaseOptions[0]!, stock }]
      : draft.purchaseOptions;
    onChange({ ...draft, stock, ...(purchaseOptions === undefined ? {} : { purchaseOptions }) });
  };

  const updateOptions = (purchaseOptions: PurchaseOption[]) => {
    const stock = activeStockTotal(purchaseOptions);
    onChange({ ...draft, purchaseOptions, stock: stock ?? draft.stock });
  };

  const enablePurchaseOptions = () => {
    const purchaseOptions: PurchaseOption[] = [{
      id: crypto.randomUUID(),
      label: "기본 구성",
      durationMonths: null,
      sku: "OPTION-1",
      priceAdjustment: 0,
      stock: draft.stock,
      active: true,
      isDefault: true,
    }];
    onChange({ ...draft, purchaseOptions });
  };

  return (
    <section className="product-wizard__step-content" aria-labelledby="wizard-sales-title">
      <h2 id="wizard-sales-title">판매 설정을 확인하세요</h2>
      <p>고객에게 보여 줄 가격과 재고, 노출 여부를 정합니다.</p>
      <div className="product-wizard__fields">
        <label><span>판매가</span><input id="wizard-price" name="price" type="number" min="0" value={draft.price || ""} onChange={(event) => onChange({ ...draft, price: numberOrZero(event.target.value) })} aria-invalid={Boolean(errors.price)} aria-describedby={errors.price ? "wizard-price-error" : undefined} />{errors.price && <small id="wizard-price-error">{errors.price}</small>}</label>
        <label><span>정상가 (선택)</span><input type="number" min="0" value={draft.originalPrice ?? ""} onChange={(event) => onChange({ ...draft, originalPrice: optionalNumber(event.target.value) })} /></label>
        {usesLegacyStock ? (
          <label><span>재고 수량</span><input id="wizard-stock" name="stock" type="number" min="0" value={draft.stock} onChange={(event) => updateLegacyStock(numberOrZero(event.target.value))} aria-invalid={Boolean(errors.stock)} aria-describedby={errors.stock ? "wizard-stock-error" : undefined} />{errors.stock && <small id="wizard-stock-error">{errors.stock}</small>}</label>
        ) : (
          <label><span>활성 옵션 총 재고</span><input aria-label="활성 옵션 총 재고" value={optionStock === null ? "입력 확인 필요" : `${optionStock}개`} readOnly /></label>
        )}
        <label><span>판매 순위 (선택)</span><input type="number" min="0" value={draft.salesRank ?? ""} onChange={(event) => onChange({ ...draft, salesRank: optionalNumber(event.target.value) })} /></label>
      </div>
      {usesLegacyStock && (
        <button type="button" className="admin-secondary-button" onClick={enablePurchaseOptions}>구매 옵션 사용</button>
      )}
      {!usesLegacyStock && (
        <PurchaseOptionsEditor
          basePrice={draft.price}
          options={explicitOptions}
          errors={errors.purchaseOptions ? [errors.purchaseOptions] : []}
          onChange={updateOptions}
        />
      )}
      <fieldset className="product-wizard__checks"><legend>상품 표시</legend><label><input type="checkbox" checked={draft.isBest} onChange={(event) => onChange({ ...draft, isBest: event.target.checked })} />베스트 상품</label><label><input type="checkbox" checked={draft.isNew} onChange={(event) => onChange({ ...draft, isNew: event.target.checked })} />신상품</label></fieldset>
    </section>
  );
}
