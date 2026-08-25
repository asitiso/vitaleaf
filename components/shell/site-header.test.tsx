import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, signOutMember } = vi.hoisted(() => ({
  authState: {
    status: "signed-out" as "checking" | "signed-out" | "signed-in" | "error",
    user: null as { uid: string; email: string; emailVerified: boolean } | null,
    error: "",
  },
  signOutMember: vi.fn(),
}));

vi.mock("../../features/auth/auth-context", () => ({
  useAuth: () => ({ ...authState, signOutMember }),
}));

import { CartProvider } from "../../features/cart/cart-context";
import { STOREFRONT_MENU } from "../../lib/navigation/storefront-menu";
import { STORE_POLICIES } from "../../lib/site/policies";

import { SiteHeader } from "./site-header";

function renderHeader() {
  return render(
    <CartProvider>
      <SiteHeader />
    </CartProvider>,
  );
}

beforeEach(() => {
  authState.status = "signed-out";
  authState.user = null;
  authState.error = "";
  signOutMember.mockReset();
  signOutMember.mockResolvedValue(true);
});

describe("SiteHeader", () => {
  it("renders the public shipping benefit from the shared policy", () => {
    const shipping = STORE_POLICIES.shipping as { freeThreshold: number; dispatch: string };
    const original = { ...shipping };
    Object.assign(shipping, { freeThreshold: 50_000, dispatch: "결제 확인 후 정책 기준 순차 출고" });

  try {
    renderHeader();
    expect(screen.getByText("첫 구매 추천 상품 · 5만원 이상 무료배송 · 결제 확인 후 정책 기준 순차 출고")).toBeVisible();
  } finally {
      Object.assign(shipping, original);
    }
  });

  it("keeps customer navigation linked to real account, admin, and cart routes", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("link", { name: "브랜드 스토리" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "관리자" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: /장바구니/ })).toHaveAttribute("href", "/cart");
  });

  it("shows a stable checking placeholder instead of changing account actions", () => {
    authState.status = "checking";
    renderHeader();

    expect(screen.getByLabelText("회원 상태 확인 중")).toBeVisible();
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "마이페이지" })).not.toBeInTheDocument();
  });

  it("shows my page and logs out from the mobile drawer before closing it", async () => {
    const user = userEvent.setup();
    authState.status = "signed-in";
    authState.user = { uid: "member-1", email: "member@example.com", emailVerified: true };
    renderHeader();

    expect(screen.getByRole("link", { name: "마이페이지" })).toHaveAttribute("href", "/mypage");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const drawer = screen.getByRole("dialog", { name: "모바일 메뉴" });
    expect(within(drawer).getByRole("link", { name: "마이페이지" })).toHaveAttribute("href", "/mypage");
    expect(within(drawer).getByRole("link", { name: "관리자" })).toHaveAttribute("href", "/admin");

    await user.click(within(drawer).getByRole("button", { name: "로그아웃" }));

    expect(signOutMember).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "모바일 메뉴" })).not.toBeInTheDocument();
  });

  it("keeps the mobile drawer open when logout does not complete", async () => {
    const user = userEvent.setup();
    authState.status = "signed-in";
    authState.user = { uid: "member-1", email: "member@example.com", emailVerified: true };
    signOutMember.mockResolvedValue(false);
    renderHeader();

    await user.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const drawer = screen.getByRole("dialog", { name: "모바일 메뉴" });
    await user.click(within(drawer).getByRole("button", { name: "로그아웃" }));

    expect(screen.getByRole("dialog", { name: "모바일 메뉴" })).toBeVisible();
  });

  it("announces a logout error while preserving the signed-in account actions", () => {
    authState.status = "signed-in";
    authState.user = { uid: "member-1", email: "member@example.com", emailVerified: true };
    authState.error = "로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    renderHeader();

    expect(screen.getByRole("alert")).toHaveTextContent("로그아웃하지 못했습니다");
    expect(screen.getByRole("link", { name: "마이페이지" })).toBeVisible();
  });

  it("links best navigation to the supported popular sort", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: "베스트" })).toHaveAttribute("href", "/products?sort=popular");
  });

  it("uses the shared menu links in both desktop navigation and the mobile drawer", async () => {
    const user = userEvent.setup();
    renderHeader();

    for (const item of STOREFRONT_MENU.header) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }

    await user.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const drawer = screen.getByRole("dialog", { name: "모바일 메뉴" });
    const mobileNavigation = within(drawer).getByRole("navigation", { name: "모바일 주요 메뉴" });

    for (const item of STOREFRONT_MENU.header) {
      const mobileLink = within(mobileNavigation).getByRole("link", { name: item.label });
      expect(mobileLink).toHaveAttribute("href", item.href);
      expect(mobileLink).not.toHaveAttribute("data-client-navigation");
    }
  });

  it("opens the category menu and exposes health concern links", async () => {
    const user = userEvent.setup();
    renderHeader();

    const trigger = screen.getByRole("button", { name: "전체 카테고리" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "피로·활력" })).toBeVisible();
  });

  it("keeps the singleton category trigger linked to one deterministic menu id across renders", async () => {
    const user = userEvent.setup();
    const firstRender = renderHeader();
    const firstTrigger = screen.getByRole("button", { name: "전체 카테고리" });

    expect(firstTrigger).toHaveAttribute("aria-controls", "site-header-mega-menu");
    await user.click(firstTrigger);
    expect(screen.getByRole("region", { name: "전체 카테고리 메뉴" }))
      .toHaveAttribute("id", "site-header-mega-menu");

    firstRender.unmount();
    renderHeader();
    expect(screen.getByRole("button", { name: "전체 카테고리" }))
      .toHaveAttribute("aria-controls", "site-header-mega-menu");
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

describe("mobile drawer accessibility", () => {
  it("keeps search compact until requested and preserves its query after Escape", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: "메뉴 열기" }));

    const drawer = screen.getByRole("dialog", { name: "모바일 메뉴" });
    const searchToggle = within(drawer).getByRole("button", { name: "검색 열기" });

    expect(searchToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(drawer).queryByRole("search")).not.toBeInTheDocument();

    await user.click(searchToggle);

    const searchbox = within(drawer).getByRole("searchbox", { name: "상품 검색" });
    expect(searchToggle).toHaveAttribute("aria-expanded", "true");
    expect(searchbox).toHaveFocus();

    await user.type(searchbox, "오메가3");
    await user.keyboard("{Escape}");

    expect(drawer).toBeVisible();
    expect(searchToggle).toHaveAttribute("aria-expanded", "false");
    expect(searchToggle).toHaveFocus();
    expect(within(drawer).queryByRole("search")).not.toBeInTheDocument();

    await user.click(searchToggle);
    expect(within(drawer).getByRole("searchbox", { name: "상품 검색" })).toHaveValue("오메가3");
  });

  it("keeps product categories, health concerns, and age recommendations available", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: "메뉴 열기" }));

    const drawer = screen.getByRole("dialog", { name: "모바일 메뉴" });
    expect(within(drawer).getByRole("heading", { name: "상품 카테고리" })).toBeVisible();
    expect(within(drawer).getByRole("link", { name: "피로·활력" })).toBeVisible();
    expect(within(drawer).getByRole("link", { name: "50대+" })).toBeVisible();
  });

  it("moves focus inside, traps Tab, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    renderHeader();

    const trigger = screen.getByRole("button", { name: "메뉴 열기" });
    await user.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "모바일 메뉴" });
    const closeButton = within(drawer).getByRole("button", { name: "닫기" });
    const focusableElements = Array.from(
      drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
    ).filter((element) => !element.closest("[hidden]"));

    expect(closeButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focusableElements.at(0));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focusableElements.at(-1));
    await user.tab();
    expect(document.activeElement).toBe(focusableElements.at(0));

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "모바일 메뉴" })).not.toBeInTheDocument();
  });
});
