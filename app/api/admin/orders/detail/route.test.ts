// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminOrderNotFoundError } from "../../../../../lib/admin-orders/service";
import type { GuestOrderStored } from "../../../../../lib/guest-orders/types";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ verifyToken: vi.fn(), getRole: vi.fn(), get: vi.fn() }));
vi.mock("../../../../../lib/firebase/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/firebase/admin-auth")>();
  return { ...actual, verifyBearerAdmin: (request: Request) => actual.verifyBearerAdmin(request, {
    verifyIdToken: mocks.verifyToken, getAdminRecord: mocks.getRole,
  }) };
});
vi.mock("../../../../../lib/firebase/admin-orders", () => ({ adminOrderRepository: mocks }));

const reference = { source: "guest", ownerId: null, orderNumber: "G-1" };
const order: GuestOrderStored = {
  orderNumber: "G-1", customerName: "비회원", phoneNormalized: "synthetic-phone", postcode: "synthetic-postcode",
  address: "synthetic-address", addressDetail: "synthetic-detail", deliveryNote: "", paymentMethod: "bank",
  status: "mock-received", isTestOrder: true, lines: [], subtotal: 1000, shippingFee: 3000, total: 4000,
  createdAt: new Date("2026-09-01T00:00:00Z"), receivedAt: new Date("2026-09-01T00:00:00Z"),
};
const request = (body: unknown) => new Request("http://localhost/api/admin/orders/detail", {
  method: "POST", headers: { authorization: "Bearer synthetic-token" }, body: JSON.stringify(body),
});
beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.verifyToken.mockResolvedValue({ uid: "verified-admin" });
  mocks.getRole.mockResolvedValue({ role: "admin" });
  mocks.get.mockResolvedValue(order);
});
afterEach(() => vi.restoreAllMocks());

it("returns the detail envelope for the normalized reference", async () => {
  const response = await POST(request({ ...reference, orderNumber: " G-1 " }));
  expect(response.status).toBe(200);
  expect(mocks.get).toHaveBeenCalledWith(reference);
  expect(await response.json()).toEqual({ order: {
    ...reference, customerName: "비회원", createdAt: "2026-09-01T00:00:00.000Z", itemSummary: "상품 정보 없음",
    total: 4000, status: "mock-received", isTestOrder: true, phone: "synthetic-phone",
    shippingAddress: { postcode: "synthetic-postcode", address: "synthetic-address", addressDetail: "synthetic-detail" },
    deliveryNote: "", paymentMethod: "bank", lines: [], subtotal: 1000, shippingFee: 3000,
    receivedAt: "2026-09-01T00:00:00.000Z", shippingCarrier: "", trackingNumber: "", statusUpdatedAt: null, statusUpdatedBy: "",
  } });
});

it.each(["null", "not-found-error"])("returns 404 for a valid missing reference (%s)", async (mode) => {
  if (mode === "null") mocks.get.mockResolvedValueOnce(null);
  else mocks.get.mockRejectedValueOnce(new AdminOrderNotFoundError());
  const response = await POST(request(reference));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ message: expect.stringMatching(/[가-힣]/u) });
});

it.each([
  null, [], {}, { ...reference, action: "detail" }, { ...reference, total: 0 },
  { ...reference, ownerId: "forged" }, { ...reference, source: "other" },
  { ...reference, orderNumber: "orders/G-1" }, { source: "member", ownerId: null, orderNumber: "M-1" },
])("rejects invalid or extra reference fields: %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});
