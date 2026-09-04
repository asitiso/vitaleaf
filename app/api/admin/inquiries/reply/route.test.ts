// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminMocks as mocks, adminRecord, adminRequest, resetAdminMocks } from "../../../../../tests/admin-inquiry-harness";
import { FirebaseAdminConfigurationError } from "../../../../../lib/firebase/admin";
import { POST } from "./route";

beforeEach(resetAdminMocks);
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("saves normalized multiline answer with verified uid and server time and returns public answered data", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-03T01:00:00.000Z"));
  const response = await POST(adminRequest({ id: adminRecord.id, adminReply: "  확인했습니다.\r\n\t감사합니다.  " }));
  expect(response.status).toBe(200);
  expect(mocks.reply).toHaveBeenCalledWith("inquiry-1", {
    adminReply: "확인했습니다.\n\t감사합니다.", repliedBy: "verified-admin", repliedAt: new Date("2026-09-03T01:00:00.000Z"),
  });
  const result = await response.json();
  expect(result.inquiry).toMatchObject({ status: "answered", adminReply: "확인했습니다.\n\t감사합니다.", repliedAt: "2026-09-03T01:00:00.000Z", updatedAt: "2026-09-03T01:00:00.000Z" });
  expect(JSON.stringify(result)).not.toMatch(/memberUid|repliedBy|storagePath|verified-admin/u);
});

it.each(["", "  \n ", "가".repeat(3001), "bad\u0000reply", 123, null])("rejects invalid reply %s without writes", async (adminReply) => {
  expect((await POST(adminRequest({ id: "inquiry-1", adminReply }))).status).toBe(400);
  expect(mocks.reply).not.toHaveBeenCalled();
});

it.each(["repliedBy", "repliedAt", "status", "uid"])("rejects forged %s", async (field) => {
  expect((await POST(adminRequest({ id: "inquiry-1", adminReply: "답변", [field]: "forged" }))).status).toBe(400);
  expect(mocks.reply).not.toHaveBeenCalled();
});

it("accepts exactly 3000 Unicode characters and rejects a missing inquiry", async () => {
  expect((await POST(adminRequest({ id: "inquiry-1", adminReply: "🌱".repeat(3000) }))).status).toBe(200);
  mocks.get.mockResolvedValueOnce(null);
  mocks.reply.mockClear();
  expect((await POST(adminRequest({ id: "missing", adminReply: "답변" }))).status).toBe(404);
  expect(mocks.reply).not.toHaveBeenCalled();
});

it("maps configuration and generic write failures without leaking errors", async () => {
  const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.reply.mockRejectedValueOnce(new FirebaseAdminConfigurationError("SECRET_CONFIG"));
  expect((await POST(adminRequest({ id: "inquiry-1", adminReply: "답변" }))).status).toBe(503);
  mocks.reply.mockRejectedValueOnce(new Error("private-member"));
  const failure = await POST(adminRequest({ id: "inquiry-1", adminReply: "답변" }));
  expect(failure.status).toBe(500);
  expect(await failure.text()).not.toContain("private-member");
  expect(JSON.stringify(logger.mock.calls)).not.toContain("private-member");
});
