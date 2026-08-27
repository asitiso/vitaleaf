"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { formatWon } from "../../lib/format";
import { lookupGuestOrder } from "../../lib/guest-orders/client";
import type { GuestOrderPublic } from "../../lib/guest-orders/types";

const ORDER_NUMBER_PATTERN = /^VL-\d{8}-[A-Z0-9]{6}$/u;

type GuestOrderLookupFormProps = {
  initialOrderNumber?: string;
};

type LookupState = "idle" | "submitting" | "success" | "error";

const formatPhoneForDisplay = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const formatReceivedDate = (receivedAt: string): string => new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeStyle: "short",
}).format(new Date(receivedAt));

export function GuestOrderLookupForm({ initialOrderNumber = "" }: GuestOrderLookupFormProps) {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<LookupState>("idle");
  const [error, setError] = useState("");
  const [order, setOrder] = useState<GuestOrderPublic | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const isSubmitting = state === "submitting";

  useEffect(() => {
    if (state === "success") resultHeadingRef.current?.focus();
  }, [state]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const submittedOrderNumber = orderNumber.trim();
    const submittedPhone = phone.trim();
    setError("");
    setOrder(null);
    if (!ORDER_NUMBER_PATTERN.test(submittedOrderNumber) || submittedPhone.length === 0) {
      setState("error");
      setError("주문번호와 주문 시 휴대전화 번호를 확인해 주세요.");
      return;
    }

    setState("submitting");
    try {
      const foundOrder = await lookupGuestOrder(submittedOrderNumber, submittedPhone);
      setOrder(foundOrder);
      setPhone("");
      setState("success");
    } catch {
      setState("error");
      setError("주문 정보를 확인하지 못했습니다. 주문번호와 휴대전화 번호를 다시 확인해 주세요.");
    }
  };

  return (
    <section className="guest-order-lookup" aria-labelledby="guest-order-lookup-heading">
      <header>
        <p>GUEST ORDER</p>
        <h1 id="guest-order-lookup-heading">비회원 주문조회</h1>
        <p>주문번호와 주문 시 입력한 휴대전화 번호로 주문 정보를 확인하세요.</p>
      </header>
      <form aria-label="비회원 주문 조회" noValidate onSubmit={submit}>
        <div className="guest-order-lookup__fields">
          <label>
            <span>주문번호</span>
            <input
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(event) => setOrderNumber(event.target.value.toUpperCase())}
              placeholder="VL-20260826-ABC123"
              required
              value={orderNumber}
            />
          </label>
          <label>
            <span>주문 시 휴대전화 번호</span>
            <input
              autoComplete="tel"
              inputMode="tel"
              onChange={(event) => setPhone(formatPhoneForDisplay(event.target.value))}
              placeholder="010-1234-5678"
              required
              type="tel"
              value={phone}
            />
          </label>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        <button disabled={isSubmitting} type="submit">{isSubmitting ? "조회 중" : "주문 조회"}</button>
      </form>
      {order ? (
        <section className="guest-order-lookup__result" aria-labelledby="guest-order-result-heading">
          <h2 id="guest-order-result-heading" ref={resultHeadingRef} tabIndex={-1}>주문 조회 결과</h2>
          <dl className="guest-order-lookup__overview">
            <div><dt>주문번호</dt><dd>{order.orderNumber}</dd></div>
            <div><dt>주문 상태</dt><dd>{order.status === "mock-received" ? "접수 완료" : order.status}</dd></div>
            <div><dt>접수 일시</dt><dd>{formatReceivedDate(order.receivedAt)}</dd></div>
          </dl>
          <section aria-labelledby="guest-order-items-heading">
            <h3 id="guest-order-items-heading">주문 상품</h3>
            <ul aria-label="주문 상품">
              {order.lines.map((line) => (
                <li key={line.productId}>
                  <p>{line.name}</p>
                  <span>{line.quantity}개 × {formatWon(line.unitPrice)}</span>
                  <strong>{formatWon(line.unitPrice * line.quantity)}</strong>
                </li>
              ))}
            </ul>
          </section>
          <dl className="guest-order-lookup__amounts">
            <div><dt>상품 금액</dt><dd>{formatWon(order.subtotal)}</dd></div>
            <div><dt>배송비</dt><dd>{formatWon(order.shippingFee)}</dd></div>
            <div><dt>총 결제 금액</dt><dd>{formatWon(order.total)}</dd></div>
          </dl>
          <dl className="guest-order-lookup__delivery">
            <div><dt>받는 분</dt><dd>{order.customerNameMasked}</dd></div>
            <div><dt>휴대전화 번호</dt><dd>{order.phoneMasked}</dd></div>
            <div><dt>배송지</dt><dd>{order.addressMasked}</dd></div>
          </dl>
        </section>
      ) : null}
    </section>
  );
}
