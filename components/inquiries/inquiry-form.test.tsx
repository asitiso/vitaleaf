import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/firebase/id-token", () => ({ getCurrentFirebaseIdToken: tokenMock }));

import { inquiryFixture, pngFile, uploadResponse } from "../../tests/inquiry-fixtures";
import { InquiryForm } from "./inquiry-form";

beforeEach(() => {
  tokenMock.mockReset().mockResolvedValue("member-token");
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = () => "blob:leaf";
    static revokeObjectURL = vi.fn();
  });
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === "/api/inquiries/upload-url") return uploadResponse(1);
    if (init?.method === "PUT") return new Response(null, { status: 204 });
    return Response.json(inquiryFixture);
  }));
});

afterEach(() => vi.unstubAllGlobals());

it("validates fields and creates a member inquiry with a selected order", async () => {
  const complete = vi.fn();
  const user = userEvent.setup();
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={["VL-20260826-ABC123"]} onSuccess={complete} />);
  await user.click(screen.getByRole("button", { name: "문의 등록" }));
  expect(screen.getByRole("alert")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("문의 유형"), "shipping");
  await user.selectOptions(screen.getByLabelText("관련 주문"), "VL-20260826-ABC123");
  await user.type(screen.getByLabelText("제목"), "배송 일정 문의");
  await user.type(screen.getByLabelText("문의 내용"), "언제 도착하는지 알려주세요.");
  await user.click(screen.getByRole("button", { name: "문의 등록" }));
  await waitFor(() => expect(complete).toHaveBeenCalledWith("new-1"));
  expect(fetch).toHaveBeenCalledWith("/api/inquiries", expect.objectContaining({
    body: JSON.stringify({
      category: "shipping",
      title: "배송 일정 문의",
      body: "언제 도착하는지 알려주세요.",
      orderNumber: "VL-20260826-ABC123",
      uploadReceipts: [],
    }),
  }));
});

it("keeps form text and the selected image after a create failure", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url) === "/api/inquiries/upload-url") return uploadResponse(1);
    if (init?.method === "PUT") return new Response(null, { status: 204 });
    return new Response(null, { status: 500 });
  });
  const user = userEvent.setup();
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={vi.fn()} />);
  await user.selectOptions(screen.getByLabelText("문의 유형"), "other");
  await user.type(screen.getByLabelText("제목"), "문의 제목");
  await user.type(screen.getByLabelText("문의 내용"), "문의 내용입니다.");
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [pngFile()] } });
  await screen.findByRole("button", { name: "leaf.png 제거" });
  await user.click(screen.getByRole("button", { name: "문의 등록" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("문의 정보를 처리하지 못했습니다");
  expect(screen.getByLabelText("제목")).toHaveValue("문의 제목");
  expect(screen.getByRole("img")).toHaveAttribute("src", "blob:leaf");
  expect(screen.getByText(/업로드 대기/)).toBeVisible();
});

it("creates on the first submit after an immediately resolved direct upload", async () => {
  const user = userEvent.setup();
  const complete = vi.fn();
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  await user.selectOptions(screen.getByLabelText("문의 유형"), "other");
  await user.type(screen.getByLabelText("제목"), "첫 업로드 문의");
  await user.type(screen.getByLabelText("문의 내용"), "첫 클릭에서 등록되어야 합니다.");
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [pngFile()] } });
  await screen.findByRole("button", { name: "leaf.png 제거" });
  await user.click(screen.getByRole("button", { name: "문의 등록" }));
  await waitFor(() => expect(complete).toHaveBeenCalledExactlyOnceWith("new-1"));
  const creates = vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/inquiries");
  expect(creates).toHaveLength(1);
  expect(JSON.parse(String(creates[0][1]?.body)).uploadReceipts).toEqual(["receipt-1"]);
});

it("rejects a signature-mismatched image before requesting an upload", async () => {
  const bad = new File([new Uint8Array([0, 1, 2])], "not-an-image.png", { type: "image/png" });
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [bad] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("JPG, PNG, WebP");
  expect(fetch).not.toHaveBeenCalled();
});
