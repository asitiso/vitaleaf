"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useCart } from "../../features/cart/cart-context";
import { cartLineId } from "../../features/cart/cart-utils";
import { formatWon } from "../../lib/format";
import { PRODUCT_CATEGORIES, taxonomyLabel } from "../../lib/catalog/taxonomy";
import {
  getDefaultPurchaseOption,
  getPurchaseOptionPrice,
  LEGACY_PURCHASE_OPTION_ID,
  normalizePurchaseOptions,
} from "../../lib/products/purchase-options";
import type { Product, PurchaseOption, Review } from "../../lib/products/types";
import { formatFreeShippingCondition, STORE_POLICIES } from "../../lib/site/policies";
import { ProductInfo } from "./product-info";
import { PurchaseOptionSelector } from "./purchase-option-selector";
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

type CartToastState = {
  productName: string;
  quantity: number;
};

type DuplicateCartDecision = {
  lineId: string;
  requestedQuantity: number;
};

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), a[href], input:not([disabled])'),
  );
}

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

function hasOnlyImplicitLegacyOption(product: Product): boolean {
  if (product.purchaseOptions === undefined || product.purchaseOptions.length === 0) {
    return true;
  }

  const [option] = product.purchaseOptions;
  return product.purchaseOptions.length === 1
    && option.id === LEGACY_PURCHASE_OPTION_ID
    && option.label === "기본 구성"
    && option.durationMonths === null
    && option.sku === ""
    && option.priceAdjustment === 0
    && option.active
    && option.isDefault;
}

