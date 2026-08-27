import { randomUUID } from "node:crypto";

import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import { guestOrderRepository } from "../../../../lib/firebase/guest-orders";
import {
  createGuestOrderService,
  GuestOrderConfigurationError,
  GuestOrderNotFoundError,
  GuestOrderRateLimitError,
} from "../../../../lib/guest-orders/service";
import { GuestOrderValidationError } from "../../../../lib/guest-orders/validation";

export const runtime = "nodejs";

const jsonMessage = (message: string, status: number): Response =>
  Response.json({ message }, { status });

const clientKeyFrom = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
};

const safeErrorClass = (error: unknown): string => {
  const className = error instanceof Error ? error.constructor.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(className) ? className : "UnknownError";
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
    const order = await service.lookup(body, clientKeyFrom(request));
    return Response.json({ order });
  } catch (error) {
    if (error instanceof GuestOrderValidationError) {
      return jsonMessage("비회원 주문 정보를 다시 확인해 주세요.", 400);
    }
    if (error instanceof GuestOrderNotFoundError) {
      return jsonMessage("주문번호와 휴대전화 번호를 다시 확인해 주세요.", 404);
    }
    if (error instanceof GuestOrderRateLimitError) {
      return jsonMessage("잠시 후 다시 시도해 주세요.", 429);
    }
    if (
      error instanceof GuestOrderConfigurationError
      || error instanceof FirebaseAdminConfigurationError
    ) {
      return jsonMessage("비회원 주문 서버 설정이 필요합니다.", 503);
    }

    console.error("Guest order lookup API failure", {
      errorClass: safeErrorClass(error),
      requestId: randomUUID(),
    });
    return jsonMessage("주문 조회 중 문제가 발생했습니다.", 500);
  }
}
