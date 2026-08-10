import Link from "next/link";

type OrderCompletePageProps = {
  searchParams: Promise<{ orderNumber?: string | string[] }>;
};

const ORDER_NUMBER_PATTERN = /^VL-\d{8}-[A-Z0-9]{6}$/;

export default async function OrderCompletePage({ searchParams }: OrderCompletePageProps) {
  const params = await searchParams;
  const candidate = typeof params.orderNumber === "string" ? params.orderNumber : "";
  const orderNumber = ORDER_NUMBER_PATTERN.test(candidate) ? candidate : null;

  return (
    <main className="order-complete">
      <p className="order-complete__eyebrow">ORDER COMPLETE</p>
      <h1>주문이 접수되었습니다</h1>
      <p>VITALEAF를 이용해 주셔서 감사합니다.</p>
      {orderNumber ? (
        <dl>
          <div><dt>주문번호</dt><dd>{orderNumber}</dd></div>
        </dl>
      ) : (
        <p className="order-complete__notice">주문번호는 결제 완료 직후 화면에서 확인할 수 있습니다.</p>
      )}
      <p className="order-complete__mock-notice">목업 결제로 실제 승인이나 출금은 발생하지 않았습니다.</p>
      <div className="order-complete__actions">
        <Link href="/products">상품 계속 보기</Link>
        <Link href="/cart">장바구니 확인</Link>
      </div>
    </main>
  );
}
