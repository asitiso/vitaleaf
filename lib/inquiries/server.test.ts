// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InquiryAccessError, type InquirySubject } from "./access";
import {
  InquiryConfigurationError,
  createInquiryRecord,
  requiredInquiryTokenSecret,
  resolveInquirySubject,
  toInquiryPublic,
} from "./server";
import type { InquiryCreateInput, InquiryRecord } from "./types";
import { ServerAuthenticationError } from "../firebase/admin-auth";

const NOW = new Date("2026-09-02T01:02:03.000Z");
const SECRET = "inquiry-token-secret-that-is-at-least-thirty-two-characters";
const ORDER_NUMBER = "VL-20260826-ABC123";
const savedSecret = process.env.INQUIRY_TOKEN_SECRET;

const createInput: InquiryCreateInput = {
  category: "product",
  title: "상품 문의",
  body: "섭취 방법을 알려주세요.",
  orderNumber: "VL-20260826-ZZZZZZ",
  uploadReceipts: [],
};

const privateRecord: InquiryRecord = {
  id: "inquiry-1",
  ownerType: "member",
  memberUid: "member-private-id",
  guestOrderNumber: null,
  orderNumber: ORDER_NUMBER,
  category: "product",
  title: "상품 문의",
  body: "섭취 방법을 알려주세요.",
  status: "answered",
  attachments: [{
    id: "attachment-1",
    storagePath: "inquiries/inquiry-1/attachment-1",
    originalName: "receipt.png",
    contentType: "image/png",
    size: 12,
  }],
  adminReply: "안내드립니다.",
  repliedAt: NOW,
  repliedBy: "admin-private-id",
  createdAt: NOW,
  updatedAt: NOW,
};

beforeEach(() => {
  delete process.env.INQUIRY_TOKEN_SECRET;
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.INQUIRY_TOKEN_SECRET;
  else process.env.INQUIRY_TOKEN_SECRET = savedSecret;
  vi.restoreAllMocks();
});

describe("inquiry server access boundary", () => {
  it("requires a strong server-only inquiry token secret", () => {
    expect(() => requiredInquiryTokenSecret()).toThrow(InquiryConfigurationError);
    process.env.INQUIRY_TOKEN_SECRET = "too-short";
    expect(() => requiredInquiryTokenSecret()).toThrow(InquiryConfigurationError);
    process.env.INQUIRY_TOKEN_SECRET = ` ${SECRET} `;
    expect(requiredInquiryTokenSecret()).toBe(SECRET);
  });

  it("prefers a valid guest token over a simultaneously supplied bearer token", async () => {
    const verifyGuestToken = vi.fn().mockReturnValue({ kind: "guest", orderNumber: ORDER_NUMBER });
    const verifyBearerMember = vi.fn().mockResolvedValue({ uid: "member-1" });

    await expect(resolveInquirySubject(new Request("http://localhost", {
      headers: { authorization: "Bearer member-token", "x-inquiry-access": "guest-token" },
    }), {
      now: () => NOW,
      requiredSecret: () => SECRET,
      verifyGuestToken,
      verifyBearerMember,
    })).resolves.toEqual({ kind: "guest", orderNumber: ORDER_NUMBER });

    expect(verifyGuestToken).toHaveBeenCalledWith("guest-token", NOW, SECRET);
    expect(verifyBearerMember).not.toHaveBeenCalled();
  });

  it("maps invalid or expired guest access to the same unauthenticated boundary", async () => {
    const expired = vi.fn(() => { throw new InquiryAccessError(); });

    await expect(resolveInquirySubject(new Request("http://localhost", {
      headers: { "x-inquiry-access": "expired-token" },
    }), {
      now: () => NOW,
      requiredSecret: () => SECRET,
      verifyGuestToken: expired,
      verifyBearerMember: vi.fn(),
    })).rejects.toMatchObject({ status: 401 });
  });

  it("derives a member only from the verified bearer and ignores browser owner fields", async () => {
    const verifyBearerMember = vi.fn().mockResolvedValue({ uid: "verified-member" });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { authorization: "Bearer member-token", "content-type": "application/json" },
      body: JSON.stringify({ ownerType: "guest", memberUid: "attacker", guestOrderNumber: ORDER_NUMBER }),
    });

    await expect(resolveInquirySubject(request, {
      now: () => NOW,
      requiredSecret: () => SECRET,
      verifyGuestToken: vi.fn(),
      verifyBearerMember,
    })).resolves.toEqual({ kind: "member", uid: "verified-member" });
  });

  it("preserves a missing or invalid bearer as unauthenticated", async () => {
    await expect(resolveInquirySubject(new Request("http://localhost"), {
      now: () => NOW,
      requiredSecret: () => SECRET,
      verifyGuestToken: vi.fn(),
      verifyBearerMember: vi.fn().mockRejectedValue(new ServerAuthenticationError(401)),
    })).rejects.toMatchObject({ status: 401 });
  });
});

describe("inquiry server records and public output", () => {
  it("creates a guest record from the verified order instead of browser-supplied ownership", () => {
    const subject: InquirySubject = { kind: "guest", orderNumber: ORDER_NUMBER };
    const record = createInquiryRecord(subject, createInput, "inquiry-guest-1", NOW);

    expect(record).toEqual(expect.objectContaining({
      id: "inquiry-guest-1",
      ownerType: "guest",
      memberUid: null,
      guestOrderNumber: ORDER_NUMBER,
      orderNumber: ORDER_NUMBER,
      status: "waiting",
      attachments: [],
      adminReply: null,
      repliedAt: null,
      repliedBy: null,
      createdAt: NOW,
      updatedAt: NOW,
    }));
    expect(JSON.stringify(record)).not.toContain("VL-20260826-ZZZZZZ");
  });

  it("keeps member order metadata without granting a browser-controlled owner", () => {
    const record = createInquiryRecord(
      { kind: "member", uid: "verified-member" },
      createInput,
      "inquiry-member-1",
      NOW,
    );

    expect(record).toMatchObject({
      ownerType: "member",
      memberUid: "verified-member",
      guestOrderNumber: null,
      orderNumber: "VL-20260826-ZZZZZZ",
    });
  });

  it("converts a record to a browser-safe shape without internal owners, paths, or reply author", () => {
    const response = toInquiryPublic(privateRecord);

    expect(response).toEqual({
      id: "inquiry-1",
      ownerType: "member",
      orderNumber: ORDER_NUMBER,
      category: "product",
      title: "상품 문의",
      body: "섭취 방법을 알려주세요.",
      status: "answered",
      attachments: [{
        id: "attachment-1",
        originalName: "receipt.png",
        contentType: "image/png",
        size: 12,
        readUrl: null,
      }],
      adminReply: "안내드립니다.",
      repliedAt: "2026-09-02T01:02:03.000Z",
      createdAt: "2026-09-02T01:02:03.000Z",
      updatedAt: "2026-09-02T01:02:03.000Z",
    });
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("member-private-id");
    expect(serialized).not.toContain("admin-private-id");
    expect(serialized).not.toContain("storagePath");
  });
});
