import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { Product } from "../../lib/products/types";
import { ProductBrowser } from "../../components/commerce/product-browser";

const { getProductsMock } = vi.hoisted(() => ({ getProductsMock: vi.fn() }));

vi.mock("../../lib/firebase/server-read", () => ({ getServerProducts: getProductsMock }));

import ProductsPage from "./page";

const makeProduct = (overrides: Partial<Product>): Product => ({
  id: "product",
  name: "기본 상품",
  slug: "product",
  category: "기타",
  concerns: [],
  price: 10_000,
  originalPrice: null,
  thumbnailUrl: "",
  images: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 1,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 4.5,
  reviewCount: 10,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const products = [
  makeProduct({
    id: "omega",
    name: "데일리 오메가3",
    slug: "daily-omega-3",
    category: "혈행 건강",
    concerns: ["혈행"],
    ingredients: [{ name: "EPA 및 DHA", amount: "600 mg", dailyValue: "" }],
    price: 35_000,
    originalPrice: 40_000,
    stock: 8,
    salesRank: 2,
  }),
  makeProduct({
    id: "probiotic",
    name: "장 건강 유산균",
    slug: "probiotic",
    category: "유산균",
    concerns: ["장 건강"],
    benefits: ["30대 추천"],
    price: 25_000,
    stock: 4,
    salesRank: 1,
  }),
  makeProduct({
    id: "sold-out-omega",
    name: "프리미엄 오메가",
    slug: "premium-omega",
    category: "혈행 건강",
    concerns: ["혈행"],
    price: 45_000,
    stock: 0,
    salesRank: 3,
  }),
];

it("combines search and category filters and exposes removable chips", async () => {
  const user = userEvent.setup();
  render(<ProductBrowser initialProducts={products} />);

  await user.type(screen.getByRole("searchbox", { name: "상품 검색" }), "데일리");
  await user.selectOptions(screen.getByLabelText("카테고리"), "혈행 건강");

  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByText("총 1개 상품")).toBeInTheDocument();
  const queryChip = screen.getByRole("button", { name: "검색어 데일리 해제" });
  expect(queryChip).toBeVisible();
  expect(screen.getByRole("button", { name: "카테고리 혈행 건강 해제" })).toBeVisible();

  await user.click(queryChip);
  expect(screen.getAllByRole("article")).toHaveLength(2);
});

it("applies concern, price and stock filters before sorting results", async () => {
  const user = userEvent.setup();
  render(<ProductBrowser initialProducts={products} />);

  await user.selectOptions(screen.getByLabelText("건강 고민"), "혈행");
  await user.clear(screen.getByLabelText("최대 가격"));
  await user.type(screen.getByLabelText("최대 가격"), "40000");
  await user.click(screen.getByRole("checkbox", { name: "구매 가능한 상품만" }));
  await user.selectOptions(screen.getByLabelText("정렬"), "price-desc");

  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article", { name: "데일리 오메가3" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "건강 고민 혈행 해제" })).toBeVisible();
  expect(screen.getByRole("button", { name: "최대 가격 40,000원 해제" })).toBeVisible();
  expect(screen.getByRole("button", { name: "재고 있음 해제" })).toBeVisible();
});

it("hydrates listing filters from URL search parameters", async () => {
  getProductsMock.mockResolvedValue(products);

  render(await ProductsPage({
    searchParams: Promise.resolve({
      q: "오메가",
      category: "혈행 건강",
      concern: "혈행",
      minPrice: "30000",
      maxPrice: "40000",
      stock: "1",
      sort: "price-desc",
    }),
  }));

  expect(screen.getByRole("searchbox", { name: "상품 검색" })).toHaveValue("오메가");
  expect(screen.getByLabelText("카테고리")).toHaveValue("혈행 건강");
  expect(screen.getByLabelText("건강 고민")).toHaveValue("혈행");
  expect(screen.getByLabelText("최소 가격")).toHaveValue(30_000);
  expect(screen.getByLabelText("최대 가격")).toHaveValue(40_000);
  expect(screen.getByRole("checkbox", { name: "구매 가능한 상품만" })).toBeChecked();
  expect(screen.getByLabelText("정렬")).toHaveValue("price-desc");
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

it("normalizes existing menu slugs and age targets into catalog filters", async () => {
  getProductsMock.mockResolvedValue(products);

  render(await ProductsPage({
    searchParams: Promise.resolve({ category: "probiotic", concern: "gut", age: "30" }),
  }));

  expect(screen.getByLabelText("카테고리")).toHaveValue("유산균");
  expect(screen.getByLabelText("건강 고민")).toHaveValue("장 건강");
  expect(screen.getByRole("searchbox", { name: "상품 검색" })).toHaveValue("");
  expect(screen.getByRole("article", { name: "장 건강 유산균" })).toBeInTheDocument();
});

it("synchronizes filters when App Router search props change on the same route", () => {
  const { rerender } = render(
    <ProductBrowser initialProducts={products} initialFilters={{ query: "데일리" }} />,
  );

  expect(screen.getByRole("searchbox", { name: "상품 검색" })).toHaveValue("데일리");

  rerender(
    <ProductBrowser initialProducts={products} initialFilters={{ category: "유산균" }} />,
  );

  expect(screen.getByRole("searchbox", { name: "상품 검색" })).toHaveValue("");
  expect(screen.getByLabelText("카테고리")).toHaveValue("유산균");
  expect(screen.getByRole("article", { name: "장 건강 유산균" })).toBeInTheDocument();
});

it.each([
  ["today", "데일리 오메가3"],
  ["trial", "장 건강 유산균"],
])("makes the %s promotion URL select deterministic products", async (promotion, expectedName) => {
  getProductsMock.mockResolvedValue(products);

  render(await ProductsPage({ searchParams: Promise.resolve({ promotion }) }));

  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article", { name: expectedName })).toBeInTheDocument();
});

it.each([
  ["concerns", "건강 고민으로 찾기", "장 건강", "장 건강 유산균"],
  ["ingredients", "성분으로 찾기", "EPA 및 DHA", "데일리 오메가3"],
])("activates %s discovery from the existing view URL", async (view, heading, choice, expectedName) => {
  const user = userEvent.setup();
  getProductsMock.mockResolvedValue(products);

  render(await ProductsPage({ searchParams: Promise.resolve({ view }) }));

  expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: choice }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article", { name: expectedName })).toBeInTheDocument();
});

it.each([
  ["30", "장 건강 상품", "장 건강"],
  ["40", "눈 건강 상품", "눈 건강"],
  ["50", "뇌 건강 상품", "뇌 건강"],
])("maps age %s to documented concern groups", async (age, expectedName, concern) => {
  getProductsMock.mockResolvedValue([
    makeProduct({ id: "gut", name: "장 건강 상품", slug: "gut", concerns: ["장 건강"] }),
    makeProduct({ id: "eyes", name: "눈 건강 상품", slug: "eyes", concerns: ["눈 건강"] }),
    makeProduct({ id: "brain", name: "뇌 건강 상품", slug: "brain", concerns: ["뇌 건강"] }),
  ]);

  render(await ProductsPage({ searchParams: Promise.resolve({ age }) }));

  expect(screen.getByRole("article", { name: expectedName })).toBeInTheDocument();
  expect(screen.getByText(`연령 추천 기준: ${concern}`)).toBeInTheDocument();
});
