import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ProductDraft } from "../../../lib/products/types";
import { ProductWizard } from "./product-wizard";

const draft = (overrides: Partial<ProductDraft> = {}): ProductDraft => ({
  id: "draft-1",
  name: "",
  slug: "",
  category: "",
  concerns: [],
  price: 0,
  originalPrice: null,
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
  stock: 0,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  status: "draft",
  mode: "create",
  sessionId: null,
  revision: 0,
  sourceProductId: null,
  sourceProductRevision: null,
  sourceCreatedAt: null,
  sourceCreatedBy: null,
  currentStep: 1,
  createdAt: null,
  updatedAt: null,
  createdBy: null,
  updatedBy: null,
  ...overrides,
});

const propsFor = (overrides: Partial<ProductDraft> = {}) => ({
  draft: draft(overrides),
  saveState: "idle" as const,
  onChange: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
  onPreview: vi.fn(),
  onPublish: vi.fn().mockResolvedValue(undefined),
});

it("moves through four labelled steps and focuses the first publish error", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor()} />);

  expect(screen.getByRole("navigation", { name: "상품 등록 4단계" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(screen.getByLabelText("상품명")).toHaveFocus();
  expect(screen.getByLabelText("상품명")).toHaveAccessibleDescription("상품명을 입력해 주세요.");
});

it("keeps an automatically generated slug until staff edit it themselves", async () => {
  const user = userEvent.setup();
  const props = propsFor();
  const { rerender } = render(<ProductWizard {...props} />);

  await user.type(screen.getByLabelText("상품명"), "Daily Omega");
  expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ slug: "daily-omega" }));

  rerender(<ProductWizard {...props} draft={draft({ name: "Daily Omega", slug: "daily-omega" })} />);
  await user.clear(screen.getByLabelText("슬러그"));
  await user.type(screen.getByLabelText("슬러그"), "my-omega");
  await user.type(screen.getByLabelText("상품명"), " 플러스");

  expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ slug: "my-omega" }));
});

it("adds and removes detail rows with named controls", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor({ currentStep: 2 })} />);

  await user.click(screen.getByRole("button", { name: "다음 단계: 상세 정보" }));
  await user.click(screen.getByRole("button", { name: "효능 추가" }));
  expect(screen.getByRole("group", { name: "효능 1" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "효능 1 삭제" }));
  expect(screen.queryByRole("group", { name: "효능 1" })).not.toBeInTheDocument();
});

it("prevents a second save while the first save is pending", async () => {
  const user = userEvent.setup();
  let resolveSave!: () => void;
  const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
  render(<ProductWizard {...propsFor({ name: "오메가", category: "nutrition", price: 10000, stock: 1 })} onSave={onSave} />);

  await user.click(screen.getByRole("button", { name: "임시 저장" }));
  await user.click(screen.getByRole("button", { name: "저장 중" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  resolveSave();
});
