import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { tokenMock, ordersMock, pushMock } = vi.hoisted(() => ({
  tokenMock: vi.fn(), ordersMock: vi.fn(), pushMock: vi.fn(),
}));
vi.mock("../../lib/firebase/id-token", () => ({ getCurrentFirebaseIdToken: tokenMock }));
vi.mock("../../lib/firebase/member-orders", () => ({ listMemberOrders: ordersMock }));
vi.mock("../../lib/firebase/member-auth", () => ({ getMemberAuthErrorMessage: () => "인증 상태를 확인하지 못했습니다." }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AuthProvider, useAuth } from "../../features/auth/auth-context";
import type { MemberAuthAdapter, MemberIdentity } from "../../lib/firebase/member-auth";
import { deferred, inquiryFixture, pngFile, uploadResponse } from "../../tests/inquiry-fixtures";
import { MemberInquiryDetailPage, MemberInquiryFormPage, MemberInquiryListPage } from "./member-inquiry-pages";

let emit: (identity: MemberIdentity | null) => void;
let fail: (error: unknown) => void;
let uid = "A";
const observe = vi.fn();
const revoked = vi.fn();
const privateFrames: string[] = [];
const adapter: MemberAuthAdapter = {
  observe,
  create: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), reset: vi.fn(), verify: vi.fn(), removeCurrent: vi.fn(),
};

function PrivacyProbe() {
  const { user } = useAuth();
  useLayoutEffect(() => {
    if (user?.uid === "B") privateFrames.push(document.body.textContent ?? "");
  }, [user]);
  return null;
}

function mount(page: ReactNode) {
  return render(<AuthProvider adapter={adapter}>{page}<PrivacyProbe /></AuthProvider>);
}

async function signIn(nextUid: string) {
  uid = nextUid;
  await act(async () => emit({ uid, email: uid + "@example.test", emailVerified: true }));
}

function fill() {
  fireEvent.change(screen.getByLabelText("문의 유형"), { target: { value: "other" } });
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "A 비공개 초안" } });
  fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: "A 비공개 내용" } });
}

beforeEach(() => {
  uid = "A";
  privateFrames.length = 0;
  revoked.mockReset();
  pushMock.mockReset();
  tokenMock.mockReset().mockImplementation(async () => uid + "-token");
  ordersMock.mockReset().mockResolvedValue([]);
  observe.mockReset().mockImplementation((next, error) => {
    emit = next;
    fail = error;
    return vi.fn();
  });
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = () => "blob:private";
    static revokeObjectURL = revoked;
  });
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    if (String(url) === "/api/inquiries/list") return Response.json({ inquiries: [inquiryFixture] });
    if (String(url) === "/api/inquiries/detail") return Response.json({ inquiry: inquiryFixture });
    if (String(url) === "/api/inquiries/upload-url") return uploadResponse(1);
    if (String(url).startsWith("https:")) return new Response(null, { status: 204 });
    return Response.json(inquiryFixture);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  ["/mypage/inquiries", <MemberInquiryListPage key="list" />],
  ["/mypage/inquiries/new", <MemberInquiryFormPage key="form" />],
  ["/mypage/inquiries/hello%20%ED%95%9C%EA%B8%80", <MemberInquiryDetailPage key="detail" id="hello 한글" />],
])("gates %s before any request and preserves its exact login return path", async (path, page) => {
  mount(page);
  expect(screen.getByRole("status")).toHaveTextContent("로그인 상태");
  expect(fetch).not.toHaveBeenCalled();
  expect(ordersMock).not.toHaveBeenCalled();
  await act(async () => fail(new Error("private auth failure")));
  expect(await screen.findByRole("alert")).toHaveTextContent("인증 상태");
  fireEvent.click(screen.getByRole("button", { name: "인증 다시 확인" }));
  expect(observe).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent("로그인 상태");
  await act(async () => emit(null));
  expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?next=" + encodeURIComponent(path));
  expect(fetch).not.toHaveBeenCalled();
  expect(ordersMock).not.toHaveBeenCalled();
  expect(tokenMock).not.toHaveBeenCalled();
});

