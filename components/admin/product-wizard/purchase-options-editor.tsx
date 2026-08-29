import { useId, useLayoutEffect, useRef, useState } from "react";

import { formatWon } from "../../../lib/format";
import { getPurchaseOptionPrice, normalizePurchaseOptions } from "../../../lib/products/purchase-options";
import type { PurchaseOption } from "../../../lib/products/types";

type PurchaseOptionsEditorProps = {
  basePrice: number;
  options: PurchaseOption[];
  errors: readonly string[];
  onChange(options: PurchaseOption[]): void;
};

type NumericOptionInputProps = {
  id: string;
  label: string;
  value: number | null;
  min?: number;
  onChange(value: number | null): void;
};

const formatEditableWon = (value: number): string => (
  Number.isFinite(value) ? formatWon(value) : "입력 필요"
);

const formatSignedWon = (value: number): string => (
  Number.isFinite(value) ? `${value > 0 ? "+" : ""}${formatWon(value)}` : "입력 필요"
);

const optionLabelId = (id: string): string => `purchase-option-${id}-label`;
const optionInputId = (id: string, field: string): string => `purchase-option-${id}-${field}`;

function NumericOptionInput({ id, label, value, min, onChange }: NumericOptionInputProps) {
  const [editing, setEditing] = useState(() => ({ sourceValue: value, text: value === null ? "" : String(value) }));
  const text = Object.is(editing.sourceValue, value)
    ? editing.text
    : value === null ? "" : String(value);

  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      step="1"
      min={min}
      value={text}
      onChange={(event) => {
        const nextText = event.currentTarget.value;
        let nextValue: number | null;
        if (nextText.trim() === "") {
          nextValue = label.endsWith("기간 (개월)") ? null : Number.NaN;
        } else {
          nextValue = Number(nextText);
        }
        setEditing({ sourceValue: nextValue, text: nextText });
        onChange(nextValue);
      }}
    />
  );
}

const canonicalValidationError = (basePrice: number, options: PurchaseOption[]): string | null => {
  try {
    const explicitLegacyStock = options.length === 1 && options[0]?.stock === 0 ? 1 : 0;
    normalizePurchaseOptions(options, basePrice, explicitLegacyStock);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Purchase options are invalid.";
  }
};

