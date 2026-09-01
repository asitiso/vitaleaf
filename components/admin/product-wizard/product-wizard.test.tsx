import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("../../../lib/firebase/product-media", () => ({
  uploadProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  validateImageFile: (candidate: Pick<File, "type" | "size">) => (
    ["image/jpeg", "image/png", "image/webp"].includes(candidate.type) && candidate.size <= 10 * 1024 * 1024
      ? { ok: true }
      : { ok: false, message: "지원하지 않는 파일 형식입니다." }
  ),
}));

import type { ProductDraft } from "../../../lib/products/types";
import type { MediaUpload } from "./media-step";
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};

it("moves through four labelled steps and focuses the first publish error", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor()} />);

  expect(screen.getByRole("navigation", { name: "상품 등록 4단계" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(screen.getByLabelText("상품명")).toHaveFocus();
  expect(screen.getByLabelText("상품명")).toHaveAccessibleDescription("상품명을 입력해 주세요.");
});

it("shows legacy Korean taxonomy values in the canonical wizard controls", () => {
  render(<ProductWizard {...propsFor({ category: "유산균", concerns: ["장 건강", "면역"] })} />);

  expect(screen.getByLabelText("상품 분류")).toHaveValue("probiotic");
  expect(screen.getByRole("checkbox", { name: "장 건강" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "면역" })).toBeChecked();
});

const explicitPurchaseOptions = () => [
  {
    id: "two-month",
    label: "2개월분",
    durationMonths: 2,
    sku: "OMEGA-2M",
    priceAdjustment: -5_000,
    stock: 4,
    active: true,
    isDefault: false,
  },
  {
    id: "four-month",
    label: "4개월분",
    durationMonths: 4,
    sku: "OMEGA-4M",
    priceAdjustment: 0,
    stock: 6,
    active: true,
    isDefault: true,
  },
];

const publishableSalesDraft = (overrides: Partial<ProductDraft> = {}): Partial<ProductDraft> => ({
  currentStep: 4,
  name: "오메가",
  category: "nutrition",
  price: 20_000,
  stock: 10,
  purchaseOptions: explicitPurchaseOptions(),
  media: [{ url: "omega.jpg", storagePath: null, alt: "오메가", order: 0 }],
  dosage: "하루 한 번",
  ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
  origin: "한국",
  cautions: ["권장량을 지켜 주세요."],
  ...overrides,
});

it("lets an administrator select a recommendation age", async () => {
  const user = userEvent.setup();
  const props = propsFor({ ageTargets: [] });
  render(<ProductWizard {...props} />);

  await user.click(screen.getByRole("checkbox", { name: "어린이" }));

  expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ ageTargets: ["child"] }));
});

it("validates an incomplete draft before attempting to save it", async () => {
  const user = userEvent.setup();
  const props = propsFor();
  render(<ProductWizard {...props} />);

  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.onPublish).not.toHaveBeenCalled();
  expect(screen.getByLabelText("상품명")).toHaveFocus();
});

it("moves to the earliest visible error step and focuses its invalid control", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor({
    name: "오메가",
    category: "nutrition",
    price: 10_000,
    stock: 1,
    media: [{ url: "omega.jpg", storagePath: null, alt: "오메가", order: 0 }],
    dosage: "하루 한 번",
    ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    origin: "",
    cautions: [],
  })} />);

  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(screen.getByRole("heading", { name: "상세 정보를 입력하세요" })).toBeVisible();
  const origin = screen.getByRole("textbox", { name: /^원산지/ });
  expect(origin).toHaveFocus();
  expect(origin).toHaveAccessibleDescription("원산지를 입력해 주세요.");
});

it("marks the media slot invalid when publish needs an image", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor({
    name: "오메가",
    category: "nutrition",
    price: 10_000,
    stock: 1,
    dosage: "하루 한 번",
    ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    origin: "한국",
    cautions: ["권장량을 지켜 주세요."],
  })} />);

  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(screen.getByLabelText("상품 이미지 업로드 영역")).toHaveAttribute("aria-invalid", "true");
});

