"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { type InquiryClientAccess, listInquiries } from "../../lib/inquiries/client";
import type { InquiryPublic } from "../../lib/inquiries/types";

const categoryLabel: Record<InquiryPublic["category"], string> = {
  order: "주문",
  shipping: "배송",
  product: "상품",
  return: "교환·반품",
  other: "기타",
};

type InquiryListProps = {
  access: InquiryClientAccess;
  createHref?: string;
  detailHref?: (id: string) => string;
  onCreate?: () => void;
  onSelect?: (id: string) => void;
};

export function InquiryList(props: InquiryListProps) {
  const identity = props.access.kind === "guest" ? "guest:" + props.access.token : "member";
  return <InquiryListContent key={identity} {...props} />;
}

function InquiryListContent({ access, createHref, detailHref, onCreate, onSelect }: InquiryListProps) {
  const [state, setState] = useState<{
    kind: "loading" | "error" | "ready";
    rows: InquiryPublic[];
  }>({ kind: "loading", rows: [] });
  const [retry, setRetry] = useState(0);
  const guestToken = access.kind === "guest" ? access.token : null;

  useEffect(() => {
    const controller = new AbortController();
    const currentAccess: InquiryClientAccess = guestToken === null
      ? { kind: "member" } : { kind: "guest", token: guestToken };
    // Retry clears old data; identity changes remount this content synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ kind: "loading", rows: [] });
    void listInquiries(currentAccess, {}, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setState({ kind: "ready", rows });
      },
      () => {
        if (!controller.signal.aborted) setState({ kind: "error", rows: [] });
      },
    );
    return () => controller.abort();
  }, [guestToken, retry]);

  function reload() {
    setRetry((count) => count + 1);
  }

  function createAction(label: string) {
    if (onCreate) return <button className="inquiry-button" onClick={onCreate} type="button">{label}</button>;
    if (createHref) return <Link className="inquiry-button" href={createHref}>{label}</Link>;
    return null;
  }

  return (
    <section className="inquiry-page">
      <header className="inquiry-page__header">
        <p>VITALEAF</p>
        <h1>1:1 문의</h1>
        <p>문의 내역과 답변을 한곳에서 확인하세요.</p>
        {createAction("문의 작성")}
      </header>
      {state.kind === "loading" ? <p aria-busy="true" role="status">문의 내역을 불러오는 중입니다.</p> : null}
      {state.kind === "error" ? (
        <section role="alert">
          <p>문의 내역을 불러오지 못했습니다.</p>
          <button className="inquiry-button" onClick={reload} type="button">문의 내역 다시 불러오기</button>
        </section>
      ) : null}
      {state.kind === "ready" && state.rows.length === 0 ? (
        <section className="inquiry-empty">
          <p>등록한 문의가 없습니다.</p>
          {createAction("첫 문의 작성하기")}
        </section>
      ) : null}
      {state.kind === "ready" && state.rows.length > 0 ? (
        <ul className="inquiry-list">
          {state.rows.map((row) => {
            const summary = (
              <>
                <strong>{categoryLabel[row.category]}</strong>
                <span>{row.title}</span>
                <time dateTime={row.createdAt}>
                  {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(row.createdAt))}
                </time>
                <em className={"inquiry-status inquiry-status--" + row.status}>
                  {row.status === "answered" ? "답변 완료" : "답변 대기"}
                </em>
                {row.orderNumber ? <small>{row.orderNumber}</small> : null}
              </>
            );
            return (
              <li key={row.id}>
                {onSelect ? (
                  <button className="inquiry-list__row" onClick={() => onSelect(row.id)} type="button">{summary}</button>
                ) : detailHref ? (
                  <Link className="inquiry-list__row" href={detailHref(row.id)}>{summary}</Link>
                ) : <div className="inquiry-list__row">{summary}</div>}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
