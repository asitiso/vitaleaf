import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/firebase/id-token", () => ({ getCurrentFirebaseIdToken: tokenMock }));

import { deferred, inquiryFixture, pngFile, uploadResponse } from "../../tests/inquiry-fixtures";
import { InquiryForm } from "./inquiry-form";

const orderNumber = "VL-20260826-ABC123";
const complete = vi.fn();
const createPreview = vi.fn();
const revokePreview = vi.fn();
let signedCount = 0;

function creates() {
  return vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/inquiries");
}

function puts() {
  return vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT");
}

function payloads() {
  return creates().map(([, init]) => JSON.parse(String(init?.body)));
}

function respond(url: RequestInfo | URL, init?: RequestInit) {
  if (String(url) === "/api/inquiries/upload-url") return uploadResponse(++signedCount);
  if (init?.method === "PUT") return new Response(null, { status: 204 });
  if (String(url) === "/api/inquiries") {
    const input = JSON.parse(String(init?.body));
    return Response.json({ ...inquiryFixture, title: input.title, body: input.body });
  }
  throw new Error("Unexpected request");
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("문의 유형"), { target: { value: "other" } });
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "문의 제목" } });
  fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: "문의 내용입니다." } });
}

async function selectFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files } });
  for (const file of files) await screen.findByRole("button", { name: `${file.name} 제거` });
}

function submit() {
  fireEvent.submit(screen.getByRole("button", { name: "문의 등록" }).closest("form")!);
}

beforeEach(() => {
  signedCount = 0;
  complete.mockReset();
  tokenMock.mockReset().mockResolvedValue("member-A-token");
  createPreview.mockReset().mockImplementation((file: File) => `blob:${file.name}`);
  revokePreview.mockReset();
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = createPreview;
    static revokeObjectURL = revokePreview;
  });
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => respond(url, init)));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("creates exactly once on first submit after immediate direct uploads with ordered receipts", async () => {
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  const files = [pngFile("first.png"), pngFile("second.png"), pngFile("third.png")];
  await selectFiles(files);
  submit();
  await waitFor(() => expect(complete).toHaveBeenCalledExactlyOnceWith("new-1"));
  expect(payloads()).toHaveLength(1);
  expect(payloads()[0].uploadReceipts).toEqual(["receipt-1", "receipt-2", "receipt-3"]);
  expect(puts()).toHaveLength(3);
  puts().forEach(([url, init], index) => {
    expect(url).toBe(`https://storage.example.test/put-${index + 1}`);
    expect(init).toMatchObject({ method: "PUT", headers: { "content-type": "image/png" }, body: files[index] });
    expect(init?.body).toBe(files[index]);
  });
  expect(document.body).not.toHaveTextContent("receipt-");
  expect(document.body).not.toHaveTextContent("member-A-token");
});

it("limits PUT concurrency to two, freezes attachments and blocks duplicate submits", async () => {
  const pending = [deferred<Response>(), deferred<Response>(), deferred<Response>()];
  let active = 0;
  let maximum = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (init?.method !== "PUT") return respond(url, init);
    const index = Number(String(url).split("put-")[1]) - 1;
    active += 1;
    maximum = Math.max(maximum, active);
    try { return await pending[index].promise; } finally { active -= 1; }
  });
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  await selectFiles([pngFile("first.png"), pngFile("second.png"), pngFile("third.png")]);
  submit();
  submit();
  await waitFor(() => expect(puts()).toHaveLength(2));
  expect(creates()).toHaveLength(0);
  expect(screen.getByLabelText("이미지 첨부")).toBeDisabled();
  expect(screen.getByRole("button", { name: "first.png 제거" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "first.png 제거" }));
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [pngFile("extra.png")] } });
  await act(async () => pending[1].resolve(new Response(null, { status: 204 })));
  await waitFor(() => expect(puts()).toHaveLength(3));
  expect(creates()).toHaveLength(0);
  await act(async () => pending[2].resolve(new Response(null, { status: 204 })));
  expect(creates()).toHaveLength(0);
  await act(async () => pending[0].resolve(new Response(null, { status: 204 })));
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(maximum).toBe(2);
  expect(payloads()).toHaveLength(1);
  expect(payloads()[0].uploadReceipts).toEqual(["receipt-1", "receipt-2", "receipt-3"]);
  expect(screen.queryByRole("button", { name: "extra.png 제거" })).not.toBeInTheDocument();
});

