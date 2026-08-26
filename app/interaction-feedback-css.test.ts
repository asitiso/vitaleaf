import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")
  .replace(/^@import[^;]+;\s*/gm, "");
const styleElement = document.createElement("style");
styleElement.textContent = css;
document.head.append(styleElement);
const styleSheet = styleElement.sheet;
styleElement.remove();

const topLevelRules = Array.from(styleSheet?.cssRules ?? []);
const styleRules = topLevelRules
  .filter((rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE);

const rule = (selector: string): CSSStyleDeclaration => {
  const match = styleRules.find((candidate) => candidate.selectorText === selector);
  expect(match, `Missing interaction CSS rule: ${selector}`).toBeDefined();
  return match!.style;
};

describe("storefront press feedback", () => {
  it("gives enabled links and buttons a quick visible pressed state", () => {
    const interactive = rule("button:not(:disabled), a[href]:not([aria-disabled=\"true\"]), [role=\"button\"]:not([aria-disabled=\"true\"])");
    const pressed = rule("button:not(:disabled):active, a[href]:not([aria-disabled=\"true\"]):active, [role=\"button\"]:not([aria-disabled=\"true\"]):active");

    expect(interactive.transition).toContain("transform 120ms");
    expect(pressed.transform).toBe("translateY(1px) scale(0.985)");
    expect(pressed.filter).toBe("brightness(0.92)");
  });

  it("makes product cards feel like a pressed surface", () => {
    const card = rule(".product-card__link:active");

    expect(card.transform).toBe("translateY(1px) scale(0.99)");
    expect(card.backgroundColor).toBe("rgb(243, 247, 242)");
    expect(card.boxShadow).toContain("inset");
  });

  it("highlights dense navigation controls without keeping motion for reduced-motion users", () => {
    const denseNavigation = rule(".site-header__mobile-drawer nav a:active, .site-header__mobile-drawer nav button:active, .product-info__accordion h3 button:active, .product-browser__filter-toggle:active");
    expect(denseNavigation.backgroundColor).toBe("var(--color-mint)");

    const reducedMedia = topLevelRules
      .filter((candidate): candidate is CSSMediaRule => candidate.type === CSSRule.MEDIA_RULE)
      .find((candidate) => candidate.conditionText === "(prefers-reduced-motion: reduce)");
    const reducedRule = Array.from(reducedMedia?.cssRules ?? [])
      .filter((candidate): candidate is CSSStyleRule => candidate.type === CSSRule.STYLE_RULE)
      .find((candidate) => candidate.selectorText.includes("button:not(:disabled):active"));

    expect(reducedRule, "Missing reduced-motion press override").toBeDefined();
    expect(reducedRule!.style.getPropertyValue("transform")).toBe("none");
    expect(reducedRule!.style.getPropertyPriority("transform")).toBe("important");
  });
});
