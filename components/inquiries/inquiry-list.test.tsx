import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase/id-token", () => ({
  getCurrentFirebaseIdToken: vi.fn(async () => "member-token"),
}));

import { deferred, inquiryFixture } from "../../tests/inquiry-fixtures";
import type { InquiryClientAccess } from "../../lib/inquiries/client";
import { InquiryList } from "./inquiry-list";

const rows = [
  { ...inquiryFixture, id: "i-1", category: "shipping", title: "배송 일정", orderNumber: "VL-20260826-ABC123" },
  { ...inquiryFixture, id: "i-2", category: "product", title: "성분 문의", status: "answered", adminReply: "답변", repliedAt: inquiryFixture.createdAt },
];
const detailHref = (id: string) => "/mypage/inquiries/" + encodeURIComponent(id);

beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ inquiries: rows }))));
afterEach(() => vi.unstubAllGlobals());

it("loads a private list with waiting and answered links", async () => {
  render(<InquiryList access={{ kind: "member" }} createHref="/mypage/inquiries/new" detailHref={detailHref} />);
  expect(screen.getByRole("status")).toHaveTextContent("문의 내역을 불러오는 중");
  expect(await screen.findByRole("link", { name: /배송 일정/ })).toHaveAttribute("href", "/mypage/inquiries/i-1");
  expect(screen.getByText("답변 대기")).toBeVisible();
  expect(screen.getByText("답변 완료")).toBeVisible();
  expect(screen.getByText("VL-20260826-ABC123")).toBeVisible();
});

it("shows retry after an error and ignores an old access response", async () => {
  const old = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(old.promise)
    .mockRejectedValueOnce(new Error("failed"))
    .mockResolvedValueOnce(Response.json({ inquiries: [] }));
  const user = userEvent.setup();
  const { rerender } = render(<InquiryList access={{ kind: "member" }} detailHref={detailHref} />);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  rerender(<InquiryList access={{ kind: "guest", token: "new-access" }} detailHref={detailHref} />);
  await act(async () => old.resolve(Response.json({ inquiries: rows })));
  expect(await screen.findByRole("alert")).toHaveTextContent("문의 내역을 불러오지 못했습니다");
  expect(screen.queryByText("배송 일정")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "문의 내역 다시 불러오기" }));
  expect(await screen.findByText("등록한 문의가 없습니다.")).toBeVisible();
});

const pagedRows = (kind: "member" | "guest", count: number, prefix = "문의") => Array.from({ length: count }, (_, index) => ({
  ...inquiryFixture,
  id: `${prefix}-${index + 1}`,
  title: `${prefix} ${index + 1}`,
  ownerType: kind,
  orderNumber: kind === "guest" ? "VL-20260826-ABC123" : null,
}));
const accessFor = (kind: "member" | "guest"): InquiryClientAccess => kind === "member"
  ? { kind } : { kind, token: "guest-page-token" };

it.each(["member", "guest"] as const)("appends older %s inquiries in server order, deduplicates, and stops at the end", async (kind) => {
  const records = pagedRows(kind, 42);
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ inquiries: records.slice(0, 21) }))
    // A repeated boundary row must not render twice; the raw 20th row remains the next cursor.
    .mockResolvedValueOnce(Response.json({ inquiries: [records[19], ...records.slice(20, 40)] }))
    .mockResolvedValueOnce(Response.json({ inquiries: records.slice(39) }));
  render(<InquiryList access={accessFor(kind)} detailHref={detailHref} />);
  await screen.findByText("문의 20");
  expect(screen.getAllByRole("listitem")).toHaveLength(20);
  expect(screen.queryByText("문의 21")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenNthCalledWith(1, "/api/inquiries/list", expect.objectContaining({
    body: JSON.stringify({ pageSize: 21 }),
    headers: expect.objectContaining(kind === "member" ? { authorization: "Bearer member-token" } : { "x-inquiry-access": "guest-page-token" }),
  }));
  fireEvent.click(screen.getByRole("button", { name: "이전 문의 더보기" }));
  await screen.findByText("문의 39");
  expect(screen.getAllByRole("listitem")).toHaveLength(39);
  expect(screen.queryByText("문의 40")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenNthCalledWith(2, "/api/inquiries/list", expect.objectContaining({ body: JSON.stringify({ pageSize: 21, cursor: "문의-20" }) }));
  fireEvent.click(screen.getByRole("button", { name: "이전 문의 더보기" }));
  await screen.findByText("문의 42");
  expect(fetch).toHaveBeenNthCalledWith(3, "/api/inquiries/list", expect.objectContaining({ body: JSON.stringify({ pageSize: 21, cursor: "문의-39" }) }));
  expect(screen.getAllByRole("listitem")).toHaveLength(42);
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(records.map((record) => detailHref(record.id)));
  expect(screen.queryByRole("button", { name: "이전 문의 더보기" })).not.toBeInTheDocument();
});

