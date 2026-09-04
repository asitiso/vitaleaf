// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

const PROJECT_ID = "demo-vitaleaf-rules-test";
const MIB = 1024 * 1024;
const emulatorConfigured = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST,
);
const describeRules = emulatorConfigured ? describe : describe.skip;

let testEnvironment: RulesTestEnvironment;

const image = (size = 1) => new Uint8Array(size);
type TestStorage = ReturnType<ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["storage"]>;

const upload = (storage: TestStorage, path: string, size: number, contentType: string) => (
  storage.ref(path).put(image(size), { contentType }).then(() => undefined)
);

const seedAdmin = async (uid: string, role: string) => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "admins", uid), { role });
  });
};

const seedImage = async (path: string) => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(path).put(image(), { contentType: "image/png" });
  });
};

beforeAll(async () => {
  if (!emulatorConfigured) return;
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await readFile(resolve(process.cwd(), "firestore.rules"), "utf8") },
    storage: { rules: await readFile(resolve(process.cwd(), "storage.rules"), "utf8") },
  });
});

afterEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.clearStorage();
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describeRules("product image storage rules", () => {
  it("allows public reads of product images", async () => {
    await seedImage("products/draft-1/front.png");

    await assertSucceeds(testEnvironment.unauthenticatedContext().storage().ref("products/draft-1/front.png").getDownloadURL());
  });

  it("allows an admin to upload and delete a supported image", async () => {
    await seedAdmin("admin-1", "admin");
    const storage = testEnvironment.authenticatedContext("admin-1").storage();

    await assertSucceeds(upload(storage, "products/draft-1/front.webp", 1, "image/webp"));
    await assertSucceeds(storage.ref("products/draft-1/front.webp").delete());
  });

  it("denies writes from signed-out users and users without the admin role", async () => {
    await seedAdmin("editor-1", "editor");
    const signedOut = testEnvironment.unauthenticatedContext().storage();
    const editor = testEnvironment.authenticatedContext("editor-1").storage();

    await assertFails(upload(signedOut, "products/draft-1/public.png", 1, "image/png"));
    await assertFails(upload(editor, "products/draft-1/editor.png", 1, "image/png"));
    await seedImage("products/draft-1/existing.png");
    await assertFails(editor.ref("products/draft-1/existing.png").delete());
  });

  it("denies an admin upload with an unsupported MIME type or a file larger than 10 MiB", async () => {
    await seedAdmin("admin-1", "admin");
    const storage = testEnvironment.authenticatedContext("admin-1").storage();

    await assertFails(upload(storage, "products/draft-1/animated.gif", 1, "image/gif"));
    await assertFails(upload(storage, "products/draft-1/too-large.png", 10 * MIB + 1, "image/png"));
  });

  it("denies every operation outside the direct products/{draftId}/{fileName} scope", async () => {
    await seedAdmin("admin-1", "admin");
    const storage = testEnvironment.authenticatedContext("admin-1").storage();

    await assertFails(upload(storage, "private/secret.png", 1, "image/png"));
    await assertFails(upload(storage, "products/draft-1/nested/secret.png", 1, "image/png"));
  });
});

describeRules("inquiry image explicit client denial", () => {
  it("denies read, list, upload, and delete for pending and final inquiry objects", async () => {
    await seedImage("inquiryPending/inquiry-1/image.png");
    await seedImage("inquiries/inquiry-1/image.png");
    await seedAdmin("admin-1", "admin");
    const clients = [
      testEnvironment.unauthenticatedContext().storage(),
      testEnvironment.authenticatedContext("member-1").storage(),
      testEnvironment.authenticatedContext("member-2").storage(),
      testEnvironment.authenticatedContext("admin-1").storage(),
    ];

    for (const storage of clients) {
      for (const root of ["inquiryPending", "inquiries"]) {
        const existingPath = `${root}/inquiry-1/image.png`;
        await assertFails(storage.ref(existingPath).getDownloadURL());
        await assertFails(storage.ref(root).listAll());
        await assertFails(upload(storage, `${root}/inquiry-1/client-create.png`, 1, "image/png"));
        await assertFails(storage.ref(existingPath).delete());
      }
    }
  });
});
