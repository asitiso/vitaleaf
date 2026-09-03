import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { MemberOrder } from "../../lib/firebase/member-orders";
import type { UserProfile } from "../../lib/firebase/user-profile";

const {
  authState,
  createUserProfileMock,
  getUserProfileMock,
  listMemberOrdersMock,
  retryAuthMock,
  sendVerificationMock,
  updateUserProfileMock,
} = vi.hoisted(() => ({
  authState: {
    status: "signed-out" as "checking" | "signed-out" | "signed-in" | "error",
    user: null as { uid: string; email: string; emailVerified: boolean } | null,
    error: "",
  },
  createUserProfileMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  listMemberOrdersMock: vi.fn(),
  retryAuthMock: vi.fn(),
  sendVerificationMock: vi.fn(),
  updateUserProfileMock: vi.fn(),
}));

vi.mock("../../features/auth/auth-context", () => ({
  useAuth: () => ({ ...authState, retryAuth: retryAuthMock, signOutMember: vi.fn() }),
}));

vi.mock("../../lib/firebase/member-auth", () => ({
  getMemberAuthErrorMessage: (reason: unknown) => {
    const code = typeof reason === "object" && reason !== null && "code" in reason
      ? reason.code
      : "";
    if (code === "auth/unauthorized-domain") {
      return "현재 접속 주소의 로그인 승인이 필요합니다. 관리자에게 알려 주세요.";
    }
    return "인증 오류";
  },
  memberAuth: { sendVerification: sendVerificationMock },
}));

vi.mock("../../lib/firebase/user-profile", () => ({
  createUserProfile: createUserProfileMock,
  getUserProfile: getUserProfileMock,
  updateUserProfile: updateUserProfileMock,
}));

vi.mock("../../lib/firebase/member-orders", () => ({
  listMemberOrders: listMemberOrdersMock,
}));

import { MyPage } from "./my-page";

const profile: UserProfile = {
  uid: "user-1",
  email: "member@example.com",
  displayName: "홍길동",
  phone: "010-1234-5678",
  defaultAddress: {
    recipient: "홍길동",
    phone: "010-1234-5678",
    postcode: "06000",
    address: "서울시 강남구 테헤란로 1",
    addressDetail: "101동 1001호",
  },
  termsAcceptedAt: null,
  createdAt: null,
  updatedAt: null,
};

const order: MemberOrder = {
  id: "order-1",
  userId: "user-1",
  orderNumber: "VL-20260824-NEW123",
  status: "mock-received",
  paymentMethod: "card",
  customerName: "홍길동",
  phone: "010-1234-5678",
  shippingAddress: {
    postcode: "06000",
    address: "서울시 강남구 테헤란로 1",
    addressDetail: "101동 1001호",
  },
  deliveryNote: "문 앞에 놓아 주세요.",
  lines: [{ productId: "daily-omega", name: "데일리 오메가3", quantity: 2, unitPrice: 15000 }],
  subtotal: 30000,
  shippingFee: 0,
  total: 30000,
  createdAt: new Date("2026-08-24T09:00:00.000Z"),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  authState.status = "signed-out";
  authState.user = null;
  authState.error = "";
  createUserProfileMock.mockReset().mockResolvedValue(undefined);
  getUserProfileMock.mockReset().mockResolvedValue(profile);
  listMemberOrdersMock.mockReset().mockResolvedValue([order]);
  retryAuthMock.mockReset();
  sendVerificationMock.mockReset().mockResolvedValue(undefined);
  updateUserProfileMock.mockReset().mockResolvedValue(undefined);
});

it("shows the authentication error with a retry instead of the signed-out prompt", async () => {
  authState.status = "error";
  authState.error = "네트워크 연결을 확인해 주세요.";
  const user = userEvent.setup();
  render(<MyPage />);

  expect(screen.getByRole("alert")).toHaveTextContent("네트워크 연결을 확인해 주세요.");
  expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "인증 다시 확인" }));
  expect(retryAuthMock).toHaveBeenCalledOnce();
});

it("offers login with a return path when signed out", () => {
  render(<MyPage />);

  expect(screen.getByRole("heading", { name: "마이페이지" }).closest("main"))
    .toHaveClass("my-page", "my-page--signed-out");
  expect(screen.getByRole("link", { name: "로그인" }))
    .toHaveClass("my-page__login-cta");
  expect(screen.getByRole("link", { name: "로그인" }))
    .toHaveAttribute("href", "/login?next=%2Fmypage");
});

it("loads the profile and order history for the signed-in UID", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: false };
  render(<MyPage />);

  expect(getUserProfileMock).toHaveBeenCalledWith("user-1");
  expect(listMemberOrdersMock).toHaveBeenCalledWith("user-1");
  expect(await screen.findByText("VL-20260824-NEW123")).toBeVisible();
});

it("offers the exact member inquiry destination from My Page", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  render(<MyPage />);

  expect(await screen.findByRole("link", { name: "1:1 문의" })).toHaveAttribute("href", "/mypage/inquiries");
});