export function ProductDetail({ product, reviews, reviewLoadError = false }: ProductDetailProps) {
  const { add, lines, prepareBuyNow } = useCart();
  const router = useRouter();
  const defaultOption = getDefaultPurchaseOption(product);
  const purchaseOptions = normalizePurchaseOptions(product.purchaseOptions, product.price, product.stock);
  const [purchaseState, setPurchaseState] = useState(() => ({
    productId: product.id,
    optionId: defaultOption.id,
    quantity: 1,
  }));
  const [cartToast, setCartToast] = useState<CartToastState | null>(null);
  const [duplicateDecision, setDuplicateDecision] = useState<DuplicateCartDecision | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const duplicateDialogRef = useRef<HTMLElement>(null);
  const keepQuantityButtonRef = useRef<HTMLButtonElement>(null);
  const selectedOption = (
    purchaseState.productId === product.id
      ? purchaseOptions.find((option) => option.id === purchaseState.optionId && option.active)
      : undefined
  ) ?? defaultOption;
  const quantity = Math.max(1, Math.min(purchaseState.quantity, selectedOption.stock));
  const duplicateLine = duplicateDecision
    ? lines.find((line) => line.lineId === duplicateDecision.lineId) ?? null
    : null;
  const duplicateOption = duplicateLine
    ? purchaseOptions.find((option) => option.id === duplicateLine.purchaseOptionId && option.active) ?? null
    : null;
  const selectedPrice = getPurchaseOptionPrice(product.price, selectedOption);
  const soldOut = selectedOption.stock < 1;
  const canCompareOriginalPrice = selectedOption.isDefault && selectedOption.priceAdjustment === 0;
  const discountRate = canCompareOriginalPrice ? getDiscountRate(product) : null;
  const showOptionSelector = !hasOnlyImplicitLegacyOption(product);
  const gallery = buildProductGallery(product);
  const selectedImage = gallery[selectedImageIndex];
  const primaryIngredient = product.ingredients[0];
  const primaryIngredientText = primaryIngredient
    ? [primaryIngredient.name, primaryIngredient.amount].filter(Boolean).join(" ")
    : "상세 정보 확인";
  const certificationText = product.certifications.slice(0, 2).join(" · ") || "상세 정보 확인";

  const setSelectedQuantity = (nextQuantity: number) => setPurchaseState({
    productId: product.id,
    optionId: selectedOption.id,
    quantity: Math.max(1, Math.min(nextQuantity, selectedOption.stock)),
  });
  const decreaseQuantity = () => setSelectedQuantity(quantity - 1);
  const increaseQuantity = () => setSelectedQuantity(quantity + 1);
  const selectPurchaseOption = (option: PurchaseOption) => {
    setPurchaseState({
      productId: product.id,
      optionId: option.id,
      quantity: Math.max(1, Math.min(quantity, option.stock)),
    });
  };
  const buyNow = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    prepareBuyNow(product, selectedOption, quantity);
    router.push("/checkout?mode=buy-now");
  };
  const addToCart = () => {
    if (soldOut) {
      return;
    }

    const existingLine = lines.find((line) => line.lineId === cartLineId(product.id, selectedOption.id));
    if (existingLine) {
      setDuplicateDecision({ lineId: existingLine.lineId, requestedQuantity: quantity });
      return;
    }

    add(product, selectedOption, quantity);
    setCartToast({ productName: product.name, quantity });
  };

  const closeDuplicateDecision = useCallback(() => {
    setDuplicateDecision(null);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  }, [setDuplicateDecision]);

  const incrementDuplicate = () => {
    if (!duplicateDecision || !duplicateLine || !duplicateOption) {
      return;
    }

    const availableAddition = Math.max(duplicateOption.stock - duplicateLine.quantity, 0);
    const addedQuantity = Math.min(duplicateDecision.requestedQuantity, availableAddition);
    if (addedQuantity > 0) {
      add(product, duplicateOption, duplicateDecision.requestedQuantity, "increment");
      setCartToast({ productName: product.name, quantity: addedQuantity });
    }
    closeDuplicateDecision();
  };

  useEffect(() => {
    if (!duplicateDecision) {
      return;
    }

    keepQuantityButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDuplicateDecision();
        return;
      }
      if (event.key !== "Tab" || !duplicateDialogRef.current) {
        return;
      }

      const focusableElements = getFocusableElements(duplicateDialogRef.current);
      const first = focusableElements.at(0);
      const last = focusableElements.at(-1);
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeDuplicateDecision, duplicateDecision]);

  useEffect(() => {
    if (duplicateDecision && (!duplicateLine || !duplicateOption)) {
      const closeFrame = requestAnimationFrame(closeDuplicateDecision);
      return () => cancelAnimationFrame(closeFrame);
    }
    return undefined;
  }, [closeDuplicateDecision, duplicateDecision, duplicateLine, duplicateOption]);

  useEffect(() => {
    if (cartToast === null) {
      return;
    }

    const dismissalTimer = window.setTimeout(() => setCartToast(null), 3_000);
    return () => window.clearTimeout(dismissalTimer);
  }, [cartToast]);

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
          <strong className="product-detail__price">{formatWon(selectedPrice)}</strong>
          {discountRate !== null && product.originalPrice !== null ? (
            <del>{formatWon(product.originalPrice)}</del>
          ) : null}
        </div>
        {showOptionSelector ? (
          <PurchaseOptionSelector
            product={product}
            selectedId={selectedOption.id}
            onSelect={selectPurchaseOption}
          />
        ) : null}
        {selectedOption.durationMonths === null ? null : (
          <p className="product-detail__duration">예상 복용 기간 {selectedOption.durationMonths}개월</p>
        )}
        <dl className="product-detail__facts" aria-label="구매 핵심 정보">
          <div>
            <dt>섭취</dt>
            <dd>{product.dosage || "상세 정보 확인"}</dd>
          </div>
          <div>
            <dt>대표 성분</dt>
            <dd>{primaryIngredientText}</dd>
          </div>
          <div>
            <dt>인증</dt>
            <dd>{certificationText}</dd>
          </div>
        </dl>
        <p className={`product-detail__stock${soldOut ? " product-detail__stock--sold-out" : ""}`}>
          {soldOut
            ? showOptionSelector ? "품절된 옵션입니다" : "품절된 상품입니다"
            : showOptionSelector ? `재고 ${selectedOption.stock}개 남음`
              : selectedOption.stock <= 5 ? `재고 ${selectedOption.stock}개 남음` : "재고 있음"}
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
          max={Math.max(1, selectedOption.stock)}
          value={quantity}
          readOnly
          inputMode="numeric"
        />
        <button
          type="button"
          aria-label="수량 늘리기"
          disabled={soldOut || quantity >= selectedOption.stock}
          onClick={increaseQuantity}
        >
          +
        </button>
      </div>
      <form className="product-detail__actions" onSubmit={buyNow}>
        <div className="product-detail__mobile-purchase" aria-label="구매 요약" aria-live="polite">
          <span>수량 {quantity}개</span>
          <strong>{formatWon(selectedPrice * quantity)}</strong>
        </div>
        <button ref={addButtonRef} type="button" disabled={soldOut} onClick={addToCart}>
          장바구니 담기
        </button>
        <button type="submit" disabled={soldOut}>바로 구매</button>
      </form>
      {duplicateDecision && duplicateLine && duplicateOption ? (() => {
        const availableAddition = Math.max(duplicateOption.stock - duplicateLine.quantity, 0);
        const addedQuantity = Math.min(duplicateDecision.requestedQuantity, availableAddition);
        const nextQuantity = duplicateLine.quantity + addedQuantity;
        const isStockCapped = addedQuantity < duplicateDecision.requestedQuantity;
        const existingStockConflict = duplicateLine.quantity >= duplicateOption.stock;
        const describedBy = isStockCapped
          ? "duplicate-cart-description duplicate-cart-quantities duplicate-cart-stock"
          : "duplicate-cart-description duplicate-cart-quantities";

        return (
          <div className="product-detail__duplicate-backdrop">
            <button
              type="button"
              tabIndex={-1}
              className="product-detail__duplicate-backdrop-dismiss"
              aria-label="수량 선택 바깥 영역 닫기"
              onClick={closeDuplicateDecision}
            />
            <section
              ref={duplicateDialogRef}
              className="product-detail__duplicate-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="duplicate-cart-heading"
              aria-describedby={describedBy}
            >
              <h2 id="duplicate-cart-heading">장바구니 수량 선택</h2>
              <p id="duplicate-cart-description">같은 상품과 구매 옵션이 장바구니에 있습니다.</p>
              <div id="duplicate-cart-quantities" className="product-detail__duplicate-quantities">
                <p>현재 장바구니: <strong>{duplicateLine.quantity}개</strong></p>
                <p>이번 선택 수량: <strong>{duplicateDecision.requestedQuantity}개</strong></p>
              </div>
              {isStockCapped ? (
                <p id="duplicate-cart-stock" className="product-detail__duplicate-stock">
                  {duplicateLine.quantity > duplicateOption.stock
                    ? `현재 장바구니 ${duplicateLine.quantity}개가 최신 재고 ${duplicateOption.stock}개를 초과해 추가할 수 없어요.`
                    : existingStockConflict
                      ? `이미 최신 재고 ${duplicateOption.stock}개를 모두 담아 추가할 수 없어요.`
                      : `재고가 ${duplicateOption.stock}개라 최대 ${nextQuantity}개까지 담을 수 있어요.`}
                </p>
              ) : null}
              <div className="product-detail__duplicate-actions">
                <button ref={keepQuantityButtonRef} type="button" onClick={closeDuplicateDecision}>
                  기존 수량 유지
                </button>
                <button
                  className="product-detail__duplicate-close"
                  type="button"
                  aria-label="수량 선택 닫기"
                  onClick={closeDuplicateDecision}
                >
                  ×
                </button>
                <button type="button" disabled={addedQuantity < 1} onClick={incrementDuplicate}>
                  {addedQuantity < 1
                    ? "추가할 수 없습니다"
                    : `${addedQuantity}개 추가하여 ${nextQuantity}개로 변경`}
                </button>
              </div>
            </section>
          </div>
        );
      })() : null}
      {cartToast ? (
        <aside className="product-detail__cart-toast" role="status" aria-live="polite">
          <p><strong>{cartToast.productName}</strong> {cartToast.quantity}개를 장바구니에 담았습니다.</p>
          <Link href="/cart">장바구니 보기</Link>
          <button type="button" aria-label="장바구니 알림 닫기" onClick={() => setCartToast(null)}>×</button>
        </aside>
      ) : null}
      <ProductInfo product={product} />
      <ReviewSection productId={product.id} initialReviews={reviews} initialLoadError={reviewLoadError} />
    </main>
  );
}
