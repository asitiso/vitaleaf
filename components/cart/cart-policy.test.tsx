import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { storePolicies } = vi.hoisted(() => ({
  storePolicies: {
    shipping: { freeThreshold: 50_000, baseFee: 5_000 },
  },
}));

vi.mock("../../lib/site/policies", () => ({ STORE_POLICIES: storePolicies }));

import { CartProvider } from "../../features/cart/cart-context";
import { CartView } from "./cart-view";

afterEach(() => localStorage.clear());

it("uses the shared shipping policy as the cart progress maximum", async () => {
  localStorage.setItem("vitaleaf-cart-v1", JSON.stringify([{
    productId: "policy-product",
    name: "정책 상품",
    thumbnailUrl: "",
    unitPrice: 16_000,
    stock: 1,
    quantity: 1,
    selected: true,
  }]));

  render(<CartProvider><CartView /></CartProvider>);

  expect(await screen.findByRole("progressbar")).toHaveAttribute("max", "50000");
});
