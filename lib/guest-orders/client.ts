import type { OrderDraft, PaymentResult } from "../payment/process-payment";
import type { GuestOrderPublic } from "./types";

const ORDER_NUMBER = /^VL-\d{8}-[A-Z0-9]{6}$/u;

export class GuestOrderClientError extends Error {
  constructor(message = "비회원 주문을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
    super(message);
    this.name = "GuestOrderClientError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GuestOrderClientError();
  }
  return value as Record<string, unknown>;
};

const text = (value: unknown, maximum: number): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new GuestOrderClientError();
  }
  return value;
};

const number = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new GuestOrderClientError();
  }
  return value;
};

const integer = (value: unknown): number => {
  const parsed = number(value);
  if (!Number.isInteger(parsed)) throw new GuestOrderClientError();
  return parsed;
};

const parseReceipt = (value: unknown): PaymentResult => {
  const receipt = asRecord(value);
  const orderNumber = text(receipt.orderNumber, 32);
  if (!ORDER_NUMBER.test(orderNumber)) throw new GuestOrderClientError();
  const receivedAt = text(receipt.receivedAt, 64);
  if (Number.isNaN(new Date(receivedAt).getTime())) throw new GuestOrderClientError();
  return { orderNumber, receivedAt };
};

const parsePublicOrder = (value: unknown): GuestOrderPublic => {
  const order = asRecord(value);
  const receipt = parseReceipt(order);
  if (order.status !== "mock-received") throw new GuestOrderClientError();
  if (!Array.isArray(order.lines) || order.lines.length === 0 || order.lines.length > 20) {
    throw new GuestOrderClientError();
  }

  return {
    ...receipt,
    status: order.status,
    customerNameMasked: text(order.customerNameMasked, 50),
    phoneMasked: text(order.phoneMasked, 30),
    addressMasked: text(order.addressMasked, 250),
    lines: order.lines.map((value) => {
      const line = asRecord(value);
      return {
        productId: text(line.productId, 128),
        name: text(line.name, 200),
        thumbnailUrl: text(line.thumbnailUrl, 2_000),
        unitPrice: integer(line.unitPrice),
        quantity: integer(line.quantity),
      };
    }),
    subtotal: integer(order.subtotal),
    shippingFee: integer(order.shippingFee),
    total: integer(order.total),
  };
};

const readMessage = async (response: Response): Promise<string> => {
  try {
    const body = asRecord(await response.json());
    return text(body.message, 200);
  } catch {
    return "비회원 주문을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
};

const post = async (url: string, body: unknown): Promise<unknown> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new GuestOrderClientError(await readMessage(response));
  try {
    return await response.json();
  } catch {
    throw new GuestOrderClientError();
  }
};

export async function createGuestOrder(order: OrderDraft, payment: PaymentResult): Promise<PaymentResult> {
  return parseReceipt(await post("/api/guest-orders", { order, payment }));
}

export async function lookupGuestOrder(orderNumber: string, phone: string): Promise<GuestOrderPublic> {
  const response = asRecord(await post("/api/guest-orders/lookup", { orderNumber, phone }));
  return parsePublicOrder(response.order);
}
