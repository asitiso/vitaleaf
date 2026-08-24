"use client";

import { type FormEvent, useRef, useState } from "react";

import type { DeliveryAddress, UserProfile, UserProfilePatch } from "../../lib/firebase/user-profile";

type ProfileFormProps = {
  email: string;
  mode?: "edit" | "repair";
  profile: UserProfile | null;
  onSave: (patch: UserProfilePatch) => Promise<void>;
};

type Field = "displayName" | "phone" | "recipient" | "addressPhone" | "postcode" | "address" | "addressDetail";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

const PHONE_PATTERN = /^010-?\d{4}-?\d{4}$/;
const POSTCODE_PATTERN = /^\d{5}$/;

const toValues = (profile: UserProfile | null): Values => ({
  displayName: profile?.displayName ?? "",
  phone: profile?.phone ?? "",
  recipient: profile?.defaultAddress?.recipient ?? "",
  addressPhone: profile?.defaultAddress?.phone ?? "",
  postcode: profile?.defaultAddress?.postcode ?? "",
  address: profile?.defaultAddress?.address ?? "",
  addressDetail: profile?.defaultAddress?.addressDetail ?? "",
});

const addressFields: Field[] = ["recipient", "addressPhone", "postcode", "address", "addressDetail"];

function validate(values: Values): Errors {
  const errors: Errors = {};
  if (!values.displayName) errors.displayName = "이름을 입력해 주세요.";
  if (values.phone && !PHONE_PATTERN.test(values.phone)) {
    errors.phone = "휴대전화 번호를 010-1234-5678 형식으로 입력해 주세요.";
  }

  const hasAddress = addressFields.some((field) => values[field]);
  if (!hasAddress) return errors;

  if (!values.recipient) errors.recipient = "받는 분을 입력해 주세요.";
  if (!values.addressPhone) errors.addressPhone = "배송지 연락처를 입력해 주세요.";
  if (!values.postcode) errors.postcode = "우편번호를 입력해 주세요.";
  if (!values.address) errors.address = "주소를 입력해 주세요.";
  if (!values.addressDetail) errors.addressDetail = "상세주소를 입력해 주세요.";
  if (values.addressPhone && !PHONE_PATTERN.test(values.addressPhone)) {
    errors.addressPhone = "휴대전화 번호를 010-1234-5678 형식으로 입력해 주세요.";
  }
  if (values.postcode && !POSTCODE_PATTERN.test(values.postcode)) {
    errors.postcode = "우편번호 5자리를 입력해 주세요.";
  }
  return errors;
}

function createAddress(values: Values): DeliveryAddress | null {
  if (!addressFields.some((field) => values[field])) return null;
  return {
    recipient: values.recipient,
    phone: values.addressPhone,
    postcode: values.postcode,
    address: values.address,
    addressDetail: values.addressDetail,
  };
}

