import type { CartLine } from "./cart-types";

const FREE_SHIPPING_THRESHOLD = 30_000;
const SHIPPING_FEE = 3_000;

export function calculateCart(lines: CartLine[]) {
  const subtotal = lines.reduce(
    (sum, line) => sum + (line.selected ? line.unitPrice * line.quantity : 0),
    0,
  );

  if (subtotal === 0) {
    return { subtotal: 0, shippingFee: 0, total: 0, remainingForFreeShipping: 0 };
  }

  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;

  return {
    subtotal,
    shippingFee,
    total: subtotal + shippingFee,
    remainingForFreeShipping: Math.max(FREE_SHIPPING_THRESHOLD - subtotal, 0),
  };
}

export function clampQuantity(line: CartLine, next: number) {
  const requestedQuantity = Number.isFinite(next) ? Math.trunc(next) : 1;
  const availableStock = Number.isFinite(line.stock) ? Math.max(Math.trunc(line.stock), 1) : 1;

  return Math.min(Math.max(requestedQuantity, 1), availableStock);
}
