// @vitest-environment node

import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { name: "vitaleaf-server" },
  bucket: { name: "private-inquiry-bucket" },
  getStorage: vi.fn(),
  storage: { bucket: vi.fn() },
}));

vi.mock("firebase-admin/app", () => ({
  cert: vi.fn(),
  getApps: vi.fn(() => [mocks.app]),
  initializeApp: vi.fn(),
}));

vi.mock("firebase-admin/storage", () => ({ getStorage: mocks.getStorage }));

import { getAdminStorageBucket } from "./admin";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("selects the required private Firebase Storage bucket from the server app", () => {
  vi.stubEnv("FIREBASE_STORAGE_BUCKET", "vitaleaf-private.appspot.com");
  mocks.getStorage.mockReturnValue(mocks.storage);
  mocks.storage.bucket.mockReturnValue(mocks.bucket);

  expect(getAdminStorageBucket()).toBe(mocks.bucket);
  expect(mocks.getStorage).toHaveBeenCalledWith(mocks.app);
  expect(mocks.storage.bucket).toHaveBeenCalledWith("vitaleaf-private.appspot.com");
});
