import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ auth: {}, db: {} }));

import { createAdminAuth, getAdminAuthErrorMessage } from "./auth";

describe("createAdminAuth", () => {
  it("signs out an authenticated user without an admin role", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const adminAuth = createAdminAuth({
      signIn: vi.fn().mockResolvedValue({ uid: "staff-1" }),
      readAdmin: vi.fn().mockResolvedValue({ role: "staff" }),
      signOut,
      observe: vi.fn(),
    });

    await expect(adminAuth.signInAdmin("staff@example.com", "password")).resolves.toBe("forbidden");
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("allows only users whose admins document has the admin role", async () => {
    const adminAuth = createAdminAuth({
      signIn: vi.fn().mockResolvedValue({ uid: "admin-1" }),
      readAdmin: vi.fn().mockResolvedValue({ role: "admin" }),
      signOut: vi.fn(),
      observe: vi.fn(),
    });

    await expect(adminAuth.signInAdmin("admin@example.com", "password")).resolves.toBe("admin");
  });

  it("never reports a forbidden observed user as an admin and signs them out", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const observe = vi.fn((next: (user: { uid: string } | null) => void) => {
      next({ uid: "forbidden-1" });
      return vi.fn();
    });
    const states: string[] = [];
    const adminAuth = createAdminAuth({
      signIn: vi.fn(),
      readAdmin: vi.fn().mockResolvedValue(null),
      signOut,
      observe,
    });

    adminAuth.observeAdminSession((state) => states.push(state), vi.fn());
    await vi.waitFor(() => expect(states).toEqual(["forbidden"]));
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe("getAdminAuthErrorMessage", () => {
  it.each([
    ["auth/invalid-credential", "이메일 또는 비밀번호를 확인해 주세요."],
    ["auth/network-request-failed", "네트워크 연결을 확인한 뒤 다시 시도해 주세요."],
    ["auth/user-disabled", "사용이 중지된 계정입니다. 관리자에게 문의해 주세요."],
  ])("maps %s to a useful Korean message", (code, expected) => {
    expect(getAdminAuthErrorMessage({ code })).toBe(expected);
  });
});
