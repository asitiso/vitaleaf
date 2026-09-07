import { randomUUID } from "node:crypto";

import { ServerAuthenticationError, verifyBearerMember } from "../../../lib/firebase/admin-auth";
import { memberOrderRepository } from "../../../lib/firebase/member-orders.server";
import { GuestOrderValidationError } from "../../../lib/guest-orders/validation";
import {
  createMemberOrderService,
  MemberOrderDuplicateError,
  MemberOrderIdempotencyConflictError,
  MemberOrderUnavailableError,
} from "../../../lib/member-orders/service";

export const runtime = "nodejs";

const jsonMessage = (message: string, status: number): Response =>
  Response.json({ message }, { status });

const safeErrorClass = (error: unknown): string => {
  const className = error instanceof Error ? error.constructor.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(className) ? className : "UnknownError";
};

const parseCreatePayload = (
  value: unknown,
): { order: unknown; payment: unknown; idempotencyKey: unknown } => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GuestOrderValidationError();
  }
  const payload = value as Record<string, unknown>;
  if (!("order" in payload) || !("payment" in payload) || !("idempotencyKey" in payload)) {
    throw new GuestOrderValidationError();
  }
  return {
    order: payload.order,
    payment: payload.payment,
    idempotencyKey: payload.idempotencyKey,
  };
};

export async function POST(request: Request): Promise<Response> {
  let uid: string;
  try {
    uid = (await verifyBearerMember(request)).uid;
  } catch (error) {
    if (error instanceof ServerAuthenticationError) {
      return jsonMessage("로그인이 필요합니다.", error.status);
    }
    console.error("Member order API failure", {
      errorClass: safeErrorClass(error),
      requestId: randomUUID(),
    });
    return jsonMessage("주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonMessage("주문 정보를 다시 확인해 주세요.", 400);
  }

  try {
    const { order, payment, idempotencyKey } = parseCreatePayload(body);
    const service = createMemberOrderService({
      repository: memberOrderRepository,
      testCustomerUid: process.env.TEST_CUSTOMER_UID?.trim() || null,
    });
    const receipt = await service.create(uid, order, payment, idempotencyKey);
    return Response.json(receipt, { status: 201 });
  } catch (error) {
    if (error instanceof GuestOrderValidationError) {
      return jsonMessage("주문 정보를 다시 확인해 주세요.", 400);
    }
    if (
      error instanceof MemberOrderUnavailableError
      || error instanceof MemberOrderIdempotencyConflictError
      || error instanceof MemberOrderDuplicateError
    ) {
      return jsonMessage("주문할 수 없는 상품이 포함되어 있습니다.", 409);
    }

    console.error("Member order API failure", {
      errorClass: safeErrorClass(error),
      requestId: randomUUID(),
    });
    return jsonMessage("주문을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
