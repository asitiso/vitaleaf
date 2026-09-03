import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("../../lib/firebase/id-token", () => ({ getCurrentFirebaseIdToken: vi.fn() }));

import OrderLookupPage from "./page";

it("prefills only a valid order number from the URL", async () => {
  render(await OrderLookupPage({ searchParams: Promise.resolve({
    orderNumber: "VL-20260826-ABC123", phone: "01012345678", accessToken: "url-token", receipt: "url-receipt",
  }) }));

  expect(screen.getByLabelText("주문번호")).toHaveValue("VL-20260826-ABC123");
  expect(screen.getByLabelText("주문 시 휴대전화 번호")).toHaveValue("");
  expect(screen.queryByRole("button", { name: "이 주문으로 1:1 문의하기" })).not.toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain("url-token");
  expect(document.body.innerHTML).not.toContain("url-receipt");
});

it("does not prefill an invalid order number from the URL", async () => {
  render(await OrderLookupPage({ searchParams: Promise.resolve({ orderNumber: "wrong" }) }));

  expect(screen.getByLabelText("주문번호")).toHaveValue("");
});
