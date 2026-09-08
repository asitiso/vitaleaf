import { describe, expect, it, vi } from "vitest";
import type { MemberOrder } from "../firebase/member-orders";
import type { GuestOrderStored } from "../guest-orders/types";
import type { AdminOrderRepository } from "./types";
import { AdminOrderAccessError, createAdminOrderService, toAdminOrderDetail, toAdminOrderListItem } from "./service";

const member = (orderNumber = "M-1", day = 1): MemberOrder => ({
  id: orderNumber, userId: "u1", orderNumber, customerName: "테스트 고객", phone: "01012345678",
  shippingAddress: { postcode: "12345", address: "테스트 주소", addressDetail: "101호" },
  deliveryNote: "문 앞", paymentMethod: "card", status: "mock-received", isTestOrder: true,
  shippingCarrier: "", trackingNumber: "", statusUpdatedAt: null, statusUpdatedBy: "",
  lines: [{ productId: "p1", name: "비타민", quantity: 2, unitPrice: 1000 }],
  subtotal: 2000, shippingFee: 3000, total: 5000, createdAt: new Date(`2026-09-0${day}T00:00:00Z`),
  receivedAt: new Date(`2026-09-0${day}T00:00:00Z`),
});
const guest = (orderNumber = "G-1", day = 2): GuestOrderStored => ({
  orderNumber, customerName: "비회원", phoneNormalized: "01098765432", postcode: "54321",
  address: "비회원 주소", addressDetail: "2층", deliveryNote: "배송 메모", paymentMethod: "bank",
  status: "mock-received", lines: [], subtotal: 0, shippingFee: 0, total: 0,
  createdAt: new Date(`2026-09-0${day}T00:00:00Z`), receivedAt: new Date(`2026-09-0${day}T00:00:00Z`),
});
const repository = (): AdminOrderRepository => ({
  listMember: vi.fn(async () => [member("M-1", 1), member("M-2", 3)]),
  listGuest: vi.fn(async () => [guest("G-1", 2), guest("G-2", 4)]),
  get: vi.fn(async () => member()), update: vi.fn(async () => member()),
});
const reference = { source: "member", ownerId: "u1", orderNumber: "M-1" } as const;
const listKeys = ["source", "ownerId", "orderNumber", "customerName", "createdAt", "itemSummary", "total", "status", "isTestOrder"].sort();

