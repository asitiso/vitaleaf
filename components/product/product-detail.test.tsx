import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { Product, Review } from "@/lib/products/types";
import type { CartLine } from "../../features/cart/cart-types";
import { STORE_POLICIES } from "../../lib/site/policies";

const { add, cartLines, getApprovedReviewsMock, prepareBuyNow, push } = vi.hoisted(() => ({
  add: vi.fn(),
  cartLines: [] as CartLine[],
  getApprovedReviewsMock: vi.fn(),
  prepareBuyNow: vi.fn(),
  push: vi.fn(),
}));

vi.mock("../../features/cart/cart-context", () => ({
  useCart: () => ({ add, lines: cartLines, prepareBuyNow }),
}));

vi.mock("../../lib/firebase/reviews", () => ({
  getApprovedReviews: getApprovedReviewsMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { ProductDetail } from "./product-detail";

const product: Product = {
  id: "daily-omega-3",
  name: "데일리 오메가3",
  slug: "daily-omega-3",
  category: "혈행 건강",
  concerns: ["혈행"],
  price: 32_000,
  originalPrice: 40_000,
  thumbnailUrl: "https://images.example.com/omega-3-main.jpg",
  images: ["https://images.example.com/omega-3-side.jpg"],
  media: [
    { url: "https://images.example.com/omega-3-main.jpg", storagePath: null, alt: "Omega 3 main", order: 0 },
    { url: "https://images.example.com/omega-3-side.jpg", storagePath: null, alt: "Omega 3 side", order: 1 },
  ],
  description: "매일 간편하게 챙기는 혈행 건강",
  benefits: ["혈행 개선", "기억력 개선", "건조한 눈 개선", "피로 개선"],
  ingredients: [{ name: "EPA 및 DHA", amount: "600 mg", dailyValue: "100%" }],
  dosage: "하루 1회, 1캡슐을 물과 함께 섭취하세요.",
  origin: "노르웨이",
  certifications: ["건강기능식품", "GMP"],
  cautions: ["의약품 복용 중에는 전문가와 상담하세요."],
  stock: 6,
  isBest: true,
  isNew: false,
  salesRank: 1,
  ratingAverage: 4.8,
  reviewCount: 120,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: null,
};

const duplicateOptionedProduct: Product = {
  ...product,
  price: 80_000,
  originalPrice: null,
  stock: 7,
  purchaseOptions: [
    {
      id: "2-month",
      label: "2개월분",
      durationMonths: 2,
      sku: "OMEGA-2M",
      priceAdjustment: -35_000,
      stock: 3,
      active: true,
      isDefault: false,
    },
    {
      id: "4-month",
      label: "4개월분",
      durationMonths: 4,
      sku: "OMEGA-4M",
      priceAdjustment: 0,
      stock: 4,
      active: true,
      isDefault: true,
    },
  ],
};

function storedOptionLine(optionIndex: 0 | 1, quantity: number): CartLine {
  const option = duplicateOptionedProduct.purchaseOptions![optionIndex];
  return {
    lineId: JSON.stringify([duplicateOptionedProduct.id, option.id]),
    productId: duplicateOptionedProduct.id,
    purchaseOptionId: option.id,
    purchaseOptionLabel: option.label,
    sku: option.sku,
    name: duplicateOptionedProduct.name,
    thumbnailUrl: duplicateOptionedProduct.thumbnailUrl,
    unitPrice: duplicateOptionedProduct.price + option.priceAdjustment,
    stock: option.stock,
    quantity,
    selected: true,
  };
}

const reviews: Review[] = [
  {
    id: "review-5",
    productId: product.id,
    rating: 5,
    text: "목 넘김이 편하고 꾸준히 챙기기 좋아요.",
    authorAlias: "건강한하루",
    approved: true,
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
  },
  {
    id: "review-3",
    productId: product.id,
    rating: 3,
    text: "포장이 깔끔하게 도착했어요.",
    authorAlias: "활력충전",
    approved: true,
    createdAt: null,
  },
  {
    id: "review-hidden",
    productId: product.id,
    rating: 1,
    text: "승인되지 않은 리뷰",
    authorAlias: "숨김",
    approved: false,
    createdAt: null,
  },
];

beforeEach(() => {
  add.mockClear();
  cartLines.splice(0);
  getApprovedReviewsMock.mockReset();
  prepareBuyNow.mockClear();
  push.mockClear();
});

it("caps quantity at stock and sends the selected quantity to cart", async () => {
  const stockedProduct = { ...product, stock: 2 };
  render(<ProductDetail product={stockedProduct} reviews={[]} />);

  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));
  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));

  expect(screen.getByLabelText("수량")).toHaveValue(2);

  await userEvent.click(screen.getByRole("button", { name: "장바구니 담기" }));
  expect(add).toHaveBeenCalledWith(
    stockedProduct,
    expect.objectContaining({ id: "default", label: "기본 구성", stock: 2 }),
    2,
  );
});

