import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("../../lib/firebase/client", () => ({ auth: {}, db: {} }));

vi.mock("../../lib/firebase/products", () => ({
  deleteProduct: vi.fn(),
  saveProduct: vi.fn(),
  subscribeProducts: vi.fn(),
}));

vi.mock("../../lib/firebase/product-drafts", () => ({
  createDraftId: vi.fn(),
  createProductEditDraft: vi.fn(),
  publishDraft: vi.fn(),
  saveDraft: vi.fn(),
  startDraftSession: vi.fn(),
  subscribeDrafts: vi.fn(),
}));

vi.mock("../../lib/firebase/product-media", () => ({
  uploadProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  validateImageFile: vi.fn(() => ({ ok: true })),
}));

import type { Product, ProductDraft } from "../../lib/products/types";
import { createAdminAuth } from "../../lib/firebase/auth";
import { AdminDashboard, type AdminDashboardDependencies } from "./admin-dashboard";

const product: Product = {
  id: "omega",
  name: "데일리 오메가3",
  slug: "daily-omega",
  category: "혈행 건강",
  concerns: ["혈행"],
  price: 28000,
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
  stock: 4,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  revision: 4,
  createdAt: null,
  updatedAt: null,
};

const dependencies = (overrides: Partial<AdminDashboardDependencies> = {}): AdminDashboardDependencies => ({
  observeAdminSession: (next) => {
    next("signed-out");
    return vi.fn();
  },
  signInAdmin: vi.fn().mockResolvedValue("admin"),
  signOutAdmin: vi.fn().mockResolvedValue(undefined),
  subscribeProducts: vi.fn(),
  saveProduct: vi.fn().mockResolvedValue("saved-id"),
  deleteProduct: vi.fn().mockResolvedValue(undefined),
  subscribeDrafts: vi.fn(),
  createDraftId: vi.fn(() => "draft-new"),
  startDraftSession: vi.fn((value: ProductDraft) => ({ ...value, sessionId: "session-new" })),
  createProductEditDraft: vi.fn((value: Product) => productDraft(value)),
  saveDraft: vi.fn(async (value: ProductDraft) => ({ ...value, revision: value.revision + 1 })),
  publishDraft: vi.fn().mockResolvedValue(undefined),
  uploadProductImage: vi.fn(),
  deleteProductImage: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const productDraft = (value: Product = product, overrides: Partial<ProductDraft> = {}): ProductDraft => ({
  ...value,
  media: value.media,
  status: "published-copy",
  mode: "edit",
  sessionId: "session-edit",
  revision: 0,
  sourceProductId: value.id,
  sourceProductRevision: value.revision ?? 0,
  sourceCreatedAt: value.createdAt,
  sourceCreatedBy: value.createdBy ?? null,
  currentStep: 1,
  createdBy: null,
  updatedBy: null,
  ...overrides,
});

it("never mounts product write controls for a signed-out or forbidden user", async () => {
  const forbidden = dependencies({
    observeAdminSession: (next) => {
      next("forbidden");
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={forbidden} />);

  expect(await screen.findByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "새 상품 등록" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "상품 저장" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("상품 CSV 파일")).not.toBeInTheDocument();
  expect(screen.getByText("관리자 권한이 없는 계정입니다.")).toBeVisible();
});

it("mounts CSV write controls only for an authorized admin and imports through the existing save adapter", async () => {
  const user = userEvent.setup();
  const saveProduct = vi.fn().mockResolvedValue("created-id");
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([product]);
      return vi.fn();
    },
    saveProduct,
  });
  render(<AdminDashboard dependencies={deps} />);

  expect(await screen.findByRole("heading", { name: "CSV 일괄 관리" })).toBeVisible();
  await user.upload(screen.getByLabelText("상품 CSV 파일"), new File([[
    "name,category,price,stock",
    "비타민 C,항산화,18000,20",
  ].join("\n")], "products.csv", { type: "text/csv" }));
  await user.click(await screen.findByRole("button", { name: "1개 상품 가져오기" }));

  await waitFor(() => expect(saveProduct).toHaveBeenCalledWith(expect.objectContaining({
    name: "비타민 C",
    category: "항산화",
    price: 18_000,
    stock: 20,
  })));
});

it("does not remount write controls when a stale admin check resolves after sign-out", async () => {
  let emitUser!: (user: { uid: string } | null) => void;
  let resolveAdmin!: (record: { role: string }) => void;
  const adminAuth = createAdminAuth({
    signIn: vi.fn(),
    readAdmin: vi.fn(() => new Promise<{ role: string }>((resolve) => {
      resolveAdmin = resolve;
    })),
    signOut: vi.fn(),
    observe: vi.fn((next) => {
      emitUser = next;
      return vi.fn();
    }),
    getSession: () => ({ uid: null, generation: 1 }),
  });
  render(<AdminDashboard dependencies={dependencies({ observeAdminSession: adminAuth.observeAdminSession })} />);

  act(() => {
    emitUser({ uid: "admin-1" });
    emitUser(null);
  });
  expect(await screen.findByRole("heading", { name: "관리자 로그인" })).toBeVisible();

  await act(async () => {
    resolveAdmin({ role: "admin" });
    await Promise.resolve();
  });

  expect(screen.queryByRole("button", { name: "새 상품 등록" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "상품 저장" })).not.toBeInTheDocument();
});

it("keeps observer-authorized user B mounted when stale sign-in A resolves", async () => {
  const user = userEvent.setup();
  let emitSession!: (state: "admin" | "signed-out" | "forbidden") => void;
  let resolveSignIn!: (state: "stale") => void;
  const deps = dependencies({
    observeAdminSession: (next) => {
      emitSession = next;
      next("signed-out");
      return vi.fn();
    },
    signInAdmin: vi.fn(() => new Promise<"stale">((resolve) => {
      resolveSignIn = resolve;
    })),
    subscribeProducts: (onData) => {
      onData([product]);
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.type(screen.getByLabelText("이메일"), "admin-a@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  act(() => emitSession("admin"));
  expect(await screen.findByRole("heading", { name: "상품 관리" })).toBeVisible();

  await act(async () => {
    resolveSignIn("stale");
    await Promise.resolve();
  });

  expect(screen.getByRole("heading", { name: "상품 관리" })).toBeVisible();
  expect(screen.getByRole("button", { name: "새 상품 등록" })).toBeVisible();
});

it("logs in, searches products, toggles stock, and confirms deletion", async () => {
  const user = userEvent.setup();
  const saveProduct = vi.fn().mockResolvedValue("omega");
  const deleteProduct = vi.fn().mockResolvedValue(undefined);
  const deps = dependencies({
    subscribeProducts: (onData) => {
      onData([product, { ...product, id: "vitamin", name: "비타민 D", stock: 0 }]);
      return vi.fn();
    },
    saveProduct,
    deleteProduct,
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.type(screen.getByLabelText("이메일"), "admin@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  expect(await screen.findByRole("heading", { name: "상품 관리" })).toBeVisible();

  await user.type(screen.getByLabelText("상품 검색"), "오메가");
  expect(screen.getByText("데일리 오메가3")).toBeVisible();
  expect(screen.queryByText("비타민 D")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "데일리 오메가3 품절 처리" }));
  await waitFor(() => expect(saveProduct).toHaveBeenCalledWith(
    expect.objectContaining({ stock: 0 }),
    { id: "omega", expectedRevision: 4 },
  ));
  expect(await screen.findByText("재고 상태를 변경했습니다.")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "데일리 오메가3 삭제" }));
  expect(screen.getByRole("dialog", { name: "상품 삭제 확인" })).toBeVisible();
  expect(deleteProduct).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "삭제 확인" }));
  await waitFor(() => expect(deleteProduct).toHaveBeenCalledWith("omega"));
  expect(await screen.findByText("상품을 삭제했습니다.")).toBeVisible();
});

it("opens create and edit forms only after authorization", async () => {
  const user = userEvent.setup();
  const deps = dependencies({
    subscribeProducts: (onData) => {
      onData([product]);
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={deps} />);
  await user.type(screen.getByLabelText("이메일"), "admin@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));

  await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
  expect(screen.getByRole("heading", { name: "새 상품 등록" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "편집 닫기" }));
  await user.click(screen.getByRole("button", { name: "데일리 오메가3 수정" }));
  expect(screen.getByRole("heading", { name: "데일리 오메가3 수정" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "임시 저장" }));
  await waitFor(() => expect(deps.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
    id: "omega",
    name: product.name,
    sourceProductRevision: 4,
  })));
});

it("moves focus into the delete dialog, traps it, closes on Escape, and restores the trigger", async () => {
  const user = userEvent.setup();
  const deps = dependencies({
    subscribeProducts: (onData) => {
      onData([product]);
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={deps} />);
  await user.type(screen.getByLabelText("이메일"), "admin@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));

  const deleteTrigger = await screen.findByRole("button", { name: "데일리 오메가3 삭제" });
  await user.click(deleteTrigger);
  const dialog = screen.getByRole("dialog", { name: "상품 삭제 확인" });
  const cancel = screen.getByRole("button", { name: "취소" });
  const confirm = screen.getByRole("button", { name: "삭제 확인" });
  expect(dialog).toBeVisible();
  expect(cancel).toHaveFocus();

  await user.tab({ shift: true });
  expect(confirm).toHaveFocus();
  await user.tab();
  expect(cancel).toHaveFocus();
  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog", { name: "상품 삭제 확인" })).not.toBeInTheDocument();
  expect(deleteTrigger).toHaveFocus();
  expect(deps.deleteProduct).not.toHaveBeenCalled();
});

it("flushes the authoritative edit draft and publishes once before returning to the dashboard", async () => {
  const publishable = {
    ...product,
    media: [{ url: "omega.jpg", storagePath: null, alt: "오메가", order: 0 }],
    thumbnailUrl: "omega.jpg",
    images: ["omega.jpg"],
    dosage: "하루 한 번",
    ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    origin: "한국",
    cautions: ["권장량을 지켜 주세요."],
  };
  const saveDraft = vi.fn(async (value: ProductDraft) => ({ ...value, revision: 1 }));
  const publishDraft = vi.fn().mockResolvedValue(undefined);
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([publishable]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([]);
      return vi.fn();
    },
    createProductEditDraft: vi.fn(() => productDraft(publishable)),
    saveDraft,
    publishDraft,
  });
  render(<AdminDashboard dependencies={deps} />);

  await userEvent.click(await screen.findByRole("button", { name: `${product.name} 수정` }));
  const publish = screen.getByRole("button", { name: "판매 공개" });
  act(() => {
    publish.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    publish.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await waitFor(() => expect(publishDraft).toHaveBeenCalledOnce());
  expect(saveDraft).toHaveBeenCalledOnce();
  expect(publishDraft).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
  expect(saveDraft.mock.invocationCallOrder[0]).toBeLessThan(publishDraft.mock.invocationCallOrder[0]);
  expect(screen.queryByRole("heading", { name: "상품 등록" })).not.toBeInTheDocument();
});

it("keeps a failed publish editable", async () => {
  const publishable = {
    ...product,
    media: [{ url: "omega.jpg", storagePath: null, alt: "오메가", order: 0 }],
    dosage: "하루 한 번",
    ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    origin: "한국",
    cautions: ["권장량을 지켜 주세요."],
  };
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([publishable]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([]);
      return vi.fn();
    },
    createProductEditDraft: vi.fn(() => productDraft(publishable)),
    publishDraft: vi.fn().mockRejectedValue(new Error("offline")),
  });
  render(<AdminDashboard dependencies={deps} />);

  await userEvent.click(await screen.findByRole("button", { name: `${product.name} 수정` }));
  await userEvent.click(screen.getByRole("button", { name: "판매 공개" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("판매 공개를 완료하지 못했습니다");
  expect(screen.getByRole("heading", { name: "상품 등록" })).toBeVisible();
});

it("uses the autosave confirmation before closing a dirty new draft", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([]);
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
  await user.type(screen.getByLabelText("상품명"), "오메가");
  await user.click(screen.getByRole("button", { name: "편집 닫기" }));
  expect(screen.getByRole("heading", { name: "상품 등록" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "편집 닫기" }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("heading", { name: "상품 등록" })).not.toBeInTheDocument();
});
