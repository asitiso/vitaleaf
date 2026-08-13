import { PRODUCT_CATEGORIES, HEALTH_CONCERNS } from "../../../lib/catalog/taxonomy";
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

export function BasicStep({
  draft,
  errors,
  slugWasManuallyEdited,
  onChange,
  onSlugEdited,
}: {
  draft: ProductDraft;
  errors: FieldErrors;
  slugWasManuallyEdited: boolean;
  onChange(next: ProductDraft): void;
  onSlugEdited(): void;
}) {
  const updateName = (name: string) => {
    const slug = slugWasManuallyEdited ? draft.slug : toSlug(name);
    onChange({ ...draft, name, slug });
  };

  const updateConcern = (concern: string, checked: boolean) => {
    const concerns = checked
      ? [...draft.concerns, concern]
      : draft.concerns.filter((item) => item !== concern);
    onChange({ ...draft, concerns });
  };

  return (
    <section className="product-wizard__step-content" aria-labelledby="wizard-basic-title">
      <h2 id="wizard-basic-title">기본 정보를 입력하세요</h2>
      <p>상품을 찾기 쉽게 이름, 분류, 건강 고민을 정합니다.</p>
      <div className="product-wizard__fields">
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
            value={draft.category}
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
              checked={draft.concerns.includes(option.value)}
              onChange={(event) => updateConcern(option.value, event.target.checked)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
