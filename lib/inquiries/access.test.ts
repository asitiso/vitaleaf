import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  InquiryAccessError,
  issueGuestInquiryToken,
  issueUploadReceipt,
  verifyGuestInquiryToken,
  verifyUploadReceipt,
  type InquirySubject,
} from "./access";

const NOW = new Date("2026-08-28T09:00:00.000Z");
const SECRET = "test-only-inquiry-secret-that-is-long-enough";
const ORDER_NUMBER = "VL-20260826-ABC123";
const MEMBER: InquirySubject = { kind: "member", uid: "member-1" };
const GUEST: InquirySubject = { kind: "guest", orderNumber: ORDER_NUMBER };
const OBJECT_PATH = "inquiryPending/subject-hash/upload-1";

type TestEnvelope = {
  v: unknown;
  purpose: unknown;
  exp: unknown;
  payload: unknown;
  [key: string]: unknown;
};

const encodeJson = (value: unknown): string => Buffer
  .from(JSON.stringify(value), "utf8")
  .toString("base64url");

const signEncoded = (encoded: string): string => createHmac("sha256", SECRET)
  .update(encoded)
  .digest("base64url");

const signEnvelope = (envelope: unknown): string => {
  const encoded = encodeJson(envelope);
  return `${encoded}.${signEncoded(encoded)}`;
};

const decodeEnvelope = (token: string): TestEnvelope => {
  const [encoded] = token.split(".");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TestEnvelope;
};

const mutateWithoutResigning = (
  token: string,
  mutate: (envelope: TestEnvelope) => void,
): string => {
  const envelope = decodeEnvelope(token);
  mutate(envelope);
  const [, signature] = token.split(".");
  return `${encodeJson(envelope)}.${signature}`;
};

const changeLastBase64urlCharacter = (token: string): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = token.at(-1) ?? "";
  const index = alphabet.indexOf(last);
  const replacement = alphabet[(index + 16) % alphabet.length];
  return `${token.slice(0, -1)}${replacement}`;
};

const expectAccessError = (operation: () => unknown): void => {
  expect(operation).toThrow(InquiryAccessError);
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({
      name: "InquiryAccessError",
      message: "문의 접근 권한을 확인할 수 없습니다.",
    });
    expect(String(error)).not.toContain(SECRET);
  }
};

describe("guest inquiry access tokens", () => {
  it("round-trips only the canonical guest subject", () => {
    const token = issueGuestInquiryToken(ORDER_NUMBER, NOW, SECRET);

    expect(verifyGuestInquiryToken(
      token,
      new Date(NOW.getTime() + 5 * 60_000),
      SECRET,
    )).toEqual(GUEST);
  });

  it("contains only the order number and no private order snapshot data", () => {
    const privateOrderData = {
      orderNumber: ORDER_NUMBER,
      phone: "010-1234-5678",
      address: "서울시 비공개 주소",
      name: "비공개 고객",
    };
    const token = issueGuestInquiryToken(privateOrderData.orderNumber, NOW, SECRET);
    const envelope = decodeEnvelope(token);
    const serialized = JSON.stringify(envelope);

    expect(envelope.payload).toEqual({ orderNumber: ORDER_NUMBER });
    expect(serialized).not.toContain(privateOrderData.phone);
    expect(serialized).not.toContain(privateOrderData.address);
    expect(serialized).not.toContain(privateOrderData.name);
  });

  it("accepts the final millisecond before expiry and rejects exact expiry", () => {
    const token = issueGuestInquiryToken(ORDER_NUMBER, NOW, SECRET);
    const expiry = NOW.getTime() + 30 * 60_000;

    expect(verifyGuestInquiryToken(token, new Date(expiry - 1), SECRET)).toEqual(GUEST);
    expectAccessError(() => verifyGuestInquiryToken(token, new Date(expiry), SECRET));
  });

  it("rejects use before the issue time implied by the fixed lifetime", () => {
    const token = issueGuestInquiryToken(ORDER_NUMBER, NOW, SECRET);

    expectAccessError(() => verifyGuestInquiryToken(
      token,
      new Date(NOW.getTime() - 1),
      SECRET,
    ));
  });

  it("rejects a changed final signature character", () => {
    const token = issueGuestInquiryToken(ORDER_NUMBER, NOW, SECRET);

    expectAccessError(() => verifyGuestInquiryToken(
      changeLastBase64urlCharacter(token),
      NOW,
      SECRET,
    ));
  });

  it("rejects a signature with the wrong decoded length without leaking a crypto error", () => {
    const token = issueGuestInquiryToken(ORDER_NUMBER, NOW, SECRET);
    const [encoded] = token.split(".");

    expectAccessError(() => verifyGuestInquiryToken(`${encoded}.AA`, NOW, SECRET));
  });

  it.each([
    "VL-20260826-abc123",
    "VL-2026082-ABC123",
    `VL-20260826-${"A".repeat(40)}`,
    "VL-20260826-ABC12\u0000",
  ])("reuses strict canonical order-number validation: %s", (orderNumber) => {
    expectAccessError(() => issueGuestInquiryToken(orderNumber, NOW, SECRET));
  });
});

