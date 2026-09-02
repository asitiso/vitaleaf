import { randomUUID } from "node:crypto";

import { FirebaseAdminConfigurationError } from "../../../lib/firebase/admin";
import { ServerAuthenticationError } from "../../../lib/firebase/admin-auth";
import {
  deleteInquiryObjects,
  finalizeInquiryUploads,
} from "../../../lib/firebase/inquiry-uploads";
import { inquiryRepository } from "../../../lib/firebase/inquiries";
import { InquiryValidationError, parseInquiryCreateInput } from "../../../lib/inquiries/validation";
import {
  InquiryConfigurationError,
  createInquiryRecord,
  logInquiryApiFailure,
  requiredInquiryTokenSecret,
  resolveInquirySubject,
  toInquiryPublic,
} from "../../../lib/inquiries/server";
import { InquiryUploadError } from "../../../lib/inquiries/uploads";

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
    const inquiryId = randomUUID();
    const now = new Date();
    const attachments = input.uploadReceipts.length === 0
      ? []
      : await finalizeInquiryUploads({
        subject,
        receipts: input.uploadReceipts,
        inquiryId,
        now,
        secret: requiredInquiryTokenSecret(),
      });
    const record = {
      ...createInquiryRecord(subject, input, inquiryId, now),
      attachments,
    };
    try {
      await inquiryRepository.create(record);
    } catch (error) {
      if (attachments.length > 0) {
        await deleteInquiryObjects(attachments.map((attachment) => attachment.storagePath));
      }
      throw error;
    }
    return Response.json(toInquiryPublic(record), { status: 201 });
  } catch (error) {
    if (error instanceof InquiryValidationError || error instanceof InquiryUploadError) {
      return jsonMessage("문의 내용을 다시 확인해 주세요.", 400);
    }
    if (
      error instanceof InquiryConfigurationError
      || error instanceof FirebaseAdminConfigurationError
    ) {
      return jsonMessage("문의 서버 설정이 필요합니다.", 503);
    }
    logInquiryApiFailure("Inquiry create", error);
    return jsonMessage("문의 등록 중 문제가 발생했습니다.", 500);
  }
}
