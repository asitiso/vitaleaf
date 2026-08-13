"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ProductDetail } from "../../../../../components/product/product-detail";
import { observeAdminSession, type AdminSessionState } from "../../../../../lib/firebase/auth";
import { getDraft } from "../../../../../lib/firebase/product-drafts";
import { toPublishedProductInput } from "../../../../../lib/products/draft";
import type { Product, ProductDraft } from "../../../../../lib/products/types";

export type DraftPreviewDependencies = {
  observeAdminSession(
    next: (state: AdminSessionState) => void,
    onError: (error: unknown) => void,
  ): () => void;
  getDraft(id: string): Promise<ProductDraft | null>;
};

const defaultDependencies: DraftPreviewDependencies = { observeAdminSession, getDraft };

const toPreviewProduct = (draft: ProductDraft): Product => ({
  id: draft.id,
  ...toPublishedProductInput(draft),
  revision: draft.revision,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
  createdBy: draft.createdBy,
  updatedBy: draft.updatedBy,
});

export function DraftPreview({
  draftId,
  dependencies = defaultDependencies,
}: {
  draftId: string;
  dependencies?: DraftPreviewDependencies;
}) {
  const [session, setSession] = useState<AdminSessionState | "loading">("loading");
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [authError, setAuthError] = useState(false);
  const [authRetryGeneration, setAuthRetryGeneration] = useState(0);
  const [loadRetryGeneration, setLoadRetryGeneration] = useState(0);
  const authorizationGenerationRef = useRef(0);

  useEffect(() => {
    let active = true;
    const unsubscribe = dependencies.observeAdminSession((nextSession) => {
      if (!active) return;
      authorizationGenerationRef.current += 1;
      setAuthError(false);
      setSession(nextSession);
      if (nextSession === "admin") {
        setLoadState("loading");
      } else {
        setLoadState("idle");
        setDraft(null);
      }
    }, () => {
      if (!active) return;
      authorizationGenerationRef.current += 1;
      setDraft(null);
      setAuthError(true);
    });
    return () => {
      active = false;
      authorizationGenerationRef.current += 1;
      unsubscribe();
    };
  }, [authRetryGeneration, dependencies]);

  useEffect(() => {
    if (session !== "admin" || authError) return;
    const authorizationGeneration = authorizationGenerationRef.current;
    let active = true;
    void dependencies.getDraft(draftId).then((nextDraft) => {
      if (!active || authorizationGenerationRef.current !== authorizationGeneration) return;
      if (!nextDraft) {
        setLoadState("error");
        return;
      }
      setDraft(nextDraft);
      setLoadState("idle");
    }).catch(() => {
      if (!active || authorizationGenerationRef.current !== authorizationGeneration) return;
      setLoadState("error");
    });
    return () => {
      active = false;
    };
  }, [authError, dependencies, draftId, loadRetryGeneration, session]);

  const product = useMemo(() => draft ? toPreviewProduct(draft) : null, [draft]);

  if (authError) {
    return (
      <main className="admin-state" role="alert">
        <p>관리자 권한을 확인하지 못했습니다.</p>
        <button type="button" onClick={() => {
          setLoadState("loading");
          setAuthRetryGeneration((current) => current + 1);
        }}>다시 시도</button>
      </main>
    );
  }
  if (session === "loading") {
    return <main className="admin-state" role="status">관리자 권한을 확인하는 중입니다.</main>;
  }
  if (session !== "admin") {
    return <main className="admin-state"><h1>미리보기 권한이 없습니다</h1><p>관리자 계정으로 로그인해 주세요.</p></main>;
  }
  if (loadState === "loading") {
    return <main className="admin-state" role="status">초안을 불러오는 중입니다.</main>;
  }
  if (loadState === "error" || !product) {
    return (
      <main className="admin-state" role="alert">
        <p>초안을 불러오지 못했습니다.</p>
        <button type="button" onClick={() => {
          setLoadState("loading");
          setLoadRetryGeneration((current) => current + 1);
        }}>다시 시도</button>
      </main>
    );
  }

  return (
    <>
      <aside className="admin-preview-banner" aria-label="상품 미리보기 안내">
        <strong>미리보기</strong> · 이 화면에서는 구매할 수 없습니다.
      </aside>
      <fieldset disabled className="admin-preview-content" aria-label="읽기 전용 상품 미리보기">
        <ProductDetail product={product} reviews={[]} />
      </fieldset>
    </>
  );
}
