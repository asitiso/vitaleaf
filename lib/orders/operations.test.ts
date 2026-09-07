import { describe, expect, it } from "vitest";

import {
  normalizeOrderOperations,
  parseOrderOperationsUpdate,
} from "./operations";

describe("order operations", () => {
  it("normalizes a legacy order to the received state", () => {
    expect(normalizeOrderOperations({})).toEqual({
      status: "mock-received",
      isTestOrder: false,
      shippingCarrier: "",
      trackingNumber: "",
      statusUpdatedAt: null,
      statusUpdatedBy: "",
    });
  });

  it("normalizes stored operational fields and a Firestore timestamp", () => {
    const statusUpdatedAt = new Date("2026-09-07T03:00:00.000Z");

    expect(normalizeOrderOperations({
      status: "preparing",
      isTestOrder: true,
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234-5678",
      statusUpdatedAt: { toDate: () => statusUpdatedAt },
      statusUpdatedBy: "admin-1",
    })).toEqual({
      status: "preparing",
      isTestOrder: true,
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234-5678",
      statusUpdatedAt,
      statusUpdatedBy: "admin-1",
    });
  });

  it("ignores an invalid stored status and timestamp", () => {
    expect(normalizeOrderOperations({
      status: "paid",
      statusUpdatedAt: { toDate: () => new Date("invalid") },
    })).toMatchObject({
      status: "mock-received",
      statusUpdatedAt: null,
    });
  });

  it("requires shipping data only when changing to shipped", () => {
    expect(() => parseOrderOperationsUpdate({ status: "shipped" }))
      .toThrow("배송사와 송장번호를 입력해 주세요.");
    expect(parseOrderOperationsUpdate({
      status: "shipped",
      shippingCarrier: " CJ대한통운 ",
      trackingNumber: " 1234-5678 ",
    })).toEqual({
      status: "shipped",
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234-5678",
    });
  });

  it("clears shipping data when changing to a state other than shipped", () => {
    expect(parseOrderOperationsUpdate({
      status: "completed",
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234-5678",
    })).toEqual({
      status: "completed",
      shippingCarrier: "",
      trackingNumber: "",
    });
  });

  it("rejects an unknown state", () => {
    expect(() => parseOrderOperationsUpdate({ status: "paid" }))
      .toThrow("주문 처리 정보를 다시 확인해 주세요.");
  });

  it("rejects unknown fields", () => {
    expect(() => parseOrderOperationsUpdate({ status: "mock-received", total: 1 }))
      .toThrow("주문 처리 정보를 다시 확인해 주세요.");
  });
});
