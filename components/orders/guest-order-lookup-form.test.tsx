import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/firebase/id-token", () => ({ getCurrentFirebaseIdToken: tokenMock }));

import { deferred, inquiryFixture } from "../../tests/inquiry-fixtures";
import { GuestOrderLookupForm } from "./guest-order-lookup-form";

const orderNumber = "VL-20260826-ABC123";
const otherOrderNumber = "VL-20260826-DEF456";
const accessToken = "private-guest-access";
const publicOrder = {
  orderNumber,
  status: "mock-received" as const,
  receivedAt: "2026-08-26T10:00:00.000Z",
  customerNameMasked: "김**",
  phoneMasked: "010-****-5678",
  addressMasked: "서울시 강남구 ****",
  lines: [{
    productId: "vitamin-c", purchaseOptionId: "default", purchaseOptionLabel: "기본",
    sku: "", name: "비타민 C", thumbnailUrl: "/vitamin-c.jpg", basePrice: 12000,
    priceAdjustment: 0, unitPrice: 12000, quantity: 2, lineTotal: 24000,
  }],
  subtotal: 24000,
  shippingFee: 3000,
  total: 27000,
};
const inquiry = { ...inquiryFixture, ownerType: "guest", orderNumber, title: "비공개 배송 문의" };

function verified(number = orderNumber, expiresAt = new Date(Date.now() + 60_000).toISOString()) {
  return Response.json({ order: { ...publicOrder, orderNumber: number }, accessToken, expiresAt });
}

function requests(path: string) {
  return vi.mocked(fetch).mock.calls.filter(([url]) => url === path);
}

function submitLookup(number = orderNumber) {
  fireEvent.change(screen.getByLabelText("주문번호"), { target: { value: number } });
  fireEvent.change(screen.getByLabelText("주문 시 휴대전화 번호"), { target: { value: "01024685678" } });
  fireEvent.submit(screen.getByRole("form", { name: "비회원 주문 조회" }));
}

async function openPanel() {
  await screen.findByText("김**");
  fireEvent.click(screen.getByRole("button", { name: "이 주문으로 1:1 문의하기" }));
}

beforeEach(() => {
  tokenMock.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    if (url === "/api/inquiries/guest-verify") return verified();
    if (url === "/api/inquiries/list") return Response.json({ inquiries: [inquiry] });
    throw new Error("Unexpected request");
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses one verification for the masked result and inline entry, clears phone and focuses result", async () => {
  const user = userEvent.setup();
  render(<GuestOrderLookupForm />);
  await user.type(screen.getByLabelText("주문번호"), orderNumber.toLowerCase());
  await user.type(screen.getByLabelText("주문 시 휴대전화 번호"), "01012345678");
  await user.click(screen.getByRole("button", { name: "주문 조회" }));
  expect(await screen.findByText("김**")).toBeVisible();
  expect(screen.getByText("010-****-5678")).toBeVisible();
  expect(screen.getByText("서울시 강남구 ****")).toBeVisible();
  expect(screen.getByRole("heading", { name: "주문 조회 결과" })).toHaveFocus();
  expect(screen.getByLabelText("주문 시 휴대전화 번호")).toHaveValue("");
  expect(screen.getByText("27,000원")).toBeVisible();
  expect(screen.getByText("비타민 C")).toBeVisible();
  await openPanel();
  expect(await screen.findByRole("button", { name: /비공개 배송 문의/ })).toBeVisible();
  expect(requests("/api/inquiries/guest-verify")).toHaveLength(1);
  expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
    "/api/inquiries/guest-verify", "/api/inquiries/list",
  ]);
  expect(requests("/api/inquiries/guest-verify")[0][1]).toMatchObject({
    method: "POST", body: JSON.stringify({ orderNumber, phone: "010-1234-5678" }),
  });
  expect(requests("/api/inquiries/list")[0][1]?.headers).toMatchObject({ "x-inquiry-access": accessToken });
  expect(tokenMock).not.toHaveBeenCalled();
});

