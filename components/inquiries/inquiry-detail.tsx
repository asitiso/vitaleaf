"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { type InquiryClientAccess, InquiryClientError, getInquiry } from "../../lib/inquiries/client";
import type { InquiryPublic } from "../../lib/inquiries/types";

const labels: Record<InquiryPublic["category"], string> = {
  order: "주문",
  shipping: "배송",
  product: "상품",
  return: "교환·반품",
  other: "기타",
};

function validId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && [...id].length <= 128
    && id.trim() === id && !id.includes("/")
    && [...id].every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && (code < 0x7f || code > 0x9f);
    });
}

type InquiryDetailProps = {
  access: InquiryClientAccess;
  id: string;
  backHref?: string;
  onBack?: () => void;
  onAccessExpired?: () => void;
};

export function InquiryDetail(props: InquiryDetailProps) {
  const identity = props.access.kind === "guest" ? "guest:" + props.access.token : "member";
  return <InquiryDetailContent key={identity + ":" + props.id} {...props} />;
}

function InquiryDetailContent({ access, id, backHref, onBack, onAccessExpired }: InquiryDetailProps) {
  const [state, setState] = useState<{
    kind: "loading" | "error" | "ready";
    inquiry: InquiryPublic | null;
  }>({ kind: validId(id) ? "loading" : "error", inquiry: null });
  const [retry, setRetry] = useState(0);
  const guestToken = access.kind === "guest" ? access.token : null;

  useEffect(() => {
    if (!validId(id)) return;
    const controller = new AbortController();
    const currentAccess: InquiryClientAccess = guestToken === null
      ? { kind: "member" } : { kind: "guest", token: guestToken };
    // Retry clears data; route and identity changes remount content before paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ kind: "loading", inquiry: null });
    void getInquiry(currentAccess, id, controller.signal).then(
      (inquiry) => {
        if (!controller.signal.aborted) setState({ kind: "ready", inquiry });
      },
      (reason) => {
        if (controller.signal.aborted) return;
        if (guestToken !== null && reason instanceof InquiryClientError && reason.status === 401 && onAccessExpired) {
          controller.abort();
          onAccessExpired();
          return;
        }
        setState({ kind: "error", inquiry: null });
      },
    );
    return () => controller.abort();
  }, [guestToken, id, retry, onAccessExpired]);

  function reload() {
    setRetry((count) => count + 1);
  }

  const backAction = onBack
    ? <button className="inquiry-button" onClick={onBack} type="button">문의 내역으로</button>
    : backHref ? <Link className="inquiry-button" href={backHref}>문의 내역으로</Link> : null;

  if (state.kind === "loading") {
    return <section className="inquiry-page" aria-busy="true"><p role="status">문의 정보를 불러오는 중입니다.</p></section>;
  }
  if (state.kind === "error" || !state.inquiry) {
    return (
      <section className="inquiry-page">
        <p role="alert">문의 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <button className="inquiry-button" onClick={reload} type="button">다시 시도</button>
        {" "}{backAction}
      </section>
    );
  }

  const inquiry = state.inquiry;
  const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
  return (
    <section className="inquiry-page inquiry-detail">
      {backAction}
      <p>{labels[inquiry.category]}</p>
      <h1>{inquiry.title}</h1>
      <p>
        <time dateTime={inquiry.createdAt}>{formatDate(inquiry.createdAt)}</time>
        {" · "}<strong>{inquiry.status === "answered" ? "답변 완료" : "답변 대기"}</strong>
      </p>
      {inquiry.orderNumber ? <p>관련 주문: {inquiry.orderNumber}</p> : null}
      <p className="inquiry-detail__body">{inquiry.body}</p>
      {inquiry.attachments.filter((item) => item.readUrl?.startsWith("https://")).map((item, index) => (
        <Image
          alt={"문의 첨부 이미지 " + (index + 1)}
          key={item.id}
          src={item.readUrl!}
          width={720}
          height={540}
          unoptimized
        />
      ))}
      <section className="inquiry-reply">
        {inquiry.status === "answered" ? (
          <>
            <h2>답변</h2>
            <p>{inquiry.adminReply}</p>
            {inquiry.repliedAt ? <time dateTime={inquiry.repliedAt}>{formatDate(inquiry.repliedAt)}</time> : null}
          </>
        ) : (
          <>
            <h2>답변 대기</h2>
            <p>담당자가 확인 후 답변드리겠습니다.</p>
          </>
        )}
      </section>
    </section>
  );
}