it("focuses the first invalid repeatable input with its error description", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor({
    name: "오메가",
    category: "nutrition",
    price: 10_000,
    stock: 1,
    media: [{ url: "omega.jpg", storagePath: null, alt: "오메가", order: 0 }],
    dosage: "하루 한 번",
    ingredients: [],
    origin: "한국",
    cautions: ["권장량을 지켜 주세요."],
  })} />);

  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  const ingredient = screen.getByRole("group", { name: "성분 1" }).querySelector("input")!;
  expect(ingredient).toHaveFocus();
  expect(ingredient).toHaveAccessibleDescription("이름이 있는 성분을 한 개 이상 추가해 주세요.");
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

it("preserves a manual slug for the same draft but resets it for another editing identity", async () => {
  const user = userEvent.setup();
  const props = propsFor({ id: "draft-a", sessionId: "session-a" });
  const { rerender } = render(<ProductWizard {...props} />);

  await user.type(screen.getByLabelText("슬러그"), "custom-slug");
  rerender(<ProductWizard {...props} draft={draft({ id: "draft-a", sessionId: "session-a", name: "첫 상품", slug: "custom-slug" })} />);
  await user.type(screen.getByLabelText("상품명"), " 추가");
  expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ slug: "custom-slug" }));

  rerender(<ProductWizard {...props} draft={draft({ id: "draft-b", sessionId: "session-b", name: "New", slug: "" })} />);
  await user.type(screen.getByLabelText("상품명"), " Product");
  expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ slug: "new-product" }));
});

it("applies a category template only after confirming a non-empty draft and leaves claims and sales data unchanged", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const props = propsFor({
    name: "기존 상품",
    description: "이미 작성한 설명",
    benefits: ["기존 효능"],
    certifications: ["기존 인증"],
    price: 25_000,
    stock: 12,
    ratingAverage: 4.8,
    reviewCount: 15,
  });
  render(<ProductWizard {...props} />);

  await user.selectOptions(screen.getByLabelText("상품 등록 양식"), "omega3");

  expect(confirm).toHaveBeenCalledOnce();
  expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    category: "nutrition",
    ingredients: [
      { name: "EPA", amount: "", dailyValue: "" },
      { name: "DHA", amount: "", dailyValue: "" },
    ],
    dosage: "",
    description: "이미 작성한 설명",
    benefits: ["기존 효능"],
    certifications: ["기존 인증"],
    price: 25_000,
    stock: 12,
    ratingAverage: 4.8,
    reviewCount: 15,
  }));
});

it("requires confirmation for media-only and rating-only drafts, but not an empty draft", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  confirm.mockClear();
  const mediaOnly = propsFor({ media: [{ url: "only.jpg", storagePath: null, alt: "", order: 0 }] });
  const { rerender } = render(<ProductWizard {...mediaOnly} />);

  await user.selectOptions(screen.getByLabelText("상품 등록 양식"), "vitamin");
  expect(confirm).toHaveBeenCalledOnce();
  expect(mediaOnly.onChange).not.toHaveBeenCalled();

  const ratingOnly = propsFor({ ratingAverage: 4.5, reviewCount: 1 });
  rerender(<ProductWizard {...ratingOnly} />);
  await user.selectOptions(screen.getByLabelText("상품 등록 양식"), "vitamin");
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(ratingOnly.onChange).not.toHaveBeenCalled();

  const empty = propsFor();
  rerender(<ProductWizard {...empty} />);
  await user.selectOptions(screen.getByLabelText("상품 등록 양식"), "vitamin");
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(empty.onChange).toHaveBeenCalledOnce();
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

it("focuses the new and then nearest actionable control for every repeatable detail row", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor({ currentStep: 3 })} />);

  for (const [label, rowName] of [["효능", "효능 1"], ["성분", "성분 1"], ["인증", "인증 1"], ["주의사항", "주의사항 1"]] as const) {
    await user.click(screen.getByRole("button", { name: `${label} 추가` }));
    const row = screen.getByRole("group", { name: rowName });
    expect(row.querySelector("input")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: `${rowName} 삭제` }));
    expect(screen.getByRole("button", { name: `${label} 추가` })).toHaveFocus();
  }
});

it("keeps the adjacent repeatable input mounted and focused after removing a preceding row", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor({ currentStep: 3 })} />);

  await user.click(screen.getByRole("button", { name: "효능 추가" }));
  await user.click(screen.getByRole("button", { name: "효능 추가" }));
  const secondInput = screen.getByRole("group", { name: "효능 2" }).querySelector("input")!;
  await user.click(screen.getByRole("button", { name: "효능 1 삭제" }));

  expect(secondInput).toHaveFocus();
  expect(secondInput).toBeInTheDocument();
});

