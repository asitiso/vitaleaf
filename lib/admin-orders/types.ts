import type { MemberOrder, MemberOrderSnapshotLine } from "../firebase/member-orders";
import type { GuestOrderStored } from "../guest-orders/types";
import type { OrderOperationsUpdate, OrderStatus } from "../orders/operations";

export type AdminOrderReference =
  | { source: "member"; ownerId: string; orderNumber: string }
  | { source: "guest"; ownerId: null; orderNumber: string };

export type AdminOrderListItem = AdminOrderReference & {
  customerName: string;
  createdAt: string | null;
  itemSummary: string;
  total: number;
  status: OrderStatus;
  isTestOrder: boolean;
};

export type AdminOrderDetail = AdminOrderListItem & {
  phone: string;
  shippingAddress: { postcode: string; address: string; addressDetail: string };
  deliveryNote: string;
  paymentMethod: "card" | "bank" | "easy";
  lines: MemberOrderSnapshotLine[];
  subtotal: number;
  shippingFee: number;
  receivedAt: string | null;
  shippingCarrier: string;
  trackingNumber: string;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string;
};

export type AdminOrderRepository = {
  listMember(limit: number): Promise<MemberOrder[]>;
  listGuest(limit: number): Promise<GuestOrderStored[]>;
  get(reference: AdminOrderReference): Promise<MemberOrder | GuestOrderStored | null>;
  update(reference: AdminOrderReference, operations: OrderOperationsUpdate, adminUid: string, now: Date): Promise<MemberOrder | GuestOrderStored>;
};

export type AdminOrderService = {
  list(): Promise<AdminOrderListItem[]>;
  detail(reference: AdminOrderReference): Promise<AdminOrderDetail | null>;
  update(reference: AdminOrderReference, value: unknown, adminUid: string): Promise<AdminOrderDetail>;
};
