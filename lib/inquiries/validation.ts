import type {
  InquiryAttachment,
  InquiryCategory,
  InquiryCreateInput,
  InquiryImageContentType,
  InquiryListFilters,
  InquiryOwner,
  InquiryRecord,
  InquiryStatus,
} from "./types";

const ORDER_NUMBER = /^VL-\d{8}-[A-Z0-9]{6}$/u;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_UPLOAD_RECEIPT_LENGTH = 512;
const MAX_CURSOR_LENGTH = 512;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const CATEGORIES: ReadonlySet<InquiryCategory> = new Set([
  "order",
  "shipping",
  "product",
  "return",
  "other",
]);
const STATUSES: ReadonlySet<InquiryStatus> = new Set(["waiting", "answered"]);
const IMAGE_CONTENT_TYPES: ReadonlySet<InquiryImageContentType> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export class InquiryValidationError extends Error {
  constructor(message = "문의 내용을 다시 확인해 주세요.") {
    super(message);
    this.name = "InquiryValidationError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InquiryValidationError();
  }
  return value as Record<string, unknown>;
};

const characterLength = (value: string): number => [...value].length;

const containsForbiddenControlCharacter = (
  value: string,
  allowBodyWhitespace = false,
): boolean => [...value].some((character) => {
  if (allowBodyWhitespace && (character === "\n" || character === "\t")) return false;
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
});

const normalizeText = (
  value: unknown,
  maximum: number,
  { allowBodyWhitespace = false, required = true }: { allowBodyWhitespace?: boolean; required?: boolean } = {},
): string => {
  if (typeof value !== "string" || value.length > maximum * 2) {
    throw new InquiryValidationError();
  }
  const lineBreakNormalized = allowBodyWhitespace ? value.replace(/\r\n?/gu, "\n") : value;
  if (containsForbiddenControlCharacter(lineBreakNormalized, allowBodyWhitespace)) {
    throw new InquiryValidationError();
  }
  const normalized = lineBreakNormalized.trim();
  if ((required && normalized.length === 0) || characterLength(normalized) > maximum) {
    throw new InquiryValidationError();
  }
  return normalized;
};

const parseCategory = (value: unknown): InquiryCategory => {
  if (typeof value === "string" && CATEGORIES.has(value as InquiryCategory)) {
    return value as InquiryCategory;
  }
  throw new InquiryValidationError();
};

const parseStatus = (value: unknown): InquiryStatus => {
  if (typeof value === "string" && STATUSES.has(value as InquiryStatus)) {
    return value as InquiryStatus;
  }
  throw new InquiryValidationError();
};

export const parseInquiryOrderNumber = (value: unknown): string => {
  const orderNumber = normalizeText(value, 32);
  if (!ORDER_NUMBER.test(orderNumber)) throw new InquiryValidationError();
  return orderNumber;
};

const parseOptionalOrderNumber = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const orderNumber = normalizeText(value, 32, { required: false });
  if (orderNumber.length === 0) return null;
  return parseInquiryOrderNumber(orderNumber);
};

const parseUploadReceipts = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) {
    throw new InquiryValidationError();
  }
  const receipts = value.map((receipt) => normalizeText(receipt, MAX_UPLOAD_RECEIPT_LENGTH));
  if (new Set(receipts).size !== receipts.length) throw new InquiryValidationError();
  return receipts;
};

export const parseInquiryCreateInput = (value: unknown): InquiryCreateInput => {
  const input = asRecord(value);
  return {
    category: parseCategory(input.category),
    title: normalizeText(input.title, 100),
    body: normalizeText(input.body, 3_000, { allowBodyWhitespace: true }),
    orderNumber: parseOptionalOrderNumber(input.orderNumber),
    uploadReceipts: parseUploadReceipts(input.uploadReceipts),
  };
};

const parseOptionalCategory = (value: unknown): InquiryCategory | null => {
  if (value === undefined || value === null || value === "") return null;
  return parseCategory(value);
};

const parseOptionalStatus = (value: unknown): InquiryStatus | null => {
  if (value === undefined || value === null || value === "") return null;
  return parseStatus(value);
};

const parsePageSize = (value: unknown): number => {
  if (value === undefined || value === null) return DEFAULT_PAGE_SIZE;
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 1
    || value > MAX_PAGE_SIZE
  ) {
    throw new InquiryValidationError();
  }
  return value;
};

