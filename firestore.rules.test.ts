// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-vitaleaf-rules-test";

let testEnvironment: RulesTestEnvironment;

const product = {
  name: "테스트 상품",
  category: "건강기능식품",
  price: 10_000,
  stock: 3,
};

const ownedProduct = (owner: string, revision = 1) => ({
  ...product,
  revision,
  createdBy: owner,
  updatedBy: owner,
  createdAt: "original-created-at",
  updatedAt: "latest-updated-at",
});

const ownedDraft = (owner: string, revision = 1) => ({
  ...ownedProduct(owner, revision),
  status: "draft",
  mode: "create",
  sessionId: "session-1",
  sourceProductId: null,
  sourceProductRevision: null,
  sourceCreatedAt: null,
  sourceCreatedBy: null,
});

const seed = async (documents: Record<string, Record<string, unknown>>) => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all(
      Object.entries(documents).map(([path, data]) => setDoc(doc(database, path), data)),
    );
  });
};

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

afterEach(async () => {
  await testEnvironment.clearFirestore();
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("products", () => {
  it("allows unauthenticated document and collection reads", async () => {
    await seed({ "products/p1": product });
    const database = testEnvironment.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(database, "products/p1")));
    const snapshot = await assertSucceeds(getDocs(collection(database, "products")));

    expect(snapshot.docs.map((entry) => entry.id)).toEqual(["p1"]);
  });

  it("denies writes from unauthenticated and authenticated non-admin clients", async () => {
    const publicDatabase = testEnvironment.unauthenticatedContext().firestore();
    const userDatabase = testEnvironment.authenticatedContext("user-1").firestore();

    await assertFails(setDoc(doc(publicDatabase, "products/public-write"), product));
    await assertFails(setDoc(doc(userDatabase, "products/user-write"), product));
  });

  it("denies create, update, and delete when the admin document role is not admin", async () => {
    await seed({
      "admins/editor-1": { role: "editor" },
      "products/existing": product,
    });
    const database = testEnvironment.authenticatedContext("editor-1").firestore();

    await assertFails(setDoc(doc(database, "products/created"), product));
    await assertFails(updateDoc(doc(database, "products/existing"), { stock: 4 }));
    await assertFails(deleteDoc(doc(database, "products/existing")));
  });

  it("allows an authenticated user backed by admins/{uid} to create, update, and delete products", async () => {
    await seed({ "admins/admin-1": { role: "admin" }, "products/existing": ownedProduct("admin-original") });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertSucceeds(setDoc(doc(database, "products/created"), ownedProduct("admin-1")));
    await assertSucceeds(updateDoc(doc(database, "products/existing"), {
      stock: 4,
      revision: 2,
      updatedBy: "admin-1",
    }));
    await assertSucceeds(deleteDoc(doc(database, "products/existing")));
  });

  it("rejects product owner spoofing, createdBy mutation, and stale revisions", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "products/existing": ownedProduct("admin-original", 3),
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertFails(setDoc(doc(database, "products/spoofed"), ownedProduct("other-admin")));
    await assertFails(updateDoc(doc(database, "products/existing"), {
      revision: 4,
      createdBy: "admin-1",
      updatedBy: "admin-1",
    }));
    await assertFails(updateDoc(doc(database, "products/existing"), {
      revision: 3,
      updatedBy: "admin-1",
    }));
  });

  it("requires a same-ID draft to be deleted atomically when its product is created", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "productDrafts/collision": ownedDraft("admin-1"),
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertFails(setDoc(doc(database, "products/collision"), ownedProduct("admin-1")));
    await assertSucceeds(runTransaction(database, async (transaction) => {
      transaction.set(doc(database, "products/collision"), ownedProduct("admin-1"));
      transaction.delete(doc(database, "productDrafts/collision"));
    }));
  });

  it("allows only an atomic restore that preserves the draft's original product lineage", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "products/restored": ownedProduct("admin-original", 8),
      "products/spoofed": ownedProduct("admin-original", 8),
      "products/reset-lineage": ownedProduct("admin-original", 8),
      "products/standalone": ownedProduct("admin-original", 8),
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();
    const restoreDraft = (id: string) => ({
      ...ownedDraft("admin-1", 1),
      mode: "restore",
      sourceProductId: id,
      sourceProductRevision: 8,
      sourceCreatedAt: "original-created-at",
      sourceCreatedBy: "admin-original",
    });

    await assertFails(setDoc(doc(database, "productDrafts/standalone"), restoreDraft("standalone")));
    for (const id of ["restored", "spoofed", "reset-lineage"]) {
      await assertSucceeds(runTransaction(database, async (transaction) => {
        transaction.set(doc(database, `productDrafts/${id}`), restoreDraft(id));
        transaction.delete(doc(database, `products/${id}`));
      }));
    }

    await assertSucceeds(runTransaction(database, async (transaction) => {
      transaction.set(doc(database, "products/restored"), {
        ...ownedProduct("admin-original", 9),
        updatedBy: "admin-1",
      });
      transaction.delete(doc(database, "productDrafts/restored"));
    }));

    await assertFails(runTransaction(database, async (transaction) => {
      transaction.set(doc(database, "products/spoofed"), {
        ...ownedProduct("attacker", 9),
        updatedBy: "admin-1",
      });
      transaction.delete(doc(database, "productDrafts/spoofed"));
    }));

    await assertFails(runTransaction(database, async (transaction) => {
      transaction.set(doc(database, "products/reset-lineage"), ownedProduct("admin-1", 1));
      transaction.delete(doc(database, "productDrafts/reset-lineage"));
    }));
  });
});

