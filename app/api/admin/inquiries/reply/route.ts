import { FirebaseAdminConfigurationError } from "../../../../../lib/firebase/admin";
import { ServerAuthenticationError, verifyBearerAdmin } from "../../../../../lib/firebase/admin-auth";
import { inquiryRepository } from "../../../../../lib/firebase/inquiries";
import { logInquiryApiFailure, parseInquiryId, toInquiryPublic } from "../../../../../lib/inquiries/server";
import { parseInquiryReplyInput } from "../../../../../lib/inquiries/validation";

export const runtime = "nodejs";
const message = (text: string, status: number) => Response.json({ message: text }, { status });

export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await verifyBearerAdmin(request);
    let id: string;
    let adminReply: string;
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid reply");
      if (Object.keys(input).some((key) => key !== "id" && key !== "adminReply")) throw new Error("Invalid reply");
      id = parseInquiryId((input as Record<string, unknown>).id);
      adminReply = parseInquiryReplyInput(input).adminReply;
    } catch {
      return message("답변 내용을 다시 확인해 주세요.", 400);
    }
    const record = await inquiryRepository.get(id);
    if (!record) return message("문의 정보를 찾을 수 없습니다.", 404);
    const repliedAt = new Date();
    await inquiryRepository.reply(id, { adminReply, repliedBy: admin.uid, repliedAt });
    return Response.json({ inquiry: toInquiryPublic({
      ...record, status: "answered", adminReply, repliedBy: admin.uid, repliedAt, updatedAt: repliedAt,
    }) });
  } catch (error) {
    if (error instanceof ServerAuthenticationError) return message("관리자 로그인이 필요합니다.", error.status);
    if (error instanceof FirebaseAdminConfigurationError) return message("문의 서비스를 잠시 사용할 수 없습니다.", 503);
    logInquiryApiFailure("Admin inquiry reply", error);
    return message("답변을 저장하지 못했습니다.", 500);
  }
}
