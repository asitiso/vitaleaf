"use client";

import Link from "next/link";

import type { Product } from "../../lib/products/types";
import { ProductCard } from "./product-card";

export type ProductGridStatus = "loading" | "ready" | "empty" | "error";

type ProductGridProps = {
  status: ProductGridStatus;
  products: Product[];
  retry?: () => void;
  isAdmin?: boolean;
  showRanks?: boolean;
};

export function ProductGrid({ status, products, retry, isAdmin = false, showRanks = false }: ProductGridProps) {
  if (status === "loading") {
    return (
      <div className="product-grid product-grid--loading" role="status">
        <span className="sr-only">상품을 불러오는 중입니다</span>
        {Array.from({ length: 4 }, (_, index) => (
          <div className="product-card-skeleton" aria-label="상품 불러오는 중" key={index}>
            <span />
          </div>
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="product-grid-state" role="alert">
        <strong>상품을 불러오지 못했습니다</strong>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button type="button" onClick={retry ?? (() => window.location.reload())}>다시 시도</button>
      </div>
    );
  }

  if (status === "empty" || products.length === 0) {
    return (
      <div className="product-grid-state">
        <strong>조건에 맞는 상품이 없습니다</strong>
        <p>검색어나 필터를 바꾸면 더 많은 상품을 확인할 수 있습니다.</p>
        {isAdmin ? <Link href="/admin">상품 등록 안내</Link> : null}
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} rank={showRanks ? index + 1 : undefined} />
      ))}
    </div>
  );
}
