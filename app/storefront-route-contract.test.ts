import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";

import { parseProductQuery, resolveMenuState } from "../lib/navigation/menu-state";
import { flattenMenuLinks, STOREFRONT_MENU } from "../lib/navigation/storefront-menu";

const { getProductsMock } = vi.hoisted(() => ({ getProductsMock: vi.fn() }));

vi.mock("../lib/firebase/server-read", () => ({ getServerProducts: getProductsMock }));

import ProductsPage from "./products/page";
import IngredientsPage from "./ingredients/page";
import StoryPage from "./story/page";
import HelpPage from "./help/page";
import ShippingPage from "./help/shipping/page";
import ReturnsPage from "./help/returns/page";

const appRouterPages = import.meta.glob("./**/page.tsx");

const routeForPageModule = (modulePath: string): string => {
  if (modulePath === "./page.tsx") return "/";
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
  "/products": { title: "전체 상품" },
  "/products?sort=popular": { title: "베스트 상품" },
  "/products?sort=newest": { title: "신상품" },
  "/products?promotion=today": { title: "오늘의 혜택", promotion: "today" },
  "/products?promotion=trial": { title: "첫 구매 추천", promotion: "trial" },
  "/products?view=concerns": { title: "건강 고민별 상품", discoveryView: "concerns" },
  "/products?view=ingredients": { title: "성분별 상품", discoveryView: "ingredients" },
  "/products?stock=1": { title: "전체 상품", filters: { inStockOnly: true } },
  "/products?q=오메가-3": { title: "전체 상품", filters: { query: "오메가-3" } },
  "/products?category=gift": { title: "선물세트", filters: { category: "gift" } },
  "/products?category=nutrition": { title: "영양제", filters: { category: "nutrition" } },
  "/products?category=vitamin": { title: "비타민", filters: { category: "vitamin" } },
  "/products?category=probiotic": { title: "유산균", filters: { category: "probiotic" } },
  "/products?category=wellness": { title: "웰니스", filters: { category: "wellness" } },
  "/products?category=food": { title: "건강식품", filters: { category: "food" } },
  "/products?concern=energy": { title: "피로·활력 상품", filters: { concern: "energy" } },
  "/products?concern=immunity": { title: "면역 상품", filters: { concern: "immunity" } },
  "/products?concern=sleep": { title: "수면 상품", filters: { concern: "sleep" } },
  "/products?concern=eyes": { title: "눈 건강 상품", filters: { concern: "eyes" } },
  "/products?concern=gut": { title: "장 건강 상품", filters: { concern: "gut" } },
  "/products?concern=brain": { title: "뇌 건강 상품", filters: { concern: "brain" } },
  "/products?concern=circulation": { title: "혈행 상품", filters: { concern: "circulation" } },
  "/products?concern=bones": { title: "관절·뼈 건강 상품", filters: { concern: "bones" } },
  "/products?age=child": { title: "어린이 추천", age: "child" },
  "/products?age=teen": { title: "청소년 추천", age: "teen" },
  "/products?age=20": { title: "20대 추천", age: "20" },
  "/products?age=30": { title: "30대 추천", age: "30" },
  "/products?age=40": { title: "40대 추천", age: "40" },
  "/products?age=50": { title: "50대+ 추천", age: "50" },
} as const;

describe("public storefront menu route contract", () => {
  it("maps every internal menu link to an App Router page or a supported product query", () => {
    const pageRoutes = new Set(Object.keys(appRouterPages).map(routeForPageModule));
    const links = flattenMenuLinks(STOREFRONT_MENU);
    const hrefs = links.map(({ href }) => href);
    const productHrefs = links.filter(({ href }) => href === "/products" || href.startsWith("/products?")).map(({ href }) => href).sort();

    expect(hrefs).toEqual(expect.arrayContaining([
      "/", "/login", "/signup", "/mypage", "/admin", "/cart", "/checkout",
    ]));
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

  it("exposes every account and help destination as a real App Router page", () => {
    const paths = flattenMenuLinks(STOREFRONT_MENU).map(({ href }) => new URL(href, "https://vitaleaf.test").pathname);

    expect(paths).toEqual(expect.arrayContaining(["/login", "/signup", "/mypage"]));
    expect(paths.filter((path) => path.startsWith("/help"))).toEqual([
      "/help",
      "/help/shipping",
      "/help/returns",
    ]);
  });

  it("keeps every product menu destination useful when Firestore falls back to the sample catalog", async () => {
    const productLinks = flattenMenuLinks(STOREFRONT_MENU).filter(({ href }) => (
      href === "/products" || href.startsWith("/products?")
    ));

    for (const link of productLinks) {
      getProductsMock.mockResolvedValueOnce([]);
      const url = new URL(link.href, "https://vitaleaf.test");
      render(await ProductsPage({ searchParams: Promise.resolve(searchParamsRecord(url.searchParams)) }));

      expect(screen.getByRole("heading", {
        level: 1,
        name: expectedProductStateByHref[link.href as keyof typeof expectedProductStateByHref].title,
      }), link.href).toBeVisible();
      expect(screen.getAllByRole("article").length, link.href).toBeGreaterThan(0);
      expect(screen.queryByText("총 0개 상품"), link.href).not.toBeInTheDocument();
      cleanup();
    }
  });

  it.each([
    ["/ingredients", IngredientsPage, "성분 가이드"],
    ["/story", StoryPage, "VITALEAF 이야기"],
    ["/help", HelpPage, "고객센터"],
    ["/help/shipping", ShippingPage, "배송 안내"],
    ["/help/returns", ReturnsPage, "교환 및 반품 안내"],
  ] as const)("renders the unique heading for footer destination %s", (_href, Page, heading) => {
    render(createElement(Page));

    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    cleanup();
  });
});