const suggestedSku = (preferred: string, options: PurchaseOption[]): string => {
  const used = new Set(options.map((option) => option.sku.trim()).filter(Boolean));
  if (!used.has(preferred)) return preferred;
  let suffix = 2;
  while (used.has(`${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`;
};

export function PurchaseOptionsEditor({ basePrice, options, errors, onChange }: PurchaseOptionsEditorProps) {
  const defaultGroupName = useId();
  const pendingFocusId = useRef<string | null>(null);
  const canonicalError = canonicalValidationError(basePrice, options);
  const visibleErrors = [...new Set([...errors, ...(canonicalError ? [canonicalError] : [])])];

  useLayoutEffect(() => {
    if (!pendingFocusId.current) return;
    document.getElementById(pendingFocusId.current)?.focus();
    pendingFocusId.current = null;
  }, [options]);

  const update = (index: number, patch: Partial<PurchaseOption>) => {
    onChange(options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option));
  };

  const add = () => {
    const id = crypto.randomUUID();
    pendingFocusId.current = optionLabelId(id);
    onChange([...options, {
      id,
      label: "",
      durationMonths: null,
      sku: suggestedSku(`OPTION-${options.length + 1}`, options),
      priceAdjustment: 0,
      stock: 0,
      active: true,
      isDefault: options.length === 0,
    }]);
  };

  const clone = (index: number) => {
    const source = options[index]!;
    const id = crypto.randomUUID();
    pendingFocusId.current = optionLabelId(id);
    const preferredSku = source.sku.trim() ? `${source.sku.trim()}-COPY` : `OPTION-${options.length + 1}`;
    const copy: PurchaseOption = {
      ...source,
      id,
      sku: suggestedSku(preferredSku, options),
      isDefault: false,
    };
    const next = [...options];
    next.splice(index + 1, 0, copy);
    onChange(next);
  };

  const remove = (index: number) => {
    const next = options.filter((_, optionIndex) => optionIndex !== index);
    const nearest = next[Math.min(index, next.length - 1)];
    pendingFocusId.current = nearest ? optionLabelId(nearest.id) : "purchase-option-add";
    onChange(next);
  };

  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= options.length) return;
    const next = [...options];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    onChange(next);
  };

  const makeDefault = (index: number) => {
    onChange(options.map((option, optionIndex) => ({
      ...option,
      active: optionIndex === index ? true : option.active,
      isDefault: optionIndex === index,
    })));
  };

  return (
    <fieldset
      id="wizard-purchase-options"
      className="purchase-options-editor"
      aria-invalid={visibleErrors.length > 0}
      aria-describedby={visibleErrors.length ? "purchase-options-errors" : undefined}
      tabIndex={-1}
    >
      <legend>구매 옵션 관리</legend>
      <p>밀봉된 판매 단위별 이름, 가격 조정액과 재고를 관리합니다.</p>
      <p className="purchase-options-editor__base-price">기본 판매가 <strong>{formatEditableWon(basePrice)}</strong></p>

      <div className="purchase-options-editor__list">
        {options.map((option, index) => {
          const position = index + 1;
          const finalPrice = getPurchaseOptionPrice(basePrice, option);
          return (
            <section
              key={option.id}
              className="purchase-options-editor__row"
              role="group"
              aria-label={`옵션 ${position} · ${option.label.trim() || "이름 없음"}`}
            >
              <header>
                <strong>옵션 {position}</strong>
                <div className="purchase-options-editor__actions">
                  <button type="button" onClick={() => clone(index)} aria-label={`옵션 ${position} 복제`}>복제</button>
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`옵션 ${position} 위로 이동`}>위로</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === options.length - 1} aria-label={`옵션 ${position} 아래로 이동`}>아래로</button>
                  <button type="button" onClick={() => remove(index)} aria-label={`옵션 ${position} 삭제`}>삭제</button>
                </div>
              </header>

              <div className="purchase-options-editor__fields">
                <label>
                  <span>옵션 이름</span>
                  <input
                    id={optionLabelId(option.id)}
                    aria-label={`옵션 ${position} 이름`}
                    value={option.label}
                    onChange={(event) => update(index, { label: event.currentTarget.value })}
                  />
                </label>
                <label htmlFor={optionInputId(option.id, "duration")}>
                  <span>기간 (개월, 선택)</span>
                  <NumericOptionInput
                    id={optionInputId(option.id, "duration")}
                    label={`옵션 ${position} 기간 (개월)`}
                    value={option.durationMonths}
                    min={1}
                    onChange={(durationMonths) => update(index, { durationMonths })}
                  />
                </label>
                <label>
                  <span>SKU</span>
                  <input
                    aria-label={`옵션 ${position} SKU`}
                    value={option.sku}
                    onChange={(event) => update(index, { sku: event.currentTarget.value })}
                  />
                </label>
                <label htmlFor={optionInputId(option.id, "adjustment")}>
                  <span>가격 조정액</span>
                  <NumericOptionInput
                    id={optionInputId(option.id, "adjustment")}
                    label={`옵션 ${position} 가격 조정액`}
                    value={option.priceAdjustment}
                    onChange={(priceAdjustment) => update(index, { priceAdjustment: priceAdjustment ?? Number.NaN })}
                  />
                </label>
                <label htmlFor={optionInputId(option.id, "stock")}>
                  <span>재고</span>
                  <NumericOptionInput
                    id={optionInputId(option.id, "stock")}
                    label={`옵션 ${position} 재고`}
                    value={option.stock}
                    min={0}
                    onChange={(stock) => update(index, { stock: stock ?? Number.NaN })}
                  />
                </label>
              </div>

              <div className="purchase-options-editor__toggles">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`옵션 ${position} 판매 활성`}
                    checked={option.active}
                    onChange={(event) => update(index, { active: event.currentTarget.checked })}
                  />
                  판매 활성
                </label>
                <label>
                  <input
                    type="radio"
                    name={defaultGroupName}
                    aria-label={`옵션 ${position} 기본 옵션`}
                    checked={option.isDefault}
                    onChange={() => makeDefault(index)}
                  />
                  기본 옵션
                </label>
              </div>

              <div className="purchase-options-editor__prices" aria-label={`옵션 ${position} 가격 계산`}>
                <span>기본가격 {formatEditableWon(basePrice)}</span>
                <span>조정액 {formatSignedWon(option.priceAdjustment)}</span>
                <output>최종가격 {formatEditableWon(finalPrice)}</output>
              </div>
            </section>
          );
        })}
      </div>

      {visibleErrors.length > 0 && (
        <div id="purchase-options-errors" className="purchase-options-editor__errors" role="alert">
          {visibleErrors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}

      <button id="purchase-option-add" type="button" className="admin-secondary-button" onClick={add}>구매 옵션 추가</button>
    </fieldset>
  );
}
