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

const readHeadingSection = (markdown: string, heading: string): string => {
  const headingText = `### ${heading}`;
  const start = markdown.indexOf(headingText);
  if (start < 0) return "";
  const contentStart = start + headingText.length;
  const remainder = markdown.slice(contentStart);
  const nextHeading = remainder.search(/^#{2,3} /m);
  return nextHeading < 0 ? markdown.slice(start) : markdown.slice(start, contentStart + nextHeading);
};

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

describe("Firebase inquiry configuration contracts", () => {
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

  it("keeps rules deployment behind the one approved action-time gate", async () => {
    const readme = await readText("README.md");
    const rulesSection = readHeadingSection(readme, "Firestore와 Storage 규칙 게시");
    const approvedSection = readHeadingSection(readme, "향후 승인된 배포 (이 작업에서 실행하지 않음)");

    expect(rulesSection).toContain("향후 승인된 배포");
    expect(rulesSection).toContain("최종 action-time 승인");
    expect(rulesSection).not.toMatch(/firebase-tools@15\.26\.0 deploy/u);
    expect(approvedSection).toContain("최종 action-time 승인");
  });

  it("explains that wildcard CORS only supports already-authorized signed PUTs", async () => {
    const readme = await readText("README.md");
    const approvedSection = readHeadingSection(readme, "향후 승인된 배포 (이 작업에서 실행하지 않음)");

    expect(approvedSection).toMatch(/origin.*\["\*"\]/su);
    expect(approvedSection).toMatch(/짧은 수명의 서명 PUT URL/su);
    expect(approvedSection).toMatch(/자격 ?증명.*공개/su);
    expect(approvedSection).toMatch(/IAM.*Storage.*규칙.*완화/su);
  });
});
