"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useCart } from "../../features/cart/cart-context";
import { formatWon } from "../../lib/format";
import { PRODUCT_CATEGORIES, taxonomyLabel } from "../../lib/catalog/taxonomy";
import type { Product, Review } from "../../lib/products/types";
import { formatFreeShippingCondition, STORE_POLICIES } from "../../lib/site/policies";
import { ProductInfo } from "./product-info";
import { ReviewSection } from "./review-section";

type ProductDetailProps = {
  product: Product;
  reviews: Review[];
  reviewLoadError?: boolean;
};

type GalleryItem = {
  url: string;
  alt: string;
};

function fallbackGalleryAlt(productName: string, index: number): string {
  return index === 0 ? `${productName} 대표 이미지` : `${productName} 상세 이미지 ${index + 1}`;
}

function buildProductGallery(product: Product): GalleryItem[] {
  const canonicalMedia = [...product.media]
    .sort((left, right) => left.order - right.order)
    .reduce<GalleryItem[]>((gallery, media) => {
      const url = media.url.trim();
      if (!url || gallery.some((item) => item.url === url)) {
        return gallery;
      }

      gallery.push({
        url,
        alt: media.alt.trim() || fallbackGalleryAlt(product.name, gallery.length),
      });
      return gallery;
    }, []);

  if (canonicalMedia.length > 0) {
    return canonicalMedia;
  }

  return [product.thumbnailUrl, ...product.images].reduce<GalleryItem[]>((gallery, image) => {
    const url = image.trim();
    if (!url || gallery.some((item) => item.url === url)) {
      return gallery;
    }

    gallery.push({ url, alt: fallbackGalleryAlt(product.name, gallery.length) });
    return gallery;
  }, []);
}

function getDiscountRate(product: Product): number | null {
  if (product.originalPrice === null || product.originalPrice <= product.price) {
    return null;
  }

  return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
}

export function ProductDetail({ product, reviews, reviewLoadError = false }: ProductDetailProps) {
  const { add } = useCart();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const soldOut = product.stock < 1;
  const discountRate = getDiscountRate(product);
  const gallery = buildProductGallery(product);
  const selectedImage = gallery[selectedImageIndex];

  const decreaseQuantity = () => setQuantity((current) => Math.max(1, current - 1));
  const increaseQuantity = () => setQuantity((current) => Math.min(product.stock, current + 1));
  const buyNow = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    add(product, quantity);
    router.push("/checkout");
  };

  return (
    <main className="product-detail">
      <section className="product-detail__gallery" aria-label={`${product.name} 이미지 갤러리`}>
        <div className="product-detail__main-image">
          {selectedImage && !failedImages.has(selectedImage.url) ? (
            // Firestore accepts merchant-managed image URLs from arbitrary hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedImage.url}
              alt={selectedImage.alt}
              onError={() => setFailedImages((current) => new Set(current).add(selectedImage.url))}
            />
          ) : (
            <div className="product-detail__image-fallback" role="img" aria-label={`${product.name} 이미지 준비 중`}>
              <span aria-hidden="true">VITALEAF</span>
              <strong>{product.name}</strong>
              <small>이미지를 준비하고 있습니다.</small>
            </div>
          )}
        </div>
        {gallery.length > 1 ? (
          <div className="product-detail__thumbnails" aria-label="상품 이미지 선택">
            {gallery.map((image, index) => (
              <button
                type="button"
                key={image.url}
                aria-label={`이미지 ${index + 1} 보기`}
                aria-pressed={selectedImageIndex === index}
                onClick={() => setSelectedImageIndex(index)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
      </section>
      <section className="product-detail__summary">
        <p className="product-detail__category">{taxonomyLabel(PRODUCT_CATEGORIES, product.category)}</p>
        <h1>{product.name}</h1>
        {product.description ? <p className="product-detail__description">{product.description}</p> : null}
        <div className="product-detail__price-row">
          {discountRate === null ? null : <strong className="product-detail__discount">{discountRate}%</strong>}
          <strong className="product-detail__price">{formatWon(product.price)}</strong>
          {discountRate !== null && product.originalPrice !== null ? (
            <del>{formatWon(product.originalPrice)}</del>
          ) : null}
        </div>
        <p className={`product-detail__stock${soldOut ? " product-detail__stock--sold-out" : ""}`}>
          {soldOut ? "품절된 상품입니다" : product.stock <= 5 ? `재고 ${product.stock}개 남음` : "재고 있음"}
        </p>
        <p className="product-detail__shipping"><strong>{formatFreeShippingCondition()}</strong> · {STORE_POLICIES.shipping.dispatch}</p>
      </section>
      <div className="product-detail__quantity" role="group" aria-label="구매 수량 선택">
        <button type="button" aria-label="수량 줄이기" disabled={soldOut || quantity <= 1} onClick={decreaseQuantity}>
          −
        </button>
        <input
          type="number"
          aria-label="수량"
          min={1}
          max={Math.max(1, product.stock)}
          value={quantity}
          readOnly
          inputMode="numeric"
        />
        <button
          type="button"
          aria-label="수량 늘리기"
          disabled={soldOut || quantity >= product.stock}
          onClick={increaseQuantity}
        >
          +
        </button>
      </div>
      <form className="product-detail__actions" onSubmit={buyNow}>
        <button type="button" disabled={soldOut} onClick={() => add(product, quantity)}>
          장바구니 담기
        </button>
        <button type="submit" disabled={soldOut}>바로 구매</button>
      </form>
      <ProductInfo product={product} />
      <ReviewSection productId={product.id} initialReviews={reviews} initialLoadError={reviewLoadError} />
    </main>
  );
}
