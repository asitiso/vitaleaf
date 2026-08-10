import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("../../lib/firebase/auth", () => ({
  getAdminAuthErrorMessage: () => "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  observeAdminSession: vi.fn(),
  signInAdmin: vi.fn(),
  signOutAdmin: vi.fn(),
}));

vi.mock("../../lib/firebase/products", () => ({
  deleteProduct: vi.fn(),
  saveProduct: vi.fn(),
  subscribeProducts: vi.fn(),
}));

import type { Product } from "../../lib/products/types";
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
  expect(screen.getByText("관리자 권한이 없는 계정입니다.")).toBeVisible();
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
