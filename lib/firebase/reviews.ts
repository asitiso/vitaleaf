import { collection, getDocs, orderBy, query, where } from "firebase/firestore";

import type { Review } from "../products/types";
import { db } from "./client";

type FirestoreDocument = {
  id: string;
  data(): unknown;
};

export type ReviewRepositoryAdapter = {
  query: (productId: string, approved: boolean) => Promise<FirestoreDocument[]>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const asRating = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(5, Math.max(0, value)) : 0;

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    const date = typeof toDate === "function" ? toDate.call(value) : null;
    return date instanceof Date ? date : null;
  }
  return null;
};

const normalizeReview = (id: string, raw: unknown): Review => {
  const review = asRecord(raw);
  return {
    id,
    productId: asString(review.productId),
    rating: asRating(review.rating),
    text: asString(review.text),
    authorAlias: asString(review.authorAlias),
    approved: review.approved === true,
    createdAt: asDate(review.createdAt),
  };
};

export const createReviewRepository = (adapter: ReviewRepositoryAdapter) => ({
  async getApprovedReviews(productId: string): Promise<Review[]> {
    const documents = await adapter.query(productId, true);
    return documents.map((document) => normalizeReview(document.id, document.data()));
  },
});

const firebaseReviewAdapter: ReviewRepositoryAdapter = {
  async query(productId, approved) {
    const snapshot = await getDocs(
      query(
        collection(db, "reviews"),
        where("productId", "==", productId),
        where("approved", "==", approved),
        orderBy("createdAt", "desc"),
      ),
    );
    return snapshot.docs;
  },
};

const reviewRepository = createReviewRepository(firebaseReviewAdapter);

export const getApprovedReviews = reviewRepository.getApprovedReviews;
