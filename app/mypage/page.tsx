"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { MyPage } from "../../components/account/my-page";

function MyPageContent() {
  const searchParams = useSearchParams();
  return <MyPage notice={searchParams.get("notice")} />;
}

export default function MyPageRoute() {
  return (
    <Suspense fallback={<main aria-busy="true"><p role="status">마이페이지를 불러오는 중입니다.</p></main>}>
      <MyPageContent />
    </Suspense>
  );
}
