import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { SiteFooter } from "./site-footer";

it("links only to useful routes that exist in the storefront", () => {
  render(<SiteFooter />);

  const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));

  expect(hrefs).toEqual(["/", "/products", "/cart", "tel:0212345678"]);
  expect(hrefs).not.toContain("/story");
  expect(hrefs.some((href) => href?.startsWith("/help"))).toBe(false);
});
