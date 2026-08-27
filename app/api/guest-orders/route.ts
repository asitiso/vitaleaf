import { randomUUID } from "node:crypto";

import { FirebaseAdminConfigurationError } from "../../../lib/firebase/admin";
import { guestOrderRepository } from "../../../lib/firebase/guest-orders";
import {
  createGuestOrderService,
  GuestOrderConfigurationError,
  GuestOrderDuplicateError,
  GuestOrderUnavailableError,
} from "../../../lib/guest-orders/service";
import { GuestOrderValidationError } from "../../../lib/guest-orders/validation";

export const runtime = "nodejs";

const jsonMessage = (message: string, status: number): Response =>
  Response.json({ message }, { status });

const safeErrorClass = (error: unknown): string => {
  const className = error instanceof Error ? error.constructor.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(className) ? className : "UnknownError";
};

const parseCreatePayload = (value: unknown): { order: unknown; payment: unknown } => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GuestOrderValidationError();
  }
  const payload = value as Record<string, unknown>;
  if (!("order" in payload) || !("payment" in payload)) {
    throw new GuestOrderValidationError();
  }
  return { order: payload.order, payment: payload.payment };
};

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonMessage("비회원 주문 정보를 다시 확인해 주세요.", 400);
  }

  try {
    const service = createGuestOrderService({ repository: guestOrderRepository });
    const { order, payment } = parseCreatePayload(body);
    const receipt = await service.create(order, payment);
    return Response.json({
      orderNumber: receipt.orderNumber,
      receivedAt: receipt.receivedAt,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof GuestOrderValidationError) {
      return jsonMessage("비회원 주문 정보를 다시 확인해 주세요.", 400);
    }
    if (error instanceof GuestOrderUnavailableError) {
      return jsonMessage("주문할 수 없는 상품이 포함되어 있습니다.", 409);
    }
    if (error instanceof GuestOrderDuplicateError) {
      return jsonMessage("이미 존재하는 주문번호입니다.", 409);
    }
    if (
      error instanceof GuestOrderConfigurationError
      || error instanceof FirebaseAdminConfigurationError
    ) {
      return jsonMessage("비회원 주문 서버 설정이 필요합니다.", 503);
    }

    console.error("Guest order API failure", {
      errorClass: safeErrorClass(error),
      requestId: randomUUID(),
    });
    return jsonMessage("주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