it("prepares only the current product before routing to buy-now checkout", async () => {
  render(<ProductDetail product={product} reviews={[]} />);

  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));
  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));
  await userEvent.click(screen.getByRole("button", { name: "바로 구매" }));

  expect(prepareBuyNow).toHaveBeenCalledWith(
    product,
    expect.objectContaining({ id: "default", label: "기본 구성", stock: 6 }),
    3,
  );
  expect(add).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith("/checkout?mode=buy-now");
  expect(prepareBuyNow.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
});

it("shows a desktop cart confirmation with a cart action", async () => {
  const user = userEvent.setup();
  render(<ProductDetail product={product} reviews={[]} />);

  await user.click(screen.getByRole("button", { name: "장바구니 담기" }));

  const status = screen.getByRole("status");
  expect(status).toHaveTextContent(`${product.name} 1개`);
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(screen.getByRole("link", { name: "장바구니 보기" })).toHaveAttribute("href", "/cart");
  expect(add).toHaveBeenCalledWith(
    product,
    expect.objectContaining({ id: "default", label: "기본 구성" }),
    1,
  );
});

it("adds a different option immediately as a distinct cart line", async () => {
  cartLines.push(storedOptionLine(1, 2));
  const user = userEvent.setup();
  render(<ProductDetail product={duplicateOptionedProduct} reviews={[]} />);

  await user.click(screen.getByRole("radio", { name: /2개월분/ }));
  await user.click(screen.getByRole("button", { name: "장바구니 담기" }));

  expect(screen.queryByRole("dialog", { name: "장바구니 수량 선택" })).not.toBeInTheDocument();
  expect(add).toHaveBeenCalledWith(
    duplicateOptionedProduct,
    duplicateOptionedProduct.purchaseOptions![0],
    1,
  );
  expect(screen.getByRole("status")).toHaveTextContent(`${duplicateOptionedProduct.name} 1개`);
});

