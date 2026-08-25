import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const homeEnd = css.indexOf("/* Product detail */");
const mobileStart = css.lastIndexOf("@media (max-width: 620px) {", homeEnd);
const mobile = mobileStart === -1 ? "" : css.slice(mobileStart, homeEnd);

const rule = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return mobile.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("mobile home discovery contract", () => {
  it("makes the hero compact enough for products to enter the first viewport", () => {
    expect(rule(".home-page")).toMatch(/gap:\s*28px/);
    expect(rule(".home-hero")).toMatch(/min-height:\s*220px/);
  });

  it("moves the compact benefit cards after best products on mobile only", () => {
    expect(rule(".home-promo-stack--desktop")).toMatch(/display:\s*none/);
    expect(rule(".home-promo-stack--mobile")).toMatch(/display:\s*grid/);
    expect(rule(".home-promo-stack--mobile")).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("reduces the trust bar to one-line proof points", () => {
    expect(rule(".home-trust-bar span")).toMatch(/display:\s*none/);
  });
});
