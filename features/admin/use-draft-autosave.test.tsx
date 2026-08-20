import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProductDraft } from "../../lib/products/types";
import { useDraftAutosave } from "./use-draft-autosave";

const draft = (name: string, overrides: Partial<ProductDraft> = {}): ProductDraft => ({
  id: "draft-1",
  name,
  slug: name.toLowerCase().replaceAll(" ", "-"),
  category: name ? "nutrition" : "",
  concerns: [],
  price: name ? 10_000 : 0,
  originalPrice: null,
  thumbnailUrl: "",
  images: [],
  media: [],
  description: "",
  benefits: [],
  ingredients: [],
  dosage: "",
  origin: "",
  certifications: [],
  cautions: [],
  stock: 0,
  isBest: false,
  isNew: false,
  salesRank: null,
  ratingAverage: 0,
  reviewCount: 0,
  status: "draft",
  mode: "create",
  sessionId: "session-1",
  revision: 0,
  sourceProductId: null,
  sourceProductRevision: null,
  sourceCreatedAt: null,
  sourceCreatedBy: null,
  currentStep: 1,
  createdAt: null,
  updatedAt: null,
  createdBy: null,
  updatedBy: null,
  ...overrides,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useDraftAutosave", () => {
  it("saves the latest draft exactly once after the debounce delay", async () => {
    vi.useFakeTimers();
    const draftA = draft("A");
    const draftB = draft("B");
    const save = vi.fn(async (value: ProductDraft) => ({ ...value, revision: 1 }));
    const { result, rerender } = renderHook(
      ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
      { initialProps: { value: draftA } },
    );

    rerender({ value: draftB });
    expect(result.current.status).toBe("dirty");
    await act(async () => { await vi.advanceTimersByTimeAsync(1_199); });
    expect(save).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(draftB);
    expect(result.current.status).toBe("saved");
  });

  it("keeps newer content dirty when a slow save resolves and merges only its server identity", async () => {
    vi.useFakeTimers();
    const pending = deferred<ProductDraft>();
    const draftA = draft("A");
    const draftB = draft("B");
    const draftC = draft("C");
    const save = vi.fn(() => pending.promise);
    const { result, rerender } = renderHook(
      ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
      { initialProps: { value: draftA } },
    );

    rerender({ value: draftB });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    expect(result.current.status).toBe("saving");

    rerender({ value: draftC });
    await act(async () => {
      pending.resolve({
        ...draftB,
        sessionId: "server-session",
        revision: 4,
        createdBy: "admin-1",
      });
      await pending.promise;
    });

    expect(result.current.status).toBe("dirty");
    expect(result.current.draft).toMatchObject({
      name: "C",
      sessionId: "server-session",
      revision: 4,
      createdBy: "admin-1",
    });
  });

  it("retries the latest draft after failure without discarding local edits", async () => {
    vi.useFakeTimers();
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(async (value: ProductDraft) => ({ ...value, revision: 2 }));
    const { result, rerender } = renderHook(
      ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
      { initialProps: { value: draft("A") } },
    );

    rerender({ value: draft("B") });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    expect(result.current.status).toBe("error");

    rerender({ value: draft("C") });
    await act(async () => {
      await result.current.retry();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: "C" }));
    expect(result.current.draft.name).toBe("C");
    expect(result.current.status).toBe("saved");
  });

  it("flushes the latest edit after an older in-flight save fails", async () => {
    vi.useFakeTimers();
    const oldSave = deferred<ProductDraft>();
    const save = vi.fn()
      .mockImplementationOnce(() => oldSave.promise)
      .mockImplementationOnce(async (value: ProductDraft) => ({ ...value, revision: 1 }));
    const { result, rerender } = renderHook(
      ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
      { initialProps: { value: draft("A") } },
    );

    rerender({ value: draft("B") });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    rerender({ value: draft("C") });
    let flushed!: Promise<ProductDraft>;
    act(() => {
      flushed = result.current.flush();
    });
    await act(async () => {
      oldSave.reject(new Error("stale offline failure"));
      await expect(flushed).resolves.toMatchObject({ name: "C", revision: 1 });
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: "C" }));
  });

  it.each(["resolve", "reject"] as const)(
    "detaches an old identity save when it later %ss so the new identity flushes immediately",
    async (settlement) => {
      vi.useFakeTimers();
      const pendingA = deferred<ProductDraft>();
      const save = vi.fn()
        .mockImplementationOnce(() => pendingA.promise)
        .mockImplementationOnce(async (value: ProductDraft) => ({ ...value, revision: 7 }));
      const draftA = draft("A", { id: "draft-a", sessionId: "session-a" });
      const draftAEdited = draft("A edited", { id: "draft-a", sessionId: "session-a" });
      const draftB = draft("B", { id: "draft-b", sessionId: "session-b" });
      const { result, rerender } = renderHook(
        ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
        { initialProps: { value: draftA } },
      );

      rerender({ value: draftAEdited });
      await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
      expect(save).toHaveBeenCalledOnce();
      rerender({ value: draftB });

      let flushed!: Promise<ProductDraft>;
      await act(async () => {
        flushed = result.current.flush();
        await Promise.resolve();
      });
      expect(save).toHaveBeenCalledTimes(2);
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ id: "draft-b", name: "B" }));

      await act(async () => {
        if (settlement === "resolve") pendingA.resolve({ ...draftAEdited, revision: 3 });
        else pendingA.reject(new Error("old identity failed"));
        await expect(flushed).resolves.toMatchObject({ id: "draft-b", name: "B", revision: 7 });
      });
      expect(result.current.status).toBe("saved");
      expect(result.current.draft).toMatchObject({ id: "draft-b", name: "B", revision: 7 });
    },
  );

  it("flushes pending changes once and cancels their debounce timer", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (value: ProductDraft) => ({ ...value, revision: 1 }));
    const { result, rerender } = renderHook(
      ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
      { initialProps: { value: draft("A") } },
    );

    rerender({ value: draft("B") });
    let saved!: ProductDraft;
    await act(async () => {
      saved = await result.current.flush();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(save).toHaveBeenCalledOnce();
    expect(saved).toMatchObject({ name: "B", revision: 1 });
  });

  it("flushes an initial nonblank revision-zero session before publish", async () => {
    const save = vi.fn(async (value: ProductDraft) => ({ ...value, revision: 1 }));
    const initial = draft("Existing product", { revision: 0 });
    const { result } = renderHook(() => useDraftAutosave({ draft: initial, save }));

    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenCalledOnce();
    expect(result.current.draft.revision).toBe(1);
  });

  it("skips a blank untouched draft and warns only while dirty or saving", async () => {
    vi.useFakeTimers();
    const pending = deferred<ProductDraft>();
    const save = vi.fn(() => pending.promise);
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const blank = draft("", { sessionId: "new-session" });
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
      { initialProps: { value: blank } },
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.confirmClose()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();

    rerender({ value: draft("B", { sessionId: "new-session" }) });
    expect(add).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    expect(result.current.confirmClose()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    expect(result.current.status).toBe("saving");

    await act(async () => {
      pending.resolve(draft("B", { sessionId: "new-session", revision: 1 }));
      await pending.promise;
    });
    expect(result.current.status).toBe("saved");
    expect(remove).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    unmount();
    expect(remove).toHaveBeenCalled();
  });

  it("cancels a pending debounce when the editor unmounts", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (value: ProductDraft) => value);
    const { rerender, unmount } = renderHook(
      ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
      { initialProps: { value: draft("A") } },
    );

    rerender({ value: draft("B") });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });

    expect(save).not.toHaveBeenCalled();
  });

  it("saves a blank draft after staff change its wizard progress", async () => {
    vi.useFakeTimers();
    const blank = draft("");
    const save = vi.fn(async (value: ProductDraft) => ({ ...value, revision: 1 }));
    const { rerender } = renderHook(
      ({ value }) => useDraftAutosave({ draft: value, save, delayMs: 1_200 }),
      { initialProps: { value: blank } },
    );

    rerender({ value: { ...blank, currentStep: 2 as const } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 2 }));
  });
});
