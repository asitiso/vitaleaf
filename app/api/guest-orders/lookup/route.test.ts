// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("../../../../lib/firebase/guest-orders", () => ({
  guestOrderRepository: {},
}));

vi.mock("../../../../lib/guest-orders/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/guest-orders/service")>();
  return {
    ...actual,
    createGuestOrderService: vi.fn(() => ({
      create: vi.fn(),
      lookup: mocks.lookup,
    })),
  };
});

import {
  GuestOrderConfigurationError,
  GuestOrderNotFoundError,
  GuestOrderRateLimitError,
} from "../../../../lib/guest-orders/service";
import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import { GuestOrderValidationError } from "../../../../lib/guest-orders/validation";
import { POST } from "./route";

const lookupInput = {
  orderNumber: "VL-20260826-ABC123",
  phone: "010-1234-5678",
};

const publicOrder = {
  orderNumber: lookupInput.orderNumber,
  status: "mock-received" as const,
  receivedAt: "2026-08-26T03:00:00.000Z",
  customerNameMasked: "김**",
  phoneMasked: "010-****-5678",
  addressMasked: "06236 서울특별시 강남구 ***",
  lines: [{
    productId: "p1",
    name: "비타민 C",
    thumbnailUrl: "/products/vitamin-c.jpg",
    unitPrice: 12_000,
    quantity: 2,
  }],
  subtotal: 24_000,
  shippingFee: 3_000,
  total: 27_000,
};

const requestFor = (
  body: unknown = lookupInput,
  headers: Record<string, string> = {},
): Request => new Request("http://localhost/api/guest-orders/lookup", {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

beforeEach(() => {
  mocks.lookup.mockResolvedValue(publicOrder);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/guest-orders/lookup", () => {
  it("returns the masked public order", async () => {
    const response = await POST(requestFor());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ order: publicOrder });
  });

  it.each([
    [{ "x-forwarded-for": "198.51.100.42, 203.0.113.7", "x-real-ip": "192.0.2.9" }, "198.51.100.42"],
    [{ "x-real-ip": "192.0.2.9" }, "192.0.2.9"],
    [{}, "unknown"],
  ])("uses the required client-key header precedence for %j", async (headers, expectedClientKey) => {
    await POST(requestFor(lookupInput, headers));

    expect(mocks.lookup).toHaveBeenCalledWith(lookupInput, expectedClientKey);
  });

  it("returns 400 for malformed JSON without invoking lookup", async () => {
    const request = new Request("http://localhost/api/guest-orders/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "비회원 주문 정보를 다시 확인해 주세요." });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("uses the same generic response for an unknown order and a wrong phone", async () => {
    mocks.lookup.mockRejectedValueOnce(new GuestOrderNotFoundError());
    const unknown = await POST(requestFor({
      orderNumber: "VL-20260826-ZZZZZZ",
      phone: lookupInput.phone,
    }));
    mocks.lookup.mockRejectedValueOnce(new GuestOrderNotFoundError());
    const mismatch = await POST(requestFor({
      orderNumber: lookupInput.orderNumber,
      phone: "010-9999-9999",
    }));

    expect(unknown.status).toBe(404);
    expect(mismatch.status).toBe(404);
    const unknownBody = await unknown.json();
    const mismatchBody = await mismatch.json();
    expect(unknownBody).toEqual(mismatchBody);
    expect(unknownBody).toEqual({
      message: "주문번호와 휴대전화 번호를 다시 확인해 주세요.",
    });
  });

  it.each([
    [new GuestOrderValidationError(), 400, "비회원 주문 정보를 다시 확인해 주세요."],
    [new GuestOrderRateLimitError(), 429, "잠시 후 다시 시도해 주세요."],
    [new GuestOrderConfigurationError(), 503, "비회원 주문 서버 설정이 필요합니다."],
    [new FirebaseAdminConfigurationError(), 503, "비회원 주문 서버 설정이 필요합니다."],
  ])("maps %s to %i", async (error, expectedStatus, expectedMessage) => {
    mocks.lookup.mockRejectedValue(error);

    const response = await POST(requestFor());

    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toEqual({ message: expectedMessage });
  });

  it("returns a generic 500 and logs no raw client key, phone, or request payload", async () => {
    const privateErrorMessage = `failure 198.51.100.42 ${lookupInput.phone}`;
    mocks.lookup.mockRejectedValue(new Error(privateErrorMessage));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(requestFor(lookupInput, { "x-forwarded-for": "198.51.100.42" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "주문 조회 중 문제가 발생했습니다." });
    expect(consoleError).toHaveBeenCalledWith("Guest order lookup API failure", {
      errorClass: "Error",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain("198.51.100.42");
    expect(logged).not.toContain(lookupInput.phone);
    expect(logged).not.toContain(privateErrorMessage);
  });
});
