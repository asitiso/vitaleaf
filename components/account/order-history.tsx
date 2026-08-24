"use client";

import type { MemberOrder } from "../../lib/firebase/member-orders";

type OrderHistoryProps = {
  orders: MemberOrder[];
};

const formatWon = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

export function OrderHistory({ orders }: OrderHistoryProps) {
  if (orders.length === 0) {
    return <p>아직 주문 내역이 없습니다.</p>;
  }

  return (
    <ul aria-label="주문 내역">
      {orders.map((order) => (
        <li key={order.id}>
          <article>
            <h3>{order.orderNumber}</h3>
            <p>{order.createdAt ? order.createdAt.toLocaleDateString("ko-KR") : "주문 일시 확인 중"}</p>
            <p>{order.lines.map((line) => `${line.name} ${line.quantity}개`).join(", ")}</p>
            <p>결제 금액 {formatWon(order.total)}</p>
            <p>주문 접수</p>
          </article>
        </li>
      ))}
    </ul>
  );
}
