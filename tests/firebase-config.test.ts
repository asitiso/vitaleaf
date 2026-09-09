// @vitest-environment node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type IndexField = { fieldPath: string; order?: string; arrayConfig?: string };
type CompositeIndex = {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
};

const readJson = async <T>(fileName: string): Promise<T> => (
  JSON.parse(await readFile(resolve(process.cwd(), fileName), "utf8")) as T
);

const readText = async (fileName: string): Promise<string> => (
  readFile(resolve(process.cwd(), fileName), "utf8")
);

const readEnvNames = async (): Promise<string[]> => (
  (await readText(".env.example"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.slice(0, line.indexOf("=")))
);

const hasIndexFor = (
  indexes: CompositeIndex[],
  equalityFields: string[],
): boolean => indexes.some((index) => {
  if (index.collectionGroup !== "inquiries" || index.queryScope !== "COLLECTION") return false;
  const fields = new Map(index.fields.map((field) => [field.fieldPath, field]));
  const indexedEqualityFields = index.fields.slice(0, -1).map((field) => field.fieldPath);
  return indexedEqualityFields.length === equalityFields.length
    && new Set(indexedEqualityFields).size === equalityFields.length
    && equalityFields.every((field) => fields.get(field)?.order === "ASCENDING")
    && fields.get("createdAt")?.order === "DESCENDING"
    && index.fields.at(-1)?.fieldPath === "createdAt";
});

describe("Firebase configuration contracts", () => {
  it("declares the exact public, server, and test-account deployment environment names", async () => {
    const publicNames = [
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
      "NEXT_PUBLIC_SITE_URL",
    ];
    const serverNames = [
      "FIREBASE_ADMIN_PROJECT_ID",
      "FIREBASE_ADMIN_CLIENT_EMAIL",
      "FIREBASE_ADMIN_PRIVATE_KEY",
      "FIREBASE_STORAGE_BUCKET",
      "GUEST_ORDER_LOOKUP_SECRET",
      "INQUIRY_TOKEN_SECRET",
    ];
    const testAccountNames = ["TEST_CUSTOMER_UID"];
    const envNames = await readEnvNames();

    expect(envNames.filter((name) => name.startsWith("NEXT_PUBLIC_")).sort()).toEqual(publicNames.sort());
    expect(envNames.filter((name) => !name.startsWith("NEXT_PUBLIC_")).sort()).toEqual(
      [...serverNames, ...testAccountNames].sort(),
    );
    expect(envNames.sort()).toEqual([...publicNames, ...serverNames, ...testAccountNames].sort());
  });

  it("covers every member, guest, and admin query shape emitted by the repository", async () => {
    const config = await readJson<{ indexes: CompositeIndex[] }>("firestore.indexes.json");
    const filters = [[], ["status"], ["category"], ["status", "category"]];
    const ownerQueries = [
      ["ownerType", "memberUid"],
      ["ownerType", "guestOrderNumber"],
    ];

    for (const owner of ownerQueries) {
      for (const filter of filters) {
        expect(hasIndexFor(config.indexes, [...owner, ...filter]), `${owner.join("+")} + ${filter.join("+")}`).toBe(true);
      }
    }
    for (const filter of filters.slice(1)) {
      expect(hasIndexFor(config.indexes, filter), `admin + ${filter.join("+")}`).toBe(true);
    }
  });

  it("points Firebase at the index definition without changing existing emulator settings", async () => {
    const firebase = await readJson<{ firestore?: { rules?: string; indexes?: string }; storage?: { rules?: string } }>("firebase.json");
    expect(firebase.firestore?.indexes).toBe("firestore.indexes.json");
    expect(firebase.firestore?.rules).toBe("firestore.rules");
    expect(firebase.storage?.rules).toBe("storage.rules");
  });

  it("uses the official gcloud CORS file shape for signed PUT uploads", async () => {
    const cors = await readJson<Array<Record<string, unknown>>>("storage.cors.json");
    expect(cors).toEqual([
      { origin: ["*"], method: ["PUT"], responseHeader: ["Content-Type"], maxAgeSeconds: 3600 },
    ]);
  });

  it("limits lifecycle deletion to pending inquiry objects older than one day", async () => {
    const lifecycle = await readJson<{ rule?: Array<{ action?: { type?: string }; condition?: { age?: number; matchesPrefix?: string[] } }> }>("storage.lifecycle.json");
    expect(lifecycle.rule).toHaveLength(1);
    const [rule] = lifecycle.rule ?? [];
    expect(rule).toEqual({
      action: { type: "Delete" },
      condition: { age: 1, matchesPrefix: ["inquiryPending/"] },
    });
    expect(JSON.stringify(rule)).not.toMatch(/(?:^|\/)inquiries\//u);
    expect(JSON.stringify(rule)).not.toContain("products/");
  });

});
