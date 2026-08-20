import { parseProductQuery, resolveMenuState } from "../lib/navigation/menu-state";
import { flattenMenuLinks, STOREFRONT_MENU } from "../lib/navigation/storefront-menu";

const appRouterPages = import.meta.glob("./**/page.tsx");

const routeForPageModule = (modulePath: string): string => {
  const route = modulePath.replace(/^\.\//, "").replace(/\/page\.tsx$/, "");
  return route ? `/${route}` : "/";
};

const searchParamsRecord = (params: URLSearchParams): Record<string, string | string[]> => Object.fromEntries(
  [...new Set(params.keys())].map((key) => {
    const values = params.getAll(key);
    return [key, values.length === 1 ? values[0]! : values];
  }),
);

const expectedProductStateByHref = {
  "/products?sort=popular": { title: "베스트 상품" },
  "/products?promotion=today": { title: "오늘의 혜택", promotion: "today" },
  "/products?view=concerns": { title: "건강 고민별 상품", discoveryView: "concerns" },
  "/products?category=gift": { title: "선물세트", filters: { category: "선물세트" } },
  "/products?category=nutrition": { title: "영양제", filters: { category: "영양제" } },
  "/products?category=vitamin": { title: "비타민", filters: { category: "비타민" } },
  "/products?category=probiotic": { title: "유산균", filters: { category: "유산균" } },
  "/products?category=wellness": { title: "웰니스", filters: { category: "웰니스" } },
  "/products?category=food": { title: "건강식품", filters: { category: "건강식품" } },
  "/products?concern=energy": { title: "피로·활력 상품", filters: { concern: "피로·활력" } },
  "/products?concern=immunity": { title: "면역 상품", filters: { concern: "면역" } },
  "/products?concern=sleep": { title: "수면 상품", filters: { concern: "수면" } },
  "/products?concern=eyes": { title: "눈 건강 상품", filters: { concern: "눈 건강" } },
  "/products?concern=gut": { title: "장 건강 상품", filters: { concern: "장 건강" } },
  "/products?concern=brain": { title: "뇌 건강 상품", filters: { concern: "뇌 건강" } },
  "/products?age=30": { title: "30대 추천", age: "30" },
  "/products?age=40": { title: "40대 추천", age: "40" },
  "/products?age=50": { title: "50대+ 추천", age: "50" },
} as const;

describe("public storefront menu route contract", () => {
  it("maps every internal menu link to an App Router page or a supported product query", () => {
    const pageRoutes = new Set(Object.keys(appRouterPages).map(routeForPageModule));
    const links = flattenMenuLinks(STOREFRONT_MENU);
    const productHrefs = links.filter(({ href }) => href.startsWith("/products?")).map(({ href }) => href).sort();

    expect(productHrefs).toEqual(Object.keys(expectedProductStateByHref).sort());
    for (const link of links) {
      const url = new URL(link.href, "https://vitaleaf.test");
      expect(url.origin).toBe("https://vitaleaf.test");

      if (url.pathname === "/products") {
        expect(pageRoutes).toContain("/products");
        const parsed = parseProductQuery(searchParamsRecord(url.searchParams));
        expect(parsed.isSupported, link.href).toBe(true);
        expect(new URLSearchParams(parsed.query).toString(), link.href).toBe(url.searchParams.toString());
        expect(resolveMenuState(parsed.query)).toMatchObject(
          expectedProductStateByHref[link.href as keyof typeof expectedProductStateByHref],
        );
      } else {
        expect(url.search).toBe("");
        expect(pageRoutes).toContain(url.pathname);
      }
    }
  });

  it.each([
    "/products?minPrice=nope",
    "/products?minPrice=-1",
    "/products?minPrice=0x10",
    "/products?minPrice=1000&minPrice=2000",
    "/products?maxPrice=1e3",
    "/products?stock=garbage",
    "/products?category=unknown",
    "/products?concern=unknown",
    "/products?age=99",
    "/products?promotion=expired",
    "/products?view=other",
    "/products?sort=random",
    "/products?q=one&q=two",
    "/products?campaign=summer",
  ])("rejects malformed or unsupported product destination %s", (href) => {
    const url = new URL(href, "https://vitaleaf.test");

    expect(parseProductQuery(searchParamsRecord(url.searchParams)).isSupported).toBe(false);
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
