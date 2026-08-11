import { PRODUCT_CATEGORIES } from "../catalog/taxonomy";

import { flattenMenuLinks, STOREFRONT_MENU } from "./storefront-menu";

describe("STOREFRONT_MENU", () => {
  it("uses unique supported destinations and shares taxonomy values", () => {
    const links = flattenMenuLinks(STOREFRONT_MENU);

    expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
    expect(STOREFRONT_MENU.categories.map((item) => item.value))
      .toEqual(PRODUCT_CATEGORIES.map((item) => item.value));
    expect(links.every((link) => link.href.startsWith("/"))).toBe(true);
  });
});
