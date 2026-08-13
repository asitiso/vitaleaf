import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("../../../../../lib/firebase/client", () => ({ auth: {}, db: {} }));
vi.mock("../../../../../lib/firebase/product-drafts", () => ({ getDraft: vi.fn() }));
vi.mock("../../../../../lib/firebase/auth", () => ({ observeAdminSession: vi.fn() }));
vi.mock("../../../../../lib/firebase/reviews", () => ({ getApprovedReviews: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CartProvider } from "../../../../../features/cart/cart-context";
import type { AdminSessionState } from "../../../../../lib/firebase/auth";
import type { ProductDraft } from "../../../../../lib/products/types";
import { DraftPreview, type DraftPreviewDependencies } from "./draft-preview";

const draft: ProductDraft = {
  id: "draft-1",
  name: "데일리 오메가3",
  slug: "daily-omega-3",
  category: "혈행 건강",
  concerns: ["혈행"],
  price: 32_000,
  originalPrice: null,
  thumbnailUrl: "omega.jpg",
  images: ["omega.jpg"],
  media: [{ url: "omega.jpg", storagePath: null, alt: "오메가", order: 0 }],
  description: "혈행 건강",
  benefits: [],
  ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
  dosage: "하루 한 번",
  origin: "한국",
  certifications: [],
  cautions: ["권장량을 지켜 주세요."],
  stock: 3,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  status: "draft",
  mode: "create",
  sessionId: "session-1",
  revision: 2,
  sourceProductId: null,
  sourceProductRevision: null,
  sourceCreatedAt: null,
  sourceCreatedBy: null,
  currentStep: 4,
  createdAt: null,
  updatedAt: null,
  createdBy: "admin-1",
  updatedBy: "admin-1",
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};

const dependencies = (overrides: Partial<DraftPreviewDependencies> = {}): DraftPreviewDependencies => ({
  observeAdminSession: vi.fn(),
  getDraft: vi.fn().mockResolvedValue(draft),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

it("authorizes before loading and renders the existing detail with purchase controls disabled", async () => {
  let emit!: (state: AdminSessionState) => void;
  const getDraft = vi.fn().mockResolvedValue(draft);
  const deps = dependencies({
    observeAdminSession: (next) => {
      emit = next;
      return vi.fn();
    },
    getDraft,
  });
  render(<CartProvider><DraftPreview draftId="draft-1" dependencies={deps} /></CartProvider>);

  expect(screen.getByRole("status")).toHaveTextContent("관리자 권한");
  expect(getDraft).not.toHaveBeenCalled();
  act(() => emit("admin"));

  expect(await screen.findByText("미리보기")).toBeVisible();
  expect(getDraft).toHaveBeenCalledWith("draft-1");
  expect(screen.getByRole("heading", { name: draft.name })).toBeVisible();
  expect(screen.getByRole("button", { name: "장바구니 담기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "바로 구매" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "수량 늘리기" })).toBeDisabled();
});

it("never renders a stale draft after authorization is revoked", async () => {
  let emit!: (state: AdminSessionState) => void;
  const pending = deferred<ProductDraft | null>();
  const deps = dependencies({
    observeAdminSession: (next) => {
      emit = next;
      return vi.fn();
    },
    getDraft: vi.fn(() => pending.promise),
  });
  render(<CartProvider><DraftPreview draftId="draft-1" dependencies={deps} /></CartProvider>);

  act(() => emit("admin"));
  expect(await screen.findByText("초안을 불러오는 중입니다.")).toBeVisible();
  act(() => emit("signed-out"));
  expect(await screen.findByRole("heading", { name: "미리보기 권한이 없습니다" })).toBeVisible();

  await act(async () => {
    pending.resolve(draft);
    await pending.promise;
  });
  expect(screen.queryByRole("heading", { name: draft.name })).not.toBeInTheDocument();
});

it("shows forbidden sessions without touching the draft repository", async () => {
  const getDraft = vi.fn();
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("forbidden");
      return vi.fn();
    },
    getDraft,
  });
  render(<CartProvider><DraftPreview draftId="draft-1" dependencies={deps} /></CartProvider>);

  expect(await screen.findByRole("heading", { name: "미리보기 권한이 없습니다" })).toBeVisible();
  expect(getDraft).not.toHaveBeenCalled();
});

it("retries a failed draft load", async () => {
  const user = userEvent.setup();
  const getDraft = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(draft);
  const observeAdminSession = vi.fn((next: (state: AdminSessionState) => void) => {
    next("admin");
    return vi.fn();
  });
  const deps = dependencies({
    observeAdminSession,
    getDraft,
  });
  render(<CartProvider><DraftPreview draftId="draft-1" dependencies={deps} /></CartProvider>);

  expect(await screen.findByRole("alert")).toHaveTextContent("초안을 불러오지 못했습니다");
  await user.click(screen.getByRole("button", { name: "다시 시도" }));

  expect(await screen.findByRole("heading", { name: draft.name })).toBeVisible();
  expect(getDraft).toHaveBeenCalledTimes(2);
  expect(observeAdminSession).toHaveBeenCalledOnce();
});
