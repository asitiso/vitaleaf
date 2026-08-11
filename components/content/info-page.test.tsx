import { render, screen } from "@testing-library/react";

import { InfoPage } from "./info-page";

it("renders an accessible information page with practical navigation", () => {
  render(
    <InfoPage
      eyebrow="VITALEAF GUIDE"
      title="배송 안내"
      description="주문과 배송에 필요한 내용을 확인해 보세요."
      sections={[
        { title: "배송비", body: "3만원 이상 구매 시 배송비는 무료입니다." },
        { title: "출고", body: "결제 확인 후 순차 출고합니다." },
      ]}
      links={[{ href: "/help/returns", label: "교환 및 반품 안내" }]}
    />,
  );

  expect(screen.getByRole("heading", { level: 1, name: "배송 안내" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 2, name: "배송비" })).toBeVisible();
  expect(screen.getByRole("link", { name: "교환 및 반품 안내" })).toHaveAttribute("href", "/help/returns");
});
