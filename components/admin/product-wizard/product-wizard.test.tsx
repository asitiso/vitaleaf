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

it("flushes the latest draft before validating a publish attempt", async () => {
  const user = userEvent.setup();
  const props = propsFor();
  render(<ProductWizard {...props} />);

  await user.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(props.onSave).toHaveBeenCalledOnce();
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
  resolveSave();
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
  render(<ProductWizard {...propsFor({ currentStep: 2 })} upload={upload} deleteImage={vi.fn()} />);

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
  })} onChange={onChange} onPublish={onPublish} upload={upload} deleteImage={vi.fn()} />);

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
  render(<ProductWizard {...propsFor({ currentStep: 2 })} upload={upload} deleteImage={vi.fn()} />);

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
  const view = render(<ProductWizard {...props} upload={upload} deleteImage={vi.fn()} />);

  await user.upload(screen.getByLabelText("상품 이미지 추가"), new File(["old"], "old.jpg", { type: "image/jpeg" }));
  view.rerender(<ProductWizard {...props} draft={draft({
    ...props.draft,
    sessionId: "session-b",
    currentStep: 2,
    media: [{ url: "b.jpg", storagePath: "products/draft-1/b.jpg", alt: "B", order: 0 }],
  })} upload={upload} deleteImage={vi.fn()} />);

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
