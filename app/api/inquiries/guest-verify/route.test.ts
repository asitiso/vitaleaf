// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  expiresAt: vi.fn(),
  issueGuestToken: vi.fn(),
  lookup: vi.fn(),
  requiredSecret: vi.fn(),
}));

vi.mock("../../../../lib/firebase/guest-orders", () => ({
  guestOrderRepository: {},
}));

vi.mock("../../../../lib/guest-orders/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/guest-orders/service")>();
  return {
    ...actual,
    createGuestOrderService: vi.fn(() => ({ create: vi.fn(), lookup: mocks.lookup })),
  };
});

vi.mock("../../../../lib/inquiries/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/inquiries/access")>();
  return {
    ...actual,
    guestInquiryTokenExpiresAt: mocks.expiresAt,
    issueGuestInquiryToken: mocks.issueGuestToken,
  };
});

vi.mock("../../../../lib/inquiries/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/inquiries/server")>();
  return { ...actual, requiredInquiryTokenSecret: mocks.requiredSecret };
});

import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import {
  GuestOrderConfigurationError,
  GuestOrderNotFoundError,
  GuestOrderRateLimitError,
} from "../../../../lib/guest-orders/service";
import { GuestOrderValidationError } from "../../../../lib/guest-orders/validation";
import { InquiryConfigurationError } from "../../../../lib/inquiries/server";
import { POST } from "./route";

const SECRET = "inquiry-token-secret-that-is-at-least-thirty-two-characters";
const lookupInput = {
  orderNumber: "VL-20260826-ABC123",
  phone: "010-1234-5678",
};
const expiresAt = new Date("2026-09-02T01:32:03.000Z");
const publicOrder = {
  orderNumber: lookupInput.orderNumber,
  status: "mock-received" as const,
  receivedAt: "2026-08-26T03:00:00.000Z",
  customerNameMasked: "김**",
  phoneMasked: "010-****-5678",
  addressMasked: "06236 서울특별시 강남구 ***",
  lines: [{
    productId: "p1",
    purchaseOptionId: "default",
    purchaseOptionLabel: "기본 구성",
    sku: "",
    name: "비타민 C",
    thumbnailUrl: "/products/vitamin-c.jpg",
    basePrice: 12_000,
    priceAdjustment: 0,
    unitPrice: 12_000,
    quantity: 2,
    lineTotal: 24_000,
  }],
  subtotal: 24_000,
  shippingFee: 3_000,
  total: 27_000,
};

const requestFor = (
  body: unknown = lookupInput,
  headers: Record<string, string> = {},
): Request => new Request("http://localhost/api/inquiries/guest-verify", {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

beforeEach(() => {
  mocks.lookup.mockReset().mockResolvedValue(publicOrder);
  mocks.requiredSecret.mockReset().mockReturnValue(SECRET);
  mocks.issueGuestToken.mockReset().mockReturnValue("guest-access-token");
  mocks.expiresAt.mockReset().mockReturnValue(expiresAt);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/inquiries/guest-verify", () => {
  it("returns the existing masked order with only an order-bound access token and exact expiry", async () => {
    const response = await POST(requestFor(lookupInput, {
      "x-forwarded-for": "198.51.100.42, 203.0.113.7",
      "x-real-ip": "192.0.2.9",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      order: publicOrder,
      accessToken: "guest-access-token",
      expiresAt: "2026-09-02T01:32:03.000Z",
    });
    expect(mocks.lookup).toHaveBeenCalledWith(lookupInput, "198.51.100.42");
    expect(mocks.issueGuestToken).toHaveBeenCalledWith(
      lookupInput.orderNumber,
      expect.any(Date),
      SECRET,
    );
    expect(JSON.stringify(mocks.issueGuestToken.mock.calls)).not.toContain(lookupInput.phone);
  });

  it("uses the same generic 404 response for an unknown order and a wrong phone", async () => {
    mocks.lookup.mockRejectedValueOnce(new GuestOrderNotFoundError());
    const unknown = await POST(requestFor({ ...lookupInput, orderNumber: "VL-20260826-ZZZZZZ" }));
    mocks.lookup.mockRejectedValueOnce(new GuestOrderNotFoundError());
    const wrongPhone = await POST(requestFor({ ...lookupInput, phone: "010-9999-9999" }));

    expect(unknown.status).toBe(404);
    expect(wrongPhone.status).toBe(404);
    expect(await unknown.json()).toEqual(await wrongPhone.json());
  });

  it("maps malformed input, the sixth failed lookup, and server configuration safely", async () => {
    mocks.lookup.mockRejectedValueOnce(new GuestOrderValidationError());
    const invalid = await POST(requestFor());
    mocks.lookup.mockRejectedValueOnce(new GuestOrderRateLimitError());
    const limited = await POST(requestFor());
    mocks.requiredSecret.mockImplementationOnce(() => { throw new InquiryConfigurationError(); });
    const missingSecret = await POST(requestFor());

    expect(invalid.status).toBe(400);
    expect(limited.status).toBe(429);
    expect(missingSecret.status).toBe(503);
  });

  it("returns 400 for malformed JSON without attempting an order lookup", async () => {
    const response = await POST(new Request("http://localhost/api/inquiries/guest-verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));

    expect(response.status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it.each([
    new GuestOrderConfigurationError(),
    new FirebaseAdminConfigurationError(),
  ])("returns safe configuration status for %s", async (error) => {
    mocks.lookup.mockRejectedValueOnce(error);

    const response = await POST(requestFor());

    expect(response.status).toBe(503);
  });

  it("logs only a safe error class and request ID for unexpected failures", async () => {
    const privateError = new Error(`${lookupInput.phone} ${lookupInput.orderNumber} guest-access-token`);
    mocks.lookup.mockRejectedValueOnce(privateError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(requestFor(lookupInput, { "x-real-ip": "192.0.2.9" }));

    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith("Guest inquiry verification API failure", {
      errorClass: "Error",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain(lookupInput.phone);
    expect(logged).not.toContain(lookupInput.orderNumber);
    expect(logged).not.toContain("guest-access-token");
  });
});
