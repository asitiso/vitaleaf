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
export type DraftMode = "create" | "edit" | "restore";

export type Product = {
  id: string;
  name: string;
  slug: string;
  category: string;
  concerns: string[];
  ageTargets?: string[];
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
  // Optional on callers so legacy product fixtures/documents remain source-compatible;
  // every normalized Firestore product receives concrete lifecycle metadata.
  revision?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy?: string | null;
  updatedBy?: string | null;
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
export type ProductInput = Omit<
  Product,
  "id" | "media" | "revision" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
>;

export type ProductDraft = ProductInput & {
  id: string;
  media: ProductMedia[];
  status: DraftStatus;
  mode: DraftMode;
  sessionId: string | null;
  revision: number;
  sourceProductId: string | null;
  sourceProductRevision: number | null;
  sourceCreatedAt: Date | null;
  sourceCreatedBy: string | null;
  currentStep: 1 | 2 | 3 | 4;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
};
