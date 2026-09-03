import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/firebase/id-token", () => ({ getCurrentFirebaseIdToken: tokenMock }));

import { deferred, inquiryFixture, pngFile, uploadResponse } from "../../tests/inquiry-fixtures";
import { GuestInquiryPanel } from "./guest-inquiry-panel";

const orderNumber = "VL-20260826-ABC123";
const access = { kind: "guest" as const, token: "private-guest-access" };
const inquiry = { ...inquiryFixture, ownerType: "guest" as const, orderNumber };
const expired = vi.fn();
const revokePreview = vi.fn();
let signed = 0;

function respond(url: RequestInfo | URL, init?: RequestInit) {
  if (url === "/api/inquiries/list") return Response.json({ inquiries: [inquiry] });
  if (url === "/api/inquiries/detail") return Response.json({ inquiry });
  if (url === "/api/inquiries") return Response.json(inquiry);
  if (url === "/api/inquiries/upload-url") return uploadResponse(++signed);
  if (init?.method === "PUT") return new Response(null, { status: 204 });
  throw new Error("Unexpected request");
}

function requests(path: string) {
  return vi.mocked(fetch).mock.calls.filter(([url]) => url === path);
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("문의 유형"), { target: { value: "shipping" } });
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "배송 확인" } });
  fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: "배송 일정을 알려 주세요." } });
}

async function openForm() {
  await screen.findByRole("button", { name: /문의 제목/ });
  fireEvent.click(screen.getByRole("button", { name: "문의 작성" }));
  fillForm();
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "문의 등록" }));
}

beforeEach(() => {
  signed = 0;
  expired.mockReset();
  tokenMock.mockReset();
  revokePreview.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => respond(url, init)));
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:guest-preview");
    static revokeObjectURL = revokePreview;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("navigates list, locked create, created detail and return inline using only guest access", async () => {
  render(<main><GuestInquiryPanel access={access} orderNumber={orderNumber} onAccessExpired={expired} /></main>);
  await openForm();
  const locked = screen.getByLabelText("관련 주문번호");
  expect(locked).toBeDisabled();
  expect(locked).toHaveValue(orderNumber);
  expect(screen.queryByText("주문과 관련 없는 문의도 남길 수 있습니다.")).not.toBeInTheDocument();
  // Even a synthetic DOM mutation must not change the verified order sent to the server.
  const forged = document.createElement("option");
  forged.value = "VL-20260826-DEF456";
  locked.append(forged);
  fireEvent.change(locked, { target: { value: forged.value } });
  submit();
  expect(await screen.findByRole("heading", { name: "문의 제목" })).toBeVisible();
  expect(requests("/api/inquiries")[0][1]).toMatchObject({
    method: "POST", headers: { "content-type": "application/json", "x-inquiry-access": "private-guest-access" },
    body: JSON.stringify({ category: "shipping", title: "배송 확인", body: "배송 일정을 알려 주세요.", orderNumber, uploadReceipts: [] }),
  });
  expect(requests("/api/inquiries/detail")[0][1]?.body).toBe('{"id":"new-1"}');
  expect(screen.getByRole("heading", { name: "답변 대기" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "문의 내역으로" }));
  expect(await screen.findByRole("button", { name: /문의 제목/ })).toBeVisible();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(tokenMock).not.toHaveBeenCalled();
  expect(expired).not.toHaveBeenCalled();
});

