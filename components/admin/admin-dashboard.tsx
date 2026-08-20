"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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
  type ProductDeleteTarget,
  type ProductUpdateTarget,
} from "../../lib/firebase/products";
import {
  createDraftId,
  createProductEditDraft,
  discardDraft,
  duplicateProductToDraft as duplicatePublishedProductToDraft,
  ProductDraftValidationError,
  publishDraft,
  saveDraft,
  startDraftSession,
  subscribeDrafts,
  unpublishProduct,
} from "../../lib/firebase/product-drafts";
import { deleteProductImage, uploadProductImage } from "../../lib/firebase/product-media";
import { validatePublishableDraft } from "../../lib/products/draft";
import type { Product, ProductDraft, ProductInput } from "../../lib/products/types";
import { createCsvDraft } from "../../lib/csv/products-csv";
import type { CsvDraftImportResult } from "./csv-tools";
import { useDraftAutosave } from "../../features/admin/use-draft-autosave";
import { useUnsavedHistoryGuard } from "../../features/admin/use-unsaved-history-guard";
import { CsvTools } from "./csv-tools";
import { ProductTable, type ProductSort, type ProductStatusFilter, type ProductTableRow } from "./product-table";
import { ProductWizard } from "./product-wizard/product-wizard";
import type { MediaDelete, MediaUpload } from "./product-wizard/media-step";

export type AdminDashboardDependencies = {
  observeAdminSession(next: (state: AdminSessionState) => void, onError: (error: unknown) => void): () => void;
  signInAdmin(email: string, password: string): Promise<AdminSignInResult>;
  signOutAdmin(): Promise<void>;
  subscribeProducts(onData: (products: Product[]) => void, onError: (error: Error) => void): () => void;
  saveProduct(input: ProductInput, target?: ProductUpdateTarget): Promise<string>;
  deleteProduct(target: ProductDeleteTarget): Promise<void>;
  subscribeDrafts(onData: (drafts: ProductDraft[]) => void, onError: (error: Error) => void): () => void;
  createDraftId(): string;
  startDraftSession(draft: ProductDraft): ProductDraft;
  createProductEditDraft(product: Product): ProductDraft;
  saveDraft(draft: ProductDraft): Promise<ProductDraft>;
  publishDraft(draft: ProductDraft): Promise<void>;
  unpublishProduct(product: Product): Promise<ProductDraft>;
  discardDraft(draft: ProductDraft): Promise<void>;
  duplicateProductToDraft(productId: string): Promise<ProductDraft>;
  uploadProductImage: MediaUpload;
  deleteProductImage: MediaDelete;
};

