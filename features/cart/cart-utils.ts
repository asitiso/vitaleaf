import type { CartLine } from "./cart-types";
import { STORE_POLICIES } from "../../lib/site/policies";

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
