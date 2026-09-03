"use client";

import { useState } from "react";

import type { InquiryClientAccess } from "../../lib/inquiries/client";
import { InquiryDetail } from "./inquiry-detail";
import { InquiryForm } from "./inquiry-form";
import { InquiryList } from "./inquiry-list";

type GuestInquiryPanelProps = {
  access: Extract<InquiryClientAccess, { kind: "guest" }>;
  orderNumber: string;
  onAccessExpired: () => void;
};

type PanelView = { kind: "list" } | { kind: "create" } | { kind: "detail"; id: string };

export function GuestInquiryPanel(props: GuestInquiryPanelProps) {
  return <GuestInquiryPanelContent key={props.access.token + ":" + props.orderNumber} {...props} />;
}

function GuestInquiryPanelContent({ access, orderNumber, onAccessExpired }: GuestInquiryPanelProps) {
  const [view, setView] = useState<PanelView>({ kind: "list" });

  function showList() {
    setView({ kind: "list" });
  }

  function showDetail(id: string) {
    setView({ kind: "detail", id });
  }

  return (
    <section className="guest-inquiry-panel" aria-label="이 주문의 1:1 문의">
      {view.kind === "list" ? (
        <InquiryList
          access={access}
          onCreate={() => setView({ kind: "create" })}
          onSelect={showDetail}
          onAccessExpired={onAccessExpired}
        />
      ) : view.kind === "create" ? (
        <>
          <button className="inquiry-button" onClick={showList} type="button">문의 내역으로</button>
          <InquiryForm
            access={access}
            orderNumbers={[]}
            lockedOrderNumber={orderNumber}
            onSuccess={showDetail}
            onAccessExpired={onAccessExpired}
          />
        </>
      ) : (
        <InquiryDetail access={access} id={view.id} onBack={showList} onAccessExpired={onAccessExpired} />
      )}
    </section>
  );
}
