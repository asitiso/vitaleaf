import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { Product } from "../../lib/products/types";
import { ProductGrid } from "./product-grid";

const rankedProduct = (id: string, salesRank: number | null): Product => ({
  id,
  name: `상품 ${id}`,
  slug: id,
  category: "비타민",
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
  isBest: true,
  isNew: false,
  salesRank,
  ratingAverage: 4.5,
  reviewCount: 10,
  createdAt: null,
  updatedAt: null,
});

describe("ProductGrid states", () => {
  it("announces a stable loading state", () => {
    render(<ProductGrid status="loading" products={[]} />);

    expect(screen.getByRole("status")).toHaveTextContent("상품을 불러오는 중");
    expect(screen.getAllByLabelText("상품 불러오는 중")).toHaveLength(4);
  });

  it("keeps admin guidance out of the customer empty state", () => {
    const { rerender } = render(<ProductGrid status="empty" products={[]} />);

    expect(screen.getByText("조건에 맞는 상품이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "상품 등록 안내" })).not.toBeInTheDocument();

    rerender(<ProductGrid status="empty" products={[]} isAdmin />);
    expect(screen.getByRole("link", { name: "상품 등록 안내" })).toHaveAttribute("href", "/admin");
  });

  it("offers a retry action when products fail to load", () => {
    const retry = vi.fn();
    render(<ProductGrid status="error" products={[]} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows only the actual Firestore sales rank", () => {
    render(
      <ProductGrid
        status="ready"
        products={[rankedProduct("ranked", 5), rankedProduct("unranked", null)]}
        showRanks
      />,
    );

    expect(screen.getByLabelText("판매 순위 5위")).toBeInTheDocument();
    expect(screen.queryByLabelText("판매 순위 1위")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("판매 순위 2위")).not.toBeInTheDocument();
  });
});
