import type { Product, PurchaseOption } from "@/lib/products/types";

export type DuplicateCartStrategy = "keep" | "increment";

export type CartLine = {
  lineId: string;
  productId: string;
  purchaseOptionId: string;
  purchaseOptionLabel: string;
  sku: string;
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
  add(product: Product, option: PurchaseOption, quantity: number, strategy?: DuplicateCartStrategy): void;
  prepareBuyNow(product: Product, option: PurchaseOption, quantity: number): void;
  clearBuyNow(): void;
  remove(lineId: string): void;
  setQuantity(lineId: string, quantity: number): void;
  setSelected(lineId: string, selected: boolean): void;
  selectAll(selected: boolean): void;
  clearSelected(): void;
  clearSubmitted(lines: readonly CartLine[]): void;
};
