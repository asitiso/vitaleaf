import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";

import { SiteFooter } from "./site-footer";

it("renders the shared footer links", () => {
  render(<SiteFooter />);

  for (const item of STOREFRONT_MENU.footer) {
    expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
  }
});
