import { getCurrentFirebaseIdToken } from "../firebase/id-token";
import type { GuestOrderPublic } from "../guest-orders/types";
import type {
  InquiryCategory,
  InquiryCreateInput,
  InquiryImageContentType,
  InquiryListFilters,
  InquiryPublic,
  InquiryStatus,
} from "./types";

const ORDER_NUMBER = /^VL-\d{8}-[A-Z0-9]{6}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_MONEY = 1_000_000_000;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

const categories: ReadonlySet<InquiryCategory> = new Set([
  "order",
  "shipping",
  "product",
  "return",
  "other",
]);
const statuses: ReadonlySet<InquiryStatus> = new Set(["waiting", "answered"]);
const contentTypes: ReadonlySet<InquiryImageContentType> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type InquiryClientAccess =
  | { kind: "member" }
  | { kind: "guest"; token: string };

export type GuestInquiryAccess = {
  order: GuestOrderPublic;
  accessToken: string;
  expiresAt: string;
};

export class InquiryClientError extends Error {
  constructor(message = "문의 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
    super(message);
    this.name = "InquiryClientError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InquiryClientError();
  }
  return value as Record<string, unknown>;
};

const hasControlCharacter = (value: string): boolean => [...value].some((character) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
});

const text = (value: unknown, maximum: number): string => {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || hasControlCharacter(value)
  ) {
    throw new InquiryClientError();
  }
  return value;
};

const optionalText = (value: unknown, maximum: number): string => {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > maximum || hasControlCharacter(value)) {
    throw new InquiryClientError();
  }
  return value;
};

const integer = (value: unknown, minimum: number, maximum: number): number => {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new InquiryClientError();
  }
  return value;
};

const parseTimestamp = (value: unknown): string => {
  const timestamp = text(value, 64);
  const date = new Date(timestamp);
  if (!ISO_TIMESTAMP.test(timestamp) || Number.isNaN(date.getTime()) || date.toISOString() !== timestamp) {
    throw new InquiryClientError();
  }
  return timestamp;
};

const parseOrderNumber = (value: unknown): string => {
  const orderNumber = text(value, 32);
  if (!ORDER_NUMBER.test(orderNumber)) throw new InquiryClientError();
  return orderNumber;
};

const parsePublicOrder = (value: unknown): GuestOrderPublic => {
  const order = asRecord(value);
  const orderNumber = parseOrderNumber(order.orderNumber);
  if (order.status !== "mock-received") throw new InquiryClientError();
  if (!Array.isArray(order.lines) || order.lines.length < 1 || order.lines.length > 20) {
    throw new InquiryClientError();
  }
  return {
    orderNumber,
    status: "mock-received",
    receivedAt: parseTimestamp(order.receivedAt),
    customerNameMasked: text(order.customerNameMasked, 50),
    phoneMasked: text(order.phoneMasked, 30),
    addressMasked: text(order.addressMasked, 250),
    lines: order.lines.map((item) => {
      const line = asRecord(item);
      return {
        productId: text(line.productId, 128),
        purchaseOptionId: text(line.purchaseOptionId, 128),
        purchaseOptionLabel: text(line.purchaseOptionLabel, 200),
        sku: optionalText(line.sku, 200),
        name: text(line.name, 200),
        thumbnailUrl: optionalText(line.thumbnailUrl, 2_000),
        basePrice: integer(line.basePrice, 0, MAX_MONEY),
        priceAdjustment: integer(line.priceAdjustment, -MAX_MONEY, MAX_MONEY),
        unitPrice: integer(line.unitPrice, 0, MAX_MONEY),
        quantity: integer(line.quantity, 1, 999),
        lineTotal: integer(line.lineTotal, 0, MAX_MONEY),
      };
    }),
    subtotal: integer(order.subtotal, 0, MAX_MONEY),
    shippingFee: integer(order.shippingFee, 0, MAX_MONEY),
    total: integer(order.total, 0, MAX_MONEY),
  };
};

