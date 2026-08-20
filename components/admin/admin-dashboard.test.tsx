import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { afterEach, expect, it, vi } from "vitest";

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
import { createAdminAuth, type AdminSessionState } from "../../lib/firebase/auth";
import { AdminDashboard, type AdminDashboardDependencies } from "./admin-dashboard";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

it("never mounts product write controls for a signed-out or forbidden user", async () => {
  const forbidden = dependencies({
    observeAdminSession: (next) => {
      next("forbidden");
      next("signed-out");
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

it("clears the catalog and editor on checking and ignores callbacks from the old admin generation", async () => {
  const user = userEvent.setup();
  let emitSession!: (state: AdminSessionState) => void;
  const productCallbacks: Array<(products: Product[]) => void> = [];
  const draftCallbacks: Array<(drafts: ProductDraft[]) => void> = [];
  const deps = dependencies({
    observeAdminSession: (next) => {
      emitSession = next;
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      productCallbacks.push(onData);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      draftCallbacks.push(onData);
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={deps} />);

  act(() => emitSession("admin"));
  await waitFor(() => expect(productCallbacks).toHaveLength(1));
  act(() => {
    productCallbacks[0]([product]);
    draftCallbacks[0]([productDraft(product, { name: "Admin A draft" })]);
  });
  await user.click(screen.getByRole("button", { name: "Admin A draft 초안 이어 쓰기" }));
  expect(screen.getByRole("heading", { name: "Admin A draft 수정" })).toBeVisible();

  act(() => emitSession("checking"));
  expect(screen.getByRole("status")).toHaveTextContent("관리자 권한을 확인하는 중입니다.");
  act(() => {
    productCallbacks[0]([{ ...product, name: "Stale admin A product" }]);
    draftCallbacks[0]([productDraft(product, { name: "Stale admin A draft" })]);
  });
  act(() => emitSession("admin"));
  await waitFor(() => expect(productCallbacks).toHaveLength(2));

  expect(screen.queryByText("Stale admin A product")).not.toBeInTheDocument();
  expect(screen.queryByText("Stale admin A draft")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Admin A draft 수정" })).not.toBeInTheDocument();
  expect(screen.getByText("등록된 상품이 없습니다.")).toBeVisible();
});

it("keeps observer-authorized user B mounted when stale sign-in A resolves", async () => {
  const user = userEvent.setup();
  let emitSession!: (state: AdminSessionState) => void;
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

it("replaces subscriptions when sign-in and the observer both authorize the same session", async () => {
  const user = userEvent.setup();
  let emitSession!: (state: AdminSessionState) => void;
  let resolveSignIn!: (state: "admin") => void;
  const productCallbacks: Array<(products: Product[]) => void> = [];
  const deps = dependencies({
    observeAdminSession: (next) => {
      emitSession = next;
      next("signed-out");
      return vi.fn();
    },
    signInAdmin: vi.fn(() => new Promise<"admin">((resolve) => { resolveSignIn = resolve; })),
    subscribeProducts: (onData) => {
      productCallbacks.push(onData);
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.type(screen.getByLabelText("이메일"), "admin@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  act(() => emitSession("checking"));
  await act(async () => {
    resolveSignIn("admin");
    await Promise.resolve();
  });
  await waitFor(() => expect(productCallbacks).toHaveLength(1));

  act(() => emitSession("admin"));
  await waitFor(() => expect(productCallbacks).toHaveLength(2));
  act(() => {
    productCallbacks[0]([{ ...product, name: "Stale subscription" }]);
    productCallbacks[1]([{ ...product, name: "Current subscription" }]);
  });

  expect(screen.queryByText("Stale subscription")).not.toBeInTheDocument();
  expect(screen.getByText("Current subscription")).toBeVisible();
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

it("freezes editing, media, closing, and logout for the full deferred publish lifetime", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm");
  const pendingPublish = deferred<void>();
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
    createProductEditDraft: vi.fn(() => productDraft(publishable, { currentStep: 2 })),
    publishDraft: vi.fn(() => pendingPublish.promise),
  });
  render(<><a href="#store">스토어</a><AdminDashboard dependencies={deps} /></>);

  await user.click(await screen.findByRole("button", { name: `${product.name} 수정` }));
  await user.click(screen.getByRole("button", { name: "판매 공개" }));
  await waitFor(() => expect(deps.publishDraft).toHaveBeenCalledOnce());

  expect(screen.getByRole("region", { name: "상품 등록" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "편집 닫기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "로그아웃" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /3상세 정보/ })).toBeDisabled();
  const altInput = screen.getByLabelText("첫 번째 이미지 대체 텍스트");
  expect(altInput).toBeDisabled();
  const fileInput = screen.getByLabelText("상품 이미지 추가");
  expect(fileInput).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "편집 닫기" }));
  await user.click(screen.getByRole("button", { name: "로그아웃" }));
  await user.type(altInput, " 변경");
  await user.upload(fileInput, new File(["image"], "new.jpg", { type: "image/jpeg" }));
  const navigation = new MouseEvent("click", { bubbles: true, cancelable: true });
  screen.getByRole("link", { name: "스토어" }).dispatchEvent(navigation);
  expect(screen.getByRole("heading", { name: `${product.name} 수정` })).toBeVisible();
  expect(altInput).toHaveValue("오메가");
  expect(navigation.defaultPrevented).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  expect(deps.signOutAdmin).not.toHaveBeenCalled();
  expect(deps.uploadProductImage).not.toHaveBeenCalled();

  await act(async () => {
    pendingPublish.resolve();
    await pendingPublish.promise;
  });
  expect(screen.queryByRole("heading", { name: `${product.name} 수정` })).not.toBeInTheDocument();
});

it("ignores an old admin publish completion after a new admin starts publishing", async () => {
  const user = userEvent.setup();
  let emitSession!: (state: AdminSessionState) => void;
  const productSubscriptions: Array<(products: Product[]) => void> = [];
  const publishA = deferred<void>();
  const publishB = deferred<void>();
  const publishableA: Product = {
    ...product,
    media: [{ url: "a.jpg", storagePath: null, alt: "A", order: 0 }],
    thumbnailUrl: "a.jpg",
    images: ["a.jpg"],
    dosage: "하루 한 번",
    ingredients: [{ name: "EPA", amount: "600mg", dailyValue: "" }],
    origin: "한국",
    cautions: ["권장량을 지켜 주세요."],
  };
  const publishableB: Product = {
    ...publishableA,
    id: "vitamin-b",
    name: "비타민 B",
    slug: "vitamin-b",
    media: [{ url: "b.jpg", storagePath: null, alt: "B", order: 0 }],
    thumbnailUrl: "b.jpg",
    images: ["b.jpg"],
  };
  const publishDraft = vi.fn()
    .mockImplementationOnce(() => publishA.promise)
    .mockImplementationOnce(() => publishB.promise);
  const deps = dependencies({
    observeAdminSession: (next) => {
      emitSession = next;
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      productSubscriptions.push(onData);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([]);
      return vi.fn();
    },
    createProductEditDraft: vi.fn((value) => productDraft(value)),
    publishDraft,
  });
  render(<AdminDashboard dependencies={deps} />);

  act(() => emitSession("admin"));
  await waitFor(() => expect(productSubscriptions).toHaveLength(1));
  act(() => productSubscriptions[0]([publishableA]));
  await user.click(await screen.findByRole("button", { name: `${publishableA.name} 수정` }));
  await user.click(screen.getByRole("button", { name: "판매 공개" }));
  await waitFor(() => expect(publishDraft).toHaveBeenCalledTimes(1));

  act(() => emitSession("checking"));
  expect(screen.getByRole("status")).toHaveTextContent("관리자 권한을 확인하는 중입니다.");
  act(() => emitSession("admin"));
  await waitFor(() => expect(productSubscriptions).toHaveLength(2));
  act(() => productSubscriptions[1]([publishableB]));
  await user.click(await screen.findByRole("button", { name: `${publishableB.name} 수정` }));
  await user.click(screen.getByRole("button", { name: "판매 공개" }));
  await waitFor(() => expect(publishDraft).toHaveBeenCalledTimes(2));

  await act(async () => {
    publishA.resolve();
    await publishA.promise;
  });

  expect(screen.getByRole("heading", { name: `${publishableB.name} 수정` })).toBeVisible();
  expect(screen.getByRole("region", { name: "상품 등록" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "공개 중" })).toBeDisabled();
  expect(screen.queryByText("상품을 판매 공개했습니다.")).not.toBeInTheDocument();
});

it("opens a blank preview window synchronously and navigates it only after a slow flush", async () => {
  const user = userEvent.setup();
  const pendingSave = deferred<ProductDraft>();
  const previewWindow = {
    location: { href: "about:blank" },
    opener: window,
    close: vi.fn(),
  };
  const open = vi.spyOn(window, "open").mockReturnValue(previewWindow as unknown as Window);
  const initial = productDraft(product, { revision: 0 });
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([product]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([]);
      return vi.fn();
    },
    createProductEditDraft: vi.fn(() => initial),
    saveDraft: vi.fn(() => pendingSave.promise),
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.click(await screen.findByRole("button", { name: `${product.name} 수정` }));
  await user.click(screen.getByRole("button", { name: "미리 보기" }));

  expect(open).toHaveBeenCalledWith("", "_blank");
  expect(previewWindow.opener).toBeNull();
  expect(previewWindow.location.href).toBe("about:blank");
  expect(previewWindow.close).not.toHaveBeenCalled();

  await act(async () => {
    pendingSave.resolve({ ...initial, revision: 1 });
    await pendingSave.promise;
  });
  await waitFor(() => expect(previewWindow.location.href).toBe("/admin/products/preview/omega"));
});

it("closes the synchronously opened preview when flush fails", async () => {
  const user = userEvent.setup();
  const previewWindow = { location: { href: "about:blank" }, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(previewWindow as unknown as Window);
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([product]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([]);
      return vi.fn();
    },
    saveDraft: vi.fn().mockRejectedValue(new Error("offline")),
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.click(await screen.findByRole("button", { name: `${product.name} 수정` }));
  await user.click(screen.getByRole("button", { name: "미리 보기" }));

  expect(await screen.findByText(/미리 보기를 완료하지 못했습니다/)).toBeVisible();
  expect(previewWindow.close).toHaveBeenCalledOnce();
  expect(previewWindow.location.href).toBe("about:blank");
});

it("shows an actionable error when the browser blocks the preview popup", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "open").mockReturnValue(null);
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([product]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([]);
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.click(await screen.findByRole("button", { name: `${product.name} 수정` }));
  await user.click(screen.getByRole("button", { name: "미리 보기" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("팝업 차단을 해제");
  expect(deps.saveDraft).not.toHaveBeenCalled();
});

it("handles a rejected autosave retry without discarding the editor", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "open").mockReturnValue({
    location: { href: "about:blank" },
    close: vi.fn(),
  } as unknown as Window);
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([product]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([]);
      return vi.fn();
    },
    saveDraft: vi.fn().mockRejectedValue(new Error("still offline")),
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.click(await screen.findByRole("button", { name: `${product.name} 수정` }));
  await user.click(screen.getByRole("button", { name: "미리 보기" }));
  await user.click(await screen.findByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(deps.saveDraft).toHaveBeenCalledTimes(2));

  expect(screen.getByRole("heading", { name: `${product.name} 수정` })).toBeVisible();
  expect(screen.getByText("자동 저장하지 못했습니다. 편집 내용은 유지됩니다.", { exact: false })).toBeVisible();
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

it("uses the same unsaved confirmation before logout", async () => {
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
  await user.click(screen.getByRole("button", { name: "로그아웃" }));
  expect(deps.signOutAdmin).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "상품 등록" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "로그아웃" }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(deps.signOutAdmin).toHaveBeenCalledOnce();
});

it("guards actual product links only while the active editor has unsaved work", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
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
  render(<><Link href="/products">스토어</Link><AdminDashboard dependencies={deps} /></>);

  await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
  await user.type(screen.getByLabelText("상품명"), "오메가");
  const storeLink = screen.getByRole("link", { name: "스토어" });

  const cancelled = new MouseEvent("click", { bubbles: true, cancelable: true });
  storeLink.dispatchEvent(cancelled);
  expect(cancelled.defaultPrevented).toBe(true);
  expect(screen.getByRole("heading", { name: "상품 등록" })).toBeVisible();

  const allowed = new MouseEvent("click", { bubbles: true, cancelable: true });
  storeLink.dispatchEvent(allowed);
  expect(allowed.defaultPrevented).toBe(false);

  await user.click(screen.getByRole("button", { name: "편집 닫기" }));
  confirm.mockClear();
  const afterClose = new MouseEvent("click", { bubbles: true, cancelable: true });
  storeLink.dispatchEvent(afterClose);
  expect(afterClose.defaultPrevented).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});

it("restores a dirty editor after a cancelled Back and allows the next Back without leaving a listener", async () => {
  window.history.replaceState({}, "", "/products");
  window.history.pushState({}, "", "/admin/products");
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
  const view = render(<AdminDashboard dependencies={deps} />);

  await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
  await user.type(screen.getByLabelText("상품명"), "오메가");

  act(() => window.history.back());
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  expect(window.location.pathname).toBe("/admin/products");
  expect(screen.getByRole("heading", { name: "상품 등록" })).toBeVisible();

  act(() => window.history.back());
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  expect(window.location.pathname).toBe("/products");

  view.unmount();
  confirm.mockClear();
  window.history.pushState({}, "", "/admin/products");
  act(() => window.history.back());
  await waitFor(() => expect(window.location.pathname).toBe("/products"));
  expect(confirm).not.toHaveBeenCalled();
});
