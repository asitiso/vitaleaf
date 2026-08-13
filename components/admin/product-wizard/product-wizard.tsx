"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { validatePublishableDraft, type DraftValidationError } from "../../../lib/products/draft";
import type { ProductDraft } from "../../../lib/products/types";
import { BasicStep } from "./basic-step";
import { DetailsStep } from "./details-step";
import { MediaStep, type MediaDelete, type MediaUpload } from "./media-step";
import { SalesStep } from "./sales-step";
import { WizardActions } from "./wizard-actions";

export type WizardProps = {
  draft: ProductDraft;
  saveState: "idle" | "saving" | "saved" | "error";
  onChange(next: ProductDraft): void;
  onSave(): Promise<void>;
  onPreview(): void | Promise<void>;
  onPublish(): Promise<void>;
  mediaSlot?: ReactNode;
  upload?: MediaUpload;
  deleteImage?: MediaDelete;
};

type WizardStep = 1 | 2 | 3 | 4;
type BusyState = "idle" | "saving" | "previewing" | "publishing";

const steps: ReadonlyArray<{ number: WizardStep; name: string; description: string }> = [
  { number: 1, name: "기본 정보", description: "이름과 분류" },
  { number: 2, name: "상품 이미지", description: "판매할 이미지" },
  { number: 3, name: "상세 정보", description: "성분과 안내" },
  { number: 4, name: "판매 설정", description: "가격과 재고" },
];

const visibleStepFor = (error: DraftValidationError): WizardStep => (
  error.field === "price" || error.field === "stock" ? 4
    : error.field === "origin" || error.field === "cautions" ? 3
      : error.step
);

const staffMessageFor = (error: DraftValidationError): string => ({
  name: "상품명을 입력해 주세요.",
  category: "상품 분류를 선택해 주세요.",
  price: "판매가를 0원보다 크게 입력해 주세요.",
  stock: "재고 수량을 0개 이상으로 입력해 주세요.",
  media: "상품 이미지를 한 장 이상 추가해 주세요.",
  dosage: "섭취 방법을 입력해 주세요.",
  ingredients: "이름이 있는 성분을 한 개 이상 추가해 주세요.",
  origin: "원산지를 입력해 주세요.",
  cautions: "주의사항을 한 개 이상 추가해 주세요.",
}[error.field]);

const focusIdFor = (field: DraftValidationError["field"]): string | null => ({
  name: "wizard-name",
  category: "wizard-category",
  price: "wizard-price",
  stock: "wizard-stock",
  media: "wizard-media-slot",
  dosage: "wizard-dosage",
  ingredients: null,
  origin: "wizard-origin",
  cautions: null,
}[field]);

const asStep = (value: number): WizardStep => value === 2 || value === 3 || value === 4 ? value : 1;

