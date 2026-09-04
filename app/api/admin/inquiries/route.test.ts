// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminMocks as mocks, adminRecord, adminRequest, resetAdminMocks } from "../../../../tests/admin-inquiry-harness";
import { deferred } from "../../../../tests/inquiry-fixtures";
import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import { POST } from "./route";
import { POST as reply } from "./reply/route";
import { POST as remove } from "./delete/route";

beforeEach(resetAdminMocks);
afterEach(() => vi.restoreAllMocks());

describe.each([
  ["list", POST, { action: "list" }],
  ["count", POST, { action: "count" }],
  ["detail", POST, { action: "detail", id: "inquiry-1" }],
  ["reply", reply, { id: "inquiry-1", adminReply: "확인했습니다." }],
  ["delete", remove, { id: "inquiry-1" }],
] as const)("admin %s authorization", (_name, endpoint, body) => {
  it.each(["absent", "invalid", "member"])("rejects %s authority before inquiry work", async (authority) => {
    if (authority === "invalid") mocks.verifyToken.mockRejectedValue(new Error("private-token"));
    if (authority === "member") mocks.getRole.mockResolvedValue(null);
    const result = await endpoint(adminRequest(body, authority === "absent" ? null : "token"));
    expect(result.status).toBe(authority === "member" ? 403 : 401);
    for (const mock of [mocks.get, mocks.list, mocks.count, mocks.reply, mocks.remove, mocks.sign, mocks.deleteObjects]) {
      expect(mock).not.toHaveBeenCalled();
    }
    expect(await result.text()).not.toContain("private-token");
  });

  it("waits for the server role check before repository or Storage access", async () => {
    const role = deferred<{ role: string }>();
    mocks.getRole.mockReturnValue(role.promise);
    const result = endpoint(adminRequest(body));
    await vi.waitFor(() => expect(mocks.getRole).toHaveBeenCalledWith("verified-admin"));
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.deleteObjects).not.toHaveBeenCalled();
    role.resolve({ role: "admin" });
    expect((await result).status).toBe(_name === "delete" ? 204 : 200);
  });

  it("returns safe configuration and unexpected auth errors", async () => {
    mocks.verifyToken.mockRejectedValueOnce(new FirebaseAdminConfigurationError("SECRET_CONFIG"));
    const unavailable = await endpoint(adminRequest(body));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("SECRET_CONFIG");
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getRole.mockRejectedValueOnce(new Error("private-credentials"));
    const failure = await endpoint(adminRequest(body));
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toContain("private-credentials");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("private-credentials");
    expect(logger).toHaveBeenCalled();
  });
});

it("returns count only without loading or signing inquiries", async () => {
  const response = await POST(adminRequest({ action: "count" }));
  expect(await response.json()).toEqual({ waitingCount: 3 });
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.sign).not.toHaveBeenCalled();
});

it("passes normalized bounded filters and cursor, returning only public unsiged list data", async () => {
  const response = await POST(adminRequest({ action: "list", category: "product", status: "waiting", pageSize: 50, cursor: " older-1 " }));
  expect(mocks.list).toHaveBeenCalledWith({ category: "product", status: "waiting", pageSize: 50, cursor: "older-1" });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.inquiries[0].attachments[0].readUrl).toBeNull();
  expect(JSON.stringify(body)).not.toMatch(/memberUid|guestOrderNumber|repliedBy|storagePath|private-member/u);
  expect(mocks.sign).not.toHaveBeenCalled();
});

it.each([
  {}, { action: "other" }, { action: "count", id: "inquiry-1" },
  { action: "list", pageSize: 51 }, { action: "list", category: "bad" },
  { action: "list", cursor: "inquiries/other" }, { action: "detail", id: "bad/id" },
  { action: "list", memberUid: "forged" },
])("rejects malformed admin query %j", async (body) => {
  expect((await POST(adminRequest(body))).status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});

it("signs only authorized detail and strips record secrets", async () => {
  const response = await POST(adminRequest({ action: "detail", id: adminRecord.id }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.inquiry.attachments[0].readUrl).toBe("https://storage.example.test/signed-read");
  expect(mocks.sign).toHaveBeenCalledWith(adminRecord.attachments, expect.any(Date));
  expect(JSON.stringify(body)).not.toMatch(/memberUid|guestOrderNumber|repliedBy|storagePath/u);
  mocks.get.mockResolvedValueOnce(null);
  expect((await POST(adminRequest({ action: "detail", id: "missing" }))).status).toBe(404);
});

it.each([-1, 1.5, NaN, "3"])("fails closed for malformed waiting count %s", async (count) => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.count.mockResolvedValue(count);
  expect((await POST(adminRequest({ action: "count" }))).status).toBe(500);
});

it("sanitizes repository/signing errors and rejects incomplete signing", async () => {
  const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.list.mockRejectedValueOnce(new FirebaseAdminConfigurationError("PRIVATE_CONFIG"));
  expect((await POST(adminRequest({ action: "list" }))).status).toBe(503);
  mocks.sign.mockRejectedValueOnce(new Error("inquiries/private/path?signature=secret"));
  const failed = await POST(adminRequest({ action: "detail", id: "inquiry-1" }));
  expect(failed.status).toBe(500);
  expect(await failed.text()).not.toContain("private/path");
  expect(JSON.stringify(logger.mock.calls)).not.toContain("private/path");
  mocks.sign.mockResolvedValueOnce([]);
  expect((await POST(adminRequest({ action: "detail", id: "inquiry-1" }))).status).toBe(500);
});
