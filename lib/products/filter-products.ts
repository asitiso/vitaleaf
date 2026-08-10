import type { Product, ProductFilters } from "./types";

export type { ProductFilters } from "./types";

const normalize = (value: string): string => value.trim().toLocaleLowerCase("ko-KR");

const compareNumbers = (left: number, right: number): number => left - right;

const creationTime = (product: Product): number => {
  const timestamp = product.createdAt?.getTime();
  return timestamp === undefined || Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
};

const compareProducts = (left: Product, right: Product, sort: ProductFilters["sort"]): number => {
  switch (sort) {
    case "price-asc":
      return compareNumbers(left.price, right.price);
    case "price-desc":
      return compareNumbers(right.price, left.price);
    case "newest":
      return compareNumbers(creationTime(right), creationTime(left));
    case "popular": {
      const rank = compareNumbers(left.salesRank ?? Number.POSITIVE_INFINITY, right.salesRank ?? Number.POSITIVE_INFINITY);
      if (rank !== 0) return rank;

      const reviews = compareNumbers(right.reviewCount, left.reviewCount);
      if (reviews !== 0) return reviews;

      return left.name.localeCompare(right.name, "ko-KR");
    }
  }
};

export const filterProducts = (products: Product[], filters: ProductFilters): Product[] => {
  const query = normalize(filters.query);
  const category = normalize(filters.category);
  const concern = normalize(filters.concern);

  return products
    .filter((product) => {
      const searchableFields = [
        product.name,
        product.category,
        ...product.concerns,
        ...product.benefits,
        ...product.ingredients.map((ingredient) => ingredient.name),
      ];
      const matchesQuery = !query || searchableFields.some((field) => normalize(field).includes(query));
      const matchesCategory = !category || normalize(product.category) === category;
      const matchesConcern = !concern || product.concerns.some((item) => normalize(item) === concern);
      const meetsMinimumPrice = filters.minPrice === null || product.price >= filters.minPrice;
      const meetsMaximumPrice = filters.maxPrice === null || product.price <= filters.maxPrice;
      const matchesStock = !filters.inStockOnly || product.stock > 0;

      return matchesQuery && matchesCategory && matchesConcern && meetsMinimumPrice && meetsMaximumPrice && matchesStock;
    })
    .map((product, index) => ({ product, index }))
    .sort((left, right) => compareProducts(left.product, right.product, filters.sort) || left.index - right.index)
    .map(({ product }) => product);
};
