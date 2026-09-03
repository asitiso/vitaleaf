import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/firebase/id-token", () => ({ getCurrentFirebaseIdToken: tokenMock }));

import { deferred, inquiryFixture } from "../../tests/inquiry-fixtures";
import { InquiryDetail } from "./inquiry-detail";
import { InquiryForm } from "./inquiry-form";
import { InquiryList } from "./inquiry-list";

beforeEach(() => {
  tokenMock.mockReset().mockResolvedValue("member-token");
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

it("loads waiting/answered member links with encoded IDs and a create action", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ inquiries: [
    { ...inquiryFixture, id: "문의 1", category: "shipping", title: "배송 문의", orderNumber: "VL-20260826-ABC123" },
    { ...inquiryFixture, id: "inquiry-2", title: "답변된 문의", status: "answered", adminReply: "답변", repliedAt: inquiryFixture.createdAt },
  ] }));
  render(<InquiryList access={{ kind: "member" }} createHref="/mypage/inquiries/new" detailHref={(id) => "/mypage/inquiries/" + encodeURIComponent(id)} />);
  expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  expect(await screen.findByRole("link", { name: /배송 문의/ })).toHaveAttribute("href", "/mypage/inquiries/%EB%AC%B8%EC%9D%98%201");
  expect(screen.getByText("답변 대기")).toBeVisible();
  expect(screen.getByText("답변 완료")).toBeVisible();
  expect(screen.getByText("VL-20260826-ABC123")).toBeVisible();
  expect(screen.getByRole("link", { name: "문의 작성" })).toHaveAttribute("href", "/mypage/inquiries/new");
  expect(fetch).toHaveBeenCalledWith("/api/inquiries/list", expect.objectContaining({
    method: "POST", headers: expect.objectContaining({ authorization: "Bearer member-token" }), body: "{}",
  }));
});

it("retries list failure to empty and supports inline guest create/select without member links or nested main", async () => {
  const create = vi.fn();
  const select = vi.fn();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ inquiries: [] }))
    .mockResolvedValueOnce(Response.json({ inquiries: [inquiryFixture] }));
  const { rerender } = render(<main><InquiryList access={{ kind: "guest", token: "guest-a" }} onCreate={create} onSelect={select} /></main>);
  expect(await screen.findByRole("alert")).toHaveTextContent("문의 내역을 불러오지 못했습니다");
  fireEvent.click(screen.getByRole("button", { name: "문의 내역 다시 불러오기" }));
  await screen.findByText("등록한 문의가 없습니다.");
  fireEvent.click(screen.getByRole("button", { name: "첫 문의 작성하기" }));
  expect(create).toHaveBeenCalledOnce();
  rerender(<main><InquiryList access={{ kind: "guest", token: "guest-b" }} onCreate={create} onSelect={select} /></main>);
  fireEvent.click(await screen.findByRole("button", { name: /문의 제목/ }));
  expect(select).toHaveBeenCalledExactlyOnceWith("new-1");
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(tokenMock).not.toHaveBeenCalled();
});

it.each(["waiting", "answered"])("renders %s detail and authorized HTTPS attachments through the real parser", async (status) => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ inquiry: {
    ...inquiryFixture,
    status,
    body: "첫 줄\n둘째 줄",
    adminReply: status === "answered" ? "첫 답변\n\t다음 답변" : null,
    repliedAt: status === "answered" ? inquiryFixture.createdAt : null,
    attachments: [{ id: "image-1", originalName: "leaf.png", contentType: "image/png", size: 12, readUrl: "https://storage.example.test/leaf?signature=temporary" }],
  } }));
  const back = vi.fn();
  render(<main><InquiryDetail access={{ kind: "guest", token: "verified-guest" }} id="new-1" onBack={back} /></main>);
  expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  expect(await screen.findByRole("heading", { name: "문의 제목" })).toBeVisible();
  expect(screen.getByRole("img", { name: "문의 첨부 이미지 1" })).toHaveAttribute("src", "https://storage.example.test/leaf?signature=temporary");
  if (status === "waiting") expect(screen.getByRole("heading", { name: "답변 대기" })).toBeVisible();
  else expect(screen.getByText("첫 답변 다음 답변")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "문의 내역으로" }));
  expect(back).toHaveBeenCalledOnce();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(fetch).toHaveBeenCalledWith("/api/inquiries/detail", expect.objectContaining({
    headers: expect.objectContaining({ "x-inquiry-access": "verified-guest" }), body: JSON.stringify({ id: "new-1" }),
  }));
});

it.each([401, 404, 500])("keeps detail %s owner-safe and retries with a back-to-list action", async (status) => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ memberUid: "private-owner" }, { status }))
    .mockResolvedValueOnce(Response.json({ inquiry: inquiryFixture }));
  render(<InquiryDetail access={{ kind: "member" }} id="new-1" backHref="/mypage/inquiries" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("문의 정보를 불러오지 못했습니다");
  expect(document.body).not.toHaveTextContent("private-owner");
  expect(screen.getByRole("link", { name: "문의 내역으로" })).toHaveAttribute("href", "/mypage/inquiries");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("heading", { name: "문의 제목" })).toBeVisible();
});

it.each(["", "bad/id", " padded", "id\u0000", "x".repeat(129), undefined])("never fetches malformed or missing detail ID %s", (id) => {
  render(<InquiryDetail access={{ kind: "member" }} id={id as string} backHref="/mypage/inquiries" />);
  expect(screen.getByRole("alert")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  expect(tokenMock).not.toHaveBeenCalled();
});

it("rejects non-HTTPS attachments instead of displaying an unsafe image", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ inquiry: {
    ...inquiryFixture,
    attachments: [{ id: "image-1", originalName: "leaf.png", contentType: "image/png", size: 12, readUrl: "http://storage.example.test/leaf" }],
  } }));
  render(<InquiryDetail access={{ kind: "member" }} id="new-1" backHref="/mypage/inquiries" />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("discards a stale detail response when its path changes", async () => {
  const old = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(old.promise).mockResolvedValueOnce(Response.json({ inquiry: { ...inquiryFixture, id: "next", title: "새 문의" } }));
  const { rerender } = render(<InquiryDetail access={{ kind: "member" }} id="old" backHref="/mypage/inquiries" />);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  rerender(<InquiryDetail access={{ kind: "member" }} id="next" backHref="/mypage/inquiries" />);
  await screen.findByText("새 문의");
  await act(async () => old.resolve(Response.json({ inquiry: { ...inquiryFixture, title: "이전 문의" } })));
  expect(screen.queryByText("이전 문의")).not.toBeInTheDocument();
  expect(screen.getByText("새 문의")).toBeVisible();
});

it("allows an inline form without nesting main landmarks", () => {
  render(<main><InquiryForm access={{ kind: "guest", token: "guest" }} orderNumbers={[]} onSuccess={vi.fn()} /></main>);
  expect(screen.getAllByRole("main")).toHaveLength(1);
});
