import Link from "next/link";

import { ProductGrid } from "../components/commerce/product-grid";
import { getServerProducts } from "../lib/firebase/server-read";
import { TRIAL_MAX_PRICE_WON } from "../lib/navigation/menu-state";
import { STOREFRONT_DESTINATIONS, STOREFRONT_MENU } from "../lib/navigation/storefront-menu";
import { SAMPLE_PRODUCTS } from "../lib/products/sample-products";
import type { Product } from "../lib/products/types";
import { formatFreeShippingCondition, STORE_POLICIES } from "../lib/site/policies";

const byRank = (left: Product, right: Product) =>
  (left.salesRank ?? Number.POSITIVE_INFINITY) - (right.salesRank ?? Number.POSITIVE_INFINITY);

const byNewest = (left: Product, right: Product) =>
  (right.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
  (left.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY);

function HomePromoCards({ placement }: { placement: "desktop" | "mobile" }) {
  const label = placement === "mobile" ? "모바일 구매 혜택" : "데스크톱 구매 혜택";

  return (
    <section className={`home-promo-stack home-promo-stack--${placement}`} aria-label={label}>
      <Link className="home-promo-card home-promo-card--coupon" href={STOREFRONT_DESTINATIONS.trial.href}>
        <span>WELCOME BENEFIT</span>
        <strong>{TRIAL_MAX_PRICE_WON.toLocaleString("ko-KR")}원 이하 첫 구매 추천</strong>
        <small>부담 없이 시작하는 건강 루틴</small>
      </Link>
      <Link className="home-promo-card home-promo-card--delivery" href={STOREFRONT_DESTINATIONS.inStock.href}>
        <span>DAILY DELIVERY</span>
        <strong>{STORE_POLICIES.shipping.dispatch}</strong>
        <small>{formatFreeShippingCondition()}</small>
      </Link>
    </section>
  );
}

export default async function Home() {
  let products: Product[] = [];
  let isSampleCatalog = false;

  try {
    products = await getServerProducts();
    if (products.length === 0) {
      products = SAMPLE_PRODUCTS;
      isSampleCatalog = true;
    }
  } catch {
    products = SAMPLE_PRODUCTS;
    isSampleCatalog = true;
  }

  const bestProducts = products
    .filter((product) => product.salesRank !== null || product.isBest)
    .sort(byRank)
    .slice(0, 4);
  const newProducts = products.filter((product) => product.isNew).sort(byNewest).slice(0, 4);

  return (
    <main className="home-page">
      <section className="home-promotions" aria-label="주요 혜택">
        <div className="home-hero">
          <p className="home-hero__eyebrow">매일의 기본을 제대로</p>
          <h1>하루 한 번, <br />기초 건강을 빈틈없이</h1>
          <p>필요한 기능성과 함량을 확인하고 내 생활에 맞는 건강 루틴을 시작하세요.</p>
          <Link className="home-hero__action" href={STOREFRONT_DESTINATIONS.products.href}>기초 건강 상품 보기 <span aria-hidden="true">→</span></Link>
        </div>
        <HomePromoCards placement="desktop" />
      </section>

      <section className="home-trust-bar" aria-label="바이타리프 품질 원칙">
        <div><strong>식약처 인정</strong><span>기능성 원료 기준 확인</span></div>
        <div><strong>GMP 제조</strong><span>안전한 제조 환경</span></div>
        <div><strong>투명한 표기</strong><span>원산지와 함량 공개</span></div>
        <div><strong>품질 검사</strong><span>출고 전 기준 검토</span></div>
      </section>

      {isSampleCatalog ? <p className="sample-catalog-notice">샘플 상품으로 쇼핑몰 기능을 미리 확인하고 있습니다.</p> : null}

      <>
          <section className="home-product-section" aria-labelledby="best-products-title">
            <div className="home-section-heading">
              <div><p>DAILY RANKING</p><h2 id="best-products-title">오늘의 베스트</h2></div>
              <nav className="home-age-tabs" aria-label="연령대별 베스트 탐색">
                <Link href={STOREFRONT_DESTINATIONS.best.href}>전체</Link>
                {STOREFRONT_MENU.ages.map((age) => (
                  <Link key={age.key} href={age.href}>{age.label}</Link>
                ))}
              </nav>
              <Link className="home-section-heading__more" href={STOREFRONT_DESTINATIONS.best.href}>전체 보기</Link>
            </div>
            <ProductGrid status={bestProducts.length ? "ready" : "empty"} products={bestProducts} showRanks />
          </section>

          <HomePromoCards placement="mobile" />

          <section className="home-product-section" aria-labelledby="new-products-title">
            <div className="home-section-heading">
              <div><p>JUST ARRIVED</p><h2 id="new-products-title">새로 들어왔어요</h2></div>
              <Link className="home-section-heading__more" href={STOREFRONT_DESTINATIONS.newest.href}>전체 보기</Link>
            </div>
            <ProductGrid status={newProducts.length ? "ready" : "empty"} products={newProducts} />
          </section>
      </>

      <section className="home-transparency" aria-labelledby="transparency-title">
        <div>
          <p>INGREDIENT TRANSPARENCY</p>
          <h2 id="transparency-title">무엇이 얼마나 들었는지 <br />먼저 공개합니다</h2>
          <p>원료 이름만 크게 쓰지 않습니다. 1일 섭취량 기준 함량, 원산지, 인증과 주의사항까지 확인하고 고르세요.</p>
          <Link href={STOREFRONT_DESTINATIONS.ingredientsView.href}>성분 기준으로 살펴보기 <span aria-hidden="true">→</span></Link>
        </div>
        <dl>
          <div><dt>01</dt><dd><strong>정확한 함량</strong><span>1일 섭취량 기준으로 표시</span></dd></div>
          <div><dt>02</dt><dd><strong>원산지 공개</strong><span>주요 원료의 출처를 투명하게</span></dd></div>
          <div><dt>03</dt><dd><strong>쉬운 비교</strong><span>필요한 정보만 같은 기준으로</span></dd></div>
        </dl>
      </section>
    </main>
  );
}
