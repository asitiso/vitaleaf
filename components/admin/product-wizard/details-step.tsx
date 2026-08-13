import { useId, useLayoutEffect, useRef, useState } from "react";

import type { Ingredient, ProductDraft } from "../../../lib/products/types";

type DetailErrors = Partial<Record<"dosage" | "ingredients" | "origin" | "cautions", string>>;
type RowKind = "benefit" | "ingredient" | "certification" | "caution";

const emptyIngredient = (): Ingredient => ({ name: "", amount: "", dailyValue: "" });
const inputId = (kind: RowKind, id: string): string => `wizard-${kind}-${id}`;
const addButtonId = (kind: RowKind): string => `wizard-add-${kind}`;
type RowIds = Record<RowKind, string[]>;

const initialRowIds = (draft: ProductDraft, errors: DetailErrors, prefix: string): RowIds => {
  let index = 0;
  const allocate = (): string => `${prefix}-row-${index++}`;
  return {
    benefit: draft.benefits.map(allocate),
    ingredient: (draft.ingredients.length ? draft.ingredients : errors.ingredients ? [emptyIngredient()] : []).map(allocate),
    certification: draft.certifications.map(allocate),
    caution: (draft.cautions.length ? draft.cautions : errors.cautions ? [""] : []).map(allocate),
  };
};

function StringRows({
  label,
  kind,
  rows,
  rowIds,
  error,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  kind: Exclude<RowKind, "ingredient">;
  rows: string[];
  rowIds: string[];
  error?: string;
  onChange(rows: string[]): void;
  onAdd(): void;
  onRemove(index: number): void;
}) {
  const visibleRows = rows.length > 0 ? rows : error ? [""] : [];
  return (
    <fieldset className="product-wizard__rows">
      <legend>{label}</legend>
      {visibleRows.map((row, index) => {
        const id = rowIds[index]!;
        return (
          <div key={id} role="group" aria-label={`${label} ${index + 1}`} className="product-wizard__string-row">
            <label><span className="sr-only">{label} {index + 1}</span><input id={inputId(kind, id)} data-wizard-field={kind === "caution" ? "cautions" : undefined} value={row} onChange={(event) => onChange(rows.length ? rows.map((item, itemIndex) => itemIndex === index ? event.target.value : item) : [event.target.value])} aria-invalid={Boolean(error)} aria-describedby={error ? "wizard-cautions-error" : undefined} /></label>
            <button type="button" onClick={() => onRemove(index)} aria-label={`${label} ${index + 1} 삭제`}>삭제</button>
          </div>
        );
      })}
      <button id={addButtonId(kind)} type="button" className="admin-secondary-button" onClick={onAdd}>{label} 추가</button>
    </fieldset>
  );
}

