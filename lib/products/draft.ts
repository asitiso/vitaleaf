import { normalizeMedia } from "./normalize";
import { getProductAvailableStock, normalizePurchaseOptions } from "./purchase-options";
import { isSafeIntegerKrw } from "./price";
import { canonicalAgeTargets, canonicalTaxonomyValue, canonicalTaxonomyValues, HEALTH_CONCERNS, PRODUCT_CATEGORIES } from "../catalog/taxonomy";
import type { ProductDraft, ProductInput } from "./types";

export type DraftValidationError = {
  step: 1 | 2 | 3 | 4;
  field: "name" | "category" | "price" | "originalPrice" | "stock" | "media" | "dosage" | "ingredients" | "origin" | "cautions" | "purchaseOptions";
  message: string;
};

const isNonEmptyText = (value: string): boolean => value.trim().length > 0;

export const validatePublishableDraft = (draft: ProductDraft): DraftValidationError[] => {
  const errors: DraftValidationError[] = [];
  const addError = (step: DraftValidationError["step"], field: DraftValidationError["field"], message: string) => {
    errors.push({ step, field, message });
  };

  if (!isNonEmptyText(draft.name)) addError(1, "name", "Enter a product name.");
  if (!isNonEmptyText(draft.category)) addError(1, "category", "Choose a product category.");
  if (!isSafeIntegerKrw(draft.price, 1)) addError(1, "price", "Enter a whole-won price greater than zero.");
  if (draft.originalPrice !== null && !isSafeIntegerKrw(draft.originalPrice)) {
    addError(1, "originalPrice", "Enter an original price as a non-negative whole-won amount.");
  }
  const hasValidLegacyStock = Number.isInteger(draft.stock) && draft.stock >= 0;
  if (!hasValidLegacyStock) addError(1, "stock", "Enter stock as a non-negative integer.");
  if (isSafeIntegerKrw(draft.price, 1) && hasValidLegacyStock) {
    try {
      normalizePurchaseOptions(draft.purchaseOptions, draft.price, draft.stock);
    } catch {
      addError(4, "purchaseOptions", "구매 옵션의 기본 구성, SKU, 재고와 최종 가격을 확인해 주세요.");
    }
  }
  if (normalizeMedia(draft.media, draft.thumbnailUrl, draft.images).length === 0) {
    addError(2, "media", "Add at least one product image.");
  }
  if (!isNonEmptyText(draft.dosage)) addError(3, "dosage", "Enter serving instructions.");
  if (draft.ingredients.length === 0 || draft.ingredients.some((ingredient) => !isNonEmptyText(ingredient.name))) {
    addError(3, "ingredients", "Add at least one ingredient with a name.");
  }
  if (!isNonEmptyText(draft.origin)) addError(4, "origin", "Enter the country of origin.");
  if (draft.cautions.length === 0 || !draft.cautions.some(isNonEmptyText)) {
    addError(4, "cautions", "Add at least one precaution.");
  }

  return errors;
};

export const toPublishedProductInput = (draft: ProductDraft): ProductInput & { media: ProductDraft["media"] } => {
  const input: ProductInput = {
    name: draft.name,
    slug: draft.slug,
    category: canonicalTaxonomyValue(PRODUCT_CATEGORIES, draft.category),
    concerns: canonicalTaxonomyValues(HEALTH_CONCERNS, draft.concerns),
    ageTargets: canonicalAgeTargets(draft.ageTargets ?? []),
    price: draft.price,
    originalPrice: draft.originalPrice,
    thumbnailUrl: draft.thumbnailUrl,
    images: draft.images,
    description: draft.description,
    benefits: [...draft.benefits],
    ingredients: draft.ingredients.map((ingredient) => ({ ...ingredient })),
    dosage: draft.dosage,
    origin: draft.origin,
    certifications: [...draft.certifications],
    cautions: [...draft.cautions],
    stock: getProductAvailableStock(draft),
    ...(draft.purchaseOptions === undefined
      ? {}
      : { purchaseOptions: draft.purchaseOptions.map((option) => ({ ...option })) }),
    isBest: draft.isBest,
    isNew: draft.isNew,
    salesRank: draft.salesRank,
    ratingAverage: draft.ratingAverage,
    reviewCount: draft.reviewCount,
  };
  const media = normalizeMedia(draft.media, input.thumbnailUrl, input.images);

  return {
    ...input,
    media,
    thumbnailUrl: media[0]?.url ?? "",
    images: media.map((item) => item.url),
  };
};
