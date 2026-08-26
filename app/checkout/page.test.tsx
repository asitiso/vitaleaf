import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../../components/checkout/checkout-form", () => ({
  CheckoutForm: ({ mode = "cart" }: { mode?: string }) => <p>결제 모드: {mode}</p>,
}));

import CheckoutPage from "./page";

it("activates buy-now checkout only for the explicit route mode", async () => {
  const view = render(await CheckoutPage({
    searchParams: Promise.resolve({ mode: "buy-now" }),
  }));

  expect(screen.getByText("결제 모드: buy-now")).toBeVisible();

  view.rerender(await CheckoutPage({
    searchParams: Promise.resolve({ mode: "unexpected" }),
  }));
  expect(screen.getByText("결제 모드: cart")).toBeVisible();
});
