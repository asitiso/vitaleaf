import { getCurrentFirebaseIdToken } from "../firebase/id-token";
import {
  ORDER_STATUSES,
  parseOrderOperationsUpdate,
  type OrderOperationsUpdate,
  type OrderStatus,
} from "../orders/operations";
import type { MemberOrderSnapshotLine } from "../firebase/member-orders";
import type { AdminOrderDetail, AdminOrderListItem, AdminOrderReference } from "./types";
import { parseAdminOrderReference } from "./validation";

const endpoint = "/api/admin/orders";
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const LIST_KEYS = [
  "source",
  "ownerId",
  "orderNumber",
  "customerName",
  "createdAt",
  "itemSummary",
  "total",
  "status",
  "isTestOrder",
] as const;
const DETAIL_KEYS = [
  ...LIST_KEYS,
  "phone",
  "shippingAddress",
  "deliveryNote",
  "paymentMethod",
  "lines",
  "subtotal",
  "shippingFee",
  "receivedAt",
  "shippingCarrier",
  "trackingNumber",
  "statusUpdatedAt",
  "statusUpdatedBy",
] as const;
const LINE_KEYS = [
  "productId",
  "purchaseOptionId",
  "purchaseOptionLabel",
  "sku",
  "name",
  "thumbnailUrl",
  "basePrice",
  "priceAdjustment",
  "quantity",
  "unitPrice",
  "lineTotal",
] as const;

const GENERIC_ERROR = "관리자 주문 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const AUTHORIZATION_ERROR = "관리자 권한을 확인하고 다시 로그인해 주세요.";

export class AdminOrderClientError extends Error {
  constructor(message = GENERIC_ERROR, readonly status?: number) {
    super(message);
    this.name = "AdminOrderClientError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AdminOrderClientError();
  }
  return value as Record<string, unknown>;
};

const requireExactKeys = (record: Record<string, unknown>, expected: readonly string[]): void => {
  const keys = Object.keys(record);
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(record, key))) {
    throw new AdminOrderClientError();
  }
};

const string = (value: unknown): string => {
  if (typeof value !== "string") throw new AdminOrderClientError();
  return value;
};

const boolean = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new AdminOrderClientError();
  return value;
};

const identifier = (value: unknown): string => {
  const result = string(value);
  if (
    !result
    || result.trim() !== result
    || result.includes("/")
    || [...result].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  ) {
    throw new AdminOrderClientError();
  }
  return result;
};

const nonnegativeInteger = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AdminOrderClientError();
  }
  return value;
};

const signedInteger = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new AdminOrderClientError();
  }
  return value;
};

const positiveInteger = (value: unknown): number => {
  const result = nonnegativeInteger(value);
  if (result === 0) throw new AdminOrderClientError();
  return result;
};

const nullableTimestamp = (value: unknown): string | null => {
  if (value === null) return null;
  const timestamp = string(value);
  const date = new Date(timestamp);
  if (!ISO_TIMESTAMP.test(timestamp) || Number.isNaN(date.getTime()) || date.toISOString() !== timestamp) {
    throw new AdminOrderClientError();
  }
  return timestamp;
};

const status = (value: unknown): OrderStatus => {
  if (!ORDER_STATUSES.includes(value as OrderStatus)) throw new AdminOrderClientError();
  return value as OrderStatus;
};

const reference = (record: Record<string, unknown>): AdminOrderReference => {
  const source = record.source;
  const orderNumber = identifier(record.orderNumber);
  if (source === "member") {
    return { source, ownerId: identifier(record.ownerId), orderNumber };
  }
  if (source === "guest" && record.ownerId === null) {
    return { source, ownerId: null, orderNumber };
  }
  throw new AdminOrderClientError();
};

const parseListItem = (value: unknown): AdminOrderListItem => {
  const record = asRecord(value);
  requireExactKeys(record, LIST_KEYS);
  return {
    ...reference(record),
    customerName: string(record.customerName),
    createdAt: nullableTimestamp(record.createdAt),
    itemSummary: string(record.itemSummary),
    total: nonnegativeInteger(record.total),
    status: status(record.status),
    isTestOrder: boolean(record.isTestOrder),
  };
};

const parseLine = (value: unknown): MemberOrderSnapshotLine => {
  const line = asRecord(value);
  requireExactKeys(line, LINE_KEYS);
  return {
    productId: string(line.productId),
    purchaseOptionId: string(line.purchaseOptionId),
    purchaseOptionLabel: string(line.purchaseOptionLabel),
    sku: string(line.sku),
    name: string(line.name),
    thumbnailUrl: string(line.thumbnailUrl),
    basePrice: nonnegativeInteger(line.basePrice),
    priceAdjustment: signedInteger(line.priceAdjustment),
    quantity: positiveInteger(line.quantity),
    unitPrice: nonnegativeInteger(line.unitPrice),
    lineTotal: nonnegativeInteger(line.lineTotal),
  };
};

