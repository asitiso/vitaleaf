"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminOrderClient } from "../../lib/admin-orders/client";
import type { AdminOrderDetail, AdminOrderListItem, AdminOrderReference } from "../../lib/admin-orders/types";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderOperationsUpdate, type OrderStatus } from "../../lib/orders/operations";

type Props = {
  client: AdminOrderClient;
  onReceivedCountChange(count: number): void;
};
type ListState = { kind: "loading" | "ready" | "error"; rows: AdminOrderListItem[] };
type DetailState =
  | { kind: "idle" | "loading" | "error"; order: null }
  | { kind: "ready"; order: AdminOrderDetail };

const orderKey = (order: AdminOrderReference) => JSON.stringify([order.source, order.ownerId, order.orderNumber]);
const referenceOf = (order: AdminOrderReference): AdminOrderReference => order.source === "member"
  ? { source: "member", ownerId: order.ownerId, orderNumber: order.orderNumber }
  : { source: "guest", ownerId: null, orderNumber: order.orderNumber };
const operationsOf = (order: AdminOrderDetail): OrderOperationsUpdate => ({
  status: order.status, shippingCarrier: order.shippingCarrier, trackingNumber: order.trackingNumber,
});
const money = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
const paymentLabels = { card: "카드", bank: "계좌이체", easy: "간편결제" };

