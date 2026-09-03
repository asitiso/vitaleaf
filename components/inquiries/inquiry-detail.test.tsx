import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase/id-token", () => ({
  getCurrentFirebaseIdToken: vi.fn(async () => "member-token"),
}));

import { inquiryFixture } from "../../tests/inquiry-fixtures";
import { InquiryDetail } from "./inquiry-detail";

const inquiry = {
  ...inquiryFixture,
  status: "answered",
  adminReply: "확인했습니다.",
  repliedAt: inquiryFixture.createdAt,
  attachments: [{
    id: "a-1",
    originalName: "leaf.png",
    contentType: "image/png",
    size: 12,
    readUrl: "https://storage.example.test/leaf",
  }],
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => Response.json({ inquiry }))));
afterEach(() => vi.unstubAllGlobals());

it("shows an answered inquiry and only the authorized HTTPS image", async () => {
  render(<InquiryDetail access={{ kind: "member" }} id="i-1" backHref="/mypage/inquiries" />);
  expect(await screen.findByText("확인했습니다.")).toBeVisible();
  expect(screen.getByRole("img", { name: "문의 첨부 이미지 1" })).toHaveAttribute("src", inquiry.attachments[0].readUrl);
  expect(screen.getByText("답변 완료")).toBeVisible();
});

it("gives an owner-safe retry error for invalid IDs without requesting", () => {
  render(<InquiryDetail access={{ kind: "member" }} id="bad/id" backHref="/mypage/inquiries" />);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("문의 정보를 불러오지 못했습니다");
});
