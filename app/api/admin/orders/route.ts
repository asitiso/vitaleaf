import { AdminOrderAccessError, createAdminOrderService } from "../../../../lib/admin-orders/service";
import { FirebaseAdminConfigurationError } from "../../../../lib/firebase/admin";
import { ServerAuthenticationError, verifyBearerAdmin } from "../../../../lib/firebase/admin-auth";
import { adminOrderRepository } from "../../../../lib/firebase/admin-orders";

export const runtime = "nodejs";

const message = (text: string, status: number) =>
  Response.json({ message: text }, { status });

const adminOrderService = createAdminOrderService(adminOrderRepository);

export async function POST(request: Request): Promise<Response> {
  try {
    await verifyBearerAdmin(request);
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== "object" || Array.isArray(input)
        || Object.keys(input).length !== 1
        || !("action" in input) || input.action !== "list") {
        return message("주문 조회 조건을 다시 확인해 주세요.", 400);
      }
    } catch {
      return message("주문 조회 조건을 다시 확인해 주세요.", 400);
    }
    return Response.json({ orders: await adminOrderService.list() });
  } catch (error) {
    if (error instanceof ServerAuthenticationError) return message("관리자 로그인이 필요합니다.", error.status);
    if (error instanceof FirebaseAdminConfigurationError) return message("주문 서비스를 잠시 사용할 수 없습니다.", 503);
    if (error instanceof AdminOrderAccessError) return message("이 주문에 접근할 수 없습니다.", 403);
    console.error("Admin order list request failed.");
    return message("주문 정보를 불러오지 못했습니다.", 500);
  }
}
