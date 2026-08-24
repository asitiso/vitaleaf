import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const { createMock, createUserProfileMock, pushMock, removeCurrentMock, verifyMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  createUserProfileMock: vi.fn(),
  pushMock: vi.fn(),
  removeCurrentMock: vi.fn(),
  verifyMock: vi.fn(),
}));

vi.mock("../../lib/firebase/member-auth", () => ({
  getMemberAuthErrorMessage: () => "인증 오류",
  memberAuth: {
    signUp: createMock,
    removeCurrent: removeCurrentMock,
    verify: verifyMock,
  },
  validateMemberPassword: () => null,
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
  verifyMock.mockReset().mockResolvedValue(undefined);
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
  expect(pushMock).toHaveBeenCalledWith("/mypage");
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
  expect(screen.getByRole("alert")).toHaveTextContent("인증 오류");
});

it("keeps the completed account when verification delivery fails", async () => {
  verifyMock.mockRejectedValueOnce(new Error("verification failed"));
  const user = userEvent.setup();
  render(<SignupForm />);
  await fillSignupForm(user);
  await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await user.click(screen.getByRole("button", { name: "회원가입" }));

  expect(removeCurrentMock).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("인증 메일");
  expect(pushMock).toHaveBeenCalledWith("/mypage");
});
