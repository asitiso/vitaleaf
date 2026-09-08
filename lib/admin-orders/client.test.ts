import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../firebase/id-token", () => ({ getCurrentFirebaseIdToken: tokenMock }));

import { AdminOrderClientError, adminOrderClient } from "./client";

const fetchMock = vi.fn();
const memberReference = {
  source: "member",
  ownerId: "member-1",
  orderNumber: "VL-20260907-TEST01",
} as const;

const listItem = {
  ...memberReference,
  customerName: "김민수",
  createdAt: "2026-09-07T01:02:03.000Z",
  itemSummary: "비타민 외 1건",
  total: 52_000,
  status: "mock-received" as const,
  isTestOrder: true,
};

const detail = {
  ...listItem,
  phone: "010-1234-5678",
  shippingAddress: {
    postcode: "06236",
    address: "서울특별시 강남구 테헤란로",
    addressDetail: "4층",
  },
  deliveryNote: "문 앞에 놓아 주세요.",
  paymentMethod: "card" as const,
  lines: [{
    productId: "vitamin",
    purchaseOptionId: "2-month",
    purchaseOptionLabel: "2개월분",
    sku: "VITA-2M",
    name: "비타민",
    thumbnailUrl: "/vitamin.jpg",
    basePrice: 30_000,
    priceAdjustment: -5_000,
    quantity: 2,
    unitPrice: 25_000,
    lineTotal: 50_000,
  }],
  subtotal: 50_000,
  shippingFee: 2_000,
  receivedAt: "2026-09-07T01:02:03.000Z",
  shippingCarrier: "",
  trackingNumber: "",
  statusUpdatedAt: null,
  statusUpdatedBy: "",
};

