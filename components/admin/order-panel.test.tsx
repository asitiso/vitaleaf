import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { AdminOrderClient } from "../../lib/admin-orders/client";
import type { AdminOrderDetail, AdminOrderListItem } from "../../lib/admin-orders/types";
import { OrderPanel } from "./order-panel";

const first: AdminOrderListItem = {
  source: "member", ownerId: "member-1", orderNumber: "VL-20260907-TEST01",
  customerName: "김테스트", createdAt: "2026-09-07T10:00:00.000Z", itemSummary: "오메가3 외 1건",
  total: 31000, status: "mock-received", isTestOrder: true,
};
const second: AdminOrderListItem = {
  source: "guest", ownerId: null, orderNumber: "VL-20260908-GUEST02",
  customerName: "이비회원", createdAt: "2026-09-08T10:00:00.000Z", itemSummary: "비타민 D",
  total: 18000, status: "preparing", isTestOrder: false,
};
const detail = (row: AdminOrderListItem = first): AdminOrderDetail => ({
  ...row, phone: row === first ? "010-1234-5678" : "010-9876-5432",
  shippingAddress: { postcode: "12345", address: row === first ? "서울시 테스트구" : "부산시 배송구", addressDetail: "101호" },
  deliveryNote: "문 앞에 놓아 주세요", paymentMethod: "card", subtotal: row.total - 3000,
  shippingFee: 3000, receivedAt: row.createdAt, shippingCarrier: "", trackingNumber: "",
  statusUpdatedAt: null, statusUpdatedBy: "",
  lines: [{ productId: "omega", purchaseOptionId: "one", purchaseOptionLabel: "1개월분", sku: "OMEGA-1",
    name: "오메가3", thumbnailUrl: "", basePrice: 28000, priceAdjustment: 0, quantity: 1, unitPrice: 28000, lineTotal: 28000 }],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const makeClient = (overrides: Partial<AdminOrderClient> = {}): AdminOrderClient => ({
  list: vi.fn().mockResolvedValue([first, second]),
  get: vi.fn(async (reference) => detail(reference.orderNumber === first.orderNumber ? first : second)),
  update: vi.fn(async (_reference, operations) => ({ ...detail(), ...operations })),
  ...overrides,
});
const rowButton = (number = first.orderNumber) => within(screen.getByRole("list", { name: "주문 목록" })).getByRole("button", { name: new RegExp(number) });

it("shows loading, retries a failed list, and reports a genuinely empty result", async () => {
  const pending = deferred<AdminOrderListItem[]>();
  const client = makeClient({ list: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce([]) });
  const onReceivedCountChange = vi.fn();
  render(<OrderPanel client={client} onReceivedCountChange={onReceivedCountChange} />);
  expect(screen.getByRole("status")).toHaveTextContent("주문 목록을 불러오는 중");
  expect(onReceivedCountChange).not.toHaveBeenCalled();
  await act(async () => pending.reject(new Error("network")));
  expect(screen.getByRole("alert")).toHaveTextContent("주문 목록을 불러오지 못했습니다");
  await userEvent.setup().click(screen.getByRole("button", { name: "주문 목록 다시 불러오기" }));
  expect(await screen.findByText("주문이 없습니다.")).toBeVisible();
  expect(onReceivedCountChange).toHaveBeenLastCalledWith(0);
});

it("sorts newest first, renders list metadata, and searches and filters locally without leaking details", async () => {
  const client = makeClient();
  const onReceivedCountChange = vi.fn();
  const user = userEvent.setup();
  render(<OrderPanel client={client} onReceivedCountChange={onReceivedCountChange} />);
  const list = await screen.findByRole("list", { name: "주문 목록" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent(second.orderNumber);
  expect(rows[0]).toHaveTextContent("비회원");
  expect(rows[0]).toHaveTextContent("18,000원");
  expect(rows[1]).toHaveTextContent("오메가3 외 1건");
  expect(rows[1]).toHaveTextContent("테스트");
  expect(rows[1]).toHaveTextContent("접수");
  expect(rows[1].querySelector("time")).toHaveAttribute("datetime", first.createdAt);
  expect(onReceivedCountChange).toHaveBeenLastCalledWith(1);
  expect(client.get).not.toHaveBeenCalled();
  expect(screen.queryByText("010-1234-5678")).not.toBeInTheDocument();
  expect(screen.queryByText("서울시 테스트구")).not.toBeInTheDocument();

  await user.type(screen.getByRole("searchbox", { name: "주문 검색" }), "guest02");
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  expect(rowButton(second.orderNumber)).toBeVisible();
  await user.clear(screen.getByRole("searchbox", { name: "주문 검색" }));
  await user.type(screen.getByRole("searchbox", { name: "주문 검색" }), " 김테스트 ");
  expect(rowButton()).toBeVisible();
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  await user.clear(screen.getByRole("searchbox", { name: "주문 검색" }));
  await user.selectOptions(screen.getByLabelText("주문 구분"), "test");
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  await user.selectOptions(screen.getByLabelText("처리 상태 필터"), "preparing");
  expect(screen.getByText("조건에 맞는 주문이 없습니다.")).toBeVisible();
  await user.selectOptions(screen.getByLabelText("주문 구분"), "all");
  expect(rowButton(second.orderNumber)).toBeVisible();
  expect(client.list).toHaveBeenCalledTimes(1);
  expect(onReceivedCountChange).toHaveBeenLastCalledWith(1);
});

it("only shows private information after selected detail succeeds and retries detail failures", async () => {
  const pending = deferred<AdminOrderDetail>();
  const client = makeClient({ get: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(detail()) });
  const user = userEvent.setup();
  render(<OrderPanel client={client} onReceivedCountChange={vi.fn()} />);
  await screen.findByRole("list", { name: "주문 목록" });
  await user.click(rowButton());
  expect(client.get).toHaveBeenCalledWith({ source: "member", ownerId: "member-1", orderNumber: first.orderNumber }, expect.any(AbortSignal));
  expect(screen.queryByText("서울시 테스트구")).not.toBeInTheDocument();
  await act(async () => pending.reject(new Error("forbidden")));
  expect(screen.queryByText("010-1234-5678")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "주문 상세 다시 불러오기" }));
  expect(await screen.findByText("서울시 테스트구")).toBeVisible();
  expect(screen.getByText("010-1234-5678")).toBeVisible();
  expect(screen.getByText("1개월분")).toBeVisible();
  expect(screen.getByText("문 앞에 놓아 주세요")).toBeVisible();
});

it("aborts old detail selection and ignores its later response", async () => {
  const old = deferred<AdminOrderDetail>();
  const client = makeClient({ get: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(detail(second)) });
  const user = userEvent.setup();
  render(<OrderPanel client={client} onReceivedCountChange={vi.fn()} />);
  await screen.findByRole("list", { name: "주문 목록" });
  await user.click(rowButton());
  const signal = vi.mocked(client.get).mock.calls[0]![1]!;
  await user.click(rowButton(second.orderNumber));
  expect(signal.aborted).toBe(true);
  expect(await screen.findByText("부산시 배송구")).toBeVisible();
  await act(async () => old.resolve(detail()));
  expect(screen.queryByText("서울시 테스트구")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "처리 상태" })).toHaveValue("preparing");
});

