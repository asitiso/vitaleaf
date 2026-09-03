"use client";
/* eslint-disable @next/next/no-img-element -- signed, short-lived attachment URLs are rendered directly. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { type InquiryClientAccess, getInquiry } from "../../lib/inquiries/client";
import type { InquiryPublic } from "../../lib/inquiries/types";

const labels: Record<InquiryPublic["category"], string> = { order: "주문", shipping: "배송", product: "상품", return: "교환·반품", other: "기타" };
const validId = (id: string) => id.length > 0 && id.length <= 128 && id.trim() === id && !id.includes("/") && [...id].every((character) => { const code = character.codePointAt(0) ?? 0; return code > 0x1f && (code < 0x7f || code > 0x9f); });

export function InquiryDetail({ access, id, backHref }: { access: InquiryClientAccess; id: string; backHref: string }) {
  const [state, setState] = useState<{ kind: "loading" | "error" | "ready"; inquiry: InquiryPublic | null }>({ kind: "loading", inquiry: null });
  const [retry, setRetry] = useState(0);
  const reload = useCallback(() => setRetry((count) => count + 1), []);
  useEffect(() => {
    if (!validId(id)) {
      // Invalid URLs must remain owner-safe and never issue a request.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ kind: "error", inquiry: null }); return;
    }
    let current = true;
    setState({ kind: "loading", inquiry: null });
    void getInquiry(access, id).then((inquiry) => { if (current) setState({ kind: "ready", inquiry }); }, () => { if (current) setState({ kind: "error", inquiry: null }); });
    return () => { current = false; };
  }, [access, id, retry]);
  if (state.kind === "loading") return <main className="inquiry-page" aria-busy="true"><p role="status">문의 정보를 불러오는 중입니다.</p></main>;
  if (state.kind === "error" || !state.inquiry) return <main className="inquiry-page"><p role="alert">문의 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p><button className="inquiry-button" onClick={reload} type="button">다시 시도</button> <Link href={backHref}>문의 내역으로</Link></main>;
  const inquiry = state.inquiry;
  return <main className="inquiry-page inquiry-detail"><Link href={backHref}>문의 내역으로</Link><p>{labels[inquiry.category]}</p><h1>{inquiry.title}</h1><p><time dateTime={inquiry.createdAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(inquiry.createdAt))}</time> · <strong>{inquiry.status === "answered" ? "답변 완료" : "답변 대기"}</strong></p>{inquiry.orderNumber ? <p>관련 주문: {inquiry.orderNumber}</p> : null}<p className="inquiry-detail__body">{inquiry.body}</p>{inquiry.attachments.filter((item) => item.readUrl?.startsWith("https://")).map((item, index) => <img alt={`문의 첨부 이미지 ${index + 1}`} key={item.id} src={item.readUrl!} />)}{inquiry.status === "answered" ? <section className="inquiry-reply"><h2>답변</h2><p>{inquiry.adminReply}</p>{inquiry.repliedAt ? <time dateTime={inquiry.repliedAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(inquiry.repliedAt))}</time> : null}</section> : <section className="inquiry-reply"><h2>답변 대기</h2><p>담당자가 확인 후 답변드리겠습니다.</p></section>}</main>;
}
