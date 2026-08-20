"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  getAdminAuthErrorMessage,
  observeAdminSession,
  signInAdmin,
  signOutAdmin,
  type AdminSignInResult,
  type AdminSessionState,
} from "../../lib/firebase/auth";
import {
  deleteProduct,
  saveProduct,
  subscribeProducts,
  type ProductUpdateTarget,
} from "../../lib/firebase/products";
import {
  createDraftId,
  createProductEditDraft,
  ProductDraftValidationError,
  publishDraft,
  saveDraft,
  startDraftSession,
  subscribeDrafts,
} from "../../lib/firebase/product-drafts";
import { deleteProductImage, uploadProductImage } from "../../lib/firebase/product-media";
import { validatePublishableDraft } from "../../lib/products/draft";
import type { Product, ProductDraft, ProductInput } from "../../lib/products/types";
import { useDraftAutosave } from "../../features/admin/use-draft-autosave";
import { formatWon } from "../../lib/format";
import { CsvTools } from "./csv-tools";
import { ProductWizard } from "./product-wizard/product-wizard";
import type { MediaDelete, MediaUpload } from "./product-wizard/media-step";

export type AdminDashboardDependencies = {
  observeAdminSession(next: (state: AdminSessionState) => void, onError: (error: unknown) => void): () => void;
  signInAdmin(email: string, password: string): Promise<AdminSignInResult>;
  signOutAdmin(): Promise<void>;
  subscribeProducts(onData: (products: Product[]) => void, onError: (error: Error) => void): () => void;
  saveProduct(input: ProductInput, target?: ProductUpdateTarget): Promise<string>;
  deleteProduct(id: string): Promise<void>;
  subscribeDrafts(onData: (drafts: ProductDraft[]) => void, onError: (error: Error) => void): () => void;
  createDraftId(): string;
  startDraftSession(draft: ProductDraft): ProductDraft;
  createProductEditDraft(product: Product): ProductDraft;
  saveDraft(draft: ProductDraft): Promise<ProductDraft>;
  publishDraft(draft: ProductDraft): Promise<void>;
  uploadProductImage: MediaUpload;
  deleteProductImage: MediaDelete;
};

const defaultDependencies: AdminDashboardDependencies = {
  observeAdminSession,
  signInAdmin,
  signOutAdmin,
  subscribeProducts,
  saveProduct,
  deleteProduct,
  subscribeDrafts,
  createDraftId,
  startDraftSession,
  createProductEditDraft,
  saveDraft,
  publishDraft,
  uploadProductImage,
  deleteProductImage,
};

const blankDraft = (id: string): ProductDraft => ({
  id,
  name: "",
  slug: "",
  category: "",
  concerns: [],
  price: 0,
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
  sessionId: null,
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
});

const toInput = (product: Product): ProductInput => ({
  name: product.name,
  slug: product.slug,
  category: product.category,
  concerns: product.concerns,
  price: product.price,
  originalPrice: product.originalPrice,
  thumbnailUrl: product.thumbnailUrl,
  images: product.images,
  description: product.description,
  benefits: product.benefits,
  ingredients: product.ingredients,
  dosage: product.dosage,
  origin: product.origin,
  certifications: product.certifications,
  cautions: product.cautions,
  stock: product.stock,
  isBest: product.isBest,
  isNew: product.isNew,
  salesRank: product.salesRank,
  ratingAverage: product.ratingAverage,
  reviewCount: product.reviewCount,
});