it("reconciles same-draft external row changes before adding, removing, and focusing rows", async () => {
  const user = userEvent.setup();
  const props = propsFor({ id: "draft-external", sessionId: "session-external", currentStep: 3 });
  const { rerender } = render(<ProductWizard {...props} />);

  rerender(<ProductWizard {...props} draft={draft({
    id: "draft-external",
    sessionId: "session-external",
    currentStep: 3,
    benefits: ["첫 효능", "둘째 효능"],
    ingredients: [{ name: "A", amount: "1mg", dailyValue: "" }, { name: "B", amount: "2mg", dailyValue: "" }],
    certifications: ["GMP", "HACCP"],
    cautions: ["주의 1", "주의 2"],
  })} />);

  const benefitInputs = [
    screen.getByRole("group", { name: "효능 1" }).querySelector("input")!,
    screen.getByRole("group", { name: "효능 2" }).querySelector("input")!,
  ];
  expect(new Set(benefitInputs.map((input) => input.id)).size).toBe(2);
  expect(benefitInputs.every((input) => input.id && !input.id.includes("undefined"))).toBe(true);

  await user.click(screen.getByRole("button", { name: "효능 1 삭제" }));
  expect(benefitInputs[1]).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "효능 추가" }));
  expect(screen.getByRole("group", { name: "효능 2" }).querySelector("input")).toHaveFocus();

  rerender(<ProductWizard {...props} draft={draft({
    id: "draft-external",
    sessionId: "session-external",
    currentStep: 3,
    benefits: [],
    ingredients: [],
    certifications: [],
    cautions: [],
  })} />);
  expect(screen.queryByRole("group", { name: "효능 1" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "성분 1" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "인증 1" })).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "주의사항 1" })).not.toBeInTheDocument();
});

it("reconciles validation-only rows when the controlled draft adds and removes their data", async () => {
  const user = userEvent.setup();
  const props = propsFor({
    id: "draft-validation-row",
    sessionId: "session-validation-row",
    currentStep: 3,
    name: "오메가",
    category: "nutrition",
    price: 10_000,
    stock: 1,
    media: [{ url: "omega.jpg", storagePath: null, alt: "오메가", order: 0 }],
    dosage: "하루 한 번",
    ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    origin: "한국",
    cautions: [],
  });
  const { rerender } = render(<ProductWizard {...props} />);

  await user.click(screen.getByRole("button", { name: "판매 공개" }));
  const virtualInput = screen.getByRole("group", { name: "주의사항 1" }).querySelector("input")!;
  expect(virtualInput).toHaveFocus();

  rerender(<ProductWizard {...props} draft={draft({ ...props.draft, cautions: ["식후에 섭취하세요."] })} />);
  await user.click(screen.getByRole("button", { name: "판매 공개" }));
  expect(virtualInput).toBeInTheDocument();

  rerender(<ProductWizard {...props} draft={draft({ ...props.draft, cautions: [] })} />);
  expect(screen.queryByRole("group", { name: "주의사항 1" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "주의사항 추가" }));
  const addedInput = screen.getByRole("group", { name: "주의사항 1" }).querySelector("input")!;
  expect(addedInput).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "주의사항 1 삭제" }));
  expect(screen.getByRole("button", { name: "주의사항 추가" })).toHaveFocus();
});

it("prevents a second save while the first save is pending", async () => {
  const user = userEvent.setup();
  let resolveSave!: () => void;
  const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
  render(<ProductWizard {...propsFor({ name: "오메가", category: "nutrition", price: 10000, stock: 1 })} onSave={onSave} />);

  await user.click(screen.getByRole("button", { name: "임시 저장" }));
  await user.click(screen.getByRole("button", { name: "저장 중" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveSave();
    await Promise.resolve();
  });
  expect(screen.getByRole("button", { name: "임시 저장" })).toBeEnabled();
});

it("contains preview failures and prevents duplicate preview requests while pending", async () => {
  const user = userEvent.setup();
  let rejectPreview!: (error: Error) => void;
  const onPreview = vi.fn(() => new Promise<void>((_, reject) => { rejectPreview = reject; }));
  render(<ProductWizard {...propsFor()} onPreview={onPreview} />);

  const preview = screen.getByRole("button", { name: "미리 보기" });
  await user.click(preview);
  expect(preview).toBeDisabled();
  await user.click(preview);
  expect(onPreview).toHaveBeenCalledTimes(1);
  rejectPreview(new Error("preview unavailable"));

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("미리 보기를 완료하지 못했습니다."));
});

