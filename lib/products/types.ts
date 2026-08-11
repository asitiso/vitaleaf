export type Ingredient = {
  name: string;
  amount: string;
  dailyValue: string;
};

export type ProductMedia = {
  url: string;
  storagePath: string | null;
  alt: string;
  order: number;
};

export type DraftStatus = "draft" | "publishing" | "published-copy";

export type Product = {
  id: string;
  name: string;
  slug: string;
  category: string;
  concerns: string[];
  price: number;
  originalPrice: number | null;
  thumbnailUrl: string;
  images: string[];
  media: ProductMedia[];
  description: string;
  benefits: string[];
  ingredients: Ingredient[];
  dosage: string;
  origin: string;
  certifications: string[];
  cautions: string[];
  stock: number;
  isBest: boolean;
  isNew: boolean;
  salesRank: number | null;
  ratingAverage: number;
  reviewCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ProductFilters = {
  query: string;
  category: string;
  concern: string;
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  sort: "popular" | "newest" | "price-asc" | "price-desc";
};

export type Review = {
  id: string;
  productId: string;
  rating: number;
  text: string;
  authorAlias: string;
  approved: boolean;
  createdAt: Date | null;
};

// Legacy ProductInput remains image-field compatible for current CSV and admin writes.
export type ProductInput = Omit<Product, "id" | "createdAt" | "updatedAt" | "media">;

export type ProductDraft = ProductInput & {
  id: string;
  media: ProductMedia[];
  status: DraftStatus;
  sourceProductId: string | null;
  currentStep: 1 | 2 | 3 | 4;
  createdAt: Date | null;
  updatedAt: Date | null;
};
