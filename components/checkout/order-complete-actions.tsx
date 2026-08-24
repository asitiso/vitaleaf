"use client";

import Link from "next/link";

import { useAuth } from "../../features/auth/auth-context";

export function OrderCompleteActions() {
  const { status, user } = useAuth();
  const isMember = status === "signed-in" && user !== null;

  return (
    <div className="order-complete__actions">
      <Link href="/products">상품 계속 보기</Link>
      <Link href="/cart">장바구니 확인</Link>
      {isMember ? <Link href="/mypage#orders-heading">주문내역 보기</Link> : null}
    </div>
  );
}
