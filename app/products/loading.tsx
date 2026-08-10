import { ProductGrid } from "../../components/commerce/product-grid";

export default function ProductsLoading() {
  return (
    <main className="products-page" aria-busy="true">
      <header className="products-page__header">
        <p>VITALEAF SHOP</p>
        <h1>상품을 준비하고 있습니다</h1>
        <span>원료와 기능성 정보를 함께 불러오는 중입니다.</span>
      </header>
      <ProductGrid status="loading" products={[]} />
    </main>
  );
}
