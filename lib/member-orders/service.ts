import { calculateCart, cartLineId } from "../../features/cart/cart-utils";
import type { PaymentResult } from "../payment/process-payment";
import {
  OrderCatalogInvalidError,
  OrderLineUnavailableError,
  resolveOrderLines,
} from "../orders/resolve-order-lines";
import type { MemberOrderStored } from "../firebase/member-orders";
import type { MemberOrderServerRepository } from "../firebase/member-orders.server";
import {
  parseGuestOrderCreateInput,
  parseIdempotencyKey,
  parsePaymentResult,
} from "../guest-orders/validation";
import {
  MemberOrderIdempotencyConflictError,
  MemberOrderUnavailableError,
} from "./errors";

type MemberOrderServiceDependencies = {
  repository: MemberOrderServerRepository;
};

const receiptFor = (order: MemberOrderStored): PaymentResult => ({
  orderNumber: order.orderNumber,
  receivedAt: order.receivedAt.toISOString(),
});

const requestFingerprintFor = (input: ReturnType<typeof parseGuestOrderCreateInput>): string =>
  JSON.stringify({
    customerName: input.customerName,
    phone: input.phone,
    postcode: input.postcode,
    address: input.address,
    addressDetail: input.addressDetail,
    deliveryNote: input.deliveryNote,
    paymentMethod: input.paymentMethod,
    lines: input.lines,
  });

export const createMemberOrderService = ({ repository }: MemberOrderServiceDependencies) => ({
  async create(
    uid: string,
    value: unknown,
    paymentValue: unknown,
    rawIdempotencyKey: unknown,
  ): Promise<PaymentResult> {
    const input = parseGuestOrderCreateInput(value);
    const payment = parsePaymentResult(paymentValue);
    const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
    const requestFingerprint = requestFingerprintFor(input);

    const existing = await repository.getOrderByIdempotency(uid, idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new MemberOrderIdempotencyConflictError();
      }
      return receiptFor(existing.order);
    }

    let resolvedLines;
    try {
      const productIds = [...new Set(input.lines.map((line) => line.productId))];
      const loadedProducts = await repository.loadProducts(productIds);
      const productsById = new Map(productIds.map((productId, index) => [
        productId,
        loadedProducts[index] ?? null,
      ]));
      resolvedLines = resolveOrderLines(
        input.lines,
        input.lines.map((line) => productsById.get(line.productId) ?? null),
      );
    } catch (error) {
      if (
        error instanceof OrderLineUnavailableError
        || error instanceof OrderCatalogInvalidError
      ) {
        throw new MemberOrderUnavailableError();
      }
      throw error;
    }

    const cartLines = resolvedLines.map((line) => ({
      ...line,
      lineId: cartLineId(line.productId, line.purchaseOptionId),
      selected: true,
    }));
    const totals = calculateCart(cartLines);
    const order: MemberOrderStored = {
      userId: uid,
      orderNumber: payment.orderNumber,
      status: "mock-received",
      paymentMethod: input.paymentMethod,
      customerName: input.customerName,
      phone: input.phone,
      shippingAddress: {
        postcode: input.postcode,
        address: input.address,
        addressDetail: input.addressDetail,
      },
      deliveryNote: input.deliveryNote,
      lines: resolvedLines.map(({
        productId,
        purchaseOptionId,
        purchaseOptionLabel,
        sku,
        name,
        thumbnailUrl,
        basePrice,
        priceAdjustment,
        unitPrice,
        quantity,
        lineTotal,
      }) => ({
        productId,
        purchaseOptionId,
        purchaseOptionLabel,
        sku,
        name,
        thumbnailUrl,
        basePrice,
        priceAdjustment,
        unitPrice,
        quantity,
        lineTotal,
      })),
      subtotal: totals.subtotal,
      shippingFee: totals.shippingFee,
      total: totals.total,
      createdAt: payment.receivedAt,
      receivedAt: payment.receivedAt,
    };
    const persisted = await repository.createOrder(
      uid,
      order,
      idempotencyKey,
      requestFingerprint,
    );
    return receiptFor(persisted.order);
  },
});

export {
  MemberOrderDuplicateError,
  MemberOrderIdempotencyConflictError,
  MemberOrderUnavailableError,
} from "./errors";
