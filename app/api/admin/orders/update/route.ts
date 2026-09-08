import { AdminOrderAccessError, AdminOrderNotFoundError, createAdminOrderService } from "../../../../../lib/admin-orders/service";
import type { AdminOrderReference } from "../../../../../lib/admin-orders/types";
import { parseAdminOrderReference } from "../../../../../lib/admin-orders/validation";
import { FirebaseAdminConfigurationError } from "../../../../../lib/firebase/admin";
import { ServerAuthenticationError, verifyBearerAdmin } from "../../../../../lib/firebase/admin-auth";
import { adminOrderRepository } from "../../../../../lib/firebase/admin-orders";
import { parseOrderOperationsUpdate, type OrderOperationsUpdate } from "../../../../../lib/orders/operations";

export const runtime = "nodejs";

const message = (text: string, status: number) =>
  Response.json({ message: text }, { status });

const adminOrderService = createAdminOrderService(adminOrderRepository);

export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await verifyBearerAdmin(request);
    let reference: AdminOrderReference;
    let operations: OrderOperationsUpdate;
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return message("주문 처리 정보를 다시 확인해 주세요.", 400);
      }
      const allowed = ["source", "ownerId", "orderNumber", "status", "shippingCarrier", "trackingNumber"];
      if (Object.keys(input).some((key) => !allowed.includes(key))) {
        return message("주문 처리 정보를 다시 확인해 주세요.", 400);
      }
      const { source, ownerId, orderNumber, status, shippingCarrier, trackingNumber } = input as Record<string, unknown>;
      reference = parseAdminOrderReference({ source, ownerId, orderNumber });
      operations = parseOrderOperationsUpdate({ status, shippingCarrier, trackingNumber });
    } catch {
      return message("주문 처리 정보를 다시 확인해 주세요.", 400);
    }
    return Response.json({ order: await adminOrderService.update(reference, operations, admin.uid) });
  } catch (error) {
    if (error instanceof ServerAuthenticationError) return message("관리자 로그인이 필요합니다.", error.status);
    if (error instanceof FirebaseAdminConfigurationError) return message("주문 서비스를 잠시 사용할 수 없습니다.", 503);
    if (error instanceof AdminOrderAccessError) return message("이 주문에 접근할 수 없습니다.", 403);
    if (error instanceof AdminOrderNotFoundError) return message("주문 정보를 찾을 수 없습니다.", 404);
    console.error("Admin order update request failed.");
    return message("주문 처리 정보를 저장하지 못했습니다.", 500);
  }
}
