import type { DecodedIdToken } from "firebase-admin/auth";
import { describe, expect, it, vi } from "vitest";

import { verifyBearerAdmin, verifyBearerMember } from "./admin-auth";

const memberIdentity = { uid: "member-1" } as DecodedIdToken;
const adminIdentity = { uid: "admin-1" } as DecodedIdToken;

const requestWithAuthorization = (authorization?: string): Request => new Request(
  "https://vitaleaf.example.test/api/member/orders",
  { headers: authorization === undefined ? undefined : { Authorization: authorization } },
);

describe("server bearer authentication", () => {
  it("rejects a request without an Authorization header as unauthenticated", async () => {
    const verifyIdToken = vi.fn();

    await expect(verifyBearerMember(requestWithAuthorization(), {
      verifyIdToken,
      getAdminRecord: vi.fn(),
    })).rejects.toMatchObject({ status: 401 });

    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it.each(["Basic member-token", "Bearer", "Bearer  "])(
    "rejects malformed Authorization header %j as unauthenticated",
    async (authorization) => {
      const verifyIdToken = vi.fn();

      await expect(verifyBearerMember(requestWithAuthorization(authorization), {
        verifyIdToken,
        getAdminRecord: vi.fn(),
      })).rejects.toMatchObject({ status: 401 });

      expect(verifyIdToken).not.toHaveBeenCalled();
    },
  );

  it("maps Firebase token verification failures to 401 without exposing the bearer token", async () => {
    const bearerToken = "secret-member-token";
    const verifyIdToken = vi.fn().mockRejectedValue(new Error(`invalid ${bearerToken}`));

    try {
      await verifyBearerMember(requestWithAuthorization(`Bearer ${bearerToken}`), {
        verifyIdToken,
        getAdminRecord: vi.fn(),
      });
      throw new Error("Expected bearer verification to reject.");
    } catch (error) {
      expect(error).toMatchObject({ status: 401 });
      expect(error).not.toHaveProperty("message", expect.stringContaining(bearerToken));
    }
  });

  it("returns the verified identity for a valid member bearer token", async () => {
    const verifyIdToken = vi.fn().mockResolvedValue(memberIdentity);

    await expect(verifyBearerMember(requestWithAuthorization("Bearer member-token"), {
      verifyIdToken,
      getAdminRecord: vi.fn(),
    })).resolves.toBe(memberIdentity);
  });

  it("rejects a verified member without the admin role as forbidden", async () => {
    const getAdminRecord = vi.fn().mockResolvedValue({ role: "member" });

    await expect(verifyBearerAdmin(requestWithAuthorization("Bearer member-token"), {
      verifyIdToken: vi.fn().mockResolvedValue(memberIdentity),
      getAdminRecord,
    })).rejects.toMatchObject({ status: 403 });

    expect(getAdminRecord).toHaveBeenCalledWith("member-1");
  });

  it("returns a verified identity only for an admins record with the admin role", async () => {
    await expect(verifyBearerAdmin(requestWithAuthorization("Bearer admin-token"), {
      verifyIdToken: vi.fn().mockResolvedValue(adminIdentity),
      getAdminRecord: vi.fn().mockResolvedValue({ role: "admin" }),
    })).resolves.toMatchObject({ uid: "admin-1" });
  });
});
