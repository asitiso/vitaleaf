import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const getMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/inquiries/client", () => ({ getInquiry: getMock }));
import { InquiryDetail } from "./inquiry-detail";

const inquiry = { id: "i-1", category: "product", title: "성분 문의", body: "답변 부탁드립니다.", orderNumber: null, status: "answered", createdAt: "2026-09-02T01:02:03.000Z", attachments: [{ id: "a-1", originalName: "leaf.png", contentType: "image/png", size: 1, readUrl: "https://storage.example.test/leaf" }], adminReply: "확인했습니다.", repliedAt: "2026-09-02T02:02:03.000Z" };
beforeEach(() => getMock.mockReset().mockResolvedValue(inquiry));

it("shows an answered inquiry and only the authorized HTTPS image", async () => {
  render(<InquiryDetail access={{ kind: "member" }} id="i-1" backHref="/mypage/inquiries" />);
  expect(await screen.findByText("확인했습니다.")).toBeVisible();
  expect(screen.getByRole("img", { name: "문의 첨부 이미지 1" })).toHaveAttribute("src", inquiry.attachments[0].readUrl);
  expect(screen.getByText("답변 완료")).toBeVisible();
});

it("gives an owner-safe retry error for invalid IDs without requesting", () => {
  render(<InquiryDetail access={{ kind: "member" }} id="bad/id" backHref="/mypage/inquiries" />);
  expect(getMock).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("문의 정보를 불러오지 못했습니다");
});
