import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CartProvider, useCart } from "./cart-context";
import type { CartLine } from "./cart-types";
import type { Product } from "../../lib/products/types";

const storageKey = "vitaleaf-cart-v1";
const buyNowStorageKey = "vitaleaf-buy-now-v1";

const line: CartLine = {
  productId: "omega-3",
  name: "오메가3",
  thumbnailUrl: "/omega-3.jpg",
  unitPrice: 16_000,
  stock: 3,
  quantity: 1,
  selected: true,
};

const buyNowProduct: Product = {
  id: "probiotic",
  name: "장편한 유산균",
  slug: "probiotic",
  category: "유산균",
  concerns: ["장 건강"],
  price: 21_000,
  originalPrice: null,
  thumbnailUrl: "/probiotic.jpg",
  images: [],
  media: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "대한민국",
  certifications: [],
  cautions: [],
  stock: 5,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  createdAt: null,
  updatedAt: null,
};

function CartProbe() {
  const { buyNowLine, clearSubmitted, itemCount, lines, prepareBuyNow, setQuantity, subtotal } = useCart();

  return (
    <>
      <p>Items: {itemCount}</p>
      <p>Subtotal: {subtotal}</p>
      <p>Quantity: {lines[0]?.quantity ?? 0}</p>
      <p>Buy now: {buyNowLine ? `${buyNowLine.name} × ${buyNowLine.quantity}` : "none"}</p>
      <button type="button" onClick={() => setQuantity(line.productId, 2)}>
        Increase quantity
      </button>
      <button type="button" onClick={() => clearSubmitted([line])}>
        Clear submitted
      </button>
      <button type="button" onClick={() => prepareBuyNow(buyNowProduct, 2)}>
        Prepare buy now
      </button>
    </>
  );
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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

  it("clears only the matching submitted snapshot after a newer cross-tab cart state arrives", async () => {
    const newLine: CartLine = {
      ...line,
      productId: "new-vitamin",
      name: "새 비타민",
      quantity: 2,
    };
    const user = userEvent.setup();
    localStorage.setItem(storageKey, JSON.stringify([line]));
    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );
    await screen.findByText("Items: 1");

    const changedLine = { ...line, quantity: 2 };
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: storageKey,
        newValue: JSON.stringify([changedLine, newLine]),
        storageArea: localStorage,
      }));
    });
    expect(await screen.findByText("Items: 4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear submitted" }));

    expect(await screen.findByText("Items: 4")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([changedLine, newLine]);
  });

  it("stores a buy-now line separately without changing the existing cart", async () => {
    localStorage.setItem(storageKey, JSON.stringify([line]));
    const user = userEvent.setup();

    render(
      <CartProvider>
        <CartProbe />
      </CartProvider>,
    );

    expect(await screen.findByText("Items: 1")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Prepare buy now" }));

    expect(screen.getByText("Buy now: 장편한 유산균 × 2")).toBeVisible();
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([line]);
    expect(JSON.parse(sessionStorage.getItem(buyNowStorageKey) ?? "null")).toEqual({
      productId: "probiotic",
      name: "장편한 유산균",
      thumbnailUrl: "/probiotic.jpg",
      unitPrice: 21_000,
      stock: 5,
      quantity: 2,
      selected: true,
    });
  });
});
