"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { LoginForm } from "../../components/auth/login-form";

function LoginPageContent() {
  const searchParams = useSearchParams();
  return <LoginForm next={searchParams.get("next")} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main aria-busy="true"><p role="status">로그인 화면을 불러오는 중입니다.</p></main>}>
      <LoginPageContent />
    </Suspense>
  );
}
