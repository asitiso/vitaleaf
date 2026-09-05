import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const homeEnd = css.indexOf("/* Product detail */");
const mobileStart = css.lastIndexOf("@media (max-width: 620px) {", homeEnd);
const homeStart = css.indexOf("/* Home merchandising */");
const base = homeStart === -1 || mobileStart === -1 ? "" : css.slice(homeStart, mobileStart);
const mobile = mobileStart === -1 ? "" : css.slice(mobileStart, homeEnd);

const ruleFrom = (source: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};
const rule = (selector: string): string => ruleFrom(mobile, selector);
const baseRule = (selector: string): string => ruleFrom(base, selector);

describe("mobile home discovery contract", () => {
  it("keeps every home banner compact enough for products to enter sooner", () => {
    expect(baseRule(".home-page")).toMatch(/gap:\s*32px/);
    expect(baseRule(".home-promotions")).toMatch(/min-height:\s*280px/);
    expect(baseRule(".home-hero")).toMatch(/34px/);
    expect(baseRule(".home-hero h1")).toMatch(/44px/);
    expect(baseRule(".home-transparency")).toMatch(/48px/);
    expect(rule(".home-page")).toMatch(/gap:\s*24px/);
    expect(rule(".home-hero")).toMatch(/min-height:\s*200px/);
    expect(rule(".home-promo-card")).toMatch(/min-height:\s*100px/);
  });

  it("groups proof points and the sample notice without repeated page gaps", () => {
    expect(baseRule(".home-proof-stack")).toMatch(/display:\s*grid/);
    expect(baseRule(".home-proof-stack")).toMatch(/gap:\s*8px/);
    expect(baseRule(".home-trust-bar")).toMatch(/padding:\s*12px\s+10px/);
  });

  it("moves the compact benefit cards after best products on mobile only", () => {
    expect(rule(".home-promo-stack--desktop")).toMatch(/display:\s*none/);
    expect(rule(".home-promo-stack--mobile")).toMatch(/display:\s*grid/);
    expect(rule(".home-promo-stack--mobile")).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("reduces the trust bar to one-line proof points", () => {
    expect(rule(".home-trust-bar span")).toMatch(/display:\s*none/);
  });

  it("shows the home-first search only on mobile", () => {
    expect(baseRule(".home-mobile-search")).toMatch(/display:\s*none/);
    expect(rule(".home-mobile-search")).toMatch(/display:\s*flex/);
  });

  it("keeps four desktop products and exposes a two-row swipe rail on mobile", () => {
    const overflowCards = ".home-product-section > .product-grid > .product-card:nth-child(n + 5)";
    const mobileGrid = rule(".home-product-section > .product-grid");

    expect(baseRule(overflowCards)).toMatch(/display:\s*none/);
    expect(rule(overflowCards)).toMatch(/display:\s*block/);
    expect(mobileGrid).toMatch(/grid-template-rows:\s*repeat\(2,\s*auto\)/);
    expect(mobileGrid).toMatch(/grid-auto-flow:\s*column/);
    expect(mobileGrid).toMatch(/overflow-x:\s*auto/);
    expect(mobileGrid).toMatch(/scroll-snap-type:\s*x\s+mandatory/);
  });

  it("keeps age tabs on one horizontal line instead of stacking Korean syllables", () => {
    expect(rule(".home-age-tabs a")).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(rule(".home-age-tabs a")).toMatch(/white-space:\s*nowrap/);
  });
});