export function OrderPanel({ client, onReceivedCountChange }: Props) {
  const [listState, setListState] = useState<ListState>({ kind: "loading", rows: [] });
  const [selected, setSelected] = useState<AdminOrderReference | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ kind: "idle", order: null });
  const [query, setQuery] = useState("");
  const [testFilter, setTestFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [draft, setDraft] = useState<OrderOperationsUpdate>({ status: "mock-received", shippingCarrier: "", trackingNumber: "" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error" | "success">("idle");
  const [validationError, setValidationError] = useState("");
  const [reload, setReload] = useState(0);
  const selectionGenerationRef = useRef(0);
  const detailControllerRef = useRef<AbortController | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // A changed client or retried list starts with no previous customer's details.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setListState({ kind: "loading", rows: [] });
    setSelected(null);
    setDetailState({ kind: "idle", order: null });
    setSaveState("idle");
    setValidationError("");
    void client.list(controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) {
          const newest = [...rows].sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
          setListState({ kind: "ready", rows: newest });
        }
      },
      () => { if (!controller.signal.aborted) setListState({ kind: "error", rows: [] }); },
    );
    return () => {
      controller.abort();
      selectionGenerationRef.current += 1;
      detailControllerRef.current?.abort();
      mutationControllerRef.current?.abort();
      mutationControllerRef.current = null;
    };
  }, [client, reload]);

  useEffect(() => {
    if (listState.kind === "ready") {
      onReceivedCountChange(listState.rows.filter((order) => order.status === "mock-received").length);
    }
  }, [listState, onReceivedCountChange]);

  function selectOrder(reference: AdminOrderReference) {
    if (selected && orderKey(selected) === orderKey(reference) && mutationControllerRef.current) return;
    detailControllerRef.current?.abort();
    mutationControllerRef.current?.abort();
    mutationControllerRef.current = null;
    const generation = ++selectionGenerationRef.current;
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const target = referenceOf(reference);
    setSelected(target);
    setDetailState({ kind: "loading", order: null });
    setSaveState("idle");
    setValidationError("");
    void client.get(target, controller.signal).then(
      (order) => {
        if (controller.signal.aborted || generation !== selectionGenerationRef.current) return;
        setDetailState({ kind: "ready", order });
        setDraft(operationsOf(order));
      },
      () => {
        if (!controller.signal.aborted && generation === selectionGenerationRef.current) {
          setDetailState({ kind: "error", order: null });
        }
      },
    );
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = detailState.order;
    if (!order || mutationControllerRef.current) return;
    const operations: OrderOperationsUpdate = {
      status: draft.status,
      shippingCarrier: draft.status === "shipped" ? draft.shippingCarrier.trim() : "",
      trackingNumber: draft.status === "shipped" ? draft.trackingNumber.trim() : "",
    };
    if (operations.status === "shipped" && (!operations.shippingCarrier || !operations.trackingNumber)) {
      setValidationError("배송사와 송장번호를 입력해 주세요.");
      return;
    }
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    const generation = selectionGenerationRef.current;
    const isCurrent = () => !controller.signal.aborted
      && generation === selectionGenerationRef.current
      && mutationControllerRef.current === controller;
    setSaveState("saving");
    setValidationError("");
    try {
      const updated = await client.update(referenceOf(order), operations, controller.signal);
      if (!isCurrent()) return;
      setDetailState({ kind: "ready", order: updated });
      setDraft(operationsOf(updated));
      // Keep the list privacy-minimized; never copy a detail response into it.
      setListState((current) => ({ ...current, rows: current.rows.map((row) => (
        orderKey(row) === orderKey(order) ? { ...row, status: updated.status } : row
      )) }));
      setSaveState("success");
    } catch {
      if (isCurrent()) setSaveState("error");
    } finally {
      // An old save must never release a later selection's mutation lock.
      if (isCurrent()) mutationControllerRef.current = null;
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const filteredOrders = listState.rows.filter((order) => (
    (!normalizedQuery || order.orderNumber.toLocaleLowerCase("ko-KR").includes(normalizedQuery) || order.customerName.toLocaleLowerCase("ko-KR").includes(normalizedQuery))
    && (testFilter === "all" || order.isTestOrder)
    && (statusFilter === "all" || order.status === statusFilter)
  ));
  const order = detailState.order;
  const saving = saveState === "saving";

  return (
    <section className="admin-orders" aria-labelledby="admin-orders-heading">
      <div className="admin-toolbar"><div><h2 id="admin-orders-heading">주문 관리</h2><p>주문을 확인하고 처리 상태와 배송 정보를 저장합니다.</p></div></div>
      <div className="admin-order-filters">
        <label>주문 검색<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="주문번호 또는 고객명" /></label>
        <label>주문 구분<select value={testFilter} onChange={(event) => setTestFilter(event.target.value)}><option value="all">전체</option><option value="test">테스트</option></select></label>
        <label>처리 상태 필터<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "all")}>
          <option value="all">전체</option>{ORDER_STATUSES.map((status) => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}
        </select></label>
      </div>
      <div className="admin-order-layout">
        <div className="admin-order-list-container">
          {listState.kind === "loading" ? <p role="status">주문 목록을 불러오는 중입니다.</p> : null}
          {listState.kind === "error" ? <div role="alert"><p>주문 목록을 불러오지 못했습니다.</p><button type="button" onClick={() => setReload((value) => value + 1)}>주문 목록 다시 불러오기</button></div> : null}
          {listState.kind === "ready" ? <>
            {filteredOrders.length === 0 ? <p>{listState.rows.length === 0 ? "주문이 없습니다." : "조건에 맞는 주문이 없습니다."}</p> : null}
            <ol className="admin-order-list" aria-label="주문 목록">{filteredOrders.map((item) => (
              <li key={orderKey(item)}><button className="admin-order-row" type="button" aria-current={selected && orderKey(selected) === orderKey(item) ? "true" : undefined} onClick={() => selectOrder(item)}>
                <strong>{item.orderNumber}</strong>
                <span>{item.source === "member" ? "회원" : "비회원"} · {item.customerName}</span>
                <span>{item.itemSummary}</span><span>{money(item.total)}</span>
                <span className="admin-order-status">{ORDER_STATUS_LABELS[item.status]}</span>
                {item.createdAt ? <time dateTime={item.createdAt}>{dateFormat.format(new Date(item.createdAt))}</time> : <span>주문일 미확인</span>}
                {item.isTestOrder ? <span className="admin-order-test-badge">테스트</span> : null}
              </button></li>
            ))}</ol>
          </> : null}
        </div>
        <article className="admin-order-detail" aria-label="주문 상세">
          {detailState.kind === "idle" ? <p>주문을 선택해 주세요.</p> : null}
          {detailState.kind === "loading" ? <p role="status">주문 상세를 불러오는 중입니다.</p> : null}
          {detailState.kind === "error" ? <div role="alert"><p>주문 상세를 불러오지 못했습니다.</p><button type="button" onClick={() => { if (selected) selectOrder(selected); }}>주문 상세 다시 불러오기</button></div> : null}
          {order ? <>
            <h3>{order.orderNumber}</h3>
            {order.isTestOrder ? <p className="admin-order-test-badge">테스트 주문</p> : null}
            <p>{order.source === "member" ? "회원 주문" : "비회원 주문"} · {order.customerName}</p>
            <p className="admin-order-status">현재 처리 상태: {ORDER_STATUS_LABELS[order.status]}</p>
            <dl className="admin-order-contact">
              <dt>연락처</dt><dd>{order.phone}</dd>
              <dt>배송지</dt><dd><span>{order.shippingAddress.postcode}</span><p>{order.shippingAddress.address}</p><p>{order.shippingAddress.addressDetail}</p></dd>
              <dt>배송 요청사항</dt><dd>{order.deliveryNote || "없음"}</dd>
            </dl>
            <ul className="admin-order-lines" aria-label="주문 상품">{order.lines.map((line, index) => (
              <li key={`${line.productId}:${line.purchaseOptionId}:${index}`}><strong>{line.name}</strong><span>{line.purchaseOptionLabel}</span><span>{line.quantity}개 · {money(line.lineTotal)}</span></li>
            ))}</ul>
            <dl className="admin-order-totals"><dt>상품 금액</dt><dd>{money(order.subtotal)}</dd><dt>배송비</dt><dd>{money(order.shippingFee)}</dd><dt>총 금액</dt><dd>{money(order.total)}</dd><dt>결제 수단</dt><dd>{paymentLabels[order.paymentMethod]}</dd></dl>
            <form className="admin-order-form" aria-label="주문 처리 정보" onSubmit={(event) => void saveOrder(event)}>
              <label>처리 상태<select value={draft.status} disabled={saving} onChange={(event) => { setDraft({ ...draft, status: event.target.value as OrderStatus }); setSaveState("idle"); setValidationError(""); }}>
                {ORDER_STATUSES.map((status) => <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>)}
              </select></label>
              <label>배송사<input value={draft.shippingCarrier} disabled={saving} required={draft.status === "shipped"} onChange={(event) => { setDraft({ ...draft, shippingCarrier: event.target.value }); setSaveState("idle"); setValidationError(""); }} /></label>
              <label>송장번호<input value={draft.trackingNumber} disabled={saving} required={draft.status === "shipped"} onChange={(event) => { setDraft({ ...draft, trackingNumber: event.target.value }); setSaveState("idle"); setValidationError(""); }} /></label>
              {validationError ? <p role="alert">{validationError}</p> : null}
              {saveState === "error" ? <p role="alert">처리 정보를 저장하지 못했습니다. 기존 상태와 입력 내용을 유지했으니 다시 시도해 주세요.</p> : null}
              {saveState === "success" ? <p role="status">처리 정보를 저장했습니다.</p> : null}
              <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? "저장 중" : "처리 정보 저장"}</button>
            </form>
          </> : null}
        </article>
      </div>
    </section>
  );
}