function AdminLogin({
  message,
  onLogin,
}: {
  message: string;
  onLogin(email: string, password: string): Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setLoginError("");
    try {
      await onLogin(String(data.get("email") ?? "").trim(), String(data.get("password") ?? ""));
    } catch (error) {
      setLoginError(getAdminAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <p className="admin-eyebrow">VITALEAF ADMIN</p>
        <h1>관리자 로그인</h1>
        <p>등록된 관리자 계정으로만 상품을 관리할 수 있습니다.</p>
        {message && <p className="admin-error" role="alert">{message}</p>}
        {loginError && <p className="admin-error" role="alert">{loginError}</p>}
        <form onSubmit={submit} aria-label="관리자 로그인">
          <label><span>이메일</span><input name="email" type="email" autoComplete="username" required /></label>
          <label><span>비밀번호</span><input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit" disabled={submitting}>{submitting ? "확인 중" : "로그인"}</button>
        </form>
      </section>
    </main>
  );
}

function DeleteProductDialog({
  product,
  busy,
  onCancel,
  onConfirm,
}: {
  product: Product;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    const first = cancelRef.current;
    const last = confirmRef.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="admin-dialog-backdrop">
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title">
        <h2 id="admin-delete-title">상품 삭제 확인</h2>
        <p><strong>{product.name}</strong> 상품을 삭제하시겠습니까? 삭제한 상품은 복구할 수 없습니다.</p>
        <div>
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} onKeyDown={handleKeyDown}>취소</button>
          <button ref={confirmRef} type="button" disabled={busy} onClick={onConfirm} onKeyDown={handleKeyDown}>{busy ? "삭제 중" : "삭제 확인"}</button>
        </div>
      </section>
    </div>
  );
}

type DraftEditorHandle = {
  confirmExit(): boolean;
};

const DraftEditor = forwardRef<DraftEditorHandle, {
  initialDraft: ProductDraft;
  dependencies: AdminDashboardDependencies;
  onClose(): void;
  onPublished(): void;
  publishing: boolean;
  onPublishingChange(publishing: boolean): void;
}>(function DraftEditor({
  initialDraft,
  dependencies,
  onClose,
  onPublished,
  publishing,
  onPublishingChange,
}, ref) {
  const [draft, setDraft] = useState(initialDraft);
  const publishLockRef = useRef(false);
  const autosave = useDraftAutosave({ draft, save: dependencies.saveDraft, delayMs: 1_200 });
  const autosaveStatus = autosave.status;
  const confirmClose = autosave.confirmClose;

  useImperativeHandle(ref, () => ({ confirmExit: confirmClose }), [confirmClose]);

  useEffect(() => {
    const hasUnsavedWork = autosaveStatus === "dirty" || autosaveStatus === "saving" || autosaveStatus === "error";
    if (!hasUnsavedWork && !publishing) return;

    const guardInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.hasAttribute("download") || (target.target && target.target !== "_self")) return;

      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (publishing || !confirmClose()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", guardInternalNavigation, true);
    return () => document.removeEventListener("click", guardInternalNavigation, true);
  }, [autosaveStatus, confirmClose, publishing]);

  const close = () => {
    if (autosave.confirmClose()) onClose();
  };

  const preview = async () => {
    const previewWindow = window.open(
      "",
      "_blank",
    );
    if (!previewWindow) throw new Error("PREVIEW_POPUP_BLOCKED");
    previewWindow.opener = null;
    try {
      const saved = await autosave.flush();
      previewWindow.location.href = `/admin/products/preview/${encodeURIComponent(saved.id)}`;
    } catch (error) {
      previewWindow.close();
      throw error;
    }
  };

  const publish = async () => {
    if (publishLockRef.current) return;
    publishLockRef.current = true;
    try {
      const saved = await autosave.flush();
      const errors = validatePublishableDraft(saved);
      if (errors.length > 0) throw new ProductDraftValidationError(errors);
      await dependencies.publishDraft(saved);
      onPublished();
    } finally {
      publishLockRef.current = false;
    }
  };

  return (
    <section className="admin-editor" aria-labelledby="admin-editor-heading">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">PRODUCT EDITOR</p>
          <h2 id="admin-editor-heading">{autosave.draft.mode === "create" ? "새 상품 등록" : `${autosave.draft.name} 수정`}</h2>
        </div>
        <button type="button" className="admin-secondary-button" disabled={publishing} onClick={close}>편집 닫기</button>
      </div>
      {autosave.status === "error" ? (
        <p className="admin-error" role="alert">
          자동 저장하지 못했습니다. 편집 내용은 유지됩니다.{" "}
          <button type="button" onClick={() => void autosave.retry().catch(() => undefined)}>다시 시도</button>
        </p>
      ) : null}
      <ProductWizard
        draft={autosave.draft}
        saveState={autosave.status}
        onChange={setDraft}
        onSave={async () => { await autosave.flush(); }}
        onPreview={preview}
        onPublish={publish}
        onPublishingChange={onPublishingChange}
        upload={dependencies.uploadProductImage}
        deleteImage={dependencies.deleteProductImage}
      />
    </section>
  );
});

export function AdminDashboard({ dependencies = defaultDependencies }: { dependencies?: AdminDashboardDependencies }) {
  const [session, setSession] = useState<AdminSessionState | "loading">("loading");
  const [authMessage, setAuthMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [productError, setProductError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [query, setQuery] = useState("");
  const [editingDraft, setEditingDraft] = useState<ProductDraft | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [toast, setToast] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editorPublishing, setEditorPublishing] = useState(false);
  const [authorizationGeneration, setAuthorizationGeneration] = useState(0);
  const authorizationGenerationRef = useRef(0);
  const editorRef = useRef<DraftEditorHandle>(null);

  useEffect(() => dependencies.observeAdminSession((state) => {
    authorizationGenerationRef.current += 1;
    setAuthorizationGeneration(authorizationGenerationRef.current);
    setSession(state);
    setAuthMessage((current) => (
      state === "forbidden"
        ? "관리자 권한이 없는 계정입니다."
        : state === "signed-out" ? current : ""
    ));
    if (state !== "admin") {
      setProducts([]);
      setDrafts([]);
      setProductError("");
      setDraftError("");
      setEditingDraft(null);
      setEditorPublishing(false);
      setDeleting(null);
      setDeleteBusy(false);
    }
  }, (error) => {
    authorizationGenerationRef.current += 1;
    setAuthorizationGeneration(authorizationGenerationRef.current);
    setProducts([]);
    setDrafts([]);
    setProductError("");
    setDraftError("");
    setEditingDraft(null);
    setEditorPublishing(false);
    setDeleting(null);
    setDeleteBusy(false);
    setSession("signed-out");
    setAuthMessage(getAdminAuthErrorMessage(error));
  }), [dependencies]);

  useEffect(() => {
    if (session !== "admin") return;
    const subscriptionGeneration = authorizationGeneration;
    let active = true;
    const unsubscribe = dependencies.subscribeProducts((nextProducts) => {
      if (!active || authorizationGenerationRef.current !== subscriptionGeneration) return;
      setProducts(nextProducts);
      setProductError("");
    }, () => {
      if (!active || authorizationGenerationRef.current !== subscriptionGeneration) return;
      setProductError("상품 목록을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [authorizationGeneration, dependencies, session]);

  useEffect(() => {
    if (session !== "admin") return;
    const subscriptionGeneration = authorizationGeneration;
    let active = true;
    const unsubscribe = dependencies.subscribeDrafts((nextDrafts) => {
      if (!active || authorizationGenerationRef.current !== subscriptionGeneration) return;
      setDrafts(nextDrafts);
      setDraftError("");
    }, () => {
      if (!active || authorizationGenerationRef.current !== subscriptionGeneration) return;
      setDraftError("임시 저장 초안을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [authorizationGeneration, dependencies, session]);

  const visibleProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return products;
    return products.filter((product) => (
      product.name.toLocaleLowerCase("ko-KR").includes(normalized)
      || product.category.toLocaleLowerCase("ko-KR").includes(normalized)
      || product.id.toLocaleLowerCase("ko-KR").includes(normalized)
    ));
  }, [products, query]);

  const login = async (email: string, password: string) => {
    const result = await dependencies.signInAdmin(email, password);
    if (result === "admin") {
      authorizationGenerationRef.current += 1;
      setAuthorizationGeneration(authorizationGenerationRef.current);
      setAuthMessage("");
      setSession("admin");
    } else if (result === "forbidden") {
      authorizationGenerationRef.current += 1;
      setAuthorizationGeneration(authorizationGenerationRef.current);
      setProducts([]);
      setDrafts([]);
      setEditingDraft(null);
      setEditorPublishing(false);
      setAuthMessage("관리자 권한이 없는 계정입니다.");
      setSession("forbidden");
    }
  };

  const importProducts = async (inputs: ProductInput[]) => {
    await Promise.all(inputs.map((input) => dependencies.saveProduct(input)));
  };

  const toggleStock = async (product: Product) => {
    try {
      await dependencies.saveProduct(
        { ...toInput(product), stock: product.stock > 0 ? 0 : 1 },
        { id: product.id, expectedRevision: product.revision ?? 0 },
      );
      setToast("재고 상태를 변경했습니다.");
    } catch {
      setToast("재고 상태를 변경하지 못했습니다.");
    }
  };

  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await dependencies.deleteProduct(deleting.id);
      setDeleting(null);
      setToast("상품을 삭제했습니다.");
    } catch {
      setToast("상품을 삭제하지 못했습니다. 네트워크 연결을 확인해 주세요.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const startCreate = () => {
    setEditorPublishing(false);
    setEditingDraft(dependencies.startDraftSession(blankDraft(dependencies.createDraftId())));
  };

  const startEdit = (product: Product) => {
    setEditorPublishing(false);
    setEditingDraft(drafts.find((draft) => draft.id === product.id) ?? dependencies.createProductEditDraft(product));
  };

  if (session === "loading" || session === "checking") {
    return <main className="admin-state" role="status">관리자 권한을 확인하는 중입니다.</main>;
  }

  if (session !== "admin") {
    return <AdminLogin message={authMessage} onLogin={login} />;
  }

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div><p className="admin-eyebrow">VITALEAF ADMIN</p><h1>상품 관리</h1><span>상품 정보와 판매 상태를 한곳에서 관리하세요.</span></div>
        <button type="button" className="admin-secondary-button" disabled={editorPublishing} onClick={() => {
          if (editorPublishing || editorRef.current && !editorRef.current.confirmExit()) return;
          void dependencies.signOutAdmin();
        }}>로그아웃</button>
      </header>

      {toast && <div className="admin-toast" role="status"><span>{toast}</span><button type="button" aria-label="알림 닫기" onClick={() => setToast("")}>×</button></div>}

      <CsvTools products={products} onImport={importProducts} />

      {editingDraft ? (
        <DraftEditor
          ref={editorRef}
          key={`${editingDraft.id}:${editingDraft.sessionId ?? "new"}`}
          initialDraft={editingDraft}
          dependencies={dependencies}
          publishing={editorPublishing}
          onPublishingChange={setEditorPublishing}
          onClose={() => {
            if (editorPublishing) return;
            setEditingDraft(null);
          }}
          onPublished={() => {
            setEditorPublishing(false);
            setEditingDraft(null);
            setToast("상품을 판매 공개했습니다.");
          }}
        />
      ) : (
        <section className="admin-catalog" aria-labelledby="admin-catalog-heading">
          <div className="admin-toolbar">
            <div><h2 id="admin-catalog-heading">등록 상품</h2><p>총 {products.length}개</p></div>
            <label><span className="sr-only">상품 검색</span><input aria-label="상품 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명, 카테고리, ID 검색" /></label>
            <button type="button" className="admin-primary-button" onClick={startCreate}>새 상품 등록</button>
          </div>
          {draftError ? <p className="admin-error" role="alert">{draftError}</p> : null}
          {drafts.length > 0 ? (
            <section aria-labelledby="admin-drafts-heading">
              <h3 id="admin-drafts-heading">임시 저장 초안</h3>
              <ul>{drafts.map((draft) => {
                const draftName = draft.name.trim() || "이름 없는 상품";
                return (
                  <li key={draft.id}>
                    <span>{draftName}</span>{" "}
                    <button type="button" onClick={() => setEditingDraft(draft)} aria-label={`${draftName} 초안 이어 쓰기`}>이어 쓰기</button>
                  </li>
                );
              })}</ul>
            </section>
          ) : null}
          {productError ? <p className="admin-error" role="alert">{productError}</p> : visibleProducts.length === 0 ? (
            <div className="admin-empty">{products.length === 0 ? "등록된 상품이 없습니다." : "검색 결과가 없습니다."}</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption>등록 상품 목록</caption>
                <thead><tr><th>상품</th><th>카테고리</th><th>판매가</th><th>재고</th><th>관리</th></tr></thead>
                <tbody>{visibleProducts.map((product) => (
                  <tr key={product.id}>
                    <td><strong>{product.name}</strong><small>{product.id}</small></td>
                    <td>{product.category}</td>
                    <td>{formatWon(product.price)}</td>
                    <td><button type="button" className={product.stock > 0 ? "admin-stock" : "admin-stock admin-stock--off"} aria-label={`${product.name} ${product.stock > 0 ? "품절 처리" : "판매 재개"}`} onClick={() => void toggleStock(product)}>{product.stock > 0 ? `${product.stock}개` : "품절"}</button></td>
                    <td><div className="admin-row-actions"><button type="button" aria-label={`${product.name} 수정`} onClick={() => startEdit(product)}>수정</button><button type="button" aria-label={`${product.name} 삭제`} onClick={() => setDeleting(product)}>삭제</button></div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {deleting && (
        <DeleteProductDialog
          product={deleting}
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </main>
  );
}
