import { normalizeMedia } from "./normalize";
import type { ProductDraft, ProductInput } from "./types";

export type DraftValidationError = {
  step: 1 | 2 | 3 | 4;
  field: "name" | "category" | "price" | "stock" | "media" | "dosage" | "ingredients" | "origin" | "cautions";
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
  if (!Number.isFinite(draft.price) || draft.price <= 0) addError(1, "price", "Enter a price greater than zero.");
  if (!Number.isFinite(draft.stock) || draft.stock < 0) addError(1, "stock", "Enter stock as zero or more.");
  if (normalizeMedia(draft.media, draft.thumbnailUrl, draft.images).length === 0) {
    addError(2, "media", "Add at least one product image.");
  }
  if (!isNonEmptyText(draft.dosage)) addError(3, "dosage", "Enter serving instructions.");
  if (draft.ingredients.length === 0) addError(3, "ingredients", "Add at least one ingredient.");
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
    category: draft.category,
    concerns: draft.concerns,
    price: draft.price,
    originalPrice: draft.originalPrice,
    thumbnailUrl: draft.thumbnailUrl,
    images: draft.images,
    description: draft.description,
    benefits: draft.benefits,
    ingredients: draft.ingredients,
    dosage: draft.dosage,
    origin: draft.origin,
    certifications: draft.certifications,
    cautions: draft.cautions,
    stock: draft.stock,
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