beforeEach(() => {
  tokenMock.mockReset().mockResolvedValue("fresh-token");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adminOrderClient transport", () => {
  it("sends a freshly refreshed member token to each administrator endpoint", async () => {
    tokenMock.mockResolvedValueOnce("fresh-list-token")
      .mockResolvedValueOnce("fresh-detail-token")
      .mockResolvedValueOnce("fresh-update-token");
    fetchMock.mockResolvedValueOnce(Response.json({ orders: [] }))
      .mockResolvedValueOnce(Response.json({ order: detail }))
      .mockResolvedValueOnce(Response.json({ order: { ...detail, status: "preparing" } }));

    await adminOrderClient.list();
    await adminOrderClient.get(memberReference);
    await adminOrderClient.update(memberReference, {
      status: "preparing",
      shippingCarrier: "",
      trackingNumber: "",
    });

    expect(tokenMock).toHaveBeenCalledTimes(3);
    expect(tokenMock).toHaveBeenNthCalledWith(1, true);
    expect(tokenMock).toHaveBeenNthCalledWith(2, true);
    expect(tokenMock).toHaveBeenNthCalledWith(3, true);
    expect(fetchMock.mock.calls).toEqual([
      ["/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer fresh-list-token" },
        body: JSON.stringify({ action: "list" }),
      }],
      ["/api/admin/orders/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer fresh-detail-token" },
        body: JSON.stringify(memberReference),
      }],
      ["/api/admin/orders/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer fresh-update-token" },
        body: JSON.stringify({
          ...memberReference,
          status: "preparing",
          shippingCarrier: "",
          trackingNumber: "",
        }),
      }],
    ]);
  });

  it("passes the signal to fetch and preserves its abort error", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("cancelled", "AbortError");
    fetchMock.mockRejectedValueOnce(abortError);

    const result = adminOrderClient.list(controller.signal);

    await expect(result).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/orders", expect.objectContaining({
      signal: controller.signal,
    }));
  });

  it("does not send a request when cancellation occurs while refreshing the token", async () => {
    let resolveToken!: (token: string) => void;
    tokenMock.mockReturnValueOnce(new Promise<string>((resolve) => {
      resolveToken = resolve;
    }));
    const controller = new AbortController();
    const abortError = new DOMException("cancelled before fetch", "AbortError");
    const result = adminOrderClient.list(controller.signal);

    controller.abort(abortError);
    resolveToken("must-not-be-sent");

    await expect(result).rejects.toBe(abortError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])("maps HTTP %s to the administrator re-login error", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: "private credential details" }, { status }));

    await expect(adminOrderClient.list()).rejects.toMatchObject({
      status,
      message: "관리자 권한을 확인하고 다시 로그인해 주세요.",
    });
  });

  it.each([400, 404, 500, 503])("uses a safe Korean error for HTTP %s", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: "private credential details" }, { status }));

    const error = await adminOrderClient.list().catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      status,
      message: expect.stringMatching(/[가-힣]/u),
    });
    expect(error).not.toMatchObject({ message: expect.stringContaining("private credential details") });
  });

  it("sanitizes token and network failures", async () => {
    tokenMock.mockRejectedValueOnce(new Error("private token configuration"));
    await expect(adminOrderClient.list()).rejects.toMatchObject({
      message: expect.not.stringContaining("private"),
    });

    fetchMock.mockRejectedValueOnce(new Error("private internal endpoint"));
    await expect(adminOrderClient.list()).rejects.toMatchObject({
      message: expect.not.stringContaining("private"),
    });
  });

  it("rejects extra caller reference fields before they can leak through detail transport", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ order: detail }));
    const hostileReference = {
      ...memberReference,
      bearerToken: "caller-private-token",
      phone: "010-0000-0000",
    };

    await expect(adminOrderClient.get(hostileReference as typeof memberReference))
      .rejects.toThrow(AdminOrderClientError);
    expect(tokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects operations that try to redirect an update before any authenticated request", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ order: detail }));
    const hostileOperations = {
      status: "shipped",
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234567890",
      source: "guest",
      ownerId: null,
      orderNumber: "VL-20260907-OTHER1",
      bearerToken: "caller-private-token",
    };

    await expect(adminOrderClient.update(memberReference, hostileOperations as never))
      .rejects.toThrow(AdminOrderClientError);
    expect(tokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only canonical reference and operation fields after server-compatible trimming", async () => {
    const rawReference = {
      source: "member",
      ownerId: " member-1 ",
      orderNumber: " VL-20260907-TEST01 ",
    } as const;
    const rawOperations = {
      status: "shipped",
      shippingCarrier: " CJ대한통운 ",
      trackingNumber: " 1234567890 ",
    } as const;
    const shipped = {
      ...detail,
      status: "shipped" as const,
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234567890",
    };
    fetchMock.mockResolvedValueOnce(Response.json({ order: detail }))
      .mockResolvedValueOnce(Response.json({ order: shipped }));

    await expect(adminOrderClient.get(rawReference)).resolves.toEqual(detail);
    await expect(adminOrderClient.update(rawReference, rawOperations)).resolves.toEqual(shipped);
    expect(fetchMock.mock.calls.map(([url, options]) => [url, JSON.parse(options.body)])).toEqual([
      ["/api/admin/orders/detail", memberReference],
      ["/api/admin/orders/update", {
        ...memberReference,
        status: "shipped",
        shippingCarrier: "CJ대한통운",
        trackingNumber: "1234567890",
      }],
    ]);
  });
});

