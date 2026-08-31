import type { Firestore } from "firebase-admin/firestore";

import { MemberOrderDuplicateError, MemberOrderIdempotencyConflictError } from "../member-orders/errors";
import { OrderCatalogInvalidError } from "../orders/resolve-order-lines";
import { normalizeProduct } from "../products/normalize";
import type { Product } from "../products/types";
import {
  normalizeMemberOrder,
  type MemberOrderSnapshotLine,
  type MemberOrderStored,
} from "./member-orders";
import { getAdminFirestore } from "./admin";

export type MemberOrderIdempotencyRecord = {
  order: MemberOrderStored;
  requestFingerprint: string;
};

export type MemberOrderServerRepository = {
  loadProducts(productIds: string[]): Promise<(Product | null)[]>;
  getOrderByIdempotency(
    uid: string,
    idempotencyKey: string,
  ): Promise<MemberOrderIdempotencyRecord | null>;
  createOrder(
    uid: string,
    order: MemberOrderStored,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<MemberOrderIdempotencyRecord>;
};

type FirestoreRepositoryDependencies = {
  getFirestore?: () => Firestore;
  loadProduct?: (id: string) => Promise<Product | null>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asString = (value: unknown): string => typeof value === "string" ? value : "";

const asStoredOrder = (uid: string, id: string, value: unknown): MemberOrderStored => {
  const normalized = normalizeMemberOrder(uid, id, value);
  if (!normalized.createdAt || !normalized.receivedAt) {
    throw new Error("Stored member order has invalid timestamps.");
  }
  const { id: documentId, ...stored } = normalized;
  void documentId;
  return {
    ...stored,
    lines: normalized.lines.map((line) => ({
      productId: line.productId,
      purchaseOptionId: line.purchaseOptionId ?? "default",
      purchaseOptionLabel: line.purchaseOptionLabel ?? "",
      sku: line.sku ?? "",
      name: line.name,
      thumbnailUrl: line.thumbnailUrl ?? "",
      basePrice: line.basePrice ?? line.unitPrice,
      priceAdjustment: line.priceAdjustment ?? 0,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal ?? line.unitPrice * line.quantity,
    })) as MemberOrderSnapshotLine[],
    createdAt: normalized.createdAt,
    receivedAt: normalized.receivedAt,
  };
};

const isAlreadyExists = (error: unknown): boolean => {
  const code = asRecord(error).code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
};

export const createFirestoreMemberOrderRepository = ({
  getFirestore = getAdminFirestore,
  loadProduct,
}: FirestoreRepositoryDependencies = {}): MemberOrderServerRepository => ({
  async loadProducts(productIds) {
    if (loadProduct) return Promise.all(productIds.map((productId) => loadProduct(productId)));

    const firestore = getFirestore();
    return Promise.all(productIds.map(async (productId) => {
      const snapshot = await firestore.doc(`products/${productId}`).get();
      if (!snapshot.exists) return null;
      try {
        return normalizeProduct(productId, snapshot.data());
      } catch {
        throw new OrderCatalogInvalidError();
      }
    }));
  },

  async getOrderByIdempotency(uid, idempotencyKey) {
    const firestore = getFirestore();
    const mappingSnapshot = await firestore
      .doc(`users/${uid}/memberOrderIdempotency/${idempotencyKey}`)
      .get();
    if (!mappingSnapshot.exists) return null;

    const mapping = asRecord(mappingSnapshot.data());
    const orderNumber = asString(mapping.orderNumber);
    const requestFingerprint = asString(mapping.requestFingerprint);
    if (!orderNumber || !requestFingerprint) {
      throw new Error("Stored member order idempotency mapping is invalid.");
    }
    const orderSnapshot = await firestore.doc(`users/${uid}/orders/${orderNumber}`).get();
    if (!orderSnapshot.exists) throw new Error("Stored member order idempotency mapping has no order.");
    return { order: asStoredOrder(uid, orderNumber, orderSnapshot.data()), requestFingerprint };
  },

  async createOrder(uid, order, idempotencyKey, requestFingerprint) {
    try {
      const firestore = getFirestore();
      const mappingReference = firestore.doc(`users/${uid}/memberOrderIdempotency/${idempotencyKey}`);
      return await firestore.runTransaction(async (transaction) => {
        const mappingSnapshot = await transaction.get(mappingReference);
        if (mappingSnapshot.exists) {
          const mapping = asRecord(mappingSnapshot.data());
          const storedFingerprint = asString(mapping.requestFingerprint);
          const storedOrderNumber = asString(mapping.orderNumber);
          if (!storedFingerprint || !storedOrderNumber) {
            throw new Error("Stored member order idempotency mapping is invalid.");
          }
          if (storedFingerprint !== requestFingerprint) {
            throw new MemberOrderIdempotencyConflictError();
          }
          const storedOrderSnapshot = await transaction.get(
            firestore.doc(`users/${uid}/orders/${storedOrderNumber}`),
          );
          if (!storedOrderSnapshot.exists) {
            throw new Error("Stored member order idempotency mapping has no order.");
          }
          return {
            order: asStoredOrder(uid, storedOrderNumber, storedOrderSnapshot.data()),
            requestFingerprint: storedFingerprint,
          };
        }

        transaction.create(firestore.doc(`users/${uid}/orders/${order.orderNumber}`), order);
        transaction.create(mappingReference, {
          orderNumber: order.orderNumber,
          requestFingerprint,
          createdAt: order.createdAt,
        });
        return { order, requestFingerprint };
      });
    } catch (error) {
      if (isAlreadyExists(error)) throw new MemberOrderDuplicateError();
      throw error;
    }
  },
});

export const memberOrderRepository = createFirestoreMemberOrderRepository();
