"use client";

import { useId } from "react";

import { formatWon } from "../../lib/format";
import { getPurchaseOptionPrice, normalizePurchaseOptions } from "../../lib/products/purchase-options";
import type { Product, PurchaseOption } from "../../lib/products/types";

type PurchaseOptionSelectorProps = {
  product: Product;
  selectedId: string;
  onSelect(option: PurchaseOption): void;
};

export function PurchaseOptionSelector({ product, selectedId, onSelect }: PurchaseOptionSelectorProps) {
  const name = useId();
  const options = normalizePurchaseOptions(product.purchaseOptions, product.price, product.stock)
    .filter((option) => option.active);

  return (
    <fieldset className="purchase-option-selector">
      <legend>구매 옵션</legend>
      <div className="purchase-option-selector__list" role="radiogroup" aria-label="구매 옵션">
        {options.map((option) => {
          const soldOut = option.stock < 1;

          return (
            <label
              className={`purchase-option-selector__option${soldOut ? " purchase-option-selector__option--sold-out" : ""}`}
              key={option.id}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selectedId === option.id}
                disabled={soldOut}
                onChange={() => onSelect(option)}
              />
              <span className="purchase-option-selector__copy">
                <strong>{option.label}</strong>
                {option.durationMonths === null ? null : <small>예상 {option.durationMonths}개월</small>}
              </span>
              <span className="purchase-option-selector__price">
                <strong>{formatWon(getPurchaseOptionPrice(product.price, option))}</strong>
                <small>{soldOut ? "품절" : `재고 ${option.stock}개`}</small>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
