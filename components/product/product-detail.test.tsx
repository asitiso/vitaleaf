import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { Product, Review } from "@/lib/products/types";
import { STORE_POLICIES } from "../../lib/site/policies";

const { add, getApprovedReviewsMock, push } = vi.hoisted(() => ({
  add: vi.fn(),
  getApprovedReviewsMock: vi.fn(),
  push: vi.fn(),
}));

vi.mock("../../features/cart/cart-context", () => ({
  useCart: () => ({ add }),
}));

vi.mock("../../lib/firebase/reviews", () => ({
  getApprovedReviews: getApprovedReviewsMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { ProductDetail } from "./product-detail";

const product: Product = {
  id: "daily-omega-3",
  name: "데일리 오메가3",
  slug: "daily-omega-3",
  category: "혈행 건강",
  concerns: ["혈행"],
  price: 32_000,
  originalPrice: 40_000,
  thumbnailUrl: "https://images.example.com/omega-3-main.jpg",
  images: ["https://images.example.com/omega-3-side.jpg"],
  description: "매일 간편하게 챙기는 혈행 건강",
  benefits: ["혈행 개선", "기억력 개선", "건조한 눈 개선", "피로 개선"],
  ingredients: [{ name: "EPA 및 DHA", amount: "600 mg", dailyValue: "100%" }],
  dosage: "하루 1회, 1캡슐을 물과 함께 섭취하세요.",
  origin: "노르웨이",
  certifications: ["건강기능식품", "GMP"],
  cautions: ["의약품 복용 중에는 전문가와 상담하세요."],
  stock: 6,
  isBest: true,
  isNew: false,
  salesRank: 1,
  ratingAverage: 4.8,
  reviewCount: 120,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: null,
};

const reviews: Review[] = [
  {
    id: "review-5",
    productId: product.id,
    rating: 5,
    text: "목 넘김이 편하고 꾸준히 챙기기 좋아요.",
    authorAlias: "건강한하루",
    approved: true,
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
  },
  {
    id: "review-3",
    productId: product.id,
    rating: 3,
    text: "포장이 깔끔하게 도착했어요.",
    authorAlias: "활력충전",
    approved: true,
    createdAt: null,
  },
  {
    id: "review-hidden",
    productId: product.id,
    rating: 1,
    text: "승인되지 않은 리뷰",
    authorAlias: "숨김",
    approved: false,
    createdAt: null,
  },
];

beforeEach(() => {
  add.mockClear();
  getApprovedReviewsMock.mockReset();
  push.mockClear();
});

it("caps quantity at stock and sends the selected quantity to cart", async () => {
  const stockedProduct = { ...product, stock: 2 };
  render(<ProductDetail product={stockedProduct} reviews={[]} />);

  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));
  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));

  expect(screen.getByLabelText("수량")).toHaveValue(2);

  await userEvent.click(screen.getByRole("button", { name: "장바구니 담기" }));
  expect(add).toHaveBeenCalledWith(stockedProduct, 2);
});

it("adds the exact selected quantity before routing buy-now to checkout", async () => {
  render(<ProductDetail product={product} reviews={[]} />);

  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));
  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));
  await userEvent.click(screen.getByRole("button", { name: "바로 구매" }));

  expect(add).toHaveBeenCalledWith(product, 3);
  expect(push).toHaveBeenCalledWith("/checkout");
  expect(add.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
});

