import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import { ServerAuthenticationError, verifyBearerAdmin } from "../../../../lib/firebase/admin-auth";
import { inquiryRepository } from "../../../../lib/firebase/inquiries";
import { createInquiryAttachmentReadUrls } from "../../../../lib/firebase/inquiry-uploads";
import { logInquiryApiFailure, parseInquiryId, toInquiryPublic } from "../../../../lib/inquiries/server";
import { parseInquiryListFilters } from "../../../../lib/inquiries/validation";
import type { InquiryListFilters } from "../../../../lib/inquiries/types";

export const runtime = "nodejs";

const message = (text: string, status: number) => Response.json({ message: text }, { status });
type Query = { action: "count" } | { action: "list"; filters: InquiryListFilters } | { action: "detail"; id: string };

function parseQuery(value: unknown): Query {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid query");
  const input = value as Record<string, unknown>;
  const allowed = input.action === "count" ? ["action"]
    : input.action === "detail" ? ["action", "id"]
      : input.action === "list" ? ["action", "category", "status", "pageSize", "cursor"] : [];
  if (!allowed.length || Object.keys(input).some((key) => !allowed.includes(key))) throw new Error("Invalid query");
  if (input.action === "count") return { action: "count" };
  if (input.action === "detail") return { action: "detail", id: parseInquiryId(input.id) };
  const filters = parseInquiryListFilters(input);
  if (filters.cursor) filters.cursor = parseInquiryId(filters.cursor);
  return { action: "list", filters };
}

export async function POST(request: Request): Promise<Response> {
  try {
    await verifyBearerAdmin(request);
    let query: Query;
    try {
      query = parseQuery(await request.json());
    } catch {
      return message("문의 조회 조건을 다시 확인해 주세요.", 400);
    }
    if (query.action === "count") {
      const waitingCount = await inquiryRepository.countWaiting();
      if (!Number.isSafeInteger(waitingCount) || waitingCount < 0) throw new Error("Invalid count");
      return Response.json({ waitingCount });
    }
    if (query.action === "list") {
      const records = await inquiryRepository.listAdmin(query.filters);
      return Response.json({ inquiries: records.map(toInquiryPublic) });
    }
    const record = await inquiryRepository.get(query.id);
    if (!record) return message("문의 정보를 찾을 수 없습니다.", 404);
    const urls = await createInquiryAttachmentReadUrls(record.attachments, new Date());
    if (urls.length !== record.attachments.length) throw new Error("Incomplete signing result");
    const inquiry = toInquiryPublic(record);
    inquiry.attachments = inquiry.attachments.map((attachment, index) => ({ ...attachment, readUrl: urls[index] }));
    return Response.json({ inquiry });
  } catch (error) {
    if (error instanceof ServerAuthenticationError) return message("관리자 로그인이 필요합니다.", error.status);
    if (error instanceof FirebaseAdminConfigurationError) return message("문의 서비스를 잠시 사용할 수 없습니다.", 503);
    logInquiryApiFailure("Admin inquiry", error);
    return message("문의 정보를 불러오지 못했습니다.", 500);
  }
}
