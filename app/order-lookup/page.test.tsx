import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("../../lib/guest-orders/client", () => ({ lookupGuestOrder: vi.fn() }));

import OrderLookupPage from "./page";

it("prefills only a valid order number from the URL", async () => {
  render(await OrderLookupPage({ searchParams: Promise.resolve({ orderNumber: "VL-20260826-ABC123", phone: "01012345678" }) }));

  expect(screen.getByLabelText("주문번호")).toHaveValue("VL-20260826-ABC123");
  expect(screen.getByLabelText("주문 시 휴대전화 번호")).toHaveValue("");
});

it("does not prefill an invalid order number from the URL", async () => {
  render(await OrderLookupPage({ searchParams: Promise.resolve({ orderNumber: "wrong" }) }));

  expect(screen.getByLabelText("주문번호")).toHaveValue("");
});
