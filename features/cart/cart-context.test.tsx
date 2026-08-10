import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CartProvider, useCart } from "./cart-context";
import type { CartLine } from "./cart-types";

const storageKey = "vitaleaf-cart-v1";

const line: CartLine = {
  productId: "omega-3",
  name: "오메가3",
  thumbnailUrl: "/omega-3.jpg",
  unitPrice: 16_000,
  stock: 3,
  quantity: 1,
  selected: true,
};

function CartProbe() {
  const { itemCount, lines, setQuantity, subtotal } = useCart();

  return (
    <>
      <p>Items: {itemCount}</p>
      <p>Subtotal: {subtotal}</p>
      <p>Quantity: {lines[0]?.quantity ?? 0}</p>
      <button type="button" onClick={() => setQuantity(line.productId, 2)}>
        Increase quantity
      </button>
    </>
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("CartProvider", () => {
  it("restores valid lines from localStorage and writes updates", async () => {
    localStorage.setItem(storageKey, JSON.stringify([line]));
    const user = userEvent.setup();

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );

    expect(await screen.findByText("Items: 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));

    expect(JSON.parse(localStorage.getItem(storageKey)!)[0].quantity).toBe(2);
  });

  it("discards malformed stored entries and clamps a restored quantity to stock", async () => {
    localStorage.setItem(storageKey, JSON.stringify([{ ...line, quantity: 7 }, { productId: "bad" }]));

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );

    expect(await screen.findByText("Items: 3")).toBeInTheDocument();
    expect(screen.getByText("Subtotal: 48000")).toBeInTheDocument();
  });

  it("synchronizes valid cart changes received from another browser tab", async () => {
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey,
        newValue: JSON.stringify([{ ...line, quantity: 2 }]),
        storageArea: localStorage,
      }),
    );

    expect(await screen.findByText("Items: 2")).toBeInTheDocument();
  });
});
