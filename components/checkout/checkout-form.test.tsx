import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CartProvider } from "../../features/cart/cart-context";
import type { CartLine } from "../../features/cart/cart-types";
import type { PaymentResult } from "../../lib/payment/process-payment";

import { CheckoutForm } from "./checkout-form";

const { processPaymentMock, pushMock } = vi.hoisted(() => ({
  processPaymentMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("../../lib/payment/process-payment", () => ({
  processPayment: processPaymentMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const storageKey = "vitaleaf-cart-v1";
const selectedLine: CartLine = {
  productId: "omega-3",
  name: "데일리 오메가3",
  thumbnailUrl: "/omega-3.jpg",
  unitPrice: 16_000,
  stock: 3,
  quantity: 2,
  selected: true,
};
const unselectedLine: CartLine = {
  productId: "vitamin-d",
  name: "비타민D",
  thumbnailUrl: "/vitamin-d.jpg",
  unitPrice: 12_000,
  stock: 5,
  quantity: 1,
  selected: false,
};

function renderCheckout(lines: CartLine[] = [selectedLine, unselectedLine]) {
  localStorage.setItem(storageKey, JSON.stringify(lines));
  return render(
    <CartProvider>
      <CheckoutForm />
    </CartProvider>,
  );
}

async function fillValidOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("받는 분"), "홍길동");
  await user.type(screen.getByLabelText("연락처"), "010-1234-5678");
  await user.type(screen.getByLabelText("우편번호"), "06236");
  await user.type(screen.getByLabelText("주소"), "서울특별시 강남구 테헤란로 123");
  await user.type(screen.getByLabelText("상세주소"), "4층");
  await user.type(screen.getByLabelText("배송 요청사항 (선택)"), "문 앞에 놓아 주세요.");
}

function deferredPayment() {
  let resolve!: (result: PaymentResult) => void;
  const promise = new Promise<PaymentResult>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

beforeEach(() => {
  processPaymentMock.mockReset();
  pushMock.mockReset();
});

afterEach(() => {
  localStorage.clear();
});

it("shows only selected cart lines, their totals, and all payment choices", async () => {
  renderCheckout();

  expect(await screen.findByText(/^데일리 오메가3/)).toBeVisible();
  expect(screen.queryByText("비타민D")).not.toBeInTheDocument();
  expect(screen.getByText("32,000원", { selector: "strong" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "카드 결제" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "계좌이체" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "간편결제" })).toBeVisible();
});

it("focuses the first required or malformed field", async () => {
  const user = userEvent.setup();
  renderCheckout();
  const payButton = await screen.findByRole("button", { name: "결제하기" });

  await user.click(payButton);
  expect(screen.getByLabelText("받는 분")).toHaveFocus();
  expect(screen.getByText("받는 분을 입력해 주세요.")).toBeVisible();

  await user.type(screen.getByLabelText("받는 분"), "홍길동");
  await user.type(screen.getByLabelText("연락처"), "1234");
  await user.click(payButton);
  expect(screen.getByLabelText("연락처")).toHaveFocus();
  expect(screen.getByText("휴대전화 번호를 010-1234-5678 형식으로 입력해 주세요.")).toBeVisible();
});

it("submits the selected order once, clears it, and routes with only the order number", async () => {
  const user = userEvent.setup();
  const payment = deferredPayment();
  processPaymentMock.mockReturnValue(payment.promise);
  renderCheckout();
  await screen.findByText(/^데일리 오메가3/);
  await fillValidOrder(user);
  await user.click(screen.getByRole("radio", { name: "간편결제" }));

  const form = screen.getByRole("form", { name: "주문 및 결제" });
  fireEvent.submit(form);
  fireEvent.submit(form);

  expect(processPaymentMock).toHaveBeenCalledTimes(1);
  expect(processPaymentMock).toHaveBeenCalledWith({
    customerName: "홍길동",
    phone: "010-1234-5678",
    postcode: "06236",
    address: "서울특별시 강남구 테헤란로 123",
    addressDetail: "4층",
    deliveryNote: "문 앞에 놓아 주세요.",
    paymentMethod: "easy",
    lines: [selectedLine],
    subtotal: 32_000,
    shippingFee: 0,
    total: 32_000,
  });
  expect(screen.getByRole("button", { name: "결제 처리 중" })).toBeDisabled();

  payment.resolve({
    orderNumber: "VL-20260810-ABC123",
    receivedAt: "2026-08-10T09:00:00.000Z",
  });

  await waitFor(() => {
    expect(pushMock).toHaveBeenCalledWith("/order-complete?orderNumber=VL-20260810-ABC123");
  });
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([unselectedLine]);
  });
});
