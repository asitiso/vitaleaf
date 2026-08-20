import { describe, expect, it } from "vitest";

import { toPublishedProductInput, validatePublishableDraft } from "./draft";
import type { ProductDraft } from "./types";

const makeDraft = (overrides: Partial<ProductDraft> = {}): ProductDraft => ({
  id: "draft-1",
  name: "Omega 3",
  slug: "omega-3",
  category: "supplements",
  concerns: [],
  price: 20_000,
  originalPrice: null,
  thumbnailUrl: "",
  images: [],
  media: [{ url: "main.jpg", storagePath: "products/main.jpg", alt: "Main image", order: 0 }],
  description: "Daily omega supplement",
  benefits: [],
  ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
  dosage: "Take one capsule daily",
  origin: "Korea",
  certifications: [],
  cautions: ["Consult a professional if needed"],
  stock: 10,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  status: "draft",
  mode: "create",
  sessionId: null,
  revision: 0,
  sourceProductId: null,
  sourceProductRevision: null,
  sourceCreatedAt: null,
  sourceCreatedBy: null,
  currentStep: 1,
  createdAt: null,
  updatedAt: null,
  createdBy: null,
  updatedBy: null,
  ...overrides,
});

describe("product drafts", () => {
  it("allows incomplete drafts but blocks publishing them", () => {
    expect(validatePublishableDraft(makeDraft({ name: "" }))).toContainEqual(
      expect.objectContaining({ step: 1, field: "name" }),
    );
  });

  it("identifies every missing publish requirement at its wizard step", () => {
    const errors = validatePublishableDraft(
      makeDraft({
        name: "",
        category: "",
        price: 0,
        stock: -1,
        media: [],
        dosage: "",
        ingredients: [],
        origin: "",
        cautions: [],
      }),
    );

    expect(errors.map(({ step, field }) => ({ step, field }))).toEqual([
      { step: 1, field: "name" },
      { step: 1, field: "category" },
      { step: 1, field: "price" },
      { step: 1, field: "stock" },
      { step: 2, field: "media" },
      { step: 3, field: "dosage" },
      { step: 3, field: "ingredients" },
      { step: 4, field: "origin" },
      { step: 4, field: "cautions" },
    ]);
  });

  it("rejects ingredient rows whose names are only whitespace", () => {
    expect(validatePublishableDraft(makeDraft({
      ingredients: [{ name: "   ", amount: "600mg", dailyValue: "" }],
    }))).toContainEqual(expect.objectContaining({ step: 3, field: "ingredients" }));
  });

  it("publishes standard media while deriving legacy image fields", () => {
    const input = toPublishedProductInput(
      makeDraft({
        thumbnailUrl: "outdated.jpg",
        images: ["outdated-detail.jpg"],
        media: [
          { url: "second.jpg", storagePath: null, alt: "Second", order: 2 },
          { url: "first.jpg", storagePath: "products/first.jpg", alt: "First", order: 1 },
          { url: "first.jpg", storagePath: null, alt: "Duplicate", order: 0 },
        ],
      }),
    );

    expect(input.thumbnailUrl).toBe("first.jpg");
    expect(input.images).toEqual(["first.jpg", "second.jpg"]);
    expect(input.media).toEqual([
      { url: "first.jpg", storagePath: "products/first.jpg", alt: "First", order: 1 },
      { url: "second.jpg", storagePath: null, alt: "Second", order: 2 },
    ]);
  });

  it("writes supported legacy taxonomy labels as canonical codes", () => {
    const input = toPublishedProductInput(makeDraft({
      category: "유산균",
      concerns: ["장 건강", "면역"],
    }));

    expect(input.category).toBe("probiotic");
    expect(input.concerns).toEqual(["gut", "immunity"]);
  });


  it("returns a publish snapshot independent from mutable draft collections", () => {
    const draft = makeDraft({
      concerns: ["heart"],
      images: ["legacy.jpg"],
      benefits: ["supports circulation"],
      ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
      certifications: ["GMP"],
      cautions: ["Take with food"],
    });
    const input = toPublishedProductInput(draft);

    draft.concerns[0] = "changed";
    draft.benefits[0] = "changed";
    draft.ingredients[0]!.name = "changed";
    draft.certifications[0] = "changed";
    draft.cautions[0] = "changed";
    draft.media[0]!.alt = "changed";

    expect(input.concerns).toEqual(["heart"]);
    expect(input.benefits).toEqual(["supports circulation"]);
    expect(input.ingredients).toEqual([{ name: "EPA", amount: "600mg", dailyValue: "" }]);
    expect(input.certifications).toEqual(["GMP"]);
    expect(input.cautions).toEqual(["Take with food"]);
    expect(input.media[0]?.alt).toBe("Main image");
    expect(input.images).not.toBe(draft.images);
  });
});
