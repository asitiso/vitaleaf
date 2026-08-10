import { notFound } from "next/navigation";

import { ProductDetail } from "../../../components/product/product-detail";
import { getProduct } from "../../../lib/firebase/products";
import { getApprovedReviews } from "../../../lib/firebase/reviews";
import type { Review } from "../../../lib/products/types";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (product === null) {
    return notFound();
  }

  let reviews: Review[] = [];
  let reviewLoadError = false;

  try {
    reviews = await getApprovedReviews(product.id);
  } catch {
    reviewLoadError = true;
  }

  return <ProductDetail product={product} reviews={reviews} reviewLoadError={reviewLoadError} />;
}