it("opens an answered inquiry with its image and reply, and cancels a draft back to the list", async () => {
  vi.mocked(fetch).mockImplementation(async (url, init) => url === "/api/inquiries/detail"
    ? Response.json({ inquiry: {
      ...inquiry, status: "answered", adminReply: "오늘 출고했습니다.", repliedAt: inquiry.createdAt,
      attachments: [{ id: "image-1", originalName: "leaf.png", contentType: "image/png", size: 12, readUrl: "https://storage.example.test/private-read" }],
    } }) : respond(url, init));
  render(<GuestInquiryPanel access={access} orderNumber={orderNumber} onAccessExpired={expired} />);
  fireEvent.click(await screen.findByRole("button", { name: /문의 제목/ }));
  expect(await screen.findByText("오늘 출고했습니다.")).toBeVisible();
  expect(screen.getByText("답변 완료")).toBeVisible();
  expect(screen.getByRole("img", { name: "문의 첨부 이미지 1" })).toHaveAttribute("src", "https://storage.example.test/private-read");
  fireEvent.click(screen.getByRole("button", { name: "문의 내역으로" }));
  await openForm();
  fireEvent.click(screen.getByRole("button", { name: "문의 내역으로" }));
  expect(await screen.findByRole("button", { name: /문의 제목/ })).toBeVisible();
  expect(screen.queryByLabelText("제목")).not.toBeInTheDocument();
  expect(requests("/api/inquiries")).toHaveLength(0);
});

it.each(["list", "detail", "create", "signing"])("reports guest API 401 at %s as expired access", async (phase) => {
  const blocked = phase === "list" ? "/api/inquiries/list" : phase === "detail" ? "/api/inquiries/detail"
    : phase === "create" ? "/api/inquiries" : "/api/inquiries/upload-url";
  vi.mocked(fetch).mockImplementation(async (url, init) => url === blocked
    ? new Response(null, { status: 401 }) : respond(url, init));
  render(<GuestInquiryPanel access={access} orderNumber={orderNumber} onAccessExpired={expired} />);
  if (phase === "detail") fireEvent.click(await screen.findByRole("button", { name: /문의 제목/ }));
  if (phase === "create" || phase === "signing") {
    await openForm();
    if (phase === "signing") {
      fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [pngFile()] } });
      await screen.findByRole("button", { name: "leaf.png 제거" });
    }
    submit();
  }
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
  if (phase === "signing") expect(requests("/api/inquiries")).toHaveLength(0);
});

it.each(["not-found", "unavailable", "network"])("retains guest access and retry on ordinary detail %s", async (failure) => {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === "/api/inquiries/detail") {
      if (failure === "network") throw new TypeError("offline");
      return new Response(null, { status: failure === "not-found" ? 404 : 503 });
    }
    return respond(url, init);
  });
  render(<GuestInquiryPanel access={access} orderNumber={orderNumber} onAccessExpired={expired} />);
  fireEvent.click(await screen.findByRole("button", { name: /문의 제목/ }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(expired).not.toHaveBeenCalled();
  vi.mocked(fetch).mockImplementation(async (url, init) => respond(url, init));
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("heading", { name: "문의 제목" })).toBeVisible();
});

