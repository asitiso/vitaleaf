import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ auth: {}, db: {} }));

import {
  createMemberAuth,
  getMemberAuthErrorMessage,
  safeReturnPath,
  validateMemberPassword,
} from "./member-auth";

describe("member authentication helpers", () => {
  it.each([
    ["abc12345", null],
    ["abcdefgh", "영문과 숫자를 각각 하나 이상 포함해 주세요."],
    ["12345678", "영문과 숫자를 각각 하나 이상 포함해 주세요."],
    ["a1", "비밀번호는 8자 이상 입력해 주세요."],
  ])("validates a member password", (password, expected) => {
    expect(validateMemberPassword(password)).toBe(expected);
  });

  it.each([
    ["/checkout", "/checkout"],
    ["/products?category=vitamin", "/products?category=vitamin"],
    ["https://attacker.example", "/mypage"],
    ["//attacker.example", "/mypage"],
    ["/\\attacker.example", "/mypage"],
    ["/\\/attacker.example", "/mypage"],
  ])("accepts only a same-origin relative return path", (candidate, expected) => {
    expect(safeReturnPath(candidate)).toBe(expected);
  });

  it("maps duplicate-email and throttling errors to Korean guidance", () => {
    expect(getMemberAuthErrorMessage({ code: "auth/email-already-in-use" }))
      .toContain("이미 가입된 이메일");
    expect(getMemberAuthErrorMessage({ code: "auth/too-many-requests" }))
      .toContain("잠시 후");
  });

  it.each([
    ["auth/invalid-credential", "이메일 또는 비밀번호를 확인해 주세요."],
    ["auth/network-request-failed", "네트워크 연결을 확인한 뒤 다시 시도해 주세요."],
    ["auth/user-disabled", "사용이 중지된 계정입니다. 관리자에게 문의해 주세요."],
    ["auth/email-already-in-use", "이미 가입된 이메일"],
    ["auth/weak-password", "비밀번호"],
    ["auth/too-many-requests", "잠시 후"],
  ])("maps %s to useful Korean member guidance", (code, expected) => {
    expect(getMemberAuthErrorMessage({ code })).toContain(expected);
  });

  it("emits checking before the first Firebase observation", () => {
    let emitUser!: (user: { uid: string; email: string; emailVerified: boolean } | null) => void;
    const states: Array<"checking" | { uid: string; email: string; emailVerified: boolean } | null> = [];
    const memberAuth = createMemberAuth({
      create: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      reset: vi.fn(),
      verify: vi.fn(),
      removeCurrent: vi.fn(),
      observe: vi.fn((next) => {
        emitUser = next;
        return vi.fn();
      }),
    });

    memberAuth.observe((state) => states.push(state), vi.fn());
    expect(states).toEqual(["checking"]);

    emitUser({ uid: "member-1", email: "member@example.com", emailVerified: false });
    expect(states).toEqual([
      "checking",
      { uid: "member-1", email: "member@example.com", emailVerified: false },
    ]);
  });

  it("ignores Firebase callbacks that arrive after its observer is unsubscribed", () => {
    let emitUser!: (user: { uid: string; email: string; emailVerified: boolean } | null) => void;
    const unsubscribe = vi.fn();
    const states: Array<"checking" | { uid: string; email: string; emailVerified: boolean } | null> = [];
    const memberAuth = createMemberAuth({
      create: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      reset: vi.fn(),
      verify: vi.fn(),
      removeCurrent: vi.fn(),
      observe: vi.fn((next) => {
        emitUser = next;
        return unsubscribe;
      }),
    });

    const stop = memberAuth.observe((state) => states.push(state), vi.fn());
    stop();
    emitUser({ uid: "member-1", email: "member@example.com", emailVerified: true });

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(states).toEqual(["checking"]);
  });

  it("delegates member account operations to the injectable adapter", async () => {
    const identity = { uid: "member-1", email: "member@example.com", emailVerified: false };
    const adapter = {
      create: vi.fn().mockResolvedValue(identity),
      signIn: vi.fn().mockResolvedValue(identity),
      signOut: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      verify: vi.fn().mockResolvedValue(undefined),
      removeCurrent: vi.fn().mockResolvedValue(undefined),
      observe: vi.fn(),
    };
    const memberAuth = createMemberAuth(adapter);

    await expect(memberAuth.signUp("member@example.com", "abc12345")).resolves.toEqual(identity);
    await expect(memberAuth.signIn("member@example.com", "abc12345")).resolves.toEqual(identity);
    await memberAuth.sendPasswordReset("member@example.com");
    await memberAuth.sendVerification();
    await memberAuth.removeCurrent();
    await memberAuth.signOut();

    expect(adapter.create).toHaveBeenCalledWith("member@example.com", "abc12345");
    expect(adapter.signIn).toHaveBeenCalledWith("member@example.com", "abc12345");
    expect(adapter.reset).toHaveBeenCalledWith("member@example.com");
    expect(adapter.verify).toHaveBeenCalledOnce();
    expect(adapter.removeCurrent).toHaveBeenCalledOnce();
    expect(adapter.signOut).toHaveBeenCalledOnce();
  });
});
