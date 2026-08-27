"use client";

import { Suspense, use } from "react";

import { LoginForm } from "../../components/auth/login-form";

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

function LoginPageContent({ searchParams }: LoginPageProps) {
  const { next } = use(searchParams);
  return <LoginForm next={typeof next === "string" ? next : null} />;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<main aria-busy="true"><p role="status">로그인 화면을 불러오는 중입니다.</p></main>}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}
