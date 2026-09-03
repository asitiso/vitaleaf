"use client";
/* eslint-disable @next/next/no-img-element -- local object URLs are previews before direct upload. */

import { useEffect, useRef, useState } from "react";

import { createInquiry, type InquiryClientAccess, putInquiryUpload, requestInquiryUploadUrl } from "../../lib/inquiries/client";
import { detectImageType } from "../../lib/inquiries/uploads";
import { parseInquiryCreateInput, InquiryValidationError } from "../../lib/inquiries/validation";

type Upload = { id: string; file: File; preview: string; status: "queued" | "uploading" | "ready" | "error"; receipt: string | null; receivedAt: number | null; expiresAt: string | null };
const maxSize = 5 * 1024 * 1024;
const categories = [["order", "주문"], ["shipping", "배송"], ["product", "상품"], ["return", "교환·반품"], ["other", "기타"]] as const;

export function InquiryForm({ access, orderNumbers, onSuccess, lockedOrderNumber }: { access: InquiryClientAccess; orderNumbers: string[]; onSuccess: (id: string) => void; lockedOrderNumber?: string | null }) {
  const [category, setCategory] = useState(""); const [orderNumber, setOrderNumber] = useState(lockedOrderNumber ?? ""); const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [uploads, setUploads] = useState<Upload[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const uploadsRef = useRef(uploads);
  useEffect(() => { uploadsRef.current = uploads; }, [uploads]);
  useEffect(() => () => { uploadsRef.current.forEach((upload) => URL.revokeObjectURL(upload.preview)); }, []);
  const update = (id: string, patch: Partial<Upload>) => setUploads((current) => current.map((upload) => upload.id === id ? { ...upload, ...patch } : upload));
  const remove = (id: string) => setUploads((current) => { const removed = current.find((upload) => upload.id === id); if (removed) URL.revokeObjectURL(removed.preview); return current.filter((upload) => upload.id !== id); });
  const addFiles = async (files: FileList | null) => {
    if (!files) return; setError("");
    const selected = [...files]; if (uploadsRef.current.length + selected.length > 3) { setError("이미지는 최대 3장까지 첨부할 수 있습니다."); return; }
    const next: Upload[] = [];
    for (const file of selected) {
      try { if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > maxSize) throw new Error(); const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()); if (detectImageType(bytes) !== file.type) throw new Error(); next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), status: "queued", receipt: null, receivedAt: null, expiresAt: null }); } catch { setError("JPG, PNG, WebP 형식의 1~5MB 이미지만 첨부할 수 있습니다."); }
    }
    if (next.length) setUploads((current) => [...current, ...next]);
  };
  const uploadPending = async () => {
    const ids = uploadsRef.current.filter((upload) => upload.status === "queued" || upload.status === "error").map((upload) => upload.id);
    let next = 0;
    const worker = async () => { while (next < ids.length) { const id = ids[next++]!; const upload = uploadsRef.current.find((item) => item.id === id); if (!upload) continue; update(id, { status: "uploading" }); try { const signed = await requestInquiryUploadUrl(access, { contentType: upload.file.type as "image/jpeg" | "image/png" | "image/webp", size: upload.file.size }); await putInquiryUpload(signed.uploadUrl, upload.file); update(id, { status: "ready", receipt: signed.receipt, receivedAt: Date.now(), expiresAt: signed.expiresAt }); } catch { update(id, { status: "error", receipt: null, receivedAt: null, expiresAt: null }); } } };
    await Promise.all([worker(), worker()]);
  };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (busy) return; setError("");
    const selectedOrder = lockedOrderNumber ?? (orderNumber || null);
    try { parseInquiryCreateInput({ category, title, body, orderNumber: selectedOrder, uploadReceipts: [] }); } catch (reason) { setError(reason instanceof InquiryValidationError ? reason.message : "문의 내용을 다시 확인해 주세요."); return; }
    setBusy(true); try { const stale = uploadsRef.current.filter((upload) => upload.status === "ready" && (Date.now() - (upload.receivedAt ?? 0)) >= 9 * 60_000); stale.forEach((upload) => update(upload.id, { status: "queued", receipt: null, receivedAt: null, expiresAt: null })); if (stale.length) await new Promise((resolve) => setTimeout(resolve, 0)); await uploadPending(); const current = uploadsRef.current; if (current.some((upload) => upload.status !== "ready" || !upload.receipt)) { setError("이미지 업로드를 완료한 뒤 문의를 등록해 주세요."); return; } const created = await createInquiry(access, parseInquiryCreateInput({ category, title, body, orderNumber: selectedOrder, uploadReceipts: current.map((upload) => upload.receipt!) })); onSuccess(created.id); } catch { setUploads((current) => current.map((upload) => upload.receipt ? { ...upload, status: "queued", receipt: null, receivedAt: null, expiresAt: null } : upload)); setError("문의 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."); } finally { setBusy(false); } };
  return <main className="inquiry-page"><header className="inquiry-page__header"><p>VITALEAF MEMBER</p><h1>문의 작성</h1><p>주문과 관련 없는 문의도 남길 수 있습니다.</p></header><form className="inquiry-form" onSubmit={submit}>{error ? <p role="alert">{error}</p> : null}<label>문의 유형<select aria-label="문의 유형" onChange={(event) => setCategory(event.target.value)} value={category}><option value="">선택해 주세요</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>관련 주문<select aria-label="관련 주문" disabled={Boolean(lockedOrderNumber)} onChange={(event) => setOrderNumber(event.target.value)} value={lockedOrderNumber ?? orderNumber}><option value="">문의와 무관한 주문 없음</option>{orderNumbers.map((number) => <option key={number} value={number}>{number}</option>)}</select></label><label>제목<input aria-label="제목" maxLength={100} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>문의 내용<textarea aria-label="문의 내용" maxLength={3000} onChange={(event) => setBody(event.target.value)} value={body} /></label><label>이미지 첨부 (최대 3장)<input accept="image/jpeg,image/png,image/webp" aria-label="이미지 첨부" multiple onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} type="file" /></label><ul className="inquiry-upload-list">{uploads.map((upload) => <li key={upload.id}><img alt="첨부 이미지 미리보기" src={upload.preview} /><span>{upload.file.name} ({Math.ceil(upload.file.size / 1024)}KB) · {upload.status === "ready" ? "업로드 완료" : upload.status === "uploading" ? "업로드 중" : upload.status === "error" ? "업로드 실패" : "업로드 대기"}</span><button onClick={() => remove(upload.id)} type="button">{upload.file.name} 제거</button></li>)}</ul><p role="status">{busy ? "문의 등록 중입니다." : ""}</p><button className="inquiry-button" disabled={busy} type="submit">문의 등록</button></form></main>;
}