it("shows pricing and shipping facts and prevents purchasing a sold-out product", () => {
  render(<ProductDetail product={{ ...product, stock: 0 }} reviews={[]} />);

  expect(screen.getByText("20%")).toBeInTheDocument();
  expect(screen.getByText("32,000원")).toBeInTheDocument();
  expect(screen.getByText("품절된 상품입니다")).toBeInTheDocument();
  expect(screen.getByText("3만원 이상 무료배송")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "장바구니 담기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "바로 구매" })).toBeDisabled();
});

it("renders the public shipping condition and dispatch copy from the shared policy", () => {
  const shipping = STORE_POLICIES.shipping as { freeThreshold: number; dispatch: string };
  const original = { ...shipping };
  Object.assign(shipping, { freeThreshold: 50_000, dispatch: "결제 확인 후 정책 기준 순차 출고" });

  try {
    render(<ProductDetail product={product} reviews={[]} />);
    expect(screen.getByText("5만원 이상 무료배송")).toBeVisible();
    expect(screen.getByText((_, element) => element?.classList.contains("product-detail__shipping") === true && element.textContent?.includes("결제 확인 후 정책 기준 순차 출고") === true)).toBeVisible();
  } finally {
    Object.assign(shipping, original);
  }
});

it("switches gallery images and shows a named fallback when the selected image fails", async () => {
  render(<ProductDetail product={product} reviews={[]} />);

  await userEvent.click(screen.getByRole("button", { name: "이미지 2 보기" }));
  const image = screen.getByRole("img", { name: "데일리 오메가3 이미지 2" });
  expect(image).toHaveAttribute("src", "https://images.example.com/omega-3-side.jpg");

  fireEvent.error(image);

  expect(screen.getByRole("img", { name: "데일리 오메가3 이미지 준비 중" })).toBeInTheDocument();
});

it("limits core benefits and exposes controlled information regions with a semantic ingredient table", async () => {
  render(<ProductDetail product={product} reviews={[]} />);

  expect(screen.getByRole("list", { name: "핵심 기능성" })).toHaveTextContent("혈행 개선");
  expect(screen.getByRole("list", { name: "핵심 기능성" })).not.toHaveTextContent("피로 개선");

  const dosageButton = screen.getByRole("button", { name: "섭취 방법" });
  expect(dosageButton).toHaveAttribute("aria-expanded", "false");
  expect(dosageButton).toHaveAttribute("aria-controls");
  await userEvent.click(dosageButton);
  expect(dosageButton).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("region", { name: "섭취 방법" })).toHaveTextContent("하루 1회, 1캡슐");

  await userEvent.click(screen.getByRole("button", { name: "성분·함량" }));
  expect(screen.getByRole("columnheader", { name: "성분명" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "1일 섭취량당 함량" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "영양성분 기준치 비율" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "EPA 및 DHA" })).toBeInTheDocument();

  expect(screen.getByRole("button", { name: "원산지" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "인증" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "주의사항" })).toBeInTheDocument();
});

it("summarizes and lists approved reviews only", () => {
  render(<ProductDetail product={product} reviews={reviews} />);

  expect(screen.getByText("4.0", { selector: ".review-section__average" })).toBeInTheDocument();
  expect(screen.getByText("승인 리뷰 2개")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "5점 리뷰 1개" })).toHaveAttribute("value", "1");
  expect(screen.getByRole("progressbar", { name: "3점 리뷰 1개" })).toHaveAttribute("value", "1");
  expect(screen.getByRole("article", { name: "건강한하루님의 5점 리뷰" })).toBeInTheDocument();
  expect(screen.queryByText("승인되지 않은 리뷰")).not.toBeInTheDocument();
});

it("explains when there are no approved reviews", () => {
  render(<ProductDetail product={product} reviews={[]} />);

  expect(screen.getByText("아직 등록된 리뷰가 없습니다")).toBeInTheDocument();
});

it("keeps product details visible and retries a failed review load", async () => {
  getApprovedReviewsMock.mockResolvedValue([reviews[0]]);
  render(<ProductDetail product={product} reviews={[]} reviewLoadError />);

  expect(screen.getByRole("heading", { name: "데일리 오메가3" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("리뷰를 불러오지 못했습니다");

  await userEvent.click(screen.getByRole("button", { name: "리뷰 다시 불러오기" }));

  expect(await screen.findByRole("article", { name: "건강한하루님의 5점 리뷰" })).toBeInTheDocument();
  expect(getApprovedReviewsMock).toHaveBeenCalledWith(product.id);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
