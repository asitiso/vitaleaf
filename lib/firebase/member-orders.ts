import { collection, getDocs, orderBy, query } from "firebase/firestore";

import type { OrderDraft } from "../payment/process-payment";
import { normalizeOrderOperations, type OrderOperations, type OrderStatus } from "../orders/operations";
import { LEGACY_PURCHASE_OPTION_ID } from "../products/purchase-options";
import { db } from "./client";

export type MemberOrderLine = {
  productId: string;
  purchaseOptionId?: string;
  purchaseOptionLabel?: string;
  sku?: string;
  name: string;
  thumbnailUrl?: string;
  basePrice?: number;
  priceAdjustment?: number;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
};

export type MemberOrderSnapshotLine = Required<MemberOrderLine>;

export type MemberOrder = OrderOperations & {
  id: string;
  userId: string;
  orderNumber: string;
  paymentMethod: OrderDraft["paymentMethod"];
  customerName: string;
  phone: string;
  shippingAddress: {
    postcode: string;
    address: string;
    addressDetail: string;
  };
  deliveryNote: string;
  lines: MemberOrderLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
  createdAt: Date | null;
  receivedAt?: Date | null;
};

export type MemberOrderStored = Omit<
  MemberOrder,
  "id" | "createdAt" | "receivedAt" | "lines" | keyof OrderOperations
>
  & {
    status: OrderStatus;
    isTestOrder?: boolean;
    shippingCarrier?: string;
    trackingNumber?: string;
    statusUpdatedAt?: Date | null;
    statusUpdatedBy?: string;
    lines: MemberOrderSnapshotLine[];
    createdAt: Date;
    receivedAt: Date;
  };

export type MemberOrderDocument = {
  id: string;
  data(): unknown;
};

export type MemberOrderReadAdapter = {
  list: (uid: string) => Promise<MemberOrderDocument[]>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asString = (value: unknown): string => typeof value === "string" ? value : "";

const asNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

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

const asPaymentMethod = (value: unknown): OrderDraft["paymentMethod"] =>
  value === "card" || value === "bank" || value === "easy" ? value : "card";

const asShippingAddress = (value: unknown): MemberOrder["shippingAddress"] => {
  const address = asRecord(value);
  return {
    postcode: asString(address.postcode),
    address: asString(address.address),
    addressDetail: asString(address.addressDetail),
  };
};

const asLines = (value: unknown): MemberOrderLine[] =>
  Array.isArray(value)
    ? value.map((rawLine) => {
      const line = asRecord(rawLine);
      const unitPrice = asNumber(line.unitPrice);
      const quantity = asNumber(line.quantity);
      const purchaseOptionId = asString(line.purchaseOptionId) || LEGACY_PURCHASE_OPTION_ID;
      const priceAdjustment = asNumber(line.priceAdjustment);
      return {
        productId: asString(line.productId),
        purchaseOptionId,
        purchaseOptionLabel: asString(line.purchaseOptionLabel)
          || (purchaseOptionId === LEGACY_PURCHASE_OPTION_ID ? "기본 구성" : ""),
        sku: asString(line.sku),
        name: asString(line.name),
        thumbnailUrl: asString(line.thumbnailUrl),
        basePrice: numberOr(line.basePrice, unitPrice - priceAdjustment),
        priceAdjustment,
        quantity,
        unitPrice,
        lineTotal: numberOr(line.lineTotal, unitPrice * quantity),
      };
    })
    : [];

export const normalizeMemberOrder = (uid: string, id: string, raw: unknown): MemberOrder => {
  const order = asRecord(raw);
  return {
    ...normalizeOrderOperations(order),
    id,
    userId: uid,
    orderNumber: asString(order.orderNumber),
    paymentMethod: asPaymentMethod(order.paymentMethod),
    customerName: asString(order.customerName),
    phone: asString(order.phone),
    shippingAddress: asShippingAddress(order.shippingAddress),
    deliveryNote: asString(order.deliveryNote),
    lines: asLines(order.lines),
    subtotal: asNumber(order.subtotal),
    shippingFee: asNumber(order.shippingFee),
    total: asNumber(order.total),
    createdAt: asDate(order.createdAt),
    receivedAt: asDate(order.receivedAt) ?? asDate(order.createdAt),
  };
};

const newestFirst = (left: MemberOrder, right: MemberOrder): number =>
  (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0);

export const createMemberOrderReadRepository = (adapter: MemberOrderReadAdapter) => ({
  async list(uid: string): Promise<MemberOrder[]> {
    const documents = await adapter.list(uid);
    return documents
      .map((document) => normalizeMemberOrder(uid, document.id, document.data()))
      .sort(newestFirst);
  },
});

const firebaseMemberOrderReadAdapter: MemberOrderReadAdapter = {
  async list(uid) {
    const snapshot = await getDocs(query(
      collection(db, "users", uid, "orders"),
      orderBy("createdAt", "desc"),
    ));
    return snapshot.docs;
  },
};

const memberOrderReadRepository = createMemberOrderReadRepository(firebaseMemberOrderReadAdapter);

export const listMemberOrders = memberOrderReadRepository.list;
