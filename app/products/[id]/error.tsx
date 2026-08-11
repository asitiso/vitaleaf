"use client";

import Link from "next/link";

type ProductErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ProductError({ reset }: ProductErrorProps) {
  return (
    <main className="product-detail-state">
      <span aria-hidden="true">VITALEAF</span>
      <div role="alert">
        <h1>상품 정보를 불러오지 못했습니다</h1>
        <p>잠시 후 다시 시도하거나 상품 목록에서 다른 상품을 확인해 주세요.</p>
      </div>
      <div className="product-detail-state__actions">
        <button type="button" onClick={reset}>다시 시도</button>
        <Link href="/products">상품 목록으로 돌아가기</Link>
      </div>
    </main>
  );
}
