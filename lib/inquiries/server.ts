import { randomUUID } from "node:crypto";

import { FirebaseAdminConfigurationError } from "../firebase/admin";
import { ServerAuthenticationError, verifyBearerMember } from "../firebase/admin-auth";
import {
  InquiryAccessError,
  verifyGuestInquiryToken,
  type InquirySubject,
} from "./access";
import type { InquiryCreateInput, InquiryPublic, InquiryRecord } from "./types";

const MINIMUM_SECRET_LENGTH = 32;

export class InquiryConfigurationError extends Error {
  constructor() {
    super("Inquiry server configuration is required.");
    this.name = "InquiryConfigurationError";
  }
}

export const requiredInquiryTokenSecret = (): string => {
  const secret = process.env.INQUIRY_TOKEN_SECRET?.trim();
  if (!secret || [...secret].length < MINIMUM_SECRET_LENGTH) {
    throw new InquiryConfigurationError();
  }
  return secret;
};

type ResolveInquirySubjectDependencies = {
  now?: () => Date;
  requiredSecret?: () => string;
  verifyGuestToken?: (
    token: string,
    now: Date,
    secret: string,
  ) => Extract<InquirySubject, { kind: "guest" }>;
  verifyBearerMember?: (request: Request) => Promise<{ uid: string }>;
};

export async function resolveInquirySubject(
  request: Request,
  dependencies: ResolveInquirySubjectDependencies = {},
): Promise<InquirySubject> {
  if (request.headers.has("x-inquiry-access")) {
    const guestToken = request.headers.get("x-inquiry-access") ?? "";
    const now = (dependencies.now ?? (() => new Date()))();
    const secret = (dependencies.requiredSecret ?? requiredInquiryTokenSecret)();
    try {
      return (dependencies.verifyGuestToken ?? verifyGuestInquiryToken)(guestToken, now, secret);
    } catch (error) {
      if (error instanceof InquiryAccessError) throw new ServerAuthenticationError(401);
      throw error;
    }
  }

  try {
    const member = await (dependencies.verifyBearerMember ?? verifyBearerMember)(request);
    return { kind: "member", uid: member.uid };
  } catch (error) {
    if (error instanceof FirebaseAdminConfigurationError) {
      throw new InquiryConfigurationError();
    }
    throw error;
  }
}

export const createInquiryRecord = (
  subject: InquirySubject,
  input: InquiryCreateInput,
  id: string,
  now: Date,
): InquiryRecord => {
  const shared = {
    id,
    category: input.category,
    title: input.title,
    body: input.body,
    status: "waiting" as const,
    attachments: [],
    adminReply: null,
    repliedAt: null,
    repliedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  if (subject.kind === "guest") {
    return {
      ...shared,
      ownerType: "guest",
      memberUid: null,
      guestOrderNumber: subject.orderNumber,
      orderNumber: subject.orderNumber,
    };
  }
  return {
    ...shared,
    ownerType: "member",
    memberUid: subject.uid,
    guestOrderNumber: null,
    orderNumber: input.orderNumber,
  };
};

export const inquirySubjectOwnsRecord = (
  subject: InquirySubject,
  record: InquiryRecord,
): boolean => subject.kind === "member"
  ? record.ownerType === "member" && record.memberUid === subject.uid
  : record.ownerType === "guest" && record.guestOrderNumber === subject.orderNumber;

const controlCharacter = (value: string): boolean => [...value].some((character) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
});

export const parseInquiryId = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 256 || controlCharacter(value)) {
    throw new Error("Invalid inquiry ID.");
  }
  const id = value.trim();
  if (!id || [...id].length > 128 || id.includes("/")) throw new Error("Invalid inquiry ID.");
  return id;
};

export const logInquiryApiFailure = (name: string, error: unknown): void => {
  const className = error instanceof Error ? error.constructor.name : "UnknownError";
  const errorClass = /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(className)
    ? className
    : "UnknownError";
  console.error(`${name} API failure`, { errorClass, requestId: randomUUID() });
};

const toIso = (date: Date): string => date.toISOString();

export const toInquiryPublic = (record: InquiryRecord): InquiryPublic => ({
  id: record.id,
  ownerType: record.ownerType,
  orderNumber: record.orderNumber,
  category: record.category,
  title: record.title,
  body: record.body,
  status: record.status,
  attachments: record.attachments.map((attachment) => ({
    id: attachment.id,
    originalName: attachment.originalName,
    contentType: attachment.contentType,
    size: attachment.size,
    readUrl: null,
  })),
  adminReply: record.adminReply,
  repliedAt: record.repliedAt === null ? null : toIso(record.repliedAt),
  createdAt: toIso(record.createdAt),
  updatedAt: toIso(record.updatedAt),
});
