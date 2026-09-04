import { InquiryClientError, parseInquiry, post } from "./client";
import type { InquiryListFilters, InquiryPublic } from "./types";

const endpoint = "/api/admin/inquiries";

// Share the existing fresh-token/cancellation transport; no guest authority is accepted.
async function request(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  try {
    return await post(path, body, { kind: "member" }, false, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof InquiryClientError) {
      if (error.status === 401 || error.status === 403) {
        throw new InquiryClientError("관리자 권한을 확인하고 다시 로그인해 주세요.", error.status);
      }
      throw error;
    }
    throw new InquiryClientError();
  }
}

function envelope(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InquiryClientError();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !(key in record)) throw new InquiryClientError();
  return record[key];
}

function parseAdminInquiry(value: unknown): InquiryPublic {
  const inquiry = parseInquiry(value);
  if (
    inquiry.id.trim() !== inquiry.id
    || inquiry.id.includes("/")
    || [...inquiry.id].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    })
  ) {
    throw new InquiryClientError();
  }
  return inquiry;
}

export type AdminInquiryClient = {
  count(signal?: AbortSignal): Promise<number>;
  list(filters?: Partial<InquiryListFilters>, signal?: AbortSignal): Promise<InquiryPublic[]>;
  get(id: string, signal?: AbortSignal): Promise<InquiryPublic>;
  reply(id: string, adminReply: string, signal?: AbortSignal): Promise<InquiryPublic>;
  delete(id: string, signal?: AbortSignal): Promise<void>;
};

export const adminInquiryClient: AdminInquiryClient = {
  async count(signal) {
    const count = envelope(await request(endpoint, { action: "count" }, signal), "waitingCount");
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new InquiryClientError();
    return count;
  },
  async list(filters = {}, signal) {
    const { category, status, pageSize, cursor } = filters;
    const rows = envelope(await request(endpoint, { action: "list", category, status, pageSize, cursor }, signal), "inquiries");
    if (!Array.isArray(rows) || rows.length > 50) throw new InquiryClientError();
    return rows.map(parseAdminInquiry);
  },
  async get(id, signal) {
    return parseAdminInquiry(envelope(await request(endpoint, { action: "detail", id }, signal), "inquiry"));
  },
  async reply(id, adminReply, signal) {
    return parseAdminInquiry(envelope(await request(endpoint + "/reply", { id, adminReply }, signal), "inquiry"));
  },
  async delete(id, signal) {
    const result = await request(endpoint + "/delete", { id }, signal);
    if (result !== undefined) throw new InquiryClientError();
  },
};
