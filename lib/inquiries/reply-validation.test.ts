import { expect, it } from "vitest";
import { InquiryValidationError, parseInquiryReplyInput } from "./validation";

it("normalizes multiline answer whitespace and accepts 3000 Unicode codepoints", () => {
  expect(parseInquiryReplyInput({ adminReply: "  확인\r\n\t감사  " })).toEqual({ adminReply: "확인\n\t감사" });
  expect(parseInquiryReplyInput({ adminReply: "🌱".repeat(3000) }).adminReply).toHaveLength(6000);
});

it.each(["", " \n ", "가".repeat(3001), "bad\u0000reply", null, 3])("rejects invalid answer %s", (adminReply) => {
  expect(() => parseInquiryReplyInput({ adminReply })).toThrow(InquiryValidationError);
});