it("disables duplicate lookup while pending", async () => {
  const pending = deferred<Response>();
  vi.mocked(fetch).mockReturnValue(pending.promise);
  render(<GuestOrderLookupForm />);
  submitLookup();
  expect(screen.getByRole("button", { name: "조회 중" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("form", { name: "비회원 주문 조회" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(verified()));
  expect(screen.getByText("김**")).toBeVisible();
});

it.each([400, 404, 429, 503])("preserves generic lookup failure and order input for HTTP %s", async (status) => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ detail: "private server reason" }, { status }));
  render(<GuestOrderLookupForm />);
  submitLookup();
  expect(await screen.findByRole("alert")).toHaveTextContent("주문 정보를 확인하지 못했습니다");
  expect(screen.getByLabelText("주문번호")).toHaveValue(orderNumber);
  expect(screen.queryByRole("button", { name: "이 주문으로 1:1 문의하기" })).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent("private server reason");
});

it("rejects malformed order numbers before any request", () => {
  render(<GuestOrderLookupForm />);
  submitLookup("not-an-order");
  expect(screen.getByRole("alert")).toHaveTextContent("주문번호와 주문 시 휴대전화 번호를 확인해 주세요");
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["valid", "invalid", "failed"])("hides the old order, session and panel immediately on a %s new lookup", async (next) => {
  render(<GuestOrderLookupForm />);
  submitLookup();
  await openPanel();
  await screen.findByRole("button", { name: /비공개 배송 문의/ });
  const pending = deferred<Response>();
  vi.mocked(fetch).mockReturnValue(pending.promise);
  submitLookup(next === "invalid" ? "wrong" : otherOrderNumber);
  expect(screen.queryByRole("heading", { name: "주문 조회 결과" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /비공개 배송 문의/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "이 주문으로 1:1 문의하기" })).not.toBeInTheDocument();
  if (next !== "invalid") {
    await act(async () => pending.resolve(next === "failed" ? new Response(null, { status: 404 }) : verified(otherOrderNumber)));
    if (next === "failed") expect(screen.queryByText("김**")).not.toBeInTheDocument();
    else expect(screen.getByText(otherOrderNumber)).toBeVisible();
  }
});

it.each(["success", "failure"])("ignores late prior verification %s after editing and submitting a replacement", async (late) => {
  const old = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(old.promise).mockResolvedValueOnce(verified(otherOrderNumber));
  render(<GuestOrderLookupForm />);
  submitLookup();
  submitLookup(otherOrderNumber);
  expect(await screen.findByText(otherOrderNumber)).toBeVisible();
  await act(async () => old.resolve(late === "success" ? verified() : new Response(null, { status: 404 })));
  expect(screen.getByText(otherOrderNumber)).toBeVisible();
  expect(screen.queryByText(orderNumber)).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("does not revive old inquiries when a new invalid lookup aborts their pending request", async () => {
  const pending = deferred<Response>();
  vi.mocked(fetch).mockResolvedValueOnce(verified()).mockReturnValueOnce(pending.promise);
  render(<GuestOrderLookupForm />);
  submitLookup();
  await openPanel();
  await waitFor(() => expect(requests("/api/inquiries/list")).toHaveLength(1));
  const signal = requests("/api/inquiries/list")[0][1]?.signal;
  submitLookup("wrong");
  expect(signal?.aborted).toBe(true);
  await act(async () => pending.resolve(Response.json({ inquiries: [inquiry] })));
  expect(screen.queryByRole("button", { name: /비공개 배송 문의/ })).not.toBeInTheDocument();
});

it.each([false, true])("expires the session with panel open=%s and never silently reverifies", async (opened) => {
  render(<GuestOrderLookupForm />);
  submitLookup();
  await screen.findByText("김**");
  if (opened) {
    await openPanel();
    await screen.findByRole("button", { name: /비공개 배송 문의/ });
  }
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
  fireEvent.focus(window);
  expect(await screen.findByRole("alert")).toHaveTextContent("주문을 다시 조회");
  expect(screen.queryByRole("button", { name: "이 주문으로 1:1 문의하기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /비공개 배송 문의/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText("주문 시 휴대전화 번호")).toHaveValue("");
  expect(requests("/api/inquiries/guest-verify")).toHaveLength(1);
});

it("removes the session at its timer deadline, including late private responses", async () => {
  vi.useFakeTimers();
  const pending = deferred<Response>();
  vi.mocked(fetch).mockResolvedValueOnce(verified()).mockReturnValueOnce(pending.promise);
  render(<GuestOrderLookupForm />);
  await act(async () => submitLookup());
  fireEvent.click(screen.getByRole("button", { name: "이 주문으로 1:1 문의하기" }));
  await act(async () => undefined);
  const signal = requests("/api/inquiries/list")[0][1]?.signal;
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(screen.getByRole("alert")).toHaveTextContent("주문을 다시 조회");
  expect(signal?.aborted).toBe(true);
  await act(async () => pending.resolve(Response.json({ inquiries: [inquiry] })));
  expect(screen.queryByRole("button", { name: /비공개 배송 문의/ })).not.toBeInTheDocument();
});

it("clears the parent session on an application API 401 without losing the masked result", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(verified()).mockResolvedValueOnce(new Response(null, { status: 401 }));
  render(<GuestOrderLookupForm />);
  submitLookup();
  await openPanel();
  expect(await screen.findByRole("alert")).toHaveTextContent("주문을 다시 조회");
  expect(screen.queryByRole("button", { name: "이 주문으로 1:1 문의하기" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "주문 조회 결과" })).toBeVisible();
});

it("never persists credentials or uses member links, and requires verification after remount", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem");
  const push = vi.spyOn(history, "pushState");
  const replace = vi.spyOn(history, "replaceState");
  const log = vi.spyOn(console, "log");
  const { unmount } = render(<GuestOrderLookupForm />);
  submitLookup();
  await openPanel();
  await screen.findByRole("button", { name: /비공개 배송 문의/ });
  expect(document.body.innerHTML).not.toContain(accessToken);
  expect(document.body.innerHTML).not.toContain("01024685678");
  expect(document.body.innerHTML).not.toContain("010-2468-5678");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(storage).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
  expect(location.href).not.toContain(accessToken);
  unmount();
  render(<GuestOrderLookupForm initialOrderNumber={orderNumber} />);
  expect(screen.getByLabelText("주문 시 휴대전화 번호")).toHaveValue("");
  expect(screen.queryByRole("button", { name: "이 주문으로 1:1 문의하기" })).not.toBeInTheDocument();
  expect(screen.queryByText("김**")).not.toBeInTheDocument();
  expect(requests("/api/inquiries/guest-verify")).toHaveLength(1);
});

it("discards an unmounted verification response instead of restoring it on remount", async () => {
  const pending = deferred<Response>();
  vi.mocked(fetch).mockReturnValue(pending.promise);
  const { unmount } = render(<GuestOrderLookupForm />);
  submitLookup();
  unmount();
  render(<GuestOrderLookupForm />);
  await act(async () => pending.resolve(verified()));
  expect(screen.queryByText("김**")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "이 주문으로 1:1 문의하기" })).not.toBeInTheDocument();
});

it("rejects a verification response for a different order without granting inquiry access", async () => {
  vi.mocked(fetch).mockResolvedValue(verified(otherOrderNumber));
  render(<GuestOrderLookupForm />);
  submitLookup();
  expect(await screen.findByRole("alert")).toHaveTextContent("주문 정보를 확인하지 못했습니다");
  expect(screen.queryByText(otherOrderNumber)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "이 주문으로 1:1 문의하기" })).not.toBeInTheDocument();
});
