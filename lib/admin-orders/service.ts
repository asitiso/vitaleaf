import type { MemberOrder } from "../firebase/member-orders";
import type { GuestOrderStored } from "../guest-orders/types";
import { normalizeOrderOperations, parseOrderOperationsUpdate } from "../orders/operations";
import type { AdminOrderDetail, AdminOrderListItem, AdminOrderReference, AdminOrderRepository, AdminOrderService } from "./types";
import { parseAdminOrderReference } from "./validation";

export class AdminOrderAccessError extends Error {
  constructor() {
    super("이 주문에 접근할 수 없습니다.");
    this.name = "AdminOrderAccessError";
  }
}

export class AdminOrderNotFoundError extends Error {
  constructor() {
    super("주문을 찾을 수 없습니다.");
    this.name = "AdminOrderNotFoundError";
  }
}

type StoredOrder = MemberOrder | GuestOrderStored;
const isoDate = (date: Date | null | undefined): string | null =>
  date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;

const checkOwner = (reference: AdminOrderReference, order: StoredOrder): void => {
  if (reference.source === "member" && (!("userId" in order) || order.userId !== reference.ownerId)) {
    throw new AdminOrderAccessError();
  }
};

export const toAdminOrderListItem = (input: AdminOrderReference, order: StoredOrder): AdminOrderListItem => {
  const reference = parseAdminOrderReference(input);
  checkOwner(reference, order);
  const operations = normalizeOrderOperations(order);
  const firstName = order.lines[0]?.name || "상품 정보 없음";
  return {
    ...reference,
    customerName: order.customerName,
    createdAt: isoDate(order.createdAt),
    itemSummary: order.lines.length > 1 ? `${firstName} 외 ${order.lines.length - 1}건` : firstName,
    total: order.total,
    status: operations.status,
    isTestOrder: operations.isTestOrder,
  };
};

export const toAdminOrderDetail = (reference: AdminOrderReference, order: StoredOrder): AdminOrderDetail => {
  const listItem = toAdminOrderListItem(reference, order);
  const operations = normalizeOrderOperations(order);
  const address = "shippingAddress" in order ? order.shippingAddress : order;
  return {
    ...listItem,
    phone: "phone" in order ? order.phone : order.phoneNormalized,
    shippingAddress: { postcode: address.postcode, address: address.address, addressDetail: address.addressDetail },
    deliveryNote: order.deliveryNote,
    paymentMethod: order.paymentMethod,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      purchaseOptionId: line.purchaseOptionId ?? "default",
      purchaseOptionLabel: line.purchaseOptionLabel ?? "기본 구성",
      sku: line.sku ?? "",
      name: line.name,
      thumbnailUrl: line.thumbnailUrl ?? "",
      basePrice: line.basePrice ?? line.unitPrice,
      priceAdjustment: line.priceAdjustment ?? 0,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal ?? line.unitPrice * line.quantity,
    })),
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    receivedAt: isoDate(order.receivedAt),
    shippingCarrier: operations.shippingCarrier,
    trackingNumber: operations.trackingNumber,
    statusUpdatedAt: isoDate(operations.statusUpdatedAt),
    statusUpdatedBy: operations.statusUpdatedBy,
  };
};

const newestFirst = (left: AdminOrderListItem, right: AdminOrderListItem): number => {
  const difference = (right.createdAt ? Date.parse(right.createdAt) : -Infinity)
    - (left.createdAt ? Date.parse(left.createdAt) : -Infinity);
  if (difference && !Number.isNaN(difference)) return difference;
  return left.orderNumber === right.orderNumber ? 0 : left.orderNumber < right.orderNumber ? 1 : -1;
};

export const createAdminOrderService = (
  repository: AdminOrderRepository,
  now: () => Date = () => new Date(),
): AdminOrderService => ({
  async list() {
    const [members, guests] = await Promise.all([repository.listMember(100), repository.listGuest(100)]);
    return [
      ...members.map((order) => toAdminOrderListItem({ source: "member", ownerId: order.userId, orderNumber: order.id }, order)),
      ...guests.map((order) => toAdminOrderListItem({ source: "guest", ownerId: null, orderNumber: order.orderNumber }, order)),
    ].sort(newestFirst).slice(0, 200);
  },
  async detail(input) {
    const reference = parseAdminOrderReference(input);
    const order = await repository.get(reference);
    return order ? toAdminOrderDetail(reference, order) : null;
  },
  async update(input, value, adminUid) {
    const reference = parseAdminOrderReference(input);
    const operations = parseOrderOperationsUpdate(value);
    const order = await repository.update(reference, operations, adminUid, now());
    return toAdminOrderDetail(reference, order);
  },
});
