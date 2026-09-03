import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/inquiries/client", () => ({ createInquiry: createMock, requestInquiryUploadUrl: vi.fn(), putInquiryUpload: vi.fn() }));
import { InquiryForm } from "./inquiry-form";

beforeEach(() => createMock.mockReset().mockResolvedValue({ id: "new-1" }));
it("validates fields and creates a member inquiry with a selected order", async () => {
  const complete = vi.fn(); const user = userEvent.setup();
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={["VL-20260826-ABC123"]} onSuccess={complete} />);
  await user.selectOptions(screen.getByLabelText("문의 유형"), "shipping");
  await user.selectOptions(screen.getByLabelText("관련 주문"), "VL-20260826-ABC123");
  await user.type(screen.getByLabelText("제목"), "배송 일정 문의");
  await user.type(screen.getByLabelText("문의 내용"), "언제 도착하는지 알려주세요.");
  await user.click(screen.getByRole("button", { name: "문의 등록" }));
  await waitFor(() => expect(createMock).toHaveBeenCalledWith({ kind: "member" }, expect.objectContaining({ category: "shipping", orderNumber: "VL-20260826-ABC123", uploadReceipts: [] })));
  expect(complete).toHaveBeenCalledWith("new-1");
});

it("keeps form text when a create failure invalidates an upload receipt", async () => {
  createMock.mockRejectedValueOnce(new Error("failed"));
  const user = userEvent.setup();
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={vi.fn()} />);
  await user.selectOptions(screen.getByLabelText("문의 유형"), "other");
  await user.type(screen.getByLabelText("제목"), "문의 제목");
  await user.type(screen.getByLabelText("문의 내용"), "문의 내용입니다.");
  await user.click(screen.getByRole("button", { name: "문의 등록" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("문의 정보를 처리하지 못했습니다");
  expect(screen.getByLabelText("제목")).toHaveValue("문의 제목");
});

it("rejects a fourth or signature-mismatched image before requesting an upload", async () => {
  const user = userEvent.setup();
  const bad = new File([new Uint8Array([0, 1, 2])], "not-an-image.png", { type: "image/png" });
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [bad] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("JPG, PNG, WebP");
  await user.click(screen.getByRole("button", { name: "문의 등록" }));
  expect(createMock).not.toHaveBeenCalled();
});
