"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type ReactNode, useEffect, useState } from "react";

import { useAuth } from "../../features/auth/auth-context";
import { listMemberOrders } from "../../lib/firebase/member-orders";
import type { InquiryClientAccess } from "../../lib/inquiries/client";
import { InquiryDetail } from "./inquiry-detail";
import { InquiryForm } from "./inquiry-form";
import { InquiryList } from "./inquiry-list";

const memberAccess: InquiryClientAccess = { kind: "member" };
const detailHref = (id: string) => "/mypage/inquiries/" + encodeURIComponent(id);

function MemberGate({ path, children }: { path: string; children: (uid: string) => ReactNode }) {
  const { error, retryAuth, status, user } = useAuth();
  if (status === "checking") {
    return (
      <main className="inquiry-page" aria-busy="true">
        <p role="status">로그인 상태를 확인하는 중입니다.</p>
      </main>
    );
  }
  if (status === "error") {
    return (
      <main className="inquiry-page inquiry-gate">
        <p role="alert">{error || "인증 상태를 확인하지 못했습니다."}</p>
        <button className="inquiry-button" onClick={retryAuth} type="button">인증 다시 확인</button>
      </main>
    );
  }
  if (status !== "signed-in" || !user) {
    return (
      <main className="inquiry-page inquiry-gate">
        <p>문의 내역은 로그인 후 이용할 수 있습니다.</p>
        <Link className="inquiry-button" href={"/login?next=" + encodeURIComponent(path)}>로그인</Link>
      </main>
    );
  }
  // Reset private state during reconciliation, before the next account can paint.
  return <main><Fragment key={user.uid + ":" + path}>{children(user.uid)}</Fragment></main>;
}

export function MemberInquiryListPage() {
  return (
    <MemberGate path="/mypage/inquiries">
      {() => (
        <InquiryList access={memberAccess} createHref="/mypage/inquiries/new" detailHref={detailHref} />
      )}
    </MemberGate>
  );
}

export function MemberInquiryFormPage() {
  const router = useRouter();
  function handleSuccess(id: string) {
    router.push(detailHref(id));
  }
  return (
    <MemberGate path="/mypage/inquiries/new">
      {(uid) => <MemberInquiryForm uid={uid} onSuccess={handleSuccess} />}
    </MemberGate>
  );
}

function MemberInquiryForm({ uid, onSuccess }: { uid: string; onSuccess: (id: string) => void }) {
  const [state, setState] = useState<{
    kind: "loading" | "error" | "ready";
    orders: string[];
  }>({ kind: "loading", orders: [] });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    // Reset loading for a user-requested retry; UID changes remount this component.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ kind: "loading", orders: [] });
    void listMemberOrders(uid).then(
      (orders) => {
        if (!current) return;
        const validOrders = orders.map((order) => order.orderNumber)
          .filter((number) => /^VL-\d{8}-[A-Z0-9]{6}$/u.test(number));
        setState({ kind: "ready", orders: [...new Set(validOrders)] });
      },
      () => {
        if (current) setState({ kind: "error", orders: [] });
      },
    );
    return () => { current = false; };
  }, [retry, uid]);

  function reloadOrders() {
    setRetry((count) => count + 1);
  }
  if (state.kind === "loading") {
    return <section className="inquiry-page" aria-busy="true"><p role="status">주문 내역을 불러오는 중입니다.</p></section>;
  }
  if (state.kind === "error") {
    return (
      <section className="inquiry-page inquiry-gate">
        <p role="alert">주문 내역을 불러오지 못했습니다.</p>
        <button className="inquiry-button" onClick={reloadOrders} type="button">주문 내역 다시 불러오기</button>
      </section>
    );
  }
  return <InquiryForm access={memberAccess} onSuccess={onSuccess} orderNumbers={state.orders} />;
}

export function MemberInquiryDetailPage({ id }: { id: string }) {
  return (
    <MemberGate path={detailHref(id)}>
      {() => <InquiryDetail access={memberAccess} backHref="/mypage/inquiries" id={id} />}
    </MemberGate>
  );
}