it("keeps loaded rows visible through next-page loading, failure and retry without duplicate requests", async () => {
  const pending = deferred<Response>();
  const records = pagedRows("member", 21);
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ inquiries: records }))
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(Response.json({ inquiries: [records[20]] }));
  render(<InquiryList access={{ kind: "member" }} detailHref={detailHref} />);
  await screen.findByText("문의 20");
  const more = screen.getByRole("button", { name: "이전 문의 더보기" });
  fireEvent.click(more);
  fireEvent.click(more);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(more).toBeDisabled();
  expect(more).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  expect(screen.getAllByRole("listitem")).toHaveLength(20);
  await act(async () => pending.reject(new Error("next page failed")));
  expect(await screen.findByRole("alert")).toHaveTextContent("이전 문의를 불러오지 못했습니다");
  expect(screen.getAllByRole("listitem")).toHaveLength(20);
  expect(more).toBeEnabled();
  fireEvent.click(more);
  await screen.findByText("문의 21");
  expect(fetch).toHaveBeenNthCalledWith(3, "/api/inquiries/list", expect.objectContaining({ body: JSON.stringify({ pageSize: 21, cursor: "문의-20" }) }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "이전 문의 더보기" })).not.toBeInTheDocument();
});

it.each(["member", "guest"] as const)("aborts a pending %s next page and resets rows/cursor when access changes", async (kind) => {
  const pending = deferred<Response>();
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ inquiries: pagedRows(kind, 21, "이전") }))
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(Response.json({ inquiries: pagedRows("guest", 21, "새") }))
    .mockResolvedValueOnce(Response.json({ inquiries: [] }));
  const { rerender } = render(<InquiryList access={accessFor(kind)} detailHref={detailHref} />);
  await screen.findByText("이전 20");
  fireEvent.click(screen.getByRole("button", { name: "이전 문의 더보기" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const oldSignal = vi.mocked(fetch).mock.calls[1]![1]!.signal!;
  rerender(<InquiryList access={{ kind: "guest", token: "next-identity" }} detailHref={detailHref} />);
  expect(oldSignal.aborted).toBe(true);
  expect(screen.queryByText("이전 1")).not.toBeInTheDocument();
  await screen.findByText("새 20");
  await act(async () => pending.resolve(Response.json({ inquiries: pagedRows(kind, 1, "늦은") })));
  expect(screen.queryByText("늦은 1")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenNthCalledWith(3, "/api/inquiries/list", expect.objectContaining({ body: JSON.stringify({ pageSize: 21 }) }));
  fireEvent.click(screen.getByRole("button", { name: "이전 문의 더보기" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "이전 문의 더보기" })).not.toBeInTheDocument());
  expect(fetch).toHaveBeenNthCalledWith(4, "/api/inquiries/list", expect.objectContaining({ body: JSON.stringify({ pageSize: 21, cursor: "새-20" }) }));
  expect(screen.getAllByRole("listitem")).toHaveLength(20);
});

it("clears next-page errors when a guest identity changes", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ inquiries: pagedRows("guest", 21) }))
    .mockRejectedValueOnce(new Error("old failure"))
    .mockResolvedValueOnce(Response.json({ inquiries: [] }));
  const { rerender } = render(<InquiryList access={accessFor("guest")} />);
  await screen.findByText("문의 20");
  fireEvent.click(screen.getByRole("button", { name: "이전 문의 더보기" }));
  await screen.findByRole("alert");
  rerender(<InquiryList access={{ kind: "guest", token: "next-identity" }} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(await screen.findByText("등록한 문의가 없습니다.")).toBeVisible();
  expect(screen.queryByText("문의 1")).not.toBeInTheDocument();
});

it("immediately expires guest access on a next-page 401 instead of offering retry", async () => {
  const expired = vi.fn();
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ inquiries: pagedRows("guest", 21) }))
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  render(<InquiryList access={accessFor("guest")} onAccessExpired={expired} />);
  await screen.findByText("문의 20");
  fireEvent.click(screen.getByRole("button", { name: "이전 문의 더보기" }));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  expect(vi.mocked(fetch).mock.calls[1]![1]!.signal!.aborted).toBe(true);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("문의 1")).not.toBeInTheDocument();
});