export function ProfileForm({ email, mode = "edit", profile, onSave }: ProfileFormProps) {
  const [values, setValues] = useState<Values>(() => toValues(profile));
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [acceptedRepairTerms, setAcceptedRepairTerms] = useState(false);
  const savingRef = useRef(false);

  const updateValue = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;

    const normalized = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value.trim()]),
    ) as Values;
    const nextErrors = validate(normalized);
    setErrors(nextErrors);
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;
    if (mode === "repair" && !acceptedRepairTerms) {
      setMessage("회원 정보 복구를 위해 이용약관 및 개인정보 처리방침에 동의해 주세요.");
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    try {
      await onSave({
        displayName: normalized.displayName,
        phone: normalized.phone,
        defaultAddress: createAddress(normalized),
      });
      setValues(normalized);
      setMessage(mode === "repair" ? "회원 정보를 복구했습니다." : "회원 정보를 저장했습니다.");
    } catch {
      setMessage(mode === "repair"
        ? "회원 정보를 복구하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "회원 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const fieldError = (field: Field) => errors[field];

  return (
    <form aria-label="회원 정보 및 기본 배송지" noValidate onSubmit={submit}>
      <label>
        <span>이메일</span>
        <input aria-label="이메일" autoComplete="email" readOnly type="email" value={email} />
      </label>
      <label>
        <span>이름</span>
        <input aria-invalid={fieldError("displayName") ? "true" : undefined} aria-describedby={fieldError("displayName") ? "displayName-error" : undefined} autoComplete="name" onChange={(event) => updateValue("displayName", event.target.value)} value={values.displayName} />
        {fieldError("displayName") ? <small id="displayName-error">{fieldError("displayName")}</small> : null}
      </label>
      <label>
        <span>연락처</span>
        <input aria-invalid={fieldError("phone") ? "true" : undefined} aria-describedby={fieldError("phone") ? "phone-error" : undefined} autoComplete="tel" inputMode="numeric" onChange={(event) => updateValue("phone", event.target.value)} type="tel" value={values.phone} />
        {fieldError("phone") ? <small id="phone-error">{fieldError("phone")}</small> : null}
      </label>

      <fieldset>
        <legend>기본 배송지</legend>
        <p>배송지를 비워 두면 기본 배송지가 저장되지 않습니다.</p>
        <label>
          <span>받는 분</span>
          <input aria-invalid={fieldError("recipient") ? "true" : undefined} aria-describedby={fieldError("recipient") ? "recipient-error" : undefined} autoComplete="shipping name" onChange={(event) => updateValue("recipient", event.target.value)} value={values.recipient} />
          {fieldError("recipient") ? <small id="recipient-error">{fieldError("recipient")}</small> : null}
        </label>
        <label>
          <span>배송지 연락처</span>
          <input aria-invalid={fieldError("addressPhone") ? "true" : undefined} aria-describedby={fieldError("addressPhone") ? "addressPhone-error" : undefined} autoComplete="shipping tel" inputMode="numeric" onChange={(event) => updateValue("addressPhone", event.target.value)} type="tel" value={values.addressPhone} />
          {fieldError("addressPhone") ? <small id="addressPhone-error">{fieldError("addressPhone")}</small> : null}
        </label>
        <label>
          <span>우편번호</span>
          <input aria-invalid={fieldError("postcode") ? "true" : undefined} aria-describedby={fieldError("postcode") ? "postcode-error" : undefined} autoComplete="shipping postal-code" inputMode="numeric" onChange={(event) => updateValue("postcode", event.target.value)} value={values.postcode} />
          {fieldError("postcode") ? <small id="postcode-error">{fieldError("postcode")}</small> : null}
        </label>
        <label>
          <span>주소</span>
          <input aria-invalid={fieldError("address") ? "true" : undefined} aria-describedby={fieldError("address") ? "address-error" : undefined} autoComplete="shipping street-address" onChange={(event) => updateValue("address", event.target.value)} value={values.address} />
          {fieldError("address") ? <small id="address-error">{fieldError("address")}</small> : null}
        </label>
        <label>
          <span>상세주소</span>
          <input aria-invalid={fieldError("addressDetail") ? "true" : undefined} aria-describedby={fieldError("addressDetail") ? "addressDetail-error" : undefined} autoComplete="shipping address-line2" onChange={(event) => updateValue("addressDetail", event.target.value)} value={values.addressDetail} />
          {fieldError("addressDetail") ? <small id="addressDetail-error">{fieldError("addressDetail")}</small> : null}
        </label>
      </fieldset>
      {mode === "repair" ? (
        <label className="my-page__repair-consent">
          <input
            checked={acceptedRepairTerms}
            onChange={(event) => setAcceptedRepairTerms(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>이용약관 및 개인정보 처리방침에 동의하고 회원 정보를 복구합니다.</span>
        </label>
      ) : null}
      {message ? <p role={message.includes("못했습니다") || message.includes("동의해") ? "alert" : "status"}>{message}</p> : null}
      <button disabled={isSaving} type="submit">
        {isSaving
          ? mode === "repair" ? "회원 정보 복구 중" : "회원 정보 저장 중"
          : mode === "repair" ? "회원 정보 복구하기" : "회원 정보 저장"}
      </button>
    </form>
  );
}
