import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";

const replaceRoute = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceRoute }),
}));

vi.mock("../../lib/firebase/client", () => ({ auth: {}, db: {} }));

vi.mock("../../lib/firebase/products", () => ({
  deleteProduct: vi.fn(),
  saveProduct: vi.fn(),
  subscribeProducts: vi.fn(),
}));

vi.mock("../../lib/firebase/product-drafts", () => ({
  createDraftId: vi.fn(),
  createProductEditDraft: vi.fn(),
  discardDraft: vi.fn(),
  duplicateProductToDraft: vi.fn(),
  publishDraft: vi.fn(),
  saveDraft: vi.fn(),
  startDraftSession: vi.fn(),
  subscribeDrafts: vi.fn(),
  unpublishProduct: vi.fn(),
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
  replaceRoute.mockReset();
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
  unpublishProduct: vi.fn(async (value: Product) => productDraft(value, { mode: "restore", status: "draft", revision: 1 })),
  discardDraft: vi.fn().mockResolvedValue(undefined),
  duplicateProductToDraft: vi.fn(async () => productDraft(product, {
    id: "omega-copy",
    name: "데일리 오메가3 (복사본)",
    mode: "create",
    status: "draft",
    stock: 0,
  })),
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

function PersistentMenuLink({
  onNavigate,
}: {
  onNavigate(event: ReactMouseEvent<HTMLAnchorElement>): void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <span>{isOpen ? "메뉴 열림" : "메뉴 닫힘"}</span>
      <Link
        href="/story?from=admin"
        onClick={(event) => {
          setIsOpen(false);
          onNavigate(event);
        }}
      >브랜드 이야기</Link>
    </>
  );
}

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

it("imports valid CSV rows only as newly-sessioned review drafts without touching published products", async () => {
  const user = userEvent.setup();
  const saveProduct = vi.fn().mockResolvedValue("created-id");
  const saveDraft = vi.fn(async (value: ProductDraft) => ({ ...value, revision: 1 }));
  const createDraftId = vi.fn()
    .mockReturnValueOnce("csv-draft-1")
    .mockReturnValueOnce("csv-draft-2");
  const startDraftSession = vi.fn((value: ProductDraft) => ({ ...value, sessionId: `session-${value.id}` }));
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
    saveDraft,
    createDraftId,
    startDraftSession,
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.click(await screen.findByRole("tab", { name: "CSV 관리" }));
  expect(await screen.findByRole("heading", { name: "CSV 일괄 관리" })).toBeVisible();
  await user.upload(screen.getByLabelText("상품 CSV 파일"), new File([[
    "name,category,price,stock",
    "비타민 C,항산화,18000,20",
  ].join("\n")], "products.csv", { type: "text/csv" }));
  await user.click(await screen.findByRole("button", { name: "1개 상품을 임시저장으로 가져오기" }));

  await waitFor(() => expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
    id: "csv-draft-1",
    sessionId: "session-csv-draft-1",
    status: "draft",
    mode: "create",
    name: "비타민 C",
    category: "항산화",
    price: 18_000,
    stock: 20,
  })));
  expect(saveProduct).not.toHaveBeenCalled();
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
  await user.click(screen.getByRole("tab", { name: "임시 저장" }));
  await user.click(screen.getByRole("button", { name: "Admin A draft 수정" }));
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
  expect(screen.getByText("조건에 맞는 상품이 없습니다.")).toBeVisible();
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

it("does not replace subscriptions when sign-in and the observer authorize the same session", async () => {
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
  await waitFor(() => expect(productCallbacks).toHaveLength(1));
  act(() => {
    productCallbacks[0]([{ ...product, name: "Stale subscription" }]);
  });

  expect(screen.getByText("Stale subscription")).toBeVisible();
});

it("keeps a CSV draft import live when the observer already authorized the same admin", async () => {
  const user = userEvent.setup();
  let emitSession!: (state: AdminSessionState) => void;
  const login = deferred<"admin">();
  const save = deferred<ProductDraft>();
  const saveDraft = vi.fn(() => save.promise);
  const deps = dependencies({
    observeAdminSession: (next) => { emitSession = next; next("signed-out"); return vi.fn(); },
    signInAdmin: vi.fn(() => login.promise),
    saveDraft,
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.type(screen.getByLabelText("이메일"), "admin@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  act(() => emitSession("admin"));
  await user.click(await screen.findByRole("tab", { name: "CSV 관리" }));
  await user.upload(screen.getByLabelText("상품 CSV 파일"), new File(["name,category,price,stock\nA,vitamin,1000,1"], "a.csv", { type: "text/csv" }));
  await user.click(await screen.findByRole("button", { name: "1개 상품을 임시저장으로 가져오기" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledOnce());

  await act(async () => { login.resolve("admin"); await Promise.resolve(); });
  await act(async () => { save.resolve(productDraft(product, { id: "csv-a", mode: "create", status: "draft" })); });

  expect(await screen.findByText("상품 1개를 임시저장했습니다.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /임시저장으로 가져오기/ })).not.toBeInTheDocument();
  expect(saveDraft).toHaveBeenCalledOnce();
});

it("ignores a completed CSV import after an observer authorization boundary", async () => {
  const user = userEvent.setup();
  let emitSession!: (state: AdminSessionState) => void;
  const save = deferred<ProductDraft>();
  const saveDraft = vi.fn(() => save.promise);
  const deps = dependencies({
    observeAdminSession: (next) => { emitSession = next; next("admin"); return vi.fn(); },
    saveDraft,
  });
  render(<AdminDashboard dependencies={deps} />);
  await user.click(await screen.findByRole("tab", { name: "CSV 관리" }));
  await user.upload(screen.getByLabelText("상품 CSV 파일"), new File(["name,category,price,stock\nA,vitamin,1000,1"], "a.csv", { type: "text/csv" }));
  await user.click(await screen.findByRole("button", { name: "1개 상품을 임시저장으로 가져오기" }));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledOnce());
  act(() => emitSession("signed-out"));
  await act(async () => save.resolve(productDraft(product, { id: "csv-a", mode: "create", status: "draft" })));

  expect(screen.queryByText("상품 1개를 임시저장했습니다.")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  expect(saveDraft).toHaveBeenCalledOnce();
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
  await waitFor(() => expect(deleteProduct).toHaveBeenCalledWith({ id: "omega", expectedRevision: 4 }));
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
  const onNavigate = vi.fn();
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
  render(<><Link href="/products" onClick={onNavigate}>스토어</Link><AdminDashboard dependencies={deps} /></>);

  await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
  await user.type(screen.getByLabelText("상품명"), "오메가");
  const storeLink = screen.getByRole("link", { name: "스토어" });

  const cancelled = new MouseEvent("click", { bubbles: true, cancelable: true });
  storeLink.dispatchEvent(cancelled);
  expect(cancelled.defaultPrevented).toBe(true);
  expect(screen.getByRole("heading", { name: "상품 등록" })).toBeVisible();
  expect(onNavigate).not.toHaveBeenCalled();
  expect(replaceRoute).not.toHaveBeenCalled();

  const allowed = new MouseEvent("click", { bubbles: true, cancelable: true });
  storeLink.dispatchEvent(allowed);
  expect(allowed.defaultPrevented).toBe(true);
  expect(replaceRoute).toHaveBeenCalledWith("/products");
  expect(replaceRoute).toHaveBeenCalledTimes(1);
  expect(onNavigate).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole("button", { name: "편집 닫기" }));
  confirm.mockClear();
  const afterClose = new MouseEvent("click", { bubbles: true, cancelable: true });
  storeLink.dispatchEvent(afterClose);
  expect(afterClose.defaultPrevented).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});

it("replaces the sentinel with an accepted internal route and preserves the exact two-Back state sequence", async () => {
  const previousState = Object.freeze({ __NA: true, tree: ["products"], key: "previous" });
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  const destinationState = Object.freeze({ __NA: true, tree: ["story"], key: "destination" });
  window.history.replaceState(previousState, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  const adminHistoryLength = window.history.length;
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const callbackObservations: Array<{
    defaultPrevented: boolean;
    editorOpen: boolean;
    pathname: string;
    state: unknown;
  }> = [];
  replaceRoute.mockImplementation((href: string) => {
    window.history.replaceState(destinationState, "", href);
  });
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
  const view = render(<>
    <PersistentMenuLink onNavigate={(event) => {
      callbackObservations.push({
        defaultPrevented: event.defaultPrevented,
        editorOpen: screen.queryByRole("heading", { name: "상품 등록" }) !== null,
        pathname: window.location.pathname,
        state: window.history.state,
      });
    }} />
    <AdminDashboard dependencies={deps} />
  </>);

  await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
  await user.type(screen.getByLabelText("상품명"), "오메가");
  expect(window.history.length).toBe(adminHistoryLength + 1);
  await user.click(screen.getByRole("link", { name: "브랜드 이야기" }));

  expect(screen.getByText("메뉴 닫힘")).toBeVisible();
  expect(callbackObservations).toEqual([{
    defaultPrevented: true,
    editorOpen: true,
    pathname: "/story",
    state: destinationState,
  }]);
  expect(replaceRoute).toHaveBeenCalledTimes(1);
  expect(window.history.length).toBe(adminHistoryLength + 1);
  expect(window.location.pathname).toBe("/story");
  expect(window.location.search).toBe("?from=admin");
  expect(window.history.state).toEqual(destinationState);
  view.unmount();

  act(() => window.history.back());
  await waitFor(() => expect(window.location.pathname).toBe("/admin/products"));
  expect(window.history.state).toEqual(originalAdminState);

  act(() => window.history.back());
  await waitFor(() => expect(window.location.pathname).toBe("/products"));
  expect(window.history.state).toEqual(previousState);
});

it("keeps the same sentinel armed when router replace throws, rejects, or returns without a route commit", async () => {
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  window.history.replaceState({ __NA: true, tree: ["products"], key: "previous" }, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  replaceRoute
    .mockImplementationOnce(() => { throw new Error("navigation rejected"); })
    .mockRejectedValueOnce(new Error("async navigation rejected"))
    .mockImplementationOnce(() => undefined);
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
  render(<><Link href="/story">브랜드 이야기</Link><AdminDashboard dependencies={deps} /></>);

  await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
  await user.type(screen.getByLabelText("상품명"), "오메가");
  const sentinelState = window.history.state;
  const link = screen.getByRole("link", { name: "브랜드 이야기" });

  expect(() => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).not.toThrow();
  expect(window.location.pathname).toBe("/admin/products");
  expect(window.history.state).toEqual(sentinelState);

  await act(async () => {
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  expect(window.location.pathname).toBe("/admin/products");
  expect(window.history.state).toEqual(sentinelState);

  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(window.location.pathname).toBe("/admin/products");
  expect(window.history.state).toEqual(sentinelState);
  expect(confirm).toHaveBeenCalledTimes(3);
  expect(replaceRoute).toHaveBeenCalledTimes(3);
});

it("ignores a same-document hash link without changing or disarming the sentinel", async () => {
  window.history.replaceState({ __NA: true, tree: ["admin"], key: "original" }, "", "/admin/products");
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
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
  render(<><Link href="#catalog">목록 위치</Link><AdminDashboard dependencies={deps} /></>);

  await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
  await user.type(screen.getByLabelText("상품명"), "오메가");
  const sentinelState = window.history.state;
  const hashClick = new MouseEvent("click", { bubbles: true, cancelable: true });
  screen.getByRole("link", { name: "목록 위치" }).dispatchEvent(hashClick);

  expect(hashClick.defaultPrevented).toBe(true);
  expect(window.location.pathname).toBe("/admin/products");
  expect(window.location.hash).toBe("");
  expect(window.history.state).toEqual(sentinelState);
  expect(confirm).not.toHaveBeenCalled();
  expect(replaceRoute).not.toHaveBeenCalled();
});

it("keeps router state on the admin sentinel until Back is confirmed, then replays Back once", async () => {
  const destinationState = Object.freeze({ __NA: true, tree: ["products"], key: "destination" });
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  window.history.replaceState(destinationState, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  const routerObservations: Array<{ pathname: string; state: unknown }> = [];
  const observeLikeRouter = (event: PopStateEvent) => {
    routerObservations.push({ pathname: window.location.pathname, state: event.state });
  };
  window.addEventListener("popstate", observeLikeRouter);
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
  try {
    await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
    await user.type(screen.getByLabelText("상품명"), "오메가");

    act(() => window.history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await waitFor(() => expect(routerObservations).toHaveLength(1));
    expect(window.location.pathname).toBe("/admin/products");
    expect(screen.getByRole("heading", { name: "상품 등록" })).toBeVisible();
    expect(routerObservations[0]).toEqual({
      pathname: "/admin/products",
      state: { __NA: true, tree: ["admin"], key: "original" },
    });
    expect(window.history.state).toMatchObject(originalAdminState);
    expect(Object.keys(window.history.state as object)).toHaveLength(4);

    act(() => window.history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(window.location.pathname).toBe("/products"));
    expect(routerObservations).toHaveLength(3);
    expect(routerObservations[1]).toEqual({
      pathname: "/admin/products",
      state: { __NA: true, tree: ["admin"], key: "original" },
    });
    expect(routerObservations[2]).toEqual({
      pathname: "/products",
      state: { __NA: true, tree: ["products"], key: "destination" },
    });
    expect(Object.keys(originalAdminState)).toEqual(["__NA", "tree", "key"]);
  } finally {
    view.unmount();
    window.removeEventListener("popstate", observeLikeRouter);
  }
});

it("rearms a cancelled Back synchronously before immediate editor cleanup", async () => {
  const destinationState = Object.freeze({ __NA: true, tree: ["products"], key: "destination" });
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  window.history.replaceState(destinationState, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  const initialLength = window.history.length;
  const routerObservations: Array<{ pathname: string; state: unknown }> = [];
  const observeLikeRouter = (event: PopStateEvent) => {
    routerObservations.push({ pathname: window.location.pathname, state: event.state });
  };
  window.addEventListener("popstate", observeLikeRouter);
  const go = vi.spyOn(window.history, "go");
  const user = userEvent.setup();
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
  const confirm = vi.spyOn(window, "confirm").mockImplementationOnce(() => {
    queueMicrotask(() => view.unmount());
    return false;
  });
  try {
    await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
    await user.type(screen.getByLabelText("상품명"), "오메가");
    await waitFor(() => expect(window.history.length).toBe(initialLength + 1));

    act(() => window.history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(go).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/admin/products");
    expect(window.history.state).toEqual(originalAdminState);
    expect(routerObservations).toEqual([
      { pathname: "/admin/products", state: originalAdminState },
    ]);
    expect(window.history.length).toBe(initialLength + 1);

    act(() => window.history.back());
    await waitFor(() => expect(routerObservations).toHaveLength(2));
    expect(routerObservations[1]).toEqual({
      pathname: "/admin/products",
      state: originalAdminState,
    });
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/products"));
    expect(routerObservations[2]).toEqual({
      pathname: "/products",
      state: destinationState,
    });
    expect(routerObservations.filter(({ pathname }) => pathname === "/products")).toHaveLength(1);
    expect(window.history.state).toEqual(destinationState);
    expect(Object.keys(originalAdminState)).toEqual(["__NA", "tree", "key"]);
    expect(Object.keys(destinationState)).toEqual(["__NA", "tree", "key"]);
  } finally {
    view.unmount();
    window.removeEventListener("popstate", observeLikeRouter);
  }
});

it("reuses one history sentinel across repeated dirty and saved cycles", async () => {
  const destinationState = Object.freeze({ __NA: true, tree: ["products"], key: "destination" });
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  window.history.replaceState(destinationState, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  const initialLength = window.history.length;
  const routerObservations: Array<{ pathname: string; state: unknown }> = [];
  const observeLikeRouter = (event: PopStateEvent) => {
    routerObservations.push({ pathname: window.location.pathname, state: event.state });
  };
  window.addEventListener("popstate", observeLikeRouter);
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
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
  try {
    await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
    const nameInput = screen.getByLabelText("상품명");

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await user.type(nameInput, String(cycle));
      await waitFor(() => expect(window.history.length).toBe(initialLength + 1));

      const beforeCancel = routerObservations.length;
      act(() => window.history.back());
      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(cycle));
      await waitFor(() => expect(routerObservations).toHaveLength(beforeCancel + 1));
      expect(routerObservations.slice(beforeCancel).every(({ pathname }) => pathname === "/admin/products")).toBe(true);
      expect(routerObservations.at(-1)?.state).toEqual(originalAdminState);
      expect(window.location.pathname).toBe("/admin/products");

      await user.click(screen.getByRole("button", { name: "임시 저장" }));
      await waitFor(() => expect(deps.saveDraft).toHaveBeenCalledTimes(cycle));
      expect(await screen.findByText("자동 저장되었습니다.")).toBeVisible();
      expect(window.history.length).toBe(initialLength + 1);
    }

    await user.type(nameInput, "4");
    await waitFor(() => expect(window.history.length).toBe(initialLength + 1));
    const beforeFinalCancel = routerObservations.length;
    act(() => window.history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(routerObservations).toHaveLength(beforeFinalCancel + 1));
    expect(routerObservations.slice(beforeFinalCancel).every(({ pathname }) => pathname === "/admin/products")).toBe(true);
    expect(routerObservations.at(-1)?.state).toEqual(originalAdminState);
    expect(window.location.pathname).toBe("/admin/products");

    const beforeAllow = routerObservations.length;
    act(() => window.history.back());
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(window.location.pathname).toBe("/products"));
    expect(routerObservations.slice(beforeAllow)).toEqual([
      { pathname: "/admin/products", state: originalAdminState },
      { pathname: "/products", state: destinationState },
    ]);
    expect(routerObservations.filter(({ pathname }) => pathname === "/products")).toHaveLength(1);
    expect(window.history.state).toEqual(destinationState);
    expect(Object.keys(originalAdminState)).toEqual(["__NA", "tree", "key"]);
  } finally {
    view.unmount();
    window.removeEventListener("popstate", observeLikeRouter);
  }
});

it("replays Back without prompting after the guarded draft is saved", async () => {
  const destinationState = Object.freeze({ __NA: true, tree: ["products"], key: "destination" });
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  window.history.replaceState(destinationState, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  const routerObservations: Array<{ pathname: string; state: unknown }> = [];
  const observeLikeRouter = (event: PopStateEvent) => {
    routerObservations.push({ pathname: window.location.pathname, state: event.state });
  };
  window.addEventListener("popstate", observeLikeRouter);
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm");
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
  try {
    await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
    await user.type(screen.getByLabelText("상품명"), "오메가");
    await user.click(screen.getByRole("button", { name: "임시 저장" }));
    expect(await screen.findByText("자동 저장되었습니다.")).toBeVisible();

    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/products"));
    expect(confirm).not.toHaveBeenCalled();
    expect(routerObservations).toEqual([
      { pathname: "/admin/products", state: originalAdminState },
      { pathname: "/products", state: destinationState },
    ]);
    expect(window.history.state).toEqual(destinationState);
    expect(Object.keys(originalAdminState)).toEqual(["__NA", "tree", "key"]);
  } finally {
    view.unmount();
    window.removeEventListener("popstate", observeLikeRouter);
  }
});

it("installs one sentinel across rerenders and neutralizes it synchronously on cleanup", async () => {
  const destinationState = Object.freeze({ __NA: true, tree: ["products"], key: "destination" });
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  window.history.replaceState(destinationState, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  const initialLength = window.history.length;
  const pendingSave = deferred<ProductDraft>();
  const routerObservations: Array<{ pathname: string; state: unknown }> = [];
  const observeLikeRouter = (event: PopStateEvent) => {
    routerObservations.push({ pathname: window.location.pathname, state: event.state });
  };
  window.addEventListener("popstate", observeLikeRouter);
  const user = userEvent.setup();
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
    saveDraft: vi.fn(() => pendingSave.promise),
  });
  const view = render(<AdminDashboard dependencies={deps} />);
  try {
    await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
    await user.type(screen.getByLabelText("상품명"), "오메가");
    await waitFor(() => expect(window.history.length).toBe(initialLength + 1));
    expect(window.history.state).toMatchObject(originalAdminState);
    expect(Object.keys(window.history.state as object)).toHaveLength(4);

    await user.type(screen.getByLabelText("상품명"), "3");
    await user.click(screen.getByRole("button", { name: "임시 저장" }));
    await waitFor(() => expect(deps.saveDraft).toHaveBeenCalledOnce());
    expect(window.history.length).toBe(initialLength + 1);

    view.unmount();
    expect(window.location.pathname).toBe("/admin/products");
    expect(window.history.state).toEqual(originalAdminState);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(routerObservations).toEqual([]);

    act(() => window.history.back());
    await waitFor(() => expect(routerObservations).toHaveLength(1));
    expect(routerObservations[0]).toEqual({
      pathname: "/admin/products",
      state: { __NA: true, tree: ["admin"], key: "original" },
    });
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/products"));
    expect(routerObservations[1]).toEqual({
      pathname: "/products",
      state: { __NA: true, tree: ["products"], key: "destination" },
    });
  } finally {
    view.unmount();
    window.removeEventListener("popstate", observeLikeRouter);
    pendingSave.resolve(productDraft());
  }
});

it("keeps one search across published and draft views and duplicates by product ID into a draft", async () => {
  const user = userEvent.setup();
  const duplicateProductToDraft = vi.fn().mockResolvedValue(productDraft(product, {
    id: "omega-copy",
    name: "데일리 오메가3 (복사본)",
    mode: "create",
    status: "draft",
    stock: 0,
  }));
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([product, { ...product, id: "vitamin", name: "비타민 D" }]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([productDraft(product, { id: "omega-draft", name: "오메가 작업 초안", mode: "create", status: "draft" })]);
      return vi.fn();
    },
    duplicateProductToDraft,
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.type(await screen.findByRole("searchbox", { name: "상품 검색" }), "오메가");
  expect(screen.getByText("데일리 오메가3")).toBeVisible();
  expect(screen.queryByText("비타민 D")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "데일리 오메가3 복제" }));
  await waitFor(() => expect(duplicateProductToDraft).toHaveBeenCalledWith("omega"));
  expect(await screen.findByText("복제 초안을 만들었습니다.")).toBeVisible();

  await user.click(screen.getByRole("tab", { name: "임시 저장" }));
  expect(screen.getByRole("searchbox", { name: "상품 검색" })).toHaveValue("오메가");
  expect(screen.getByText("오메가 작업 초안")).toBeVisible();
});

it("exposes tab counts and uses roving focus with Arrow, Home, and End keys", async () => {
  const user = userEvent.setup();
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([product, { ...product, id: "vitamin", name: "비타민 D" }]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([productDraft(product, { id: "omega-draft", name: "오메가 작업 초안" })]);
      return vi.fn();
    },
  });
  render(<AdminDashboard dependencies={deps} />);

  const publishedTab = await screen.findByRole("tab", { name: "판매 상품" });
  const draftsTab = screen.getByRole("tab", { name: "임시 저장" });
  const csvTab = screen.getByRole("tab", { name: "CSV 관리" });
  expect(publishedTab).toHaveAccessibleDescription("2개");
  expect(draftsTab).toHaveAccessibleDescription("1개");
  expect(publishedTab).toHaveAttribute("tabindex", "0");
  expect(draftsTab).toHaveAttribute("tabindex", "-1");
  expect(csvTab).toHaveAttribute("tabindex", "-1");

  publishedTab.focus();
  await user.keyboard("{ArrowRight}");
  expect(draftsTab).toHaveFocus();
  expect(draftsTab).toHaveAttribute("aria-selected", "true");
  expect(draftsTab).toHaveAttribute("tabindex", "0");

  await user.keyboard("{End}");
  expect(csvTab).toHaveFocus();
  expect(csvTab).toHaveAttribute("aria-selected", "true");

  await user.keyboard("{Home}");
  expect(publishedTab).toHaveFocus();
  expect(publishedTab).toHaveAttribute("aria-selected", "true");

  await user.keyboard("{ArrowLeft}");
  expect(csvTab).toHaveFocus();
  expect(csvTab).toHaveAttribute("aria-selected", "true");
});

it("guards unpublish and draft deletion, restores focus, and keeps each operation locked to its document", async () => {
  const user = userEvent.setup();
  const pendingUnpublish = deferred<ProductDraft>();
  const unpublishProduct = vi.fn(() => pendingUnpublish.promise);
  const discardDraft = vi.fn().mockResolvedValue(undefined);
  const savedDraft = productDraft(product, { id: "draft-only", name: "삭제할 초안", mode: "create", status: "draft" });
  const deps = dependencies({
    observeAdminSession: (next) => {
      next("admin");
      return vi.fn();
    },
    subscribeProducts: (onData) => {
      onData([product, { ...product, id: "vitamin", name: "비타민 D" }]);
      return vi.fn();
    },
    subscribeDrafts: (onData) => {
      onData([savedDraft]);
      return vi.fn();
    },
    unpublishProduct,
    discardDraft,
  });
  render(<AdminDashboard dependencies={deps} />);

  const unpublishTrigger = await screen.findByRole("button", { name: "데일리 오메가3 판매 중지" });
  await user.click(unpublishTrigger);
  const unpublishDialog = screen.getByRole("dialog", { name: "판매 중지 확인" });
  expect(within(unpublishDialog).getByText(/공개 상품에서 사라지고.*초안/)).toBeVisible();
  await user.click(within(unpublishDialog).getByRole("button", { name: "판매 중지" }));

  expect(unpublishProduct).toHaveBeenCalledTimes(1);
  expect(unpublishProduct).toHaveBeenCalledWith(product);
  expect(screen.getByRole("button", { name: "데일리 오메가3 판매 중지" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "비타민 D 수정" })).toBeEnabled();
  pendingUnpublish.resolve(productDraft(product, { mode: "restore", status: "draft", revision: 1 }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "판매 중지 확인" })).not.toBeInTheDocument());
  expect(unpublishTrigger).toHaveFocus();

  await user.click(screen.getByRole("tab", { name: "임시 저장" }));
  const deleteTrigger = screen.getByRole("button", { name: "삭제할 초안 삭제" });
  await user.click(deleteTrigger);
  const deleteDialog = screen.getByRole("dialog", { name: "초안 삭제 확인" });
  expect(within(deleteDialog).getByText(/임시 저장 내용/)).toBeVisible();
  await user.click(within(deleteDialog).getByRole("button", { name: "초안 삭제" }));

  await waitFor(() => expect(discardDraft).toHaveBeenCalledWith(savedDraft));
  expect(deleteTrigger).toHaveFocus();
  expect(deps.deleteProduct).not.toHaveBeenCalled();
});

it("previews, publishes, and edits a saved draft from its table row", async () => {
  const user = userEvent.setup();
  const savedDraft = productDraft(product, { id: "saved-draft", name: "저장된 초안", mode: "create", status: "draft", revision: 2 });
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const publishDraft = vi.fn().mockResolvedValue(undefined);
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
      onData([savedDraft]);
      return vi.fn();
    },
    publishDraft,
  });
  render(<AdminDashboard dependencies={deps} />);

  await user.click(await screen.findByRole("tab", { name: "임시 저장" }));
  await user.click(screen.getByRole("button", { name: "저장된 초안 미리 보기" }));
  expect(open).toHaveBeenCalledWith("/admin/products/preview/saved-draft", "_blank", "noopener,noreferrer");

  await user.click(screen.getByRole("button", { name: "저장된 초안 판매 공개" }));
  await waitFor(() => expect(publishDraft).toHaveBeenCalledWith(savedDraft));
  expect(await screen.findByText("상품을 판매 공개했습니다.")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "저장된 초안 수정" }));
  expect(screen.getByRole("heading", { name: "저장된 초안 수정" })).toBeVisible();
});

it("keeps repeated editor sessions bounded and reaches the previous route with one Back after close", async () => {
  const destinationState = Object.freeze({ __NA: true, tree: ["products"], key: "destination" });
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  window.history.replaceState(destinationState, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  const initialLength = window.history.length;
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
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
  try {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
      await user.type(screen.getByLabelText("상품명"), String(cycle));
      await waitFor(() => expect(window.history.length).toBe(initialLength + 1));
      await user.click(screen.getByRole("button", { name: "편집 닫기" }));
      expect(await screen.findByRole("button", { name: "새 상품 등록" })).toBeVisible();
      expect(window.history.length).toBe(initialLength + 1);
    }

    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/products"));
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(window.history.state).toEqual(destinationState);
  } finally {
    view.unmount();
  }
});

it("reaches the previous route with one Back after authorization clears a dirty editor", async () => {
  const destinationState = Object.freeze({ __NA: true, tree: ["products"], key: "destination" });
  const originalAdminState = Object.freeze({ __NA: true, tree: ["admin"], key: "original" });
  window.history.replaceState(destinationState, "", "/products");
  window.history.pushState(originalAdminState, "", "/admin/products");
  let emitSession!: (state: AdminSessionState) => void;
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm");
  const deps = dependencies({
    observeAdminSession: (next) => {
      emitSession = next;
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
  try {
    act(() => emitSession("admin"));
    await user.click(await screen.findByRole("button", { name: "새 상품 등록" }));
    await user.type(screen.getByLabelText("상품명"), "오메가");
    act(() => emitSession("signed-out"));
    expect(await screen.findByRole("heading", { name: "관리자 로그인" })).toBeVisible();

    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe("/products"));
    expect(confirm).not.toHaveBeenCalled();
    expect(window.history.state).toEqual(destinationState);
  } finally {
    view.unmount();
  }
});

it("ignores a stale row mutation completion without unlocking the new admin operation", async () => {
  const first = deferred<ProductDraft>();
  const second = deferred<ProductDraft>();
  const duplicateProductToDraft = vi.fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  const productCallbacks: Array<(products: Product[]) => void> = [];
  let emitSession!: (state: AdminSessionState) => void;
  const user = userEvent.setup();
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
      onData([]);
      return vi.fn();
    },
    duplicateProductToDraft,
  });
  render(<AdminDashboard dependencies={deps} />);

  act(() => emitSession("admin"));
  await waitFor(() => expect(productCallbacks).toHaveLength(1));
  act(() => productCallbacks[0]!([product]));
  await user.click(await screen.findByRole("button", { name: "데일리 오메가3 복제" }));

  act(() => {
    emitSession("checking");
    emitSession("admin");
  });
  await waitFor(() => expect(productCallbacks).toHaveLength(2));
  act(() => productCallbacks[1]!([product]));
  await user.click(await screen.findByRole("button", { name: "데일리 오메가3 복제" }));
  expect(duplicateProductToDraft).toHaveBeenCalledTimes(2);

  first.resolve(productDraft(product, { id: "old-copy", mode: "create", status: "draft" }));
  await act(async () => { await first.promise; });
  expect(screen.queryByText("복제 초안을 만들었습니다.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "데일리 오메가3 복제" })).toBeDisabled();

  second.resolve(productDraft(product, { id: "new-copy", mode: "create", status: "draft" }));
  expect(await screen.findByText("복제 초안을 만들었습니다.")).toBeVisible();
  expect(screen.getByRole("button", { name: "데일리 오메가3 복제" })).toBeEnabled();
});