it.each([false, true])("retains partial success and only refreshes old receipts when aged=%s", async (aged) => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-03T01:00:00.000Z"));
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith("put-2")) return new Response(null, { status: 403 });
    return respond(url, init);
  });
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[orderNumber]} onSuccess={complete} />);
  fillForm();
  fireEvent.change(screen.getByLabelText("관련 주문"), { target: { value: orderNumber } });
  const files = [pngFile("first.png"), pngFile("second.png")];
  await selectFiles(files);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("이미지 업로드");
  expect(screen.getByLabelText("제목")).toHaveValue("문의 제목");
  expect(screen.getByLabelText("문의 내용")).toHaveValue("문의 내용입니다.");
  expect(screen.getByLabelText("관련 주문")).toHaveValue(orderNumber);
  expect(screen.getByLabelText("문의 유형")).toHaveValue("other");
  expect(screen.getAllByRole("img")).toHaveLength(2);
  expect(screen.getByText(/first.png.*업로드 완료/)).toBeVisible();
  expect(screen.getByText(/second.png.*업로드 실패/)).toBeVisible();
  expect(creates()).toHaveLength(0);
  if (aged) clock.mockReturnValue(Date.parse("2026-09-03T01:09:00.000Z"));
  submit();
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(puts().map(([, init]) => init?.body)).toEqual(aged ? [...files, ...files] : [...files, files[1]]);
  expect(payloads()[0].uploadReceipts).toEqual(aged ? ["receipt-3", "receipt-4"] : ["receipt-1", "receipt-3"]);
});

it("invalidates consumed receipts on create failure, retains originals and reuploads on retry", async () => {
  let attempts = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url) === "/api/inquiries" && attempts++ === 0) {
      return Response.json({ detail: "private receipt-1" }, { status: 500 });
    }
    return respond(url, init);
  });
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  const files = [pngFile("first.png"), pngFile("second.png")];
  await selectFiles(files);
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("문의 정보를 처리하지 못했습니다");
  expect(screen.getByLabelText("제목")).toHaveValue("문의 제목");
  expect(screen.getAllByRole("img").map((image) => image.getAttribute("src"))).toEqual(["blob:first.png", "blob:second.png"]);
  expect(screen.queryByText(/업로드 완료/)).not.toBeInTheDocument();
  expect(revokePreview).not.toHaveBeenCalled();
  submit();
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(puts().map(([, init]) => init?.body)).toEqual([...files, ...files]);
  expect(payloads().map((input) => input.uploadReceipts)).toEqual([["receipt-1", "receipt-2"], ["receipt-3", "receipt-4"]]);
  expect(document.body).not.toHaveTextContent("private receipt");
});

it("omits a removed successful upload and revokes previews once on removal and unmount", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).endsWith("put-2")) return new Response(null, { status: 403 });
    return respond(url, init);
  });
  const { unmount } = render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  await selectFiles([pngFile("first.png"), pngFile("second.png")]);
  submit();
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "first.png 제거" }));
  expect(revokePreview).toHaveBeenCalledExactlyOnceWith("blob:first.png");
  submit();
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(payloads()[0].uploadReceipts).toEqual(["receipt-3"]);
  unmount();
  expect(revokePreview.mock.calls).toEqual([["blob:first.png"], ["blob:second.png"]]);
});

it.each([
  ["zero bytes", new File([], "zero.png", { type: "image/png" })],
  ["over five MiB", new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })],
  ["unsupported MIME", new File(["image"], "file.gif", { type: "image/gif" })],
  ["signature mismatch", new File(["MZ executable"], "fake.png", { type: "image/png" })],
])("rejects %s before upload or preview allocation", async (_label, file) => {
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("5MB 이하");
  expect(createPreview).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects a fourth image during rapid consecutive asynchronous selections", async () => {
  const bytes = deferred<ArrayBuffer>();
  const first = pngFile("first.png");
  vi.spyOn(first, "slice").mockReturnValue({ arrayBuffer: () => bytes.promise } as Blob);
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [first, pngFile("second.png")] } });
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [pngFile("third.png"), pngFile("fourth.png")] } });
  await act(async () => bytes.resolve(await pngFile().arrayBuffer()));
  expect(await screen.findByRole("alert")).toHaveTextContent("최대 3장");
  expect(screen.getAllByRole("img").length).toBeLessThanOrEqual(3);
  expect(screen.queryByRole("button", { name: "fourth.png 제거" })).not.toBeInTheDocument();
});

