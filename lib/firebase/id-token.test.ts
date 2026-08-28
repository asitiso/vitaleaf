import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, getIdToken } = vi.hoisted(() => {
  const getIdToken = vi.fn();
  return {
    getIdToken,
    authMock: { currentUser: { getIdToken } as { getIdToken: typeof getIdToken } | null },
  };
});

vi.mock("./client", () => ({ auth: authMock }));

import {
  getCurrentFirebaseIdToken,
  MemberAuthenticationRequiredError,
} from "./id-token";

describe("Firebase ID-token helper", () => {
  beforeEach(() => {
    getIdToken.mockReset();
    authMock.currentUser = { getIdToken };
  });

  it("returns the current user's ID token", async () => {
    getIdToken.mockResolvedValue("member-token");

    await expect(getCurrentFirebaseIdToken()).resolves.toBe("member-token");
    expect(getIdToken).toHaveBeenCalledWith(false);
  });

  it("passes through a requested token refresh", async () => {
    getIdToken.mockResolvedValue("refreshed-member-token");

    await expect(getCurrentFirebaseIdToken(true)).resolves.toBe("refreshed-member-token");
    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it("rejects a signed-out request", async () => {
    authMock.currentUser = null;

    await expect(getCurrentFirebaseIdToken()).rejects.toBeInstanceOf(
      MemberAuthenticationRequiredError,
    );
  });
});
