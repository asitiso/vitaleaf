import type { CartLine } from "@/features/cart/cart-types";

export type OrderDraft = {
  customerName: string;
  phone: string;
  postcode: string;
  address: string;
  addressDetail: string;
  deliveryNote: string;
  paymentMethod: "card" | "bank" | "easy";
  lines: CartLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
};

export type PaymentResult = {
  orderNumber: string;
  receivedAt: string;
};

const ORDER_CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function createOrderCode() {
  const randomValues = new Uint32Array(6);
  globalThis.crypto.getRandomValues(randomValues);

  return Array.from(
    randomValues,
    (value) => ORDER_CODE_CHARACTERS[value % ORDER_CODE_CHARACTERS.length],
  ).join("");
}

export async function processPayment(
  orderDraft: OrderDraft,
  now = new Date(),
): Promise<PaymentResult> {
  void orderDraft;
  const receivedAt = now.toISOString();
  const date = receivedAt.slice(0, 10).replaceAll("-", "");

  return {
    orderNumber: `VL-${date}-${createOrderCode()}`,
    receivedAt,
  };
}
