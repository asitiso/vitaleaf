import type { OrderDraft, PaymentResult } from "../payment/process-payment";
import { getCurrentFirebaseIdToken } from "../firebase/id-token";

const ORDER_NUMBER = /^VL-\d{8}-[A-Z0-9]{6}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export class MemberOrderClientError extends Error {
  constructor(message = "주문 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
    super(message);
    this.name = "MemberOrderClientError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MemberOrderClientError();
  }
  return value as Record<string, unknown>;
};

const parseReceipt = (value: unknown): PaymentResult => {
  const receipt = asRecord(value);
  const orderNumber = receipt.orderNumber;
  const receivedAt = receipt.receivedAt;
  if (typeof orderNumber !== "string" || !ORDER_NUMBER.test(orderNumber)) {
    throw new MemberOrderClientError();
  }
  if (typeof receivedAt !== "string" || !ISO_TIMESTAMP.test(receivedAt)) {
    throw new MemberOrderClientError();
  }
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== receivedAt) {
    throw new MemberOrderClientError();
  }
  return { orderNumber, receivedAt };
};

const readMessage = async (response: Response): Promise<string> => {
  try {
    const message = asRecord(await response.json()).message;
    return typeof message === "string" && message.length > 0 && message.length <= 200
      ? message
      : "주문 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  } catch {
    return "주문 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
};

const toPayloadOrder = (order: OrderDraft) => ({
  customerName: order.customerName,
  phone: order.phone,
  postcode: order.postcode,
  address: order.address,
  addressDetail: order.addressDetail,
  deliveryNote: order.deliveryNote,
  paymentMethod: order.paymentMethod,
  lines: order.lines.map(({ productId, purchaseOptionId, quantity }) => ({
    productId,
    purchaseOptionId,
    quantity,
  })),
});

export async function createMemberOrder(
  order: OrderDraft,
  payment: PaymentResult,
  idempotencyKey: string,
): Promise<PaymentResult> {
  const token = await getCurrentFirebaseIdToken();
  const response = await fetch("/api/member-orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ order: toPayloadOrder(order), payment, idempotencyKey }),
  });
  if (!response.ok) throw new MemberOrderClientError(await readMessage(response));
  try {
    return parseReceipt(await response.json());
  } catch (error) {
    if (error instanceof MemberOrderClientError) throw error;
    throw new MemberOrderClientError();
  }
}
