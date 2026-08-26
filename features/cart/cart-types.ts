import type { Product } from "@/lib/products/types";

export type CartLine = {
  productId: string;
  name: string;
  thumbnailUrl: string;
  unitPrice: number;
  stock: number;
  quantity: number;
  selected: boolean;
};

export type CartContextValue = {
  lines: CartLine[];
  buyNowLine: CartLine | null;
  itemCount: number;
  hasHydrated: boolean;
  add(product: Product, quantity: number): void;
  prepareBuyNow(product: Product, quantity: number): void;
  clearBuyNow(): void;
  remove(productId: string): void;
  setQuantity(productId: string, quantity: number): void;
  setSelected(productId: string, selected: boolean): void;
  selectAll(selected: boolean): void;
  clearSelected(): void;
  clearSubmitted(lines: readonly CartLine[]): void;
};
