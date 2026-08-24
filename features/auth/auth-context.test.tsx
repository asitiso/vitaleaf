import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { MemberAuthAdapter, MemberIdentity } from "@/lib/firebase/member-auth";

vi.mock("../../lib/firebase/member-auth", () => ({
  getMemberAuthErrorMessage: () => "인증 오류",
  memberAuth: {},
}));

import { AuthProvider, useAuth } from "./auth-context";

function SessionProbe() {
  const { status, user } = useAuth();
  return <p>{`${status}:${user?.uid ?? "none"}`}</p>;
}

function SignOutProbe() {
  const { signOutMember } = useAuth();
  const [result, setResult] = useState("not-called");

  return <>
    <button type="button" onClick={() => void signOutMember().then((didSignOut) => setResult(String(didSignOut)))}>
      로그아웃 시도
    </button>
    <p>{result}</p>
  </>;
}

it("clears the previous member immediately when Firebase signs out", async () => {
  let emit!: (user: MemberIdentity | null) => void;
  const adapter: MemberAuthAdapter = {
    create: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    reset: vi.fn(),
    verify: vi.fn(),
    removeCurrent: vi.fn(),
    observe: vi.fn((next) => {
      emit = next;
      return vi.fn();
    }),
  };

  render(
    <AuthProvider adapter={adapter}>
      <SessionProbe />
    </AuthProvider>,
  );

  emit({ uid: "user-1", email: "member@example.com", emailVerified: false });
  expect(await screen.findByText("signed-in:user-1")).toBeVisible();

  emit(null);
  expect(await screen.findByText("signed-out:none")).toBeVisible();
});

it("clears the prior member and exposes an error when observation fails", async () => {
  let emit!: (user: MemberIdentity | null) => void;
  let fail!: (reason: unknown) => void;
  const adapter: MemberAuthAdapter = {
    create: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), reset: vi.fn(), verify: vi.fn(), removeCurrent: vi.fn(),
    observe: vi.fn((next, onError) => {
      emit = next;
      fail = onError;
      return vi.fn();
    }),
  };

  render(<AuthProvider adapter={adapter}><SessionProbe /></AuthProvider>);
  emit({ uid: "user-1", email: "member@example.com", emailVerified: false });
  expect(await screen.findByText("signed-in:user-1")).toBeVisible();

  fail(new Error("observer failed"));
  expect(await screen.findByText("error:none")).toBeVisible();
});

it("unsubscribes and ignores a late Firebase callback after cleanup", () => {
  let emit!: (user: MemberIdentity | null) => void;
  const unsubscribe = vi.fn();
  const adapter: MemberAuthAdapter = {
    create: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), reset: vi.fn(), verify: vi.fn(), removeCurrent: vi.fn(),
    observe: vi.fn((next) => {
      emit = next;
      return unsubscribe;
    }),
  };
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const view = render(<AuthProvider adapter={adapter}><SessionProbe /></AuthProvider>);

  view.unmount();
  emit({ uid: "late-user", email: "member@example.com", emailVerified: false });

  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

it("reports a failed sign-out so an account menu can stay open", async () => {
  const user = userEvent.setup();
  const adapter: MemberAuthAdapter = {
    create: vi.fn(), signIn: vi.fn(), signOut: vi.fn().mockRejectedValue(new Error("offline")),
    reset: vi.fn(), verify: vi.fn(), removeCurrent: vi.fn(), observe: vi.fn(() => vi.fn()),
  };

  render(<AuthProvider adapter={adapter}><SignOutProbe /></AuthProvider>);
  await user.click(screen.getByRole("button", { name: "로그아웃 시도" }));

  expect(await screen.findByText("false")).toBeVisible();
});
