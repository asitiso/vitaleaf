import { resolveMenuState } from "../lib/navigation/menu-state";
import { flattenMenuLinks, STOREFRONT_MENU } from "../lib/navigation/storefront-menu";

const appRouterPages = import.meta.glob("./**/page.tsx");

const routeForPageModule = (modulePath: string): string => {
  const route = modulePath.replace(/^\.\//, "").replace(/\/page\.tsx$/, "");
  return route ? `/${route}` : "/";
};

const supportedProductQueryKeys = new Set([
  "age",
  "category",
  "concern",
  "maxPrice",
  "minPrice",
  "promotion",
  "q",
  "sort",
  "stock",
  "view",
]);

const expectSupportedProductQuery = (url: URL): void => {
  const entries = [...url.searchParams.entries()];
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every(([key, value]) => supportedProductQueryKeys.has(key) && value.length > 0)).toBe(true);
  expect(new Set(entries.map(([key]) => key)).size).toBe(entries.length);

  const params = Object.fromEntries(entries);
  const state = resolveMenuState(params);

  if (params.category) expect(state.filters.category).not.toBe("");
  if (params.concern) expect(state.filters.concern).not.toBe("");
  if (params.age) expect(state.age).toBe(params.age);
  if (params.promotion) expect(state.promotion).toBe(params.promotion);
  if (params.view) expect(state.discoveryView).toBe(params.view);
  if (params.sort) expect(state.filters.sort).toBe(params.sort);
};

describe("public storefront menu route contract", () => {
  it("maps every internal menu link to an App Router page or a supported product query", () => {
    const pageRoutes = new Set(Object.keys(appRouterPages).map(routeForPageModule));
    const links = flattenMenuLinks(STOREFRONT_MENU);

    for (const link of links) {
      const url = new URL(link.href, "https://vitaleaf.test");
      expect(url.origin).toBe("https://vitaleaf.test");

      if (url.pathname === "/products") {
        expect(pageRoutes).toContain("/products");
        expectSupportedProductQuery(url);
      } else {
        expect(url.search).toBe("");
        expect(pageRoutes).toContain(url.pathname);
      }
    }
  });

  it("keeps authentication out of public navigation and exposes every help page", () => {
    const paths = flattenMenuLinks(STOREFRONT_MENU).map(({ href }) => new URL(href, "https://vitaleaf.test").pathname);

    expect(paths).not.toContain("/login");
    expect(paths.filter((path) => path.startsWith("/help"))).toEqual([
      "/help",
      "/help/shipping",
      "/help/returns",
    ]);
  });
});
