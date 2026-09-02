import { describe, expect, it } from "vitest";

import { issueUploadReceipt } from "./access";
import {
  InquiryValidationError,
  parseInquiryCreateInput,
  parseInquiryListFilters,
  parseInquiryRecord,
} from "./validation";

const validCreateInput = {
  category: "product",
  title: "2개월분 문의",
  body: "섭취 기간을 확인하고 싶습니다.",
  orderNumber: "",
  uploadReceipts: [],
};

const validAttachment = {
  id: "attachment-1",
  storagePath: "inquiries/inquiry-1/attachment-1.webp",
  originalName: "product.webp",
  contentType: "image/webp",
  size: 1_024,
};

const validRecord = {
  id: "inquiry-1",
  ownerType: "member",
  memberUid: "member-1",
  guestOrderNumber: null,
  orderNumber: null,
  category: "product",
  title: "섭취 기간 문의",
  body: "2개월분 섭취 기간을 확인하고 싶습니다.",
  status: "waiting",
  attachments: [validAttachment],
  adminReply: null,
  repliedAt: null,
  repliedBy: null,
  createdAt: new Date("2026-08-28T00:00:00.000Z"),
  updatedAt: new Date("2026-08-28T00:00:00.000Z"),
};

describe("parseInquiryCreateInput", () => {
  it("normalizes valid member-like inquiry input", () => {
    expect(parseInquiryCreateInput({
      ...validCreateInput,
      title: "  2개월분 문의  ",
      body: "  섭취 기간을 확인하고 싶습니다.  ",
    })).toEqual({
      category: "product",
      title: "2개월분 문의",
      body: "섭취 기간을 확인하고 싶습니다.",
      orderNumber: null,
      uploadReceipts: [],
    });
  });

  it("accepts a valid VITALEAF order number for guest-like inquiry input", () => {
    expect(parseInquiryCreateInput({
      ...validCreateInput,
      orderNumber: "VL-20260826-ABC123",
      uploadReceipts: [" upload-receipt-1 "],
    })).toMatchObject({
      orderNumber: "VL-20260826-ABC123",
      uploadReceipts: ["upload-receipt-1"],
    });
  });

  it("accepts a valid receipt bound to the longest supported multibyte member UID", () => {
    const receipt = issueUploadReceipt(
      { kind: "member", uid: "😀".repeat(128) },
      `inquiryPending/${"s".repeat(64)}/${"u".repeat(64)}`,
      "image/webp",
      5 * 1024 * 1024,
      new Date("2026-09-02T00:00:00.000Z"),
      "test-only-inquiry-secret-that-is-long-enough",
    );

    expect(receipt.length).toBeGreaterThan(512);
    expect(parseInquiryCreateInput({
      ...validCreateInput,
      uploadReceipts: [receipt],
    }).uploadReceipts).toEqual([receipt]);
  });

  it.each(["invalid", "ORDER", "배송"])("rejects an unsupported category: %s", (category) => {
    expect(() => parseInquiryCreateInput({ ...validCreateInput, category }))
      .toThrow(InquiryValidationError);
  });

  it.each(["", " ", "x".repeat(101)])("rejects a title outside 1 to 100 characters", (title) => {
    expect(() => parseInquiryCreateInput({ ...validCreateInput, title }))
      .toThrow(InquiryValidationError);
  });

  it.each(["", " \n\t ", "x".repeat(3_001)])("rejects a body outside 1 to 3,000 characters", (body) => {
    expect(() => parseInquiryCreateInput({ ...validCreateInput, body }))
      .toThrow(InquiryValidationError);
  });

  it("normalizes ordinary body line breaks while preserving safe tabs", () => {
    expect(parseInquiryCreateInput({
      ...validCreateInput,
      body: "첫 줄\r\n\t둘째 줄\r셋째 줄",
    }).body).toBe("첫 줄\n\t둘째 줄\n셋째 줄");
  });

  it.each([
    ["title", "문의\u0000제목"],
    ["body", "문의\u001b내용"],
    ["orderNumber", "VL-20260826-ABC123\u007f"],
  ])("rejects C0 or C1 control characters in %s", (field, value) => {
    expect(() => parseInquiryCreateInput({ ...validCreateInput, [field]: value }))
      .toThrow(InquiryValidationError);
  });

  it.each([
    "VL-20260826-abc123",
    "VL-2026082-ABC123",
    "VL-20260826-ABC12",
    "20260826-ABC123",
  ])("rejects malformed VITALEAF order numbers: %s", (orderNumber) => {
    expect(() => parseInquiryCreateInput({ ...validCreateInput, orderNumber }))
      .toThrow(InquiryValidationError);
  });

  it.each([
    ["four receipts", ["receipt-1", "receipt-2", "receipt-3", "receipt-4"]],
    ["a non-array receipt value", "receipt-1"],
    ["a blank receipt", ["  "]],
    ["a duplicate receipt", ["receipt-1", " receipt-1 "]],
    ["an oversized receipt", ["x".repeat(2_049)]],
  ])("rejects %s", (_description, uploadReceipts) => {
    expect(() => parseInquiryCreateInput({ ...validCreateInput, uploadReceipts }))
      .toThrow(InquiryValidationError);
  });
});

