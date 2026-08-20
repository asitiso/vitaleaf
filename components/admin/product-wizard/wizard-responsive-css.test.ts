import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../../../lib/firebase/product-media", () => ({
  uploadProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  validateImageFile: () => ({ ok: true }),
}));

import type { ProductDraft, ProductMedia } from "../../../lib/products/types";
import { MediaStep } from "./media-step";
import { ProductWizard } from "./product-wizard";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(/^@import[^;]+;\s*/gm, "");
const layoutSource = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
const styleElement = document.createElement("style");
styleElement.textContent = css;
document.head.append(styleElement);

const styleRules = (rules: CSSRuleList): CSSStyleRule[] => Array.from(rules)
  .filter((rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE);

const baseRule = (selector: string): CSSStyleRule => {
  const rule = styleRules(styleElement.sheet?.cssRules ?? document.styleSheets[0]!.cssRules)
    .find((candidate) => candidate.selectorText === selector);
  expect(rule, `Missing CSS rule: ${selector}`).toBeDefined();
  return rule!;
};

const mediaRule = (conditionText: string, selector: string): CSSStyleRule => {
  const mediaRules = Array.from(styleElement.sheet?.cssRules ?? [])
    .filter((rule): rule is CSSMediaRule => rule.type === CSSRule.MEDIA_RULE
      && (rule as CSSMediaRule).conditionText === conditionText);
  expect(mediaRules.length, `Missing media query: ${conditionText}`).toBeGreaterThan(0);

  const rule = mediaRules
    .flatMap((media) => styleRules(media.cssRules))
    .find((candidate) => candidate.selectorText === selector);
  expect(rule, `Missing ${selector} in ${conditionText}`).toBeDefined();
  return rule!;
};

const draft: ProductDraft = {
  id: "responsive-draft",
  name: "반응형 상품",
  slug: "responsive-product",
  category: "nutrition",
  concerns: [],
  price: 10_000,
  originalPrice: null,
  thumbnailUrl: "first.jpg",
  images: ["first.jpg"],
  media: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 1,
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
};

const media: ProductMedia = {
  url: "first.jpg",
  storagePath: "products/responsive-draft/first.jpg",
  alt: "반응형 상품",
  order: 0,
};

describe("390px product wizard CSS contract", () => {
  it("loads the production stylesheet from the application root layout", () => {
    expect(layoutSource).toMatch(/^import ["']\.\/globals\.css["'];?$/m);
  });

  it("renders the ProductWizard DOM classes targeted by the responsive rules", () => {
    render(createElement(ProductWizard, {
      draft,
      saveState: "idle",
      onChange: vi.fn(),
      onSave: vi.fn().mockResolvedValue(undefined),
      onPreview: vi.fn(),
      onPublish: vi.fn().mockResolvedValue(undefined),
    }));

    expect(screen.getByRole("region", { name: "상품 등록" })).toHaveClass("product-wizard");
    expect(screen.getByLabelText("상품명").closest(".product-wizard__fields")).not.toBeNull();
    expect(screen.getByLabelText("상품 등록 작업")).toHaveClass("product-wizard__actions");
  });

  it("renders the MediaStep DOM classes targeted by the image rules", () => {
    render(createElement(MediaStep, {
      productId: draft.id,
      media: [media],
      onChange: vi.fn(),
      upload: vi.fn(),
      deleteImage: vi.fn(),
    }));

    expect(screen.getByRole("group", { name: "상품 이미지를 준비하세요" }))
      .toHaveClass("product-wizard__step-content", "product-media-step");
    expect(screen.getByLabelText("상품 이미지 추가").closest(".product-media-step__drop-zone")).not.toBeNull();
    const imageList = screen.getByLabelText("등록한 상품 이미지");
    expect(imageList).toHaveClass("product-media-step__list");
    expect(screen.getByRole("img", { name: "반응형 상품" }).closest("article"))
      .toHaveClass("product-media-step__item");
    expect(screen.getByRole("button", { name: "첫 번째 이미지 삭제" }).parentElement)
      .toHaveClass("product-media-step__item-actions");
  });

  it("collapses wizard fields and the image queue to one column", () => {
    expect(mediaRule(
      "(max-width: 760px)",
      ".product-wizard__fields, .product-wizard__checks",
    ).style.gridTemplateColumns).toBe("1fr");
    expect(mediaRule(
      "(max-width: 480px)",
      ".product-media-step__list",
    ).style.gridTemplateColumns).toBe("1fr");
  });

  it("keeps wizard and image controls at least 44px tall", () => {
    const selectors = [
      ".product-wizard__fields input, .product-wizard__fields select, .product-wizard__fields textarea, .product-wizard__rows input",
      ".product-wizard__rows button, .product-wizard__actions button",
      ".product-media-step__upload button, .product-media-step__item-actions button, .product-media-step__confirm button",
      ".product-media-step__item input",
    ];

    for (const selector of selectors) {
      expect(Number.parseFloat(baseRule(selector).style.minHeight), selector).toBeGreaterThanOrEqual(44);
    }
  });

  it("keeps sticky actions above the safe area and lets image controls wrap", () => {
    const actions = baseRule(".product-wizard__actions").style;
    expect(actions.position).toBe("sticky");
    expect(actions.bottom).toBe("0px");
    expect(css).toMatch(/\.product-wizard__actions\s*\{[^}]*padding:[^;}]*env\(safe-area-inset-bottom\)/);

    expect(baseRule(".product-media-step__upload > div").style.flexWrap).toBe("wrap");
    expect(baseRule(".product-media-step__item-actions").style.flexWrap).toBe("wrap");
  });

  it("pins the action bar and lets its controls share rows inside the 480px breakpoint", () => {
    const actions = mediaRule("(max-width: 480px)", ".product-wizard__actions").style;
    expect(actions.right).toBe("0px");
    expect(actions.bottom).toBe("0px");
    expect(actions.left).toBe("0px");
    expect(actions.borderTopWidth).toBe("1px");
    expect(actions.borderTopStyle).toBe("solid");
    expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*\.product-wizard__actions\s*\{[^}]*padding:[^;}]*env\(safe-area-inset-bottom\)/);
    expect(mediaRule("(max-width: 480px)", ".product-wizard__actions button").style.flex)
      .toBe("1 1 calc(50% - 8px)");
  });
});
