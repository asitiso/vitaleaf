"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { type InquiryClientAccess, listInquiries } from "../../lib/inquiries/client";
import type { InquiryPublic } from "../../lib/inquiries/types";

const categoryLabel: Record<InquiryPublic["category"], string> = {
  order: "주문", shipping: "배송", product: "상품", return: "교환·반품", other: "기타",
};

type InquiryListProps = {
  access: InquiryClientAccess;
  createHref?: string;
  detailHref: (id: string) => string;
};

export function InquiryList({ access, createHref, detailHref }: InquiryListProps) {
  const [state, setState] = useState<{ kind: "loading" | "error" | "ready"; rows: InquiryPublic[] }>({ kind: "loading", rows: [] });
  const [retry, setRetry] = useState(0);
  const load = useCallback(() => setRetry((count) => count + 1), []);

  useEffect(() => {
    let current = true;
    // Loading must reset when the authenticated access changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ kind: "loading", rows: [] });
    void listInquiries(access).then(
      (rows) => { if (current) setState({ kind: "ready", rows }); },
      () => { if (current) setState({ kind: "error", rows: [] }); },
    );
    return () => { current = false; };
  }, [access, retry]);

  return <main className="inquiry-page">
    <header className="inquiry-page__header"><p>VITALEAF MEMBER</p><h1>1:1 문의</h1><p>문의 내역과 답변을 한곳에서 확인하세요.</p>{createHref ? <Link className="inquiry-button" href={createHref}>문의 작성</Link> : null}</header>
    {state.kind === "loading" ? <p aria-busy="true" role="status">문의 내역을 불러오는 중입니다.</p> : null}
    {state.kind === "error" ? <section role="alert"><p>문의 내역을 불러오지 못했습니다.</p><button className="inquiry-button" onClick={load} type="button">문의 내역 다시 불러오기</button></section> : null}
    {state.kind === "ready" && state.rows.length === 0 ? <section className="inquiry-empty"><p>등록한 문의가 없습니다.</p>{createHref ? <Link href={createHref}>첫 문의 작성하기</Link> : null}</section> : null}
    {state.kind === "ready" && state.rows.length > 0 ? <ul className="inquiry-list">{state.rows.map((row) => <li key={row.id}><Link href={detailHref(row.id)}><strong>{categoryLabel[row.category]}</strong><span>{row.title}</span><time dateTime={row.createdAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(row.createdAt))}</time><em className={`inquiry-status inquiry-status--${row.status}`}>{row.status === "answered" ? "답변 완료" : "답변 대기"}</em>{row.orderNumber ? <small>{row.orderNumber}</small> : null}</Link></li>)}</ul> : null}
  </main>;
}
