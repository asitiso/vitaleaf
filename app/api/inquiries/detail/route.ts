import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import { ServerAuthenticationError } from "../../../../lib/firebase/admin-auth";
import { createInquiryAttachmentReadUrls } from "../../../../lib/firebase/inquiry-uploads";
import { inquiryRepository } from "../../../../lib/firebase/inquiries";
import {
  InquiryConfigurationError,
  inquirySubjectOwnsRecord,
  logInquiryApiFailure,
  parseInquiryId,
  resolveInquirySubject,
  toInquiryPublic,
} from "../../../../lib/inquiries/server";

export const runtime = "nodejs";

const notFound = (): Response => Response.json({ message: "문의 정보를 찾을 수 없습니다." }, { status: 404 });
const jsonMessage = (message: string, status: number): Response =>
  Response.json({ message }, { status });

const requestId = (value: unknown): string => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid inquiry detail request.");
  }
  return parseInquiryId((value as Record<string, unknown>).id);
};

export async function POST(request: Request): Promise<Response> {
  let subject;
  try {
    subject = await resolveInquirySubject(request);
  } catch (error) {
    if (error instanceof ServerAuthenticationError) {
      return jsonMessage("로그인이 필요하거나 비회원 인증이 만료되었습니다.", 401);
    }
    if (error instanceof InquiryConfigurationError) {
      return jsonMessage("문의 서버 설정이 필요합니다.", 503);
    }
    logInquiryApiFailure("Inquiry detail", error);
    return jsonMessage("문의 정보를 불러오지 못했습니다.", 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonMessage("문의 정보를 다시 확인해 주세요.", 400);
  }

  let id: string;
  try {
    id = requestId(body);
  } catch {
    return jsonMessage("문의 정보를 다시 확인해 주세요.", 400);
  }

  try {
    const record = await inquiryRepository.get(id);
    if (!record || !inquirySubjectOwnsRecord(subject, record)) return notFound();
    const readUrls = await createInquiryAttachmentReadUrls(record.attachments, new Date());
    if (readUrls.length !== record.attachments.length) {
      throw new Error("Incomplete inquiry attachment signing result.");
    }
    const inquiry = toInquiryPublic(record);
    return Response.json({
      inquiry: {
        ...inquiry,
        attachments: inquiry.attachments.map((attachment, index) => ({
          ...attachment,
          readUrl: readUrls[index],
        })),
      },
    });
  } catch (error) {
    if (error instanceof FirebaseAdminConfigurationError) {
      return jsonMessage("문의 이미지 서버 설정이 필요합니다.", 503);
    }
    logInquiryApiFailure("Inquiry detail", error);
    return jsonMessage("문의 정보를 불러오지 못했습니다.", 500);
  }
}