describe("parseInquiryListFilters", () => {
  it("uses stable, safe defaults", () => {
    expect(parseInquiryListFilters({})).toEqual({
      category: null,
      status: null,
      pageSize: 20,
      cursor: null,
    });
  });

  it("accepts allowed category and status filters at the maximum page size", () => {
    expect(parseInquiryListFilters({
      category: "shipping",
      status: "waiting",
      pageSize: 50,
      cursor: "  next-inquiry-1  ",
    })).toEqual({
      category: "shipping",
      status: "waiting",
      pageSize: 50,
      cursor: "next-inquiry-1",
    });
  });

  it.each([
    [{ category: "invalid" }],
    [{ status: "resolved" }],
    [{ pageSize: 0 }],
    [{ pageSize: -1 }],
    [{ pageSize: 1.5 }],
    [{ pageSize: Number.NaN }],
    [{ pageSize: Number.POSITIVE_INFINITY }],
    [{ pageSize: 51 }],
    [{ cursor: "cursor\u0000value" }],
  ])("rejects an unsafe list filter: %o", (filters) => {
    expect(() => parseInquiryListFilters(filters)).toThrow(InquiryValidationError);
  });
});

describe("parseInquiryRecord", () => {
  it("keeps a valid discriminated member record private and date-safe", () => {
    expect(parseInquiryRecord(validRecord)).toEqual(validRecord);
  });

  it("accepts a guest record only when its linked order matches the guest owner", () => {
    expect(parseInquiryRecord({
      ...validRecord,
      ownerType: "guest",
      memberUid: null,
      guestOrderNumber: "VL-20260826-ABC123",
      orderNumber: "VL-20260826-ABC123",
    })).toMatchObject({ ownerType: "guest", memberUid: null });
  });

  it.each([
    [{ ...validRecord, ownerType: "member", memberUid: null }],
    [{ ...validRecord, ownerType: "member", guestOrderNumber: "VL-20260826-ABC123" }],
    [{ ...validRecord, ownerType: "guest", memberUid: "member-1", guestOrderNumber: "VL-20260826-ABC123" }],
    [{ ...validRecord, ownerType: "guest", memberUid: null, guestOrderNumber: "VL-20260826-ABC123", orderNumber: null }],
    [{ ...validRecord, createdAt: new Date("invalid") }],
    [{ ...validRecord, attachments: [{ ...validAttachment, contentType: "image/gif" }] }],
    [{ ...validRecord, attachments: Array(4).fill(validAttachment) }],
    [{ ...validRecord, attachments: [validAttachment, { ...validAttachment, storagePath: "inquiries/inquiry-1/attachment-2.webp" }] }],
    [{ ...validRecord, attachments: [validAttachment, { ...validAttachment, id: "attachment-2" }] }],
    [{ ...validRecord, attachments: [{ ...validAttachment, size: 0 }] }],
    [{ ...validRecord, attachments: [{ ...validAttachment, size: 5 * 1024 * 1024 + 1 }] }],
    [{ ...validRecord, attachments: [{ ...validAttachment, storagePath: "inquiries/inquiry-2/attachment-1.webp" }] }],
    [{ ...validRecord, status: "answered", adminReply: null }],
  ])("rejects malformed owner, date, attachment, or reply record data", (record) => {
    expect(() => parseInquiryRecord(record)).toThrow(InquiryValidationError);
  });
});
