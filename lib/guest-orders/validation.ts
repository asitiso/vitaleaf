import type { GuestOrderCreateInput } from "./types";

const ORDER_NUMBER = /^VL-\d{8}-[A-Z0-9]{6}$/u;
const PHONE = /^0\d{9,10}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{20,128}$/u;

const hasControlCharacter = (value: string): boolean => [...value].some((character) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
});

export class GuestOrderValidationError extends Error {
  constructor(message = "비회원 주문 정보를 다시 확인해 주세요.") {
    super(message);
    this.name = "GuestOrderValidationError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GuestOrderValidationError();
  }
  return value as Record<string, unknown>;
};

const boundedText = (
  value: unknown,
  maximum: number,
  { required = true }: { required?: boolean } = {},
): string => {
  if (typeof value !== "string" || value.length > maximum || hasControlCharacter(value)) {
    throw new GuestOrderValidationError();
  }
  const normalized = value.trim();
  if (required && normalized.length === 0) throw new GuestOrderValidationError();
  return normalized;
};

export const normalizePhone = (value: string): string => {
  if (typeof value !== "string" || value.length > 30 || hasControlCharacter(value)) {
    throw new GuestOrderValidationError();
  }
  const normalized = value.replace(/\D/gu, "");
  if (!PHONE.test(normalized)) throw new GuestOrderValidationError();
  return normalized;
};

const parsePaymentMethod = (value: unknown): GuestOrderCreateInput["paymentMethod"] => {
  if (value === "card" || value === "bank" || value === "easy") return value;
  throw new GuestOrderValidationError();
};

const parseLines = (value: unknown): GuestOrderCreateInput["lines"] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new GuestOrderValidationError();
  }
  const seen = new Set<string>();
  return value.map((rawLine) => {
    const line = asRecord(rawLine);
    const productId = boundedText(line.productId, 128);
    if (seen.has(productId)) throw new GuestOrderValidationError();
    seen.add(productId);
    if (
      typeof line.quantity !== "number"
      || !Number.isInteger(line.quantity)
      || line.quantity < 1
      || line.quantity > 999
    ) {
      throw new GuestOrderValidationError();
    }
    return { productId, quantity: line.quantity };
  });
};

export const parseGuestOrderCreateInput = (value: unknown): GuestOrderCreateInput => {
  const input = asRecord(value);
  return {
    customerName: boundedText(input.customerName, 50),
    phone: normalizePhone(boundedText(input.phone, 30)),
    postcode: boundedText(input.postcode, 10),
    address: boundedText(input.address, 200),
    addressDetail: boundedText(input.addressDetail, 100),
    deliveryNote: boundedText(input.deliveryNote ?? "", 200, { required: false }),
    paymentMethod: parsePaymentMethod(input.paymentMethod),
    lines: parseLines(input.lines),
  };
};

export const parseGuestOrderLookupInput = (
  value: unknown,
): { orderNumber: string; phone: string } => {
  const input = asRecord(value);
  const orderNumber = boundedText(input.orderNumber, 32);
  if (!ORDER_NUMBER.test(orderNumber)) throw new GuestOrderValidationError();
  return { orderNumber, phone: normalizePhone(boundedText(input.phone, 30)) };
};

export const parseIdempotencyKey = (value: unknown): string => {
  const idempotencyKey = boundedText(value, 128);
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) throw new GuestOrderValidationError();
  return idempotencyKey;
};

export const parsePaymentResult = (value: unknown): { orderNumber: string; receivedAt: Date } => {
  const payment = asRecord(value);
  const orderNumber = boundedText(payment.orderNumber, 32);
  if (!ORDER_NUMBER.test(orderNumber)) throw new GuestOrderValidationError();
  const receivedAtValue = boundedText(payment.receivedAt, 64);
  const receivedAt = new Date(receivedAtValue);
  if (Number.isNaN(receivedAt.getTime())) throw new GuestOrderValidationError();
  return { orderNumber, receivedAt };
};

export const maskPhone = (phone: string): string => phone
  .replace(/(\d{3})(\d{3,4})(\d{4})/u, "$1-$2-$3")
  .replace(/-(\d{3,4})-/u, "-****-");

export const maskName = (name: string): string => name.length < 2
  ? "*"
  : `${name[0]}${"*".repeat(Math.max(1, name.length - 1))}`;

export const maskAddress = (postcode: string, address: string): string =>
  `${postcode} ${address.split(/\s+/u).slice(0, 2).join(" ")} ***`;
