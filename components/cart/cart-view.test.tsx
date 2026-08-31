import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { CartProvider } from "../../features/cart/cart-context";
import type { CartLine } from "../../features/cart/cart-types";

import { CartView } from "./cart-view";

const storageKey = "vitaleaf-cart-v1";

const line: CartLine = {
  lineId: '["omega-3","default"]',
  productId: "omega-3",
  purchaseOptionId: "default",
  purchaseOptionLabel: "기본 구성",
  sku: "",
  name: "데일리 오메가3",
  thumbnailUrl: "/omega-3.jpg",
  unitPrice: 16_000,
  stock: 2,
  quantity: 1,
  selected: true,
};

function makeLine(overrides: Partial<CartLine> = {}): CartLine {
  return { ...line, ...overrides };
}

function renderCart(lines: CartLine[] = [line]) {
  localStorage.setItem(storageKey, JSON.stringify(lines));
  return render(
    <CartProvider>
      <CartView />
    </CartProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

it("updates selection, quantity, free-shipping progress, and total", async () => {
  const user = userEvent.setup();
  renderCart();

  expect(await screen.findByText("무료배송까지 14,000원 남았어요")).toBeVisible();
  expect(screen.getByText("3,000원")).toBeVisible();

  await user.click(screen.getByRole("button", { name: /수량 늘리기/ }));

  expect(screen.getByText("0원")).toBeVisible();
  expect(screen.getByText("무료배송 혜택을 받고 있어요")).toBeVisible();
  expect(screen.getByRole("button", { name: /수량 늘리기/ })).toBeDisabled();

  await user.click(screen.getByRole("checkbox", { name: "전체 선택" }));

  expect(screen.getByRole("link", { name: "선택 상품 주문하기" })).toHaveAttribute("aria-disabled", "true");
});

it("updates the payment total while the shopper types a valid quantity", async () => {
  const user = userEvent.setup();
  renderCart([makeLine({ unitPrice: 10_000, quantity: 1, stock: 10 })]);
  const input = await screen.findByRole("spinbutton", { name: /수량/ });

  await user.clear(input);
  await user.type(input, "3");

  const summary = screen.getByRole("complementary", { name: "주문 금액" });
  const amounts = Array.from(summary.querySelectorAll("dl > div"));
  expect(amounts[0]).toHaveTextContent("상품 금액30,000원");
  expect(amounts[1]).toHaveTextContent("배송비0원");
  expect(amounts[2]).toHaveTextContent("총 결제 예정 금액30,000원");
});

it("restores blank input and clamps stock overflow", async () => {
  const user = userEvent.setup();
  renderCart([makeLine({ quantity: 2, stock: 5 })]);
  const input = await screen.findByRole("spinbutton", { name: /수량/ });

  await user.clear(input);
  await user.tab();
  expect(input).toHaveValue(2);

  await user.clear(input);
  await user.type(input, "99");

  expect(input).toHaveValue(5);
  expect(screen.getByRole("status")).toHaveTextContent("재고");
});

it("keeps the current payment total beside the mobile checkout action", async () => {
  const user = userEvent.setup();
  renderCart();

  const checkout = await screen.findByRole("link", { name: "선택 상품 주문하기" });
  const checkoutBar = checkout.closest(".cart-view__checkout-bar");
  expect(checkoutBar).not.toBeNull();
  expect(within(checkoutBar as HTMLElement).getByText("19,000원")).toBeVisible();

  await user.click(screen.getByRole("button", { name: /수량 늘리기/ }));
  expect(within(checkoutBar as HTMLElement).getByText("32,000원")).toBeVisible();
});

it("renders same-product options as distinct labelled lines and mutates only the chosen line", async () => {
  const user = userEvent.setup();
  const twoMonth = makeLine({
    lineId: '["omega-3","2-month"]',
    purchaseOptionId: "2-month",
    purchaseOptionLabel: "2개월분",
    sku: "OMEGA-2M",
    unitPrice: 10_000,
    stock: 5,
    quantity: 1,
  });
  const fourMonth = makeLine({
    lineId: '["omega-3","4-month"]',
    purchaseOptionId: "4-month",
    purchaseOptionLabel: "4개월분",
    sku: "OMEGA-4M",
    unitPrice: 18_000,
    stock: 5,
    quantity: 2,
  });
  renderCart([twoMonth, fourMonth]);

  expect(await screen.findByText("2개월분")).toBeVisible();
  expect(screen.getByText("4개월분")).toBeVisible();
  expect(screen.getAllByText("46,000원").at(-1)).toBeVisible();

  await user.click(screen.getByRole("checkbox", { name: "데일리 오메가3 2개월분 선택" }));
  expect(screen.getAllByText("36,000원").at(-1)).toBeVisible();

  await user.click(screen.getByRole("button", { name: "데일리 오메가3 2개월분 삭제" }));
  await user.click(screen.getByRole("button", { name: "삭제하기" }));
  expect(screen.queryByText("2개월분")).not.toBeInTheDocument();
  expect(screen.getByText("4개월분")).toBeVisible();
});

it("confirms before deleting selected products and shows an empty-cart guide", async () => {
  const user = userEvent.setup();
  renderCart();

  await screen.findByRole("heading", { name: "장바구니" });
  await user.click(screen.getByRole("button", { name: "데일리 오메가3 기본 구성 삭제" }));

  expect(screen.getByRole("dialog", { name: "상품 삭제 확인" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "삭제하기" }));

  expect(screen.getByRole("heading", { name: "장바구니가 비어 있어요" })).toBeVisible();
  expect(screen.getByRole("link", { name: "상품 둘러보기" })).toHaveAttribute("href", "/products");
});

it("keeps focus inside the delete dialog and restores it after cancellation", async () => {
  const user = userEvent.setup();
  renderCart();
  const deleteTrigger = await screen.findByRole("button", { name: "데일리 오메가3 기본 구성 삭제" });

  await user.click(deleteTrigger);

  const cancelButton = screen.getByRole("button", { name: "취소" });
  const confirmButton = screen.getByRole("button", { name: "삭제하기" });
  expect(cancelButton).toHaveFocus();

  await user.tab({ shift: true });
  expect(confirmButton).toHaveFocus();
  await user.tab();
  expect(cancelButton).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "상품 삭제 확인" })).not.toBeInTheDocument();
  await waitFor(() => expect(deleteTrigger).toHaveFocus());
});

it("keeps a selected out-of-stock line visible but prevents checkout", async () => {
  renderCart([{ ...line, stock: 0 }]);

  expect(await screen.findByRole("alert")).toHaveTextContent("재고가 없는 선택 상품을 해제한 뒤 주문해 주세요.");
  expect(screen.getByRole("link", { name: "선택 상품 주문하기" })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("button", { name: /수량 줄이기/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /수량 늘리기/ })).toBeDisabled();
});

it("replaces a broken cart thumbnail without changing persisted cart data", async () => {
  renderCart();

  const listItem = await screen.findByRole("listitem");
  const thumbnail = listItem.querySelector("img");
  const imageRegion = thumbnail?.closest(".cart-view__image");
  expect(thumbnail).toHaveAttribute("src", line.thumbnailUrl);
  expect(thumbnail).toHaveAttribute("alt", "");
  expect(imageRegion).toHaveAttribute("aria-hidden", "true");

  fireEvent.error(thumbnail as HTMLImageElement);

  expect(imageRegion?.querySelector("img")).not.toBeInTheDocument();
  expect(within(imageRegion as HTMLElement).getByText("VITALEAF")).toBeInTheDocument();
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([line]);
  });
});
