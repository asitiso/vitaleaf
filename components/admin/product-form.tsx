"use client";

import { useRef, useState, type FormEvent } from "react";

import type { Ingredient, Product, ProductInput } from "../../lib/products/types";

type ProductFormProps = {
  product?: Product;
  onSave(input: ProductInput): Promise<void> | void;
  onCancel?: () => void;
};

type FormErrors = Partial<Record<"name" | "category" | "price" | "stock", string>>;

const lines = (value: FormDataEntryValue | null): string[] =>
  String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const optionalNumber = (value: FormDataEntryValue | null): number | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const initialIngredient = (): Ingredient => ({ name: "", amount: "", dailyValue: "" });

export function ProductForm({ product, onSave, onCancel }: ProductFormProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(product?.ingredients.length ? product.ingredients : [initialIngredient()]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    setIngredients((current) => current.map((ingredient, currentIndex) => (
      currentIndex === index ? { ...ingredient, [field]: value } : ingredient
    )));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const category = String(form.get("category") ?? "").trim();
    const priceText = String(form.get("price") ?? "").trim();
    const stockText = String(form.get("stock") ?? "").trim();
    const price = Number(priceText);
    const stock = Number(stockText);
    const nextErrors: FormErrors = {};

    if (!name) nextErrors.name = "상품명을 입력해 주세요.";
    if (!category) nextErrors.category = "카테고리를 입력해 주세요.";
    if (!priceText) nextErrors.price = "판매가를 입력해 주세요.";
    else if (!Number.isFinite(price) || price < 0) nextErrors.price = "판매가는 0원 이상이어야 합니다.";
    if (!stockText) nextErrors.stock = "재고를 입력해 주세요.";
    else if (!Number.isFinite(stock) || stock < 0) nextErrors.stock = "재고는 0개 이상이어야 합니다.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const firstInvalid = event.currentTarget.elements.namedItem(Object.keys(nextErrors)[0]);
      if (firstInvalid instanceof HTMLElement) firstInvalid.focus();
      return;
    }

    const cleanIngredients = ingredients
      .map((ingredient) => ({
        name: ingredient.name.trim(),
        amount: ingredient.amount.trim(),
        dailyValue: ingredient.dailyValue.trim(),
      }))
      .filter((ingredient) => ingredient.name);

    const input: ProductInput = {
      name,
      slug: String(form.get("slug") ?? "").trim(),
      category,
      concerns: lines(form.get("concerns")),
      price,
      originalPrice: optionalNumber(form.get("originalPrice")),
      thumbnailUrl: String(form.get("thumbnailUrl") ?? "").trim(),
      images: lines(form.get("images")),
      description: String(form.get("description") ?? "").trim(),
      benefits: lines(form.get("benefits")),
      ingredients: cleanIngredients,
      dosage: String(form.get("dosage") ?? "").trim(),
      origin: String(form.get("origin") ?? "").trim(),
      certifications: lines(form.get("certifications")),
      cautions: lines(form.get("cautions")),
      stock,
      isBest: form.get("isBest") === "on",
      isNew: form.get("isNew") === "on",
      salesRank: optionalNumber(form.get("salesRank")),
      ratingAverage: product?.ratingAverage ?? 0,
      reviewCount: product?.reviewCount ?? 0,
    };

    submitting.current = true;
    setSaving(true);
    setSubmitError("");
    try {
      await onSave(input);
    } catch {
      setSubmitError("상품을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <form className="admin-product-form" aria-label="상품 정보" onSubmit={handleSubmit} noValidate>
      <div className="admin-form-grid">
        <label>
          <span>상품명</span>
          <input name="name" aria-label="상품명" defaultValue={product?.name} required aria-required="true" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "product-name-error" : undefined} />
          {errors.name && <small id="product-name-error">{errors.name}</small>}
        </label>
        <label>
          <span>카테고리</span>
          <input name="category" aria-label="카테고리" defaultValue={product?.category} required aria-required="true" aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? "product-category-error" : undefined} />
          {errors.category && <small id="product-category-error">{errors.category}</small>}
        </label>
        <label>
          <span>슬러그</span>
          <input name="slug" defaultValue={product?.slug} />
        </label>
        <label>
          <span>판매가</span>
          <input name="price" aria-label="판매가" type="number" min="0" defaultValue={product?.price} required aria-required="true" aria-invalid={Boolean(errors.price)} aria-describedby={errors.price ? "product-price-error" : undefined} />
          {errors.price && <small id="product-price-error">{errors.price}</small>}
        </label>
        <label>
          <span>정상가 (선택)</span>
          <input name="originalPrice" type="number" min="0" defaultValue={product?.originalPrice ?? ""} />
        </label>
        <label>
          <span>재고</span>
          <input name="stock" aria-label="재고" type="number" min="0" defaultValue={product?.stock} required aria-required="true" aria-invalid={Boolean(errors.stock)} aria-describedby={errors.stock ? "product-stock-error" : undefined} />
          {errors.stock && <small id="product-stock-error">{errors.stock}</small>}
        </label>
        <label>
          <span>판매 순위 (선택)</span>
          <input name="salesRank" type="number" min="0" defaultValue={product?.salesRank ?? ""} />
        </label>
        <label className="admin-form-wide">
          <span>대표 이미지 URL</span>
          <input name="thumbnailUrl" type="url" defaultValue={product?.thumbnailUrl} />
        </label>
        <label className="admin-form-wide">
          <span>이미지 URL 목록</span>
          <textarea name="images" rows={3} defaultValue={product?.images.join("\n")} placeholder="한 줄에 URL 하나" />
        </label>
        <label className="admin-form-wide">
          <span>상품 설명</span>
          <textarea name="description" rows={4} defaultValue={product?.description} />
        </label>
        <label>
          <span>관심 건강</span>
          <textarea name="concerns" rows={4} defaultValue={product?.concerns.join("\n")} placeholder="한 줄에 하나" />
        </label>
        <label>
          <span>혜택</span>
          <textarea name="benefits" rows={4} defaultValue={product?.benefits.join("\n")} placeholder="한 줄에 하나" />
        </label>
        <label>
          <span>주의사항</span>
          <textarea name="cautions" rows={4} defaultValue={product?.cautions.join("\n")} placeholder="한 줄에 하나" />
        </label>
        <label>
          <span>인증</span>
          <textarea name="certifications" rows={4} defaultValue={product?.certifications.join("\n")} placeholder="한 줄에 하나" />
        </label>
        <label>
          <span>섭취 방법</span>
          <input name="dosage" defaultValue={product?.dosage} />
        </label>
        <label>
          <span>원산지</span>
          <input name="origin" defaultValue={product?.origin} />
        </label>
      </div>

      <fieldset className="admin-ingredients">
        <legend>원료 정보</legend>
        {ingredients.map((ingredient, index) => (
          <div role="group" aria-label={`원료 ${index + 1}`} className="admin-ingredient-row" key={index}>
            <label><span>원료명</span><input value={ingredient.name} onChange={(event) => updateIngredient(index, "name", event.target.value)} /></label>
            <label><span>함량</span><input value={ingredient.amount} onChange={(event) => updateIngredient(index, "amount", event.target.value)} /></label>
            <label><span>일일 기준치</span><input value={ingredient.dailyValue} onChange={(event) => updateIngredient(index, "dailyValue", event.target.value)} /></label>
            <button type="button" aria-label={`원료 ${index + 1} 삭제`} disabled={ingredients.length === 1} onClick={() => setIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index))}>삭제</button>
          </div>
        ))}
        <button type="button" className="admin-secondary-button" onClick={() => setIngredients((current) => [...current, initialIngredient()])}>원료 추가</button>
      </fieldset>

      <div className="admin-form-checks">
        <label><input name="isBest" type="checkbox" defaultChecked={product?.isBest} /> 베스트 상품</label>
        <label><input name="isNew" type="checkbox" defaultChecked={product?.isNew} /> 신상품</label>
      </div>
      {submitError && <p className="admin-error" role="alert">{submitError}</p>}
      <div className="admin-form-actions">
        {onCancel && <button type="button" className="admin-secondary-button" onClick={onCancel}>취소</button>}
        <button type="submit" className="admin-primary-button" disabled={saving}>{saving ? "저장 중" : "상품 저장"}</button>
      </div>
    </form>
  );
}
