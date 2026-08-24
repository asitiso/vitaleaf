import { render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import type { Product } from "../lib/products/types";
import { STORE_POLICIES } from "../lib/site/policies";

const { getProductsMock } = vi.hoisted(() => ({ getProductsMock: vi.fn() }));

vi.mock("../lib/firebase/server-read", () => ({ getServerProducts: getProductsMock }));

import Home from "./page";

const product: Product = {
  id: "omega",
  name: "데일리 오메가3",
  slug: "daily-omega-3",
  category: "오메가3",
  concerns: ["혈행"],
  price: 32_000,
  originalPrice: 40_000,
  thumbnailUrl: "",
  images: [],
  media: [],
  description: "",
  benefits: ["혈행"],
  ingredients: [{ name: "EPA 및 DHA", amount: "600 mg", dailyValue: "" }],
  dosage: "1일 1회",
  origin: "노르웨이",
  certifications: ["GMP"],
  cautions: [],
  stock: 10,
  isBest: true,
  isNew: true,
  salesRank: 1,
  ratingAverage: 4.8,
  reviewCount: 120,
  createdAt: new Date("2026-08-09T00:00:00.000Z"),
  updatedAt: null,
};

beforeEach(() => {
  getProductsMock.mockReset();
});

it("renders the approved professional merchandising sections", async () => {
  getProductsMock.mockResolvedValue([product]);

  render(await Home());

  expect(screen.getByRole("heading", { name: "하루 한 번, 기초 건강을 빈틈없이" })).toBeInTheDocument();
  expect(screen.getAllByText("첫 구매 10% 혜택")).toHaveLength(1);
  expect(screen.getByRole("link", { name: /첫 구매 10% 혜택/ })).toHaveAttribute("href", "/products?promotion=trial");
  expect(screen.getByRole("link", { name: /결제 확인 후/ })).toHaveAttribute("href", "/products?stock=1");
  expect(screen.getByRole("region", { name: "바이타리프 품질 원칙" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "오늘의 베스트" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "연령대별 베스트 탐색" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "30대" })).toHaveAttribute("href", "/products?age=30");
  expect(screen.getByRole("heading", { name: "새로 들어왔어요" })).toBeInTheDocument();
  const viewAllLinks = screen.getAllByRole("link", { name: "전체 보기" });
  expect(viewAllLinks[0]).toHaveAttribute("href", "/products?sort=popular");
  expect(viewAllLinks[1]).toHaveAttribute("href", "/products?sort=newest");
  expect(screen.getByRole("heading", { name: "무엇이 얼마나 들었는지 먼저 공개합니다" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /성분 기준으로 살펴보기/ })).toHaveAttribute("href", "/products?view=ingredients");
  expect(screen.getAllByRole("article", { name: "데일리 오메가3" })).toHaveLength(2);
  expect(screen.queryByRole("heading", { name: "건강 고민별" })).not.toBeInTheDocument();
});

it("renders the home delivery promotion from the shared shipping policy", async () => {
  const shipping = STORE_POLICIES.shipping as { freeThreshold: number; dispatch: string };
  const original = { ...shipping };
  Object.assign(shipping, { freeThreshold: 50_000, dispatch: "결제 확인 후 정책 기준 순차 출고" });
  getProductsMock.mockResolvedValue([product]);

  try {
    render(await Home());
    expect(screen.getByText("결제 확인 후 정책 기준 순차 출고")).toBeVisible();
    expect(screen.getByText("5만원 이상 무료배송")).toBeVisible();
  } finally {
    Object.assign(shipping, original);
  }
});

it("shows clearly labelled sample products when the catalog is empty", async () => {
  getProductsMock.mockResolvedValue([]);

  render(await Home());

  expect(screen.getByText("샘플 상품으로 쇼핑몰 기능을 미리 확인하고 있습니다.")).toBeVisible();
  expect(screen.getAllByRole("article", { name: "[샘플] 데일리 멀티비타민" })).toHaveLength(2);
  expect(screen.getByRole("article", { name: "[샘플] 패밀리 건강 선물세트" })).toBeVisible();
});

it("keeps the demo catalog usable when Firestore cannot load", async () => {
  getProductsMock.mockImplementation(() => {
    throw new Error("offline");
  });

  render(await Home());

  expect(screen.getByText("샘플 상품으로 쇼핑몰 기능을 미리 확인하고 있습니다.")).toBeVisible();
  expect(screen.getAllByRole("article", { name: "[샘플] 데일리 멀티비타민" })).toHaveLength(2);
  expect(screen.getByRole("heading", { name: "무엇이 얼마나 들었는지 먼저 공개합니다" })).toBeInTheDocument();
});