it("requires shipping fields, locks duplicate saves, and updates detail, list and unfiltered received count after success", async () => {
  const pending = deferred<AdminOrderDetail>();
  const client = makeClient({ update: vi.fn().mockReturnValue(pending.promise) });
  const onReceivedCountChange = vi.fn();
  const user = userEvent.setup();
  render(<OrderPanel client={client} onReceivedCountChange={onReceivedCountChange} />);
  await screen.findByRole("list", { name: "주문 목록" });
  await user.click(rowButton());
  await screen.findByText("서울시 테스트구");
  await user.selectOptions(screen.getByLabelText("처리 상태", { exact: true }), "shipped");
  expect(screen.getByLabelText("배송사")).toBeRequired();
  expect(screen.getByLabelText("송장번호")).toBeRequired();
  expect(screen.getByLabelText("배송사")).toHaveAttribute("maxlength", "200");
  expect(screen.getByLabelText("송장번호")).toHaveAttribute("maxlength", "200");
  await user.click(screen.getByRole("button", { name: "처리 정보 저장" }));
  expect(client.update).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("배송사"), "   ");
  await user.type(screen.getByLabelText("송장번호"), "   ");
  fireEvent.submit(screen.getByRole("form", { name: "주문 처리 정보" }));
  expect(client.update).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("배송사와 송장번호");
  await user.clear(screen.getByLabelText("배송사"));
  await user.clear(screen.getByLabelText("송장번호"));
  await user.type(screen.getByLabelText("배송사"), "CJ대한통운");
  await user.type(screen.getByLabelText("송장번호"), "1234567890");
  fireEvent.submit(screen.getByRole("form", { name: "주문 처리 정보" }));
  fireEvent.submit(screen.getByRole("form", { name: "주문 처리 정보" }));
  expect(client.update).toHaveBeenCalledTimes(1);
  expect(client.update).toHaveBeenCalledWith(
    { source: "member", ownerId: "member-1", orderNumber: first.orderNumber },
    { status: "shipped", shippingCarrier: "CJ대한통운", trackingNumber: "1234567890" }, expect.any(AbortSignal),
  );
  expect(screen.getByRole("button", { name: "저장 중" })).toBeDisabled();
  expect(screen.getByLabelText("배송사")).toBeDisabled();
  expect(rowButton()).toHaveTextContent("접수");
  await act(async () => pending.resolve({ ...detail(), status: "shipped", shippingCarrier: "CJ대한통운", trackingNumber: "1234567890" }));
  expect(rowButton()).toHaveTextContent("배송 중");
  expect(screen.getByText("처리 정보를 저장했습니다.")).toBeVisible();
  expect(onReceivedCountChange).toHaveBeenLastCalledWith(0);
});

