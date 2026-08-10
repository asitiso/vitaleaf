import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CartProvider } from "../../features/cart/cart-context";

import { SiteHeader } from "./site-header";

function renderHeader() {
  return render(
    <CartProvider>
      <SiteHeader />
    </CartProvider>,
  );
}

describe("SiteHeader", () => {
  it("opens the category menu and exposes health concern links", async () => {
    const user = userEvent.setup();
    renderHeader();

    const trigger = screen.getByRole("button", { name: "전체 카테고리" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "피로·활력" })).toBeVisible();
  });

  it("closes the category menu with Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderHeader();

    const trigger = screen.getByRole("button", { name: "전체 카테고리" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes the category menu when the user clicks outside it", async () => {
    const user = userEvent.setup();
    renderHeader();

    const trigger = screen.getByRole("button", { name: "전체 카테고리" });
    await user.click(trigger);
    await user.click(document.body);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a labelled mobile navigation drawer", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: "메뉴 열기" }));

    const drawer = screen.getByRole("dialog", { name: "모바일 메뉴" });
    expect(drawer).toBeVisible();
    expect(within(drawer).getByRole("link", { name: "베스트" })).toBeVisible();
  });
});
