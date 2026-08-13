type WizardActionsProps = {
  step: number;
  busy: "idle" | "saving" | "previewing" | "publishing";
  saveState: "idle" | "dirty" | "saving" | "saved" | "error";
  publishDisabled?: boolean;
  onPrevious(): void;
  onNext(): void;
  onSave(): void;
  onPreview(): void;
  onPublish(): void;
};

export function WizardActions({ step, busy, saveState, publishDisabled = false, onPrevious, onNext, onSave, onPreview, onPublish }: WizardActionsProps) {
  const isBusy = busy !== "idle";
  const nextNames = ["기본 정보", "상품 이미지", "상세 정보", "판매 설정"];
  const saveStatus = {
    idle: "아직 변경 사항이 없습니다.",
    dirty: "저장되지 않은 변경 사항이 있습니다.",
    saving: "자동 저장 중입니다.",
    saved: "자동 저장되었습니다.",
    error: "자동 저장하지 못했습니다.",
  }[saveState];
  return (
    <div className="product-wizard__actions" aria-label="상품 등록 작업">
      <span role="status">{saveStatus}</span>
      <button type="button" className="admin-secondary-button" onClick={onPrevious} disabled={step === 1 || isBusy}>이전 단계</button>
      {step < 4 && <button type="button" className="admin-secondary-button" onClick={onNext} disabled={isBusy} aria-label={`다음 단계: ${nextNames[step]}`}>다음 단계</button>}
      <button type="button" className="admin-secondary-button" onClick={onSave} disabled={isBusy}>{busy === "saving" || saveState === "saving" ? "저장 중" : "임시 저장"}</button>
      <button type="button" className="admin-secondary-button" onClick={onPreview} disabled={isBusy}>{busy === "previewing" ? "미리 보기 중" : "미리 보기"}</button>
      <button type="button" className="admin-primary-button" onClick={onPublish} disabled={isBusy || publishDisabled}>{busy === "publishing" ? "공개 중" : "판매 공개"}</button>
    </div>
  );
}
