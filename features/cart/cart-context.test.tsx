import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { CartProvider, useCart } from "./cart-context";
import type { CartLine } from "./cart-types";
import type { Product, PurchaseOption } from "../../lib/products/types";

const storageKey = "vitaleaf-cart-v1";
const buyNowStorageKey = "vitaleaf-buy-now-v1";

const line: CartLine = {
  lineId: '["omega-3","default"]',
  productId: "omega-3",
  purchaseOptionId: "default",
  purchaseOptionLabel: "기본 구성",
  sku: "",
  name: "오메가3",
  thumbnailUrl: "/omega-3.jpg",
  unitPrice: 16_000,
  stock: 3,
  quantity: 1,
  selected: true,
};

const twoMonthOption: PurchaseOption = {
  id: "2-month",
  label: "2개월분",
  durationMonths: 2,
  sku: "SUPPLEMENT-2M",
  priceAdjustment: -35_000,
  stock: 3,
  active: true,
  isDefault: false,
};

const fourMonthOption: PurchaseOption = {
  id: "4-month",
  label: "4개월분",
  durationMonths: 4,
  sku: "SUPPLEMENT-4M",
  priceAdjustment: 0,
  stock: 4,
  active: true,
  isDefault: true,
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

const buyNowOption: PurchaseOption = {
  id: "2-month",
  label: "2개월분",
  durationMonths: 2,
  sku: "PROBIOTIC-2M",
  priceAdjustment: -6_000,
  stock: 3,
  active: true,
  isDefault: true,
};

const optionedProduct: Product = {
  ...buyNowProduct,
  id: "supplement",
  name: "옵션 건강식품",
  price: 80_000,
  stock: 7,
  purchaseOptions: [twoMonthOption, fourMonthOption],
};

function CartProbe() {
  const { buyNowLine, clearSubmitted, itemCount, lines, prepareBuyNow, setQuantity, subtotal } = useCart();

  return (
    <>
      <p>Items: {itemCount}</p>
      <p>Subtotal: {subtotal}</p>
      <p>Quantity: {lines[0]?.quantity ?? 0}</p>
      <p>Buy now: {buyNowLine ? `${buyNowLine.name} × ${buyNowLine.quantity}` : "none"}</p>
      <button type="button" onClick={() => setQuantity(line.lineId, 2)}>
        Increase quantity
      </button>
      <button type="button" onClick={() => clearSubmitted([line])}>
        Clear submitted
      </button>
      <button type="button" onClick={() => prepareBuyNow(buyNowProduct, buyNowOption, 2)}>
        Prepare buy now
      </button>
    </>
  );
}

function CartMutationProbe() {
  const { add, hasHydrated, itemCount, lines, remove, setQuantity, subtotal } = useCart();

  return (
    <>
      <p>Hydrated: {hasHydrated ? "yes" : "no"}</p>
      <p>Mutation items: {itemCount}</p>
      <p>Mutation subtotal: {subtotal}</p>
      <ul>
        {lines.map((storedLine) => (
          <li key={storedLine.lineId}>{storedLine.purchaseOptionLabel}: {storedLine.quantity}</li>
        ))}
      </ul>
      <button type="button" onClick={() => add(optionedProduct, twoMonthOption, 1)}>Add two month</button>
      <button type="button" onClick={() => add(optionedProduct, fourMonthOption, 2)}>Add four month</button>
      <button type="button" onClick={() => add(optionedProduct, twoMonthOption, 2, "keep")}>Keep two month</button>
      <button type="button" onClick={() => add(optionedProduct, twoMonthOption, 5, "increment")}>Increment two month</button>
      <button type="button" onClick={() => setQuantity('["supplement","4-month"]', 3)}>Set four month quantity</button>
      <button type="button" onClick={() => remove('["supplement","2-month"]')}>Remove two month</button>
    </>
  );
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("CartProvider", () => {
  it("migrates the existing v1 localStorage value in place after hydration", async () => {
    localStorage.setItem(storageKey, JSON.stringify([{
      productId: "legacy",
      name: "기존 상품",
      thumbnailUrl: "/legacy.jpg",
      unitPrice: 12_000,
      stock: 3,
      quantity: 2,
      selected: true,
    }]));

    render(<CartProvider><CartProbe /></CartProvider>);

    await screen.findByText("Items: 2");
    await act(async () => {});
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([{
      lineId: '["legacy","default"]',
      productId: "legacy",
      purchaseOptionId: "default",
      purchaseOptionLabel: "기본 구성",
      sku: "",
      name: "기존 상품",
      thumbnailUrl: "/legacy.jpg",
      unitPrice: 12_000,
      stock: 3,
      quantity: 2,
      selected: true,
    }]);
  });

  it("stores different options as distinct lines and updates totals and badge count together", async () => {
    const user = userEvent.setup();
    render(<CartProvider><CartMutationProbe /></CartProvider>);
    await screen.findByText("Hydrated: yes");

    await user.click(screen.getByRole("button", { name: "Add two month" }));
    await user.click(screen.getByRole("button", { name: "Add four month" }));

    expect(screen.getByText("2개월분: 1")).toBeVisible();
    expect(screen.getByText("4개월분: 2")).toBeVisible();
    expect(screen.getByText("Mutation items: 3")).toBeVisible();
    expect(screen.getByText("Mutation subtotal: 205000")).toBeVisible();
  });

  it("keeps an existing option unchanged unless increment is chosen and caps the result at option stock", async () => {
    const user = userEvent.setup();
    render(<CartProvider><CartMutationProbe /></CartProvider>);
    await screen.findByText("Hydrated: yes");

    await user.click(screen.getByRole("button", { name: "Add two month" }));
    await user.click(screen.getByRole("button", { name: "Keep two month" }));
    expect(screen.getByText("2개월분: 1")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Increment two month" }));
    expect(screen.getByText("2개월분: 3")).toBeVisible();
    expect(screen.getByText("Mutation items: 3")).toBeVisible();
  });

  it("uses lineId mutations without changing another option of the same product", async () => {
    const user = userEvent.setup();
    render(<CartProvider><CartMutationProbe /></CartProvider>);
    await screen.findByText("Hydrated: yes");
    await user.click(screen.getByRole("button", { name: "Add two month" }));
    await user.click(screen.getByRole("button", { name: "Add four month" }));

    await user.click(screen.getByRole("button", { name: "Set four month quantity" }));
    expect(screen.getByText("2개월분: 1")).toBeVisible();
    expect(screen.getByText("4개월분: 3")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Remove two month" }));
    expect(screen.queryByText("2개월분: 1")).not.toBeInTheDocument();
    expect(screen.getByText("4개월분: 3")).toBeVisible();
  });

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
      lineId: '["new-vitamin","default"]',
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

  it("clears a submitted option by lineId without clearing another option of the same product", async () => {
    const otherOptionLine: CartLine = {
      ...line,
      lineId: '["omega-3","2-month"]',
      purchaseOptionId: "2-month",
      purchaseOptionLabel: "2개월분",
      sku: "OMEGA-2M",
    };
    localStorage.setItem(storageKey, JSON.stringify([line, otherOptionLine]));
    const user = userEvent.setup();
    render(<CartProvider><CartProbe /></CartProvider>);
    await screen.findByText("Items: 2");

    await user.click(screen.getByRole("button", { name: "Clear submitted" }));

    await screen.findByText("Items: 1");
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([otherOptionLine]);
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
      lineId: '["probiotic","2-month"]',
      productId: "probiotic",
      purchaseOptionId: "2-month",
      purchaseOptionLabel: "2개월분",
      sku: "PROBIOTIC-2M",
      name: "장편한 유산균",
      thumbnailUrl: "/probiotic.jpg",
      unitPrice: 15_000,
      stock: 3,
      quantity: 2,
      selected: true,
    });
  });
});
