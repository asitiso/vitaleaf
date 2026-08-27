import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("../../features/auth/auth-context", () => ({
  useAuth: () => ({ status: "signed-out", user: null, error: "", signOutMember: vi.fn() }),
}));

import OrderCompletePage from "./page";

it("shows the completion copy and a valid mock order number", async () => {
  render(await OrderCompletePage({
    searchParams: Promise.resolve({ orderNumber: "VL-20260810-ABC123" }),
  }));

  expect(screen.getByRole("heading", { name: "주문이 접수되었습니다" })).toBeVisible();
  expect(screen.getByText("VL-20260810-ABC123")).toBeVisible();
  expect(screen.getByText("목업 결제로 실제 승인이나 출금은 발생하지 않았습니다.")).toBeVisible();
});

it("does not present an arbitrary query value as an order number", async () => {
  render(await OrderCompletePage({
    searchParams: Promise.resolve({ orderNumber: "홍길동-010-1234-5678" }),
  }));

  expect(screen.queryByText("홍길동-010-1234-5678")).not.toBeInTheDocument();
  expect(screen.getByText("주문번호는 결제 완료 직후 화면에서 확인할 수 있습니다.")).toBeVisible();
});

it("keeps a successful order complete while warning when optional address saving failed", async () => {
  render(await OrderCompletePage({
    searchParams: Promise.resolve({ orderNumber: "VL-20260810-ABC123", addressSaved: "0" }),
  }));

  expect(screen.getByRole("heading", { name: "주문이 접수되었습니다" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("주문은 접수되었지만 기본 배송지는 저장하지 못했습니다.");
});

it("offers lookup only for a guest completion", async () => {
  render(await OrderCompletePage({
    searchParams: Promise.resolve({ orderNumber: "VL-20260826-ABC123", guest: "1" }),
  }));

  expect(screen.getByRole("link", { name: "비회원 주문조회" })).toHaveAttribute(
    "href",
    "/order-lookup?orderNumber=VL-20260826-ABC123",
  );
});

it("keeps the member completion action when the guest flag is absent", async () => {
  render(await OrderCompletePage({
    searchParams: Promise.resolve({ orderNumber: "VL-20260826-ABC123" }),
  }));

  expect(screen.queryByRole("link", { name: "비회원 주문조회" })).not.toBeInTheDocument();
});
