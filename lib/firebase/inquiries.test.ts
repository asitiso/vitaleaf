import { describe, expect, it } from "vitest";

import type { InquiryRecord } from "../inquiries/types";
import { InquiryRepositoryError, createFirestoreInquiryRepository } from "./inquiries";

const NOW = new Date("2026-08-28T10:00:00.000Z");

const memberRecord = (overrides: Partial<InquiryRecord> = {}): InquiryRecord => ({
  id: "inquiry-member-1",
  ownerType: "member",
  memberUid: "member-1",
  guestOrderNumber: null,
  orderNumber: null,
  category: "product",
  title: "Product question",
  body: "Please confirm the serving period.",
  status: "waiting",
  attachments: [],
  adminReply: null,
  repliedAt: null,
  repliedBy: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
}) as InquiryRecord;

const guestRecord = (overrides: Partial<InquiryRecord> = {}): InquiryRecord => ({
  ...memberRecord({
    id: "inquiry-guest-1",
    ownerType: "guest",
    memberUid: null,
    guestOrderNumber: "VL-20260828-ABC123",
    orderNumber: "VL-20260828-ABC123",
    category: "shipping",
  }),
  ...overrides,
}) as InquiryRecord;

type StoredDocument = Record<string, unknown>;
type Constraint = { field: string; value: unknown };

const clone = <T>(value: T): T => structuredClone(value);

const createFirestoreHarness = (initial: InquiryRecord[] = []) => {
  const documents = new Map<string, StoredDocument>(
    initial.map((record) => [record.id, clone(record) as StoredDocument]),
  );
  const queryCalls: Array<{ constraints: Constraint[]; limit: number | null }> = [];
  let failRead: Error | null = null;
  let failTransaction: Error | null = null;
  let forcedQueryDocuments: Array<[string, StoredDocument]> | null = null;
  let documentReads = 0;
  let countReads = 0;

  const snapshot = (id: string, document = documents.get(id)) => ({
    id,
    exists: documents.has(id),
    data: () => clone(document),
  });

  const query = (
    constraints: Constraint[] = [],
    limitValue: number | null = null,
    cursorId: string | null = null,
  ) => ({
    where(field: string, _operator: string, value: unknown) {
      return query([...constraints, { field, value }], limitValue, cursorId);
    },
    orderBy() {
      return this;
    },
    limit(value: number) {
      return query(constraints, value, cursorId);
    },
    startAfter(document: { id: string }) {
      return query(constraints, limitValue, document.id);
    },
    async get() {
      if (failRead) throw failRead;
      queryCalls.push({ constraints: clone(constraints), limit: limitValue });
      const queriedEntries = (forcedQueryDocuments ?? [...documents.entries()])
        .filter(([, document]) => forcedQueryDocuments !== null || constraints.every(({ field, value }) => document[field] === value))
        .sort(([, left], [, right]) => {
          const leftTime = (left.createdAt as Date).getTime();
          const rightTime = (right.createdAt as Date).getTime();
          return rightTime - leftTime;
        });
      const start = cursorId === null
        ? 0
        : Math.max(0, queriedEntries.findIndex(([entryId]) => entryId === cursorId) + 1);
      const matching = queriedEntries
        .slice(start, limitValue === null ? undefined : start + limitValue)
        .map(([id, document]) => snapshot(id, document));
      return { docs: matching };
    },
    count() {
      return {
        get: async () => {
          if (failRead) throw failRead;
          countReads += 1;
          return {
            data: () => ({
              count: [...documents.values()].filter((document) =>
                constraints.every(({ field, value }) => document[field] === value),
              ).length,
            }),
          };
        },
      };
    },
  });

  const collection = () => ({
    ...query(),
    doc(id: string) {
      return {
        id,
        async get() {
          if (failRead) throw failRead;
          documentReads += 1;
          return snapshot(id);
        },
      };
    },
  });

  const firestore = {
    collection,
    async runTransaction<T>(operation: (transaction: {
      get(reference: { id: string }): Promise<ReturnType<typeof snapshot>>;
      create(reference: { id: string }, data: StoredDocument): void;
      update(reference: { id: string }, data: StoredDocument): void;
      delete(reference: { id: string }): void;
    }) => Promise<T>): Promise<T> {
      if (failTransaction) throw failTransaction;
      return operation({
        async get(reference) {
          if (failRead) throw failRead;
          documentReads += 1;
          return snapshot(reference.id);
        },
        create(reference, data) {
          if (documents.has(reference.id)) throw new Error("duplicate");
          documents.set(reference.id, clone(data));
        },
        update(reference, data) {
          const current = documents.get(reference.id);
          if (!current) throw new Error("missing");
          documents.set(reference.id, { ...current, ...clone(data) });
        },
        delete(reference) {
          documents.delete(reference.id);
        },
      });
    },
  };

  return {
    firestore,
    documents,
    queryCalls,
    setReadFailure(error: Error | null) { failRead = error; },
    setTransactionFailure(error: Error | null) { failTransaction = error; },
    setQueryDocuments(documentsForQuery: Array<[string, StoredDocument]> | null) {
      forcedQueryDocuments = documentsForQuery;
    },
    get documentReads() { return documentReads; },
    get countReads() { return countReads; },
  };
};

