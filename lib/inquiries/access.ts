import { createHmac, timingSafeEqual } from "node:crypto";
import { TextDecoder } from "node:util";

import type { InquiryImageContentType } from "./types";
import { parseInquiryOrderNumber } from "./validation";

export type InquirySubject =
  | { kind: "member"; uid: string }
  | { kind: "guest"; orderNumber: string };

export type InquiryUploadReceipt = {
  subject: InquirySubject;
  objectPath: string;
  contentType: InquiryImageContentType;
  declaredSize: number;
};

export class InquiryAccessError extends Error {
  constructor() {
    super("문의 접근 권한을 확인할 수 없습니다.");
    this.name = "InquiryAccessError";
  }
}

type TokenPurpose = "guest-inquiry" | "inquiry-upload";

type SignedEnvelope = {
  v: 1;
  purpose: TokenPurpose;
  exp: number;
  payload: unknown;
};

const TOKEN_VERSION = 1;
const MINIMUM_SECRET_LENGTH = 32;
const GUEST_TOKEN_LIFETIME_MS = 30 * 60_000;
const UPLOAD_RECEIPT_LIFETIME_MS = 10 * 60_000;
const MAXIMUM_TOKEN_LENGTH = 8_192;
const MAXIMUM_MEMBER_UID_LENGTH = 128;
const MAXIMUM_UPLOAD_SIZE = 5 * 1024 * 1024;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const PENDING_OBJECT_PATH = /^inquiryPending\/[A-Za-z0-9_-]{8,64}\/[A-Za-z0-9_-]{8,64}$/u;

const IMAGE_CONTENT_TYPES: ReadonlySet<InquiryImageContentType> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const fail = (): never => {
  throw new InquiryAccessError();
};

const withAccessError = <T>(operation: () => T): T => {
  try {
    return operation();
  } catch {
    return fail();
  }
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
};

const hasForbiddenControlCharacter = (value: string): boolean => [...value].some((character) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
});

const normalizeBoundedIdentifier = (value: unknown, maximum: number): string => {
  if (typeof value !== "string" || value.length > maximum * 2) return fail();
  if (hasForbiddenControlCharacter(value)) return fail();
  const normalized = value.trim();
  const length = [...normalized].length;
  if (length < 1 || length > maximum) return fail();
  return normalized;
};

const normalizeSubject = (value: unknown): InquirySubject => {
  const subject = asRecord(value);
  if (subject.kind === "member" && hasExactKeys(subject, ["kind", "uid"])) {
    return {
      kind: "member",
      uid: normalizeBoundedIdentifier(subject.uid, MAXIMUM_MEMBER_UID_LENGTH),
    };
  }
  if (subject.kind === "guest" && hasExactKeys(subject, ["kind", "orderNumber"])) {
    return {
      kind: "guest",
      orderNumber: parseInquiryOrderNumber(subject.orderNumber),
    };
  }
  return fail();
};

const normalizeObjectPath = (value: unknown): string => {
  if (typeof value !== "string" || !PENDING_OBJECT_PATH.test(value)) return fail();
  return value;
};

const normalizeContentType = (value: unknown): InquiryImageContentType => {
  if (typeof value !== "string" || !IMAGE_CONTENT_TYPES.has(value as InquiryImageContentType)) {
    return fail();
  }
  return value as InquiryImageContentType;
};

const normalizeDeclaredSize = (value: unknown): number => {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 1
    || value > MAXIMUM_UPLOAD_SIZE
  ) {
    return fail();
  }
  return value;
};

const requireSecret = (secret: unknown): string => {
  if (typeof secret !== "string" || [...secret].length < MINIMUM_SECRET_LENGTH) return fail();
  return secret;
};

const epochMilliseconds = (now: unknown): number => {
  if (!(now instanceof Date)) return fail();
  const milliseconds = now.getTime();
  if (!Number.isSafeInteger(milliseconds)) return fail();
  return milliseconds;
};

export const guestInquiryTokenExpiresAt = (now: Date): Date => {
  const issuedAt = epochMilliseconds(now);
  const expiresAt = issuedAt + GUEST_TOKEN_LIFETIME_MS;
  if (!Number.isSafeInteger(expiresAt)) return fail();
  return new Date(expiresAt);
};

const strictBase64urlDecode = (value: string): Buffer => {
  if (!BASE64URL.test(value)) return fail();
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) return fail();
  return decoded;
};

const sign = (encodedEnvelope: string, secret: string): Buffer => createHmac("sha256", secret)
  .update(encodedEnvelope)
  .digest();

