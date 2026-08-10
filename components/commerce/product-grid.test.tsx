import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ProductGrid } from "./product-grid";

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
});
