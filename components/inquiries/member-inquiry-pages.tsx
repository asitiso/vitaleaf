"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useAuth } from "../../features/auth/auth-context";
import { listMemberOrders } from "../../lib/firebase/member-orders";
import { InquiryDetail } from "./inquiry-detail";
import { InquiryForm } from "./inquiry-form";
import { InquiryList } from "./inquiry-list";

function MemberGate({ path, children }: { path: string; children: (uid: string) => ReactNode }) {
  const { error, retryAuth, status, user } = useAuth();
  if (status === "checking") return <main className="inquiry-page" aria-busy="true"><p role="status">로그인 상태를 확인하는 중입니다.</p></main>;
  if (status === "error") return <main className="inquiry-page inquiry-gate"><p role="alert">{error || "인증 상태를 확인하지 못했습니다."}</p><button className="inquiry-button" onClick={retryAuth} type="button">인증 다시 확인</button></main>;
  if (status !== "signed-in" || !user) return <main className="inquiry-page inquiry-gate"><p>문의 내역은 로그인 후 이용할 수 있습니다.</p><Link className="inquiry-button" href={`/login?next=${encodeURIComponent(path)}`}>로그인</Link></main>;
  return <>{children(user.uid)}</>;
}

export function MemberInquiryListPage() { return <MemberGate path="/mypage/inquiries">{() => <InquiryList access={{ kind: "member" }} createHref="/mypage/inquiries/new" detailHref={(id) => `/mypage/inquiries/${encodeURIComponent(id)}`} />}</MemberGate>; }

export function MemberInquiryFormPage() {
  const router = useRouter();
  return <MemberGate path="/mypage/inquiries/new">{(uid) => <MemberInquiryForm uid={uid} onSuccess={(id) => router.push(`/mypage/inquiries/${encodeURIComponent(id)}`)} />}</MemberGate>;
}

function MemberInquiryForm({ uid, onSuccess }: { uid: string; onSuccess: (id: string) => void }) {
  const [state, setState] = useState<{ kind: "loading" | "error" | "ready"; orders: string[] }>({ kind: "loading", orders: [] }); const [retry, setRetry] = useState(0);
  useEffect(() => { let current = true; // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ kind: "loading", orders: [] }); void listMemberOrders(uid).then((orders) => { if (current) setState({ kind: "ready", orders: orders.map((order) => order.orderNumber).filter((number) => /^VL-\d{8}-[A-Z0-9]{6}$/u.test(number)) }); }, () => { if (current) setState({ kind: "error", orders: [] }); }); return () => { current = false; }; }, [retry, uid]);
  if (state.kind === "loading") return <main className="inquiry-page" aria-busy="true"><p role="status">주문 내역을 불러오는 중입니다.</p></main>;
  if (state.kind === "error") return <main className="inquiry-page inquiry-gate"><p role="alert">주문 내역을 불러오지 못했습니다.</p><button className="inquiry-button" onClick={() => setRetry((count) => count + 1)} type="button">주문 내역 다시 불러오기</button></main>;
  return <InquiryForm access={{ kind: "member" }} onSuccess={onSuccess} orderNumbers={state.orders} />;
}

export function MemberInquiryDetailPage({ id }: { id: string }) { return <MemberGate path={`/mypage/inquiries/${encodeURIComponent(id)}`}>{() => <InquiryDetail access={{ kind: "member" }} backHref="/mypage/inquiries" id={id} />}</MemberGate>; }
