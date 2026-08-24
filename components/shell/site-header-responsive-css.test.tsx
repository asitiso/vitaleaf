import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../features/auth/auth-context", () => ({
  useAuth: () => ({ status: "signed-out", user: null, error: "", signOutMember: vi.fn() }),
}));

import { CartProvider } from "../../features/cart/cart-context";
import { SiteHeader } from "./site-header";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8").replace(/^@import[^;]+;\s*/gm, "");
const styleElement = document.createElement("style");
styleElement.textContent = css;
document.head.append(styleElement);
const styleSheet = styleElement.sheet;
styleElement.remove();

const styleRules = (rules: CSSRuleList): CSSStyleRule[] => Array.from(rules)
  .filter((rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE);

const mediaRulesFor = (conditionText: string): CSSStyleRule[] => {
  const mediaRules = Array.from(styleSheet?.cssRules ?? [])
    .filter((rule): rule is CSSMediaRule => rule.type === CSSRule.MEDIA_RULE
      && (rule as CSSMediaRule).conditionText === conditionText);
  expect(mediaRules.length, `Missing ${conditionText} header media query`).toBeGreaterThan(0);
  return mediaRules.flatMap((media) => styleRules(media.cssRules));
};

const mediaRule = (selector: string): CSSStyleRule => {
  const rule = mediaRulesFor("(max-width: 620px)")
    .find((candidate) => candidate.selectorText === selector);
  expect(rule, `Missing mobile CSS rule: ${selector}`).toBeDefined();
  return rule!;
};

const renderHeader = () => render(<CartProvider><SiteHeader /></CartProvider>);

describe("responsive SiteHeader target contract", () => {
  it("ties the production header and drawer selectors to rendered controls", async () => {
    const user = userEvent.setup();
    renderHeader();

    expect(screen.getByRole("button", { name: "메뉴 열기" })).toHaveClass("site-header__mobile-trigger");
    expect(screen.getByRole("link", { name: "Vitaleaf 홈" })).toHaveClass("site-header__wordmark");
    expect(screen.getByRole("link", { name: /장바구니/ })).toHaveClass("site-header__cart");

    await user.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const drawer = screen.getByRole("dialog", { name: "모바일 메뉴" });
    expect(drawer).toHaveClass("site-header__mobile-drawer");
    expect(within(drawer).getByRole("button", { name: "닫기" }).parentElement)
      .toHaveClass("site-header__drawer-header");
    expect(within(drawer).getByRole("link", { name: "전체 상품" }).closest("nav"))
      .toHaveAccessibleName("모바일 주요 메뉴");
    expect(within(drawer).getByRole("link", { name: "영양제" }).closest("ul"))
      .toHaveClass("mega-menu__link-list");
    expect(within(drawer).getByRole("link", { name: "50대+" }).closest("ul"))
      .toHaveClass("mega-menu__age-list");
  });

  it("makes the mobile menu trigger at least 48px square", () => {
    const trigger = mediaRule(".site-header__mobile-trigger").style;
    expect(trigger.width).toBe("48px");
    expect(trigger.height).toBe("48px");
  });

  it("gives the mobile wordmark and cart links a 48px minimum target", () => {
    const headerLinks = mediaRule(".site-header__wordmark, .site-header__cart").style;
    expect(headerLinks.minWidth).toBe("48px");
    expect(headerLinks.minHeight).toBe("48px");
    expect(headerLinks.alignItems).toBe("center");
  });

  it("gives every drawer link and button a 48px minimum target", () => {
    const close = mediaRule(".site-header__drawer-header button").style;
    expect(close.minWidth).toBe("48px");
    expect(close.minHeight).toBe("48px");

    expect(mediaRule(".site-header__mobile-drawer a, .site-header__mobile-drawer nav button").style.minHeight).toBe("48px");
    const textLinks = mediaRule(
      ".site-header__mobile-drawer nav a, .site-header__mobile-drawer .mega-menu__link-list a, .site-header__mobile-drawer .mega-menu__age-list a",
    ).style;
    expect(textLinks.display).toBe("flex");
    expect(textLinks.alignItems).toBe("center");
  });

  it("keeps account actions reachable at the representative 768px tablet breakpoint", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
    const tabletRules = mediaRulesFor("(max-width: 900px)");
    expect(tabletRules.some((rule) => (
      rule.selectorText.includes(".site-header__utility-nav a:not(.site-header__cart)")
      && rule.style.display === "none"
    ))).toBe(false);
    expect(mediaRule(
      ".site-header__utility-nav a:not(.site-header__cart), .site-header__utility-nav button, .site-header__account-placeholder, .site-header__account-error",
    ).style.display).toBe("none");
  });
});
