type WizardActionsProps = {
  step: number;
  busy: "idle" | "saving" | "previewing" | "publishing";
  saveState: "idle" | "saving" | "saved" | "error";
  publishDisabled?: boolean;
  onPrevious(): void;
  onNext(): void;
  onSave(): void;
  onPreview(): void;
  onPublish(): void;
};

export function WizardActions({ step, busy, saveState, publishDisabled = false, onPrevious, onNext, onSave, onPreview, onPublish }: WizardActionsProps) {
  const isBusy = busy !== "idle" || saveState === "saving";
  const nextNames = ["기본 정보", "상품 이미지", "상세 정보", "판매 설정"];
  return (
    <div className="product-wizard__actions" aria-label="상품 등록 작업">
      <button type="button" className="admin-secondary-button" onClick={onPrevious} disabled={step === 1 || isBusy}>이전 단계</button>
      {step < 4 && <button type="button" className="admin-secondary-button" onClick={onNext} disabled={isBusy} aria-label={`다음 단계: ${nextNames[step]}`}>다음 단계</button>}
      <button type="button" className="admin-secondary-button" onClick={onSave} disabled={isBusy}>{busy === "saving" || saveState === "saving" ? "저장 중" : "임시 저장"}</button>
      <button type="button" className="admin-secondary-button" onClick={onPreview} disabled={isBusy}>{busy === "previewing" ? "미리 보기 중" : "미리 보기"}</button>
      <button type="button" className="admin-primary-button" onClick={onPublish} disabled={isBusy || publishDisabled}>{busy === "publishing" ? "공개 중" : "판매 공개"}</button>
    </div>
  );
}