describe("upload receipts", () => {
  it.each<[InquirySubject]>([[MEMBER], [GUEST]])(
    "round-trips the exact normalized %s subject, path, MIME, and size",
    (subject) => {
      const token = issueUploadReceipt(
        subject,
        ` ${OBJECT_PATH} `,
        "image/webp",
        5 * 1024 * 1024,
        NOW,
        SECRET,
      );

      expect(verifyUploadReceipt(token, subject, NOW, SECRET)).toEqual({
        subject,
        objectPath: OBJECT_PATH,
        contentType: "image/webp",
        declaredSize: 5 * 1024 * 1024,
      });
    },
  );

  it("normalizes member identifiers consistently when issuing and verifying", () => {
    const token = issueUploadReceipt(
      { kind: "member", uid: " member-1 " },
      OBJECT_PATH,
      "image/jpeg",
      1,
      NOW,
      SECRET,
    );

    expect(verifyUploadReceipt(token, MEMBER, NOW, SECRET).subject).toEqual(MEMBER);
  });

  it("accepts the final millisecond before expiry and rejects exact expiry", () => {
    const token = issueUploadReceipt(MEMBER, OBJECT_PATH, "image/png", 1_024, NOW, SECRET);
    const expiry = NOW.getTime() + 10 * 60_000;

    expect(verifyUploadReceipt(token, MEMBER, new Date(expiry - 1), SECRET))
      .toMatchObject({ objectPath: OBJECT_PATH });
    expectAccessError(() => verifyUploadReceipt(token, MEMBER, new Date(expiry), SECRET));
  });

  it.each<[string, InquirySubject]>([
    ["another member", { kind: "member", uid: "member-2" }],
    ["a guest", GUEST],
  ])("rejects subject swapping to %s", (_description, expectedSubject) => {
    const token = issueUploadReceipt(MEMBER, OBJECT_PATH, "image/jpeg", 100, NOW, SECRET);

    expectAccessError(() => verifyUploadReceipt(token, expectedSubject, NOW, SECRET));
  });

  it("rejects swapping a guest receipt to another guest order", () => {
    const token = issueUploadReceipt(GUEST, OBJECT_PATH, "image/jpeg", 100, NOW, SECRET);

    expectAccessError(() => verifyUploadReceipt(
      token,
      { kind: "guest", orderNumber: "VL-20260826-ZZZZZZ" },
      NOW,
      SECRET,
    ));
  });

  it.each([
    ["object path", (payload: Record<string, unknown>) => { payload.objectPath = `${OBJECT_PATH}-other`; }],
    ["content type", (payload: Record<string, unknown>) => { payload.contentType = "image/png"; }],
    ["declared size", (payload: Record<string, unknown>) => { payload.declaredSize = 101; }],
    ["subject", (payload: Record<string, unknown>) => { payload.subject = GUEST; }],
  ] as const)("rejects a token whose signed %s is changed", (_description, mutatePayload) => {
    const token = issueUploadReceipt(MEMBER, OBJECT_PATH, "image/jpeg", 100, NOW, SECRET);
    const tampered = mutateWithoutResigning(token, (envelope) => {
      mutatePayload(envelope.payload as Record<string, unknown>);
    });

    expectAccessError(() => verifyUploadReceipt(tampered, MEMBER, NOW, SECRET));
  });

  it.each([
    "inquiries/subject-hash/upload-1",
    "inquiryPending/../upload-1",
    "inquiryPending/subject-hash/./upload-1",
    "inquiryPending/subject-hash\\upload-1",
    "inquiryPending/subject-hash/upload-1\u0000",
    `inquiryPending/${"x".repeat(1_100)}`,
  ])("rejects an unsafe pending object path: %s", (objectPath) => {
    expectAccessError(() => issueUploadReceipt(
      MEMBER,
      objectPath,
      "image/jpeg",
      100,
      NOW,
      SECRET,
    ));
  });

  it.each(["image/gif", "IMAGE/JPEG", "image/jpeg; charset=utf-8"])(
    "rejects a disallowed MIME type: %s",
    (contentType) => {
      expectAccessError(() => issueUploadReceipt(
        MEMBER,
        OBJECT_PATH,
        contentType as "image/jpeg",
        100,
        NOW,
        SECRET,
      ));
    },
  );

  it.each([0, -1, 1.5, Number.NaN, 5 * 1024 * 1024 + 1])(
    "rejects an unsafe declared size: %s",
    (declaredSize) => {
      expectAccessError(() => issueUploadReceipt(
        MEMBER,
        OBJECT_PATH,
        "image/png",
        declaredSize,
        NOW,
        SECRET,
      ));
    },
  );

  it.each([
    { kind: "member", uid: "" },
    { kind: "member", uid: "x".repeat(129) },
    { kind: "member", uid: "member\u007f1" },
    { kind: "guest", orderNumber: "VL-20260826-bad123" },
  ])("rejects an unsafe subject: %o", (subject) => {
    expectAccessError(() => issueUploadReceipt(
      subject as InquirySubject,
      OBJECT_PATH,
      "image/webp",
      100,
      NOW,
      SECRET,
    ));
  });
});

