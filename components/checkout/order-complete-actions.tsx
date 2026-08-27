"use client";

import Link from "next/link";

import { useAuth } from "../../features/auth/auth-context";
import { STOREFRONT_DESTINATIONS } from "../../lib/navigation/storefront-menu";

type OrderCompleteActionsProps = {
  guest?: boolean;
  orderNumber?: string | null;
};

const ORDER_NUMBER_PATTERN = /^VL-\d{8}-[A-Z0-9]{6}$/u;

export function OrderCompleteActions({ guest = false, orderNumber = null }: OrderCompleteActionsProps) {
  const { status, user } = useAuth();
  const isMember = status === "signed-in" && user !== null;
  const guestLookupHref = !isMember && guest && orderNumber && ORDER_NUMBER_PATTERN.test(orderNumber)
    ? `${STOREFRONT_DESTINATIONS.orderLookup.href}?orderNumber=${encodeURIComponent(orderNumber)}`
    : null;

  return (
    <div className="order-complete__actions">
      <Link href="/products">상품 계속 보기</Link>
      <Link href="/cart">장바구니 확인</Link>
      {guestLookupHref ? <Link href={guestLookupHref}>비회원 주문조회</Link> : null}
      {isMember ? <Link href="/mypage#orders-heading">주문내역 보기</Link> : null}
    </div>
  );
}
