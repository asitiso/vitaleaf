import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase/id-token", () => ({
  getCurrentFirebaseIdToken: vi.fn(async () => "member-token"),
}));

import { deferred, inquiryFixture } from "../../tests/inquiry-fixtures";
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
