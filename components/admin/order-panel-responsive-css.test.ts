import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")
  .replace(/^@import[^;]+;\s*/gm, "");
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

describe("admin order responsive CSS contract", () => {
  it("uses the bounded desktop list and fluid detail grid", () => {
    expect(baseRule(".admin-order-layout").style.gridTemplateColumns)
      .toBe("minmax(300px, .85fr) minmax(0, 1.4fr)");

    const detail = baseRule(".admin-order-detail").style;
    expect(detail.minWidth).toBe("0px");
    expect(detail.maxWidth).toBe("100%");
    expect(detail.width).toBe("");
    expect(detail.overflowWrap).toBe("anywhere");
  });

  it("keeps each order selectable with a touch-sized target and wraps long identifiers", () => {
    const row = baseRule(".admin-order-row").style;
    expect(Number.parseFloat(row.minHeight)).toBeGreaterThanOrEqual(44);
    expect(row.overflowWrap).toBe("anywhere");
  });

  it("switches to one column with a bounded scroll region at the admin tablet breakpoint", () => {
    expect(mediaRule("(max-width: 760px)", ".admin-order-layout").style.gridTemplateColumns)
      .toBe("1fr");

    const list = mediaRule("(max-width: 760px)", ".admin-order-list-container").style;
    expect(list.maxHeight).not.toBe("");
    expect(list.maxHeight).not.toBe("none");
    expect(list.overflowY).toBe("auto");
  });

  it("stacks filters and removes inner height limits at the admin phone breakpoint", () => {
    expect(mediaRule("(max-width: 480px)", ".admin-order-filters").style.gridTemplateColumns)
      .toBe("1fr");

    const list = mediaRule("(max-width: 480px)", ".admin-order-list-container").style;
    expect(list.maxHeight).toBe("none");
    expect(list.overflowY).toBe("visible");
    const detail = mediaRule("(max-width: 480px)", ".admin-order-detail").style;
    expect(detail.height).toBe("auto");
    expect(detail.maxHeight).toBe("none");
    expect(mediaRule("(max-width: 480px)", ".admin-order-form .admin-primary-button").style.width)
      .toBe("100%");
  });
});
