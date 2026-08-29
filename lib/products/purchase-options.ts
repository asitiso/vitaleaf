import type { Product, PurchaseOption } from "./types";

export const LEGACY_PURCHASE_OPTION_ID = "default";

type PurchaseOptionSource = Pick<Product, "price" | "stock" | "purchaseOptions">;
type OptionRecord = Record<string, unknown>;

const asRecord = (value: unknown): OptionRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as OptionRecord
    : null;

const requiredText = (value: unknown, field: "id" | "label" | "sku"): string => {
  if (typeof value !== "string") throw new Error(`Purchase option ${field} must be a string.`);
  const text = value.trim();
  if (field !== "sku" && !text) throw new Error(`Purchase option ${field} is required.`);
  return text;
};

const validateLegacyStock = (stock: number): void => {
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("Purchase option stock must be a non-negative integer.");
  }
};

const implicitLegacyOption = (stock: number): PurchaseOption => ({
  id: LEGACY_PURCHASE_OPTION_ID,
  label: "기본 구성",
  durationMonths: null,
  sku: "",
  priceAdjustment: 0,
  stock,
  active: true,
  isDefault: true,
});

const normalizeOption = (raw: unknown, basePrice: number): PurchaseOption => {
  const option = asRecord(raw);
  if (!option) throw new Error("Purchase option must be an object.");

  const durationMonths = option.durationMonths == null
    ? null
    : typeof option.durationMonths === "number" && Number.isInteger(option.durationMonths) && option.durationMonths > 0
      ? option.durationMonths
      : (() => { throw new Error("Purchase option durationMonths must be a positive integer or null."); })();
  const priceAdjustment = option.priceAdjustment;
  if (typeof priceAdjustment !== "number" || !Number.isInteger(priceAdjustment)) {
    throw new Error("Purchase option priceAdjustment must be an integer.");
  }
  const stock = option.stock;
  if (typeof stock !== "number") throw new Error("Purchase option stock must be a non-negative integer.");
  validateLegacyStock(stock);
  if (typeof option.active !== "boolean" || typeof option.isDefault !== "boolean") {
    throw new Error("Purchase option active and isDefault must be boolean values.");
  }
  if (!option.active && option.isDefault) {
    throw new Error("An inactive purchase option cannot be the default.");
  }

  const normalized: PurchaseOption = {
    id: requiredText(option.id, "id"),
    label: requiredText(option.label, "label"),
    durationMonths,
    sku: requiredText(option.sku, "sku"),
    priceAdjustment,
    stock,
    active: option.active,
    isDefault: option.isDefault,
  };
  if (getPurchaseOptionPrice(basePrice, normalized) < 1) {
    throw new Error("Purchase option final price must be at least 1 KRW.");
  }
  return normalized;
};

export const getPurchaseOptionPrice = (basePrice: number, option: PurchaseOption): number =>
  basePrice + option.priceAdjustment;

export const normalizePurchaseOptions = (
  rawOptions: unknown,
  basePrice: number,
  legacyStock: number,
): PurchaseOption[] => {
  if (!Number.isFinite(basePrice)) throw new Error("Product price must be finite.");
  validateLegacyStock(legacyStock);
  if (rawOptions == null || (Array.isArray(rawOptions) && rawOptions.length === 0)) {
    return [implicitLegacyOption(legacyStock)];
  }
  if (!Array.isArray(rawOptions)) throw new Error("Purchase options must be an array.");

  const options = rawOptions.map((raw) => normalizeOption(raw, basePrice));
  const ids = new Set<string>();
  const skus = new Set<string>();
  for (const option of options) {
    if (ids.has(option.id)) throw new Error("Purchase option id values must be unique.");
    ids.add(option.id);
    if (option.sku && skus.has(option.sku)) throw new Error("Purchase option SKU values must be unique.");
    if (option.sku) skus.add(option.sku);
  }

  const defaults = options.filter((option) => option.active && option.isDefault);
  if (defaults.length !== 1) throw new Error("Exactly one active purchase option must be the default.");
  return options;
};

const normalizedOptionsFor = (product: PurchaseOptionSource): PurchaseOption[] =>
  normalizePurchaseOptions(product.purchaseOptions, product.price, product.stock);

export const getDefaultPurchaseOption = (product: PurchaseOptionSource): PurchaseOption => {
  const defaultOption = normalizedOptionsFor(product).find((option) => option.active && option.isDefault);
  if (!defaultOption) throw new Error("Exactly one active purchase option must be the default.");
  return defaultOption;
};

export const getProductDisplayPrice = (product: PurchaseOptionSource): { price: number; varies: boolean } => {
  const prices = normalizedOptionsFor(product)
    .filter((option) => option.active)
    .map((option) => getPurchaseOptionPrice(product.price, option));
  const price = Math.min(...prices);
  return { price, varies: new Set(prices).size > 1 };
};

export const getProductAvailableStock = (product: PurchaseOptionSource): number =>
  normalizedOptionsFor(product)
    .filter((option) => option.active)
    .reduce((total, option) => total + option.stock, 0);
