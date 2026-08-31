import type { CartLine } from "./cart-types";
import { STORE_POLICIES } from "../../lib/site/policies";
import { LEGACY_PURCHASE_OPTION_ID } from "../../lib/products/purchase-options";

const LEGACY_PURCHASE_OPTION_LABEL = "기본 구성";

export function cartLineId(productId: string, optionId: string) {
  return JSON.stringify([productId, optionId]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStoredOption(line: Record<string, unknown>) {
  const hasOptionSnapshot = "purchaseOptionId" in line
    || "purchaseOptionLabel" in line
    || "sku" in line;

  if (!hasOptionSnapshot) {
    return {
      purchaseOptionId: LEGACY_PURCHASE_OPTION_ID,
      purchaseOptionLabel: LEGACY_PURCHASE_OPTION_LABEL,
      sku: "",
    };
  }

  if (
    typeof line.purchaseOptionId !== "string"
    || line.purchaseOptionId.trim() === ""
    || typeof line.purchaseOptionLabel !== "string"
    || line.purchaseOptionLabel.trim() === ""
    || typeof line.sku !== "string"
  ) {
    return null;
  }

  return {
    purchaseOptionId: line.purchaseOptionId,
    purchaseOptionLabel: line.purchaseOptionLabel,
    sku: line.sku,
  };
}

export function calculateCart(lines: CartLine[]) {
  const subtotal = lines.reduce(
    (sum, line) => sum + (line.selected ? line.unitPrice * line.quantity : 0),
    0,
  );

  if (subtotal === 0) {
    return { subtotal: 0, shippingFee: 0, total: 0, remainingForFreeShipping: 0 };
  }

  const shippingFee = subtotal >= STORE_POLICIES.shipping.freeThreshold ? 0 : STORE_POLICIES.shipping.baseFee;

  return {
    subtotal,
    shippingFee,
    total: subtotal + shippingFee,
    remainingForFreeShipping: Math.max(STORE_POLICIES.shipping.freeThreshold - subtotal, 0),
  };
}

export function clampQuantity(line: CartLine, next: number) {
  const requestedQuantity = Number.isFinite(next) ? Math.trunc(next) : 1;
  const availableStock = Number.isFinite(line.stock) ? Math.max(Math.trunc(line.stock), 1) : 1;

  return Math.min(Math.max(requestedQuantity, 1), availableStock);
}

export function normalizeStoredCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const option = normalizeStoredOption(entry);
    if (
      option === null
      || typeof entry.productId !== "string"
      || entry.productId.trim() === ""
      || typeof entry.name !== "string"
      || typeof entry.thumbnailUrl !== "string"
      || typeof entry.unitPrice !== "number"
      || !Number.isFinite(entry.unitPrice)
      || entry.unitPrice < 0
      || typeof entry.stock !== "number"
      || !Number.isFinite(entry.stock)
      || entry.stock < 0
      || typeof entry.quantity !== "number"
      || !Number.isFinite(entry.quantity)
      || typeof entry.selected !== "boolean"
    ) {
      return [];
    }

    const line: CartLine = {
      lineId: cartLineId(entry.productId, option.purchaseOptionId),
      productId: entry.productId,
      ...option,
      name: entry.name,
      thumbnailUrl: entry.thumbnailUrl,
      unitPrice: entry.unitPrice,
      stock: Math.trunc(entry.stock),
      quantity: 1,
      selected: entry.selected,
    };

    return [{ ...line, quantity: clampQuantity(line, entry.quantity) }];
  });
}
