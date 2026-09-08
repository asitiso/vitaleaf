import type { AdminOrderReference } from "./types";

export class AdminOrderValidationError extends Error {
  constructor() {
    super("주문 정보를 다시 확인해 주세요.");
    this.name = "AdminOrderValidationError";
  }
}

const identifier = (value: unknown): string => {
  if (typeof value !== "string" || value.includes("/") || [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  })) throw new AdminOrderValidationError();
  const result = value.trim();
  if (!result) throw new AdminOrderValidationError();
  return result;
};

export const parseAdminOrderReference = (value: unknown): AdminOrderReference => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminOrderValidationError();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["source", "ownerId", "orderNumber"].includes(key))) {
    throw new AdminOrderValidationError();
  }
  const orderNumber = identifier(record.orderNumber);
  if (record.source === "member") return { source: "member", ownerId: identifier(record.ownerId), orderNumber };
  if (record.source === "guest" && record.ownerId === null) return { source: "guest", ownerId: null, orderNumber };
  throw new AdminOrderValidationError();
};