it("blocks publishing while a product image upload is in progress", async () => {
  const user = userEvent.setup();
  const pending = deferred<{ url: string; storagePath: string; alt: string; order: number }>();
  const upload = vi.fn<MediaUpload>(() => ({ promise: pending.promise, cancel: vi.fn() }));
  render(<ProductWizard {...propsFor({ currentStep: 2 })} upload={upload} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), new File(["image"], "front.jpg", { type: "image/jpeg" }));
  expect(screen.getByRole("button", { name: "판매 공개" })).toBeDisabled();

  pending.resolve({ url: "front.jpg", storagePath: "products/draft-1/front.jpg", alt: "front", order: 0 });
  await waitFor(() => expect(screen.getByRole("button", { name: "판매 공개" })).toBeEnabled());
});

it("locks publishing synchronously before two clicks can start duplicate requests", async () => {
  const pending = deferred<void>();
  const onPublish = vi.fn(() => pending.promise);
  render(<ProductWizard {...propsFor({
    name: "오메가",
    category: "nutrition",
    price: 10_000,
    stock: 1,
    media: [{ url: "omega.jpg", storagePath: null, alt: "오메가", order: 0 }],
    dosage: "하루 한 번",
    ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    origin: "한국",
    cautions: ["권장량을 지켜 주세요."],
  })} onPublish={onPublish} />);

  const publish = screen.getByRole("button", { name: "판매 공개" });
  act(() => {
    publish.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    publish.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await waitFor(() => expect(onPublish).toHaveBeenCalledOnce());
});

it("blocks drop, drag, pointer, and media change paths for the full deferred publish", async () => {
  const pending = deferred<void>();
  const onPublish = vi.fn(() => pending.promise);
  const onChange = vi.fn();
  const blockedUpload = deferred<{ url: string; storagePath: string; alt: string; order: number }>();
  const upload = vi.fn<MediaUpload>(() => ({ promise: blockedUpload.promise, cancel: vi.fn() }));
  render(<ProductWizard {...propsFor({
    currentStep: 2,
    name: "오메가",
    category: "nutrition",
    price: 10_000,
    stock: 1,
    media: [
      { url: "first.jpg", storagePath: null, alt: "first", order: 0 },
      { url: "second.jpg", storagePath: null, alt: "second", order: 1 },
    ],
    dosage: "하루 한 번",
    ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    origin: "한국",
    cautions: ["권장량을 지켜 주세요."],
  })} onChange={onChange} onPublish={onPublish} upload={upload} />);

  await userEvent.click(screen.getByRole("button", { name: "판매 공개" }));
  await waitFor(() => expect(onPublish).toHaveBeenCalledOnce());
  onChange.mockClear();

  const dropZone = screen.getByText(/JPEG, PNG, WebP/).parentElement!;
  const firstCard = screen.getByRole("img", { name: "first" }).closest("article")!;
  const secondCard = screen.getByRole("img", { name: "second" }).closest("article")!;
  const dataTransfer = {
    files: [new File(["image"], "blocked.jpg", { type: "image/jpeg" })],
    effectAllowed: "none",
    setData: vi.fn(),
    getData: vi.fn(() => "second.jpg"),
  };

  fireEvent.drop(dropZone, { dataTransfer });
  fireEvent.dragStart(secondCard, { dataTransfer });
  fireEvent.drop(firstCard, { dataTransfer });
  fireEvent.pointerDown(secondCard);
  fireEvent.pointerUp(firstCard);
  fireEvent.change(screen.getByLabelText("두 번째 이미지 대체 텍스트"), { target: { value: "changed" } });

  expect(upload).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(firstCard).toHaveAttribute("aria-disabled", "true");
  expect(firstCard).toHaveAttribute("draggable", "false");
});

it("keeps an upload alive when staff moves to another wizard step", async () => {
  const user = userEvent.setup();
  const pending = deferred<{ url: string; storagePath: string; alt: string; order: number }>();
  const upload = vi.fn<MediaUpload>(() => ({ promise: pending.promise, cancel: vi.fn() }));
  render(<ProductWizard {...propsFor({ currentStep: 2 })} upload={upload} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), new File(["image"], "front.jpg", { type: "image/jpeg" }));
  await user.click(screen.getByRole("button", { name: "다음 단계: 상세 정보" }));
  expect(screen.getByRole("button", { name: "판매 공개" })).toBeDisabled();

  pending.resolve({ url: "front.jpg", storagePath: "products/draft-1/front.jpg", alt: "front", order: 0 });
  await waitFor(() => expect(screen.getByRole("button", { name: "판매 공개" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: /상품 이미지/ }));
  expect(screen.getByRole("img", { name: "front" })).toBeVisible();
});

it("resets media work for a new draft session and ignores the old upload after remount", async () => {
  const user = userEvent.setup();
  const oldUpload = deferred<{ url: string; storagePath: string; alt: string; order: number }>();
  const newUpload = deferred<{ url: string; storagePath: string; alt: string; order: number }>();
  const oldCancel = vi.fn();
  const newCancel = vi.fn();
  const upload = vi.fn<MediaUpload>()
    .mockReturnValueOnce({ promise: oldUpload.promise, cancel: oldCancel })
    .mockReturnValueOnce({ promise: newUpload.promise, cancel: newCancel });
  const props = propsFor({ id: "draft-1", sessionId: "session-a", currentStep: 2 });
  const view = render(<ProductWizard {...props} upload={upload} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), new File(["old"], "old.jpg", { type: "image/jpeg" }));
  view.rerender(<ProductWizard {...props} draft={draft({
    ...props.draft,
    sessionId: "session-b",
    currentStep: 2,
    media: [{ url: "b.jpg", storagePath: "products/draft-1/b.jpg", alt: "B", order: 0 }],
  })} upload={upload} />);

  expect(oldCancel).toHaveBeenCalledOnce();
  expect(screen.getByRole("img", { name: "B" })).toHaveAttribute("src", "b.jpg");
  oldUpload.resolve({ url: "old.jpg", storagePath: "products/draft-1/old.jpg", alt: "old", order: 0 });
  await waitFor(() => expect(screen.queryByRole("img", { name: "old" })).not.toBeInTheDocument());

  await user.upload(screen.getByLabelText("상품 이미지 추가"), new File(["new"], "new.jpg", { type: "image/jpeg" }));
  expect(screen.getByRole("button", { name: "판매 공개" })).toBeDisabled();
  expect(newCancel).not.toHaveBeenCalled();
});

it("shows the same operation alert when preview throws synchronously", async () => {
  const user = userEvent.setup();
  render(<ProductWizard {...propsFor()} onPreview={() => { throw new Error("preview unavailable"); }} />);

  await user.click(screen.getByRole("button", { name: "미리 보기" }));

  expect(screen.getByRole("alert")).toHaveTextContent("미리 보기를 완료하지 못했습니다.");
});

it("keeps the familiar single stock control for the implicit legacy default option", () => {
  render(<ProductWizard {...propsFor({
    currentStep: 4,
    price: 20_000,
    stock: 7,
    purchaseOptions: [{
      id: "default",
      label: "기본 구성",
      durationMonths: null,
      sku: "",
      priceAdjustment: 0,
      stock: 7,
      active: true,
      isDefault: true,
    }],
  })} />);

  expect(screen.getByLabelText("재고 수량")).toHaveValue(7);
  expect(screen.queryByRole("group", { name: "구매 옵션 관리" })).not.toBeInTheDocument();
});

it("routes fractional legacy stock to the visible stock control", async () => {
  const user = userEvent.setup();
  const props = propsFor(publishableSalesDraft({
    stock: 1.5,
    purchaseOptions: undefined,
  }));
  render(<ProductWizard {...props} />);

  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.onPublish).not.toHaveBeenCalled();
  const stockInput = document.getElementById("wizard-stock");
  expect(stockInput).toBeInstanceOf(HTMLInputElement);
  expect(stockInput).toHaveFocus();
  expect(stockInput).toHaveAccessibleDescription("재고 수량을 0 이상의 정수로 입력해 주세요.");
  expect(screen.queryByRole("group", { name: "구매 옵션 관리" })).not.toBeInTheDocument();
});