describe("token envelope validation", () => {
  const guestEnvelope = (): TestEnvelope => ({
    v: 1,
    purpose: "guest-inquiry",
    exp: NOW.getTime() + 30 * 60_000,
    payload: { orderNumber: ORDER_NUMBER },
  });

  it.each([
    ["wrong version", { ...guestEnvelope(), v: 2 }],
    ["wrong purpose", { ...guestEnvelope(), purpose: "inquiry-upload" }],
    ["missing payload", { v: 1, purpose: "guest-inquiry", exp: NOW.getTime() + 30 * 60_000 }],
    ["extra envelope field", { ...guestEnvelope(), extra: true }],
    ["extra payload field", { ...guestEnvelope(), payload: { orderNumber: ORDER_NUMBER, phone: "01012345678" } }],
    ["missing payload field", { ...guestEnvelope(), payload: {} }],
    ["array payload", { ...guestEnvelope(), payload: [ORDER_NUMBER] }],
    ["fractional expiry", { ...guestEnvelope(), exp: NOW.getTime() + 0.5 }],
    ["unsafe integer expiry", { ...guestEnvelope(), exp: Number.MAX_SAFE_INTEGER + 1 }],
    ["non-positive expiry", { ...guestEnvelope(), exp: -1 }],
    ["overlong lifetime", { ...guestEnvelope(), exp: NOW.getTime() + 30 * 60_000 + 1 }],
  ])("rejects a correctly signed but malformed %s envelope", (_description, envelope) => {
    expectAccessError(() => verifyGuestInquiryToken(signEnvelope(envelope), NOW, SECRET));
  });

  it.each([
    ["invalid base64url", "%%%.AAAA"],
    ["missing segment", "AAAA"],
    ["extra segment", "AAAA.BBBB.CCCC"],
    ["empty envelope", ".AAAA"],
    ["empty signature", "AAAA."],
    ["oversized token", `${"A".repeat(9_000)}.AAAA`],
  ])("rejects a malformed token encoding: %s", (_description, token) => {
    expectAccessError(() => verifyGuestInquiryToken(token, NOW, SECRET));
  });

  it("rejects signed non-JSON and non-object envelope data", () => {
    const encodedText = Buffer.from("not-json", "utf8").toString("base64url");

    expectAccessError(() => verifyGuestInquiryToken(
      `${encodedText}.${signEncoded(encodedText)}`,
      NOW,
      SECRET,
    ));
    expectAccessError(() => verifyGuestInquiryToken(signEnvelope([]), NOW, SECRET));
  });

  it("rejects purpose reuse in both directions", () => {
    const guestToken = issueGuestInquiryToken(ORDER_NUMBER, NOW, SECRET);
    const uploadToken = issueUploadReceipt(MEMBER, OBJECT_PATH, "image/png", 100, NOW, SECRET);

    expectAccessError(() => verifyGuestInquiryToken(uploadToken, NOW, SECRET));
    expectAccessError(() => verifyUploadReceipt(guestToken, MEMBER, NOW, SECRET));
  });

  it.each([
    ["missing field", {
      subject: MEMBER,
      objectPath: OBJECT_PATH,
      contentType: "image/png",
    }],
    ["extra field", {
      subject: MEMBER,
      objectPath: OBJECT_PATH,
      contentType: "image/png",
      declaredSize: 100,
      originalName: "private.png",
    }],
    ["extra subject field", {
      subject: { ...MEMBER, orderNumber: ORDER_NUMBER },
      objectPath: OBJECT_PATH,
      contentType: "image/png",
      declaredSize: 100,
    }],
    ["unsafe path", {
      subject: MEMBER,
      objectPath: "inquiryPending/../upload-1",
      contentType: "image/png",
      declaredSize: 100,
    }],
    ["unsafe MIME", {
      subject: MEMBER,
      objectPath: OBJECT_PATH,
      contentType: "image/gif",
      declaredSize: 100,
    }],
    ["unsafe size", {
      subject: MEMBER,
      objectPath: OBJECT_PATH,
      contentType: "image/png",
      declaredSize: 0,
    }],
  ])("rejects a correctly signed upload payload with a %s", (_description, payload) => {
    const token = signEnvelope({
      v: 1,
      purpose: "inquiry-upload",
      exp: NOW.getTime() + 10 * 60_000,
      payload,
    });

    expectAccessError(() => verifyUploadReceipt(token, MEMBER, NOW, SECRET));
  });

  it("rejects verification with a different strong secret", () => {
    const token = signEnvelope(guestEnvelope());

    expectAccessError(() => verifyGuestInquiryToken(
      token,
      NOW,
      "another-strong-inquiry-secret-value",
    ));
  });

  it.each([
    ["missing", undefined],
    ["too short", "short-secret"],
    ["thirty-one characters", "x".repeat(31)],
  ])("rejects a %s secret before signing or verifying", (_description, secret) => {
    const typedSecret = secret as unknown as string;
    expectAccessError(() => issueGuestInquiryToken(ORDER_NUMBER, NOW, typedSecret));
    expectAccessError(() => verifyGuestInquiryToken("malformed", NOW, typedSecret));
  });

  it.each([
    new Date("invalid"),
    "2026-08-28T09:00:00.000Z" as unknown as Date,
  ])("rejects an unsafe clock value: %s", (now) => {
    expectAccessError(() => issueGuestInquiryToken(ORDER_NUMBER, now, SECRET));
  });
});
