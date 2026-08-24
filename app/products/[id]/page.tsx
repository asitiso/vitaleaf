import { notFound } from "next/navigation";

import { ProductDetail } from "../../../components/product/product-detail";
import {
  getServerApprovedReviews,
  getServerProduct,
} from "../../../lib/firebase/server-read";
import { findSampleProduct } from "../../../lib/products/sample-products";
import type { Product, Review } from "../../../lib/products/types";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let storedProduct: Product | null = null;
  try {
    storedProduct = await getServerProduct(id);
  } catch (error) {
    if (findSampleProduct(id) === null) throw error;
  }
  const product = storedProduct ?? findSampleProduct(id);

  if (product === null) {
    return notFound();
  }

  let reviews: Review[] = [];
  let reviewLoadError = false;

  if (storedProduct) {
    try {
      reviews = await getServerApprovedReviews(product.id);
    } catch {
      reviewLoadError = true;
    }
  }

  return <ProductDetail product={product} reviews={reviews} reviewLoadError={reviewLoadError} />;
}
