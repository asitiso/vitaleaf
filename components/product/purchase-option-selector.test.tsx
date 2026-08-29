import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import type { Product } from "../../lib/products/types";
import { PurchaseOptionSelector } from "./purchase-option-selector";

const product: Product = {
  id: "daily-omega-3",
  name: "데일리 오메가3",
  slug: "daily-omega-3",
  category: "혈행 건강",
  concerns: ["혈행"],
  price: 80_000,
  originalPrice: 100_000,
  thumbnailUrl: "",
  images: [],
  media: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 12,
  purchaseOptions: [
    {
      id: "2-month",
      label: "2개월분",
      durationMonths: 2,
      sku: "OMEGA-2M",
      priceAdjustment: -35_000,
      stock: 12,
      active: true,
      isDefault: false,
    },
    {
      id: "4-month",
      label: "4개월분",
      durationMonths: 4,
      sku: "OMEGA-4M",
      priceAdjustment: 0,
      stock: 0,
      active: true,
      isDefault: true,
    },
    {
      id: "old-package",
      label: "이전 구성",
      durationMonths: 1,
      sku: "OMEGA-OLD",
      priceAdjustment: -60_000,
      stock: 10,
      active: false,
      isDefault: false,
    },
  ],
  isBest: true,
  isNew: false,
  salesRank: 1,
  ratingAverage: 4.8,
  reviewCount: 120,
  createdAt: null,
  updatedAt: null,
};

it("renders active options with duration, final price, and sold-out availability", () => {
  render(<PurchaseOptionSelector product={product} selectedId="4-month" onSelect={vi.fn()} />);

  expect(screen.getByRole("radio", { name: /2개월분.*2개월.*45,000원.*재고 12개/ })).toBeEnabled();
  expect(screen.getByRole("radio", { name: /4개월분.*4개월.*80,000원.*품절/ })).toBeDisabled();
  expect(screen.getByRole("radio", { name: /4개월분/ })).toBeChecked();
  expect(screen.queryByText("이전 구성")).not.toBeInTheDocument();
});

it("returns the canonical selected option object", async () => {
  const onSelect = vi.fn();
  render(<PurchaseOptionSelector product={product} selectedId="4-month" onSelect={onSelect} />);

  await userEvent.click(screen.getByRole("radio", { name: /2개월분/ }));

  expect(onSelect).toHaveBeenCalledWith(product.purchaseOptions?.[0]);
});
