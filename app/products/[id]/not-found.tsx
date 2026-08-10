import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="product-detail-state">
      <span aria-hidden="true">404</span>
      <h1>상품을 찾을 수 없습니다</h1>
      <p>판매가 종료되었거나 잘못된 상품 주소입니다.</p>
      <Link href="/products">상품 목록으로 돌아가기</Link>
    </main>
  );
}
