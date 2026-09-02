import { ServerAuthenticationError } from "../../../../lib/firebase/admin-auth";
import { inquiryRepository } from "../../../../lib/firebase/inquiries";
import { InquiryValidationError, parseInquiryListFilters } from "../../../../lib/inquiries/validation";
import {
  InquiryConfigurationError,
  logInquiryApiFailure,
  resolveInquirySubject,
  toInquiryPublic,
} from "../../../../lib/inquiries/server";

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
      return jsonMessage("문의 서버 설정이 필요합니다.", 503);
    }
    logInquiryApiFailure("Inquiry list", error);
    return jsonMessage("문의 목록을 불러오지 못했습니다.", 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonMessage("문의 조회 조건을 다시 확인해 주세요.", 400);
  }

  try {
    const filters = parseInquiryListFilters(body);
    const records = subject.kind === "member"
      ? await inquiryRepository.listForMember(subject.uid, filters)
      : await inquiryRepository.listForGuestOrder(subject.orderNumber, filters);
    return Response.json({ inquiries: records.map(toInquiryPublic) });
  } catch (error) {
    if (error instanceof InquiryValidationError) {
      return jsonMessage("문의 조회 조건을 다시 확인해 주세요.", 400);
    }
    logInquiryApiFailure("Inquiry list", error);
    return jsonMessage("문의 목록을 불러오지 못했습니다.", 500);
  }
}
