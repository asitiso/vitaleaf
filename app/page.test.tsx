import { render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import type { Product } from "../lib/products/types";

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
  expect(screen.getByRole("region", { name: "바이타리프 품질 원칙" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "오늘의 베스트" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "연령대별 베스트 탐색" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "30대" })).toHaveAttribute("href", "/products?age=30");
  expect(screen.getByRole("heading", { name: "새로 들어왔어요" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "무엇이 얼마나 들었는지 먼저 공개합니다" })).toBeInTheDocument();
  expect(screen.getAllByRole("article", { name: "데일리 오메가3" })).toHaveLength(2);
  expect(screen.queryByRole("heading", { name: "건강 고민별" })).not.toBeInTheDocument();
});

it("shows a polished empty catalog state without hardcoded product fallbacks", async () => {
  getProductsMock.mockResolvedValue([]);

  render(await Home());

  expect(screen.getByRole("heading", { name: "좋은 상품을 꼼꼼히 준비하고 있습니다" })).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByText("데일리 오메가3")).not.toBeInTheDocument();
});

it("keeps the home page usable when Firestore cannot load", async () => {
  getProductsMock.mockImplementation(() => {
    throw new Error("offline");
  });

  render(await Home());

  expect(screen.getByRole("alert")).toHaveTextContent("상품을 불러오지 못했습니다");
  expect(screen.getByRole("link", { name: "다시 시도" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("heading", { name: "무엇이 얼마나 들었는지 먼저 공개합니다" })).toBeInTheDocument();
});
