import { render, screen } from "@testing-library/react";
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
