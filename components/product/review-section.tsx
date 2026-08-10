"use client";

import { useState } from "react";

import { getApprovedReviews } from "../../lib/firebase/reviews";
import type { Review } from "../../lib/products/types";

type ReviewSectionProps = {
  productId: string;
  initialReviews: Review[];
  initialLoadError?: boolean;
};

export function ReviewSection({ productId, initialReviews, initialLoadError = false }: ReviewSectionProps) {
  const [loadedReviews, setLoadedReviews] = useState(initialReviews);
  const [loadError, setLoadError] = useState(initialLoadError);
  const [isRetrying, setIsRetrying] = useState(false);
  const reviews = loadedReviews.filter((review) => review.approved);
  const average = reviews.length === 0
    ? 0
    : reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((review) => Math.round(review.rating) === rating).length,
  }));

  const retry = async () => {
    setIsRetrying(true);
    try {
      setLoadedReviews(await getApprovedReviews(productId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <section className="review-section" aria-labelledby="product-reviews-title">
      <div className="review-section__heading">
        <p>CUSTOMER REVIEW</p>
        <h2 id="product-reviews-title">구매 고객 리뷰</h2>
      </div>
      {loadError ? (
        <div className="review-section__error" role="alert">
          <p>리뷰를 불러오지 못했습니다. 상품 정보와 구매 기능은 계속 이용할 수 있습니다.</p>
          <button type="button" disabled={isRetrying} onClick={() => void retry()}>
            {isRetrying ? "불러오는 중" : "리뷰 다시 불러오기"}
          </button>
        </div>
      ) : reviews.length > 0 ? (
        <>
          <div className="review-section__summary">
            <div>
              <strong className="review-section__average">{average.toFixed(1)}</strong>
              <span aria-hidden="true">★★★★★</span>
              <p>승인 리뷰 {reviews.length.toLocaleString("ko-KR")}개</p>
            </div>
            <ol className="review-section__distribution" aria-label="별점 분포">
              {distribution.map(({ rating, count }) => (
                <li key={rating}>
                  <span>{rating}점</span>
                  <progress
                    aria-label={`${rating}점 리뷰 ${count.toLocaleString("ko-KR")}개`}
                    value={count}
                    max={Math.max(reviews.length, 1)}
                  />
                  <span>{count.toLocaleString("ko-KR")}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="review-section__list">
            {reviews.map((review) => (
              <article key={review.id} aria-label={`${review.authorAlias}님의 ${review.rating}점 리뷰`}>
                <header>
                  <strong>{review.authorAlias || "구매 고객"}</strong>
                  <span aria-label={`${review.rating}점`}>{"★".repeat(Math.round(review.rating))}</span>
                  {review.createdAt ? <time dateTime={review.createdAt.toISOString()}>{review.createdAt.toLocaleDateString("ko-KR")}</time> : null}
                </header>
                <p>{review.text}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="review-section__empty">아직 등록된 리뷰가 없습니다</p>
      )}
    </section>
  );
}
