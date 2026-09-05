import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const mobileStart = css.lastIndexOf("@media (max-width: 620px) {", css.indexOf("/* Product detail */"));
const listingStart = css.indexOf("/* Product listing */");
const base = listingStart === -1 || mobileStart === -1 ? "" : css.slice(listingStart, mobileStart);
const mobile = mobileStart === -1 ? "" : css.slice(mobileStart, css.indexOf("/* Product detail */"));

const ruleFrom = (source: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("compact product listing introduction", () => {
  it("uses a short desktop title band so products start higher", () => {
    expect(ruleFrom(base, ".products-page")).toMatch(/padding-top:\s*24px/);
    expect(ruleFrom(base, ".products-page__header")).toMatch(/padding:\s*22px\s+28px/);
    expect(ruleFrom(base, ".products-page__header")).toMatch(/grid-template-columns:/);
    expect(ruleFrom(base, ".products-page__header")).toMatch(/margin-bottom:\s*20px/);
  });

  it("compresses the title band further on narrow screens", () => {
    expect(ruleFrom(mobile, ".products-page__header")).toMatch(/padding:\s*18px/);
    expect(ruleFrom(mobile, ".products-page__header")).toMatch(/margin-bottom:\s*18px/);
  });
});
