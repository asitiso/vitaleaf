"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductDraft } from "../../lib/products/types";

export type DraftAutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type DraftAutosaveOptions = {
  draft: ProductDraft;
  save(draft: ProductDraft): Promise<ProductDraft>;
  delayMs?: number;
};

type SavedIdentity = {
  baseId: string;
  baseSessionId: string | null;
  saved: ProductDraft;
};

const isBlankDraft = (draft: ProductDraft): boolean => (
  !draft.name.trim()
  && !draft.slug.trim()
  && !draft.category.trim()
  && draft.concerns.length === 0
  && draft.price === 0
  && draft.originalPrice === null
  && !draft.thumbnailUrl.trim()
  && draft.images.length === 0
  && draft.media.length === 0
  && !draft.description.trim()
  && draft.benefits.length === 0
  && draft.ingredients.length === 0
  && !draft.dosage.trim()
  && !draft.origin.trim()
  && draft.certifications.length === 0
  && draft.cautions.length === 0
  && draft.stock === 0
  && !draft.isBest
  && !draft.isNew
  && draft.salesRank === null
  && draft.ratingAverage === 0
  && draft.reviewCount === 0
  && draft.currentStep === 1
);

const sameEditingIdentity = (left: ProductDraft, right: ProductDraft): boolean => (
  left.id === right.id
  && (left.sessionId === right.sessionId || left.sessionId === null || right.sessionId === null)
);

const mergeSavedIdentity = (latest: ProductDraft, identity: SavedIdentity | null): ProductDraft => {
  if (
    !identity
    || latest.id !== identity.baseId
    || (latest.sessionId !== identity.baseSessionId && latest.sessionId !== identity.saved.sessionId)
  ) return latest;

  const saved = identity.saved;
  return {
    ...latest,
    status: saved.status,
    mode: saved.mode,
    sessionId: saved.sessionId,
    revision: saved.revision,
    sourceProductId: saved.sourceProductId,
    sourceProductRevision: saved.sourceProductRevision,
    sourceCreatedAt: saved.sourceCreatedAt,
    sourceCreatedBy: saved.sourceCreatedBy,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    createdBy: saved.createdBy,
    updatedBy: saved.updatedBy,
  };
};

export function useDraftAutosave({ draft, save, delayMs = 1_200 }: DraftAutosaveOptions) {
  const [status, setStatus] = useState<DraftAutosaveStatus>("idle");
  const [savedIdentity, setSavedIdentity] = useState<SavedIdentity | null>(null);
  const latestDraft = mergeSavedIdentity(draft, savedIdentity);
  const mountedRef = useRef(true);
  const latestRef = useRef(latestDraft);
  const previousPropRef = useRef(draft);
  const saveRef = useRef(save);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const hasPersistedRef = useRef(draft.revision > 0 || isBlankDraft(draft));
  const untouchedBlankRef = useRef(isBlankDraft(draft) && draft.revision === 0);
  const inFlightRef = useRef<Promise<ProductDraft> | null>(null);
  const inFlightVersionRef = useRef(0);

  useEffect(() => {
    latestRef.current = latestDraft;
  }, [latestDraft]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const startSave = useCallback(async (targetVersion: number): Promise<ProductDraft> => {
    const snapshot = latestRef.current;
    const baseSessionId = snapshot.sessionId;
    if (mountedRef.current) setStatus("saving");

    const operation = Promise.resolve().then(() => saveRef.current(snapshot));
    inFlightRef.current = operation;
    inFlightVersionRef.current = targetVersion;
    try {
      const saved = await operation;
      if (latestRef.current.id === snapshot.id && sameEditingIdentity(latestRef.current, snapshot)) {
        const identity = { baseId: snapshot.id, baseSessionId, saved };
        const merged = mergeSavedIdentity(latestRef.current, identity);
        latestRef.current = merged;
        if (mountedRef.current) setSavedIdentity(identity);
      }
      savedVersionRef.current = Math.max(savedVersionRef.current, targetVersion);
      hasPersistedRef.current = true;
      if (mountedRef.current) {
        setStatus(versionRef.current === targetVersion ? "saved" : "dirty");
      }
      return latestRef.current;
    } catch (error) {
      if (mountedRef.current) {
        setStatus(versionRef.current === targetVersion ? "error" : "dirty");
      }
      throw error;
    } finally {
      if (inFlightRef.current === operation) {
        inFlightRef.current = null;
        inFlightVersionRef.current = 0;
      }
    }
  }, []);

  const flush = useCallback(async (): Promise<ProductDraft> => {
    clearTimer();
    while (!hasPersistedRef.current || savedVersionRef.current < versionRef.current) {
      const pending = inFlightRef.current;
      if (pending) {
        const pendingVersion = inFlightVersionRef.current;
        try {
          await pending;
        } catch (error) {
          if (versionRef.current <= pendingVersion) throw error;
        }
        continue;
      }
      await startSave(versionRef.current);
    }
    return latestRef.current;
  }, [clearTimer, startSave]);

  const persistScheduled = useCallback(async (scheduledVersion: number): Promise<void> => {
    if (scheduledVersion !== versionRef.current) return;
    const pending = inFlightRef.current;
    if (pending) {
      try {
        await pending;
      } catch {
        // A newer scheduled version still gets its own attempt.
      }
      if (scheduledVersion !== versionRef.current || savedVersionRef.current >= scheduledVersion) return;
    }
    await startSave(scheduledVersion);
  }, [startSave]);

  useEffect(() => {
    const previous = previousPropRef.current;
    previousPropRef.current = draft;
    if (previous === draft) return;

    if (!sameEditingIdentity(previous, draft)) {
      clearTimer();
      versionRef.current = 0;
      savedVersionRef.current = 0;
      hasPersistedRef.current = draft.revision > 0 || isBlankDraft(draft);
      untouchedBlankRef.current = isBlankDraft(draft) && draft.revision === 0;
      setSavedIdentity(null);
      setStatus("idle");
      return;
    }

    const version = ++versionRef.current;
    if (untouchedBlankRef.current && isBlankDraft(draft)) {
      savedVersionRef.current = version;
      hasPersistedRef.current = true;
      clearTimer();
      setStatus("idle");
      return;
    }
    untouchedBlankRef.current = false;
    hasPersistedRef.current = false;
    clearTimer();
    setStatus("dirty");
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persistScheduled(version).catch(() => undefined);
    }, delayMs);
  }, [clearTimer, delayMs, draft, persistScheduled]);

  useEffect(() => {
    if (status !== "dirty" && status !== "saving") return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  const retry = useCallback(() => flush(), [flush]);
  const confirmClose = useCallback((): boolean => (
    status !== "dirty" && status !== "saving" && status !== "error"
      ? true
      : window.confirm("저장되지 않은 변경 사항이 있습니다. 편집을 닫으시겠습니까?")
  ), [status]);

  return { draft: latestDraft, status, flush, retry, confirmClose };
}
