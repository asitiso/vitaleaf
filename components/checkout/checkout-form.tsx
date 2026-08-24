"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";

import { type AuthStatus, useAuth } from "../../features/auth/auth-context";
import { useCart } from "../../features/cart/cart-context";
import type { MemberIdentity } from "../../lib/firebase/member-auth";
import { createMemberOrder } from "../../lib/firebase/member-orders";
import { getUserProfile, type UserProfile, updateUserProfile } from "../../lib/firebase/user-profile";
import { processPayment, type OrderDraft } from "../../lib/payment/process-payment";

type RequiredField = "customerName" | "phone" | "postcode" | "address" | "addressDetail";
type FormErrors = Partial<Record<RequiredField, string>>;
type DeliveryValues = Record<RequiredField, string>;

const REQUIRED_FIELDS: RequiredField[] = [
  "customerName",
  "phone",
  "postcode",
  "address",
  "addressDetail",
];
const KOREAN_MOBILE_PHONE = /^010-?\d{4}-?\d{4}$/;
const KOREAN_POSTCODE = /^\d{5}$/;

const FIELD_LABELS: Record<RequiredField, string> = {
  customerName: "받는 분",
  phone: "연락처",
  postcode: "우편번호",
  address: "주소",
  addressDetail: "상세주소",
};

const EMPTY_DELIVERY_VALUES: DeliveryValues = {
  customerName: "",
  phone: "",
  postcode: "",
  address: "",
  addressDetail: "",
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
  const { error: authError, retryAuth, status, user } = useAuth();
  const member = status === "signed-in" && user ? user : null;
  const memberUid = member?.uid ?? null;
  const [session, setSession] = useState<{ generation: number; principal: string | null | undefined }>({
    generation: 0,
    principal: undefined,
  });
  const nextSession = deriveCheckoutSession(session, status, memberUid);
  if (nextSession !== session) setSession(nextSession);

  const authStateKey = `${status}:${memberUid ?? "none"}:${authError}`;
  const [guestChoice, setGuestChoice] = useState({ allowed: false, authStateKey });
  const nextGuestChoice = guestChoice.authStateKey === authStateKey
    ? guestChoice
    : { allowed: false, authStateKey };
  if (nextGuestChoice !== guestChoice) setGuestChoice(nextGuestChoice);

  const retryAuthentication = () => {
    setGuestChoice({ allowed: false, authStateKey });
    retryAuth();
  };

  return (
    <CheckoutFormContents
      allowGuestOnAuthError={nextGuestChoice.allowed}
      authError={authError}
      authStatus={status}
      key={`checkout-session:${nextSession.generation}`}
      member={member}
      onContinueAsGuest={() => setGuestChoice({ allowed: true, authStateKey })}
      onRetryAuth={retryAuthentication}
    />
  );
}

function deriveCheckoutSession(
  session: { generation: number; principal: string | null | undefined },
  status: AuthStatus,
  memberUid: string | null,
) {
  if (session.principal === undefined) {
    return status === "checking" ? session : { ...session, principal: memberUid };
  }
  if (memberUid) {
    if (session.principal === memberUid) return session;
    return {
      generation: session.principal ? session.generation + 1 : session.generation,
      principal: memberUid,
    };
  }
  if (status !== "signed-out" && status !== "error") return session;
  if (session.principal === null) return session;
  return {
    generation: session.principal ? session.generation + 1 : session.generation,
    principal: null,
  };
}

type CheckoutFormContentsProps = {
  allowGuestOnAuthError: boolean;
  authError: string;
  authStatus: AuthStatus;
  member: MemberIdentity | null;
  onContinueAsGuest: () => void;
  onRetryAuth: () => void;
};

