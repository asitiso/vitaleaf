import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const listMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/inquiries/client", () => ({ listInquiries: listMock }));
import { InquiryList } from "./inquiry-list";

const rows = [{ id: "i-1", category: "shipping", title: "배송 일정", orderNumber: "VL-20260826-ABC123", status: "waiting", createdAt: "2026-09-02T01:02:03.000Z" }, { id: "i-2", category: "product", title: "성분 문의", orderNumber: null, status: "answered", createdAt: "2026-09-01T01:02:03.000Z" }];
beforeEach(() => listMock.mockReset().mockResolvedValue(rows));

it("loads a private list with waiting and answered links", async () => {
  render(<InquiryList access={{ kind: "member" }} createHref="/mypage/inquiries/new" detailHref={(id) => `/mypage/inquiries/${encodeURIComponent(id)}`} />);
  expect(screen.getByRole("status")).toHaveTextContent("문의 내역을 불러오는 중");
  expect(await screen.findByRole("link", { name: /배송 일정/ })).toHaveAttribute("href", "/mypage/inquiries/i-1");
  expect(screen.getByText("답변 대기")).toBeVisible();
  expect(screen.getByText("답변 완료")).toBeVisible();
  expect(screen.getByText("VL-20260826-ABC123")).toBeVisible();
});

it("shows retry after an error and ignores an old access response", async () => {
  let resolveOld!: (value: typeof rows) => void;
  const old = new Promise<typeof rows>((resolve) => { resolveOld = resolve; });
  listMock.mockReturnValueOnce(old).mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce([]);
  const user = userEvent.setup();
  const { rerender } = render(<InquiryList access={{ kind: "member" }} createHref="/mypage/inquiries/new" detailHref={(id) => `/mypage/inquiries/${id}`} />);
  rerender(<InquiryList access={{ kind: "guest", token: "new-access" }} createHref="/mypage/inquiries/new" detailHref={(id) => `/mypage/inquiries/${id}`} />);
  resolveOld(rows);
  expect(await screen.findByRole("alert")).toHaveTextContent("문의 내역을 불러오지 못했습니다");
  expect(screen.queryByText("배송 일정")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "문의 내역 다시 불러오기" }));
  expect(await screen.findByText("등록한 문의가 없습니다.")).toBeVisible();
});
