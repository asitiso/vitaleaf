"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { adminInquiryClient, type AdminInquiryClient } from "../../lib/inquiries/admin-client";
import type { InquiryCategory, InquiryPublic, InquiryStatus } from "../../lib/inquiries/types";

const categoryLabels: Record<InquiryCategory, string> = {
  order: "주문", shipping: "배송", product: "상품", return: "교환·반품", other: "기타",
};

type Props = {
  client?: AdminInquiryClient;
  onWaitingCountChange(count: number): void;
};

export function InquiryPanel({ client = adminInquiryClient, onWaitingCountChange }: Props) {
  const [status, setStatus] = useState<InquiryStatus | null>(null);
  const [category, setCategory] = useState<InquiryCategory | null>(null);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const cursor = cursors[cursors.length - 1] ?? null;
  const [listState, setListState] = useState<{ kind: "loading" | "ready" | "error"; rows: InquiryPublic[] }>({ kind: "loading", rows: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<{ kind: "idle" | "loading" | "ready" | "error"; inquiry: InquiryPublic | null }>({ kind: "idle", inquiry: null });
  const [draft, setDraft] = useState("");
  const [replyState, setReplyState] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [confirmation, setConfirmation] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "error">("idle");
  const [reload, setReload] = useState(0);
  const [detailReload, setDetailReload] = useState(0);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const mutationGenerationRef = useRef(0);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const replyInFlightRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteConfirmRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => () => {
    mutationGenerationRef.current += 1;
    mutationControllerRef.current?.abort();
    replyInFlightRef.current = false;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const request = ++listRequestRef.current;
    // A refreshed page never shows rows from a previous filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListState({ kind: "loading", rows: [] });
    void client.list({ status, category, pageSize: 20, cursor }, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted && listRequestRef.current === request) setListState({ kind: "ready", rows });
      },
      () => {
        if (!controller.signal.aborted && listRequestRef.current === request) setListState({ kind: "error", rows: [] });
      },
    );
    return () => controller.abort();
  }, [category, client, cursor, reload, status]);

  useEffect(() => {
    if (!selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetailState({ kind: "idle", inquiry: null });
      return;
    }
    const controller = new AbortController();
    const request = ++detailRequestRef.current;
    setDetailState({ kind: "loading", inquiry: null });
    void client.get(selectedId, controller.signal).then(
      (inquiry) => {
        if (!controller.signal.aborted && detailRequestRef.current === request) {
          setDetailState({ kind: "ready", inquiry });
          setDraft(inquiry.adminReply ?? "");
        }
      },
      () => {
        if (!controller.signal.aborted && detailRequestRef.current === request) setDetailState({ kind: "error", inquiry: null });
      },
    );
    return () => controller.abort();
  }, [client, detailReload, selectedId]);

  useEffect(() => {
    if (!confirmation) return;
    cancelRef.current?.focus();
  }, [confirmation]);

  useEffect(() => {
    if (!confirmation) return;
    const containBackgroundKeyboard = (event: KeyboardEvent) => {
      if (dialogRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape" && deleteState !== "deleting") {
        closeConfirmation();
        return;
      }
      cancelRef.current?.focus();
    };
    document.addEventListener("keydown", containBackgroundKeyboard, true);
    return () => document.removeEventListener("keydown", containBackgroundKeyboard, true);
  }, [confirmation, deleteState]);

  function invalidateMutation() {
    mutationGenerationRef.current += 1;
    mutationControllerRef.current?.abort();
    mutationControllerRef.current = null;
    replyInFlightRef.current = false;
  }

  function resetSelection() {
    invalidateMutation();
    detailRequestRef.current += 1;
    selectedIdRef.current = null;
    setSelectedId(null);
    setDraft("");
    setReplyState("idle");
    setConfirmation(false);
    setDeleteState("idle");
  }

  function selectInquiry(id: string) {
    const isSameInquiry = selectedIdRef.current === id;
    if (isSameInquiry && replyInFlightRef.current) return;
    if (!isSameInquiry) invalidateMutation();
    selectedIdRef.current = id;
    setSelectedId(id);
    setReplyState("idle");
    setConfirmation(false);
    setDeleteState("idle");
  }

  function closeConfirmation() {
    setConfirmation(false);
    setDeleteState("idle");
    deleteTriggerRef.current?.focus();
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && deleteState !== "deleting") {
      event.preventDefault();
      closeConfirmation();
      return;
    }
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelRef.current) {
      event.preventDefault();
      deleteConfirmRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === deleteConfirmRef.current) {
      event.preventDefault();
      cancelRef.current?.focus();
    }
  }

  function changeFilter(next: { status?: InquiryStatus | null; category?: InquiryCategory | null }) {
    resetSelection();
    setCursors([null]);
    if ("status" in next) setStatus(next.status ?? null);
    if ("category" in next) setCategory(next.category ?? null);
  }

  async function refreshCount(signal?: AbortSignal) {
    const waitingCount = await client.count(signal);
    if (!signal?.aborted) onWaitingCountChange(waitingCount);
  }

  async function saveReply() {
    const inquiry = detailState.inquiry;
    if (!inquiry || replyInFlightRef.current) return;
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    replyInFlightRef.current = true;
    const mutationGeneration = ++mutationGenerationRef.current;
    const signal = controller.signal;
    const ownsMutation = () => mutationControllerRef.current === controller && mutationGenerationRef.current === mutationGeneration;
    const isCurrent = () => (
      !signal.aborted
      && ownsMutation()
      && selectedIdRef.current === inquiry.id
    );
    setReplyState("saving");
    let answered: InquiryPublic;
    try {
      answered = await client.reply(inquiry.id, draft, signal);
    } catch {
      if (isCurrent()) {
        replyInFlightRef.current = false;
        setReplyState("error");
      }
      return;
    }
    if (!isCurrent()) return;
    replyInFlightRef.current = false;
    setDetailState({ kind: "ready", inquiry: answered });
    setDraft(answered.adminReply ?? "");
    setReplyState("success");
    setReload((value) => value + 1);
    const detailRequest = ++detailRequestRef.current;
    void client.get(inquiry.id, signal).then(
      (refreshed) => {
        if (
          !signal.aborted
          && mutationGenerationRef.current === mutationGeneration
          && selectedIdRef.current === inquiry.id
          && detailRequestRef.current === detailRequest
          && refreshed.status === "answered"
          && refreshed.adminReply === answered.adminReply
        ) {
          setDetailState({ kind: "ready", inquiry: refreshed });
          setDraft(refreshed.adminReply ?? "");
        }
      },
      () => undefined,
    );
    void refreshCount(signal).catch(() => undefined);
  }

  async function confirmDelete() {
    const inquiry = detailState.inquiry;
    if (!inquiry || deleteState === "deleting") return;
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    const mutationGeneration = ++mutationGenerationRef.current;
    const signal = controller.signal;
    setDeleteState("deleting");
    try {
      await client.delete(inquiry.id, signal);
    } catch {
      if (!signal.aborted && mutationGenerationRef.current === mutationGeneration && selectedIdRef.current === inquiry.id) {
        setDeleteState("error");
      }
      return;
    }
    if (signal.aborted || mutationGenerationRef.current !== mutationGeneration || selectedIdRef.current !== inquiry.id) return;
    setConfirmation(false);
    setDeleteState("idle");
    resetSelection();
    setReload((value) => value + 1);
    const refreshController = new AbortController();
    mutationControllerRef.current = refreshController;
    const refreshGeneration = mutationGenerationRef.current;
    void client.count(refreshController.signal).then(
      (count) => {
        if (!refreshController.signal.aborted && mutationGenerationRef.current === refreshGeneration) {
          onWaitingCountChange(count);
        }
      },
      () => undefined,
    );
  }

  const inquiry = detailState.inquiry;
  return (
    <section className="admin-inquiries">
      <div className="admin-toolbar">
        <div><h2>1:1 문의</h2><p>고객 문의를 확인하고 답변합니다.</p></div>
        <div className="admin-inquiry-filters">
          <label>답변 상태
            <select value={status ?? ""} onChange={(event) => changeFilter({ status: event.target.value === "" ? null : event.target.value as InquiryStatus })}>
              <option value="">전체</option><option value="waiting">답변 대기</option><option value="answered">답변 완료</option>
            </select>
          </label>
          <label>문의 유형
            <select value={category ?? ""} onChange={(event) => changeFilter({ category: event.target.value === "" ? null : event.target.value as InquiryCategory })}>
              <option value="">전체</option>
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="admin-inquiry-layout">
        <section aria-label="문의 목록">
          {listState.kind === "loading" ? <p role="status">문의 목록을 불러오는 중입니다.</p> : null}
          {listState.kind === "error" ? <div role="alert"><p>문의 목록을 불러오지 못했습니다.</p><button type="button" onClick={() => setReload((value) => value + 1)}>문의 목록 다시 불러오기</button></div> : null}
          {listState.kind === "ready" && listState.rows.length === 0 ? <p>조건에 맞는 문의가 없습니다.</p> : null}
          {listState.kind === "ready" && listState.rows.length ? (
            <ul className="admin-inquiry-list">{listState.rows.map((item) => (
              <li key={item.id}><button type="button" aria-current={selectedId === item.id ? "true" : undefined} onClick={() => selectInquiry(item.id)}>
                <span>{categoryLabels[item.category]}</span><strong>{item.title}</strong>
                <span>{item.status === "waiting" ? "답변 대기" : "답변 완료"}</span>
              </button></li>
            ))}</ul>
          ) : null}
          <div className="admin-inquiry-pagination">
            <button type="button" disabled={cursors.length === 1 || listState.kind === "loading"} onClick={() => setCursors((values) => values.slice(0, -1))}>이전 페이지</button>
            <button type="button" disabled={listState.kind !== "ready" || listState.rows.length < 20} onClick={() => {
              const last = listState.rows.at(-1);
              if (last) setCursors((values) => [...values, last.id]);
            }}>다음 페이지</button>
          </div>
        </section>

        <section className="admin-inquiry-detail" aria-label="문의 상세">
          {detailState.kind === "idle" ? <p>목록에서 확인할 문의를 선택하세요.</p> : null}
          {detailState.kind === "loading" ? <p role="status">문의 상세를 불러오는 중입니다.</p> : null}
          {detailState.kind === "error" ? <div role="alert"><p>문의 상세를 불러오지 못했습니다.</p><button type="button" onClick={() => setDetailReload((value) => value + 1)}>문의 상세 다시 불러오기</button></div> : null}
          {detailState.kind === "ready" && inquiry ? (
            <>
              <p>{inquiry.ownerType === "member" ? "회원 문의" : "비회원 문의"} · {categoryLabels[inquiry.category]}</p>
              <h3>{inquiry.title}</h3>
              {inquiry.orderNumber ? <p>관련 주문번호: {inquiry.orderNumber}</p> : null}
              <p className="admin-inquiry-body">{inquiry.body}</p>
              <div className="admin-inquiry-images">{inquiry.attachments.filter((attachment) => attachment.readUrl).map((attachment, index) => (
                <Image key={attachment.id} alt={"문의 첨부 이미지 " + (index + 1)} src={attachment.readUrl!} width={360} height={270} unoptimized />
              ))}</div>
              {inquiry.adminReply ? <div className="admin-inquiry-existing-reply"><strong>기존 답변</strong><p>{inquiry.adminReply}</p>{inquiry.repliedAt ? <time dateTime={inquiry.repliedAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(inquiry.repliedAt))}</time> : null}</div> : null}
              <label>관리자 답변<textarea rows={7} value={draft} disabled={replyState === "saving"} onChange={(event) => { setDraft(event.target.value); setReplyState("idle"); }} /></label>
              {replyState === "error" ? <p role="alert">답변을 저장하지 못했습니다. 내용을 유지했으니 다시 시도해 주세요.</p> : null}
              {replyState === "success" ? <p role="status">답변을 저장했습니다.</p> : null}
              <div className="admin-inquiry-actions">
                <button type="button" disabled={replyState === "saving"} onClick={() => void saveReply()}>{replyState === "saving" ? "저장 중" : "답변 저장"}</button>
                <button ref={deleteTriggerRef} type="button" onClick={() => { setConfirmation(true); setDeleteState("idle"); }}>문의 삭제</button>
              </div>
            </>
          ) : null}
        </section>
      </div>

      {confirmation && inquiry ? (
        <div className="admin-dialog-backdrop">
          <section ref={dialogRef} className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="inquiry-delete-title">
            <h3 id="inquiry-delete-title">문의 삭제 확인</h3>
            <p><strong>{inquiry.title}</strong> 문의와 첨부 이미지를 삭제합니다. 삭제 후 복구할 수 없습니다.</p>
            {deleteState === "error" ? <p role="alert">문의를 삭제하지 못했습니다. 문의는 유지되며 다시 시도할 수 있습니다.</p> : null}
            <div>
              <button ref={cancelRef} type="button" disabled={deleteState === "deleting"} onClick={closeConfirmation} onKeyDown={handleDialogKeyDown}>취소</button>
              <button ref={deleteConfirmRef} type="button" disabled={deleteState === "deleting"} onClick={() => void confirmDelete()} onKeyDown={handleDialogKeyDown}>{deleteState === "deleting" ? "삭제 중" : "삭제 확인"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
