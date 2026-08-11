import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { CartProvider } from "../../../features/cart/cart-context";
import type { Product } from "../../../lib/products/types";

const { getProductMock, getApprovedReviewsMock, notFoundMock, routePushMock } = vi.hoisted(() => ({
  getProductMock: vi.fn(),
  getApprovedReviewsMock: vi.fn(),
  routePushMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("../../../lib/firebase/server-read", () => ({
  getServerProduct: getProductMock,
  getServerApprovedReviews: getApprovedReviewsMock,
}));
vi.mock("../../../lib/firebase/reviews", () => ({ getApprovedReviews: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  useRouter: () => ({ push: routePushMock }),
}));

import ProductPage from "./page";

const product: Product = {
  id: "daily-omega-3",
  name: "데일리 오메가3",
  slug: "daily-omega-3",
  category: "혈행 건강",
  concerns: ["혈행"],
  price: 32_000,
  originalPrice: null,
  thumbnailUrl: "",
  images: [],
  media: [],
  description: "혈행 건강",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 3,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  createdAt: null,
  updatedAt: null,
};

beforeEach(() => {
  getProductMock.mockReset();
  getApprovedReviewsMock.mockReset();
  notFoundMock.mockClear();
  routePushMock.mockClear();
});

it("uses the route id to load a product and keeps details visible when reviews fail", async () => {
  getProductMock.mockResolvedValue(product);
  getApprovedReviewsMock.mockRejectedValue(new Error("offline"));

  const page = await ProductPage({ params: Promise.resolve({ id: product.id }) });
  render(<CartProvider>{page}</CartProvider>);

  expect(getProductMock).toHaveBeenCalledWith(product.id);
  expect(getApprovedReviewsMock).toHaveBeenCalledWith(product.id);
  expect(screen.getByRole("heading", { name: product.name })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("리뷰를 불러오지 못했습니다");
});

it("renders the not-found boundary when the product does not exist", async () => {
  getProductMock.mockResolvedValue(null);

  await expect(ProductPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NOT_FOUND");
  expect(notFoundMock).toHaveBeenCalledOnce();
  expect(getApprovedReviewsMock).not.toHaveBeenCalled();
});
