import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";

import { MegaMenu } from "./mega-menu";

describe("MegaMenu", () => {
  it("groups product, concern, and age links with a trial promotion", () => {
    render(<MegaMenu onNavigate={() => undefined} />);

    expect(screen.getByRole("heading", { name: "상품 카테고리" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "건강 고민" })).toBeVisible();
    expect(screen.getByRole("link", { name: "50대+" })).toBeVisible();
    expect(screen.getByRole("link", { name: /첫 구매 고객.*7일 체험/ })).toBeVisible();
  });

  it("renders every shared category, concern, and age destination", () => {
    render(<MegaMenu onNavigate={() => undefined} />);

    for (const item of [
      ...STOREFRONT_MENU.categories,
      ...STOREFRONT_MENU.concerns,
      ...STOREFRONT_MENU.ages,
    ]) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
  });

  it("uses document navigation inside the mobile drawer so closing it cannot cancel the destination", () => {
    render(<MegaMenu variant="drawer" onNavigate={() => undefined} />);

    expect(screen.getByRole("link", { name: "비타민" })).not.toHaveAttribute("data-client-navigation");
    expect(screen.getByRole("link", { name: "장 건강" })).not.toHaveAttribute("data-client-navigation");
    expect(screen.getByRole("link", { name: "30대" })).not.toHaveAttribute("data-client-navigation");
  });

  it("uses document navigation inside the desktop dropdown because selecting a destination unmounts it", () => {
    render(<MegaMenu onNavigate={() => undefined} />);

    expect(screen.getByRole("link", { name: "비타민" })).not.toHaveAttribute("data-client-navigation");
    expect(screen.getByRole("link", { name: "피로·활력" })).not.toHaveAttribute("data-client-navigation");
    expect(screen.getByRole("link", { name: /첫 구매 고객.*7일 체험/ })).not.toHaveAttribute("data-client-navigation");
  });
});
