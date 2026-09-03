"use client";

import Image from "next/image";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";

import {
  createInquiry,
  type InquiryClientAccess,
  InquiryClientError,
  putInquiryUpload,
  requestInquiryUploadUrl,
} from "../../lib/inquiries/client";
import { detectImageType, validateUploadRequest } from "../../lib/inquiries/uploads";
import { parseInquiryCreateInput, InquiryValidationError } from "../../lib/inquiries/validation";

type Upload = {
  id: number;
  file: File;
  preview: string;
  status: "queued" | "uploading" | "ready" | "error";
  receipt: string | null;
  receivedAt: number | null;
  expiresAt: string | null;
};

type InquiryFormProps = {
  access: InquiryClientAccess;
  orderNumbers: string[];
  onSuccess: (id: string) => void;
  lockedOrderNumber?: string | null;
  onAccessExpired?: () => void;
};

const categories = [
  ["order", "주문"],
  ["shipping", "배송"],
  ["product", "상품"],
  ["return", "교환·반품"],
  ["other", "기타"],
] as const;

const uploadLabels = {
  queued: "업로드 대기",
  uploading: "업로드 중",
  ready: "업로드 완료",
  error: "업로드 실패",
};

const withoutReceipt = (upload: Upload): Upload => ({
  ...upload,
  status: "queued",
  receipt: null,
  receivedAt: null,
  expiresAt: null,
});

const needsRefresh = (upload: Upload) => upload.status === "ready" && (
  Date.now() - (upload.receivedAt ?? 0) >= 9 * 60_000
  || Date.parse(upload.expiresAt ?? "") <= Date.now()
);

export function InquiryForm(props: InquiryFormProps) {
  // Guest panels can replace access without navigating. Members are keyed by UID in their gate.
  const identity = props.access.kind === "guest" ? props.access.token : "member";
  return <InquiryFormContent key={identity + ":" + String(props.lockedOrderNumber)} {...props} />;
}

