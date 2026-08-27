import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const { pushMock, resetMock, signInMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  resetMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.mock("../../lib/firebase/member-auth", () => ({
  getMemberAuthErrorMessage: () => "인증 오류",
  memberAuth: {
    sendPasswordReset: resetMock,
    signIn: signInMock,
  },
  safeReturnPath: (path?: string) => path?.startsWith("/") ? path : "/mypage",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { LoginForm } from "./login-form";

beforeEach(() => {
  pushMock.mockReset();
  resetMock.mockReset().mockResolvedValue(undefined);
  signInMock.mockReset().mockResolvedValue({ uid: "member-1" });
});

it("returns a signed-out My Page visitor to My Page after authentication", async () => {
  const user = userEvent.setup();
  render(<LoginForm next="/mypage" />);

  await user.type(screen.getByLabelText("이메일"), "member@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "abc12345");
  await user.click(screen.getByRole("button", { name: "로그인" }));

  expect(signInMock).toHaveBeenCalledWith("member@example.com", "abc12345");
  expect(pushMock).toHaveBeenCalledWith("/mypage");
});

it("sends a reset message only after a valid email is provided", async () => {
  const user = userEvent.setup();
  render(<LoginForm />);

  await user.click(screen.getByRole("button", { name: "비밀번호 재설정 메일 보내기" }));
  expect(resetMock).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("올바른 이메일");

  await user.type(screen.getByLabelText("이메일"), "member@example.com");
  await user.click(screen.getByRole("button", { name: "비밀번호 재설정 메일 보내기" }));

  expect(resetMock).toHaveBeenCalledWith("member@example.com");
  expect(screen.getByRole("status")).toHaveTextContent("재설정 메일");
});
