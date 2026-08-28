import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const { createMock, createUserProfileMock, pushMock, removeCurrentMock, sendVerificationMock, validateMemberPasswordMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  createUserProfileMock: vi.fn(),
  pushMock: vi.fn(),
  removeCurrentMock: vi.fn(),
  sendVerificationMock: vi.fn(),
  validateMemberPasswordMock: vi.fn(),
}));

vi.mock("../../lib/firebase/member-auth", () => ({
  getMemberAuthErrorMessage: (reason: unknown) => {
    const code = typeof reason === "object" && reason !== null && "code" in reason
      ? reason.code
      : "";
    if (code === "auth/email-already-in-use") {
      return "이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.";
    }
    if (code === "firebase/client-config-missing") {
      return "사이트 인증 설정이 필요합니다. 관리자에게 알려 주세요.";
    }
    return "인증 오류";
  },
  memberAuth: {
    signUp: createMock,
    removeCurrent: removeCurrentMock,
    sendVerification: sendVerificationMock,
  },
  validateMemberPassword: validateMemberPasswordMock,
}));

vi.mock("../../lib/firebase/user-profile", () => ({
  createUserProfile: createUserProfileMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { SignupForm } from "./signup-form";

async function fillSignupForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("이름"), "홍길동");
  await user.type(screen.getByLabelText("이메일"), "member@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "abc12345");
  await user.type(screen.getByLabelText("비밀번호 확인"), "abc12345");
}

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({
    uid: "member-1",
    email: "member@example.com",
    emailVerified: false,
  });
  createUserProfileMock.mockReset().mockResolvedValue(undefined);
  pushMock.mockReset();
  removeCurrentMock.mockReset().mockResolvedValue(undefined);
  sendVerificationMock.mockReset().mockResolvedValue(undefined);
  validateMemberPasswordMock.mockReset().mockReturnValue(null);
});

it("creates the profile before reporting signup success", async () => {
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(createUserProfileMock).toHaveBeenCalledWith(expect.objectContaining({
    displayName: "홍길동",
  }));
  expect(sendVerificationMock).toHaveBeenCalledOnce();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(pushMock).toHaveBeenCalledWith("/mypage");
});

it("requires agreement to the terms before creating an account", async () => {
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(screen.getByRole("alert")).toHaveTextContent("이용약관에 동의해 주세요.");
  expect(createMock).not.toHaveBeenCalled();
});

it("rejects a password confirmation mismatch before creating an account", async () => {
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.clear(screen.getByLabelText("비밀번호 확인"));
  await user.type(screen.getByLabelText("비밀번호 확인"), "different123");
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(screen.getByRole("alert")).toHaveTextContent("비밀번호 확인이 일치하지 않습니다.");
  expect(createMock).not.toHaveBeenCalled();
});

it("shows duplicate-email guidance without creating a profile", async () => {
  createMock.mockRejectedValueOnce({ code: "auth/email-already-in-use" });
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(screen.getByRole("alert")).toHaveTextContent("이미 가입된 이메일입니다.");
  expect(createUserProfileMock).not.toHaveBeenCalled();
  expect(pushMock).not.toHaveBeenCalled();
});

it("blocks a second signup submission while account creation is pending", async () => {
  let resolveSignup!: (identity: { uid: string; email: string; emailVerified: boolean }) => void;
  createMock.mockReturnValueOnce(new Promise((resolve) => {
    resolveSignup = resolve;
  }));
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));

  const form = screen.getByRole("form", { name: "회원가입" });
  fireEvent.submit(form);
  fireEvent.submit(form);

  await waitFor(() => expect(createMock).toHaveBeenCalledOnce());
  resolveSignup({ uid: "member-1", email: "member@example.com", emailVerified: false });
  await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/mypage"));
});

it("removes the new account when profile creation fails", async () => {
  createUserProfileMock.mockRejectedValueOnce(new Error("profile failed"));
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(removeCurrentMock).toHaveBeenCalledOnce();
  expect(pushMock).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("생성된 로그인 계정을 정리했습니다");
});

it("truthfully warns when both profile creation and auth rollback fail", async () => {
  createUserProfileMock.mockRejectedValueOnce(new Error("profile failed"));
  removeCurrentMock.mockRejectedValueOnce(new Error("rollback failed"));
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(screen.getByRole("alert")).toHaveTextContent("로그인 계정이 남아 있을 수 있습니다");
  expect(screen.getByRole("alert")).toHaveTextContent("마이페이지에서 회원 정보를 복구");
  expect(pushMock).not.toHaveBeenCalled();
});

it("keeps the form usable and reports an error when validation setup fails", async () => {
  validateMemberPasswordMock.mockImplementationOnce(() => {
    throw new Error("auth module failed");
  });
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(screen.getByRole("alert")).toHaveTextContent("인증 오류");
  expect(screen.getByRole("button", { name: "회원가입" })).toBeEnabled();
  expect(createMock).not.toHaveBeenCalled();
});

it("keeps the completed account and carries a durable notice when verification delivery fails", async () => {
  sendVerificationMock.mockRejectedValueOnce(new Error("verification failed"));
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(removeCurrentMock).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("인증 메일");
  expect(pushMock).toHaveBeenCalledWith("/mypage?notice=verification-email-failed");
});

it("includes actionable configuration guidance when verification delivery fails", async () => {
  sendVerificationMock.mockRejectedValueOnce({ code: "firebase/client-config-missing" });
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(await screen.findByRole("status")).toHaveTextContent("인증 메일을 보내지 못했습니다");
  expect(screen.getByRole("status")).toHaveTextContent("사이트 인증 설정이 필요합니다");
});
