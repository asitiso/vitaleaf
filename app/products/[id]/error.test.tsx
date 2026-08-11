import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import ProductError from "./error";

it("offers an accessible retry and a safe return to the product list", async () => {
  const user = userEvent.setup();
  const reset = vi.fn();

  render(<ProductError error={new Error("Firestore unavailable")} reset={reset} />);

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("상품 정보를 불러오지 못했습니다");
  expect(screen.getByRole("link", { name: "상품 목록으로 돌아가기" })).toHaveAttribute("href", "/products");

  await user.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(reset).toHaveBeenCalledOnce();
});
