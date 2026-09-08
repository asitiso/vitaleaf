import { AdminOrderAccessError, AdminOrderNotFoundError, createAdminOrderService } from "../../../../../lib/admin-orders/service";
import type { AdminOrderReference } from "../../../../../lib/admin-orders/types";
import { parseAdminOrderReference } from "../../../../../lib/admin-orders/validation";
import { FirebaseAdminConfigurationError } from "../../../../../lib/firebase/admin";
import { ServerAuthenticationError, verifyBearerAdmin } from "../../../../../lib/firebase/admin-auth";
import { adminOrderRepository } from "../../../../../lib/firebase/admin-orders";

export const runtime = "nodejs";

const message = (text: string, status: number) =>
  Response.json({ message: text }, { status });

const adminOrderService = createAdminOrderService(adminOrderRepository);

export async function POST(request: Request): Promise<Response> {
  try {
    await verifyBearerAdmin(request);
    let reference: AdminOrderReference;
    try {
      reference = parseAdminOrderReference(await request.json());
    } catch {
      return message("주문 조회 조건을 다시 확인해 주세요.", 400);
    }
    const order = await adminOrderService.detail(reference);
    if (!order) return message("주문 정보를 찾을 수 없습니다.", 404);
    return Response.json({ order });
  } catch (error) {
    if (error instanceof ServerAuthenticationError) return message("관리자 로그인이 필요합니다.", error.status);
    if (error instanceof FirebaseAdminConfigurationError) return message("주문 서비스를 잠시 사용할 수 없습니다.", 503);
    if (error instanceof AdminOrderAccessError) return message("이 주문에 접근할 수 없습니다.", 403);
    if (error instanceof AdminOrderNotFoundError) return message("주문 정보를 찾을 수 없습니다.", 404);
    console.error("Admin order detail request failed.");
    return message("주문 정보를 불러오지 못했습니다.", 500);
  }
}