it("asks whether to keep or increment only when the exact option already exists", async () => {
  cartLines.push(storedOptionLine(1, 2));
  const user = userEvent.setup();
  render(<ProductDetail product={duplicateOptionedProduct} reviews={[]} />);

  const trigger = screen.getByRole("button", { name: "장바구니 담기" });
  await user.click(trigger);

  const dialog = screen.getByRole("dialog", { name: "장바구니 수량 선택" });
  expect(dialog).toHaveAccessibleDescription(/같은 상품과 구매 옵션/);
  const quantities = dialog.querySelector(".product-detail__duplicate-quantities");
  expect(quantities).toHaveTextContent("현재 장바구니: 2개");
  expect(quantities).toHaveTextContent("이번 선택 수량: 1개");
  expect(add).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole("button", { name: "기존 수량 유지" }));
  expect(screen.queryByRole("dialog", { name: "장바구니 수량 선택" })).not.toBeInTheDocument();
  expect(add).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("increments the exact option and reports the stock-capped maximum before mutation", async () => {
  cartLines.push(storedOptionLine(0, 2));
  const user = userEvent.setup();
  render(<ProductDetail product={duplicateOptionedProduct} reviews={[]} />);
  await user.click(screen.getByRole("radio", { name: /2개월분/ }));
  await user.click(screen.getByRole("button", { name: "수량 늘리기" }));
  await user.click(screen.getByRole("button", { name: "장바구니 담기" }));

  const dialog = screen.getByRole("dialog", { name: "장바구니 수량 선택" });
  expect(dialog.querySelector(".product-detail__duplicate-quantities")).toHaveTextContent("이번 선택 수량: 2개");
  expect(dialog.querySelector(".product-detail__duplicate-stock")).toHaveTextContent("재고가 3개라 최대 3개까지 담을 수 있어요.");
  await user.click(within(dialog).getByRole("button", { name: "1개 추가하여 3개로 변경" }));

  expect(add).toHaveBeenCalledWith(
    duplicateOptionedProduct,
    duplicateOptionedProduct.purchaseOptions![0],
    2,
    "increment",
  );
  expect(screen.getByRole("status")).toHaveTextContent(`${duplicateOptionedProduct.name} 1개`);
});

it("refreshes an open duplicate decision from the latest cross-tab cart quantity", async () => {
  cartLines.push(storedOptionLine(1, 2));
  const user = userEvent.setup();
  const view = render(<ProductDetail product={duplicateOptionedProduct} reviews={[]} />);
  await user.click(screen.getByRole("button", { name: "수량 늘리기" }));
  await user.click(screen.getByRole("button", { name: "장바구니 담기" }));

  expect(screen.getByRole("dialog", { name: "장바구니 수량 선택" }))
    .toHaveTextContent("현재 장바구니: 2개");

  cartLines.splice(0, 1, storedOptionLine(1, 3));
  view.rerender(<ProductDetail product={duplicateOptionedProduct} reviews={[]} />);

  const refreshedDialog = screen.getByRole("dialog", { name: "장바구니 수량 선택" });
  expect(refreshedDialog).toHaveTextContent("현재 장바구니: 3개");
  await user.click(within(refreshedDialog).getByRole("button", { name: "1개 추가하여 4개로 변경" }));

  expect(add).toHaveBeenCalledWith(
    duplicateOptionedProduct,
    duplicateOptionedProduct.purchaseOptions![1],
    2,
    "increment",
  );
  expect(screen.getByRole("status")).toHaveTextContent(`${duplicateOptionedProduct.name} 1개`);
});

it("does not claim an addition when the stored quantity already meets or exceeds current option stock", async () => {
  cartLines.push(storedOptionLine(0, 5));
  const user = userEvent.setup();
  render(<ProductDetail product={duplicateOptionedProduct} reviews={[]} />);
  await user.click(screen.getByRole("radio", { name: /2개월분/ }));
  await user.click(screen.getByRole("button", { name: "장바구니 담기" }));

  const dialog = screen.getByRole("dialog", { name: "장바구니 수량 선택" });
  expect(dialog).toHaveTextContent("현재 장바구니 5개가 최신 재고 3개를 초과해 추가할 수 없어요.");
  expect(within(dialog).getByRole("button", { name: "추가할 수 없습니다" })).toBeDisabled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(add).not.toHaveBeenCalled();
});

it("traps focus and treats Escape, the close button, and the backdrop as safe keep", async () => {
  cartLines.push(storedOptionLine(1, 2));
  const user = userEvent.setup();
  render(<ProductDetail product={duplicateOptionedProduct} reviews={[]} />);
  const trigger = screen.getByRole("button", { name: "장바구니 담기" });

  await user.click(trigger);
  const keepButton = screen.getByRole("button", { name: "기존 수량 유지" });
  const incrementButton = screen.getByRole("button", { name: "1개 추가하여 3개로 변경" });
  expect(keepButton).toHaveFocus();
  await user.tab({ shift: true });
  expect(incrementButton).toHaveFocus();
  await user.tab();
  expect(keepButton).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());

  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "수량 선택 닫기" }));
  await waitFor(() => expect(trigger).toHaveFocus());

  await user.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "수량 선택 바깥 영역 닫기" }));
  expect(screen.queryByRole("dialog", { name: "장바구니 수량 선택" })).not.toBeInTheDocument();
  expect(add).not.toHaveBeenCalled();
});

