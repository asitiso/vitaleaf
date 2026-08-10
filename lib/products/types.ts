export type Ingredient = {
  name: string;
  amount: string;
  dailyValue: string;
};

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
