"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { formatWon } from "../../lib/format";
import type { GuestOrderPublic } from "../../lib/guest-orders/types";
import { type GuestInquiryAccess, verifyGuestInquiryAccess } from "../../lib/inquiries/client";
import { GuestInquiryPanel } from "../inquiries/guest-inquiry-panel";

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
  const [session, setSession] = useState<GuestInquiryAccess | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const request = useRef({ generation: 0, busy: false });
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const isSubmitting = state === "submitting";

  const expireSession = useCallback(() => {
    setSession(null);
    setPanelOpen(false);
    setSessionExpired(true);
  }, []);

  useEffect(() => {
    const current = request.current;
    return () => {
      current.generation += 1;
      current.busy = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const expiresAt = Date.parse(session.expiresAt);
    const checkExpiry = () => {
      if (Date.now() >= expiresAt) expireSession();
    };
    const timer = window.setTimeout(checkExpiry, Math.max(0, expiresAt - Date.now()));
    // Recheck after background tab suspension or a device clock change.
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [session, expireSession]);

  useEffect(() => {
    if (state === "success") resultHeadingRef.current?.focus();
  }, [state]);

  function cancelPendingLookup() {
    if (!request.current.busy) return;
    request.current.generation += 1;
    request.current.busy = false;
    setState("idle");
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.current.busy) return;

    const generation = ++request.current.generation;
    const submittedOrderNumber = orderNumber.trim();
    const submittedPhone = phone.trim();
    setError("");
    setOrder(null);
    setSession(null);
    setPanelOpen(false);
    setSessionExpired(false);
    if (!ORDER_NUMBER_PATTERN.test(submittedOrderNumber) || submittedPhone.length === 0) {
      setState("error");
      setError("주문번호와 주문 시 휴대전화 번호를 확인해 주세요.");
      return;
    }

    request.current.busy = true;
    setState("submitting");
    try {
      const verified = await verifyGuestInquiryAccess(submittedOrderNumber, submittedPhone);
      if (generation !== request.current.generation) return;
      if (verified.order.orderNumber !== submittedOrderNumber) throw new Error("Invalid order verification");
      setOrder(verified.order);
      setPhone("");
      setState("success");
      if (Date.parse(verified.expiresAt) <= Date.now()) expireSession();
      else setSession(verified);
    } catch {
      if (generation !== request.current.generation) return;
      setState("error");
      setError("주문 정보를 확인하지 못했습니다. 주문번호와 휴대전화 번호를 다시 확인해 주세요.");
    } finally {
      if (generation === request.current.generation) request.current.busy = false;
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
              onChange={(event) => {
                cancelPendingLookup();
                setOrderNumber(event.target.value.toUpperCase());
              }}
              placeholder="VL-20260826-ABC123"
              required
              value={orderNumber}
            />
          </label>
          <label>
            <span>주문 시 휴대전화 번호</span>
            <input
              autoComplete="off"
              inputMode="tel"
              onChange={(event) => {
                cancelPendingLookup();
                setPhone(formatPhoneForDisplay(event.target.value));
              }}
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
      {sessionExpired ? <p className="guest-inquiry-notice" role="alert">문의 인증이 만료되었습니다. 주문을 다시 조회해 주세요.</p> : null}
      {session ? (
        <button
          aria-expanded={panelOpen}
          className="inquiry-button guest-inquiry-entry"
          onClick={() => {
            if (Date.parse(session.expiresAt) <= Date.now()) expireSession();
            else setPanelOpen(true);
          }}
          type="button"
        >
          이 주문으로 1:1 문의하기
        </button>
      ) : null}
      {session && panelOpen ? (
        <GuestInquiryPanel
          access={{ kind: "guest", token: session.accessToken }}
          orderNumber={session.order.orderNumber}
          onAccessExpired={expireSession}
        />
      ) : null}
    </section>
  );
}
