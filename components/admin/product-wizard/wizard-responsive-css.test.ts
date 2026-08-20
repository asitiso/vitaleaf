import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(/^@import[^;]+;\s*/gm, "");
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

describe("390px product wizard CSS contract", () => {
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
});
