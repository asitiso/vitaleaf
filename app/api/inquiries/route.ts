import { randomUUID } from "node:crypto";

import { ServerAuthenticationError } from "../../../lib/firebase/admin-auth";
import { inquiryRepository } from "../../../lib/firebase/inquiries";
import { InquiryValidationError, parseInquiryCreateInput } from "../../../lib/inquiries/validation";
import {
  InquiryConfigurationError,
  createInquiryRecord,
  logInquiryApiFailure,
  resolveInquirySubject,
  toInquiryPublic,
} from "../../../lib/inquiries/server";

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
    logInquiryApiFailure("Inquiry create", error);
    return jsonMessage("문의 등록 중 문제가 발생했습니다.", 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonMessage("문의 내용을 다시 확인해 주세요.", 400);
  }

  try {
    const input = parseInquiryCreateInput(body);
    if (input.uploadReceipts.length > 0) throw new InquiryValidationError();
    const record = createInquiryRecord(subject, input, randomUUID(), new Date());
    await inquiryRepository.create(record);
    return Response.json(toInquiryPublic(record), { status: 201 });
  } catch (error) {
    if (error instanceof InquiryValidationError) {
      return jsonMessage("문의 내용을 다시 확인해 주세요.", 400);
    }
    logInquiryApiFailure("Inquiry create", error);
    return jsonMessage("문의 등록 중 문제가 발생했습니다.", 500);
  }
}
