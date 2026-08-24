import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const {
  authModuleReady,
  createUserProfileMock,
  pushMock,
  releaseAuthModule,
  sendVerificationMock,
  signUpMock,
} = vi.hoisted(() => {
  let releaseAuthModule!: () => void;
  const authModuleReady = new Promise<void>((resolve) => {
    releaseAuthModule = resolve;
  });
  return {
    authModuleReady,
    createUserProfileMock: vi.fn().mockResolvedValue(undefined),
    pushMock: vi.fn(),
    releaseAuthModule,
    sendVerificationMock: vi.fn().mockResolvedValue(undefined),
    signUpMock: vi.fn().mockResolvedValue({ uid: "member-1", email: "member@example.com" }),
  };
});

vi.mock("../../lib/firebase/member-auth", async () => {
  await authModuleReady;
  return {
    getMemberAuthErrorMessage: () => "인증 오류",
    memberAuth: { signUp: signUpMock, sendVerification: sendVerificationMock, removeCurrent: vi.fn() },
    validateMemberPassword: () => null,
  };
});

vi.mock("../../lib/firebase/user-profile", () => ({ createUserProfile: createUserProfileMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { SignupForm } from "./signup-form";

it("locks the signup action before the member auth module finishes loading", async () => {
  const user = userEvent.setup();
  render(<SignupForm />);
  await user.type(screen.getByLabelText("이름"), "홍길동");
  await user.type(screen.getByLabelText("이메일"), "member@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "abc12345");
  await user.type(screen.getByLabelText("비밀번호 확인"), "abc12345");
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));

  await user.click(screen.getByRole("button", { name: "회원가입" }));
  expect(screen.getByRole("button", { name: "회원가입 중" })).toBeDisabled();

  releaseAuthModule();
  await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/mypage"));
  expect(signUpMock).toHaveBeenCalledOnce();
});
