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
  itemCount: number;
  hasHydrated: boolean;
  add(product: Product, quantity: number): void;
  remove(productId: string): void;
  setQuantity(productId: string, quantity: number): void;
  setSelected(productId: string, selected: boolean): void;
  selectAll(selected: boolean): void;
  clearSelected(): void;
  clearSubmitted(lines: readonly CartLine[]): void;
};