describe("adminOrderClient response validation", () => {
  it("accepts the exact list and detail public contracts", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ orders: [listItem] }))
      .mockResolvedValueOnce(Response.json({ order: detail }));

    await expect(adminOrderClient.list()).resolves.toEqual([listItem]);
    await expect(adminOrderClient.get(memberReference)).resolves.toEqual(detail);
  });

  it.each([
    { orders: [], secret: "private" },
    { orders: null },
    {},
  ])("rejects a malformed list envelope: %j", async (payload) => {
    fetchMock.mockResolvedValueOnce(Response.json(payload));
    await expect(adminOrderClient.list()).rejects.toThrow(AdminOrderClientError);
  });

  it.each([
    { order: detail, secret: "private" },
    { order: null },
    {},
  ])("rejects a malformed detail envelope: %j", async (payload) => {
    fetchMock.mockResolvedValueOnce(Response.json(payload));
    await expect(adminOrderClient.get(memberReference)).rejects.toThrow(AdminOrderClientError);
  });

  it("rejects more than 200 list rows", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      orders: Array.from({ length: 201 }, () => listItem),
    }));

    await expect(adminOrderClient.list()).rejects.toThrow(AdminOrderClientError);
  });

  it.each([
    { phone: "010-0000-0000" },
    { userId: "private-owner" },
    { shippingAddress: detail.shippingAddress },
  ])("rejects detail-only or private fields in a list row: %j", async (extra) => {
    fetchMock.mockResolvedValueOnce(Response.json({ orders: [{ ...listItem, ...extra }] }));
    await expect(adminOrderClient.list()).rejects.toThrow(AdminOrderClientError);
  });

  it.each([
    { ...detail, userId: "private-owner" },
    { ...detail, shippingAddress: { ...detail.shippingAddress, storagePath: "private/path" } },
    { ...detail, lines: [{ ...detail.lines[0], secret: "private" }] },
  ])("rejects extra private detail fields", async (order) => {
    fetchMock.mockResolvedValueOnce(Response.json({ order }));
    await expect(adminOrderClient.get(memberReference)).rejects.toThrow(AdminOrderClientError);
  });

  it.each([
    ["createdAt", "2026-09-07T01:02:03Z"],
    ["createdAt", "2026-02-30T01:02:03.000Z"],
    ["receivedAt", "not-a-date"],
    ["statusUpdatedAt", "2026-09-07 01:02:03"],
  ])("rejects invalid %s timestamps", async (field, value) => {
    fetchMock.mockResolvedValueOnce(Response.json({ order: { ...detail, [field]: value } }));
    await expect(adminOrderClient.get(memberReference)).rejects.toThrow(AdminOrderClientError);
  });

  it.each([
    ["total", -1],
    ["subtotal", 1.5],
    ["shippingFee", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects invalid %s money", async (field, value) => {
    fetchMock.mockResolvedValueOnce(Response.json({ order: { ...detail, [field]: value } }));
    await expect(adminOrderClient.get(memberReference)).rejects.toThrow(AdminOrderClientError);
  });

  it.each([
    { unitPrice: -1 },
    { lineTotal: 1.5 },
    { basePrice: Number.MAX_SAFE_INTEGER + 1 },
    { priceAdjustment: 1.5 },
    { quantity: 0 },
  ])("rejects malformed line numbers: %j", async (override) => {
    fetchMock.mockResolvedValueOnce(Response.json({
      order: { ...detail, lines: [{ ...detail.lines[0], ...override }] },
    }));
    await expect(adminOrderClient.get(memberReference)).rejects.toThrow(AdminOrderClientError);
  });

  it.each(["paid", "refunded", "", null])("rejects unknown order status %s", async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json({ orders: [{ ...listItem, status }] }));
    await expect(adminOrderClient.list()).rejects.toThrow(AdminOrderClientError);
  });

  it.each([
    ["customerName", 3],
    ["isTestOrder", "true"],
    ["paymentMethod", "cash"],
    ["shippingAddress", "private address"],
    ["lines", {}],
  ])("rejects a malformed %s primitive", async (field, value) => {
    fetchMock.mockResolvedValueOnce(Response.json({ order: { ...detail, [field]: value } }));
    await expect(adminOrderClient.get(memberReference)).rejects.toThrow(AdminOrderClientError);
  });

  it("rejects a detail whose returned reference differs from the requested reference", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      order: { ...detail, orderNumber: "VL-20260907-OTHER1" },
    }));

    await expect(adminOrderClient.get(memberReference)).rejects.toThrow(AdminOrderClientError);
  });

  it("rejects an update response whose reference differs from the updated reference", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      order: { ...detail, ownerId: "other-member", status: "shipped" },
    }));

    await expect(adminOrderClient.update(memberReference, {
      status: "shipped",
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234567890",
    })).rejects.toThrow(AdminOrderClientError);
  });

  it.each([
    { status: "preparing" },
    { shippingCarrier: "한진택배" },
    { trackingNumber: "wrong-number" },
  ])("rejects an update response whose operations differ: %j", async (override) => {
    fetchMock.mockResolvedValueOnce(Response.json({
      order: {
        ...detail,
        status: "shipped",
        shippingCarrier: "CJ대한통운",
        trackingNumber: "1234567890",
        ...override,
      },
    }));

    await expect(adminOrderClient.update(memberReference, {
      status: "shipped",
      shippingCarrier: "CJ대한통운",
      trackingNumber: "1234567890",
    })).rejects.toThrow(AdminOrderClientError);
  });
});
