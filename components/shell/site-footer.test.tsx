import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";
import { STORE_POLICIES } from "../../lib/site/policies";

import { SiteFooter } from "./site-footer";

it("renders the shared footer links", () => {
  render(<SiteFooter />);

  for (const item of STOREFRONT_MENU.footer) {
    expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
  }
});

it("renders the public support contact from the shared policy", () => {
  const support = STORE_POLICIES.support as { phone: string; hours: string; lunch: string };
  const original = { ...support };
  Object.assign(support, { phone: "02-9999-0000", hours: "평일 10:00–17:00", lunch: "13:00–14:00" });

  try {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "02-9999-0000" })).toHaveAttribute("href", "tel:0299990000");
    expect(screen.getByText((_, element) => element?.tagName === "ADDRESS" && element.textContent?.includes("평일 10:00–17:00 (점심 13:00–14:00)") === true)).toBeVisible();
  } finally {
    Object.assign(support, original);
  }
});
