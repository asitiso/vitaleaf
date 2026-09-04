import { vi } from "vitest";
import type { InquiryRecord } from "../lib/inquiries/types";

const adminMocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getRole: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  reply: vi.fn(),
  remove: vi.fn(),
  sign: vi.fn(),
  deleteObjects: vi.fn(),
}));

export { adminMocks };

vi.mock("../lib/firebase/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/firebase/admin-auth")>();
  return {
    ...actual,
    verifyBearerAdmin: (request: Request) => actual.verifyBearerAdmin(request, {
      verifyIdToken: adminMocks.verifyToken,
      getAdminRecord: adminMocks.getRole,
    }),
  };
});
vi.mock("../lib/firebase/inquiries", () => ({ inquiryRepository: {
  get: adminMocks.get,
  listAdmin: adminMocks.list,
  countWaiting: adminMocks.count,
  reply: adminMocks.reply,
  delete: adminMocks.remove,
} }));
vi.mock("../lib/firebase/inquiry-uploads", () => ({
  createInquiryAttachmentReadUrls: adminMocks.sign,
  deleteInquiryObjects: adminMocks.deleteObjects,
}));

export const adminRecord: InquiryRecord = {
  id: "inquiry-1", ownerType: "member", memberUid: "private-member",
  guestOrderNumber: null, orderNumber: null, category: "product",
  title: "상품 문의", body: "사용 방법을 알려 주세요.", status: "waiting",
  attachments: [{ id: "image-1", storagePath: "inquiries/inquiry-1/image-1.png", originalName: "photo.png", contentType: "image/png", size: 20 }],
  adminReply: null, repliedAt: null, repliedBy: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
};

export function resetAdminMocks() {
  Object.values(adminMocks).forEach((mock) => mock.mockReset());
  adminMocks.verifyToken.mockResolvedValue({ uid: "verified-admin" });
  adminMocks.getRole.mockResolvedValue({ role: "admin" });
  adminMocks.get.mockResolvedValue(adminRecord);
  adminMocks.list.mockResolvedValue([adminRecord]);
  adminMocks.count.mockResolvedValue(3);
  adminMocks.reply.mockResolvedValue(undefined);
  adminMocks.remove.mockResolvedValue(adminRecord.attachments);
  adminMocks.sign.mockResolvedValue(["https://storage.example.test/signed-read"]);
  adminMocks.deleteObjects.mockResolvedValue(undefined);
}

export function adminRequest(body: unknown, token: string | null = "admin-token") {
  return new Request("http://localhost/api/admin/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : { "x-inquiry-access": "guest-token" }) },
    body: JSON.stringify(body),
  });
}