export function ProductWizard({ draft, saveState, onChange, onSave, onPreview, onPublish, mediaSlot, upload, deleteImage }: WizardProps) {
  const [localState, setLocalState] = useState(() => ({ source: draft, value: draft, activeStep: draft.currentStep }));
  const [errors, setErrors] = useState<DraftValidationError[]>([]);
  const [busy, setBusy] = useState<BusyState>("idle");
  const [operationError, setOperationError] = useState("");
  const [mediaUploading, setMediaUploading] = useState(false);
  const draftIdentity = `${draft.id}:${draft.sessionId ?? ""}`;
  const [slugState, setSlugState] = useState(() => ({ draftIdentity, wasManuallyEdited: false }));

  const hasExternalDraft = localState.source !== draft;
  const workingDraft = hasExternalDraft ? draft : localState.value;
  const activeStep = hasExternalDraft ? draft.currentStep : localState.activeStep;
  const slugWasManuallyEdited = slugState.draftIdentity === draftIdentity && slugState.wasManuallyEdited;

  const errorsByStep = useMemo(() => errors.reduce<Partial<Record<WizardStep, DraftValidationError[]>>>((grouped, error) => {
    const step = visibleStepFor(error);
    grouped[step] = [...(grouped[step] ?? []), error];
    return grouped;
  }, {}), [errors]);

  useEffect(() => {
    const firstError = errorsByStep[activeStep]?.[0];
    if (!firstError) return;
    const id = focusIdFor(firstError.field);
    const target = id
      ? document.getElementById(id)
      : document.querySelector<HTMLElement>(`[data-wizard-field="${firstError.field}"]`);
    target?.focus();
  }, [activeStep, errorsByStep]);

  const commit = (next: ProductDraft) => {
    setLocalState({ source: draft, value: next, activeStep });
    onChange(next);
  };

  const goTo = (step: WizardStep) => {
    const next = workingDraft.currentStep === step ? workingDraft : { ...workingDraft, currentStep: step };
    setLocalState({ source: draft, value: next, activeStep: step });
    if (next !== workingDraft) onChange(next);
  };

  const runSave = async () => {
    if (busy !== "idle" || saveState === "saving") return;
    setBusy("saving");
    setOperationError("");
    try {
      await onSave();
    } catch {
      setOperationError("임시 저장을 완료하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy("idle");
    }
  };

  const runPublish = async () => {
    if (busy !== "idle" || saveState === "saving") return;
    const nextErrors = validatePublishableDraft(workingDraft).map((error) => ({ ...error, message: staffMessageFor(error) }));
    setErrors(nextErrors);
    setOperationError("");
    if (nextErrors.length) {
      const firstVisibleStep = Math.min(...nextErrors.map(visibleStepFor)) as WizardStep;
      goTo(firstVisibleStep);
      return;
    }
    setBusy("publishing");
    try {
      await onPublish();
    } catch {
      setOperationError("판매 공개를 완료하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy("idle");
    }
  };

  const runPreview = async () => {
    if (busy !== "idle" || saveState === "saving") return;
    setBusy("previewing");
    setOperationError("");
    try {
      await onPreview();
    } catch {
      setOperationError("미리 보기를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy("idle");
    }
  };

  const fieldErrors = Object.fromEntries((errorsByStep[activeStep] ?? []).map((error) => [error.field, error.message]));
  const current = steps[activeStep - 1]!;

  return (
    <section className="product-wizard" aria-labelledby="product-wizard-title">
      <header className="product-wizard__header">
        <p className="admin-eyebrow">GUIDED PRODUCT REGISTRATION</p>
        <h1 id="product-wizard-title">상품 등록</h1>
        <p>순서대로 입력하면 판매 공개 전 필요한 정보를 확인해 드립니다.</p>
      </header>
      <nav className="product-wizard__steps" aria-label="상품 등록 4단계">
        <ol>{steps.map((step) => (
          <li key={step.number} className={step.number === activeStep ? "is-current" : step.number < activeStep ? "is-complete" : ""}>
            <button type="button" onClick={() => goTo(step.number)} aria-current={step.number === activeStep ? "step" : undefined}>
              <span>{step.number}</span><strong>{step.name}</strong><small>{step.description}</small>
            </button>
          </li>
        ))}</ol>
      </nav>
      {errors.length > 0 && (
        <section className="product-wizard__error-summary" role="alert" aria-labelledby="wizard-error-title">
          <h2 id="wizard-error-title">판매 공개 전에 확인해 주세요</h2>
          {steps.filter((step) => errorsByStep[step.number]?.length).map((step) => (
            <div key={step.number}><strong>{step.number}단계 · {step.name}</strong><ul>{errorsByStep[step.number]!.map((error) => <li key={`${error.field}-${error.message}`}><button type="button" onClick={() => goTo(step.number)}>{error.message}</button></li>)}</ul></div>
          ))}
        </section>
      )}
      {operationError && <p className="admin-error" role="alert">{operationError}</p>}
      <div className="product-wizard__body" aria-live="polite">
        <p className="product-wizard__progress">{activeStep} / 4 · {current.name}</p>
        {activeStep === 1 && <BasicStep draft={workingDraft} errors={fieldErrors} slugWasManuallyEdited={slugWasManuallyEdited} onSlugEdited={() => setSlugState({ draftIdentity, wasManuallyEdited: true })} onChange={commit} />}
        {activeStep === 2 && <div id="wizard-media-slot" tabIndex={-1} className="product-wizard__media-slot" aria-label="상품 이미지 업로드 영역" aria-invalid={Boolean(fieldErrors.media)} aria-describedby={fieldErrors.media ? "wizard-media-error" : undefined}><MediaStep productId={workingDraft.id} media={workingDraft.media} onChange={(media) => commit({ ...workingDraft, media })} upload={upload} deleteImage={deleteImage} onUploadingChange={setMediaUploading} />{mediaSlot}{fieldErrors.media && <small id="wizard-media-error">{fieldErrors.media}</small>}</div>}
        {activeStep === 3 && <DetailsStep draft={workingDraft} errors={fieldErrors} onChange={commit} />}
        {activeStep === 4 && <SalesStep draft={workingDraft} errors={fieldErrors} onChange={commit} />}
      </div>
      <WizardActions step={activeStep} busy={busy} saveState={saveState} publishDisabled={mediaUploading} onPrevious={() => goTo(asStep(activeStep - 1))} onNext={() => goTo(asStep(activeStep + 1))} onSave={() => void runSave()} onPreview={() => void runPreview()} onPublish={() => void runPublish()} />
    </section>
  );
}
