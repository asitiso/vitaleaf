// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminOrderNotFoundError } from "../../../../../lib/admin-orders/service";
import type { GuestOrderStored } from "../../../../../lib/guest-orders/types";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ verifyToken: vi.fn(), getRole: vi.fn(), update: vi.fn(), serviceUpdate: vi.fn() }));
vi.mock("../../../../../lib/firebase/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/firebase/admin-auth")>();
  return { ...actual, verifyBearerAdmin: (request: Request) => actual.verifyBearerAdmin(request, {
    verifyIdToken: mocks.verifyToken, getAdminRecord: mocks.getRole,
  }) };
});
vi.mock("../../../../../lib/firebase/admin-orders", () => ({ adminOrderRepository: mocks }));
vi.mock("../../../../../lib/admin-orders/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/admin-orders/service")>();
  return { ...actual, createAdminOrderService: (...args: Parameters<typeof actual.createAdminOrderService>) => {
    const service = actual.createAdminOrderService(...args);
    mocks.serviceUpdate.mockImplementation(service.update);
    return { ...service, update: mocks.serviceUpdate };
  } };
});

const reference = { source: "guest", ownerId: null, orderNumber: "G-1" };
const order: GuestOrderStored = {
  orderNumber: "G-1", customerName: "비회원", phoneNormalized: "synthetic-phone", postcode: "synthetic-postcode",
  address: "synthetic-address", addressDetail: "synthetic-detail", deliveryNote: "", paymentMethod: "bank",
  status: "shipped", isTestOrder: true, shippingCarrier: "CJ", trackingNumber: "123",
  statusUpdatedBy: "verified-admin", statusUpdatedAt: new Date("2026-09-08T00:00:00Z"),
  lines: [], subtotal: 1000, shippingFee: 3000, total: 4000,
  createdAt: new Date("2026-09-01T00:00:00Z"), receivedAt: new Date("2026-09-01T00:00:00Z"),
};
const request = (body: unknown) => new Request("http://localhost/api/admin/orders/update", {
  method: "POST", headers: { authorization: "Bearer synthetic-token" }, body: JSON.stringify(body),
});
beforeEach(() => {
  for (const [name, mock] of Object.entries(mocks)) {
    if (name === "serviceUpdate") mock.mockClear();
    else mock.mockReset();
  }
  mocks.verifyToken.mockResolvedValue({ uid: "verified-admin" });
  mocks.getRole.mockResolvedValue({ role: "admin" });
  mocks.update.mockResolvedValue(order);
});
afterEach(() => vi.restoreAllMocks());

it("passes only normalized fields and the verified admin UID to the service and returns updated detail", async () => {
  const response = await POST(request({ ...reference, orderNumber: " G-1 ", status: "shipped", shippingCarrier: " CJ ", trackingNumber: " 123 " }));
  expect(response.status).toBe(200);
  const operations = { status: "shipped", shippingCarrier: "CJ", trackingNumber: "123" };
  expect(mocks.serviceUpdate).toHaveBeenCalledExactlyOnceWith(reference, operations, "verified-admin");
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(reference, operations, "verified-admin", expect.any(Date));
  const payload = await response.json();
  expect(Object.keys(payload)).toEqual(["order"]);
  expect(payload.order).toMatchObject({
    ...reference, ...operations, isTestOrder: true, total: 4000,
    statusUpdatedBy: "verified-admin", statusUpdatedAt: "2026-09-08T00:00:00.000Z",
    shippingAddress: { postcode: "synthetic-postcode", address: "synthetic-address", addressDetail: "synthetic-detail" },
  });
});

it("retains mock-received as a valid operation and clears stale shipping fields", async () => {
  mocks.update.mockResolvedValueOnce({ ...order, status: "mock-received", shippingCarrier: "", trackingNumber: "" });
  const response = await POST(request({ ...reference, status: "mock-received", shippingCarrier: "CJ", trackingNumber: "123" }));
  expect(response.status).toBe(200);
  expect(mocks.serviceUpdate).toHaveBeenCalledWith(reference, { status: "mock-received", shippingCarrier: "", trackingNumber: "" }, "verified-admin");
  expect((await response.json()).order).toMatchObject({ status: "mock-received", isTestOrder: true });
});

it("returns 404 for a valid missing update reference", async () => {
  mocks.update.mockRejectedValueOnce(new AdminOrderNotFoundError());
  expect((await POST(request({ ...reference, status: "preparing" }))).status).toBe(404);
});

it.each([
  null, [], {}, { ...reference }, { ...reference, status: "paid" }, { ...reference, status: "shipped" },
  { ...reference, status: "shipped", shippingCarrier: "CJ", trackingNumber: " " },
  { ...reference, status: "preparing", total: 0 }, { ...reference, status: "preparing", isTestOrder: false },
  { ...reference, status: "preparing", statusUpdatedBy: "forged" }, { ...reference, status: "preparing", statusUpdatedAt: "2026-09-01" },
  { ...reference, status: "preparing", adminUid: "forged" }, { ...reference, status: "preparing", action: "update" },
  { ...reference, status: "preparing", orderNumber: "orders/G-1" }, { ...reference, status: "preparing", ownerId: "forged" },
])("rejects invalid or forbidden update fields before service work: %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(mocks.serviceUpdate).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
