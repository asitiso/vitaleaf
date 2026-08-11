import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { STOREFRONT_MENU } from "../lib/navigation/storefront-menu";
import { STORE_POLICIES } from "../lib/site/policies";
import HelpPage from "./help/page";
import ReturnsPage from "./help/returns/page";
import ShippingPage from "./help/shipping/page";
import IngredientsPage from "./ingredients/page";
import StoryPage from "./story/page";

const pagesByHref = {
  "/story": { Page: StoryPage, title: "VITALEAF 이야기" },
  "/help": { Page: HelpPage, title: "고객센터" },
  "/help/shipping": { Page: ShippingPage, title: "배송 안내" },
  "/help/returns": { Page: ReturnsPage, title: "교환 및 반품 안내" },
} as const;

it.each(STOREFRONT_MENU.footer)("renders the registered footer destination $href", ({ href }) => {
  const destination = pagesByHref[href as keyof typeof pagesByHref];

  expect(destination).toBeDefined();
  const { Page, title } = destination;
  render(<Page />);
  expect(screen.getByRole("heading", { level: 1, name: title })).toBeVisible();
});

it("renders the ingredients menu destination with related product links and a non-diagnostic notice", () => {
  render(<IngredientsPage />);

  expect(screen.getByRole("heading", { level: 1, name: "성분 가이드" })).toBeVisible();
  expect(screen.getByText("성분별 안내는 일반적인 정보이며 질병의 진단·치료를 위한 내용이 아닙니다.")).toBeVisible();
  expect(screen.getByRole("link", { name: "비타민 상품 보기" })).toHaveAttribute("href", "/products?category=vitamin");
  expect(screen.getByRole("link", { name: "프로바이오틱스 상품 보기" })).toHaveAttribute("href", "/products?category=probiotic");
});

it("renders shared policy values and support route links", () => {
  render(<ShippingPage />);

  expect(screen.getByText(`${STORE_POLICIES.shipping.freeThreshold.toLocaleString("ko-KR")}원 이상 구매 시 무료이며, 미만일 경우 ${STORE_POLICIES.shipping.baseFee.toLocaleString("ko-KR")}원입니다.`)).toBeVisible();
  expect(screen.getByRole("link", { name: "교환 및 반품 안내" })).toHaveAttribute("href", "/help/returns");
});

it("renders help support details from the shared policy", () => {
  const support = STORE_POLICIES.support as { phone: string; hours: string; lunch: string };
  const original = { ...support };
  Object.assign(support, { phone: "02-9999-0000", hours: "평일 10:00–17:00", lunch: "13:00–14:00" });

  try {
    render(<HelpPage />);
    expect(screen.getByText("평일 10:00–17:00 (점심 13:00–14:00)")).toBeVisible();
    expect(screen.getByText("02-9999-0000")).toBeVisible();
  } finally {
    Object.assign(support, original);
  }
});