export function DetailsStep({ draft, errors, onChange }: { draft: ProductDraft; errors: DetailErrors; onChange(next: ProductDraft): void }) {
  const rowPrefix = useId();
  const [rowIds, setRowIds] = useState<RowIds>(() => initialRowIds(draft, errors, rowPrefix));
  const [nextRowId, setNextRowId] = useState(() => Object.values(rowIds).reduce((total, ids) => total + ids.length, 0));
  const pendingFocus = useRef<string | null>(null);

  const focusAfterChange = (id: string) => { pendingFocus.current = id; };
  const makeRowId = (): string => {
    const id = `${rowPrefix}-row-${nextRowId}`;
    setNextRowId((current) => current + 1);
    return id;
  };

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    document.getElementById(id)?.focus();
    pendingFocus.current = null;
  }, [draft]);

  const addString = (kind: Exclude<RowKind, "ingredient">, field: "benefits" | "certifications" | "cautions") => {
    const existingIds = rowIds[kind];
    const id = draft[field].length === 0 && existingIds.length > 0 ? existingIds[0]! : makeRowId();
    const ids = existingIds.includes(id) ? existingIds : [...existingIds, id];
    setRowIds({ ...rowIds, [kind]: ids });
    focusAfterChange(inputId(kind, id));
    onChange({ ...draft, [field]: [...draft[field], ""] });
  };
  const removeString = (kind: Exclude<RowKind, "ingredient">, field: "benefits" | "certifications" | "cautions", index: number) => {
    const ids = [...rowIds[kind]];
    ids.splice(index, 1);
    setRowIds({ ...rowIds, [kind]: ids });
    const remaining = draft[field].filter((_, itemIndex) => itemIndex !== index);
    focusAfterChange(remaining.length ? inputId(kind, ids[Math.min(index, ids.length - 1)]!) : addButtonId(kind));
    onChange({ ...draft, [field]: remaining });
  };
  const addIngredient = () => {
    const id = makeRowId();
    setRowIds({ ...rowIds, ingredient: [...rowIds.ingredient, id] });
    focusAfterChange(inputId("ingredient", id));
    onChange({ ...draft, ingredients: [...draft.ingredients, emptyIngredient()] });
  };
  const removeIngredient = (index: number) => {
    const ids = [...rowIds.ingredient];
    ids.splice(index, 1);
    setRowIds({ ...rowIds, ingredient: ids });
    const ingredients = draft.ingredients.filter((_, itemIndex) => itemIndex !== index);
    focusAfterChange(ingredients.length ? inputId("ingredient", ids[Math.min(index, ids.length - 1)]!) : addButtonId("ingredient"));
    onChange({ ...draft, ingredients });
  };
  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const ingredients = draft.ingredients.length
      ? draft.ingredients.map((ingredient, itemIndex) => itemIndex === index ? { ...ingredient, [field]: value } : ingredient)
      : [{ ...emptyIngredient(), [field]: value }];
    onChange({ ...draft, ingredients });
  };

  const benefitIds = rowIds.benefit;
  const ingredientRows = draft.ingredients.length ? draft.ingredients : errors.ingredients ? [emptyIngredient()] : [];
  const ingredientIds = rowIds.ingredient;
  const certificationIds = rowIds.certification;
  const cautionRows = draft.cautions.length ? draft.cautions : errors.cautions ? [""] : [];
  const cautionIds = rowIds.caution;

  return (
    <section className="product-wizard__step-content" aria-labelledby="wizard-details-title">
      <h2 id="wizard-details-title">상세 정보를 입력하세요</h2>
      <p>고객이 이해할 수 있도록 효능, 성분, 섭취 방법을 적습니다.</p>
      <div className="product-wizard__fields">
        <label className="product-wizard__wide"><span>상품 설명</span><textarea value={draft.description} rows={4} onChange={(event) => onChange({ ...draft, description: event.target.value })} /></label>
        <label><span>섭취 방법</span><input id="wizard-dosage" data-wizard-field="dosage" name="dosage" value={draft.dosage} onChange={(event) => onChange({ ...draft, dosage: event.target.value })} aria-invalid={Boolean(errors.dosage)} aria-describedby={errors.dosage ? "wizard-dosage-error" : undefined} />{errors.dosage && <small id="wizard-dosage-error">{errors.dosage}</small>}</label>
        <label><span>원산지</span><input id="wizard-origin" data-wizard-field="origin" name="origin" value={draft.origin} onChange={(event) => onChange({ ...draft, origin: event.target.value })} aria-invalid={Boolean(errors.origin)} aria-describedby={errors.origin ? "wizard-origin-error" : undefined} />{errors.origin && <small id="wizard-origin-error">{errors.origin}</small>}</label>
      </div>
      <StringRows label="효능" kind="benefit" rows={draft.benefits} rowIds={benefitIds} onChange={(benefits) => onChange({ ...draft, benefits })} onAdd={() => addString("benefit", "benefits")} onRemove={(index) => removeString("benefit", "benefits", index)} />
      <fieldset className="product-wizard__rows">
        <legend>성분 정보</legend>
        {ingredientRows.map((ingredient, index) => {
          const id = ingredientIds[index]!;
          return <div key={id} role="group" aria-label={`성분 ${index + 1}`} className="product-wizard__ingredient-row"><label><span>성분명</span><input id={inputId("ingredient", id)} data-wizard-field="ingredients" value={ingredient.name} onChange={(event) => updateIngredient(index, "name", event.target.value)} aria-invalid={Boolean(errors.ingredients)} aria-describedby={errors.ingredients ? "wizard-ingredients-error" : undefined} /></label><label><span>함량</span><input value={ingredient.amount} onChange={(event) => updateIngredient(index, "amount", event.target.value)} /></label><label><span>일일 기준치</span><input value={ingredient.dailyValue} onChange={(event) => updateIngredient(index, "dailyValue", event.target.value)} /></label><button type="button" onClick={() => removeIngredient(index)} aria-label={`성분 ${index + 1} 삭제`}>삭제</button></div>;
        })}
        {errors.ingredients && <small id="wizard-ingredients-error">{errors.ingredients}</small>}
        <button id={addButtonId("ingredient")} type="button" className="admin-secondary-button" onClick={addIngredient}>성분 추가</button>
      </fieldset>
      <StringRows label="인증" kind="certification" rows={draft.certifications} rowIds={certificationIds} onChange={(certifications) => onChange({ ...draft, certifications })} onAdd={() => addString("certification", "certifications")} onRemove={(index) => removeString("certification", "certifications", index)} />
      <StringRows label="주의사항" kind="caution" rows={cautionRows} rowIds={cautionIds} error={errors.cautions} onChange={(cautions) => onChange({ ...draft, cautions })} onAdd={() => addString("caution", "cautions")} onRemove={(index) => removeString("caution", "cautions", index)} />
      {errors.cautions && <small id="wizard-cautions-error">{errors.cautions}</small>}
    </section>
  );
}