describe("product drafts", () => {
  it("denies signed-out and role-mismatched draft reads and writes", async () => {
    await seed({
      "admins/editor-1": { role: "editor" },
      "admins/missing-role": { active: true },
      "productDrafts/draft-1": ownedDraft("admin-1"),
    });
    const publicDatabase = testEnvironment.unauthenticatedContext().firestore();
    const editorDatabase = testEnvironment.authenticatedContext("editor-1").firestore();
    const missingRoleDatabase = testEnvironment.authenticatedContext("missing-role").firestore();
    const customerDatabase = testEnvironment.authenticatedContext("customer-1").firestore();

    await assertFails(getDoc(doc(publicDatabase, "productDrafts/draft-1")));
    await assertFails(getDocs(collection(publicDatabase, "productDrafts")));
    await assertFails(setDoc(doc(publicDatabase, "productDrafts/public-write"), product));
    await assertFails(getDoc(doc(editorDatabase, "productDrafts/draft-1")));
    await assertFails(getDocs(collection(editorDatabase, "productDrafts")));
    await assertFails(setDoc(doc(editorDatabase, "productDrafts/editor-write"), product));
    await assertFails(updateDoc(doc(editorDatabase, "productDrafts/draft-1"), { stock: 4 }));
    await assertFails(deleteDoc(doc(editorDatabase, "productDrafts/draft-1")));
    await assertFails(getDoc(doc(missingRoleDatabase, "productDrafts/draft-1")));
    await assertFails(getDoc(doc(customerDatabase, "productDrafts/draft-1")));
    await assertFails(setDoc(doc(customerDatabase, "productDrafts/customer-write"), product));
  });

  it("allows an exact-role admin to read, create, update, and delete drafts", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "productDrafts/existing": ownedDraft("admin-original"),
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertSucceeds(getDoc(doc(database, "productDrafts/existing")));
    const snapshot = await assertSucceeds(getDocs(collection(database, "productDrafts")));
    expect(snapshot.docs.map((entry) => entry.id)).toEqual(["existing"]);
    await assertSucceeds(setDoc(doc(database, "productDrafts/created"), ownedDraft("admin-1")));
    await assertSucceeds(updateDoc(doc(database, "productDrafts/existing"), {
      stock: 4,
      revision: 2,
      updatedBy: "admin-1",
    }));
    await assertSucceeds(deleteDoc(doc(database, "productDrafts/existing")));
  });

  it("enforces create versus same-ID edit draft target and source lineage", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "products/published": ownedProduct("admin-original", 3),
      "products/wrong-revision": ownedProduct("admin-original", 3),
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();
    const editDraft = {
      ...ownedDraft("admin-1"),
      mode: "edit",
      sourceProductId: "published",
      sourceProductRevision: 3,
      sourceCreatedAt: "original-created-at",
      sourceCreatedBy: "admin-original",
    };

    await assertFails(setDoc(doc(database, "productDrafts/published"), ownedDraft("admin-1")));
    await assertSucceeds(setDoc(doc(database, "productDrafts/published"), editDraft));
    await assertFails(setDoc(doc(database, "productDrafts/wrong-revision"), {
      ...editDraft,
      sourceProductId: "wrong-revision",
      sourceProductRevision: 2,
    }));
  });

  it("rejects draft owner spoofing and session, creator, or revision mutation", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "productDrafts/existing": ownedDraft("admin-original", 3),
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertFails(setDoc(doc(database, "productDrafts/spoofed"), ownedDraft("other-admin")));
    await assertFails(updateDoc(doc(database, "productDrafts/existing"), {
      revision: 4,
      createdBy: "admin-1",
      updatedBy: "admin-1",
    }));
    await assertFails(updateDoc(doc(database, "productDrafts/existing"), {
      revision: 4,
      sessionId: "other-session",
      updatedBy: "admin-1",
    }));
    await assertFails(updateDoc(doc(database, "productDrafts/existing"), {
      revision: 3,
      updatedBy: "admin-1",
    }));
    await assertFails(updateDoc(doc(database, "productDrafts/existing"), {
      revision: 4,
      sourceProductId: "other-product",
      updatedBy: "admin-1",
    }));
  });

  it("keeps nested draft data denied even to an admin", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "productDrafts/draft-1/internal/secret": { value: true },
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertFails(getDoc(doc(database, "productDrafts/draft-1/internal/secret")));
    await assertFails(setDoc(doc(database, "productDrafts/draft-1/internal/new-secret"), { value: true }));
  });
});

