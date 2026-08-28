import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { calculateCart } from "../../features/cart/cart-utils";
import { findSampleProduct as findLegacySampleProduct } from "../products/sample-products";
import type { PaymentResult } from "../payment/process-payment";
import type { Product } from "../products/types";
import type {
  GuestOrderPublic,
  GuestOrderRepository,
  GuestOrderService,
  GuestOrderStored,
} from "./types";
import {
  maskAddress,
  maskName,
  maskPhone,
  parseGuestOrderCreateInput,
  parseGuestOrderLookupInput,
  parseIdempotencyKey,
} from "./validation";

const MAX_FAILED_LOOKUPS = 5;
const ORDER_CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export class GuestOrderUnavailableError extends Error {
  constructor() {
    super("주문할 수 없는 상품이 포함되어 있습니다.");
    this.name = "GuestOrderUnavailableError";
  }
}

export class GuestOrderDuplicateError extends Error {
  constructor() {
    super("이미 존재하는 주문번호입니다.");
    this.name = "GuestOrderDuplicateError";
  }
}

export class GuestOrderNotFoundError extends Error {
  constructor() {
    super("주문번호와 휴대전화 번호를 다시 확인해 주세요.");
    this.name = "GuestOrderNotFoundError";
  }
}

export class GuestOrderRateLimitError extends Error {
  constructor() {
    super("잠시 후 다시 시도해 주세요.");
    this.name = "GuestOrderRateLimitError";
  }
}

export class GuestOrderConfigurationError extends Error {
  constructor() {
    super("비회원 주문 서버 설정이 필요합니다.");
    this.name = "GuestOrderConfigurationError";
  }
}

type GuestOrderServiceDependencies = {
  repository: GuestOrderRepository;
  lookupSecret?: string;
  now?: () => Date;
  findSampleProduct?: (id: string) => Product | null;
  createOrderCode?: () => string;
};

const randomOrderCode = (): string => Array.from(
  { length: 6 },
  () => ORDER_CODE_CHARACTERS[randomInt(ORDER_CODE_CHARACTERS.length)],
).join("");

const orderNumberFor = (receivedAt: Date, orderCode: string): string => {
  const date = receivedAt.toISOString().slice(0, 10).replaceAll("-", "");
  return `VL-${date}-${orderCode}`;
};

const receiptFor = (order: GuestOrderStored): PaymentResult => ({
  orderNumber: order.orderNumber,
  receivedAt: order.receivedAt.toISOString(),
});

const usableProduct = (product: Product | null, quantity: number): product is Product => Boolean(
  product
  && Number.isInteger(product.price)
  && product.price >= 0
  && Number.isInteger(product.stock)
  && product.stock >= quantity,
);

const safePhoneEqual = (left: string, right: string): boolean => {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
};

const toPublicOrder = (order: GuestOrderStored): GuestOrderPublic => ({
  orderNumber: order.orderNumber,
  status: order.status,
  receivedAt: order.receivedAt.toISOString(),
  customerNameMasked: maskName(order.customerName),
  phoneMasked: maskPhone(order.phoneNormalized),
  addressMasked: maskAddress(order.postcode, order.address),
  lines: order.lines.map((line) => ({ ...line })),
  subtotal: order.subtotal,
  shippingFee: order.shippingFee,
  total: order.total,
});

export const createGuestOrderService = ({
  repository,
  lookupSecret = process.env.GUEST_ORDER_LOOKUP_SECRET,
  now = () => new Date(),
  findSampleProduct = findLegacySampleProduct,
  createOrderCode = randomOrderCode,
}: GuestOrderServiceDependencies): GuestOrderService => {
  const secret = lookupSecret?.trim();
  if (!secret) throw new GuestOrderConfigurationError();

  const fingerprintFor = (clientKey: string): string =>
    createHmac("sha256", secret).update(clientKey).digest("hex");

  return {
    async create(value, paymentResult, rawIdempotencyKey) {
      const input = parseGuestOrderCreateInput(value);
      const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
      const idempotencyFingerprint = createHmac("sha256", secret)
        .update(`create:${idempotencyKey}`)
        .digest("hex");
      void paymentResult;

      const existingOrder = await repository.getOrderByIdempotency(idempotencyFingerprint);
      if (existingOrder) return receiptFor(existingOrder);

      const loadedProducts = await repository.loadProducts(input.lines.map((line) => line.productId));
      const products = input.lines.map((line, index) =>
        loadedProducts[index] ?? findSampleProduct(line.productId));

      if (products.some((candidate, index) => !usableProduct(candidate, input.lines[index].quantity))) {
        throw new GuestOrderUnavailableError();
      }

      const cartLines = input.lines.map((line, index) => {
        const candidate = products[index];
        if (!usableProduct(candidate, line.quantity)) throw new GuestOrderUnavailableError();
        return {
          productId: candidate.id,
          name: candidate.name,
          thumbnailUrl: candidate.thumbnailUrl,
          unitPrice: candidate.price,
          stock: candidate.stock,
          quantity: line.quantity,
          selected: true,
        };
      });
      const totals = calculateCart(cartLines);
      const receivedAt = now();
      const order: GuestOrderStored = {
        orderNumber: orderNumberFor(receivedAt, createOrderCode()),
        status: "mock-received",
        paymentMethod: input.paymentMethod,
        customerName: input.customerName,
        phoneNormalized: input.phone,
        postcode: input.postcode,
        address: input.address,
        addressDetail: input.addressDetail,
        deliveryNote: input.deliveryNote,
        lines: cartLines.map(({ productId, name, thumbnailUrl, unitPrice, quantity }) => ({
          productId,
          name,
          thumbnailUrl,
          unitPrice,
          quantity,
        })),
        subtotal: totals.subtotal,
        shippingFee: totals.shippingFee,
        total: totals.total,
        createdAt: receivedAt,
        receivedAt,
      };

      const persistedOrder = await repository.createOrder(order, idempotencyFingerprint);
      return receiptFor(persistedOrder);
    },

    async lookup(value, clientKey) {
      const input = parseGuestOrderLookupInput(value);
      const fingerprint = fingerprintFor(clientKey);
      const lookupTime = now();
      const reservation = await repository.setAttempt(fingerprint, lookupTime);
      if (reservation.failureCount > MAX_FAILED_LOOKUPS) {
        throw new GuestOrderRateLimitError();
      }

      const order = await repository.getOrder(input.orderNumber);
      const phoneMatches = safePhoneEqual(
        input.phone,
        order?.phoneNormalized ?? "00000000000",
      );
      if (!order || !phoneMatches) {
        throw new GuestOrderNotFoundError();
      }

      await repository.deleteAttempt(fingerprint);
      return toPublicOrder(order);
    },
  };
};

export type { PaymentResult };