it("resets the three-second dismissal when a product is added again", async () => {
  vi.useFakeTimers();

  try {
    render(<ProductDetail product={product} reviews={[]} />);
    const addButton = screen.getByRole("button", { name: "장바구니 담기" });
    fireEvent.click(addButton);
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.click(addButton);
    act(() => vi.advanceTimersByTime(2_999));

    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it("allows the cart confirmation to be dismissed manually", async () => {
  render(<ProductDetail product={product} reviews={[]} />);

  await userEvent.click(screen.getByRole("button", { name: "장바구니 담기" }));
  await userEvent.click(screen.getByRole("button", { name: "장바구니 알림 닫기" }));

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("does not show a cart confirmation for sold-out products", async () => {
  render(<ProductDetail product={{ ...product, stock: 0 }} reviews={[]} />);

  await userEvent.click(screen.getByRole("button", { name: "장바구니 담기" }));

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(add).not.toHaveBeenCalled();
});

it("keeps the selected quantity and total visible in the mobile purchase bar", async () => {
  render(<ProductDetail product={product} reviews={[]} />);

  const purchaseSummary = screen.getByLabelText("구매 요약");
  expect(within(purchaseSummary).getByText("수량 1개")).toBeVisible();
  expect(within(purchaseSummary).getByText("32,000원")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));

  expect(within(purchaseSummary).getByText("수량 2개")).toBeVisible();
  expect(within(purchaseSummary).getByText("64,000원")).toBeVisible();
});

it("selects the default purchase option and updates price, stock, duration, and mobile total", async () => {
  const optionedProduct: Product = {
    ...product,
    price: 80_000,
    originalPrice: 100_000,
    stock: 15,
    purchaseOptions: [
      {
        id: "2-month",
        label: "2개월분",
        durationMonths: 2,
        sku: "OMEGA-2M",
        priceAdjustment: -35_000,
        stock: 3,
        active: true,
        isDefault: false,
      },
      {
        id: "4-month",
        label: "4개월분",
        durationMonths: 4,
        sku: "OMEGA-4M",
        priceAdjustment: 0,
        stock: 12,
        active: true,
        isDefault: true,
      },
    ],
  };
  const user = userEvent.setup();
  render(<ProductDetail product={optionedProduct} reviews={[]} />);

  expect(screen.getByRole("radio", { name: /4개월분/ })).toBeChecked();
  expect(screen.getByText("80,000원", { selector: ".product-detail__price" })).toBeVisible();
  expect(screen.getByText("예상 복용 기간 4개월")).toBeVisible();

  await user.click(screen.getByRole("radio", { name: /2개월분/ }));

  expect(screen.getByText("45,000원", { selector: ".product-detail__price" })).toBeVisible();
  expect(screen.getByText("재고 3개 남음")).toBeVisible();
  expect(screen.getByText("예상 복용 기간 2개월")).toBeVisible();
  expect(within(screen.getByLabelText("구매 요약")).getByText("45,000원")).toBeVisible();
  expect(screen.queryByText("20%")).not.toBeInTheDocument();
  expect(screen.queryByText("100,000원")).not.toBeInTheDocument();
});

it("caps the current quantity when changing to a lower-stock option", async () => {
  const optionedProduct: Product = {
    ...product,
    price: 80_000,
    originalPrice: null,
    stock: 7,
    purchaseOptions: [
      {
        id: "small",
        label: "소량 구성",
        durationMonths: 1,
        sku: "OMEGA-S",
        priceAdjustment: -50_000,
        stock: 2,
        active: true,
        isDefault: false,
      },
      {
        id: "large",
        label: "대량 구성",
        durationMonths: 4,
        sku: "OMEGA-L",
        priceAdjustment: 0,
        stock: 5,
        active: true,
        isDefault: true,
      },
    ],
  };
  const user = userEvent.setup();
  render(<ProductDetail product={optionedProduct} reviews={[]} />);

  for (let count = 0; count < 3; count += 1) {
    await user.click(screen.getByRole("button", { name: "수량 늘리기" }));
  }
  expect(screen.getByLabelText("수량")).toHaveValue(4);

  await user.click(screen.getByRole("radio", { name: /소량 구성/ }));

  expect(screen.getByLabelText("수량")).toHaveValue(2);
  expect(within(screen.getByLabelText("구매 요약")).getByText("60,000원")).toBeVisible();
  expect(screen.getByRole("button", { name: "수량 늘리기" })).toBeDisabled();
});

it("disables purchase controls for a selected sold-out option", () => {
  render(<ProductDetail product={{
    ...product,
    stock: 3,
    purchaseOptions: [
      {
        id: "sold-out-default",
        label: "품절 구성",
        durationMonths: 2,
        sku: "OMEGA-SOLD",
        priceAdjustment: 0,
        stock: 0,
        active: true,
        isDefault: true,
      },
      {
        id: "available",
        label: "구매 가능 구성",
        durationMonths: 4,
        sku: "OMEGA-AVAILABLE",
        priceAdjustment: 10_000,
        stock: 3,
        active: true,
        isDefault: false,
      },
    ],
  }} reviews={[]} />);

  expect(screen.getByText("품절된 옵션입니다")).toBeVisible();
  expect(screen.getByRole("button", { name: "장바구니 담기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "바로 구매" })).toBeDisabled();
  expect(screen.getByLabelText("수량")).toHaveValue(1);
});

it("keeps legacy products on the implicit default without a one-choice selector", () => {
  render(<ProductDetail product={product} reviews={[]} />);

  expect(screen.queryByRole("radiogroup", { name: "구매 옵션" })).not.toBeInTheDocument();
  expect(screen.getByText("32,000원", { selector: ".product-detail__price" })).toBeVisible();
  expect(screen.getByText("20%")).toBeVisible();
});

it("resets to the current default option and recaps quantity when product or option props change", async () => {
  const firstProduct: Product = {
    ...product,
    id: "first-product",
    price: 80_000,
    originalPrice: null,
    stock: 5,
    purchaseOptions: [{
      id: "first-default",
      label: "첫 상품 기본 구성",
      durationMonths: 4,
      sku: "FIRST-4M",
      priceAdjustment: 0,
      stock: 5,
      active: true,
      isDefault: true,
    }],
  };
  const nextProduct: Product = {
    ...product,
    id: "next-product",
    name: "다음 상품",
    price: 100_000,
    originalPrice: null,
    stock: 2,
    purchaseOptions: [{
      id: "next-default",
      label: "다음 상품 기본 구성",
      durationMonths: 2,
      sku: "NEXT-2M",
      priceAdjustment: -20_000,
      stock: 2,
      active: true,
      isDefault: true,
    }],
  };
  const user = userEvent.setup();
  const view = render(<ProductDetail product={firstProduct} reviews={[]} />);

  for (let count = 0; count < 3; count += 1) {
    await user.click(screen.getByRole("button", { name: "수량 늘리기" }));
  }
  expect(screen.getByLabelText("수량")).toHaveValue(4);

  view.rerender(<ProductDetail product={nextProduct} reviews={[]} />);

  expect(screen.getByRole("radio", { name: /다음 상품 기본 구성/ })).toBeChecked();
  expect(screen.getByText("80,000원", { selector: ".product-detail__price" })).toBeVisible();
  await waitFor(() => expect(screen.getByLabelText("수량")).toHaveValue(2));
  expect(within(screen.getByLabelText("구매 요약")).getByText("160,000원")).toBeVisible();

  view.rerender(<ProductDetail product={{
    ...nextProduct,
    stock: 1,
    purchaseOptions: [{
      id: "replacement-default",
      label: "교체된 기본 구성",
      durationMonths: 1,
      sku: "NEXT-1M",
      priceAdjustment: 5_000,
      stock: 1,
      active: true,
      isDefault: true,
    }],
  }} reviews={[]} />);

  expect(screen.getByRole("radio", { name: /교체된 기본 구성/ })).toBeChecked();
  expect(screen.getByText("105,000원", { selector: ".product-detail__price" })).toBeVisible();
  expect(screen.getByLabelText("수량")).toHaveValue(1);
  expect(within(screen.getByLabelText("구매 요약")).getByText("105,000원")).toBeVisible();
});

it("surfaces dosage, primary ingredient, and certifications before the accordions", () => {
  render(<ProductDetail product={product} reviews={[]} />);

  const facts = screen.getByLabelText("구매 핵심 정보");
  expect(within(facts).getByText("하루 1회, 1캡슐을 물과 함께 섭취하세요.")).toBeVisible();
  expect(within(facts).getByText("EPA 및 DHA 600 mg")).toBeVisible();
  expect(within(facts).getByText("건강기능식품 · GMP")).toBeVisible();
});

it("shows pricing and shipping facts and prevents purchasing a sold-out product", () => {
  render(<ProductDetail product={{ ...product, stock: 0 }} reviews={[]} />);

  expect(screen.getByText("20%")).toBeInTheDocument();
  expect(screen.getByText("32,000원", { selector: ".product-detail__price" })).toBeInTheDocument();
  expect(screen.getByText("품절된 상품입니다")).toBeInTheDocument();
  expect(screen.getByText("3만원 이상 무료배송")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "장바구니 담기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "바로 구매" })).toBeDisabled();
});

it("renders the public shipping condition and dispatch copy from the shared policy", () => {
  const shipping = STORE_POLICIES.shipping as { freeThreshold: number; dispatch: string };
  const original = { ...shipping };
  Object.assign(shipping, { freeThreshold: 50_000, dispatch: "결제 확인 후 정책 기준 순차 출고" });

  try {
    render(<ProductDetail product={product} reviews={[]} />);
    expect(screen.getByText("5만원 이상 무료배송")).toBeVisible();
    expect(screen.getByText((_, element) => element?.classList.contains("product-detail__shipping") === true && element.textContent?.includes("결제 확인 후 정책 기준 순차 출고") === true)).toBeVisible();
  } finally {
    Object.assign(shipping, original);
  }
});

it("switches gallery images and shows a named fallback when the selected image fails", async () => {
  render(<ProductDetail product={product} reviews={[]} />);

  await userEvent.click(screen.getByRole("button", { name: "이미지 2 보기" }));
  const image = screen.getByRole("img", { name: "Omega 3 side" });
  expect(image).toHaveAttribute("src", "https://images.example.com/omega-3-side.jpg");

  fireEvent.error(image);

  expect(screen.getByRole("img", { name: "데일리 오메가3 이미지 준비 중" })).toBeInTheDocument();
});

it("orders the canonical media gallery and renders each stored alt instead of legacy image fields", async () => {
  render(<ProductDetail product={{
    ...product,
    thumbnailUrl: "legacy-main.jpg",
    images: ["legacy-main.jpg", "legacy-detail.jpg"],
    media: [
      { url: "side.jpg", storagePath: null, alt: "오메가3 용기 측면", order: 4 },
      { url: "front.jpg", storagePath: null, alt: "오메가3 용기 정면", order: 1 },
    ],
  }} reviews={[]} />);

  expect(screen.getByRole("img", { name: "오메가3 용기 정면" })).toHaveAttribute("src", "front.jpg");
  expect(screen.queryByRole("img", { name: /legacy/i })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "이미지 2 보기" }));
  expect(screen.getByRole("img", { name: "오메가3 용기 측면" })).toHaveAttribute("src", "side.jpg");
});

it("uses deterministic Korean alt fallbacks only for legacy gallery fields", async () => {
  render(<ProductDetail product={{
    ...product,
    thumbnailUrl: "legacy-main.jpg",
    images: ["legacy-detail.jpg"],
    media: [],
  }} reviews={[]} />);

  expect(screen.getByRole("img", { name: "데일리 오메가3 대표 이미지" })).toHaveAttribute("src", "legacy-main.jpg");
  await userEvent.click(screen.getByRole("button", { name: "이미지 2 보기" }));
  expect(screen.getByRole("img", { name: "데일리 오메가3 상세 이미지 2" })).toHaveAttribute("src", "legacy-detail.jpg");
});

it("limits core benefits and exposes controlled information regions with a semantic ingredient table", async () => {
  render(<ProductDetail product={product} reviews={[]} />);

  expect(screen.getByRole("list", { name: "핵심 기능성" })).toHaveTextContent("혈행 개선");
  expect(screen.getByRole("list", { name: "핵심 기능성" })).not.toHaveTextContent("피로 개선");

  const dosageButton = screen.getByRole("button", { name: "섭취 방법" });
  expect(dosageButton).toHaveAttribute("aria-expanded", "false");
  expect(dosageButton).toHaveAttribute("aria-controls");
  await userEvent.click(dosageButton);
  expect(dosageButton).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("region", { name: "섭취 방법" })).toHaveTextContent("하루 1회, 1캡슐");

  await userEvent.click(screen.getByRole("button", { name: "성분·함량" }));
  expect(screen.getByRole("columnheader", { name: "성분명" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "1일 섭취량당 함량" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "영양성분 기준치 비율" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "EPA 및 DHA" })).toBeInTheDocument();

  expect(screen.getByRole("button", { name: "원산지" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "인증" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "주의사항" })).toBeInTheDocument();
});

it("summarizes and lists approved reviews only", () => {
  render(<ProductDetail product={product} reviews={reviews} />);

  expect(screen.getByText("4.0", { selector: ".review-section__average" })).toBeInTheDocument();
  expect(screen.getByText("승인 리뷰 2개")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "5점 리뷰 1개" })).toHaveAttribute("value", "1");
  expect(screen.getByRole("progressbar", { name: "3점 리뷰 1개" })).toHaveAttribute("value", "1");
  expect(screen.getByRole("article", { name: "건강한하루님의 5점 리뷰" })).toBeInTheDocument();
  expect(screen.queryByText("승인되지 않은 리뷰")).not.toBeInTheDocument();
});

it("explains when there are no approved reviews", () => {
  render(<ProductDetail product={product} reviews={[]} />);

  expect(screen.getByText("아직 등록된 리뷰가 없습니다")).toBeInTheDocument();
});

it("keeps product details visible and retries a failed review load", async () => {
  getApprovedReviewsMock.mockResolvedValue([reviews[0]]);
  render(<ProductDetail product={product} reviews={[]} reviewLoadError />);

  expect(screen.getByRole("heading", { name: "데일리 오메가3" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("리뷰를 불러오지 못했습니다");

  await userEvent.click(screen.getByRole("button", { name: "리뷰 다시 불러오기" }));

  expect(await screen.findByRole("article", { name: "건강한하루님의 5점 리뷰" })).toBeInTheDocument();
  expect(getApprovedReviewsMock).toHaveBeenCalledWith(product.id);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