describe("reviews", () => {
  it("allows direct reads only when the stored review is approved", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "reviews/approved": { productId: "p1", approved: true, text: "공개" },
      "reviews/pending": { productId: "p1", approved: false, text: "비공개" },
    });
    const publicDatabase = testEnvironment.unauthenticatedContext().firestore();
    const adminDatabase = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertSucceeds(getDoc(doc(publicDatabase, "reviews/approved")));
    await assertFails(getDoc(doc(publicDatabase, "reviews/pending")));
    await assertFails(getDoc(doc(adminDatabase, "reviews/pending")));
  });

  it("allows an approved-only query and denies queries that could return unapproved reviews", async () => {
    await seed({
      "reviews/approved": { productId: "p1", approved: true, text: "공개" },
      "reviews/pending": { productId: "p1", approved: false, text: "비공개" },
    });
    const database = testEnvironment.unauthenticatedContext().firestore();

    const approvedSnapshot = await assertSucceeds(
      getDocs(query(
        collection(database, "reviews"),
        where("productId", "==", "p1"),
        where("approved", "==", true),
      )),
    );
    expect(approvedSnapshot.docs.map((entry) => entry.id)).toEqual(["approved"]);

    await assertFails(getDocs(collection(database, "reviews")));
    await assertFails(
      getDocs(query(collection(database, "reviews"), where("productId", "==", "p1"))),
    );
    await assertFails(
      getDocs(query(collection(database, "reviews"), where("approved", "==", false))),
    );
  });

  it("denies every client write, including writes attempted by an admin", async () => {
    await seed({ "admins/admin-1": { role: "admin" }, "reviews/existing": { approved: true } });
    const publicDatabase = testEnvironment.unauthenticatedContext().firestore();
    const adminDatabase = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertFails(setDoc(doc(publicDatabase, "reviews/public-write"), { approved: true }));
    await assertFails(updateDoc(doc(adminDatabase, "reviews/existing"), { text: "수정" }));
    await assertFails(deleteDoc(doc(adminDatabase, "reviews/existing")));
  });
});

describe("admins", () => {
  it("allows an authenticated user to read only their own admin path", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "admins/admin-2": { role: "admin" },
    });
    const publicDatabase = testEnvironment.unauthenticatedContext().firestore();
    const adminDatabase = testEnvironment.authenticatedContext("admin-1").firestore();
    const nonAdminDatabase = testEnvironment.authenticatedContext("user-1").firestore();

    await assertFails(getDoc(doc(publicDatabase, "admins/admin-1")));
    await assertSucceeds(getDoc(doc(adminDatabase, "admins/admin-1")));
    await assertFails(getDoc(doc(adminDatabase, "admins/admin-2")));
    await assertSucceeds(getDoc(doc(nonAdminDatabase, "admins/user-1")));
    await assertFails(getDoc(doc(nonAdminDatabase, "admins/admin-1")));
    await assertFails(getDocs(collection(adminDatabase, "admins")));
  });

  it("denies all client writes to admin documents", async () => {
    await seed({ "admins/admin-1": { role: "admin" } });
    const publicDatabase = testEnvironment.unauthenticatedContext().firestore();
    const adminDatabase = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertFails(setDoc(doc(publicDatabase, "admins/public-user"), { role: "admin" }));
    await assertFails(setDoc(doc(adminDatabase, "admins/new-admin"), { role: "admin" }));
    await assertFails(updateDoc(doc(adminDatabase, "admins/admin-1"), { role: "owner" }));
    await assertFails(deleteDoc(doc(adminDatabase, "admins/admin-1")));
  });
});

describe("orders and default deny", () => {
  it("denies every order read and write, including admin attempts", async () => {
    await seed({ "admins/admin-1": { role: "admin" }, "orders/order-1": { total: 10_000 } });
    const publicDatabase = testEnvironment.unauthenticatedContext().firestore();
    const adminDatabase = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertFails(getDoc(doc(publicDatabase, "orders/order-1")));
    await assertFails(setDoc(doc(publicDatabase, "orders/public-order"), { total: 10_000 }));
    await assertFails(getDoc(doc(adminDatabase, "orders/order-1")));
    await assertFails(getDocs(collection(adminDatabase, "orders")));
    await assertFails(setDoc(doc(adminDatabase, "orders/admin-order"), { total: 10_000 }));
  });

  it("denies unspecified documents and nested product subcollections even to an admin", async () => {
    await seed({
      "admins/admin-1": { role: "admin" },
      "private/secret": { value: true },
      "products/p1/internal/secret": { value: true },
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertFails(getDoc(doc(database, "private/secret")));
    await assertFails(setDoc(doc(database, "private/new-secret"), { value: true }));
    await assertFails(getDoc(doc(database, "products/p1/internal/secret")));
  });
});
