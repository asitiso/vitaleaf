import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { CartProvider } from "../../features/cart/cart-context";
import type { CartLine } from "../../features/cart/cart-types";

import { CartView } from "./cart-view";

const storageKey = "vitaleaf-cart-v1";

const line: CartLine = {
  productId: "omega-3",
  name: "데일리 오메가3",
  thumbnailUrl: "/omega-3.jpg",
  unitPrice: 16_000,
  stock: 2,
  quantity: 1,
  selected: true,
};

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

  await user.click(screen.getByRole("button", { name: "수량 늘리기" }));

  expect(screen.getByText("0원")).toBeVisible();
  expect(screen.getByText("무료배송 혜택을 받고 있어요")).toBeVisible();
  expect(screen.getByRole("button", { name: "수량 늘리기" })).toBeDisabled();

  await user.click(screen.getByRole("checkbox", { name: "전체 선택" }));

  expect(screen.getByRole("link", { name: "선택 상품 주문하기" })).toHaveAttribute("aria-disabled", "true");
});

it("confirms before deleting selected products and shows an empty-cart guide", async () => {
  const user = userEvent.setup();
  renderCart();

  await screen.findByRole("heading", { name: "장바구니" });
  await user.click(screen.getByRole("button", { name: "데일리 오메가3 삭제" }));

  expect(screen.getByRole("dialog", { name: "상품 삭제 확인" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "삭제하기" }));

  expect(screen.getByRole("heading", { name: "장바구니가 비어 있어요" })).toBeVisible();
  expect(screen.getByRole("link", { name: "상품 둘러보기" })).toHaveAttribute("href", "/products");
});

it("keeps focus inside the delete dialog and restores it after cancellation", async () => {
  const user = userEvent.setup();
  renderCart();
  const deleteTrigger = await screen.findByRole("button", { name: "데일리 오메가3 삭제" });

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
  expect(screen.getByRole("button", { name: "수량 줄이기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "수량 늘리기" })).toBeDisabled();
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