it("uses integer KRW inputs and surfaces a fractional selling-price error", async () => {
  const user = userEvent.setup();
  const props = propsFor(publishableSalesDraft({ price: 20_000.5 }));
  render(<ProductWizard {...props} />);

  const price = screen.getByLabelText("판매가");
  const originalPrice = screen.getByLabelText("정상가 (선택)");
  expect(price).toHaveAttribute("step", "1");
  expect(originalPrice).toHaveAttribute("step", "1");

  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.onPublish).not.toHaveBeenCalled();
  expect(price).toHaveFocus();
  expect(price).toHaveAccessibleDescription("판매가를 1원 이상의 정수로 입력해 주세요.");
});

it("does not hide a default-shaped option whose stock disagrees with legacy stock", () => {
  render(<ProductWizard {...propsFor({
    currentStep: 4,
    price: 20_000,
    stock: 7,
    purchaseOptions: [{
      id: "default",
      label: "기본 구성",
      durationMonths: null,
      sku: "",
      priceAdjustment: 0,
      stock: 5,
      active: true,
      isDefault: true,
    }],
  })} />);

  expect(screen.queryByLabelText("재고 수량")).not.toBeInTheDocument();
  expect(screen.getByRole("group", { name: "구매 옵션 관리" })).toBeVisible();
});