it("reads only the signature and discards late validation after unmount without leaking previews", async () => {
  const bytes = deferred<ArrayBuffer>();
  const late = pngFile("late.png");
  const slice = vi.spyOn(late, "slice").mockReturnValue({ arrayBuffer: () => bytes.promise } as Blob);
  const { unmount } = render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [pngFile("early.png"), late] } });
  await waitFor(() => expect(slice).toHaveBeenCalledWith(0, 12));
  unmount();
  await act(async () => bytes.resolve(await pngFile().arrayBuffer()));
  for (const result of createPreview.mock.results) expect(revokePreview).toHaveBeenCalledWith(result.value);
  expect(fetch).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

it.each(["signing", "put", "create"])("aborts %s and suppresses subsequent effects on unmount", async (phase) => {
  const pending = deferred<Response>();
  let blockedSignal: AbortSignal | null | undefined;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const match = phase === "signing" ? String(url) === "/api/inquiries/upload-url"
      : phase === "put" ? init?.method === "PUT" : String(url) === "/api/inquiries";
    if (match) {
      blockedSignal = init?.signal;
      return pending.promise;
    }
    return respond(url, init);
  });
  const { unmount } = render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  await selectFiles([pngFile()]);
  submit();
  await waitFor(() => expect(blockedSignal).toBeDefined());
  const requestCount = vi.mocked(fetch).mock.calls.length;
  unmount();
  expect(blockedSignal?.aborted).toBe(true);
  await act(async () => pending.resolve(phase === "signing" ? uploadResponse(99)
    : phase === "put" ? new Response(null, { status: 204 }) : Response.json(inquiryFixture)));
  expect(fetch).toHaveBeenCalledTimes(requestCount);
  expect(complete).not.toHaveBeenCalled();
  expect(revokePreview).toHaveBeenCalledExactlyOnceWith("blob:leaf.png");
});

it("shows the locked guest order and rejects a tampered unlocked member order", async () => {
  const { rerender } = render(<InquiryForm access={{ kind: "guest", token: "guest" }} orderNumbers={[]} lockedOrderNumber={orderNumber} onSuccess={complete} />);
  expect(screen.getByLabelText("관련 주문")).toBeDisabled();
  expect(screen.getByLabelText("관련 주문")).toHaveValue(orderNumber);
  rerender(<InquiryForm key="member" access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  const select = screen.getByLabelText("관련 주문");
  const option = document.createElement("option");
  option.value = orderNumber;
  option.text = orderNumber;
  select.append(option);
  fireEvent.change(select, { target: { value: orderNumber } });
  submit();
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("accepts codepoint-bounded multiline content and rejects beyond shared limits", async () => {
  const user = userEvent.setup();
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  await user.clear(screen.getByLabelText("제목"));
  await user.paste("🌿".repeat(100));
  expect(screen.getByLabelText("제목")).toHaveValue("🌿".repeat(100));
  fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: "첫 줄\n\t둘째 줄" } });
  submit();
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(payloads()[0].body).toBe("첫 줄\n\t둘째 줄");
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "🌿".repeat(101) } });
  submit();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(payloads()).toHaveLength(1);
});

it.each([
  ["문의 유형", ""],
  ["제목", "   "],
  ["제목", "제".repeat(101)],
  ["문의 내용", "   "],
  ["문의 내용", "내".repeat(3001)],
])("rejects invalid field %s before any upload or create request", (label, value) => {
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  submit();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not submit while image signature validation is pending", async () => {
  const bytes = deferred<ArrayBuffer>();
  const file = pngFile();
  vi.spyOn(file, "slice").mockReturnValue({ arrayBuffer: () => bytes.promise } as Blob);
  render(<InquiryForm access={{ kind: "member" }} orderNumbers={[]} onSuccess={complete} />);
  fillForm();
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [file] } });
  expect(screen.getByRole("button", { name: "문의 등록" })).toBeDisabled();
  submit();
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => bytes.resolve(await pngFile().arrayBuffer()));
  submit();
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(payloads()[0].uploadReceipts).toEqual(["receipt-1"]);
});
