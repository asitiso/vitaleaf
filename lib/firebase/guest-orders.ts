import type { Firestore } from "firebase-admin/firestore";

import { GuestOrderDuplicateError } from "../guest-orders/service";
import type {
  GuestOrderAttempt,
  GuestOrderLine,
  GuestOrderRepository,
  GuestOrderStored,
} from "../guest-orders/types";
import type { Product } from "../products/types";
import { normalizeProduct } from "../products/normalize";
import { getAdminFirestore } from "./admin";

const LOOKUP_WINDOW_MILLISECONDS = 10 * 60 * 1000;

type FirestoreRepositoryDependencies = {
  getFirestore?: () => Firestore;
  loadProduct?: (id: string) => Promise<Product | null>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asString = (value: unknown): string => typeof value === "string" ? value : "";
const asFiniteNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const asDate = (value: unknown, field: string): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const result = toDate.call(value);
      if (result instanceof Date && !Number.isNaN(result.getTime())) return result;
    }
  }
  throw new Error(`Stored guest order has an invalid ${field}.`);
};

const normalizeLines = (value: unknown): GuestOrderLine[] => Array.isArray(value)
  ? value.map((rawLine) => {
      const line = asRecord(rawLine);
      return {
        productId: asString(line.productId),
        name: asString(line.name),
        thumbnailUrl: asString(line.thumbnailUrl),
        unitPrice: asFiniteNumber(line.unitPrice),
        quantity: asFiniteNumber(line.quantity),
      };
    })
  : [];

const normalizeOrder = (orderNumber: string, value: unknown): GuestOrderStored => {
  const order = asRecord(value);
  const paymentMethod = order.paymentMethod === "bank" || order.paymentMethod === "easy"
    ? order.paymentMethod
    : "card";
  return {
    orderNumber,
    status: "mock-received",
    paymentMethod,
    customerName: asString(order.customerName),
    phoneNormalized: asString(order.phoneNormalized),
    postcode: asString(order.postcode),
    address: asString(order.address),
    addressDetail: asString(order.addressDetail),
    deliveryNote: asString(order.deliveryNote),
    lines: normalizeLines(order.lines),
    subtotal: asFiniteNumber(order.subtotal),
    shippingFee: asFiniteNumber(order.shippingFee),
    total: asFiniteNumber(order.total),
    createdAt: asDate(order.createdAt, "createdAt"),
    receivedAt: asDate(order.receivedAt, "receivedAt"),
  };
};

const normalizeAttempt = (value: unknown): GuestOrderAttempt => {
  const attempt = asRecord(value);
  return {
    failureCount: asFiniteNumber(attempt.failureCount),
    expiresAt: asDate(attempt.expiresAt, "expiresAt"),
  };
};

const isAlreadyExists = (error: unknown): boolean => {
  const code = asRecord(error).code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
};

export const createFirestoreGuestOrderRepository = ({
  getFirestore = getAdminFirestore,
  loadProduct,
}: FirestoreRepositoryDependencies = {}): GuestOrderRepository => ({
  async loadProducts(productIds) {
    if (loadProduct) {
      return Promise.all(productIds.map((productId) => loadProduct(productId)));
    }
    const firestore = getFirestore();
    return Promise.all(productIds.map(async (productId) => {
      const snapshot = await firestore.doc(`products/${productId}`).get();
      return snapshot.exists ? normalizeProduct(productId, snapshot.data()) : null;
    }));
  },

  async createOrder(order, idempotencyFingerprint) {
    try {
      const firestore = getFirestore();
      const idempotencyReference = firestore.doc(
        `guestOrderIdempotency/${idempotencyFingerprint}`,
      );
      return await firestore.runTransaction(async (transaction) => {
        const idempotencySnapshot = await transaction.get(idempotencyReference);
        if (idempotencySnapshot.exists) {
          const existingOrderNumber = asString(asRecord(idempotencySnapshot.data()).orderNumber);
          if (!existingOrderNumber) throw new Error("Stored guest order idempotency mapping is invalid.");
          const existingOrderSnapshot = await transaction.get(
            firestore.doc(`guestOrders/${existingOrderNumber}`),
          );
          if (!existingOrderSnapshot.exists) {
            throw new Error("Stored guest order idempotency mapping has no order.");
          }
          return normalizeOrder(existingOrderNumber, existingOrderSnapshot.data());
        }

        transaction.create(firestore.doc(`guestOrders/${order.orderNumber}`), order);
        transaction.create(idempotencyReference, {
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
        });
        return order;
      });
    } catch (error) {
      if (isAlreadyExists(error)) throw new GuestOrderDuplicateError();
      throw error;
    }
  },

  async getOrderByIdempotency(idempotencyFingerprint) {
    const firestore = getFirestore();
    const idempotencySnapshot = await firestore
      .doc(`guestOrderIdempotency/${idempotencyFingerprint}`)
      .get();
    if (!idempotencySnapshot.exists) return null;

    const orderNumber = asString(asRecord(idempotencySnapshot.data()).orderNumber);
    if (!orderNumber) throw new Error("Stored guest order idempotency mapping is invalid.");
    const orderSnapshot = await firestore.doc(`guestOrders/${orderNumber}`).get();
    if (!orderSnapshot.exists) {
      throw new Error("Stored guest order idempotency mapping has no order.");
    }
    return normalizeOrder(orderNumber, orderSnapshot.data());
  },

  async getOrder(orderNumber) {
    const snapshot = await getFirestore().doc(`guestOrders/${orderNumber}`).get();
    return snapshot.exists ? normalizeOrder(orderNumber, snapshot.data()) : null;
  },

  async getAttempt(fingerprint) {
    const snapshot = await getFirestore()
      .doc(`guestOrderLookupAttempts/${fingerprint}`)
      .get();
    return snapshot.exists ? normalizeAttempt(snapshot.data()) : null;
  },

  async setAttempt(fingerprint, now) {
    const firestore = getFirestore();
    const reference = firestore.doc(`guestOrderLookupAttempts/${fingerprint}`);
    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists ? normalizeAttempt(snapshot.data()) : null;
      const active = current && current.expiresAt.getTime() > now.getTime();
      const next: GuestOrderAttempt = {
        failureCount: active ? current.failureCount + 1 : 1,
        expiresAt: active
          ? current.expiresAt
          : new Date(now.getTime() + LOOKUP_WINDOW_MILLISECONDS),
      };
      transaction.set(reference, next);
      return next;
    });
  },

  async deleteAttempt(fingerprint) {
    await getFirestore().doc(`guestOrderLookupAttempts/${fingerprint}`).delete();
  },
});

export const guestOrderRepository = createFirestoreGuestOrderRepository();
