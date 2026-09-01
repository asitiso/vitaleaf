import type {
  InquiryAttachment,
  InquiryListFilters,
  InquiryRecord,
  InquiryReplyWrite,
} from "./types";

export class InquiryRepositoryError extends Error {
  constructor(message = "문의 정보를 처리할 수 없습니다.") {
    super(message);
    this.name = "InquiryRepositoryError";
  }
}

export type InquiryRepository = {
  create(record: InquiryRecord): Promise<void>;
  listForMember(uid: string, filters: InquiryListFilters): Promise<InquiryRecord[]>;
  listForGuestOrder(orderNumber: string, filters: InquiryListFilters): Promise<InquiryRecord[]>;
  get(id: string): Promise<InquiryRecord | null>;
  listAdmin(filters: InquiryListFilters): Promise<InquiryRecord[]>;
  countWaiting(): Promise<number>;
  reply(id: string, reply: InquiryReplyWrite): Promise<void>;
  delete(id: string): Promise<InquiryAttachment[]>;
};
