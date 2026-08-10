import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ auth: {}, db: {} }));

import { createAdminAuth, getAdminAuthErrorMessage } from "./auth";

const stableSession = (uid: string | null) => () => ({ uid, generation: 1 });

describe("createAdminAuth", () => {
  it("returns stale instead of admin when login A finishes after sign-out", async () => {
    let resolveRole!: (record: { role: string }) => void;
    let session = { uid: "admin-a" as string | null, generation: 1 };
    const readAdmin = vi.fn(() => new Promise<{ role: string }>((resolve) => {
      resolveRole = resolve;
    }));
    const signOut = vi.fn();
    const adminAuth = createAdminAuth({
      signIn: vi.fn().mockResolvedValue({ uid: "admin-a" }),
      readAdmin,
      signOut,
      observe: vi.fn(),
      getSession: () => session,
    });

    const result = adminAuth.signInAdmin("admin-a@example.com", "password");
    await vi.waitFor(() => expect(readAdmin).toHaveBeenCalledWith("admin-a"));
    session = { uid: null, generation: 2 };
    resolveRole({ role: "admin" });

    await expect(result).resolves.toBe("stale");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not sign out current user B when stale login A is forbidden", async () => {
    let resolveRole!: (record: null) => void;
    let session = { uid: "user-a" as string | null, generation: 1 };
    const readAdmin = vi.fn(() => new Promise<null>((resolve) => {
      resolveRole = resolve;
    }));
    const signOut = vi.fn();
    const adminAuth = createAdminAuth({
      signIn: vi.fn().mockResolvedValue({ uid: "user-a" }),
      readAdmin,
      signOut,
      observe: vi.fn(),
      getSession: () => session,
    });

    const result = adminAuth.signInAdmin("user-a@example.com", "password");
    await vi.waitFor(() => expect(readAdmin).toHaveBeenCalledWith("user-a"));
    session = { uid: "user-b", generation: 2 };
    resolveRole(null);

    await expect(result).resolves.toBe("stale");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out an authenticated user without an admin role", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const adminAuth = createAdminAuth({
      signIn: vi.fn().mockResolvedValue({ uid: "staff-1" }),
      readAdmin: vi.fn().mockResolvedValue({ role: "staff" }),
      signOut,
      observe: vi.fn(),
      getSession: stableSession("staff-1"),
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
      getSession: stableSession("admin-1"),
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
      getSession: stableSession("forbidden-1"),
    });

    adminAuth.observeAdminSession((state) => states.push(state), vi.fn());
    await vi.waitFor(() => expect(states).toEqual(["forbidden"]));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("discards a stale admin verification after the observed user signs out", async () => {
    let emitUser!: (user: { uid: string } | null) => void;
    let resolveAdmin!: (record: { role: string }) => void;
    const readAdmin = vi.fn(() => new Promise<{ role: string }>((resolve) => {
      resolveAdmin = resolve;
    }));
    const states: string[] = [];
    const adminAuth = createAdminAuth({
      signIn: vi.fn(),
      readAdmin,
      signOut: vi.fn(),
      observe: vi.fn((next) => {
        emitUser = next;
        return vi.fn();
      }),
      getSession: stableSession(null),
    });

    adminAuth.observeAdminSession((state) => states.push(state), vi.fn());
    emitUser({ uid: "admin-1" });
    expect(readAdmin).toHaveBeenCalledWith("admin-1");
    emitUser(null);
    resolveAdmin({ role: "admin" });
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(["signed-out"]);
  });

  it("does not sign out a new user when an older forbidden check resolves", async () => {
    let emitUser!: (user: { uid: string } | null) => void;
    let resolveOldUser!: (record: null) => void;
    let resolveNewUser!: (record: { role: string }) => void;
    const signOut = vi.fn();
    const readAdmin = vi.fn((uid: string) => (
      uid === "old-user"
        ? new Promise<null>((resolve) => { resolveOldUser = resolve; })
        : new Promise<{ role: string }>((resolve) => { resolveNewUser = resolve; })
    ));
    const states: string[] = [];
    const adminAuth = createAdminAuth({
      signIn: vi.fn(),
      readAdmin,
      signOut,
      observe: vi.fn((next) => {
        emitUser = next;
        return vi.fn();
      }),
      getSession: stableSession(null),
    });

    adminAuth.observeAdminSession((state) => states.push(state), vi.fn());
    emitUser({ uid: "old-user" });
    emitUser({ uid: "new-user" });
    resolveOldUser(null);
    await Promise.resolve();
    await Promise.resolve();

    expect(signOut).not.toHaveBeenCalled();
    resolveNewUser({ role: "admin" });
    await Promise.resolve();
    await Promise.resolve();
    expect(states).toEqual(["admin"]);
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