it("repairs a missing profile only after explicit consent and becomes normally editable", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  getUserProfileMock.mockResolvedValueOnce(null);
  const user = userEvent.setup();
  render(<MyPage />);

  expect(await screen.findByText(/회원 정보 문서가 없습니다/)).toBeVisible();
  expect(createUserProfileMock).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("이름"), "복구 회원");
  await user.type(screen.getByLabelText("연락처"), "010-1234-5678");
  await user.click(screen.getByRole("button", { name: "회원 정보 복구하기" }));
  expect(screen.getByRole("alert")).toHaveTextContent("동의해 주세요");
  expect(createUserProfileMock).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("받는 분"), "복구 수령인");
  await user.type(screen.getByLabelText("배송지 연락처"), "010-9999-8888");
  await user.type(screen.getByLabelText("우편번호"), "06000");
  await user.type(screen.getByLabelText("주소"), "서울시 강남구 테헤란로 1");
  await user.type(screen.getByLabelText("상세주소"), "101호");
  await user.click(screen.getByRole("checkbox", { name: /이용약관.*동의/ }));
  await user.click(screen.getByRole("button", { name: "회원 정보 복구하기" }));

  await waitFor(() => expect(createUserProfileMock).toHaveBeenCalledWith(expect.objectContaining({
    uid: "user-1",
    email: "member@example.com",
    displayName: "복구 회원",
    phone: "010-1234-5678",
    defaultAddress: {
      recipient: "복구 수령인",
      phone: "010-9999-8888",
      postcode: "06000",
      address: "서울시 강남구 테헤란로 1",
      addressDetail: "101호",
    },
  })));
  expect(await screen.findByRole("button", { name: "회원 정보 저장" })).toBeVisible();
  expect(screen.queryByRole("checkbox", { name: /이용약관.*동의/ })).not.toBeInTheDocument();
});

it("keeps the missing-profile repair form available when creation fails", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  getUserProfileMock.mockResolvedValueOnce(null);
  createUserProfileMock.mockRejectedValueOnce(new Error("create failed"));
  const user = userEvent.setup();
  render(<MyPage />);

  await screen.findByText(/회원 정보 문서가 없습니다/);
  await user.type(screen.getByLabelText("이름"), "복구 회원");
  await user.click(screen.getByRole("checkbox", { name: /이용약관.*동의/ }));
  await user.click(screen.getByRole("button", { name: "회원 정보 복구하기" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("회원 정보를 복구하지 못했습니다");
  expect(screen.getByRole("button", { name: "회원 정보 복구하기" })).toBeEnabled();
});

it("keeps profile and order loading independent when the profile request fails", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: false };
  getUserProfileMock.mockRejectedValueOnce(new Error("profile failed"));

  render(<MyPage />);

  expect(await screen.findByRole("alert", { name: "회원 정보 오류" })).toBeVisible();
  expect(await screen.findByText("VL-20260824-NEW123")).toBeVisible();
  expect(screen.getByRole("button", { name: "회원 정보 다시 불러오기" })).toBeVisible();
});

it("keeps profile available when the order request fails", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: false };
  listMemberOrdersMock.mockRejectedValueOnce(new Error("orders failed"));

  render(<MyPage />);

  expect(await screen.findByLabelText("이름")).toHaveValue("홍길동");
  expect(await screen.findByRole("alert", { name: "주문 내역 오류" })).toBeVisible();
  expect(screen.getByRole("button", { name: "주문 내역 다시 불러오기" })).toBeVisible();
});

it("shows a checking state and an empty order guide", async () => {
  authState.status = "checking";
  const { rerender } = render(<MyPage />);

  expect(screen.getByRole("status")).toHaveTextContent("마이페이지를 확인하는 중입니다.");

  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  listMemberOrdersMock.mockResolvedValueOnce([]);
  rerender(<MyPage />);

  expect(await screen.findByText("아직 주문 내역이 없습니다.")).toBeVisible();
});

it("guides a member with no orders to the product listing", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  listMemberOrdersMock.mockResolvedValueOnce([]);
  render(<MyPage />);

  expect(await screen.findByRole("link", { name: "상품 둘러보기" })).toHaveAttribute("href", "/products");
});

it("retries a failed profile request and renders its successful response", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  getUserProfileMock.mockRejectedValueOnce(new Error("profile failed")).mockResolvedValueOnce({ ...profile, displayName: "재시도 회원" });
  const user = userEvent.setup();
  render(<MyPage />);

  await user.click(await screen.findByRole("button", { name: "회원 정보 다시 불러오기" }));

  await waitFor(() => expect(getUserProfileMock).toHaveBeenCalledTimes(2));
  expect(await screen.findByLabelText("이름")).toHaveValue("재시도 회원");
});

it("surfaces the verification-delivery notice and lets an unverified member retry", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: false };
  const user = userEvent.setup();
  render(<MyPage notice="verification-email-failed" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("인증 메일을 보내지 못했습니다");
  await user.click(screen.getByRole("button", { name: "인증 메일 다시 보내기" }));

  expect(sendVerificationMock).toHaveBeenCalledOnce();
  expect(await screen.findByRole("status")).toHaveTextContent("인증 메일을 보냈습니다");
});

