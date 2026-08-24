"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type MemberAuthAdapter,
  type MemberIdentity,
} from "../../lib/firebase/member-auth";

export type AuthStatus = "checking" | "signed-out" | "signed-in" | "error";

type AuthContextValue = {
  status: AuthStatus;
  user: MemberIdentity | null;
  error: string;
  retryAuth: () => void;
  signOutMember: () => Promise<boolean>;
};

type AuthProviderProps = {
  children: ReactNode;
  adapter?: MemberAuthAdapter;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, adapter }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<MemberIdentity | null>(null);
  const [error, setError] = useState("");
  const [observationAttempt, setObservationAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};
    const showError = async (reason: unknown) => {
      const message = await import("../../lib/firebase/member-auth")
        .then(({ getMemberAuthErrorMessage }) => getMemberAuthErrorMessage(reason))
        .catch(() => "인증 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      if (!active) return;
      setUser(null);
      setError(message);
      setStatus("error");
    };
    const handleUser = (identity: MemberIdentity | null) => {
      if (!active) return;
      setUser(identity);
      setError("");
      setStatus(identity ? "signed-in" : "signed-out");
    };
    const subscribe = (source: MemberAuthAdapter) => {
      unsubscribe = source.observe(handleUser, showError);
    };

    if (adapter) {
      subscribe(adapter);
    } else {
      void import("../../lib/firebase/member-auth")
        .then(({ memberAuth }) => {
          if (!active) return;
          unsubscribe = memberAuth.observe(
            (state) => {
              if (state === "checking") {
                setStatus("checking");
              } else {
                handleUser(state);
              }
            },
            showError,
          );
        })
        .catch(showError);
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [adapter, observationAttempt]);

  const retryAuth = useCallback(() => {
    setUser(null);
    setError("");
    setStatus("checking");
    setObservationAttempt((attempt) => attempt + 1);
  }, []);

  const signOutMember = useCallback(async () => {
    setError("");
    try {
      if (adapter) {
        await adapter.signOut();
      } else {
        const { memberAuth } = await import("../../lib/firebase/member-auth");
        await memberAuth.signOut();
      }
      setUser(null);
      setStatus("signed-out");
      return true;
    } catch (reason) {
      const message = await import("../../lib/firebase/member-auth")
        .then(({ getMemberAuthErrorMessage }) => getMemberAuthErrorMessage(reason))
        .catch(() => "로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setError(message);
      setStatus("signed-in");
      return false;
    }
  }, [adapter]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, error, retryAuth, signOutMember }),
    [error, retryAuth, signOutMember, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return value;
}
