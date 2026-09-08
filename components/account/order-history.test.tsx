import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import type { MemberOrder } from "../../lib/firebase/member-orders";
import { OrderHistory } from "./order-history";

const order = (overrides: Partial<MemberOrder> = {}): MemberOrder => ({
  id: "order-1",
  userId: "member-1",
  orderNumber: "VL-20260907-ABC123",
  status: "mock-received",
  isTestOrder: false,
  shippingCarrier: "",
  trackingNumber: "",
  statusUpdatedAt: null,
  statusUpdatedBy: "",
  paymentMethod: "card",
  customerName: "김회원",
  phone: "010-1234-5678",
  shippingAddress: { postcode: "06000", address: "서울시 강남구", addressDetail: "101호" },
  deliveryNote: "",
  lines: [{ productId: "leaf", name: "비타리프", quantity: 1, unitPrice: 20_000 }],
  subtotal: 20_000,
  shippingFee: 0,
  total: 20_000,
  createdAt: new Date("2026-09-07T00:00:00.000Z"),
  ...overrides,
});

it.each([
  ["preparing", "상품 준비"],
  ["shipped", "배송 중"],
  ["received", "접수"],
] as const)("shows the canonical Korean label for member status %s", (status, label) => {
  render(<OrderHistory orders={[order({ status: status as unknown as MemberOrder["status"] })]} />);

  expect(screen.getByText(label)).toBeVisible();
  expect(screen.queryByText(status)).not.toBeInTheDocument();
});

it.each([
  ["CJ대한통운", "1234567890", true],
  ["CJ대한통운", "", false],
  ["", "1234567890", false],
] as const)("shows shipped carrier and tracking only as a complete pair", (carrier, tracking, visible) => {
  render(<OrderHistory orders={[order({
    status: "shipped",
    shippingCarrier: carrier,
    trackingNumber: tracking,
  })]} />);

  const details = screen.queryByText(`${carrier} · ${tracking}`);
  if (visible) {
    expect(details).toBeVisible();
  } else {
    expect(details).not.toBeInTheDocument();
    if (carrier) expect(screen.queryByText(carrier, { exact: false })).not.toBeInTheDocument();
    if (tracking) expect(screen.queryByText(tracking, { exact: false })).not.toBeInTheDocument();
  }
});
