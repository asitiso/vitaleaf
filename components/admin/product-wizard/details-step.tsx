import { useId, useLayoutEffect, useMemo, useReducer, useRef } from "react";

import type { Ingredient, ProductDraft } from "../../../lib/products/types";

type DetailErrors = Partial<Record<"dosage" | "ingredients" | "origin" | "cautions", string>>;
type RowKind = "benefit" | "ingredient" | "certification" | "caution";
const rowKinds: readonly RowKind[] = ["benefit", "ingredient", "certification", "caution"];

const emptyIngredient = (): Ingredient => ({ name: "", amount: "", dailyValue: "" });
const inputId = (kind: RowKind, id: string): string => `wizard-${kind}-${id}`;
const addButtonId = (kind: RowKind): string => `wizard-add-${kind}`;
type RowCounts = Record<RowKind, number>;
type RowState = { ids: Record<RowKind, string[]>; nextId: number };

const emptyRowState = (): RowState => ({
  ids: { benefit: [], ingredient: [], certification: [], caution: [] },
  nextId: 0,
});

const reconcileRows = (state: RowState, counts: RowCounts, prefix: string): RowState => {
  let nextId = state.nextId;
  let changed = false;
  const ids = {} as Record<RowKind, string[]>;
  for (const kind of rowKinds) {
    const current = state.ids[kind];
    const target = counts[kind];
    const next = current.slice(0, target);
    while (next.length < target) next.push(`${prefix}-row-${nextId++}`);
    if (next.length !== current.length || next.some((id, index) => id !== current[index])) changed = true;
    ids[kind] = next;
  }
  return changed ? { ids, nextId } : state;
};

type RowAction =
  | { type: "reconcile"; counts: RowCounts; prefix: string }
  | { type: "add"; kind: RowKind; counts: RowCounts; prefix: string }
  | { type: "remove"; kind: RowKind; index: number; counts: RowCounts; prefix: string };

