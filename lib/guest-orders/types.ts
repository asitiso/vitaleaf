import type { PaymentResult } from "../payment/process-payment";
import type { Product } from "../products/types";

export type GuestOrderStatus = "mock-received";

export type GuestOrderCreateLineInput = {
  productId: string;
  purchaseOptionId: string;
  quantity: number;
};

export type GuestOrderCreateInput = {
  customerName: string;
  phone: string;
  postcode: string;
  address: string;
  addressDetail: string;
  deliveryNote: string;
  paymentMethod: "card" | "bank" | "easy";
  lines: GuestOrderCreateLineInput[];
};

export type GuestOrderLine = {
  productId: string;
  purchaseOptionId: string;
  purchaseOptionLabel: string;
  sku: string;
  name: string;
  thumbnailUrl: string;
  basePrice: number;
  priceAdjustment: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type GuestOrderStored = {
  orderNumber: string;
  status: GuestOrderStatus;
  paymentMethod: GuestOrderCreateInput["paymentMethod"];
  customerName: string;
  phoneNormalized: string;
  postcode: string;
  address: string;
  addressDetail: string;
  deliveryNote: string;
  lines: GuestOrderLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
  createdAt: Date;
  receivedAt: Date;
};

export type GuestOrderPublic = {
  orderNumber: string;
  status: GuestOrderStatus;
  receivedAt: string;
  customerNameMasked: string;
  phoneMasked: string;
  addressMasked: string;
  lines: GuestOrderLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
};

export type GuestOrderAttempt = {
  failureCount: number;
  expiresAt: Date;
};

export type GuestOrderRepository = {
  loadProducts(productIds: string[]): Promise<(Product | null)[]>;
  createOrder(order: GuestOrderStored, idempotencyFingerprint: string): Promise<GuestOrderStored>;
  getOrderByIdempotency(idempotencyFingerprint: string): Promise<GuestOrderStored | null>;
  getOrder(orderNumber: string): Promise<GuestOrderStored | null>;
  getAttempt(fingerprint: string): Promise<GuestOrderAttempt | null>;
  setAttempt(fingerprint: string, now: Date): Promise<GuestOrderAttempt>;
  deleteAttempt(fingerprint: string): Promise<void>;
};

export type GuestOrderService = {
  create(input: unknown, payment: unknown, idempotencyKey: unknown): Promise<PaymentResult>;
  lookup(input: unknown, clientKey: string): Promise<GuestOrderPublic>;
};
