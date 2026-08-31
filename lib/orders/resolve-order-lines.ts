import {
  getPurchaseOptionPrice,
  normalizePurchaseOptions,
} from "../products/purchase-options";
import type { Product } from "../products/types";

export type OrderLineSelection = {
  productId: string;
  purchaseOptionId: string;
  quantity: number;
};

export type ResolvedOrderLine = {
  productId: string;
  purchaseOptionId: string;
  purchaseOptionLabel: string;
  sku: string;
  name: string;
  thumbnailUrl: string;
  basePrice: number;
  priceAdjustment: number;
  unitPrice: number;
  stock: number;
  quantity: number;
  lineTotal: number;
};

export class OrderLineUnavailableError extends Error {
  constructor() {
    super("An order line is unavailable.");
    this.name = "OrderLineUnavailableError";
  }
}

export class OrderCatalogInvalidError extends Error {
  constructor() {
    super("The product catalog entry is invalid.");
    this.name = "OrderCatalogInvalidError";
  }
}

export const resolveOrderLines = (
  selections: readonly OrderLineSelection[],
  products: readonly (Product | null)[],
): ResolvedOrderLine[] => {
  if (selections.length !== products.length) throw new OrderLineUnavailableError();

  return selections.map((selection, index) => {
    const product = products[index];
    if (
      !product
      || product.id !== selection.productId
      || !Number.isInteger(selection.quantity)
      || selection.quantity < 1
      || !Number.isSafeInteger(product.price)
      || product.price < 0
    ) {
      throw new OrderLineUnavailableError();
    }

    try {
      const option = normalizePurchaseOptions(
        product.purchaseOptions,
        product.price,
        product.stock,
      ).find((candidate) => candidate.id === selection.purchaseOptionId && candidate.active);
      if (!option || option.stock < selection.quantity) throw new OrderLineUnavailableError();

      const unitPrice = getPurchaseOptionPrice(product.price, option);
      const lineTotal = unitPrice * selection.quantity;
      if (unitPrice < 1 || !Number.isSafeInteger(unitPrice) || !Number.isSafeInteger(lineTotal)) {
        throw new OrderLineUnavailableError();
      }

      return {
        productId: product.id,
        purchaseOptionId: option.id,
        purchaseOptionLabel: option.label,
        sku: option.sku,
        name: product.name,
        thumbnailUrl: product.thumbnailUrl,
        basePrice: product.price,
        priceAdjustment: option.priceAdjustment,
        unitPrice,
        stock: option.stock,
        quantity: selection.quantity,
        lineTotal,
      };
    } catch {
      throw new OrderLineUnavailableError();
    }
  });
};
