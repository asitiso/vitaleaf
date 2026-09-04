import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deferred, inquiryFixture } from "../../tests/inquiry-fixtures";

const token = vi.hoisted(() => vi.fn());
vi.mock("../firebase/id-token", () => ({ getCurrentFirebaseIdToken: token }));
import { adminInquiryClient } from "./admin-client";

const fetchMock = vi.fn();
beforeEach(() => {
  token.mockReset().mockResolvedValue("fresh-admin-token");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("uses fresh bearer tokens and POST-only action bodies for count, list, and detail", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ waitingCount: 3 }))
    .mockResolvedValueOnce(Response.json({ inquiries: [inquiryFixture] }))
    .mockResolvedValueOnce(Response.json({ inquiry: inquiryFixture }));
  const controller = new AbortController();
  expect(await adminInquiryClient.count(controller.signal)).toBe(3);
  expect(await adminInquiryClient.list({ category: "product", status: "waiting", pageSize: 20, cursor: "older" })).toHaveLength(1);
  expect((await adminInquiryClient.get("new-1")).id).toBe("new-1");
  expect(token).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls.map(([url, options]) => [url, JSON.parse(options.body)])).toEqual([
    ["/api/admin/inquiries", { action: "count" }],
    ["/api/admin/inquiries", { action: "list", category: "product", status: "waiting", pageSize: 20, cursor: "older" }],
    ["/api/admin/inquiries", { action: "detail", id: "new-1" }],
  ]);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", signal: controller.signal, headers: { authorization: "Bearer fresh-admin-token", "content-type": "application/json" } });
});

it("sends only reply/id fields and requires a bodyless deletion success", async () => {
  const answered = { ...inquiryFixture, status: "answered", adminReply: "답변", repliedAt: inquiryFixture.createdAt };
  fetchMock.mockResolvedValueOnce(Response.json({ inquiry: answered })).mockResolvedValueOnce(new Response(null, { status: 204 }));
  expect((await adminInquiryClient.reply("new-1", "답변")).adminReply).toBe("답변");
  await expect(adminInquiryClient.delete("new-1")).resolves.toBeUndefined();
  expect(fetchMock.mock.calls.map(([url, options]) => [url, JSON.parse(options.body)])).toEqual([
    ["/api/admin/inquiries/reply", { id: "new-1", adminReply: "답변" }],
    ["/api/admin/inquiries/delete", { id: "new-1" }],
  ]);
  fetchMock.mockResolvedValueOnce(Response.json({ deleted: true }));
  await expect(adminInquiryClient.delete("new-1")).rejects.toThrow();
});

it("rejects detail and reply payloads whose inquiry id differs from the requested id", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ inquiry: { ...inquiryFixture, id: "other-id" } }));
  await expect(adminInquiryClient.get("requested-id")).rejects.toThrow();
  fetchMock.mockResolvedValueOnce(Response.json({
    inquiry: {
      ...inquiryFixture,
      id: "other-id",
      status: "answered",
      adminReply: "답변",
      repliedAt: inquiryFixture.createdAt,
    },
  }));
  await expect(adminInquiryClient.reply("requested-id", "답변")).rejects.toThrow();
});

it.each([-1, 1.5, "3", null])("rejects malformed waiting count %s", async (waitingCount) => {
  fetchMock.mockResolvedValueOnce(Response.json({ waitingCount }));
  await expect(adminInquiryClient.count()).rejects.toThrow();
});

it.each([
  { waitingCount: 2, memberUid: "private" }, {},
])("rejects extra or missing count fields", async (payload) => {
  fetchMock.mockResolvedValueOnce(Response.json(payload));
  await expect(adminInquiryClient.count()).rejects.toThrow();
});

it.each([
  { ...inquiryFixture, memberUid: "private" },
  { ...inquiryFixture, repliedBy: "private" },
  { ...inquiryFixture, title: "" },
  { ...inquiryFixture, status: "answered" },
  { ...inquiryFixture, id: "bad/id" },
  { ...inquiryFixture, attachments: [{ id: "file", originalName: "file.png", contentType: "image/png", size: 10, readUrl: null, storagePath: "private/path" }] },
])("rejects private or malformed detail fields", async (inquiry) => {
  fetchMock.mockResolvedValueOnce(Response.json({ inquiry }));
  await expect(adminInquiryClient.get("new-1")).rejects.toThrow();
});

it("rejects extra envelope fields, malformed arrays, and more than 50 rows", async () => {
  for (const payload of [{ inquiries: [], secret: "private" }, { inquiries: null }, { inquiries: Array.from({ length: 51 }, () => inquiryFixture) }]) {
    fetchMock.mockResolvedValueOnce(Response.json(payload));
    await expect(adminInquiryClient.list()).rejects.toThrow();
  }
});

it.each([401, 403, 503, 500])("uses safe Korean errors for HTTP %s", async (status) => {
  fetchMock.mockResolvedValueOnce(Response.json({ message: "private credentials" }, { status }));
  await expect(adminInquiryClient.count()).rejects.toMatchObject({ status, message: expect.stringMatching(/[가-힣]/u) });
});

it("sanitizes network/token failures and cancels before a delayed token can send work", async () => {
  token.mockRejectedValueOnce(new Error("private token config"));
  await expect(adminInquiryClient.count()).rejects.toMatchObject({ message: expect.not.stringContaining("private") });
  fetchMock.mockRejectedValueOnce(new Error("private network endpoint"));
  await expect(adminInquiryClient.count()).rejects.toMatchObject({ message: expect.not.stringContaining("private") });
  fetchMock.mockClear();
  const pending = deferred<string>();
  token.mockReturnValueOnce(pending.promise);
  const controller = new AbortController();
  const result = adminInquiryClient.reply("new-1", "private draft", controller.signal);
  controller.abort();
  pending.resolve("token");
  await expect(result).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
