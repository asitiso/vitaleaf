import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MegaMenu } from "./mega-menu";

describe("MegaMenu", () => {
  it("groups product, concern, and age links with a trial promotion", () => {
    render(<MegaMenu onNavigate={() => undefined} />);

    expect(screen.getByRole("heading", { name: "상품 카테고리" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "건강 고민" })).toBeVisible();
    expect(screen.getByRole("link", { name: "50대+" })).toBeVisible();
    expect(screen.getByRole("link", { name: /첫 구매 고객.*7일 체험/ })).toBeVisible();
  });
});
