import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("../../lib/firebase/client", () => ({ auth: {}, db: {} }));

vi.mock("../../lib/firebase/products", () => ({
  deleteProduct: vi.fn(),
  saveProduct: vi.fn(),
  subscribeProducts: vi.fn(),
}));

import type { Product } from "../../lib/products/types";
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
  await waitFor(() => expect(saveProduct).toHaveBeenCalledWith(expect.objectContaining({ stock: 0 }), "omega"));
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
  await user.click(screen.getByRole("button", { name: "취소" }));
  await user.click(screen.getByRole("button", { name: "데일리 오메가3 수정" }));
  expect(screen.getByRole("heading", { name: "데일리 오메가3 수정" })).toBeVisible();
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
