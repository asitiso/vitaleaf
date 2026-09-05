import type { DocumentSnapshot, Firestore, Query } from "firebase-admin/firestore";

import {
  InquiryRepositoryError,
  type InquiryRepository,
} from "../inquiries/repository";
import type {
  InquiryAttachment,
  InquiryListFilters,
  InquiryRecord,
} from "../inquiries/types";
import {
  InquiryValidationError,
  parseInquiryListFilters,
  parseInquiryRecord,
} from "../inquiries/validation";
import { getAdminFirestore } from "./admin";

const COLLECTION = "inquiries";

type FirestoreInquiryRepositoryDependencies = {
  getFirestore?: () => Firestore;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InquiryValidationError();
  }
  return value as Record<string, unknown>;
};

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const converted = (value as { toDate?: unknown }).toDate;
    const date = typeof converted === "function" ? converted.call(value) : null;
    if (date instanceof Date) return date;
  }
  throw new InquiryValidationError();
};

const readRecord = (id: string, value: unknown): InquiryRecord => {
  const raw = asRecord(value);
  const record = parseInquiryRecord({
    ...raw,
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    repliedAt: raw.repliedAt === null ? null : toDate(raw.repliedAt),
  });
  if (record.id !== id) throw new InquiryValidationError();
  return record;
};

const requiredId = (value: string): string => {
  if (!value.trim() || value.includes("/")) throw new InquiryRepositoryError();
  return value;
};

const isAlreadyExists = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
};

const queryWithFilters = (query: Query, filters: InquiryListFilters): Query => {
  const parsedFilters = parseInquiryListFilters(filters);
  let filtered = query;
  if (parsedFilters.category) filtered = filtered.where("category", "==", parsedFilters.category);
  if (parsedFilters.status) filtered = filtered.where("status", "==", parsedFilters.status);
  return filtered.orderBy("createdAt", "desc").limit(parsedFilters.pageSize);
};

const readList = async (
  query: Query,
  filters: InquiryListFilters,
  cursorSnapshot: DocumentSnapshot | null,
  matchesOwner?: (record: InquiryRecord) => boolean,
): Promise<InquiryRecord[]> => {
  let filtered = queryWithFilters(query, filters);
  if (filters.cursor) {
    if (!cursorSnapshot?.exists) return [];
    if (matchesOwner && !matchesOwner(readRecord(cursorSnapshot.id, cursorSnapshot.data()))) return [];
    filtered = filtered.startAfter(cursorSnapshot);
  }
  const snapshot = await filtered.get();
  const records = snapshot.docs.map((document) => readRecord(document.id, document.data()));
  if (matchesOwner && records.some((record) => !matchesOwner(record))) {
    throw new InquiryRepositoryError();
  }
  return records;
};

export const createFirestoreInquiryRepository = ({
  getFirestore = getAdminFirestore,
}: FirestoreInquiryRepositoryDependencies = {}): InquiryRepository => ({
  async create(record) {
    const parsed = parseInquiryRecord(record);
    const firestore = getFirestore();
    const reference = firestore.collection(COLLECTION).doc(requiredId(parsed.id));
    try {
      await firestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(reference);
        if (existing.exists) throw new InquiryRepositoryError("Inquiry already exists.");
        transaction.create(reference, parsed);
      });
    } catch (error) {
      if (isAlreadyExists(error)) throw new InquiryRepositoryError("Inquiry already exists.");
      throw error;
    }
  },

  async listForMember(uid, filters) {
    const firestore = getFirestore();
    const memberUid = requiredId(uid);
    const parsedFilters = parseInquiryListFilters(filters);
    const collection = firestore.collection(COLLECTION);
    return readList(
      collection
        .where("ownerType", "==", "member")
        .where("memberUid", "==", memberUid),
      parsedFilters,
      parsedFilters.cursor ? await collection.doc(requiredId(parsedFilters.cursor)).get() : null,
      (record) => record.ownerType === "member" && record.memberUid === memberUid,
    );
  },

  async listForGuestOrder(orderNumber, filters) {
    const firestore = getFirestore();
    const guestOrderNumber = requiredId(orderNumber);
    const parsedFilters = parseInquiryListFilters(filters);
    const collection = firestore.collection(COLLECTION);
    return readList(
      collection
        .where("ownerType", "==", "guest")
        .where("guestOrderNumber", "==", guestOrderNumber),
      parsedFilters,
      parsedFilters.cursor ? await collection.doc(requiredId(parsedFilters.cursor)).get() : null,
      (record) => record.ownerType === "guest" && record.guestOrderNumber === guestOrderNumber,
    );
  },

  async get(id) {
    const firestore = getFirestore();
    const snapshot = await firestore.collection(COLLECTION).doc(requiredId(id)).get();
    return snapshot.exists ? readRecord(snapshot.id, snapshot.data()) : null;
  },

  async listAdmin(filters) {
    const firestore = getFirestore();
    const parsedFilters = parseInquiryListFilters(filters);
    const collection = firestore.collection(COLLECTION);
    return readList(
      collection,
      parsedFilters,
      parsedFilters.cursor ? await collection.doc(requiredId(parsedFilters.cursor)).get() : null,
    );
  },

  async countWaiting() {
    const firestore = getFirestore();
    const snapshot = await firestore.collection(COLLECTION).where("status", "==", "waiting").count().get();
    return snapshot.data().count;
  },

  async reply(id, reply) {
    const firestore = getFirestore();
    const reference = firestore.collection(COLLECTION).doc(requiredId(id));
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new InquiryRepositoryError("Inquiry not found.");
      const existing = readRecord(snapshot.id, snapshot.data());
      const answered = parseInquiryRecord({
        ...existing,
        status: "answered",
        adminReply: reply.adminReply,
        repliedBy: reply.repliedBy,
        repliedAt: reply.repliedAt,
        updatedAt: reply.repliedAt,
      });
      transaction.update(reference, {
        status: answered.status,
        adminReply: answered.adminReply,
        repliedBy: answered.repliedBy,
        repliedAt: answered.repliedAt,
        updatedAt: answered.updatedAt,
      });
    });
  },

  async delete(id): Promise<InquiryAttachment[]> {
    const firestore = getFirestore();
    const reference = firestore.collection(COLLECTION).doc(requiredId(id));
    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return [];
      const record = readRecord(snapshot.id, snapshot.data());
      transaction.delete(reference);
      return record.attachments;
    });
  },
});

export const inquiryRepository = createFirestoreInquiryRepository();

export { InquiryRepositoryError } from "../inquiries/repository";