const issueToken = (
  purpose: TokenPurpose,
  payload: unknown,
  now: Date,
  secretValue: string,
  lifetime: number,
): string => {
  const secret = requireSecret(secretValue);
  const issuedAt = epochMilliseconds(now);
  const exp = issuedAt + lifetime;
  if (!Number.isSafeInteger(exp)) return fail();
  const envelope: SignedEnvelope = { v: TOKEN_VERSION, purpose, exp, payload };
  const encodedEnvelope = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  return `${encodedEnvelope}.${sign(encodedEnvelope, secret).toString("base64url")}`;
};

const parseEnvelope = (
  tokenValue: unknown,
  purpose: TokenPurpose,
  now: Date,
  secretValue: string,
  lifetime: number,
): SignedEnvelope => {
  const secret = requireSecret(secretValue);
  const currentTime = epochMilliseconds(now);
  if (
    typeof tokenValue !== "string"
    || tokenValue.length < 1
    || tokenValue.length > MAXIMUM_TOKEN_LENGTH
  ) {
    return fail();
  }

  const parts = tokenValue.split(".");
  if (parts.length !== 2) return fail();
  const [encodedEnvelope, encodedSignature] = parts;
  const envelopeBytes = strictBase64urlDecode(encodedEnvelope);
  const actualSignature = strictBase64urlDecode(encodedSignature);
  const expectedSignature = sign(encodedEnvelope, secret);
  if (
    actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return fail();
  }

  const parsed = asRecord(JSON.parse(utf8Decoder.decode(envelopeBytes)) as unknown);
  if (!hasExactKeys(parsed, ["v", "purpose", "exp", "payload"])) return fail();
  if (parsed.v !== TOKEN_VERSION || parsed.purpose !== purpose) return fail();
  if (
    typeof parsed.exp !== "number"
    || !Number.isSafeInteger(parsed.exp)
    || parsed.exp <= 0
    || currentTime >= parsed.exp
    || parsed.exp - currentTime > lifetime
  ) {
    return fail();
  }
  return parsed as SignedEnvelope;
};

const subjectsEqual = (left: InquirySubject, right: InquirySubject): boolean => {
  if (left.kind !== right.kind) return false;
  return left.kind === "member"
    ? left.uid === (right as Extract<InquirySubject, { kind: "member" }>).uid
    : left.orderNumber === (right as Extract<InquirySubject, { kind: "guest" }>).orderNumber;
};

export const issueGuestInquiryToken = (
  orderNumber: string,
  now: Date,
  secret: string,
): string => withAccessError(() => issueToken(
  "guest-inquiry",
  { orderNumber: parseInquiryOrderNumber(orderNumber) },
  now,
  secret,
  GUEST_TOKEN_LIFETIME_MS,
));

export const verifyGuestInquiryToken = (
  token: string,
  now: Date,
  secret: string,
): Extract<InquirySubject, { kind: "guest" }> => withAccessError(() => {
  const envelope = parseEnvelope(token, "guest-inquiry", now, secret, GUEST_TOKEN_LIFETIME_MS);
  const payload = asRecord(envelope.payload);
  if (!hasExactKeys(payload, ["orderNumber"])) return fail();
  return { kind: "guest", orderNumber: parseInquiryOrderNumber(payload.orderNumber) };
});

export const issueUploadReceipt = (
  subject: InquirySubject,
  objectPath: string,
  contentType: InquiryImageContentType,
  declaredSize: number,
  now: Date,
  secret: string,
): string => withAccessError(() => issueToken(
  "inquiry-upload",
  {
    subject: normalizeSubject(subject),
    objectPath: normalizeObjectPath(objectPath),
    contentType: normalizeContentType(contentType),
    declaredSize: normalizeDeclaredSize(declaredSize),
  },
  now,
  secret,
  UPLOAD_RECEIPT_LIFETIME_MS,
));

export const verifyUploadReceipt = (
  token: string,
  expectedSubjectValue: InquirySubject,
  now: Date,
  secret: string,
): InquiryUploadReceipt => withAccessError(() => {
  const expectedSubject = normalizeSubject(expectedSubjectValue);
  const envelope = parseEnvelope(token, "inquiry-upload", now, secret, UPLOAD_RECEIPT_LIFETIME_MS);
  const payload = asRecord(envelope.payload);
  if (!hasExactKeys(payload, ["subject", "objectPath", "contentType", "declaredSize"])) {
    return fail();
  }
  const subject = normalizeSubject(payload.subject);
  if (!subjectsEqual(subject, expectedSubject)) return fail();
  return {
    subject,
    objectPath: normalizeObjectPath(payload.objectPath),
    contentType: normalizeContentType(payload.contentType),
    declaredSize: normalizeDeclaredSize(payload.declaredSize),
  };
});
