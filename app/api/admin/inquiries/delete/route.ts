import { FirebaseAdminConfigurationError } from "../../../../../lib/firebase/admin";
import { ServerAuthenticationError, verifyBearerAdmin } from "../../../../../lib/firebase/admin-auth";
import { inquiryRepository } from "../../../../../lib/firebase/inquiries";
import { deleteInquiryObjects } from "../../../../../lib/firebase/inquiry-uploads";
import { logInquiryApiFailure, parseInquiryId } from "../../../../../lib/inquiries/server";

export const runtime = "nodejs";
const message = (text: string, status: number) => Response.json({ message: text }, { status });

export async function POST(request: Request): Promise<Response> {
  try {
    await verifyBearerAdmin(request);
    let id: string;
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid deletion");
      if (Object.keys(input).some((key) => key !== "id")) throw new Error("Invalid deletion");
      id = parseInquiryId((input as Record<string, unknown>).id);
    } catch {
      return message("문의 정보를 다시 확인해 주세요.", 400);
    }
    const record = await inquiryRepository.get(id);
    if (!record) return new Response(null, { status: 204 });
    // Keep the only metadata until Storage succeeds. Missing objects are safe on retry.
    await deleteInquiryObjects(record.attachments.map((attachment) => attachment.storagePath));
    await inquiryRepository.delete(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ServerAuthenticationError) return message("관리자 로그인이 필요합니다.", error.status);
    if (error instanceof FirebaseAdminConfigurationError) return message("문의 서비스를 잠시 사용할 수 없습니다.", 503);
    logInquiryApiFailure("Admin inquiry delete", error);
    return message("문의를 삭제하지 못했습니다. 다시 시도해 주세요.", 500);
  }
}