const defaultDependencies: Omit<AdminDashboardDependencies, "duplicateProductToDraft"> = {
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
  unpublishProduct,
  discardDraft,
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

function OperationDialog({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
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
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-operation-title">
        <h2 id="admin-operation-title">{title}</h2>
        <p>{description}</p>
        <div>
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} onKeyDown={handleKeyDown}>취소</button>
          <button ref={confirmRef} type="button" disabled={busy} onClick={onConfirm} onKeyDown={handleKeyDown}>{busy ? "처리 중" : confirmLabel}</button>
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
  isActive(): boolean;
  onClose(): void;
  onPublished(): void;
  publishing: boolean;
  onPublishingChange(publishing: boolean): void;
  onGuardingChange(active: boolean): void;
  navigateInternal(destination: string): void;
}>(function DraftEditor({
  initialDraft,
  dependencies,
  isActive,
  onClose,
  onPublished,
  publishing,
  onPublishingChange,
  onGuardingChange,
  navigateInternal,
}, ref) {
  const [draft, setDraft] = useState(initialDraft);
  const publishLockRef = useRef(false);
  const autosave = useDraftAutosave({ draft, save: dependencies.saveDraft, delayMs: 1_200 });
  const autosaveStatus = autosave.status;
  const confirmClose = autosave.confirmClose;
  const hasUnsavedWork = autosaveStatus === "dirty" || autosaveStatus === "saving" || autosaveStatus === "error";
  const onGuardingChangeRef = useRef(onGuardingChange);

  useImperativeHandle(ref, () => ({ confirmExit: confirmClose }), [confirmClose]);

  useEffect(() => {
    onGuardingChangeRef.current = onGuardingChange;
  }, [onGuardingChange]);

  useEffect(() => {
    onGuardingChangeRef.current(hasUnsavedWork || publishing);
  }, [hasUnsavedWork, publishing]);

  useEffect(() => () => onGuardingChangeRef.current(false), []);

  useEffect(() => {
    if (!hasUnsavedWork && !publishing) return;

    const guardInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.hasAttribute("download") || (target.target && target.target !== "_self")) return;

      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const current = new URL(window.location.href);
      if (destination.pathname === current.pathname && destination.search === current.search) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (publishing || !confirmClose()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      try {
        navigateInternal(`${destination.pathname}${destination.search}${destination.hash}`);
      } catch {
        // The sentinel remains armed so the employee can retry navigation safely.
      }
    };

    document.addEventListener("click", guardInternalNavigation, true);
    return () => document.removeEventListener("click", guardInternalNavigation, true);
  }, [confirmClose, hasUnsavedWork, navigateInternal, publishing]);

  const close = () => {
    if (isActive() && autosave.confirmClose()) onClose();
  };

  const preview = async () => {
    if (!isActive()) return;
    const previewWindow = window.open(
      "",
      "_blank",
    );
    if (!previewWindow) throw new Error("PREVIEW_POPUP_BLOCKED");
    previewWindow.opener = null;
    try {
      const saved = await autosave.flush();
      if (!isActive()) {
        previewWindow.close();
        return;
      }
      previewWindow.location.href = `/admin/products/preview/${encodeURIComponent(saved.id)}`;
    } catch (error) {
      previewWindow.close();
      throw error;
    }
  };

  const publish = async () => {
    if (!isActive() || publishLockRef.current) return;
    publishLockRef.current = true;
    try {
      const saved = await autosave.flush();
      if (!isActive()) return;
      const errors = validatePublishableDraft(saved);
      if (errors.length > 0) throw new ProductDraftValidationError(errors);
      await dependencies.publishDraft(saved);
      if (isActive()) onPublished();
    } finally {
      publishLockRef.current = false;
    }
  };

  return (
    <section className="admin-editor" aria-labelledby="admin-editor-heading">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">PRODUCT EDITOR</p>
          <h2 id="admin-editor-heading">{
            autosave.draft.mode === "create" && initialDraft.revision === 0
              ? "새 상품 등록"
              : `${autosave.draft.name.trim() || "이름 없는 상품"} 수정`
          }</h2>
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

type DashboardView = "published" | "drafts" | "csv";
type PendingOperation = { action: "unpublish" | "delete"; row: ProductTableRow };
const dashboardViews: readonly DashboardView[] = ["published", "drafts", "csv"];

export function AdminDashboard({ dependencies: providedDependencies }: { dependencies?: AdminDashboardDependencies }) {
  const router = useRouter();
  const productsRef = useRef<Product[]>([]);
  const runtimeDefaultDependencies = useMemo<AdminDashboardDependencies>(() => ({
    ...defaultDependencies,
    duplicateProductToDraft: (productId) => {
      const source = productsRef.current.find((product) => product.id === productId);
      if (!source) return Promise.reject(new Error("복제할 상품을 찾을 수 없습니다."));
      return duplicatePublishedProductToDraft(source);
    },
  }), []);
  const dependencies = providedDependencies ?? runtimeDefaultDependencies;
  const [session, setSession] = useState<AdminSessionState | "loading">("loading");
  const [authMessage, setAuthMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [productError, setProductError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<DashboardView>("published");
  const [publishedStatus, setPublishedStatus] = useState<ProductStatusFilter>("all");
  const [draftStatus, setDraftStatus] = useState<ProductStatusFilter>("all");
  const [sort, setSort] = useState<ProductSort>("modified-desc");
  const [editingDraft, setEditingDraft] = useState<ProductDraft | null>(null);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const [toast, setToast] = useState("");
  const [lockedIds, setLockedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [editorPublishing, setEditorPublishing] = useState(false);
  const [editorGuardActive, setEditorGuardActive] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [authorizationGeneration, setAuthorizationGeneration] = useState(0);
  const [csvImporting, setCsvImporting] = useState(false);
  const authorizationGenerationRef = useRef(0);
  const csvImportTokenRef = useRef<symbol | null>(null);
  const editorGenerationRef = useRef(0);
  const editorRef = useRef<DraftEditorHandle>(null);
  const tabRefs = useRef<Record<DashboardView, HTMLButtonElement | null>>({
    published: null,
    drafts: null,
    csv: null,
  });
  const mutationTokensRef = useRef(new Map<string, symbol>());
  useUnsavedHistoryGuard({
    active: editorGuardActive || editorPublishing,
    locked: editorPublishing,
  });
  const navigateInternal = useCallback((destination: string) => {
    router.replace(destination);
  }, [router]);

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
      editorGenerationRef.current += 1;
      productsRef.current = [];
      mutationTokensRef.current.clear();
      setProducts([]);
      setDrafts([]);
      setProductError("");
      setDraftError("");
      setEditingDraft(null);
      setEditorPublishing(false);
      setEditorGuardActive(false);
      setPendingOperation(null);
      setLockedIds(new Set());
      setToast("");
      setQuery("");
      setView("published");
    }
  }, (error) => {
    authorizationGenerationRef.current += 1;
    editorGenerationRef.current += 1;
    setAuthorizationGeneration(authorizationGenerationRef.current);
    productsRef.current = [];
    mutationTokensRef.current.clear();
    setProducts([]);
    setDrafts([]);
    setProductError("");
    setDraftError("");
    setEditingDraft(null);
    setEditorPublishing(false);
    setEditorGuardActive(false);
    setPendingOperation(null);
    setLockedIds(new Set());
    setToast("");
    setQuery("");
    setView("published");
    setSession("signed-out");
    setAuthMessage(getAdminAuthErrorMessage(error));
  }), [dependencies]);

  useEffect(() => {
    if (session !== "admin") return;
    const subscriptionGeneration = authorizationGeneration;
    let active = true;
    const unsubscribe = dependencies.subscribeProducts((nextProducts) => {
      if (!active || authorizationGenerationRef.current !== subscriptionGeneration) return;
      productsRef.current = nextProducts;
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

  const publishedRows = useMemo<ProductTableRow[]>(
    () => products.map((value) => ({ kind: "published", value })),
    [products],
  );
  const draftRows = useMemo<ProductTableRow[]>(
    () => drafts.map((value) => ({ kind: "draft", value })),
    [drafts],
  );

  const login = async (email: string, password: string) => {
    const result = await dependencies.signInAdmin(email, password);
    if (result === "admin") {
      authorizationGenerationRef.current += 1;
      setAuthorizationGeneration(authorizationGenerationRef.current);
      setAuthMessage("");
      setSession("admin");
    } else if (result === "forbidden") {
      authorizationGenerationRef.current += 1;
      editorGenerationRef.current += 1;
      productsRef.current = [];
      mutationTokensRef.current.clear();
      setAuthorizationGeneration(authorizationGenerationRef.current);
      setProducts([]);
      setDrafts([]);
      setEditingDraft(null);
      setEditorPublishing(false);
      setEditorGuardActive(false);
      setPendingOperation(null);
      setLockedIds(new Set());
      setToast("");
      setQuery("");
      setView("published");
      setAuthMessage("관리자 권한이 없는 계정입니다.");
      setSession("forbidden");
    }
  };

  const importDrafts = async (inputs: ProductInput[]): Promise<CsvDraftImportResult> => {
    if (csvImportTokenRef.current) throw new Error("CSV import already in progress");
    const token = Symbol("csv-import");
    const importGeneration = authorizationGenerationRef.current;
    csvImportTokenRef.current = token;
    setCsvImporting(true);
    try {
      const attempts = inputs.map(async (input) => {
        const id = dependencies.createDraftId();
        const draft = dependencies.startDraftSession(createCsvDraft(input, id));
        return dependencies.saveDraft(draft);
      });
      const outcomes = await Promise.allSettled(attempts);
      const result = outcomes.reduce<CsvDraftImportResult>((result, outcome, index) => {
        if (outcome.status === "fulfilled") result.savedCount += 1;
        else result.failures.push({
          input: inputs[index]!,
          message: outcome.reason instanceof Error ? outcome.reason.message : "draft save failed",
        });
        return result;
      }, { savedCount: 0, failures: [] });
      return authorizationGenerationRef.current === importGeneration ? result : { ...result, stale: true };
    } finally {
      if (csvImportTokenRef.current === token) {
        csvImportTokenRef.current = null;
        setCsvImporting(false);
      }
    }
  };

  const runDocumentMutation = async <T,>(
    id: string,
    operation: () => Promise<T>,
    onSuccess: (result: T) => void,
    failureMessage: string,
  ) => {
    if (mutationTokensRef.current.has(id)) return;
    const token = Symbol(id);
    const operationGeneration = authorizationGenerationRef.current;
    mutationTokensRef.current.set(id, token);
    setLockedIds(new Set(mutationTokensRef.current.keys()));
    try {
      const result = await operation();
      if (
        authorizationGenerationRef.current === operationGeneration
        && mutationTokensRef.current.get(id) === token
      ) onSuccess(result);
    } catch {
      if (
        authorizationGenerationRef.current === operationGeneration
        && mutationTokensRef.current.get(id) === token
      ) setToast(failureMessage);
    } finally {
      if (mutationTokensRef.current.get(id) === token) {
        mutationTokensRef.current.delete(id);
        setLockedIds(new Set(mutationTokensRef.current.keys()));
      }
    }
  };

  const toggleStock = (product: Product) => void runDocumentMutation(
    product.id,
    () => dependencies.saveProduct(
      { ...toInput(product), stock: product.stock > 0 ? 0 : 1 },
      { id: product.id, expectedRevision: product.revision ?? 0 },
    ),
    () => setToast("재고 상태를 변경했습니다."),
    "재고 상태를 변경하지 못했습니다.",
  );

  const duplicateProduct = (productId: string) => void runDocumentMutation(
    productId,
    () => dependencies.duplicateProductToDraft(productId),
    () => setToast("복제 초안을 만들었습니다."),
    "상품을 복제하지 못했습니다. 목록을 새로 확인해 주세요.",
  );

  const publishSavedDraft = (draft: ProductDraft) => void runDocumentMutation(
    draft.id,
    () => dependencies.publishDraft(draft),
    () => setToast("상품을 판매 공개했습니다."),
    "판매 공개를 완료하지 못했습니다. 초안을 다시 확인해 주세요.",
  );

  const previewRow = (row: ProductTableRow) => {
    const route = row.kind === "published"
      ? `/products/${encodeURIComponent(row.value.id)}`
      : `/admin/products/preview/${encodeURIComponent(row.value.id)}`;
    const previewWindow = window.open(route, "_blank", "noopener,noreferrer");
    if (!previewWindow) setToast("미리 보기 창을 열지 못했습니다. 팝업 차단 설정을 확인해 주세요.");
  };

  const closePendingOperation = (operation: PendingOperation) => {
    setPendingOperation((current) => (
      current?.action === operation.action
      && current.row.kind === operation.row.kind
      && current.row.value.id === operation.row.value.id
        ? null
        : current
    ));
  };

  const confirmPendingOperation = () => {
    const operation = pendingOperation;
    if (!operation) return;
    const { row } = operation;
    if (operation.action === "unpublish") {
      if (row.kind !== "published") return;
      void runDocumentMutation(
        row.value.id,
        () => dependencies.unpublishProduct(row.value),
        () => {
          closePendingOperation(operation);
          setToast("판매를 중지하고 수정 가능한 초안으로 옮겼습니다.");
        },
        "판매를 중지하지 못했습니다. 최신 상품 상태를 확인해 주세요.",
      );
      return;
    }

    void runDocumentMutation(
      row.value.id,
      () => row.kind === "published"
        ? dependencies.deleteProduct({ id: row.value.id, expectedRevision: row.value.revision ?? 0 })
        : dependencies.discardDraft(row.value),
      () => {
        closePendingOperation(operation);
        setToast(row.kind === "published" ? "상품을 삭제했습니다." : "초안을 삭제했습니다.");
      },
      row.kind === "published"
        ? "상품을 삭제하지 못했습니다. 네트워크 연결을 확인해 주세요."
        : "초안을 삭제하지 못했습니다. 최신 초안 상태를 확인해 주세요.",
    );
  };

  const startCreate = () => {
    editorGenerationRef.current += 1;
    setEditorGeneration(editorGenerationRef.current);
    setEditorPublishing(false);
    setEditorGuardActive(false);
    setEditingDraft(dependencies.startDraftSession(blankDraft(dependencies.createDraftId())));
  };

  const startEdit = (product: Product) => {
    editorGenerationRef.current += 1;
    setEditorGeneration(editorGenerationRef.current);
    setEditorPublishing(false);
    setEditorGuardActive(false);
    setEditingDraft(drafts.find((draft) => draft.id === product.id) ?? dependencies.createProductEditDraft(product));
  };

  const continueDraft = (draft: ProductDraft) => {
    editorGenerationRef.current += 1;
    setEditorGeneration(editorGenerationRef.current);
    setEditorPublishing(false);
    setEditorGuardActive(false);
    setEditingDraft(draft);
  };

  const editRow = (row: ProductTableRow) => {
    if (row.kind === "published") startEdit(row.value);
    else continueDraft(row.value);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentView: DashboardView) => {
    const currentIndex = dashboardViews.indexOf(currentView);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % dashboardViews.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + dashboardViews.length) % dashboardViews.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = dashboardViews.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextView = dashboardViews[nextIndex]!;
    setView(nextView);
    tabRefs.current[nextView]?.focus();
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
        <button type="button" className="admin-secondary-button" disabled={editorPublishing || csvImporting} onClick={() => {
          if (editorPublishing || csvImporting || editorRef.current && !editorRef.current.confirmExit()) return;
          void dependencies.signOutAdmin();
        }}>로그아웃</button>
      </header>

      {toast && <div className="admin-toast" role="status"><span>{toast}</span><button type="button" aria-label="알림 닫기" onClick={() => setToast("")}>×</button></div>}

      {editingDraft ? (
        <DraftEditor
          ref={editorRef}
          key={`${editingDraft.id}:${editingDraft.sessionId ?? "new"}:${editorGeneration}`}
          initialDraft={editingDraft}
          dependencies={dependencies}
          isActive={() => editorGenerationRef.current === editorGeneration}
          navigateInternal={navigateInternal}
          publishing={editorPublishing}
          onPublishingChange={(publishing) => {
            if (editorGenerationRef.current === editorGeneration) setEditorPublishing(publishing);
          }}
          onGuardingChange={(active) => {
            if (editorGenerationRef.current === editorGeneration) setEditorGuardActive(active);
          }}
          onClose={() => {
            if (editorGenerationRef.current !== editorGeneration || editorPublishing) return;
            editorGenerationRef.current += 1;
            setEditorGuardActive(false);
            setEditingDraft(null);
          }}
          onPublished={() => {
            if (editorGenerationRef.current !== editorGeneration) return;
            editorGenerationRef.current += 1;
            setEditorPublishing(false);
            setEditorGuardActive(false);
            setEditingDraft(null);
            setToast("상품을 판매 공개했습니다.");
          }}
        />
      ) : (
        <>
          <div className="admin-view-tabs" role="tablist" aria-label="상품 관리 보기">
            <button ref={(node) => { tabRefs.current.published = node; }} id="admin-tab-published" type="button" disabled={csvImporting} role="tab" tabIndex={view === "published" ? 0 : -1} aria-label="판매 상품" aria-describedby="admin-tab-published-count" aria-selected={view === "published"} aria-controls="admin-panel-published" onClick={() => setView("published")} onKeyDown={(event) => handleTabKeyDown(event, "published")}>판매 상품 <span id="admin-tab-published-count">{products.length}개</span></button>
            <button ref={(node) => { tabRefs.current.drafts = node; }} id="admin-tab-drafts" type="button" disabled={csvImporting} role="tab" tabIndex={view === "drafts" ? 0 : -1} aria-label="임시 저장" aria-describedby="admin-tab-drafts-count" aria-selected={view === "drafts"} aria-controls="admin-panel-drafts" onClick={() => setView("drafts")} onKeyDown={(event) => handleTabKeyDown(event, "drafts")}>임시 저장 <span id="admin-tab-drafts-count">{drafts.length}개</span></button>
            <button ref={(node) => { tabRefs.current.csv = node; }} id="admin-tab-csv" type="button" disabled={csvImporting} role="tab" tabIndex={view === "csv" ? 0 : -1} aria-label="CSV 관리" aria-selected={view === "csv"} aria-controls="admin-panel-csv" onClick={() => setView("csv")} onKeyDown={(event) => handleTabKeyDown(event, "csv")}>CSV 관리</button>
          </div>

          {view === "published" ? (
            <section id="admin-panel-published" className="admin-catalog" role="tabpanel" aria-labelledby="admin-tab-published">
              <div className="admin-toolbar">
                <div><h2>판매 상품</h2><p>현재 스토어에 공개된 상품 {products.length}개</p></div>
                <button type="button" className="admin-primary-button" onClick={startCreate}>새 상품 등록</button>
              </div>
              {productError ? <p className="admin-error" role="alert">{productError}</p> : (
                <ProductTable
                  rows={publishedRows}
                  query={query}
                  statusFilter={publishedStatus}
                  statusOptions={["all", "published", "sold-out"]}
                  sort={sort}
                  lockedIds={lockedIds}
                  onQueryChange={setQuery}
                  onStatusFilterChange={setPublishedStatus}
                  onSortChange={setSort}
                  onEdit={editRow}
                  onDuplicate={duplicateProduct}
                  onPreview={previewRow}
                  onPublish={publishSavedDraft}
                  onUnpublish={(value) => setPendingOperation({ action: "unpublish", row: { kind: "published", value } })}
                  onDelete={(row) => setPendingOperation({ action: "delete", row })}
                  onToggleStock={toggleStock}
                />
              )}
            </section>
          ) : null}

          {view === "drafts" ? (
            <section id="admin-panel-drafts" className="admin-catalog" role="tabpanel" aria-labelledby="admin-tab-drafts">
              <div className="admin-toolbar">
                <div><h2>임시 저장 초안</h2><p>작성 중이거나 판매 중지된 초안 {drafts.length}개</p></div>
              </div>
              {draftError ? <p className="admin-error" role="alert">{draftError}</p> : (
                <ProductTable
                  rows={draftRows}
                  query={query}
                  statusFilter={draftStatus}
                  statusOptions={["all", "draft"]}
                  sort={sort}
                  lockedIds={lockedIds}
                  onQueryChange={setQuery}
                  onStatusFilterChange={setDraftStatus}
                  onSortChange={setSort}
                  onEdit={editRow}
                  onDuplicate={duplicateProduct}
                  onPreview={previewRow}
                  onPublish={publishSavedDraft}
                  onUnpublish={(value) => setPendingOperation({ action: "unpublish", row: { kind: "published", value } })}
                  onDelete={(row) => setPendingOperation({ action: "delete", row })}
                  onToggleStock={toggleStock}
                />
              )}
            </section>
          ) : null}

          {view === "csv" ? (
            <section id="admin-panel-csv" className="admin-catalog" role="tabpanel" aria-labelledby="admin-tab-csv">
              <CsvTools products={products} importing={csvImporting} onImportDrafts={importDrafts} />
            </section>
          ) : null}
        </>
      )}

      {pendingOperation ? (
        <OperationDialog
          title={pendingOperation.action === "unpublish"
            ? "판매 중지 확인"
            : pendingOperation.row.kind === "draft" ? "초안 삭제 확인" : "상품 삭제 확인"}
          description={pendingOperation.action === "unpublish" ? (
            <><strong>{pendingOperation.row.value.name}</strong> 상품이 공개 상품에서 사라지고 수정 가능한 초안으로 이동합니다.</>
          ) : pendingOperation.row.kind === "draft" ? (
            <><strong>{pendingOperation.row.value.name}</strong> 초안의 임시 저장 내용을 삭제합니다. 삭제 후에는 복구할 수 없습니다.</>
          ) : (
            <><strong>{pendingOperation.row.value.name}</strong> 상품을 삭제하시겠습니까? 삭제한 상품은 복구할 수 없습니다.</>
          )}
          confirmLabel={pendingOperation.action === "unpublish"
            ? "판매 중지"
            : pendingOperation.row.kind === "draft" ? "초안 삭제" : "삭제 확인"}
          busy={lockedIds.has(pendingOperation.row.value.id)}
          onCancel={() => setPendingOperation(null)}
          onConfirm={confirmPendingOperation}
        />
      ) : null}
    </main>
  );
}
