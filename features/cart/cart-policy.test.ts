import { expect, it, vi } from "vitest";

const { storePolicies } = vi.hoisted(() => ({
  storePolicies: {
    shipping: { freeThreshold: 50_000, baseFee: 5_000 },
  },
}));

vi.mock("../../lib/site/policies", () => ({ STORE_POLICIES: storePolicies }));

import { calculateCart } from "./cart-utils";

it("uses the shared shipping policy for the cart charge and free-shipping threshold", () => {
  expect(calculateCart([{
    productId: "policy-product",
    name: "정책 상품",
    thumbnailUrl: "",
    unitPrice: 16_000,
    stock: 1,
    quantity: 1,
    selected: true,
  }])).toMatchObject({
    shippingFee: 5_000,
    remainingForFreeShipping: 34_000,
  });
});
