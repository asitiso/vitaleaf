import Link from "next/link";

import { formatWon } from "../../lib/format";
import type { Product } from "../../lib/products/types";

const discountRate = (product: Product): number | null => {
  if (product.originalPrice === null || product.originalPrice <= product.price) return null;
  return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
};

export function ProductCard({ product, rank }: { product: Product; rank?: number }) {
  const discount = discountRate(product);

  return (
    <article className="product-card" aria-label={product.name}>
      <Link className="product-card__link" href={`/products/${product.slug}`}>
        <div className="product-card__image-wrap">
          {product.thumbnailUrl ? (
            // Firestore accepts merchant-managed image URLs from arbitrary hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img className="product-card__image" src={product.thumbnailUrl} alt="" loading="lazy" />
          ) : (
            <span className="product-card__image-fallback" aria-hidden="true">VITALEAF</span>
          )}
          {rank !== undefined ? <span className="product-card__rank" aria-label={`판매 순위 ${rank}위`}>{rank}</span> : null}
          {product.stock < 1 ? <span className="product-card__sold-out">품절</span> : null}
        </div>
        <div className="product-card__content">
          <span className="product-card__category">{product.category}</span>
          <h3>{product.name}</h3>
          {product.benefits.length ? (
            <ul className="product-card__benefits" aria-label="주요 기능성">
              {product.benefits.slice(0, 2).map((benefit) => <li key={benefit}>{benefit}</li>)}
            </ul>
          ) : null}
          <div className="product-card__price-row">
            {discount ? <strong className="product-card__discount">{discount}%</strong> : null}
            <strong className="product-card__price">{formatWon(product.price)}</strong>
          </div>
          {product.originalPrice && discount ? (
            <del className="product-card__original-price">{formatWon(product.originalPrice)}</del>
          ) : null}
          <p className="product-card__rating" aria-label={`평점 ${product.ratingAverage.toFixed(1)}, 리뷰 ${product.reviewCount.toLocaleString("ko-KR")}개`}>
            <span aria-hidden="true">★</span> 평점 {product.ratingAverage.toFixed(1)} <span>리뷰 {product.reviewCount.toLocaleString("ko-KR")}</span>
          </p>
        </div>
      </Link>
    </article>
  );
}
