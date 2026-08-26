import { useState } from "react";

import {
  canonicalTaxonomyValue,
  canonicalTaxonomyValues,
  AGE_TARGETS,
  canonicalAgeTargets,
  PRODUCT_CATEGORIES,
  HEALTH_CONCERNS,
  PRODUCT_TEMPLATES,
} from "../../../lib/catalog/taxonomy";
import type { ProductDraft } from "../../../lib/products/types";

type FieldErrors = Partial<Record<"name" | "category", string>>;

export function toSlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const toManualSlug = (value: string): string => value
  .toLocaleLowerCase("en-US")
  .replace(/[^a-z0-9가-힣-]+/g, "-");

type ProductTemplateValue = (typeof PRODUCT_TEMPLATES)[number]["value"];

const productTemplateDetails: Record<ProductTemplateValue, {
  category: string;
  ingredientLabels: string[];
  dosageHint: string;
}> = {
  vitamin: { category: "vitamin", ingredientLabels: ["주성분", "보조 성분"], dosageHint: "예: 1일 1회, 1회 1정" },
  probiotic: { category: "probiotic", ingredientLabels: ["프로바이오틱스", "프리바이오틱스"], dosageHint: "예: 1일 1회, 1회 1포" },
  omega3: { category: "nutrition", ingredientLabels: ["EPA", "DHA"], dosageHint: "예: 1일 1회, 1회 1캡슐" },
};

export const dosageHintForProductTemplate = (template: ProductTemplateValue): string => productTemplateDetails[template].dosageHint;

export const applyProductTemplate = (draft: ProductDraft, template: ProductTemplateValue): ProductDraft => {
  const details = productTemplateDetails[template];
  const ingredients = draft.ingredients.length > 0
    ? draft.ingredients.map((ingredient, index) => ({
      ...ingredient,
      name: ingredient.name.trim() || details.ingredientLabels[index] || "",
    }))
    : details.ingredientLabels.map((name) => ({ name, amount: "", dailyValue: "" }));
  return {
    ...draft,
    category: draft.category.trim() || details.category,
    ingredients,
  };
};

export const hasDraftContent = (draft: ProductDraft): boolean => (
  Object.entries(draft).some(([key, value]) => ![
    "id", "status", "mode", "sessionId", "revision", "sourceProductId", "sourceProductRevision",
    "sourceCreatedAt", "sourceCreatedBy", "currentStep", "createdAt", "updatedAt", "createdBy", "updatedBy",
  ].includes(key) && (
    key === "originalPrice" || key === "salesRank"
      ? value !== null
      : Array.isArray(value)
        ? value.length > 0
        : typeof value === "string"
          ? value.trim().length > 0
          : value !== null && value !== false && value !== 0
  ))
);

export function BasicStep({
  draft,
  errors,
  slugWasManuallyEdited,
  onChange,
  onSlugEdited,
  onTemplateApplied,
}: {
  draft: ProductDraft;
  errors: FieldErrors;
  slugWasManuallyEdited: boolean;
  onChange(next: ProductDraft): void;
  onSlugEdited(): void;
  onTemplateApplied(template: ProductTemplateValue): void;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const categoryValue = canonicalTaxonomyValue(PRODUCT_CATEGORIES, draft.category);
  const concernValues = canonicalTaxonomyValues(HEALTH_CONCERNS, draft.concerns);
  const ageTargetValues = AGE_TARGETS
    .filter((option) => canonicalAgeTargets(draft.ageTargets ?? []).includes(option.value))
    .map((option) => option.value);
  const updateName = (name: string) => {
    const slug = slugWasManuallyEdited ? draft.slug : toSlug(name);
    onChange({ ...draft, name, slug });
  };

  const updateConcern = (concern: string, checked: boolean) => {
    const concerns = checked
      ? [...new Set([...concernValues, concern])]
      : concernValues.filter((item) => item !== concern);
    onChange({ ...draft, concerns });
  };

  const updateAgeTarget = (ageTarget: (typeof AGE_TARGETS)[number]["value"], checked: boolean) => {
    const selected = new Set(ageTargetValues);
    if (checked) selected.add(ageTarget);
    else selected.delete(ageTarget);
    const ageTargets = AGE_TARGETS
      .filter((option) => selected.has(option.value))
      .map((option) => option.value);
    onChange({ ...draft, ageTargets });
  };

  const selectTemplate = (value: string) => {
    setSelectedTemplate(value);
    if (!value) return;
    const selected = PRODUCT_TEMPLATES.find((candidate) => candidate.value === value);
    if (!selected) {
      setSelectedTemplate("");
      return;
    }
    const template = selected.value;
    if (hasDraftContent(draft) && !window.confirm("이미 입력한 내용은 유지하고 비어 있는 항목에만 양식을 적용할까요?")) {
      setSelectedTemplate("");
      return;
    }
    onChange(applyProductTemplate(draft, template));
    onTemplateApplied(template);
  };

  return (
    <section className="product-wizard__step-content" aria-labelledby="wizard-basic-title">
      <h2 id="wizard-basic-title">기본 정보를 입력하세요</h2>
      <p>상품을 찾기 쉽게 이름, 분류, 건강 고민을 정합니다.</p>
      <div className="product-wizard__fields">
        <label>
          <span>상품 등록 양식</span>
          <select aria-label="상품 등록 양식" value={selectedTemplate} onChange={(event) => selectTemplate(event.target.value)}>
            <option value="">양식 선택 (선택)</option>
            {PRODUCT_TEMPLATES.map((template) => <option key={template.value} value={template.value}>{template.label}</option>)}
          </select>
          <small>분류와 빈 성분명만 채웁니다. 효능·인증·판매 정보는 바꾸지 않습니다.</small>
        </label>
        <label>
          <span>상품명</span>
          <input
            id="wizard-name"
            name="name"
            aria-label="상품명"
            value={draft.name}
            onChange={(event) => updateName(event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "wizard-name-error" : undefined}
          />
          {errors.name && <small id="wizard-name-error">{errors.name}</small>}
        </label>
        <label>
          <span>슬러그</span>
          <input
            name="slug"
            aria-label="슬러그"
            value={draft.slug}
            onChange={(event) => {
              onSlugEdited();
              onChange({ ...draft, slug: toManualSlug(event.target.value) });
            }}
            aria-describedby="wizard-slug-help"
          />
          <small id="wizard-slug-help">상품명을 바꾸면 자동으로 만들어집니다. 직접 수정하면 그대로 유지됩니다.</small>
        </label>
        <label>
          <span>상품 분류</span>
          <select
            id="wizard-category"
            name="category"
            aria-label="상품 분류"
            value={categoryValue}
            onChange={(event) => onChange({ ...draft, category: event.target.value })}
            aria-invalid={Boolean(errors.category)}
            aria-describedby={errors.category ? "wizard-category-error" : undefined}
          >
            <option value="">분류를 선택하세요</option>
            {PRODUCT_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {errors.category && <small id="wizard-category-error">{errors.category}</small>}
        </label>
      </div>
      <fieldset className="product-wizard__checks">
        <legend>관련 건강 고민 (선택)</legend>
        {HEALTH_CONCERNS.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={concernValues.includes(option.value)}
              onChange={(event) => updateConcern(option.value, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="product-wizard__checks">
        <legend>추천 연령 (선택)</legend>
        <p className="product-wizard__field-help">실제 표시사항을 확인한 연령만 선택하세요. 선택하지 않으면 연령별 추천에 노출되지 않습니다.</p>
        {AGE_TARGETS.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={ageTargetValues.includes(option.value)}
              onChange={(event) => updateAgeTarget(option.value, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