describe("createFirestoreInquiryRepository", () => {
  it("creates and strictly round-trips member and guest records", async () => {
    const harness = createFirestoreHarness();
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });
    const member = memberRecord();
    const guest = guestRecord();

    await repository.create(member);
    await repository.create(guest);

    await expect(repository.get(member.id)).resolves.toEqual(member);
    await expect(repository.get(guest.id)).resolves.toEqual(guest);
  });

  it("rejects duplicate and mismatched document IDs deterministically", async () => {
    const record = memberRecord();
    const harness = createFirestoreHarness([record]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

    await expect(repository.create(record)).rejects.toThrow(InquiryRepositoryError);
    harness.documents.set(record.id, { ...record, id: "different-id" });
    await expect(repository.get(record.id)).rejects.toThrow();
  });

  it("queries members and guests only through exact owner constraints", async () => {
    const harness = createFirestoreHarness([
      memberRecord(),
      memberRecord({ id: "inquiry-member-2", memberUid: "member-2" }),
      guestRecord(),
      guestRecord({ id: "inquiry-guest-2", guestOrderNumber: "VL-20260828-DEF456", orderNumber: "VL-20260828-DEF456" }),
    ]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });
    const filters = { category: null, status: null, pageSize: 20, cursor: null };

    await expect(repository.listForMember("member-1", filters)).resolves.toEqual([memberRecord()]);
    await expect(repository.listForGuestOrder("VL-20260828-ABC123", filters)).resolves.toEqual([guestRecord()]);
    expect(harness.queryCalls).toEqual([
      { constraints: [{ field: "ownerType", value: "member" }, { field: "memberUid", value: "member-1" }], limit: 20 },
      { constraints: [{ field: "ownerType", value: "guest" }, { field: "guestOrderNumber", value: "VL-20260828-ABC123" }], limit: 20 },
    ]);
  });

  it("rejects a valid but mismatched owner row from a member query", async () => {
    const requestedUid = "member-1";
    const mismatchedRecords = [
      guestRecord(),
      memberRecord({ id: "inquiry-member-2", memberUid: "member-2" }),
    ];

    for (const record of mismatchedRecords) {
      const harness = createFirestoreHarness();
      harness.setQueryDocuments([[record.id, record as StoredDocument]]);
      const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

      await expect(repository.listForMember(requestedUid, {
        category: null,
        status: null,
        pageSize: 20,
        cursor: null,
      })).rejects.toThrow(InquiryRepositoryError);
    }
  });

  it("rejects a valid but mismatched owner row from a guest query", async () => {
    const requestedOrderNumber = "VL-20260828-ABC123";
    const mismatchedRecords = [
      memberRecord(),
      guestRecord({ id: "inquiry-guest-2", guestOrderNumber: "VL-20260828-DEF456", orderNumber: "VL-20260828-DEF456" }),
    ];

    for (const record of mismatchedRecords) {
      const harness = createFirestoreHarness();
      harness.setQueryDocuments([[record.id, record as StoredDocument]]);
      const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

      await expect(repository.listForGuestOrder(requestedOrderNumber, {
        category: null,
        status: null,
        pageSize: 20,
        cursor: null,
      })).rejects.toThrow(InquiryRepositoryError);
    }
  });

  it("applies newest-first category and status filters with the validated maximum list limit", async () => {
    const old = memberRecord({ id: "inquiry-old", category: "order", createdAt: new Date("2026-08-27T10:00:00.000Z"), updatedAt: new Date("2026-08-27T10:00:00.000Z") });
    const newest = memberRecord({ id: "inquiry-new", category: "order", createdAt: new Date("2026-08-29T10:00:00.000Z"), updatedAt: new Date("2026-08-29T10:00:00.000Z") });
    const harness = createFirestoreHarness([old, newest, memberRecord()]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

    await expect(repository.listAdmin({ category: "order", status: "waiting", pageSize: 50, cursor: null }))
      .resolves.toEqual([newest, old]);
    expect(harness.queryCalls[0]).toEqual({
      constraints: [{ field: "category", value: "order" }, { field: "status", value: "waiting" }],
      limit: 50,
    });
  });

  it("rejects list filters outside the shared bounded-query contract", async () => {
    const harness = createFirestoreHarness([memberRecord()]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

    await expect(repository.listAdmin({ category: null, status: null, pageSize: 51, cursor: null }))
      .rejects.toThrow();
    expect(harness.queryCalls).toEqual([]);
  });

  it("uses the document cursor after owner constraints and newest-first ordering", async () => {
    const old = memberRecord({ id: "inquiry-old", createdAt: new Date("2026-08-27T10:00:00.000Z"), updatedAt: new Date("2026-08-27T10:00:00.000Z") });
    const newest = memberRecord({ id: "inquiry-new", createdAt: new Date("2026-08-29T10:00:00.000Z"), updatedAt: new Date("2026-08-29T10:00:00.000Z") });
    const harness = createFirestoreHarness([old, newest]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

    await expect(repository.listForMember("member-1", {
      category: null,
      status: null,
      pageSize: 20,
      cursor: newest.id,
    })).resolves.toEqual([old]);
  });

  it("rejects malformed stored dates, owners, reply state, and attachment paths", async () => {
    const cases: StoredDocument[] = [
      { ...memberRecord(), createdAt: "not-a-date" },
      { ...memberRecord(), ownerType: "member", guestOrderNumber: "VL-20260828-ABC123" },
      { ...memberRecord(), status: "waiting", adminReply: "unexpected" },
      { ...memberRecord(), attachments: [{ id: "image-1", storagePath: "inquiries/other/image-1", originalName: "image.jpg", contentType: "image/jpeg", size: 1 }] },
    ];

    for (const document of cases) {
      const harness = createFirestoreHarness();
      harness.documents.set("inquiry-member-1", document);
      const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });
      await expect(repository.get("inquiry-member-1")).rejects.toThrow();
    }
  });

  it("uses Firestore count for waiting inquiries without downloading documents", async () => {
    const harness = createFirestoreHarness([memberRecord(), guestRecord({ status: "answered", adminReply: "Answered", repliedBy: "admin-1", repliedAt: NOW })]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

    await expect(repository.countWaiting()).resolves.toBe(1);
    expect(harness.countReads).toBe(1);
    expect(harness.documentReads).toBe(0);
    expect(harness.queryCalls).toEqual([]);
  });

  it("replies atomically, preserves immutable fields, and permits a deliberate answered overwrite", async () => {
    const original = memberRecord({ attachments: [{ id: "image-1", storagePath: "inquiries/inquiry-member-1/image-1", originalName: "image.jpg", contentType: "image/jpeg", size: 1 }] });
    const harness = createFirestoreHarness([original]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });
    const repliedAt = new Date("2026-08-29T10:00:00.000Z");

    await repository.reply(original.id, { adminReply: "We will help.", repliedBy: "admin-1", repliedAt });
    await repository.reply(original.id, { adminReply: "Updated answer.", repliedBy: "admin-2", repliedAt: new Date("2026-08-30T10:00:00.000Z") });

    await expect(repository.get(original.id)).resolves.toEqual({
      ...original,
      status: "answered",
      adminReply: "Updated answer.",
      repliedBy: "admin-2",
      repliedAt: new Date("2026-08-30T10:00:00.000Z"),
      updatedAt: new Date("2026-08-30T10:00:00.000Z"),
    });
  });

  it("rejects missing and invalid replies without creating or mutating records", async () => {
    const original = memberRecord();
    const harness = createFirestoreHarness([original]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

    await expect(repository.reply("missing", { adminReply: "Answer", repliedBy: "admin-1", repliedAt: NOW })).rejects.toThrow(InquiryRepositoryError);
    await expect(repository.reply(original.id, { adminReply: "", repliedBy: "admin-1", repliedAt: NOW })).rejects.toThrow();
    await expect(repository.get(original.id)).resolves.toEqual(original);
  });

  it("returns only validated attachments when deleting and makes repeated delete safe", async () => {
    const record = memberRecord({ attachments: [{ id: "image-1", storagePath: "inquiries/inquiry-member-1/image-1", originalName: "image.jpg", contentType: "image/jpeg", size: 1 }] });
    const harness = createFirestoreHarness([record]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

    await expect(repository.delete(record.id)).resolves.toEqual(record.attachments);
    await expect(repository.delete(record.id)).resolves.toEqual([]);
    await expect(repository.get(record.id)).resolves.toBeNull();
  });

  it("never deletes or returns attachments from a malformed record", async () => {
    const record = memberRecord({ attachments: [{ id: "image-1", storagePath: "inquiries/other/image-1", originalName: "image.jpg", contentType: "image/jpeg", size: 1 }] });
    const harness = createFirestoreHarness([record]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });

    await expect(repository.delete(record.id)).rejects.toThrow();
    expect(harness.documents.has(record.id)).toBe(true);
  });

  it("propagates Firestore read and transaction failures", async () => {
    const harness = createFirestoreHarness([memberRecord()]);
    const repository = createFirestoreInquiryRepository({ getFirestore: () => harness.firestore as never });
    const readFailure = new Error("unavailable");
    harness.setReadFailure(readFailure);
    await expect(repository.get("inquiry-member-1")).rejects.toBe(readFailure);
    harness.setReadFailure(null);
    const transactionFailure = new Error("aborted");
    harness.setTransactionFailure(transactionFailure);
    await expect(repository.reply("inquiry-member-1", { adminReply: "Answer", repliedBy: "admin-1", repliedAt: NOW })).rejects.toBe(transactionFailure);
  });
});