function CheckoutFormContents({
  allowGuestOnAuthError,
  authError,
  authStatus,
  member,
  onContinueAsGuest,
  onRetryAuth,
}: CheckoutFormContentsProps) {
  const router = useRouter();
  const { lines, hasHydrated, subtotal, shippingFee, total, clearSubmitted } = useCart();
  const memberUid = member?.uid ?? null;
  const [errors, setErrors] = useState<FormErrors>({});
  const [delivery, setDelivery] = useState<DeliveryValues>(EMPTY_DELIVERY_VALUES);
  const [saveDefaultAddress, setSaveDefaultAddress] = useState({ uid: null as string | null, selected: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submittingRef = useRef(false);
  const editedDeliveryFieldsRef = useRef<Set<RequiredField>>(new Set());
  const profileRef = useRef<UserProfile | null>(null);
  const fieldRefs = useRef<Partial<Record<RequiredField, HTMLInputElement>>>({});
  const selectedLines = lines.filter((line) => line.selected);
  const unavailableSelectedLines = selectedLines.filter((line) => line.stock < 1);
  const hasUnavailableItems = unavailableSelectedLines.length > 0;
  const shouldSaveDefaultAddress = saveDefaultAddress.uid === memberUid && saveDefaultAddress.selected;

  useEffect(() => {
    profileRef.current = null;
    if (!memberUid) return;

    let active = true;
    void getUserProfile(memberUid).then((profile) => {
      if (!active) return;
      profileRef.current = profile;
      if (!profile?.defaultAddress) return;
      const savedDelivery: DeliveryValues = {
        customerName: profile.defaultAddress.recipient,
        phone: profile.defaultAddress.phone,
        postcode: profile.defaultAddress.postcode,
        address: profile.defaultAddress.address,
        addressDetail: profile.defaultAddress.addressDetail,
      };
      setDelivery((current) => {
        const next = { ...current };
        for (const field of REQUIRED_FIELDS) {
          if (!editedDeliveryFieldsRef.current.has(field) && !current[field]) {
            next[field] = savedDelivery[field];
          }
        }
        return next;
      });
    }, () => {
      // A saved delivery address is an optional convenience, so checkout remains available.
    });

    return () => {
      active = false;
    };
  }, [memberUid]);

  const changeDelivery = (field: RequiredField) => (event: ChangeEvent<HTMLInputElement>) => {
    editedDeliveryFieldsRef.current.add(field);
    const value = event.currentTarget.value;
    setDelivery((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    if (authStatus === "checking" || (authStatus === "error" && !allowGuestOnAuthError)) {
      return;
    }
    if (hasUnavailableItems) {
      setSubmitError("품절 상품을 장바구니에서 제외한 뒤 다시 시도해 주세요.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const values: DeliveryValues = {
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
    const submittedLines = selectedLines.map((line) => ({ ...line }));
    const orderDraft: OrderDraft = {
      ...values,
      deliveryNote: readText(formData, "deliveryNote"),
      paymentMethod,
      lines: submittedLines,
      subtotal,
      shippingFee,
      total,
    };

    try {
      const result = await processPayment(orderDraft);
      if (member) {
        try {
          await createMemberOrder(member.uid, orderDraft, result);
        } catch {
          setSubmitError("주문 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
      }

      let addressSaved = true;
      if (member && shouldSaveDefaultAddress) {
        try {
          const profile = profileRef.current ?? await getUserProfile(member.uid);
          await updateUserProfile(member.uid, {
            displayName: profile?.displayName || values.customerName,
            phone: profile?.phone || values.phone,
            defaultAddress: {
              recipient: values.customerName,
              phone: values.phone,
              postcode: values.postcode,
              address: values.address,
              addressDetail: values.addressDetail,
            },
          });
        } catch {
          addressSaved = false;
        }
      }
      clearSubmitted(submittedLines);
      const query = new URLSearchParams({ orderNumber: result.orderNumber });
      if (!addressSaved) query.set("addressSaved", "0");
      router.push(`/order-complete?${query.toString()}`);
    } catch {
      setSubmitError("결제를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!hasHydrated) {
    return (
      <main className="checkout-empty checkout-loading" aria-busy="true">
        <p>VITALEAF CHECKOUT</p>
        <p role="status">주문 정보를 불러오는 중입니다.</p>
      </main>
    );
  }

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
                  <span>
                    {FIELD_LABELS[field]}
                    <em aria-hidden="true">필수</em>
                  </span>
                  <input
                    ref={(element) => {
                      if (element) fieldRefs.current[field] = element;
                    }}
                    name={field}
                    aria-label={FIELD_LABELS[field]}
                    required
                    aria-required="true"
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
                    value={delivery[field]}
                    onChange={changeDelivery(field)}
                  />
                  {errors[field] ? <small id={`${field}-error`}>{errors[field]}</small> : null}
                </label>
              ))}
              <label className="checkout-field checkout-field--wide">
                <span>배송 요청사항 (선택)</span>
                <textarea name="deliveryNote" rows={3} />
              </label>
              {member ? (
                <label className="checkout-save-address">
                  <input
                    checked={shouldSaveDefaultAddress}
                    onChange={(event) => setSaveDefaultAddress({ uid: memberUid, selected: event.currentTarget.checked })}
                    type="checkbox"
                  />
                  이 배송지를 기본 배송지로 저장
                </label>
              ) : null}
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
          {hasUnavailableItems ? (
            <div className="checkout-form__stock-error">
              <div role="alert">
                <strong>품절 상품이 포함되어 결제할 수 없습니다.</strong>
                <span>{unavailableSelectedLines.map((line) => line.name).join(", ")}</span>
              </div>
              <Link href="/cart">장바구니에서 확인하기</Link>
            </div>
          ) : null}
          {submitError ? <p className="checkout-form__submit-error" role="alert">{submitError}</p> : null}
          {authStatus === "error" ? (
            <div className="checkout-auth-error" role="alert">
              <p>{authError || "로그인 상태를 확인하지 못했습니다. 다시 확인하거나 비회원 결제를 선택해 주세요."}</p>
              <div>
                <button onClick={onRetryAuth} type="button">인증 다시 확인</button>
                <button disabled={allowGuestOnAuthError} onClick={onContinueAsGuest} type="button">
                  {allowGuestOnAuthError ? "비회원 결제 선택됨" : "비회원으로 계속하기"}
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting || hasUnavailableItems || authStatus === "checking" || (authStatus === "error" && !allowGuestOnAuthError)}
          >
            {isSubmitting ? "결제 처리 중" : "결제하기"}
          </button>
          <small>{member
            ? "회원 주문 정보는 주문내역에 저장됩니다."
            : authStatus === "error" && !allowGuestOnAuthError
              ? "인증 상태를 선택한 뒤 결제를 진행할 수 있습니다."
              : "개인정보와 주문 정보는 저장되지 않습니다."}</small>
        </aside>
      </form>
    </main>
  );
}
