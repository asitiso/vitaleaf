"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

const isValidEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);

export function SignupForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const normalizedName = displayName.trim();
    const normalizedEmail = email.trim();
    setError("");
    setNotice("");

    if (!normalizedName) {
      setError("이름을 입력해 주세요.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    if (password !== confirmation) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (!acceptedTerms) {
      setError("이용약관에 동의해 주세요.");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const { memberAuth, validateMemberPassword } = await import("../../lib/firebase/member-auth");
      const passwordError = validateMemberPassword(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }

      const identity = await memberAuth.signUp(normalizedEmail, password);
      try {
        const { createUserProfile } = await import("../../lib/firebase/user-profile");
        await createUserProfile({
          uid: identity.uid,
          email: identity.email,
          displayName: normalizedName,
          termsAcceptedAt: new Date(),
        });
      } catch (reason) {
        try {
          await memberAuth.removeCurrent();
        } catch {
          // The primary profile error remains more useful to the member.
        }
        throw reason;
      }

      let verificationFailed = false;
      try {
        await memberAuth.sendVerification();
      } catch {
        verificationFailed = true;
        setNotice("인증 메일을 보내지 못했습니다. 마이페이지에서 다시 요청해 주세요.");
      }
      router.push(verificationFailed ? "/mypage?notice=verification-email-failed" : "/mypage");
    } catch (reason) {
      const message = await import("../../lib/firebase/member-auth")
        .then(({ getMemberAuthErrorMessage }) => getMemberAuthErrorMessage(reason))
        .catch(() => "인증 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setError(message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className="member-auth-page">
      <section className="member-auth-card" aria-labelledby="signup-heading">
        <p className="member-auth-card__eyebrow">VITALEAF MEMBER</p>
        <h1 id="signup-heading">회원가입</h1>
        <p>간단히 가입하고 주문 내역과 배송 정보를 한곳에서 관리하세요.</p>
        <form aria-label="회원가입" noValidate onSubmit={handleSubmit}>
          <label>
            <span>이름</span>
            <input autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} required type="text" value={displayName} />
          </label>
          <label>
            <span>이메일</span>
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            <span>비밀번호</span>
            <input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <label>
            <span>비밀번호 확인</span>
            <input autoComplete="new-password" onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
          </label>
          <label className="member-auth-card__terms">
            <input checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required type="checkbox" />
            <span>이용약관 및 개인정보 처리방침에 동의합니다. (필수)</span>
          </label>
          {error ? <p className="member-auth-card__error" role="alert">{error}</p> : null}
          {notice ? <p className="member-auth-card__notice" role="status">{notice}</p> : null}
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? "회원가입 중" : "회원가입"}</button>
        </form>
        <p className="member-auth-card__footer">이미 회원이신가요? <Link href="/login">로그인</Link></p>
      </section>
    </main>
  );
}
