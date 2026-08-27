import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const suspendedSearchParams = new Promise<never>(() => undefined);
const { pushMock, signInMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.mock("../../lib/firebase/member-auth", () => ({
  getMemberAuthErrorMessage: () => "인증 오류",
  memberAuth: {
    sendPasswordReset: vi.fn(),
    signIn: signInMock,
  },
  safeReturnPath: (path?: string) => path?.startsWith("/") ? path : "/",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

import LoginPage from "./page";

beforeEach(() => {
  pushMock.mockReset();
  signInMock.mockReset().mockResolvedValue({ uid: "member-1" });
});

async function submitValidLogin() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("이메일"), "member@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "abc12345");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}

it("returns a signed-out My Page visitor to My Page after authentication", async () => {
  await act(async () => {
    render(<LoginPage searchParams={Promise.resolve({ next: "/mypage" })} />);
  });

  await submitValidLogin();

  expect(pushMock).toHaveBeenCalledWith("/mypage");
});

it("renders an accessible fallback when search params suspend during static rendering", () => {
  const markup = renderToString(<LoginPage searchParams={suspendedSearchParams} />);

  expect(markup).toContain('role="status"');
  expect(markup).toContain("로그인 화면을 불러오는 중입니다.");
});
