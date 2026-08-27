import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const { lookupGuestOrderMock } = vi.hoisted(() => ({ lookupGuestOrderMock: vi.fn() }));

vi.mock("../../lib/guest-orders/client", () => ({ lookupGuestOrder: lookupGuestOrderMock }));

import { GuestOrderLookupForm } from "./guest-order-lookup-form";

const publicOrder = {
  orderNumber: "VL-20260826-ABC123",
  status: "mock-received" as const,
  receivedAt: "2026-08-26T10:00:00.000Z",
  customerNameMasked: "김**",
  phoneMasked: "010-****-5678",
  addressMasked: "서울시 강남구 ****",
  lines: [{ productId: "vitamin-c", name: "비타민 C", thumbnailUrl: "/vitamin-c.jpg", unitPrice: 12000, quantity: 2 }],
  subtotal: 24000,
  shippingFee: 3000,
  total: 27000,
};

beforeEach(() => {
  lookupGuestOrderMock.mockReset();
});

it("shows a masked order after both fields are submitted", async () => {
  const user = userEvent.setup();
  lookupGuestOrderMock.mockResolvedValue(publicOrder);
  render(<GuestOrderLookupForm />);

  await user.type(screen.getByLabelText("주문번호"), "VL-20260826-ABC123");
  await user.type(screen.getByLabelText("주문 시 휴대전화 번호"), "01012345678");
  await user.click(screen.getByRole("button", { name: "주문 조회" }));

  expect(await screen.findByText("김**")).toBeInTheDocument();
  expect(screen.queryByText("01012345678")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "주문 조회 결과" })).toHaveFocus();
  expect(screen.getByLabelText("주문 시 휴대전화 번호")).toHaveValue("");
  expect(screen.getByText("27,000원")).toBeInTheDocument();
});

it("disables duplicate lookup while a request is pending", async () => {
  const user = userEvent.setup();
  let resolveLookup: (value: typeof publicOrder) => void = () => undefined;
  lookupGuestOrderMock.mockImplementation(() => new Promise((resolve) => { resolveLookup = resolve; }));
  render(<GuestOrderLookupForm />);

  await user.type(screen.getByLabelText("주문번호"), "VL-20260826-ABC123");
  await user.type(screen.getByLabelText("주문 시 휴대전화 번호"), "01012345678");
  await user.click(screen.getByRole("button", { name: "주문 조회" }));

  expect(screen.getByRole("button", { name: "조회 중" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "조회 중" }));
  expect(lookupGuestOrderMock).toHaveBeenCalledTimes(1);

  resolveLookup(publicOrder);
  expect(await screen.findByText("김**")).toBeInTheDocument();
});

it("keeps the order number and shows a generic error when lookup fails", async () => {
  const user = userEvent.setup();
  lookupGuestOrderMock.mockRejectedValue(new Error("lookup failed"));
  render(<GuestOrderLookupForm />);

  await user.type(screen.getByLabelText("주문번호"), "VL-20260826-ABC123");
  await user.type(screen.getByLabelText("주문 시 휴대전화 번호"), "01012345678");
  await user.click(screen.getByRole("button", { name: "주문 조회" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("주문 정보를 확인하지 못했습니다");
  expect(screen.getByLabelText("주문번호")).toHaveValue("VL-20260826-ABC123");
});

it("rejects malformed order numbers before submitting", async () => {
  const user = userEvent.setup();
  render(<GuestOrderLookupForm />);

  await user.type(screen.getByLabelText("주문번호"), "not-an-order");
  await user.type(screen.getByLabelText("주문 시 휴대전화 번호"), "01012345678");
  await user.click(screen.getByRole("button", { name: "주문 조회" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("주문번호와 주문 시 휴대전화 번호를 확인해 주세요");
  await waitFor(() => expect(lookupGuestOrderMock).not.toHaveBeenCalled());
});
