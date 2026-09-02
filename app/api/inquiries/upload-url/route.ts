import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import { ServerAuthenticationError } from "../../../../lib/firebase/admin-auth";
import { createInquiryUploadUrl } from "../../../../lib/firebase/inquiry-uploads";
import {
  InquiryConfigurationError,
  logInquiryApiFailure,
  requiredInquiryTokenSecret,
  resolveInquirySubject,
} from "../../../../lib/inquiries/server";
import { InquiryUploadError, validateUploadRequest } from "../../../../lib/inquiries/uploads";

export const runtime = "nodejs";

const jsonMessage = (message: string, status: number): Response =>
  Response.json({ message }, { status });

export async function POST(request: Request): Promise<Response> {
  let subject;
  try {
    subject = await resolveInquirySubject(request);
  } catch (error) {
    if (error instanceof ServerAuthenticationError) {
      return jsonMessage("로그인이 필요하거나 비회원 인증이 만료되었습니다.", 401);
    }
    if (error instanceof InquiryConfigurationError) {
      return jsonMessage("문의 이미지 서버 설정이 필요합니다.", 503);
    }
    logInquiryApiFailure("Inquiry upload URL", error);
    return jsonMessage("문의 이미지 업로드 준비 중 문제가 발생했습니다.", 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonMessage("문의 이미지를 다시 확인해 주세요.", 400);
  }

  try {
    const upload = validateUploadRequest(body);
    const signed = await createInquiryUploadUrl({
      subject,
      contentType: upload.contentType,
      declaredSize: upload.size,
      now: new Date(),
      secret: requiredInquiryTokenSecret(),
    });
    return Response.json({
      uploadUrl: signed.uploadUrl,
      receipt: signed.receipt,
      expiresAt: signed.expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof InquiryUploadError) {
      return jsonMessage("문의 이미지를 다시 확인해 주세요.", 400);
    }
    if (
      error instanceof InquiryConfigurationError
      || error instanceof FirebaseAdminConfigurationError
    ) {
      return jsonMessage("문의 이미지 서버 설정이 필요합니다.", 503);
    }
    logInquiryApiFailure("Inquiry upload URL", error);
    return jsonMessage("문의 이미지 업로드 준비 중 문제가 발생했습니다.", 500);
  }
}
