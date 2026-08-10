import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "./client";

export type AdminSessionState = "admin" | "signed-out" | "forbidden";

type AuthUser = { uid: string };
type AdminRecord = { role?: unknown } | null;

export type AdminAuthAdapter = {
  signIn(email: string, password: string): Promise<AuthUser>;
  readAdmin(uid: string): Promise<AdminRecord>;
  signOut(): Promise<void>;
  observe(next: (user: AuthUser | null) => void, onError: (error: unknown) => void): () => void;
};

const isAdmin = (record: AdminRecord): boolean => record?.role === "admin";

export const getAdminAuthErrorMessage = (error: unknown): string => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-email":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "이메일 또는 비밀번호를 확인해 주세요.";
    case "auth/network-request-failed":
      return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
    case "auth/user-disabled":
      return "사용이 중지된 계정입니다. 관리자에게 문의해 주세요.";
    default:
      return "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
};

export const createAdminAuth = (adapter: AdminAuthAdapter) => {
  const verifyUser = async (user: AuthUser): Promise<"admin" | "forbidden"> => {
    const record = await adapter.readAdmin(user.uid);
    if (isAdmin(record)) return "admin";
    await adapter.signOut();
    return "forbidden";
  };

  return {
    async signInAdmin(email: string, password: string): Promise<"admin" | "forbidden"> {
      const user = await adapter.signIn(email, password);
      return verifyUser(user);
    },

    signOutAdmin(): Promise<void> {
      return adapter.signOut();
    },

    observeAdminSession(
      next: (state: AdminSessionState) => void,
      onError: (error: unknown) => void,
    ): () => void {
      return adapter.observe((user) => {
        if (!user) {
          next("signed-out");
          return;
        }

        void verifyUser(user).then(next).catch(onError);
      }, onError);
    },
  };
};

const firebaseAdminAuth = createAdminAuth({
  async signIn(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { uid: credential.user.uid };
  },
  async readAdmin(uid) {
    const snapshot = await getDoc(doc(db, "admins", uid));
    return snapshot.exists() ? snapshot.data() : null;
  },
  signOut: () => signOut(auth),
  observe(next, onError) {
    return onAuthStateChanged(auth, (user: User | null) => next(user ? { uid: user.uid } : null), onError);
  },
});

export const signInAdmin = firebaseAdminAuth.signInAdmin;
export const signOutAdmin = firebaseAdminAuth.signOutAdmin;
export const observeAdminSession = firebaseAdminAuth.observeAdminSession;
