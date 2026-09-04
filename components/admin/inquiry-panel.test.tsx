import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { AdminInquiryClient } from "../../lib/inquiries/admin-client";
import type { InquiryPublic } from "../../lib/inquiries/types";
import { deferred, inquiryFixture } from "../../tests/inquiry-fixtures";
import { InquiryPanel } from "./inquiry-panel";

const row = (overrides: Partial<InquiryPublic> = {}): InquiryPublic => ({ ...inquiryFixture, id: "inquiry-1", title: "배송이 궁금해요", category: "shipping", orderNumber: "VL-20260826-ABC123", ...overrides });
const client = (overrides: Partial<AdminInquiryClient> = {}): AdminInquiryClient => ({
  count: vi.fn().mockResolvedValue(2),
  list: vi.fn().mockResolvedValue([row()]),
  get: vi.fn().mockResolvedValue(row({ attachments: [{ id: "image-1", originalName: "사진.png", contentType: "image/png", size: 20, readUrl: "https://storage.example.test/signed" }] })),
  reply: vi.fn().mockResolvedValue(row({ status: "answered", adminReply: "확인했습니다.", repliedAt: inquiryFixture.createdAt })),
  delete: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

it("loads a filterable list and opens a safe detail with owner, order, body, and image", async () => {
  const api = client();
  const user = userEvent.setup();
  render(<InquiryPanel client={api} onWaitingCountChange={vi.fn()} />);
  expect(await screen.findByRole("button", { name: /배송이 궁금해요/u })).toBeVisible();
  expect(api.list).toHaveBeenCalledWith({ status: null, category: null, pageSize: 20, cursor: null }, expect.any(AbortSignal));
  await user.selectOptions(screen.getByLabelText("답변 상태"), "waiting");
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ status: "waiting", category: null, pageSize: 20, cursor: null }, expect.any(AbortSignal)));
  await user.selectOptions(screen.getByLabelText("문의 유형"), "shipping");
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ status: "waiting", category: "shipping", pageSize: 20, cursor: null }, expect.any(AbortSignal)));
  await user.click(screen.getByRole("button", { name: /배송이 궁금해요/u }));
  expect(await screen.findByRole("heading", { name: "배송이 궁금해요" })).toBeVisible();
  expect(screen.getByText(/회원 문의/u)).toBeVisible();
  expect(screen.getByText(/VL-20260826-ABC123/u)).toBeVisible();
  expect(screen.getByText("문의 내용입니다.")).toBeVisible();
  expect(screen.getByRole("img", { name: "문의 첨부 이미지 1" })).toHaveAttribute("src", "https://storage.example.test/signed");
});

it("shows loading, empty, error/retry, and cursor pagination states", async () => {
  const first = deferred<InquiryPublic[]>();
  const list = vi.fn().mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => row({ id: "page-" + index, title: "문의 " + index }))).mockResolvedValueOnce([row({ id: "older", title: "이전 문의" })]);
  const api = client({ list });
  const user = userEvent.setup();
  const view = render(<InquiryPanel client={api} onWaitingCountChange={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  first.resolve([]);
  expect(await screen.findByText("조건에 맞는 문의가 없습니다.")).toBeVisible();
  await user.selectOptions(screen.getByLabelText("문의 유형"), "other");
  expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못했습니다");
  await user.click(screen.getByRole("button", { name: "문의 목록 다시 불러오기" }));
  expect(await screen.findByRole("button", { name: /문의 19/u })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "다음 페이지" }));
  await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "page-19" }), expect.any(AbortSignal)));
  expect(await screen.findByRole("button", { name: /이전 문의/u })).toBeVisible();
  expect(screen.getByRole("button", { name: "이전 페이지" })).toBeEnabled();
  view.unmount();
});

it("prevents stale filter and detail responses from replacing current data", async () => {
  const oldList = deferred<InquiryPublic[]>();
  const oldDetail = deferred<InquiryPublic>();
  const list = vi.fn().mockResolvedValueOnce([row()]).mockReturnValueOnce(oldList.promise).mockResolvedValueOnce([row({ id: "fresh", title: "최신 문의" })]);
  const get = vi.fn().mockReturnValueOnce(oldDetail.promise).mockResolvedValueOnce(row({ id: "fresh", title: "최신 문의" }));
  const user = userEvent.setup();
  render(<InquiryPanel client={client({ list, get })} onWaitingCountChange={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: /배송이 궁금해요/u }));
  await user.selectOptions(screen.getByLabelText("답변 상태"), "waiting");
  await user.selectOptions(screen.getByLabelText("문의 유형"), "shipping");
  expect(await screen.findByRole("button", { name: /최신 문의/u })).toBeVisible();
  await user.click(screen.getByRole("button", { name: /최신 문의/u }));
  expect(await screen.findByRole("heading", { name: "최신 문의" })).toBeVisible();
  oldList.resolve([row({ id: "old", title: "오래된 문의" })]);
  oldDetail.resolve(row({ title: "오래된 상세" }));
  await act(async () => undefined);
  expect(screen.queryByText("오래된 문의")).not.toBeInTheDocument();
  expect(screen.queryByText("오래된 상세")).not.toBeInTheDocument();
});

