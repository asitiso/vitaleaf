import { render, screen } from "@testing-library/react";

import HelpPage from "./help/page";
import ReturnsPage from "./help/returns/page";
import ShippingPage from "./help/shipping/page";
import IngredientsPage from "./ingredients/page";
import StoryPage from "./story/page";

it.each([
  ["/story", StoryPage, "VITALEAF 이야기"],
  ["/help", HelpPage, "고객센터"],
  ["/help/shipping", ShippingPage, "배송 안내"],
  ["/help/returns", ReturnsPage, "교환 및 반품 안내"],
  ["/ingredients", IngredientsPage, "성분 가이드"],
])("renders the menu destination %s", (_href, Page, heading) => {
  render(<Page />);

  expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
});
