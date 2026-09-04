// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminMocks as mocks, adminRecord, adminRequest, resetAdminMocks } from "../../../../../tests/admin-inquiry-harness";
import { FirebaseAdminConfigurationError } from "../../../../../lib/firebase/admin";
import { deferred } from "../../../../../tests/inquiry-fixtures";
import { POST } from "./route";

beforeEach(resetAdminMocks);
afterEach(() => vi.restoreAllMocks());

it("awaits stored image deletion before deleting the document", async () => {
  const storage = deferred<void>();
  mocks.deleteObjects.mockReturnValue(storage.promise);
  const response = POST(adminRequest({ id: adminRecord.id }));
  await vi.waitFor(() => expect(mocks.deleteObjects).toHaveBeenCalledWith(["inquiries/inquiry-1/image-1.png"]));
  expect(mocks.remove).not.toHaveBeenCalled();
  storage.resolve();
  expect((await response).status).toBe(204);
  expect(mocks.remove).toHaveBeenCalledWith("inquiry-1");
});

it("succeeds repeatedly for missing inquiries without Storage access", async () => {
  mocks.get.mockResolvedValue(null);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await POST(adminRequest({ id: "missing" }));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  }
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.deleteObjects).not.toHaveBeenCalled();
});

it("preserves metadata on Storage failure and permits retry", async () => {
  const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.deleteObjects.mockRejectedValueOnce(new Error("inquiries/private/image.png"));
  const failed = await POST(adminRequest({ id: "inquiry-1" }));
  expect(failed.status).toBe(500);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(await failed.text()).not.toContain("inquiries/private");
  expect(JSON.stringify(logger.mock.calls)).not.toContain("inquiries/private");
  expect((await POST(adminRequest({ id: "inquiry-1" }))).status).toBe(204);
});

it("can retry document failure after already-deleted images", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.remove.mockRejectedValueOnce(new Error("private database error"));
  expect((await POST(adminRequest({ id: "inquiry-1" }))).status).toBe(500);
  expect((await POST(adminRequest({ id: "inquiry-1" }))).status).toBe(204);
  expect(mocks.deleteObjects).toHaveBeenCalledTimes(2);
  expect(mocks.remove).toHaveBeenCalledTimes(2);
});

it("rejects forged paths and unsafe ids without deletions", async () => {
  for (const body of [{ id: "bad/id" }, { id: "inquiry-1", storagePaths: ["forged"] }]) {
    expect((await POST(adminRequest(body))).status).toBe(400);
  }
  expect(mocks.deleteObjects).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("returns safe 503 on Storage configuration failure", async () => {
  mocks.deleteObjects.mockRejectedValueOnce(new FirebaseAdminConfigurationError("PRIVATE_BUCKET"));
  const response = await POST(adminRequest({ id: "inquiry-1" }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("PRIVATE_BUCKET");
  expect(mocks.remove).not.toHaveBeenCalled();
});
