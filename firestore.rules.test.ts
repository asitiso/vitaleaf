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
    await seed({ "admins/admin-1": { role: "admin" }, "products/existing": product });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertSucceeds(setDoc(doc(database, "products/created"), product));
    await assertSucceeds(updateDoc(doc(database, "products/existing"), { stock: 4 }));
    await assertSucceeds(deleteDoc(doc(database, "products/existing")));
  });
});

describe("product drafts", () => {
  it("denies signed-out and role-mismatched draft reads and writes", async () => {
    await seed({
      "admins/editor-1": { role: "editor" },
      "admins/missing-role": { active: true },
      "productDrafts/draft-1": { ...product, status: "draft" },
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
      "productDrafts/existing": { ...product, status: "draft" },
    });
    const database = testEnvironment.authenticatedContext("admin-1").firestore();

    await assertSucceeds(getDoc(doc(database, "productDrafts/existing")));
    const snapshot = await assertSucceeds(getDocs(collection(database, "productDrafts")));
    expect(snapshot.docs.map((entry) => entry.id)).toEqual(["existing"]);
    await assertSucceeds(setDoc(doc(database, "productDrafts/created"), { ...product, status: "draft" }));
    await assertSucceeds(updateDoc(doc(database, "productDrafts/existing"), { stock: 4 }));
    await assertSucceeds(deleteDoc(doc(database, "productDrafts/existing")));
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
