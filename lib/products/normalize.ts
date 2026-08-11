import type { Ingredient, Product, ProductMedia } from "./types";

type ProductRecord = Record<string, unknown>;

const asRecord = (value: unknown): ProductRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ProductRecord)
    : {};

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const asIngredients = (value: unknown): Ingredient[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const ingredient = asRecord(item);
        return typeof ingredient.name === "string"
          ? [{ name: ingredient.name, amount: asString(ingredient.amount), dailyValue: asString(ingredient.dailyValue) }]
          : [];
      })
    : [];

const asNullableNonNegativeNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const asNonNegativeNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    const date = typeof toDate === "function" ? toDate.call(value) : null;
    return date instanceof Date ? date : null;
  }
  return null;
};

const defaultAlt = (index: number, isMain: boolean): string =>
  isMain ? "상품 대표 이미지" : `상품 상세 이미지 ${index + 1}`;

const asMedia = (value: unknown, position: number): ProductMedia | null => {
  const media = asRecord(value);
  const url = asString(media.url).trim();
  if (!url) return null;

  return {
    url,
    storagePath: asString(media.storagePath).trim() || null,
    alt: asString(media.alt).trim() || `Product image ${position + 1}`,
    order:
      typeof media.order === "number" && Number.isFinite(media.order) && media.order >= 0
        ? media.order
        : position,
  };
};

const uniqueOrderedMedia = (media: ProductMedia[]): ProductMedia[] => {
  const seenUrls = new Set<string>();
  return media
    .filter((item) => {
      if (seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    })
    .sort((left, right) => left.order - right.order);
};

export const normalizeMedia = (
  rawMedia: unknown,
  legacyThumbnailUrl: unknown,
  legacyImages: unknown,
): ProductMedia[] => {
  const standardMedia = Array.isArray(rawMedia)
    ? rawMedia.flatMap((item, position) => {
        const media = asMedia(item, position);
        return media ? [media] : [];
      })
    : [];

  if (standardMedia.length > 0) return uniqueOrderedMedia(standardMedia);

  const legacyUrls = [...new Set(
    [asString(legacyThumbnailUrl), ...asStringArray(legacyImages)]
      .map((url) => url.trim())
      .filter(Boolean),
  )];

  return uniqueOrderedMedia(
    legacyUrls.map((url, index) => ({
      url,
      storagePath: null,
      alt: defaultAlt(index, index === 0),
      order: index,
    })),
  );
};

export const normalizeProduct = (id: string, raw: unknown): Product => {
  const product = asRecord(raw);
  const media = normalizeMedia(product.media, product.thumbnailUrl, product.images);
  const name = asString(product.name).trim();
  if (!name) throw new Error("상품명이 필요합니다");

  if (typeof product.price !== "number" || !Number.isFinite(product.price) || product.price < 0) {
    throw new Error("가격은 0 이상의 유한한 숫자여야 합니다");
  }

  if (typeof product.stock !== "number" || !Number.isFinite(product.stock) || product.stock < 0) {
    throw new Error("재고는 0 이상의 숫자여야 합니다");
  }

  return {
    id,
    name,
    slug: asString(product.slug),
    category: asString(product.category),
    concerns: asStringArray(product.concerns),
    price: product.price,
    originalPrice: asNullableNonNegativeNumber(product.originalPrice),
    thumbnailUrl: media[0]?.url ?? "",
    images: media.map((item) => item.url),
    media,
    description: asString(product.description),
    benefits: asStringArray(product.benefits),
    ingredients: asIngredients(product.ingredients),
    dosage: asString(product.dosage),
    origin: asString(product.origin),
    certifications: asStringArray(product.certifications),
    cautions: asStringArray(product.cautions),
    stock: product.stock,
    isBest: product.isBest === true,
    isNew: product.isNew === true,
    salesRank: asNullableNonNegativeNumber(product.salesRank),
    ratingAverage: Math.min(5, Math.max(0, asNonNegativeNumber(product.ratingAverage))),
    reviewCount: asNonNegativeNumber(product.reviewCount),
    createdAt: asDate(product.createdAt),
    updatedAt: asDate(product.updatedAt),
  };
};
