"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type LoginFormProps = {
  next?: string | null;
};

const isValidEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const signupNext = next ?? "/mypage";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const normalizedEmail = email.trim();
    setError("");
    setNotice("");
    if (!isValidEmail(normalizedEmail) || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { memberAuth, safeReturnPath } = await import("../../lib/firebase/member-auth");
      await memberAuth.signIn(normalizedEmail, password);
      router.push(safeReturnPath(next));
    } catch (reason) {
      const message = await import("../../lib/firebase/member-auth")
        .then(({ getMemberAuthErrorMessage }) => getMemberAuthErrorMessage(reason))
        .catch(() => "인증 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendReset = async () => {
    const normalizedEmail = email.trim();
    setError("");
    setNotice("");
    if (!isValidEmail(normalizedEmail)) {
      setError("비밀번호 재설정 메일을 받으려면 올바른 이메일을 입력해 주세요.");
      return;
    }

    setIsResetting(true);
    try {
      const { memberAuth } = await import("../../lib/firebase/member-auth");
      await memberAuth.sendPasswordReset(normalizedEmail);
      setNotice("비밀번호 재설정 메일을 보냈습니다. 받은편지함을 확인해 주세요.");
    } catch (reason) {
      const message = await import("../../lib/firebase/member-auth")
        .then(({ getMemberAuthErrorMessage }) => getMemberAuthErrorMessage(reason))
        .catch(() => "인증 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setError(message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="member-auth-page">
      <section className="member-auth-card" aria-labelledby="login-heading">
        <p className="member-auth-card__eyebrow">VITALEAF MEMBER</p>
        <h1 id="login-heading">로그인</h1>
        <p>회원 주문과 배송 정보를 편리하게 확인하세요. 비회원 주문도 계속 이용할 수 있습니다.</p>
        <form aria-label="로그인" noValidate onSubmit={handleSubmit}>
          <label>
            <span>이메일</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>비밀번호</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="member-auth-card__error" role="alert">{error}</p> : null}
          {notice ? <p className="member-auth-card__notice" role="status">{notice}</p> : null}
          <button type="submit" disabled={isSubmitting || isResetting}>
            {isSubmitting ? "로그인 중" : "로그인"}
          </button>
        </form>
        <button className="member-auth-card__text-button" disabled={isSubmitting || isResetting} onClick={sendReset} type="button">
          {isResetting ? "재설정 메일 보내는 중" : "비밀번호 재설정 메일 보내기"}
        </button>
        <p className="member-auth-card__footer">
          아직 회원이 아니신가요? <Link href={`/signup?next=${encodeURIComponent(signupNext)}`}>회원가입</Link>
        </p>
      </section>
    </main>
  );
}