const parseCursor = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const cursor = normalizeText(value, MAX_CURSOR_LENGTH, { required: false });
  return cursor.length === 0 ? null : cursor;
};

export const parseInquiryListFilters = (value: unknown = {}): InquiryListFilters => {
  const input = asRecord(value);
  return {
    category: parseOptionalCategory(input.category),
    status: parseOptionalStatus(input.status),
    pageSize: parsePageSize(input.pageSize),
    cursor: parseCursor(input.cursor),
  };
};

const parseIdentifier = (value: unknown, maximum: number): string => normalizeText(value, maximum);

const parseDate = (value: unknown): Date => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new InquiryValidationError();
  return value;
};

const parseAttachment = (value: unknown): InquiryAttachment => {
  const attachment = asRecord(value);
  const contentType = attachment.contentType;
  const size = attachment.size;
  if (typeof contentType !== "string" || !IMAGE_CONTENT_TYPES.has(contentType as InquiryImageContentType)) {
    throw new InquiryValidationError();
  }
  if (
    typeof size !== "number"
    || !Number.isSafeInteger(size)
    || size < 1
    || size > MAX_ATTACHMENT_SIZE
  ) {
    throw new InquiryValidationError();
  }
  return {
    id: parseIdentifier(attachment.id, 160),
    storagePath: parseIdentifier(attachment.storagePath, 1_024),
    originalName: parseIdentifier(attachment.originalName, 255),
    contentType: contentType as InquiryImageContentType,
    size,
  };
};

const parseAttachments = (value: unknown, inquiryId: string): InquiryAttachment[] => {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new InquiryValidationError();
  const attachments = value.map(parseAttachment);
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const storagePaths = new Set(attachments.map((attachment) => attachment.storagePath));
  const expectedPrefix = `inquiries/${inquiryId}/`;
  if (
    attachmentIds.size !== attachments.length
    || storagePaths.size !== attachments.length
    || attachments.some((attachment) => !attachment.storagePath.startsWith(expectedPrefix))
  ) {
    throw new InquiryValidationError();
  }
  return attachments;
};

const parseOwner = (input: Record<string, unknown>): InquiryOwner => {
  if (input.ownerType === "member") {
    if (input.guestOrderNumber !== null) throw new InquiryValidationError();
    return {
      ownerType: "member",
      memberUid: parseIdentifier(input.memberUid, 128),
      guestOrderNumber: null,
    };
  }
  if (input.ownerType === "guest") {
    if (input.memberUid !== null) throw new InquiryValidationError();
    const guestOrderNumber = parseOptionalOrderNumber(input.guestOrderNumber);
    if (guestOrderNumber === null) throw new InquiryValidationError();
    return { ownerType: "guest", memberUid: null, guestOrderNumber };
  }
  throw new InquiryValidationError();
};

const parseReply = (input: Record<string, unknown>, status: InquiryStatus): Pick<
  InquiryRecord,
  "adminReply" | "repliedAt" | "repliedBy"
> => {
  if (status === "waiting") {
    if (input.adminReply !== null || input.repliedAt !== null || input.repliedBy !== null) {
      throw new InquiryValidationError();
    }
    return { adminReply: null, repliedAt: null, repliedBy: null };
  }
  return {
    adminReply: normalizeText(input.adminReply, 3_000, { allowBodyWhitespace: true }),
    repliedAt: parseDate(input.repliedAt),
    repliedBy: parseIdentifier(input.repliedBy, 128),
  };
};

export const parseInquiryRecord = (value: unknown): InquiryRecord => {
  const input = asRecord(value);
  const id = parseIdentifier(input.id, 128);
  if (id.includes("/")) throw new InquiryValidationError();
  const owner = parseOwner(input);
  const orderNumber = parseOptionalOrderNumber(input.orderNumber);
  if (owner.ownerType === "guest" && orderNumber !== owner.guestOrderNumber) {
    throw new InquiryValidationError();
  }
  const createdAt = parseDate(input.createdAt);
  const updatedAt = parseDate(input.updatedAt);
  if (updatedAt.getTime() < createdAt.getTime()) throw new InquiryValidationError();
  const status = parseStatus(input.status);
  return {
    id,
    ...owner,
    orderNumber,
    category: parseCategory(input.category),
    title: normalizeText(input.title, 100),
    body: normalizeText(input.body, 3_000, { allowBodyWhitespace: true }),
    status,
    attachments: parseAttachments(input.attachments, id),
    ...parseReply(input, status),
    createdAt,
    updatedAt,
  };
};
