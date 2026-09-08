"use client";

import Link from "next/link";

import type { MemberOrder } from "../../lib/firebase/member-orders";
import { normalizeOrderStatus, ORDER_STATUS_LABELS } from "../../lib/orders/operations";

type OrderHistoryProps = {
  orders: MemberOrder[];
};

const formatWon = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

export function OrderHistory({ orders }: OrderHistoryProps) {
  if (orders.length === 0) {
    return (
      <p>
        아직 주문 내역이 없습니다. <Link href="/products">상품 둘러보기</Link>
      </p>
    );
  }

  return (
    <ul aria-label="주문 내역">
      {orders.map((order) => {
        const status = normalizeOrderStatus(order.status);
        const hasShippingDetails = status === "shipped"
          && Boolean(order.shippingCarrier)
          && Boolean(order.trackingNumber);
        return (
          <li key={order.id}>
            <article>
              <h3>{order.orderNumber}</h3>
              <p>{order.createdAt ? order.createdAt.toLocaleDateString("ko-KR") : "주문 일시 확인 중"}</p>
              <p>{order.lines.map((line) => `${line.name} ${line.quantity}개`).join(", ")}</p>
              <p>결제 금액 {formatWon(order.total)}</p>
              <p>{ORDER_STATUS_LABELS[status]}</p>
              {hasShippingDetails ? <p>{order.shippingCarrier} · {order.trackingNumber}</p> : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