const parseInquiry = (value: unknown): InquiryPublic => {
  const inquiry = asRecord(value);
  const ownerType = inquiry.ownerType;
  const category = inquiry.category;
  const status = inquiry.status;
  if ((ownerType !== "member" && ownerType !== "guest") || !categories.has(category as InquiryCategory)) {
    throw new InquiryClientError();
  }
  if (!statuses.has(status as InquiryStatus) || !Array.isArray(inquiry.attachments) || inquiry.attachments.length > 3) {
    throw new InquiryClientError();
  }
  const orderNumber = ownerType === "guest"
    ? parseOrderNumber(inquiry.orderNumber)
    : inquiry.orderNumber === null ? null : parseOrderNumber(inquiry.orderNumber);
  const adminReply = inquiry.adminReply;
  if (adminReply !== null && typeof adminReply !== "string") throw new InquiryClientError();
  const repliedAt = inquiry.repliedAt === null ? null : parseTimestamp(inquiry.repliedAt);
  if (
    (status === "waiting" && (adminReply !== null || repliedAt !== null))
    || (status === "answered" && (adminReply === null || repliedAt === null))
  ) {
    throw new InquiryClientError();
  }
  return {
    id: text(inquiry.id, 128),
    ownerType,
    orderNumber,
    category: category as InquiryCategory,
    title: text(inquiry.title, 100),
    body: text(inquiry.body, 3_000),
    status: status as InquiryStatus,
    attachments: inquiry.attachments.map((item) => {
      const attachment = asRecord(item);
      const contentType = attachment.contentType;
      if (!contentTypes.has(contentType as InquiryImageContentType) || attachment.readUrl !== null) {
        throw new InquiryClientError();
      }
      return {
        id: text(attachment.id, 160),
        originalName: text(attachment.originalName, 255),
        contentType: contentType as InquiryImageContentType,
        size: integer(attachment.size, 1, MAX_ATTACHMENT_SIZE),
        readUrl: null,
      };
    }),
    adminReply: adminReply === null ? null : text(adminReply, 3_000),
    repliedAt,
    createdAt: parseTimestamp(inquiry.createdAt),
    updatedAt: parseTimestamp(inquiry.updatedAt),
  };
};

const errorMessage = (status: number, guestVerification = false): string => {
  if (status === 400) {
    return guestVerification
      ? "주문번호와 휴대전화 번호를 다시 확인해 주세요."
      : "문의 내용을 다시 확인해 주세요.";
  }
  if (status === 401) return "로그인이 필요하거나 비회원 인증이 만료되었습니다.";
  if (status === 404) {
    return guestVerification
      ? "주문번호와 휴대전화 번호를 다시 확인해 주세요."
      : "문의 정보를 찾을 수 없습니다.";
  }
  if (status === 429) return "잠시 후 다시 시도해 주세요.";
  if (status === 503) return "문의 서비스를 잠시 사용할 수 없습니다.";
  return "문의 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
};

const requestHeaders = async (access: InquiryClientAccess): Promise<Record<string, string>> => {
  if (access.kind === "guest") {
    return { "content-type": "application/json", "x-inquiry-access": text(access.token, 8_192) };
  }
  const token = await getCurrentFirebaseIdToken();
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
};

const post = async (
  url: string,
  body: unknown,
  access?: InquiryClientAccess,
  guestVerification = false,
): Promise<unknown> => {
  const headers = access
    ? await requestHeaders(access)
    : { "content-type": "application/json" };
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new InquiryClientError(errorMessage(response.status, guestVerification));
  try {
    return await response.json();
  } catch {
    throw new InquiryClientError();
  }
};

const createPayload = (input: InquiryCreateInput) => ({
  category: input.category,
  title: input.title,
  body: input.body,
  orderNumber: input.orderNumber,
  uploadReceipts: input.uploadReceipts,
});

const listPayload = (filters: Partial<InquiryListFilters>) => {
  const payload: Record<string, unknown> = {};
  if (filters.category !== undefined) payload.category = filters.category;
  if (filters.status !== undefined) payload.status = filters.status;
  if (filters.pageSize !== undefined) payload.pageSize = filters.pageSize;
  if (filters.cursor !== undefined) payload.cursor = filters.cursor;
  return payload;
};

export async function verifyGuestInquiryAccess(
  orderNumber: string,
  phone: string,
): Promise<GuestInquiryAccess> {
  const response = asRecord(await post(
    "/api/inquiries/guest-verify",
    { orderNumber, phone },
    undefined,
    true,
  ));
  return {
    order: parsePublicOrder(response.order),
    accessToken: text(response.accessToken, 8_192),
    expiresAt: parseTimestamp(response.expiresAt),
  };
}

export async function createInquiry(
  access: InquiryClientAccess,
  input: InquiryCreateInput,
): Promise<InquiryPublic> {
  return parseInquiry(await post("/api/inquiries", createPayload(input), access));
}

export async function listInquiries(
  access: InquiryClientAccess,
  filters: Partial<InquiryListFilters> = {},
): Promise<InquiryPublic[]> {
  const response = asRecord(await post("/api/inquiries/list", listPayload(filters), access));
  if (!Array.isArray(response.inquiries)) throw new InquiryClientError();
  return response.inquiries.map(parseInquiry);
}

export async function getInquiry(access: InquiryClientAccess, id: string): Promise<InquiryPublic> {
  const response = asRecord(await post("/api/inquiries/detail", { id }, access));
  return parseInquiry(response.inquiry);
}
