import { addDoc, collection, getDocs, orderBy, query } from "firebase/firestore";

import type { OrderDraft, PaymentResult } from "../payment/process-payment";
import { db } from "./client";

export type MemberOrderLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type MemberOrder = {
  id: string;
  userId: string;
  orderNumber: string;
  status: "mock-received";
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
};

export type MemberOrderWrite = Omit<MemberOrder, "id"> & { createdAt: Date };

export type MemberOrderDocument = {
  id: string;
  data(): unknown;
};

export type MemberOrderAdapter = {
  add: (uid: string, order: MemberOrderWrite) => Promise<string>;
  list: (uid: string) => Promise<MemberOrderDocument[]>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asString = (value: unknown): string => typeof value === "string" ? value : "";

const asNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

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
    ? value.map((line) => {
      const item = asRecord(line);
      return {
        productId: asString(item.productId),
        name: asString(item.name),
        quantity: asNumber(item.quantity),
        unitPrice: asNumber(item.unitPrice),
      };
    })
    : [];

const isValidOrderLine = (value: unknown): value is MemberOrderLine => {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }

  const line = value as Record<string, unknown>;
  return typeof line.productId === "string"
    && line.productId.trim().length > 0
    && typeof line.name === "string"
    && line.name.trim().length > 0
    && typeof line.quantity === "number"
    && Number.isInteger(line.quantity)
    && line.quantity >= 1
    && typeof line.unitPrice === "number"
    && Number.isFinite(line.unitPrice)
    && line.unitPrice >= 0;
};

const assertValidOrderLines: (lines: unknown) => asserts lines is MemberOrderLine[] = (lines) => {
  if (!Array.isArray(lines) || lines.length === 0 || !lines.every(isValidOrderLine)) {
    throw new Error("Member orders require valid product lines.");
  }
};

const normalizeMemberOrder = (uid: string, id: string, raw: unknown): MemberOrder => {
  const order = asRecord(raw);
  return {
    id,
    userId: uid,
    orderNumber: asString(order.orderNumber),
    status: "mock-received",
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
  };
};

const toMemberOrderWrite = (
  uid: string,
  draft: OrderDraft,
  payment: PaymentResult,
): MemberOrderWrite => {
  assertValidOrderLines(draft.lines);

  return {
    userId: uid,
    orderNumber: payment.orderNumber,
    status: "mock-received",
    paymentMethod: draft.paymentMethod,
    customerName: draft.customerName,
    phone: draft.phone,
    shippingAddress: {
      postcode: draft.postcode,
      address: draft.address,
      addressDetail: draft.addressDetail,
    },
    deliveryNote: draft.deliveryNote,
    lines: draft.lines.map(({ productId, name, quantity, unitPrice }) => ({
      productId,
      name,
      quantity,
      unitPrice,
    })),
    subtotal: draft.subtotal,
    shippingFee: draft.shippingFee,
    total: draft.total,
    createdAt: new Date(payment.receivedAt),
  };
};

const newestFirst = (left: MemberOrder, right: MemberOrder): number =>
  (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0);

export const createMemberOrderRepository = (adapter: MemberOrderAdapter) => ({
  async create(uid: string, draft: OrderDraft, payment: PaymentResult): Promise<string> {
    return adapter.add(uid, toMemberOrderWrite(uid, draft, payment));
  },

  async list(uid: string): Promise<MemberOrder[]> {
    const documents = await adapter.list(uid);
    return documents
      .map((document) => normalizeMemberOrder(uid, document.id, document.data()))
      .sort(newestFirst);
  },
});

const firebaseMemberOrderAdapter: MemberOrderAdapter = {
  async add(uid, order) {
    const reference = await addDoc(collection(db, "users", uid, "orders"), order);
    return reference.id;
  },
  async list(uid) {
    const snapshot = await getDocs(query(
      collection(db, "users", uid, "orders"),
      orderBy("createdAt", "desc"),
    ));
    return snapshot.docs;
  },
};

const memberOrderRepository = createMemberOrderRepository(firebaseMemberOrderAdapter);

export const createMemberOrder = memberOrderRepository.create;
export const listMemberOrders = memberOrderRepository.list;