const rowReducer = (state: RowState, action: RowAction): RowState => {
  const reconciled = reconcileRows(state, action.counts, action.prefix);
  if (action.type === "reconcile") return reconciled;
  const ids = { ...reconciled.ids, [action.kind]: [...reconciled.ids[action.kind]] };
  if (action.type === "add") ids[action.kind].push(`${action.prefix}-row-${reconciled.nextId}`);
  else ids[action.kind].splice(action.index, 1);
  return { ids, nextId: action.type === "add" ? reconciled.nextId + 1 : reconciled.nextId };
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
  const renderedRows = visibleRows.slice(0, rowIds.length);
  return (
    <fieldset className="product-wizard__rows">
      <legend>{label}</legend>
      {renderedRows.map((row, index) => {
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

export function DetailsStep({ draft, errors, dosageHint, onChange }: { draft: ProductDraft; errors: DetailErrors; dosageHint?: string; onChange(next: ProductDraft): void }) {
  const rowPrefix = useId();
  const pendingFocus = useRef<string | null>(null);
  const ingredientRows = draft.ingredients.length ? draft.ingredients : errors.ingredients ? [emptyIngredient()] : [];
  const cautionRows = draft.cautions.length ? draft.cautions : errors.cautions ? [""] : [];
  const rowCounts = useMemo<RowCounts>(() => ({
    benefit: draft.benefits.length,
    ingredient: ingredientRows.length,
    certification: draft.certifications.length,
    caution: cautionRows.length,
  }), [draft.benefits.length, ingredientRows.length, draft.certifications.length, cautionRows.length]);
  const [rowState, dispatch] = useReducer(rowReducer, undefined, () => reconcileRows(emptyRowState(), rowCounts, rowPrefix));

  useLayoutEffect(() => {
    dispatch({ type: "reconcile", counts: rowCounts, prefix: rowPrefix });
  }, [rowCounts, rowPrefix]);

  useLayoutEffect(() => {
    const field = errors.dosage ? "dosage"
      : errors.ingredients ? "ingredients"
        : errors.origin ? "origin"
          : errors.cautions ? "cautions"
            : null;
    if (!field) return;
    document.querySelector<HTMLElement>(`[data-wizard-field="${field}"]`)?.focus();
  }, [errors.dosage, errors.ingredients, errors.origin, errors.cautions, rowState]);

  const focusAfterChange = (id: string) => { pendingFocus.current = id; };

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    document.getElementById(id)?.focus();
    pendingFocus.current = null;
  }, [draft]);

  const addString = (kind: Exclude<RowKind, "ingredient">, field: "benefits" | "certifications" | "cautions") => {
    const reconciled = reconcileRows(rowState, rowCounts, rowPrefix);
    const id = `${rowPrefix}-row-${reconciled.nextId}`;
    dispatch({ type: "add", kind, counts: rowCounts, prefix: rowPrefix });
    focusAfterChange(inputId(kind, id));
    onChange({ ...draft, [field]: [...draft[field], ""] });
  };
  const removeString = (kind: Exclude<RowKind, "ingredient">, field: "benefits" | "certifications" | "cautions", index: number) => {
    const ids = [...reconcileRows(rowState, rowCounts, rowPrefix).ids[kind]];
    ids.splice(index, 1);
    const remaining = draft[field].filter((_, itemIndex) => itemIndex !== index);
    dispatch({ type: "remove", kind, index, counts: rowCounts, prefix: rowPrefix });
    focusAfterChange(remaining.length ? inputId(kind, ids[Math.min(index, ids.length - 1)]!) : addButtonId(kind));
    onChange({ ...draft, [field]: remaining });
  };
  const addIngredient = () => {
    const reconciled = reconcileRows(rowState, rowCounts, rowPrefix);
    const id = `${rowPrefix}-row-${reconciled.nextId}`;
    dispatch({ type: "add", kind: "ingredient", counts: rowCounts, prefix: rowPrefix });
    focusAfterChange(inputId("ingredient", id));
    onChange({ ...draft, ingredients: [...draft.ingredients, emptyIngredient()] });
  };
  const removeIngredient = (index: number) => {
    const ids = [...reconcileRows(rowState, rowCounts, rowPrefix).ids.ingredient];
    ids.splice(index, 1);
    const ingredients = draft.ingredients.filter((_, itemIndex) => itemIndex !== index);
    dispatch({ type: "remove", kind: "ingredient", index, counts: rowCounts, prefix: rowPrefix });
    focusAfterChange(ingredients.length ? inputId("ingredient", ids[Math.min(index, ids.length - 1)]!) : addButtonId("ingredient"));
    onChange({ ...draft, ingredients });
  };
  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const ingredients = draft.ingredients.length
      ? draft.ingredients.map((ingredient, itemIndex) => itemIndex === index ? { ...ingredient, [field]: value } : ingredient)
      : [{ ...emptyIngredient(), [field]: value }];
    onChange({ ...draft, ingredients });
  };

  const benefitIds = rowState.ids.benefit;
  const ingredientIds = rowState.ids.ingredient;
  const certificationIds = rowState.ids.certification;
  const cautionIds = rowState.ids.caution;

  return (
    <section className="product-wizard__step-content" aria-labelledby="wizard-details-title">
      <h2 id="wizard-details-title">상세 정보를 입력하세요</h2>
      <p>고객이 이해할 수 있도록 효능, 성분, 섭취 방법을 적습니다.</p>
      <div className="product-wizard__fields">
        <label className="product-wizard__wide"><span>상품 설명</span><textarea value={draft.description} rows={4} onChange={(event) => onChange({ ...draft, description: event.target.value })} /></label>
        <label><span>섭취 방법</span><input id="wizard-dosage" data-wizard-field="dosage" name="dosage" value={draft.dosage} placeholder={dosageHint} onChange={(event) => onChange({ ...draft, dosage: event.target.value })} aria-invalid={Boolean(errors.dosage)} aria-describedby={errors.dosage ? "wizard-dosage-error" : undefined} />{errors.dosage && <small id="wizard-dosage-error">{errors.dosage}</small>}</label>
        <label><span>원산지</span><input id="wizard-origin" data-wizard-field="origin" name="origin" value={draft.origin} onChange={(event) => onChange({ ...draft, origin: event.target.value })} aria-invalid={Boolean(errors.origin)} aria-describedby={errors.origin ? "wizard-origin-error" : undefined} />{errors.origin && <small id="wizard-origin-error">{errors.origin}</small>}</label>
      </div>
      <StringRows label="효능" kind="benefit" rows={draft.benefits} rowIds={benefitIds} onChange={(benefits) => onChange({ ...draft, benefits })} onAdd={() => addString("benefit", "benefits")} onRemove={(index) => removeString("benefit", "benefits", index)} />
      <fieldset className="product-wizard__rows">
        <legend>성분 정보</legend>
        {ingredientRows.slice(0, ingredientIds.length).map((ingredient, index) => {
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
