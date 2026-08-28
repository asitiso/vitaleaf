import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { assertFirebaseClientConfigured, auth, db } from "./client";

export { memberAuth } from "./member-auth";

export type AdminSessionState = "checking" | "admin" | "signed-out" | "forbidden";
export type AdminSignInResult = "admin" | "forbidden" | "stale";

type AuthUser = { uid: string };
type AdminRecord = { role?: unknown } | null;
type AuthSessionSnapshot = { uid: string | null; generation: number };

export type AdminAuthAdapter = {
  signIn(email: string, password: string): Promise<AuthUser>;
  readAdmin(uid: string): Promise<AdminRecord>;
  signOut(): Promise<void>;
  observe(next: (user: AuthUser | null) => void, onError: (error: unknown) => void): () => void;
  getSession(): AuthSessionSnapshot;
};

const isAdmin = (record: AdminRecord): boolean => record?.role === "admin";

export const getAdminAuthErrorMessage = (error: unknown): string => {
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
    default:
      return "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
  }
};

export const createAdminAuth = (adapter: AdminAuthAdapter) => {
  let signInGeneration = 0;

  return {
    async signInAdmin(email: string, password: string): Promise<AdminSignInResult> {
      const attemptGeneration = ++signInGeneration;
      const user = await adapter.signIn(email, password);
      const signedInSession = adapter.getSession();
      if (attemptGeneration !== signInGeneration || signedInSession.uid !== user.uid) return "stale";

      const record = await adapter.readAdmin(user.uid);
      const currentSession = adapter.getSession();
      if (
        attemptGeneration !== signInGeneration
        || currentSession.uid !== user.uid
        || currentSession.generation !== signedInSession.generation
      ) return "stale";

      if (isAdmin(record)) return "admin";
      await adapter.signOut();
      return "forbidden";
    },

    signOutAdmin(): Promise<void> {
      signInGeneration += 1;
      return adapter.signOut();
    },

    observeAdminSession(
      next: (state: AdminSessionState) => void,
      onError: (error: unknown) => void,
    ): () => void {
      let generation = 0;
      let currentUid: string | null = null;
      const unsubscribe = adapter.observe((user) => {
        const verificationGeneration = ++generation;
        currentUid = user?.uid ?? null;
        if (!user) {
          next("signed-out");
          return;
        }

        next("checking");

        void adapter.readAdmin(user.uid).then(async (record) => {
          if (generation !== verificationGeneration || currentUid !== user.uid) return;
          if (isAdmin(record)) {
            next("admin");
            return;
          }

          next("forbidden");
          await adapter.signOut();
        }).catch((error) => {
          if (generation === verificationGeneration && currentUid === user.uid) onError(error);
        });
      }, onError);

      return () => {
        generation += 1;
        currentUid = null;
        unsubscribe();
      };
    },
  };
};

let firebaseSessionUid: string | null = auth.currentUser?.uid ?? null;
let firebaseSessionGeneration = 0;

const getFirebaseSession = (): AuthSessionSnapshot => {
  const uid = auth.currentUser?.uid ?? null;
  if (uid !== firebaseSessionUid) {
    firebaseSessionUid = uid;
    firebaseSessionGeneration += 1;
  }
  return { uid, generation: firebaseSessionGeneration };
};

const firebaseAdminAuth = createAdminAuth({
  async signIn(email, password) {
    assertFirebaseClientConfigured();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { uid: credential.user.uid };
  },
  async readAdmin(uid) {
    const snapshot = await getDoc(doc(db, "admins", uid));
    return snapshot.exists() ? snapshot.data() : null;
  },
  signOut: () => signOut(auth),
  observe(next, onError) {
    return onAuthStateChanged(auth, (user: User | null) => {
      getFirebaseSession();
      next(user ? { uid: user.uid } : null);
    }, onError);
  },
  getSession: getFirebaseSession,
});

export const signInAdmin = firebaseAdminAuth.signInAdmin;
export const signOutAdmin = firebaseAdminAuth.signOutAdmin;
export const observeAdminSession = firebaseAdminAuth.observeAdminSession;
