"use client";

import { useCallback, useEffect, useRef } from "react";

const EDITOR_GUARD_STATE_KEY = "__vitaleafAdminEditorHistoryGuard";

type GuardPhase = "armed" | "replaying" | "inactive";

type GuardSnapshot = {
  guardId: string;
  originalState: unknown;
  originalUrl: string;
  phase: GuardPhase;
  position: "sentinel" | "original" | "destination";
};

const createGuardId = (): string => (
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
);

const withGuardId = (state: unknown, guardId: string): Record<string, unknown> => ({
  ...(state !== null && typeof state === "object" && !Array.isArray(state)
    ? state as Record<string, unknown>
    : {}),
  [EDITOR_GUARD_STATE_KEY]: guardId,
});

const isGuardState = (state: unknown, guardId: string): boolean => (
  state !== null
  && typeof state === "object"
  && (state as Record<string, unknown>)[EDITOR_GUARD_STATE_KEY] === guardId
);

export function useUnsavedHistoryGuard({
  active,
  locked,
  confirmExit,
}: {
  active: boolean;
  locked: boolean;
  confirmExit(): boolean;
}) {
  const snapshotRef = useRef<GuardSnapshot | null>(null);
  const activeRef = useRef(active);
  const lockedRef = useRef(locked);
  const confirmExitRef = useRef(confirmExit);

  useEffect(() => {
    activeRef.current = active;
    lockedRef.current = locked;
    confirmExitRef.current = confirmExit;
  }, [active, confirmExit, locked]);

  const neutralize = useCallback(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot || snapshot.phase === "inactive") return;
    snapshot.phase = "inactive";
    if (
      snapshot.position === "sentinel"
      && window.location.href === snapshot.originalUrl
      && isGuardState(window.history.state, snapshot.guardId)
    ) {
      window.history.replaceState(snapshot.originalState, "", snapshot.originalUrl);
    }
  }, []);

  useEffect(() => {
    const guardPopState = () => {
      const snapshot = snapshotRef.current;
      if (!snapshot) return;
      const { guardId } = snapshot;
      if (snapshot.phase === "replaying") {
        snapshot.phase = "inactive";
        snapshot.position = "destination";
        return;
      }
      if (snapshot.phase !== "armed" || snapshot.position !== "sentinel") return;

      snapshot.position = "original";
      if (!activeRef.current || (!lockedRef.current && confirmExitRef.current())) {
        snapshot.phase = "replaying";
        window.history.back();
        return;
      }
      window.history.pushState(withGuardId(snapshot.originalState, guardId), "", snapshot.originalUrl);
      snapshot.phase = "armed";
      snapshot.position = "sentinel";
    };

    window.addEventListener("popstate", guardPopState);
    return () => {
      window.removeEventListener("popstate", guardPopState);
      neutralize();
    };
  }, [neutralize]);

  useEffect(() => {
    if (!active || snapshotRef.current) return;

    const guardId = createGuardId();
    const originalState = window.history.state;
    const originalUrl = window.location.href;
    snapshotRef.current = {
      guardId,
      originalState,
      originalUrl,
      phase: "armed",
      position: "sentinel",
    };
    window.history.pushState(withGuardId(originalState, guardId), "", originalUrl);
  }, [active]);

  return neutralize;
}
