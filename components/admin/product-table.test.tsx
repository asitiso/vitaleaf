import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { Product, ProductDraft } from "../../lib/products/types";
import {
  ProductTable,
  type ProductSort,
  type ProductStatusFilter,
  type ProductTableRow,
} from "./product-table";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "daily-omega-3",
  name: "데일리 오메가3",
  slug: "daily-omega-3",
  category: "혈행 건강",
  concerns: ["혈행"],
  price: 28_000,
  originalPrice: null,
  thumbnailUrl: "omega-fallback.jpg",
  images: ["omega-fallback.jpg"],
  media: [{ url: "omega.jpg", storagePath: "products/daily-omega-3/omega.jpg", alt: "오메가3 병", order: 0 }],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 4,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  revision: 4,
  createdAt: new Date("2026-08-01T01:00:00.000Z"),
  updatedAt: new Date("2026-08-18T03:00:00.000Z"),
  ...overrides,
});

const draft = (overrides: Partial<ProductDraft> = {}): ProductDraft => ({
  ...product({ id: "lutein-draft", name: "루테인 초안", category: "눈 건강", stock: 0, thumbnailUrl: "", images: [], media: [] }),
  status: "draft",
  mode: "create",
  sessionId: "draft-session",
  revision: 2,
  sourceProductId: null,
  sourceProductRevision: null,
  sourceCreatedAt: null,
  sourceCreatedBy: null,
  currentStep: 2,
  createdBy: "admin",
  updatedBy: "admin",
  updatedAt: new Date("2026-08-19T03:00:00.000Z"),
  ...overrides,
});

const rows: ProductTableRow[] = [
  { kind: "published", value: product() },
  { kind: "published", value: product({ id: "vitamin-d", name: "비타민 D", category: "뼈 건강", stock: 0, thumbnailUrl: "", images: [], media: [], updatedAt: new Date("2026-08-17T03:00:00.000Z") }) },
  { kind: "draft", value: draft() },
];

const handlers = () => ({
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onPreview: vi.fn(),
  onPublish: vi.fn(),
  onUnpublish: vi.fn(),
  onDelete: vi.fn(),
  onToggleStock: vi.fn(),
});

function TableHarness({ lockedIds = new Set<string>() }: { lockedIds?: ReadonlySet<string> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProductStatusFilter>("all");
  const [sort, setSort] = useState<ProductSort>("modified-desc");
  return (
    <ProductTable
      rows={rows}
      query={query}
      statusFilter={status}
      sort={sort}
      lockedIds={lockedIds}
      onQueryChange={setQuery}
      onStatusFilterChange={setStatus}
      onSortChange={setSort}
      {...handlers()}
    />
  );
}

it("searches names, IDs, and categories and filters published, draft, and sold-out rows", async () => {
  const user = userEvent.setup();
  render(<TableHarness />);

  const search = screen.getByRole("searchbox", { name: "상품 검색" });
  await user.type(search, "lutein-draft");
  expect(screen.getByText("루테인 초안")).toBeVisible();
  expect(screen.queryByText("데일리 오메가3")).not.toBeInTheDocument();

  await user.clear(search);
  await user.type(search, "혈행 건강");
  expect(screen.getByText("데일리 오메가3")).toBeVisible();

  await user.clear(search);
  await user.selectOptions(screen.getByRole("combobox", { name: "상태 필터" }), "published");
  expect(screen.getByText("데일리 오메가3")).toBeVisible();
  expect(screen.getByText("비타민 D")).toBeVisible();
  expect(screen.queryByText("루테인 초안")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByRole("combobox", { name: "상태 필터" }), "sold-out");
  expect(screen.getByText("비타민 D")).toBeVisible();
  expect(screen.queryByText("루테인 초안")).not.toBeInTheDocument();

  await user.selectOptions(screen.getByRole("combobox", { name: "상태 필터" }), "draft");
  expect(screen.getByText("루테인 초안")).toBeVisible();
  expect(screen.queryByText("비타민 D")).not.toBeInTheDocument();
});

it("sorts by latest modification by default and exposes media, status, timestamp, and relevant actions", () => {
  render(<TableHarness />);

  const bodyRows = screen.getAllByRole("row").slice(1);
  expect(within(bodyRows[0]!).getByText("루테인 초안")).toBeVisible();
  expect(within(bodyRows[1]!).getByText("데일리 오메가3")).toBeVisible();
  expect(screen.getByRole("img", { name: "오메가3 병" })).toHaveAttribute("src", "omega.jpg");
  expect(within(bodyRows[0]!).getByText("임시 저장")).toBeVisible();
  expect(within(bodyRows[1]!).getByText("판매 중")).toBeVisible();
  expect(within(bodyRows[2]!).getAllByText("품절")).toHaveLength(2);
  expect(screen.getByText("루테인 초안").closest("tr")?.querySelector("time")).toHaveAttribute("datetime", "2026-08-19T03:00:00.000Z");

  expect(screen.getByRole("button", { name: "데일리 오메가3 수정" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "데일리 오메가3 복제" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "데일리 오메가3 미리 보기" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "데일리 오메가3 판매 중지" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "루테인 초안 판매 공개" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "루테인 초안 삭제" })).toBeEnabled();
});

it("locks only the document with an in-flight mutation", () => {
  render(<TableHarness lockedIds={new Set(["daily-omega-3"])} />);

  expect(screen.getByRole("button", { name: "데일리 오메가3 복제" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "데일리 오메가3 삭제" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "비타민 D 수정" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "루테인 초안 판매 공개" })).toBeEnabled();
});
