export type InquiryCategory = "order" | "shipping" | "product" | "return" | "other";

export type InquiryStatus = "waiting" | "answered";

export type InquiryImageContentType = "image/jpeg" | "image/png" | "image/webp";

export type InquiryOwner =
  | {
    ownerType: "member";
    memberUid: string;
    guestOrderNumber: null;
  }
  | {
    ownerType: "guest";
    memberUid: null;
    guestOrderNumber: string;
  };

export type InquiryAttachment = {
  id: string;
  storagePath: string;
  originalName: string;
  contentType: InquiryImageContentType;
  size: number;
};

// Server records use Date. Browser payloads below use ISO-8601 UTC strings only.
export type InquiryRecord = InquiryOwner & {
  id: string;
  orderNumber: string | null;
  category: InquiryCategory;
  title: string;
  body: string;
  status: InquiryStatus;
  attachments: InquiryAttachment[];
  adminReply: string | null;
  repliedAt: Date | null;
  repliedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InquiryAttachmentPublic = {
  id: string;
  originalName: string;
  contentType: InquiryImageContentType;
  size: number;
  readUrl: string | null;
};

export type InquiryPublic = {
  id: string;
  ownerType: InquiryOwner["ownerType"];
  orderNumber: string | null;
  category: InquiryCategory;
  title: string;
  body: string;
  status: InquiryStatus;
  attachments: InquiryAttachmentPublic[];
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InquiryCreateInput = {
  category: InquiryCategory;
  title: string;
  body: string;
  orderNumber: string | null;
  uploadReceipts: string[];
};

export type InquiryListFilters = {
  category: InquiryCategory | null;
  status: InquiryStatus | null;
  pageSize: number;
  cursor: string | null;
};

export type InquiryReplyInput = {
  adminReply: string;
};

export type InquiryReplyWrite = {
  adminReply: string;
  repliedBy: string;
  repliedAt: Date;
};
