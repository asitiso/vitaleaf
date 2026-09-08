// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import type { MemberOrder } from "../../../../lib/firebase/member-orders";
import { AdminOrderAccessError } from "../../../../lib/admin-orders/service";
import { deferred } from "../../../../tests/inquiry-fixtures";
import { POST } from "./route";
import { POST as detail } from "./detail/route";
import { POST as update } from "./update/route";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(), getRole: vi.fn(), listMember: vi.fn(), listGuest: vi.fn(), get: vi.fn(), update: vi.fn(),
}));
vi.mock("../../../../lib/firebase/admin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/firebase/admin-auth")>();
  return { ...actual, verifyBearerAdmin: (request: Request) => actual.verifyBearerAdmin(request, {
    verifyIdToken: mocks.verifyToken, getAdminRecord: mocks.getRole,
  }) };
});
vi.mock("../../../../lib/firebase/admin-orders", () => ({ adminOrderRepository: mocks }));

const record: MemberOrder = {
  id: "M-1", userId: "member-1", orderNumber: "M-1", customerName: "테스트 고객",
  phone: "synthetic-phone", shippingAddress: { postcode: "synthetic-postcode", address: "synthetic-address", addressDetail: "synthetic-detail" },
  deliveryNote: "", paymentMethod: "card", status: "mock-received", isTestOrder: true,
  shippingCarrier: "", trackingNumber: "", statusUpdatedAt: null, statusUpdatedBy: "",
  lines: [{ productId: "p1", name: "비타민", quantity: 1, unitPrice: 1000 }],
  subtotal: 1000, shippingFee: 3000, total: 4000, createdAt: new Date("2026-09-01T00:00:00Z"), receivedAt: null,
};
const reference = { source: "member", ownerId: "member-1", orderNumber: "M-1" };
const request = (body: unknown, token: string | null = "synthetic-token") => new Request("http://localhost/api/admin/orders", {
  method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const repositoryCalls = () => [mocks.listMember, mocks.listGuest, mocks.get, mocks.update];

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.verifyToken.mockResolvedValue({ uid: "verified-admin" });
  mocks.getRole.mockResolvedValue({ role: "admin" });
  mocks.listMember.mockResolvedValue([record]);
  mocks.listGuest.mockResolvedValue([]);
  mocks.get.mockResolvedValue(record);
  mocks.update.mockResolvedValue(record);
});
afterEach(() => vi.restoreAllMocks());

describe.each([
  ["list", POST, { action: "list" }, mocks.listMember],
  ["detail", detail, reference, mocks.get],
  ["update", update, { ...reference, status: "preparing" }, mocks.update],
] as const)("admin order %s authorization and failures", (_name, endpoint, body, operation) => {
  it.each(["absent", "invalid", "member"])("rejects %s authority before reading JSON or accessing orders", async (authority) => {
    if (authority === "invalid") mocks.verifyToken.mockRejectedValue(new Error("synthetic-private-token"));
    if (authority === "member") mocks.getRole.mockResolvedValue({ role: "member" });
    const input = request(body, authority === "absent" ? null : "synthetic-token");
    const read = vi.spyOn(input, "json");
    const response = await endpoint(input);
    expect(response.status).toBe(authority === "member" ? 403 : 401);
    expect(read).not.toHaveBeenCalled();
    repositoryCalls().forEach((mock) => expect(mock).not.toHaveBeenCalled());
    expect(await response.text()).not.toContain("synthetic-private-token");
  });

  it("waits for the fresh server role check before reading JSON", async () => {
    const role = deferred<{ role: string }>();
    mocks.getRole.mockReturnValueOnce(role.promise);
    const input = request(body);
    const read = vi.spyOn(input, "json");
    const pending = endpoint(input);
    await vi.waitFor(() => expect(mocks.getRole).toHaveBeenCalledWith("verified-admin"));
    expect(read).not.toHaveBeenCalled();
    repositoryCalls().forEach((mock) => expect(mock).not.toHaveBeenCalled());
    role.resolve({ role: "admin" });
    expect((await pending).status).toBe(200);
    mocks.getRole.mockResolvedValueOnce(null);
    expect((await endpoint(request(body))).status).toBe(403);
    expect(mocks.verifyToken).toHaveBeenCalledTimes(2);
    expect(mocks.getRole).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for malformed JSON after authorization", async () => {
    const input = new Request("http://localhost/api/admin/orders", {
      method: "POST", headers: { authorization: "Bearer synthetic-token" }, body: "{",
    });
    expect((await endpoint(input)).status).toBe(400);
    expect(mocks.getRole).toHaveBeenCalledWith("verified-admin");
    repositoryCalls().forEach((mock) => expect(mock).not.toHaveBeenCalled());
  });

  it.each(["auth", "repository"])("returns safe 503 for %s configuration failure", async (source) => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    (source === "auth" ? mocks.verifyToken : operation).mockRejectedValueOnce(new FirebaseAdminConfigurationError("SYNTHETIC_PRIVATE_CONFIG"));
    const response = await endpoint(request(body));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("SYNTHETIC_PRIVATE_CONFIG");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("SYNTHETIC_PRIVATE_CONFIG");
  });

  it.each(["role", "repository"])("returns safe 500 for unexpected %s failure", async (source) => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sensitive = "synthetic-credentials synthetic-token synthetic/path SYNTHETIC_ENV synthetic-phone synthetic-address";
    (source === "role" ? mocks.getRole : operation).mockRejectedValueOnce(new Error(sensitive));
    const response = await endpoint(request(body));
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(Object.keys(payload)).toEqual(["message"]);
    expect(payload.message).toMatch(/[가-힣]/u);
    expect(JSON.stringify(payload)).not.toMatch(/synthetic|SYNTHETIC/u);
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/synthetic|SYNTHETIC/u);
  });

  it("maps ownership denial to 403 without details", async () => {
    operation.mockRejectedValueOnce(new AdminOrderAccessError());
    const response = await endpoint(request(body));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: expect.stringMatching(/[가-힣]/u) });
  });
});

it("returns only list fields, preserving test-order and mock-received semantics", async () => {
  const response = await POST(request({ action: "list" }));
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload).toEqual({ orders: [expect.not.objectContaining({ phone: expect.anything(), address: expect.anything() })] });
  expect(payload).toEqual({ orders: [{
    ...reference, customerName: "테스트 고객", createdAt: "2026-09-01T00:00:00.000Z", itemSummary: "비타민",
    total: 4000, status: "mock-received", isTestOrder: true,
  }] });
  expect(JSON.stringify(payload)).not.toMatch(/synthetic-phone|synthetic-address|shippingAddress|phoneNormalized/u);
  expect(mocks.listMember).toHaveBeenCalledWith(100);
  expect(mocks.listGuest).toHaveBeenCalledWith(100);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it.each([null, [], "list", {}, { action: "count" }, { action: "list", total: 0 }, { action: "list", ownerId: "member-1" }])(
  "rejects requests other than exactly the list action: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    repositoryCalls().forEach((mock) => expect(mock).not.toHaveBeenCalled());
  },
);
