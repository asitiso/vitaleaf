import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: {
    status: "signed-out" as "checking" | "signed-out" | "signed-in" | "error",
    user: null as { uid: string; email: string; emailVerified: boolean } | null,
  },
}));

vi.mock("../../features/auth/auth-context", () => ({
  useAuth: () => ({ ...authState, error: "", signOutMember: vi.fn() }),
}));

import { OrderCompleteActions } from "./order-complete-actions";

beforeEach(() => {
  authState.status = "signed-out";
  authState.user = null;
});

it("keeps product and cart actions for every visitor", () => {
  render(<OrderCompleteActions />);

  expect(screen.getByRole("link", { name: "상품 계속 보기" })).toHaveAttribute("href", "/products");
  expect(screen.getByRole("link", { name: "장바구니 확인" })).toHaveAttribute("href", "/cart");
  expect(screen.queryByRole("link", { name: "주문내역 보기" })).not.toBeInTheDocument();
});

it("shows the member order-history action only when signed in", () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  render(<OrderCompleteActions />);

  expect(screen.getByRole("link", { name: "주문내역 보기" })).toHaveAttribute("href", "/mypage#orders-heading");
});

it("shows a guest lookup action only for a validated guest order", () => {
  render(<OrderCompleteActions guest orderNumber="VL-20260826-ABC123" />);

  expect(screen.getByRole("link", { name: "비회원 주문조회" })).toHaveAttribute(
    "href",
    "/order-lookup?orderNumber=VL-20260826-ABC123",
  );
  expect(screen.queryByRole("link", { name: "주문내역 보기" })).not.toBeInTheDocument();
});
