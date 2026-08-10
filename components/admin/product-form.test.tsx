import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ProductForm } from "./product-form";

it("rejects negative price and stock and requires a name and category", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<ProductForm onSave={onSave} />);

  await user.type(screen.getByLabelText("판매가"), "-1");
  await user.type(screen.getByLabelText("재고"), "-2");
  await user.click(screen.getByRole("button", { name: "상품 저장" }));

  expect(screen.getByText("상품명을 입력해 주세요.")).toBeVisible();
  expect(screen.getByText("카테고리를 입력해 주세요.")).toBeVisible();
  expect(screen.getByText("판매가는 0원 이상이어야 합니다.")).toBeVisible();
  expect(screen.getByText("재고는 0개 이상이어야 합니다.")).toBeVisible();
  expect(onSave).not.toHaveBeenCalled();
});

it("parses line lists and submits structured ingredient rows", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<ProductForm onSave={onSave} />);

  await user.type(screen.getByLabelText("상품명"), "데일리 루테인");
  await user.type(screen.getByLabelText("카테고리"), "눈 건강");
  await user.type(screen.getByLabelText("판매가"), "28000");
  await user.type(screen.getByLabelText("재고"), "12");
  await user.type(screen.getByLabelText("이미지 URL 목록"), "https://example.com/front.jpg\n\nhttps://example.com/back.jpg");
  await user.type(screen.getByLabelText("혜택"), "눈 건강\n피로 개선");
  await user.type(screen.getByLabelText("주의사항"), "임산부 상담\n복용량 준수");
  await user.type(screen.getByLabelText("인증"), "GMP\nHACCP");

  const ingredient = screen.getByRole("group", { name: "원료 1" });
  await user.type(within(ingredient).getByLabelText("원료명"), "루테인");
  await user.type(within(ingredient).getByLabelText("함량"), "20 mg");
  await user.type(within(ingredient).getByLabelText("일일 기준치"), "-");
  await user.click(screen.getByRole("button", { name: "상품 저장" }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    name: "데일리 루테인",
    category: "눈 건강",
    price: 28000,
    stock: 12,
    images: ["https://example.com/front.jpg", "https://example.com/back.jpg"],
    benefits: ["눈 건강", "피로 개선"],
    cautions: ["임산부 상담", "복용량 준수"],
    certifications: ["GMP", "HACCP"],
    ingredients: [{ name: "루테인", amount: "20 mg", dailyValue: "-" }],
  }));
});

it("shows save progress and prevents a second submit", async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<ProductForm onSave={onSave} />);

  await user.type(screen.getByLabelText("상품명"), "비타민 D");
  await user.type(screen.getByLabelText("카테고리"), "뼈 건강");
  await user.type(screen.getByLabelText("판매가"), "10000");
  await user.type(screen.getByLabelText("재고"), "3");
  await user.click(screen.getByRole("button", { name: "상품 저장" }));

  expect(screen.getByRole("button", { name: "저장 중" })).toBeDisabled();
  expect(onSave).toHaveBeenCalledTimes(1);
  finish();
});