describe("admin order service", () => {
  it("merges both sources newest-first and redacts all non-list fields", async () => {
    const repo = repository();
    const result = await createAdminOrderService(repo).list();
    expect(result.map((row) => row.orderNumber)).toEqual(["G-2", "M-2", "G-1", "M-1"]);
    result.forEach((row) => expect(Object.keys(row).sort()).toEqual(listKeys));
    expect(result[0]).not.toHaveProperty("phone");
    expect(result[0]).not.toHaveProperty("address");
    expect(repo.listMember).toHaveBeenCalledWith(100);
    expect(repo.listGuest).toHaveBeenCalledWith(100);
  });

  it("returns all 100 plus 100 rows and caps an oversized repository response at 200", async () => {
    const repo = repository();
    vi.mocked(repo.listMember).mockResolvedValue(Array.from({ length: 100 }, (_, i) => member(`M-${i}`)));
    vi.mocked(repo.listGuest).mockResolvedValue(Array.from({ length: 100 }, (_, i) => guest(`G-${i}`)));
    expect(await createAdminOrderService(repo).list()).toHaveLength(200);
    vi.mocked(repo.listGuest).mockResolvedValue(Array.from({ length: 120 }, (_, i) => guest(`G-${i}`)));
    expect(await createAdminOrderService(repo).list()).toHaveLength(200);
  });

  it("breaks date ties by descending order number and puts unknown dates last", async () => {
    const repo = repository();
    vi.mocked(repo.listMember).mockResolvedValue([member("M-1"), { ...member("Z-unknown"), createdAt: null }]);
    vi.mocked(repo.listGuest).mockResolvedValue([guest("G-1", 1), guest("Z-1", 1)]);
    expect((await createAdminOrderService(repo).list()).map((row) => row.orderNumber))
      .toEqual(["Z-1", "M-1", "G-1", "Z-unknown"]);
  });

  it("constructs only list fields with a line summary and normalized legacy operations", () => {
    const order = member();
    order.lines.push({ productId: "p2", name: "오메가", quantity: 1, unitPrice: 2000 });
    expect(toAdminOrderListItem(reference, { ...order, secret: "hidden" } as MemberOrder)).toEqual({
      ...reference, customerName: "테스트 고객", createdAt: "2026-09-01T00:00:00.000Z",
      itemSummary: "비타민 외 1건", total: 5000, status: "mock-received", isTestOrder: true,
    });
    expect(toAdminOrderListItem({ source: "guest", ownerId: null, orderNumber: "G-1" }, guest()))
      .toMatchObject({ itemSummary: "상품 정보 없음", isTestOrder: false });
    expect(toAdminOrderListItem(reference, { ...order, lines: [order.lines[0]] }).itemSummary).toBe("비타민");
  });

  it("returns null for missing detail and validates references before repository reads", async () => {
    const repo = repository();
    vi.mocked(repo.get).mockResolvedValue(null);
    const service = createAdminOrderService(repo);
    await expect(service.detail(reference)).resolves.toBeNull();
    vi.mocked(repo.get).mockClear();
    await expect(service.detail({ ...reference, ownerId: "a/b" })).rejects.toThrow();
    expect(repo.get).not.toHaveBeenCalled();
  });

  it("rejects member ownership mismatches on detail and update responses", async () => {
    const repo = repository();
    vi.mocked(repo.get).mockResolvedValue({ ...member(), userId: "other" });
    vi.mocked(repo.update).mockResolvedValue({ ...member(), userId: "other" });
    const service = createAdminOrderService(repo);
    await expect(service.detail(reference)).rejects.toThrow(AdminOrderAccessError);
    await expect(service.update(reference, { status: "preparing" }, "admin-1")).rejects.toThrow(AdminOrderAccessError);
  });

  it("maps member and guest details into one allowlisted shipping shape", async () => {
    const repo = repository();
    expect(await createAdminOrderService(repo).detail(reference)).toMatchObject({
      phone: "01012345678", shippingAddress: { postcode: "12345", address: "테스트 주소", addressDetail: "101호" },
      paymentMethod: "card", receivedAt: "2026-09-01T00:00:00.000Z", subtotal: 2000, shippingFee: 3000,
    });
    const detail = toAdminOrderDetail({ source: "guest", ownerId: null, orderNumber: "G-1" }, {
      ...guest(), secret: "hidden", lines: [{ ...member().lines[0], secret: "nested" }],
    } as unknown as GuestOrderStored);
    expect(detail).toMatchObject({ phone: "01098765432", shippingAddress: { postcode: "54321", address: "비회원 주소", addressDetail: "2층" } });
    expect(detail).not.toHaveProperty("address");
    expect(detail).not.toHaveProperty("phoneNormalized");
    expect(detail).not.toHaveProperty("secret");
    expect(detail.lines[0]).not.toHaveProperty("secret");
    expect(toAdminOrderDetail(reference, { ...member(), createdAt: null, receivedAt: null })).toMatchObject({ createdAt: null, receivedAt: null });
  });

  it("parses shipped operations before access and forwards only operations plus server audit values", async () => {
    const repo = repository();
    const now = new Date("2026-09-07T00:00:00Z");
    vi.mocked(repo.update).mockResolvedValue({ ...member(), status: "shipped", shippingCarrier: "CJ", trackingNumber: "123", statusUpdatedAt: now, statusUpdatedBy: "admin-1" });
    const result = await createAdminOrderService(repo, () => now).update(reference, {
      status: "shipped", shippingCarrier: " CJ ", trackingNumber: " 123 ",
    }, "admin-1");
    expect(repo.update).toHaveBeenCalledWith(reference, { status: "shipped", shippingCarrier: "CJ", trackingNumber: "123" }, "admin-1", now);
    expect(result).toMatchObject({ status: "shipped", statusUpdatedAt: "2026-09-07T00:00:00.000Z", statusUpdatedBy: "admin-1" });
    expect(repo.get).not.toHaveBeenCalled();
  });

  it.each([{ status: "paid" }, { status: "shipped" }, { status: "preparing", total: 0 }, { status: "preparing", isTestOrder: true }])(
    "rejects invalid updates without repository access: %j", async (value) => {
      const repo = repository();
      await expect(createAdminOrderService(repo).update(reference, value, "admin-1")).rejects.toThrow();
      expect(repo.get).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    },
  );

  it("propagates a source failure instead of presenting partial results", async () => {
    const repo = repository();
    vi.mocked(repo.listGuest).mockRejectedValue(new Error("unavailable"));
    await expect(createAdminOrderService(repo).list()).rejects.toThrow("unavailable");
  });
});