it("lets staff opt a legacy product into explicit options without re-entering its stock", async () => {
  const user = userEvent.setup();
  const props = propsFor({ currentStep: 4, price: 20_000, stock: 7, purchaseOptions: [] });
  render(<ProductWizard {...props} />);

  await user.click(screen.getByRole("button", { name: "구매 옵션 사용" }));

  expect(screen.queryByLabelText("재고 수량")).not.toBeInTheDocument();
  expect(screen.getByRole("group", { name: "구매 옵션 관리" })).toBeVisible();
  expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    stock: 7,
    purchaseOptions: [expect.objectContaining({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      label: "기본 구성",
      sku: "OPTION-1",
      stock: 7,
      active: true,
      isDefault: true,
    })],
  }));
});

it("uses option stock as authoritative and synchronizes the read-only active total", async () => {
  const user = userEvent.setup();
  const props = propsFor(publishableSalesDraft());
  render(<ProductWizard {...props} />);

  expect(screen.queryByLabelText("재고 수량")).not.toBeInTheDocument();
  expect(screen.getByLabelText("활성 옵션 총 재고")).toHaveValue("10개");

  const stock = screen.getByLabelText("옵션 1 재고");
  await user.clear(stock);
  await user.type(stock, "8");

  expect(screen.getByLabelText("활성 옵션 총 재고")).toHaveValue("14개");
  expect(props.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ stock: 14 }));
});

it("blocks publishing invalid explicit options and focuses their editor", async () => {
  const user = userEvent.setup();
  const options = explicitPurchaseOptions().map((option) => ({ ...option, sku: "DUPLICATE" }));
  const props = propsFor(publishableSalesDraft({ purchaseOptions: options }));
  props.onSave.mockRejectedValue(new Error("saveDraft rejected invalid purchase options"));
  render(<ProductWizard {...props} />);

  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.onPublish).not.toHaveBeenCalled();
  expect(screen.getByRole("group", { name: "구매 옵션 관리" })).toHaveFocus();
  expect(screen.getAllByText("구매 옵션의 기본 구성, SKU, 재고와 최종 가격을 확인해 주세요.")).toHaveLength(2);
  expect(screen.getByText("Purchase option SKU values must be unique.")).toBeVisible();
});

it("routes an unsafe option adjustment back to the sales options editor", async () => {
  const user = userEvent.setup();
  const options = explicitPurchaseOptions().map((option, index) => index === 0
    ? { ...option, priceAdjustment: Number.MAX_SAFE_INTEGER + 1 }
    : option);
  const props = propsFor(publishableSalesDraft({ purchaseOptions: options }));
  render(<ProductWizard {...props} />);

  const adjustment = screen.getByLabelText("옵션 1 가격 조정액");
  expect(adjustment).toHaveAttribute("step", "1");
  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(props.onSave).not.toHaveBeenCalled();
  expect(props.onPublish).not.toHaveBeenCalled();
  expect(screen.getByRole("group", { name: "구매 옵션 관리" })).toHaveFocus();
  expect(adjustment).toHaveAccessibleDescription("구매 옵션의 기본 구성, SKU, 재고와 최종 가격을 확인해 주세요.");
});
