import type { Firestore } from "firebase-admin/firestore";
import { AdminOrderAccessError, AdminOrderNotFoundError } from "../admin-orders/service";
import type { AdminOrderReference, AdminOrderRepository } from "../admin-orders/types";
import { parseAdminOrderReference } from "../admin-orders/validation";
import { getAdminFirestore } from "./admin";
import { normalizeGuestOrder } from "./guest-orders";
import { normalizeMemberOrder } from "./member-orders";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const documentPath = (reference: AdminOrderReference): string => reference.source === "member"
  ? `users/${reference.ownerId}/orders/${reference.orderNumber}`
  : `guestOrders/${reference.orderNumber}`;

const memberReferenceFromPath = (path: string): Extract<AdminOrderReference, { source: "member" }> | null => {
  const parts = path.split("/");
  if (parts.length !== 4 || parts[0] !== "users" || parts[2] !== "orders") return null;
  try {
    const reference = parseAdminOrderReference({ source: "member", ownerId: parts[1], orderNumber: parts[3] });
    return reference.source === "member" && documentPath(reference) === path ? reference : null;
  } catch {
    return null;
  }
};

const normalize = (reference: AdminOrderReference, value: unknown) => {
  const data = asRecord(value);
  if (reference.source === "guest") return normalizeGuestOrder(reference.orderNumber, data);
  // The shared member normalizer derives userId from its argument, so check the stored value first.
  if (data.userId !== reference.ownerId) throw new AdminOrderAccessError();
  return normalizeMemberOrder(reference.ownerId, reference.orderNumber, data);
};

export const createFirestoreAdminOrderRepository = ({
  getFirestore = getAdminFirestore,
}: { getFirestore?: () => Firestore } = {}): AdminOrderRepository => ({
  async listMember(limit) {
    const snapshot = await getFirestore().collectionGroup("orders").orderBy("createdAt", "desc").limit(limit).get();
    return snapshot.docs.flatMap((document) => {
      const reference = memberReferenceFromPath(document.ref.path);
      if (!reference) return [];
      const data = asRecord(document.data());
      if (data.userId !== reference.ownerId) throw new AdminOrderAccessError();
      return [normalizeMemberOrder(reference.ownerId, reference.orderNumber, data)];
    });
  },
  async listGuest(limit) {
    const snapshot = await getFirestore().collection("guestOrders").orderBy("createdAt", "desc").limit(limit).get();
    return snapshot.docs.map((document) => normalizeGuestOrder(document.id, document.data()));
  },
  async get(input) {
    const reference = parseAdminOrderReference(input);
    const snapshot = await getFirestore().doc(documentPath(reference)).get();
    return snapshot.exists ? normalize(reference, snapshot.data()) : null;
  },
  async update(input, operations, adminUid, now) {
    const reference = parseAdminOrderReference(input);
    const firestore = getFirestore();
    const document = firestore.doc(documentPath(reference));
    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      if (!snapshot.exists) throw new AdminOrderNotFoundError();
      const data = asRecord(snapshot.data());
      if (reference.source === "member" && data.userId !== reference.ownerId) throw new AdminOrderAccessError();
      const fields = {
        status: operations.status,
        shippingCarrier: operations.shippingCarrier,
        trackingNumber: operations.trackingNumber,
        statusUpdatedAt: now,
        statusUpdatedBy: adminUid,
      };
      const updated = normalize(reference, { ...data, ...fields });
      transaction.update(document, fields);
      return updated;
    });
  },
});

export const adminOrderRepository = createFirestoreAdminOrderRepository();