it("preserves saved state and the editable draft on mutation failure, then supports retry", async () => {
  const client = makeClient({ update: vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ ...detail(), status: "completed" }) });
  const user = userEvent.setup();
  render(<OrderPanel client={client} onReceivedCountChange={vi.fn()} />);
  await screen.findByRole("list", { name: "주문 목록" });
  await user.click(rowButton());
  await screen.findByText("서울시 테스트구");
  await user.selectOptions(screen.getByLabelText("처리 상태", { exact: true }), "completed");
  await user.click(screen.getByRole("button", { name: "처리 정보 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
  expect(rowButton()).toHaveTextContent("접수");
  expect(within(screen.getByRole("article", { name: "주문 상세" })).getByText("현재 처리 상태: 접수")).toBeVisible();
  expect(screen.getByLabelText("처리 상태", { exact: true })).toHaveValue("completed");
  expect(screen.getByText("서울시 테스트구")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "처리 정보 저장" }));
  expect(await screen.findByText("현재 처리 상태: 완료")).toBeVisible();
});

it("does not let a stale mutation replace another selection or unlock its active save", async () => {
  const old = deferred<AdminOrderDetail>();
  const current = deferred<AdminOrderDetail>();
  const client = makeClient({ update: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise) });
  const user = userEvent.setup();
  render(<OrderPanel client={client} onReceivedCountChange={vi.fn()} />);
  await screen.findByRole("list", { name: "주문 목록" });
  await user.click(rowButton());
  await screen.findByText("서울시 테스트구");
  await user.selectOptions(screen.getByLabelText("처리 상태", { exact: true }), "completed");
  await user.click(screen.getByRole("button", { name: "처리 정보 저장" }));
  const oldSignal = vi.mocked(client.update).mock.calls[0]![2]!;
  await user.click(rowButton(second.orderNumber));
  expect(oldSignal.aborted).toBe(true);
  expect(screen.queryByText("서울시 테스트구")).not.toBeInTheDocument();
  await screen.findByText("부산시 배송구");
  await user.selectOptions(screen.getByLabelText("처리 상태", { exact: true }), "cancelled");
  await user.click(screen.getByRole("button", { name: "처리 정보 저장" }));
  await act(async () => old.resolve({ ...detail(), status: "completed" }));
  expect(screen.queryByText("서울시 테스트구")).not.toBeInTheDocument();
  expect(rowButton()).toHaveTextContent("접수");
  expect(screen.getByRole("button", { name: "저장 중" })).toBeDisabled();
  await act(async () => current.resolve({ ...detail(second), status: "cancelled" }));
  expect(screen.getByText("현재 처리 상태: 취소")).toBeVisible();
});

it.each(["list", "get", "update"] as const)("aborts pending %s on unmount and suppresses late callbacks", async (operation) => {
  const listPending = deferred<AdminOrderListItem[]>();
  const detailPending = deferred<AdminOrderDetail>();
  const client = makeClient(operation === "list"
    ? { list: vi.fn().mockReturnValue(listPending.promise) }
    : { [operation]: vi.fn().mockReturnValue(detailPending.promise) });
  const count = vi.fn();
  const user = userEvent.setup();
  const view = render(<OrderPanel client={client} onReceivedCountChange={count} />);
  if (operation !== "list") {
    await screen.findByRole("list", { name: "주문 목록" });
    await user.click(rowButton());
    if (operation === "update") {
      await screen.findByText("서울시 테스트구");
      await user.click(screen.getByRole("button", { name: "처리 정보 저장" }));
    }
  }
  const calls = vi.mocked(client[operation]).mock.calls;
  const signal = calls[0]!.at(-1) as AbortSignal;
  const countCalls = count.mock.calls.length;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { listPending.resolve([first]); detailPending.resolve(detail()); });
  expect(count).toHaveBeenCalledTimes(countCalls);
});