function InquiryFormContent({ access, orderNumbers, onSuccess, lockedOrderNumber, onAccessExpired }: InquiryFormProps) {
  const [category, setCategory] = useState("");
  const [orderNumber, setOrderNumber] = useState(lockedOrderNumber ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const uploadsRef = useRef<Upload[]>([]);
  const busyRef = useRef(false);
  const pendingFiles = useRef(0);
  const nextId = useRef(0);
  const lifetime = useRef<AbortController | null>(null);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    const allocated = previews.current;
    lifetime.current = controller;
    return () => {
      controller.abort();
      allocated.forEach((preview) => URL.revokeObjectURL(preview));
      allocated.clear();
    };
  }, []);

  function replaceUploads(next: Upload[]) {
    // This is the canonical operation state, not an effect-flushed render snapshot.
    uploadsRef.current = next;
    setUploads(next);
  }

  function expireAccess(reason: unknown, signal: AbortSignal): boolean {
    if (signal.aborted || access.kind !== "guest" || !onAccessExpired
      || !(reason instanceof InquiryClientError) || reason.status !== 401) return false;
    // Stop both upload workers immediately, before React unmounts this private draft.
    lifetime.current?.abort();
    onAccessExpired();
    return true;
  }

  function updateUpload(id: number, patch: Partial<Upload>) {
    replaceUploads(uploadsRef.current.map((upload) => (
      upload.id === id ? { ...upload, ...patch } : upload
    )));
  }

  function removeUpload(id: number) {
    if (busyRef.current) return;
    const removed = uploadsRef.current.find((upload) => upload.id === id);
    if (removed && previews.current.delete(removed.preview)) URL.revokeObjectURL(removed.preview);
    replaceUploads(uploadsRef.current.filter((upload) => upload.id !== id));
  }

  async function addFiles(files: FileList | null) {
    const signal = lifetime.current?.signal;
    if (!files || !signal || signal.aborted || busyRef.current) return;
    setError("");
    const selected = [...files];
    if (uploadsRef.current.length + pendingFiles.current + selected.length > 3) {
      setError("이미지는 최대 3장까지 첨부할 수 있습니다.");
      return;
    }
    // Reserve slots before the first await, including concurrent file-picker events.
    pendingFiles.current += selected.length;
    setValidating(pendingFiles.current > 0);
    const batch = selected.map((file) => ({ file, id: nextId.current++ }));
    for (const { file, id } of batch) {
      try {
        signal.throwIfAborted();
        validateUploadRequest({ contentType: file.type, size: file.size });
        const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        signal.throwIfAborted();
        if (detectImageType(bytes) !== file.type) throw new Error("Invalid image signature");
        const preview = URL.createObjectURL(file);
        previews.current.add(preview);
        const added: Upload = {
          id,
          file,
          preview,
          status: "queued",
          receipt: null,
          receivedAt: null,
          expiresAt: null,
        };
        replaceUploads([...uploadsRef.current, added].sort((left, right) => left.id - right.id));
      } catch {
        if (!signal.aborted) {
          setError("JPG, PNG, WebP 형식의 5MB 이하 이미지만 첨부할 수 있습니다. 빈 파일은 제외해 주세요.");
        }
      } finally {
        pendingFiles.current -= 1;
      }
    }
    if (!signal.aborted) setValidating(pendingFiles.current > 0);
  }

  async function uploadPending(signal: AbortSignal) {
    const pending = uploadsRef.current.filter((upload) => upload.status !== "ready");
    let index = 0;
    async function worker() {
      while (index < pending.length && !signal.aborted) {
        const upload = pending[index++];
        updateUpload(upload.id, { status: "uploading" });
        try {
          const policy = validateUploadRequest({ contentType: upload.file.type, size: upload.file.size });
          const signed = await requestInquiryUploadUrl(access, policy, signal);
          signal.throwIfAborted();
          const receivedAt = Date.now();
          await putInquiryUpload(signed.uploadUrl, upload.file, signal);
          signal.throwIfAborted();
          updateUpload(upload.id, {
            status: "ready", receipt: signed.receipt, receivedAt, expiresAt: signed.expiresAt,
          });
        } catch (reason) {
          if (expireAccess(reason, signal)) return;
          if (!signal.aborted) {
            updateUpload(upload.id, {
              status: "error", receipt: null, receivedAt: null, expiresAt: null,
            });
          }
        }
      }
    }
    await Promise.all([worker(), worker()]);
    signal.throwIfAborted();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || busyRef.current || pendingFiles.current > 0) return;
    setError("");
    const selectedOrder = lockedOrderNumber !== undefined ? lockedOrderNumber : (orderNumber || null);
    let input;
    try {
      if (lockedOrderNumber === undefined && selectedOrder && !orderNumbers.includes(selectedOrder)) {
        throw new InquiryValidationError();
      }
      input = parseInquiryCreateInput({ category, title, body, orderNumber: selectedOrder, uploadReceipts: [] });
    } catch (reason) {
      setError(reason instanceof InquiryValidationError ? reason.message : "문의 내용을 다시 확인해 주세요.");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      replaceUploads(uploadsRef.current.map((upload) => needsRefresh(upload) ? withoutReceipt(upload) : upload));
      await uploadPending(signal);
      signal.throwIfAborted();
      // A slow upload can outlive a previously ready receipt. Retain originals for a fresh retry.
      replaceUploads(uploadsRef.current.map((upload) => needsRefresh(upload) ? withoutReceipt(upload) : upload));
      const current = uploadsRef.current;
      if (current.some((upload) => upload.status !== "ready" || !upload.receipt)) {
        setError("이미지 업로드를 완료하지 못했습니다. 문의 등록을 다시 눌러 주세요.");
        return;
      }
      const created = await createInquiry(access, {
        ...input,
        uploadReceipts: current.map((upload) => upload.receipt!),
      }, signal);
      signal.throwIfAborted();
      onSuccess(created.id);
    } catch (reason) {
      if (expireAccess(reason, signal)) return;
      if (!signal.aborted) {
        replaceUploads(uploadsRef.current.map(withoutReceipt));
        setError("문의 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      if (!signal.aborted) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(event.target.files);
    event.currentTarget.value = "";
  }

  const options = lockedOrderNumber ? [lockedOrderNumber] : orderNumbers;
  const orderLabel = access.kind === "guest" ? "관련 주문번호" : "관련 주문";
  return (
    <section className="inquiry-page">
      <header className="inquiry-page__header">
        <p>VITALEAF</p>
        <h1>문의 작성</h1>
        <p>{access.kind === "guest" ? "확인한 주문에 대한 문의를 남겨 주세요." : "주문과 관련 없는 문의도 남길 수 있습니다."}</p>
      </header>
      <form className="inquiry-form" onSubmit={submit}>
        {error ? <p role="alert">{error}</p> : null}
        <label>
          문의 유형
          <select
            aria-label="문의 유형"
            disabled={busy}
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="">선택해 주세요</option>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          {orderLabel}
          <select
            aria-label={orderLabel}
            disabled={busy || lockedOrderNumber !== undefined}
            onChange={(event) => setOrderNumber(event.target.value)}
            value={lockedOrderNumber ?? orderNumber}
          >
            <option value="">문의와 무관한 주문 없음</option>
            {options.map((number) => <option key={number} value={number}>{number}</option>)}
          </select>
        </label>
        <label>
          제목
          <input
            aria-label="제목"
            disabled={busy}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <span>100자 이내</span>
        </label>
        <label>
          문의 내용
          <textarea
            aria-label="문의 내용"
            disabled={busy}
            maxLength={6000}
            onChange={(event) => setBody(event.target.value)}
            value={body}
          />
          <span>3,000자 이내</span>
        </label>
        <label>
          이미지 첨부 (최대 3장, 각 5MB 이하)
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="이미지 첨부"
            disabled={busy}
            multiple
            onChange={handleFiles}
            type="file"
          />
        </label>
        <ul className="inquiry-upload-list">
          {uploads.map((upload) => (
            <li key={upload.id}>
              <Image alt="첨부 이미지 미리보기" src={upload.preview} width={80} height={80} unoptimized />
              <span>{upload.file.name} ({Math.ceil(upload.file.size / 1024)}KB) · {uploadLabels[upload.status]}</span>
              <button disabled={busy} onClick={() => removeUpload(upload.id)} type="button">
                {upload.file.name} 제거
              </button>
            </li>
          ))}
        </ul>
        <p role="status">{busy ? "문의 등록 중입니다." : validating ? "이미지를 확인하는 중입니다." : ""}</p>
        <button className="inquiry-button" disabled={busy || validating} type="submit">문의 등록</button>
      </form>
    </section>
  );
}