it("reuses shared direct upload retry without expiring access for Storage PUT 401 or persisting private values", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem");
  const push = vi.spyOn(history, "pushState");
  const replace = vi.spyOn(history, "replaceState");
  const log = vi.spyOn(console, "log");
  let puts = 0;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (init?.method === "PUT" && puts++ === 0) return new Response(null, { status: 401 });
    return respond(url, init);
  });
  render(<GuestInquiryPanel access={access} orderNumber={orderNumber} onAccessExpired={expired} />);
  await openForm();
  const file = pngFile();
  fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [file] } });
  await screen.findByRole("button", { name: "leaf.png 제거" });
  submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("이미지 업로드");
  expect(screen.getByLabelText("제목")).toHaveValue("배송 확인");
  expect(screen.getByLabelText("관련 주문번호")).toHaveValue(orderNumber);
  expect(expired).not.toHaveBeenCalled();
  submit();
  expect(await screen.findByRole("heading", { name: "문의 제목" })).toBeVisible();
  const putCalls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT");
  expect(putCalls).toHaveLength(2);
  for (const [, init] of putCalls) {
    expect(init?.body).toBe(file);
    expect(init?.headers).toEqual({ "content-type": "image/png" });
  }
  expect(JSON.parse(String(requests("/api/inquiries")[0][1]?.body)).uploadReceipts).toEqual(["receipt-2"]);
  expect(revokePreview).toHaveBeenCalledWith("blob:guest-preview");
  expect(document.body.innerHTML).not.toContain("private-guest-access");
  expect(document.body.innerHTML).not.toContain("receipt-");
  expect(document.body.innerHTML).not.toContain("https://storage.example.test/put-");
  expect(storage).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it.each(["list", "detail", "create", "signing", "put"])("aborts old %s on session replacement and discards its late response", async (phase) => {
  const pending = deferred<Response>();
  const newOrder = "VL-20260826-DEF456";
  const newInquiry = { ...inquiry, orderNumber: newOrder, title: "다른 주문 문의" };
  let signal: AbortSignal | null | undefined;
  let started = false;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const match = phase === "list" ? url === "/api/inquiries/list" : phase === "detail" ? url === "/api/inquiries/detail"
      : phase === "create" ? url === "/api/inquiries" : phase === "signing" ? url === "/api/inquiries/upload-url" : init?.method === "PUT";
    if (match && !started) {
      started = true;
      signal = init?.signal;
      return pending.promise;
    }
    if (new Headers(init?.headers).get("x-inquiry-access") === "guest-B") return Response.json({ inquiries: [newInquiry] });
    return respond(url, init);
  });
  const { rerender } = render(<GuestInquiryPanel access={access} orderNumber={orderNumber} onAccessExpired={expired} />);
  if (phase === "detail") fireEvent.click(await screen.findByRole("button", { name: /문의 제목/ }));
  if (["create", "signing", "put"].includes(phase)) {
    await openForm();
    if (phase !== "create") {
      fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [pngFile()] } });
      await screen.findByRole("button", { name: "leaf.png 제거" });
    }
    submit();
  }
  await waitFor(() => expect(signal).toBeDefined());
  rerender(<GuestInquiryPanel access={{ kind: "guest", token: "guest-B" }} orderNumber={newOrder} onAccessExpired={expired} />);
  expect(screen.queryByLabelText("제목")).not.toBeInTheDocument();
  expect(signal?.aborted).toBe(true);
  expect(await screen.findByRole("button", { name: /다른 주문 문의/ })).toBeVisible();
  const count = vi.mocked(fetch).mock.calls.length;
  const late = phase === "list" ? Response.json({ inquiries: [inquiry] }) : phase === "detail" ? Response.json({ inquiry })
    : phase === "signing" ? uploadResponse(9) : phase === "put" ? new Response(null, { status: 204 }) : Response.json(inquiry);
  await act(async () => pending.resolve(late));
  expect(fetch).toHaveBeenCalledTimes(count);
  expect(screen.queryByRole("heading", { name: "문의 제목" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /다른 주문 문의/ })).toBeVisible();
  expect(expired).not.toHaveBeenCalled();
});

it("keeps the inline guest form full-width and readable with keyboard focus on its return action", async () => {
  const css = await readFile(resolve(process.cwd(), "app/globals.css"), "utf8");
  const style = document.createElement("style");
  style.textContent = css;
  try {
    render(<section className="guest-order-lookup"><GuestInquiryPanel access={access} orderNumber={orderNumber} onAccessExpired={expired} /></section>);
    await openForm();
    const back = screen.getByRole("button", { name: "문의 내역으로" });
    fireEvent.keyDown(document.body, { key: "Tab" });
    back.focus();
    expect(back.matches(":focus-visible")).toBe(true);
    // Attach after focusing: jsdom caches styles read by earlier role queries.
    document.head.append(style);
    expect(getComputedStyle(back).outline).toContain("3px");
    const panel = screen.getByRole("region", { name: "이 주문의 1:1 문의" });
    expect(getComputedStyle(panel).minWidth).toBe("0px");
    expect(getComputedStyle(screen.getByLabelText("제목").closest("label")!).fontSize).toBe("16px");
    expect(getComputedStyle(screen.getByLabelText("제목").closest("form")!).padding).toBe("0px");
    for (const control of panel.querySelectorAll("button, input, select, textarea")) {
      expect(parseFloat(getComputedStyle(control).minHeight)).toBeGreaterThanOrEqual(44);
    }
  } finally {
    style.remove();
  }
});