it.each(["list", "detail"])("removes A's rendered %s in the B commit, loads B and ignores stable UID rerenders", async (kind) => {
  const next = deferred<Response>();
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(kind === "list"
    ? { inquiries: [{ ...inquiryFixture, title: "A 비공개 문의" }] }
    : { inquiry: { ...inquiryFixture, title: "A 비공개 문의" } })).mockReturnValueOnce(next.promise);
  mount(kind === "list" ? <MemberInquiryListPage /> : <MemberInquiryDetailPage id="new-1" />);
  await signIn("A");
  await screen.findByText("A 비공개 문의");
  await signIn("A");
  expect(fetch).toHaveBeenCalledTimes(1);
  await signIn("B");
  expect(privateFrames.every((frame) => !frame.includes("A 비공개"))).toBe(true);
  expect(screen.queryByText("A 비공개 문의")).not.toBeInTheDocument();
  await act(async () => next.resolve(Response.json(kind === "list"
    ? { inquiries: [{ ...inquiryFixture, title: "B 문의" }] }
    : { inquiry: { ...inquiryFixture, title: "B 문의" } })));
  expect(await screen.findByText("B 문의")).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(["list", "detail"])("ignores a late A %s response after B signs in", async (kind) => {
  const old = deferred<Response>();
  vi.mocked(fetch).mockReturnValueOnce(old.promise).mockResolvedValueOnce(Response.json(kind === "list"
    ? { inquiries: [{ ...inquiryFixture, title: "B 문의" }] }
    : { inquiry: { ...inquiryFixture, title: "B 문의" } }));
  mount(kind === "list" ? <MemberInquiryListPage /> : <MemberInquiryDetailPage id="new-1" />);
  await signIn("A");
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await signIn("B");
  await screen.findByText("B 문의");
  await act(async () => old.resolve(Response.json(kind === "list"
    ? { inquiries: [{ ...inquiryFixture, title: "A 늦은 비공개" }] }
    : { inquiry: { ...inquiryFixture, title: "A 늦은 비공개" } })));
  expect(screen.queryByText("A 늦은 비공개")).not.toBeInTheDocument();
  expect(screen.getByText("B 문의")).toBeVisible();
});

it.each(["validation", "upload", "token", "create"])("clears A's draft on B sign-in during %s and never navigates or submits it as B", async (phase) => {
  const pending = deferred<Response>();
  const bytes = deferred<ArrayBuffer>();
  const token = deferred<string>();
  const file = pngFile();
  let blocked = false;
  if (phase === "validation") vi.spyOn(file, "slice").mockReturnValue({ arrayBuffer: () => bytes.promise } as Blob);
  const defaultFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if ((phase === "upload" && init?.method === "PUT") || (phase === "create" && String(url) === "/api/inquiries")) {
      blocked = true;
      return pending.promise;
    }
    return defaultFetch(url, init);
  });
  mount(<MemberInquiryFormPage />);
  await signIn("A");
  await screen.findByLabelText("제목");
  fill();
  if (phase !== "token") {
    fireEvent.change(screen.getByLabelText("이미지 첨부"), { target: { files: [file] } });
    if (phase !== "validation") await screen.findByRole("img");
  }
  if (phase === "token") tokenMock.mockReturnValueOnce(token.promise);
  if (phase !== "validation") fireEvent.click(screen.getByRole("button", { name: "문의 등록" }));
  if (phase === "upload" || phase === "create") await waitFor(() => expect(blocked).toBe(true));
  if (phase === "token") await waitFor(() => expect(tokenMock).toHaveBeenCalled());
  await signIn("B");
  expect(privateFrames.every((frame) => !frame.includes("A 비공개"))).toBe(true);
  expect(await screen.findByLabelText("제목")).toHaveValue("");
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  await act(async () => {
    bytes.resolve(await pngFile().arrayBuffer());
    pending.resolve(phase === "create" ? Response.json(inquiryFixture) : new Response(null, { status: 204 }));
    token.resolve("B-token");
  });
  expect(pushMock).not.toHaveBeenCalled();
  const createRequests = vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/inquiries");
  expect(createRequests).toHaveLength(phase === "create" ? 1 : 0);
  for (const [, init] of createRequests) expect(init?.headers).toMatchObject({ authorization: "Bearer A-token" });
  if (phase === "upload" || phase === "create") expect(revoked).toHaveBeenCalledWith("blob:private");
  expect(screen.getByLabelText("제목")).toHaveValue("");
});

it("retries order loading, offers only valid member orders and navigates on success", async () => {
  ordersMock.mockRejectedValueOnce(new Error("private order error")).mockResolvedValueOnce([
    { orderNumber: "invalid" }, { orderNumber: "VL-20260826-ABC123" },
  ]);
  mount(<MemberInquiryFormPage />);
  await signIn("A");
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "주문 내역 다시 불러오기" }));
  await screen.findByLabelText("제목");
  expect(screen.queryByRole("option", { name: "invalid" })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "VL-20260826-ABC123" })).toBeVisible();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "문의 등록" }));
  await waitFor(() => expect(pushMock).toHaveBeenCalledExactlyOnceWith("/mypage/inquiries/new-1"));
});
