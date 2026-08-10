"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import { useCart } from "../../features/cart/cart-context";
import { processPayment, type OrderDraft } from "../../lib/payment/process-payment";

type RequiredField = "customerName" | "phone" | "postcode" | "address" | "addressDetail";
type FormErrors = Partial<Record<RequiredField, string>>;

const REQUIRED_FIELDS: RequiredField[] = [
  "customerName",
  "phone",
  "postcode",
  "address",
  "addressDetail",
];
const KOREAN_MOBILE_PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;
const KOREAN_POSTCODE = /^\d{5}$/;

const FIELD_LABELS: Record<RequiredField, string> = {
  customerName: "받는 분",
  phone: "연락처",
  postcode: "우편번호",
  address: "주소",
  addressDetail: "상세주소",
};

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function readText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validateOrder(values: Record<RequiredField, string>) {
  const errors: FormErrors = {};

  for (const field of REQUIRED_FIELDS) {
    if (!values[field]) {
      errors[field] = `${FIELD_LABELS[field]}${field === "customerName" ? "을" : "를"} 입력해 주세요.`;
    }
  }

  if (values.phone && !KOREAN_MOBILE_PHONE.test(values.phone)) {
    errors.phone = "휴대전화 번호를 010-1234-5678 형식으로 입력해 주세요.";
  }
  if (values.postcode && !KOREAN_POSTCODE.test(values.postcode)) {
    errors.postcode = "우편번호 5자리를 입력해 주세요.";
  }

  return errors;
}

export function CheckoutForm() {
  const router = useRouter();
  const { lines, subtotal, shippingFee, total, clearSelected } = useCart();
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submittingRef = useRef(false);
  const fieldRefs = useRef<Partial<Record<RequiredField, HTMLInputElement>>>({});
  const selectedLines = lines.filter((line) => line.selected);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const values: Record<RequiredField, string> = {
      customerName: readText(formData, "customerName"),
      phone: readText(formData, "phone"),
      postcode: readText(formData, "postcode"),
      address: readText(formData, "address"),
      addressDetail: readText(formData, "addressDetail"),
    };
    const nextErrors = validateOrder(values);
    setErrors(nextErrors);
    setSubmitError("");

    const firstInvalidField = REQUIRED_FIELDS.find((field) => nextErrors[field]);
    if (firstInvalidField) {
      fieldRefs.current[firstInvalidField]?.focus();
      return;
    }
    if (selectedLines.length === 0) {
      setSubmitError("결제할 상품이 없습니다. 장바구니에서 상품을 선택해 주세요.");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    const paymentMethod = readText(formData, "paymentMethod") as OrderDraft["paymentMethod"];
    const orderDraft: OrderDraft = {
      ...values,
      deliveryNote: readText(formData, "deliveryNote"),
      paymentMethod,
      lines: selectedLines,
      subtotal,
      shippingFee,
      total,
    };

    try {
      const result = await processPayment(orderDraft);
      clearSelected();
      router.push(`/order-complete?orderNumber=${encodeURIComponent(result.orderNumber)}`);
    } catch {
      setSubmitError("결제를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (selectedLines.length === 0) {
    return (
      <main className="checkout-empty">
        <p>VITALEAF CHECKOUT</p>
        <h1>결제할 상품이 없습니다</h1>
        <p>장바구니에서 주문할 상품을 선택해 주세요.</p>
        <Link href="/cart">장바구니로 돌아가기</Link>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <header className="checkout-page__heading">
        <p>VITALEAF CHECKOUT</p>
        <h1>주문 및 결제</h1>
        <span>배송 정보와 결제 수단을 확인해 주세요.</span>
      </header>

      <form className="checkout-form" aria-label="주문 및 결제" noValidate onSubmit={handleSubmit}>
        <div className="checkout-form__fields">
          <section className="checkout-card" aria-labelledby="delivery-heading">
            <h2 id="delivery-heading">배송 정보</h2>
            <div className="checkout-form__grid">
              {REQUIRED_FIELDS.map((field) => (
                <label
                  key={field}
                  className={field === "address" || field === "addressDetail" ? "checkout-field checkout-field--wide" : "checkout-field"}
                >
                  <span>{FIELD_LABELS[field]}</span>
                  <input
                    ref={(element) => {
                      if (element) fieldRefs.current[field] = element;
                    }}
                    name={field}
                    aria-label={FIELD_LABELS[field]}
                    type={field === "phone" ? "tel" : "text"}
                    inputMode={field === "phone" || field === "postcode" ? "numeric" : undefined}
                    autoComplete={
                      field === "customerName"
                        ? "name"
                        : field === "phone"
                          ? "tel"
                          : field === "postcode"
                            ? "postal-code"
                            : field === "address"
                              ? "street-address"
                              : "address-line2"
                    }
                    aria-invalid={errors[field] ? "true" : undefined}
                    aria-describedby={errors[field] ? `${field}-error` : undefined}
                  />
                  {errors[field] ? <small id={`${field}-error`}>{errors[field]}</small> : null}
                </label>
              ))}
              <label className="checkout-field checkout-field--wide">
                <span>배송 요청사항 (선택)</span>
                <textarea name="deliveryNote" rows={3} />
              </label>
            </div>
          </section>

          <fieldset className="checkout-card checkout-payment">
            <legend>결제 수단</legend>
            <label><input type="radio" name="paymentMethod" value="card" defaultChecked /> 카드 결제</label>
            <label><input type="radio" name="paymentMethod" value="bank" /> 계좌이체</label>
            <label><input type="radio" name="paymentMethod" value="easy" /> 간편결제</label>
            <p>현재는 실제 승인이나 출금 없이 주문 흐름만 확인하는 목업 결제입니다.</p>
          </fieldset>
        </div>

        <aside className="checkout-summary" aria-labelledby="checkout-summary-heading">
          <h2 id="checkout-summary-heading">주문 요약</h2>
          <ul>
            {selectedLines.map((line) => (
              <li key={line.productId}>
                <span>{line.name} × {line.quantity}</span>
                <strong>{formatWon(line.unitPrice * line.quantity)}</strong>
              </li>
            ))}
          </ul>
          <dl>
            <div><dt>상품 금액</dt><dd>{formatWon(subtotal)}</dd></div>
            <div><dt>배송비</dt><dd>{formatWon(shippingFee)}</dd></div>
            <div className="checkout-summary__total"><dt>총 결제 금액</dt><dd>{formatWon(total)}</dd></div>
          </dl>
          {submitError ? <p className="checkout-form__submit-error" role="alert">{submitError}</p> : null}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "결제 처리 중" : "결제하기"}
          </button>
          <small>개인정보와 주문 정보는 저장되지 않습니다.</small>
        </aside>
      </form>
    </main>
  );
}