it("includes actionable domain guidance when verification resend fails", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: false };
  sendVerificationMock.mockRejectedValueOnce({ code: "auth/unauthorized-domain" });
  const user = userEvent.setup();
  render(<MyPage />);

  await user.click(await screen.findByRole("button", { name: "인증 메일 다시 보내기" }));

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("인증 메일을 보내지 못했습니다");
  expect(alert).toHaveTextContent("현재 접속 주소의 로그인 승인이 필요합니다");
});

it("rejects an invalid Korean mobile number before saving the profile", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  const user = userEvent.setup();
  render(<MyPage />);

  await screen.findByLabelText("연락처");
  await user.clear(screen.getByLabelText("연락처"));
  await user.type(screen.getByLabelText("연락처"), "010-12");
  await user.click(screen.getByRole("button", { name: "회원 정보 저장" }));

  expect(screen.getByText("휴대전화 번호를 010-1234-5678 형식으로 입력해 주세요.")).toBeVisible();
  expect(updateUserProfileMock).not.toHaveBeenCalled();
});

it("rejects a non-five-digit postcode and associates the error with its field", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  const user = userEvent.setup();
  render(<MyPage />);

  await screen.findByLabelText("우편번호");
  await user.clear(screen.getByLabelText("우편번호"));
  await user.type(screen.getByLabelText("우편번호"), "1234");
  await user.click(screen.getByRole("button", { name: "회원 정보 저장" }));

  expect(screen.getByText("우편번호 5자리를 입력해 주세요.")).toHaveAttribute("id", "postcode-error");
  expect(screen.getByRole("textbox", { name: /^우편번호/ })).toHaveAttribute("aria-describedby", "postcode-error");
  expect(updateUserProfileMock).not.toHaveBeenCalled();
});

it("reports a partial address and associates the missing-address error with its field", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  const user = userEvent.setup();
  render(<MyPage />);

  await screen.findByLabelText("주소");
  await user.clear(screen.getByLabelText("주소"));
  await user.click(screen.getByRole("button", { name: "회원 정보 저장" }));

  expect(screen.getByText("주소를 입력해 주세요.")).toHaveAttribute("id", "address-error");
  expect(screen.getByRole("textbox", { name: /^주소/ })).toHaveAttribute("aria-describedby", "address-error");
  expect(updateUserProfileMock).not.toHaveBeenCalled();
});

it("saves only the editable profile and default address fields", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  const user = userEvent.setup();
  render(<MyPage />);

  await screen.findByLabelText("이름");
  await user.clear(screen.getByLabelText("이름"));
  await user.type(screen.getByLabelText("이름"), "김하늘");
  await user.click(screen.getByRole("button", { name: "회원 정보 저장" }));

  await waitFor(() => expect(updateUserProfileMock).toHaveBeenCalledWith("user-1", {
    displayName: "김하늘",
    phone: "010-1234-5678",
    defaultAddress: profile.defaultAddress,
  }));
  expect(await screen.findByRole("status")).toHaveTextContent("회원 정보를 저장했습니다.");
});

it("does not render a stale profile after the signed-in UID changes", async () => {
  const firstProfile = deferred<UserProfile | null>();
  const firstOrders = deferred<MemberOrder[]>();
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  getUserProfileMock.mockReturnValueOnce(firstProfile.promise).mockResolvedValueOnce({ ...profile, uid: "user-2", displayName: "김하늘", defaultAddress: null });
  listMemberOrdersMock.mockReturnValueOnce(firstOrders.promise).mockResolvedValueOnce([]);
  const { rerender } = render(<MyPage />);

  authState.user = { uid: "user-2", email: "sky@example.com", emailVerified: true };
  rerender(<MyPage />);
  firstProfile.resolve(profile);
  firstOrders.resolve([order]);

  expect(await screen.findByLabelText("이름")).toHaveValue("김하늘");
  expect(screen.getByLabelText("받는 분")).toHaveValue("");
  expect(screen.queryByText("VL-20260824-NEW123")).not.toBeInTheDocument();
});

it("clears member data before the same UID signs in again", async () => {
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  const { rerender } = render(<MyPage />);

  expect(await screen.findByLabelText("이름")).toHaveValue("홍길동");
  authState.status = "signed-out";
  authState.user = null;
  rerender(<MyPage />);
  expect(screen.getByRole("link", { name: "로그인" })).toBeVisible();

  const nextProfile = deferred<UserProfile | null>();
  authState.status = "signed-in";
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: true };
  getUserProfileMock.mockReturnValueOnce(nextProfile.promise);
  rerender(<MyPage />);

  expect(screen.queryByLabelText("이름")).not.toBeInTheDocument();
  expect(screen.getAllByRole("status")).toHaveLength(2);
  nextProfile.resolve({ ...profile, displayName: "새 홍길동" });
  expect(await screen.findByLabelText("이름")).toHaveValue("새 홍길동");
});
