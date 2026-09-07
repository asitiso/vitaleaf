export const ORDER_STATUSES = [
  "mock-received", "preparing", "shipped", "completed", "cancelled",
] as const;

export type OrderStatus = typeof ORDER_STATUSES[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  "mock-received": "접수",
  preparing: "상품 준비",
  shipped: "배송 중",
  completed: "완료",
  cancelled: "취소",
};

export type OrderOperations = {
  status: OrderStatus;
  isTestOrder: boolean;
  shippingCarrier: string;
  trackingNumber: string;
  statusUpdatedAt: Date | null;
  statusUpdatedBy: string;
};

export class OrderOperationsValidationError extends Error {}

export type OrderOperationsUpdate = {
  status: OrderStatus;
  shippingCarrier: string;
  trackingNumber: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asString = (value: unknown): string => typeof value === "string" ? value : "";

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "object" || value === null || !("toDate" in value)) return null;

  const toDate = (value as { toDate?: unknown }).toDate;
  if (typeof toDate !== "function") return null;
  try {
    const date = toDate.call(value);
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
};

export function normalizeOrderStatus(value: unknown): OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus)
    ? value as OrderStatus
    : "mock-received";
}

export function normalizeOrderOperations(value: unknown): OrderOperations {
  const record = asRecord(value);
  return {
    status: normalizeOrderStatus(record.status),
    isTestOrder: record.isTestOrder === true,
    shippingCarrier: asString(record.shippingCarrier),
    trackingNumber: asString(record.trackingNumber),
    statusUpdatedAt: asDate(record.statusUpdatedAt),
    statusUpdatedBy: asString(record.statusUpdatedBy),
  };
}

export function parseOrderOperationsUpdate(value: unknown): OrderOperationsUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrderOperationsValidationError("주문 처리 정보를 다시 확인해 주세요.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["status", "shippingCarrier", "trackingNumber"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new OrderOperationsValidationError("주문 처리 정보를 다시 확인해 주세요.");
  }
  if (!ORDER_STATUSES.includes(record.status as OrderStatus)) {
    throw new OrderOperationsValidationError("주문 처리 정보를 다시 확인해 주세요.");
  }
  const status = record.status as OrderStatus;
  const shippingCarrier = typeof record.shippingCarrier === "string"
    ? record.shippingCarrier.trim()
    : "";
  const trackingNumber = typeof record.trackingNumber === "string"
    ? record.trackingNumber.trim()
    : "";
  if (status === "shipped" && (!shippingCarrier || !trackingNumber)) {
    throw new OrderOperationsValidationError("배송사와 송장번호를 입력해 주세요.");
  }
  return {
    status,
    shippingCarrier: status === "shipped" ? shippingCarrier : "",
    trackingNumber: status === "shipped" ? trackingNumber : "",
  };
}
