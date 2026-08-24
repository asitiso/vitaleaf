import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { vi } from "vitest";

import type { Product } from "@/lib/products/types";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => (
    <a {...props} href={href} onClick={(event) => event.preventDefault()}>{children}</a>
  ),
}));

import { ProductCard } from "./product-card";

const product: Product = {
  id: "omega-3",
  name: "데일리 오메가3",
  slug: "daily-omega-3",
  category: "오메가3",
  concerns: ["혈행"],
  price: 32_000,
  originalPrice: 40_000,
  thumbnailUrl: "https://images.example.com/omega-3.jpg",
  images: [],
  media: [{ url: "https://images.example.com/omega-3.jpg", storagePath: null, alt: "Omega 3", order: 0 }],
  description: "매일 챙기는 혈행 건강",
  benefits: ["혈행", "기억력"],
  ingredients: [{ name: "EPA 및 DHA", amount: "600 mg", dailyValue: "" }],
  dosage: "1일 1회",
  origin: "노르웨이",
  certifications: ["GMP"],
  cautions: [],
  stock: 0,
  isBest: true,
  isNew: false,
  salesRank: 1,
  ratingAverage: 4.8,
  reviewCount: 1_624,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: null,
};

it("shows discount, benefit, rating, and sold-out status without relying on color", () => {
  render(<ProductCard product={product} />);

  const card = screen.getByRole("article", { name: "데일리 오메가3" });
  expect(card).toHaveTextContent("20%");
  expect(card).toHaveTextContent("혈행");
  expect(card).toHaveTextContent("평점 4.8");
  expect(card).toHaveTextContent("리뷰 1,624");
  expect(card).toHaveTextContent("품절");
  expect(screen.getByRole("link", { name: /데일리 오메가3/ })).toHaveAttribute(
    "href",
    "/products/omega-3",
  );
});

it("uses the stable Firestore document id when the optional slug is empty", () => {
  render(<ProductCard product={{ ...product, slug: "" }} />);

  expect(screen.getByRole("link", { name: /데일리 오메가3/ })).toHaveAttribute(
    "href",
    "/products/omega-3",
  );
});

it("keeps native browser navigation for product detail links", () => {
  render(<ProductCard product={product} />);

  const link = screen.getByRole("link", { name: /데일리 오메가3/ });
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  let preventedBeforeBrowserNavigation: boolean | null = null;
  document.addEventListener("click", (event) => {
    preventedBeforeBrowserNavigation = event.defaultPrevented;
    event.preventDefault();
  }, { once: true });

  link.dispatchEvent(click);

  expect(preventedBeforeBrowserNavigation).toBe(false);
});

it("replaces a broken non-empty thumbnail with the existing decorative brand fallback", () => {
  render(<ProductCard product={{ ...product, stock: 3 }} />);

  const card = screen.getByRole("article", { name: product.name });
  const thumbnail = card.querySelector("img");
  expect(thumbnail).toHaveAttribute("src", product.thumbnailUrl);
  expect(thumbnail).toHaveAttribute("alt", "");

  fireEvent.error(thumbnail as HTMLImageElement);

  expect(card.querySelector("img")).not.toBeInTheDocument();
  expect(within(card).getByText("VITALEAF")).toHaveAttribute("aria-hidden", "true");
  expect(within(card).getByRole("link", { name: /데일리 오메가3/ })).toHaveAttribute(
    "href",
    "/products/omega-3",
  );
});
