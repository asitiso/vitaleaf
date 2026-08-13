import type { Ingredient, ProductDraft } from "../../../lib/products/types";

type DetailErrors = Partial<Record<"dosage" | "ingredients" | "origin" | "cautions", string>>;

const emptyIngredient = (): Ingredient => ({ name: "", amount: "", dailyValue: "" });

function StringRows({
  label,
  rows,
  error,
  onChange,
}: {
  label: string;
  rows: string[];
  error?: string;
  onChange(rows: string[]): void;
}) {
  const visibleRows = rows.length > 0 ? rows : error ? [""] : [];
  return (
    <fieldset className="product-wizard__rows">
      <legend>{label}</legend>
      {visibleRows.map((row, index) => (
        <div key={`${label}-${index}`} role="group" aria-label={`${label} ${index + 1}`} className="product-wizard__string-row">
          <label><span className="sr-only">{label} {index + 1}</span><input id={label === "주의사항" ? `wizard-cautions-${index}` : undefined} value={row} onChange={(event) => onChange(rows.length ? rows.map((item, itemIndex) => itemIndex === index ? event.target.value : item) : [event.target.value])} aria-invalid={Boolean(error)} aria-describedby={error ? "wizard-cautions-error" : undefined} /></label>
          <button type="button" onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))} aria-label={`${label} ${index + 1} 삭제`}>삭제</button>
        </div>
      ))}
      <button type="button" className="admin-secondary-button" onClick={() => onChange([...rows, ""])}>{label} 추가</button>
    </fieldset>
  );
}

export function DetailsStep({ draft, errors, onChange }: { draft: ProductDraft; errors: DetailErrors; onChange(next: ProductDraft): void }) {
  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const ingredients = draft.ingredients.length
      ? draft.ingredients.map((ingredient, itemIndex) => itemIndex === index ? { ...ingredient, [field]: value } : ingredient)
      : [{ ...emptyIngredient(), [field]: value }];
    onChange({ ...draft, ingredients });
  };
  const visibleIngredients = draft.ingredients.length ? draft.ingredients : [emptyIngredient()];

  return (
    <section className="product-wizard__step-content" aria-labelledby="wizard-details-title">
      <h2 id="wizard-details-title">상세 정보를 입력하세요</h2>
      <p>고객이 이해할 수 있도록 효능, 성분, 섭취 방법을 적습니다.</p>
      <div className="product-wizard__fields">
        <label className="product-wizard__wide"><span>상품 설명</span><textarea value={draft.description} rows={4} onChange={(event) => onChange({ ...draft, description: event.target.value })} /></label>
        <label>
          <span>섭취 방법</span>
          <input id="wizard-dosage" name="dosage" value={draft.dosage} onChange={(event) => onChange({ ...draft, dosage: event.target.value })} aria-invalid={Boolean(errors.dosage)} aria-describedby={errors.dosage ? "wizard-dosage-error" : undefined} />
          {errors.dosage && <small id="wizard-dosage-error">{errors.dosage}</small>}
        </label>
        <label>
          <span>원산지</span>
          <input id="wizard-origin" name="origin" value={draft.origin} onChange={(event) => onChange({ ...draft, origin: event.target.value })} aria-invalid={Boolean(errors.origin)} aria-describedby={errors.origin ? "wizard-origin-error" : undefined} />
          {errors.origin && <small id="wizard-origin-error">{errors.origin}</small>}
        </label>
      </div>
      <StringRows label="효능" rows={draft.benefits} onChange={(benefits) => onChange({ ...draft, benefits })} />
      <fieldset className="product-wizard__rows">
        <legend>성분 정보</legend>
        {visibleIngredients.map((ingredient, index) => (
          <div key={`ingredient-${index}`} role="group" aria-label={`성분 ${index + 1}`} className="product-wizard__ingredient-row">
            <label><span>성분명</span><input id={`wizard-ingredient-${index}`} value={ingredient.name} onChange={(event) => updateIngredient(index, "name", event.target.value)} aria-invalid={Boolean(errors.ingredients)} aria-describedby={errors.ingredients ? "wizard-ingredients-error" : undefined} /></label>
            <label><span>함량</span><input value={ingredient.amount} onChange={(event) => updateIngredient(index, "amount", event.target.value)} /></label>
            <label><span>일일 기준치</span><input value={ingredient.dailyValue} onChange={(event) => updateIngredient(index, "dailyValue", event.target.value)} /></label>
            <button type="button" onClick={() => onChange({ ...draft, ingredients: draft.ingredients.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`성분 ${index + 1} 삭제`}>삭제</button>
          </div>
        ))}
        {errors.ingredients && <small id="wizard-ingredients-error">{errors.ingredients}</small>}
        <button type="button" className="admin-secondary-button" onClick={() => onChange({ ...draft, ingredients: [...draft.ingredients, emptyIngredient()] })}>성분 추가</button>
      </fieldset>
      <StringRows label="인증" rows={draft.certifications} onChange={(certifications) => onChange({ ...draft, certifications })} />
      <StringRows label="주의사항" rows={draft.cautions} error={errors.cautions} onChange={(cautions) => onChange({ ...draft, cautions })} />
      {errors.cautions && <small id="wizard-cautions-error">{errors.cautions}</small>}
    </section>
  );
}