it("saves one reply, retains draft on failure, and refreshes list/count on success", async () => {
  const reply = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(row({ status: "answered", adminReply: "확인 후 안내드립니다.", repliedAt: inquiryFixture.createdAt }));
  const onCount = vi.fn();
  const api = client({ reply });
  const user = userEvent.setup();
  render(<InquiryPanel client={api} onWaitingCountChange={onCount} />);
  await user.click(await screen.findByRole("button", { name: /배송이 궁금해요/u }));
  await screen.findByRole("heading", { name: "배송이 궁금해요" });
  await user.type(screen.getByLabelText("관리자 답변"), "확인 후 안내드립니다.");
  await user.click(screen.getByRole("button", { name: "답변 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
  expect(screen.getByLabelText("관리자 답변")).toHaveValue("확인 후 안내드립니다.");
  await user.click(screen.getByRole("button", { name: "답변 저장" }));
  await waitFor(() => expect(reply).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("status")).toHaveTextContent("답변을 저장했습니다");
  expect(api.list).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(api.count).toHaveBeenCalledTimes(1);
  expect(onCount).toHaveBeenCalledWith(2);
});

it("does not report a successful reply as failed when only the badge refresh fails", async () => {
  const api = client({
    reply: vi.fn().mockResolvedValue(row({ status: "answered", adminReply: "저장된 답변", repliedAt: inquiryFixture.createdAt })),
    count: vi.fn().mockRejectedValue(new Error("count failed")),
  });
  const user = userEvent.setup();
  render(<InquiryPanel client={api} onWaitingCountChange={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: /배송이 궁금해요/u }));
  await screen.findByRole("heading", { name: "배송이 궁금해요" });
  await user.type(screen.getByLabelText("관리자 답변"), "저장된 답변");
  await user.click(screen.getByRole("button", { name: "답변 저장" }));
  expect(await screen.findByRole("status")).toHaveTextContent("답변을 저장했습니다");
  expect(screen.queryByText(/답변을 저장하지 못했습니다/u)).not.toBeInTheDocument();
});

it("blocks duplicate reply and delete submissions", async () => {
  const saving = deferred<InquiryPublic>();
  const deleting = deferred<void>();
  const api = client({ reply: vi.fn(() => saving.promise), delete: vi.fn(() => deleting.promise) });
  const user = userEvent.setup();
  render(<InquiryPanel client={api} onWaitingCountChange={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: /배송이 궁금해요/u }));
  await screen.findByRole("heading", { name: "배송이 궁금해요" });
  await user.type(screen.getByLabelText("관리자 답변"), "답변");
  const save = screen.getByRole("button", { name: "답변 저장" });
  await user.click(save);
  expect(save).toBeDisabled();
  expect(api.reply).toHaveBeenCalledTimes(1);
  act(() => saving.reject(new Error("fail")));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "문의 삭제" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제 확인" }));
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제 중" })).toBeDisabled();
  expect(api.delete).toHaveBeenCalledTimes(1);
  act(() => deleting.reject(new Error("fail")));
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeVisible());
});

it("uses a non-destructive focused confirmation and handles cancel, failure, and success", async () => {
  const remove = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(undefined);
  const api = client({ delete: remove });
  const onCount = vi.fn();
  const user = userEvent.setup();
  render(<InquiryPanel client={api} onWaitingCountChange={onCount} />);
  await user.click(await screen.findByRole("button", { name: /배송이 궁금해요/u }));
  await screen.findByRole("heading", { name: "배송이 궁금해요" });
  await user.click(screen.getByRole("button", { name: "문의 삭제" }));
  const dialog = screen.getByRole("dialog", { name: "문의 삭제 확인" });
  expect(within(dialog).getByText(/배송이 궁금해요/u)).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "취소" })).toHaveFocus();
  await user.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "문의 삭제" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제 확인" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("삭제하지 못했습니다");
  expect(screen.getByRole("heading", { name: "배송이 궁금해요" })).toBeVisible();
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제 확인" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("heading", { name: "배송이 궁금해요" })).not.toBeInTheDocument();
  expect(api.list).toHaveBeenCalledTimes(2);
  expect(api.count).toHaveBeenCalledTimes(1);
  expect(onCount).toHaveBeenCalledWith(2);
});

it("clears detail and draft and cancels stale work when the authorization generation changes", async () => {
  const pendingReply = deferred<InquiryPublic>();
  const api = client({ reply: vi.fn(() => pendingReply.promise) });
  const user = userEvent.setup();
  const view = render(<InquiryPanel key={1} client={api} onWaitingCountChange={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: /배송이 궁금해요/u }));
  await screen.findByRole("heading", { name: "배송이 궁금해요" });
  await user.type(screen.getByLabelText("관리자 답변"), "이전 관리자 초안");
  await user.click(screen.getByRole("button", { name: "답변 저장" }));
  const oldSignal = vi.mocked(api.reply).mock.calls[0]![2]!;
  view.rerender(<InquiryPanel key={2} client={client({ list: vi.fn().mockResolvedValue([]) })} onWaitingCountChange={vi.fn()} />);
  expect(oldSignal.aborted).toBe(true);
  expect(await screen.findByText("조건에 맞는 문의가 없습니다.")).toBeVisible();
  expect(screen.queryByText("이전 관리자 초안")).not.toBeInTheDocument();
  pendingReply.resolve(row({ status: "answered", adminReply: "이전 관리자 초안", repliedAt: inquiryFixture.createdAt }));
  await act(async () => undefined);
  expect(screen.queryByText("답변을 저장했습니다.")).not.toBeInTheDocument();
});
