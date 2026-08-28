// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  processPayment: vi.fn(),
}));

vi.mock("../../../lib/firebase/guest-orders", () => ({
  guestOrderRepository: {},
}));

vi.mock("../../../lib/payment/process-payment", () => ({
  processPayment: mocks.processPayment,
}));

vi.mock("../../../lib/guest-orders/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/guest-orders/service")>();
  return {
    ...actual,
    createGuestOrderService: vi.fn(() => ({
      create: mocks.create,
      lookup: vi.fn(),
    })),
  };
});

import {
  GuestOrderConfigurationError,
  GuestOrderDuplicateError,
  GuestOrderUnavailableError,
} from "../../../lib/guest-orders/service";
import { FirebaseAdminConfigurationError } from "../../../lib/firebase/admin";
import { GuestOrderValidationError } from "../../../lib/guest-orders/validation";
import { POST } from "./route";

const paymentResult = {
  orderNumber: "VL-20260826-ABC123",
  receivedAt: "2026-08-26T03:00:00.000Z",
};

const validCreateBody = {
  customerName: "김민수",
  phone: "010-1234-5678",
  postcode: "06236",
  address: "서울특별시 강남구 테헤란로",
  addressDetail: "4층 401호",
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card",
  lines: [{ productId: "p1", quantity: 2 }],
};

const validPayment = {
  orderNumber: "VL-20260826-ABC123",
  receivedAt: "2026-08-26T03:00:00.000Z",
};
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";

const createJsonRequest = (body: unknown): Request => new Request(
  "http://localhost/api/guest-orders",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

beforeEach(() => {
  mocks.processPayment.mockResolvedValue(paymentResult);
  mocks.create.mockResolvedValue(paymentResult);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/guest-orders", () => {
  it("returns 201 with only the public receipt fields", async () => {
    mocks.create.mockResolvedValue({
      ...paymentResult,
      phone: "01012345678",
      address: "서울특별시 강남구 테헤란로",
    });

    const response = await POST(createJsonRequest({
      order: validCreateBody,
      payment: validPayment,
      idempotencyKey,
    }));

    expect(response.status).toBe(201);
    expect(mocks.processPayment).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(validCreateBody, validPayment, idempotencyKey);
    const body = await response.json();
    expect(body).toEqual(paymentResult);
    expect(JSON.stringify(body)).not.toContain("01012345678");
    expect(JSON.stringify(body)).not.toContain("테헤란로");
  });

  it("returns 400 for malformed JSON without invoking payment or persistence", async () => {
    const request = new Request("http://localhost/api/guest-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "비회원 주문 정보를 다시 확인해 주세요." });
    expect(mocks.processPayment).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("passes tampered browser receipt values through only as an opaque payment seam", async () => {
    const tamperedPayment = { orderNumber: "ATTACKER", receivedAt: "not-a-date" };

    const response = await POST(createJsonRequest({
      order: validCreateBody,
      payment: tamperedPayment,
      idempotencyKey,
    }));

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(validCreateBody, tamperedPayment, idempotencyKey);
    expect(await response.json()).toEqual(paymentResult);
  });

  it("returns 400 when the checkout idempotency key is missing", async () => {
    const response = await POST(createJsonRequest({ order: validCreateBody, payment: validPayment }));

    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    [new GuestOrderValidationError(), 400, "비회원 주문 정보를 다시 확인해 주세요."],
    [new GuestOrderUnavailableError(), 409, "주문할 수 없는 상품이 포함되어 있습니다."],
    [new GuestOrderDuplicateError(), 409, "이미 존재하는 주문번호입니다."],
    [new GuestOrderConfigurationError(), 503, "비회원 주문 서버 설정이 필요합니다."],
    [new FirebaseAdminConfigurationError(), 503, "비회원 주문 서버 설정이 필요합니다."],
  ])("maps %s to %i", async (error, expectedStatus, expectedMessage) => {
    mocks.create.mockRejectedValue(error);

    const response = await POST(createJsonRequest({
      order: validCreateBody,
      payment: validPayment,
      idempotencyKey,
    }));

    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toEqual({ message: expectedMessage });
  });

  it("returns a generic 500 and logs only a safe error class and generated request ID", async () => {
    const privateErrorMessage = `failure ${validCreateBody.phone} ${validCreateBody.address}`;
    mocks.create.mockRejectedValue(new Error(privateErrorMessage));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(createJsonRequest({
      order: validCreateBody,
      payment: validPayment,
      idempotencyKey,
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: "주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(consoleError).toHaveBeenCalledWith("Guest order API failure", {
      errorClass: "Error",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain(validCreateBody.phone);
    expect(logged).not.toContain(validCreateBody.address);
    expect(logged).not.toContain(privateErrorMessage);
  });
});