const parseDetail = (value: unknown): AdminOrderDetail => {
  const order = asRecord(value);
  requireExactKeys(order, DETAIL_KEYS);
  const shippingAddress = asRecord(order.shippingAddress);
  requireExactKeys(shippingAddress, ["postcode", "address", "addressDetail"]);
  if (!Array.isArray(order.lines)) throw new AdminOrderClientError();
  if (order.paymentMethod !== "card" && order.paymentMethod !== "bank" && order.paymentMethod !== "easy") {
    throw new AdminOrderClientError();
  }
  return {
    ...reference(order),
    customerName: string(order.customerName),
    createdAt: nullableTimestamp(order.createdAt),
    itemSummary: string(order.itemSummary),
    total: nonnegativeInteger(order.total),
    status: status(order.status),
    isTestOrder: boolean(order.isTestOrder),
    phone: string(order.phone),
    shippingAddress: {
      postcode: string(shippingAddress.postcode),
      address: string(shippingAddress.address),
      addressDetail: string(shippingAddress.addressDetail),
    },
    deliveryNote: string(order.deliveryNote),
    paymentMethod: order.paymentMethod,
    lines: order.lines.map(parseLine),
    subtotal: nonnegativeInteger(order.subtotal),
    shippingFee: nonnegativeInteger(order.shippingFee),
    receivedAt: nullableTimestamp(order.receivedAt),
    shippingCarrier: string(order.shippingCarrier),
    trackingNumber: string(order.trackingNumber),
    statusUpdatedAt: nullableTimestamp(order.statusUpdatedAt),
    statusUpdatedBy: string(order.statusUpdatedBy),
  };
};

const envelope = (value: unknown, key: "orders" | "order"): unknown => {
  const record = asRecord(value);
  requireExactKeys(record, [key]);
  return record[key];
};

const sameReference = (left: AdminOrderReference, right: AdminOrderReference): boolean =>
  left.source === right.source
  && left.ownerId === right.ownerId
  && left.orderNumber === right.orderNumber;

const sameOperations = (order: AdminOrderDetail, operations: OrderOperationsUpdate): boolean => {
  const shippingCarrier = operations.status === "shipped" ? operations.shippingCarrier.trim() : "";
  const trackingNumber = operations.status === "shipped" ? operations.trackingNumber.trim() : "";
  return order.status === operations.status
    && order.shippingCarrier === shippingCarrier
    && order.trackingNumber === trackingNumber;
};

const canonicalRequestReference = (value: AdminOrderReference): AdminOrderReference => {
  try {
    return parseAdminOrderReference(value);
  } catch {
    throw new AdminOrderClientError();
  }
};

const canonicalRequestOperations = (value: OrderOperationsUpdate): OrderOperationsUpdate => {
  try {
    return parseOrderOperationsUpdate(value);
  } catch {
    throw new AdminOrderClientError();
  }
};

const isAbortError = (error: unknown): boolean =>
  typeof error === "object"
  && error !== null
  && "name" in error
  && error.name === "AbortError";

const getFreshMemberIdToken = (): Promise<string> => getCurrentFirebaseIdToken(true);

const post = async (url: string, body: unknown, signal?: AbortSignal): Promise<unknown> => {
  try {
    signal?.throwIfAborted();
    const token = await getFreshMemberIdToken();
    signal?.throwIfAborted();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? AUTHORIZATION_ERROR
        : GENERIC_ERROR;
      throw new AdminOrderClientError(message, response.status);
    }
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (isAbortError(error)) throw error;
    if (error instanceof AdminOrderClientError) throw error;
    throw new AdminOrderClientError();
  }
};

export type AdminOrderClient = {
  list(signal?: AbortSignal): Promise<AdminOrderListItem[]>;
  get(reference: AdminOrderReference, signal?: AbortSignal): Promise<AdminOrderDetail>;
  update(
    reference: AdminOrderReference,
    operations: OrderOperationsUpdate,
    signal?: AbortSignal,
  ): Promise<AdminOrderDetail>;
};

export const adminOrderClient: AdminOrderClient = {
  async list(signal) {
    const orders = envelope(await post(endpoint, { action: "list" }, signal), "orders");
    if (!Array.isArray(orders) || orders.length > 200) throw new AdminOrderClientError();
    return orders.map(parseListItem);
  },
  async get(requestedReference, signal) {
    const requestReference = canonicalRequestReference(requestedReference);
    const order = parseDetail(envelope(
      await post(`${endpoint}/detail`, {
        source: requestReference.source,
        ownerId: requestReference.ownerId,
        orderNumber: requestReference.orderNumber,
      }, signal),
      "order",
    ));
    if (!sameReference(order, requestReference)) throw new AdminOrderClientError();
    return order;
  },
  async update(requestedReference, operations, signal) {
    const requestReference = canonicalRequestReference(requestedReference);
    const requestOperations = canonicalRequestOperations(operations);
    const order = parseDetail(envelope(
      await post(`${endpoint}/update`, {
        source: requestReference.source,
        ownerId: requestReference.ownerId,
        orderNumber: requestReference.orderNumber,
        status: requestOperations.status,
        shippingCarrier: requestOperations.shippingCarrier,
        trackingNumber: requestOperations.trackingNumber,
      }, signal),
      "order",
    ));
    if (!sameReference(order, requestReference) || !sameOperations(order, requestOperations)) {
      throw new AdminOrderClientError();
    }
    return order;
  },
};
