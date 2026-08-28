import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

import { assertFirebaseClientConfigured, auth } from "./client";

export type MemberIdentity = {
  uid: string;
  email: string;
  emailVerified: boolean;
};

export type MemberAuthState = "checking" | MemberIdentity | null;

export type MemberAuthAdapter = {
  create(email: string, password: string): Promise<MemberIdentity>;
  signIn(email: string, password: string): Promise<MemberIdentity>;
  signOut(): Promise<void>;
  reset(email: string): Promise<void>;
  verify(): Promise<void>;
  removeCurrent(): Promise<void>;
  observe(
    next: (user: MemberIdentity | null) => void,
    fail: (error: unknown) => void,
  ): () => void;
};

export const validateMemberPassword = (password: string): string | null => {
  if (password.length < 8) return "비밀번호는 8자 이상 입력해 주세요.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "영문과 숫자를 각각 하나 이상 포함해 주세요.";
  }
  return null;
};

export const safeReturnPath = (candidate?: string | null): string =>
  candidate?.startsWith("/")
  && !candidate.startsWith("//")
  && !candidate.includes("\\")
    ? candidate
    : "/mypage";

export const getMemberAuthErrorMessage = (error: unknown): string => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

  switch (code) {
    case "firebase/client-config-missing":
    case "auth/invalid-api-key":
      return "사이트 인증 설정이 필요합니다. 관리자에게 알려 주세요.";
    case "auth/configuration-not-found":
      return "로그인 방식 설정이 필요합니다. 관리자에게 알려 주세요.";
    case "auth/operation-not-allowed":
      return "이메일 로그인 설정이 필요합니다. 관리자에게 알려 주세요.";
    case "auth/unauthorized-domain":
      return "현재 접속 주소의 로그인 승인이 필요합니다. 관리자에게 알려 주세요.";
    case "auth/invalid-credential":
    case "auth/invalid-email":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "이메일 또는 비밀번호를 확인해 주세요.";
    case "auth/network-request-failed":
      return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
    case "auth/user-disabled":
      return "사용이 중지된 계정입니다. 관리자에게 문의해 주세요.";
    case "auth/email-already-in-use":
      return "이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.";
    case "auth/weak-password":
      return "비밀번호는 8자 이상 영문과 숫자를 포함해 입력해 주세요.";
    case "auth/too-many-requests":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return "인증 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
};

export const createMemberAuth = (adapter: MemberAuthAdapter) => ({
  signUp(email: string, password: string): Promise<MemberIdentity> {
    return adapter.create(email, password);
  },

  signIn(email: string, password: string): Promise<MemberIdentity> {
    return adapter.signIn(email, password);
  },

  signOut(): Promise<void> {
    return adapter.signOut();
  },

  sendPasswordReset(email: string): Promise<void> {
    return adapter.reset(email);
  },

  sendVerification(): Promise<void> {
    return adapter.verify();
  },

  removeCurrent(): Promise<void> {
    return adapter.removeCurrent();
  },

  observe(
    next: (state: MemberAuthState) => void,
    fail: (error: unknown) => void,
  ): () => void {
    let active = true;
    next("checking");
    const unsubscribe = adapter.observe(
      (user) => {
        if (active) next(user);
      },
      (error) => {
        if (active) fail(error);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  },
});

const toMemberIdentity = (user: User): MemberIdentity => ({
  uid: user.uid,
  email: user.email ?? "",
  emailVerified: user.emailVerified,
});

const firebaseMemberAuth = createMemberAuth({
  async create(email, password) {
    assertFirebaseClientConfigured();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return toMemberIdentity(credential.user);
  },
  async signIn(email, password) {
    assertFirebaseClientConfigured();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return toMemberIdentity(credential.user);
  },
  signOut: () => signOut(auth),
  reset: (email) => {
    assertFirebaseClientConfigured();
    return sendPasswordResetEmail(auth, email);
  },
  verify: () => {
    assertFirebaseClientConfigured();
    return sendEmailVerification(auth.currentUser!);
  },
  removeCurrent: () => deleteUser(auth.currentUser!),
  observe(next, fail) {
    return onAuthStateChanged(auth, (user) => next(user ? toMemberIdentity(user) : null), fail);
  },
});

export const memberAuth = firebaseMemberAuth;
