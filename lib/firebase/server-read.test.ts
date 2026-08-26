import { describe, expect, it, vi } from "vitest";

import { createServerReadRepository, decodeFirestoreValue } from "./server-read";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const productDocument = (id: string, salesRank?: number) => ({
  name: `projects/demo-project/databases/(default)/documents/products/${id}`,
  fields: {
    name: { stringValue: id === "rank-1" ? "첫 번째 상품" : "두 번째 상품" },
    slug: { stringValue: id },
    category: { stringValue: "건강" },
    concerns: { arrayValue: { values: [{ stringValue: "활력" }] } },
    price: { integerValue: "32000" },
    originalPrice: { nullValue: null },
    thumbnailUrl: { stringValue: "" },
    images: { arrayValue: {} },
    description: { stringValue: "설명" },
    benefits: { arrayValue: { values: [{ stringValue: "활력" }] } },
    ingredients: {
      arrayValue: {
        values: [{
          mapValue: {
            fields: {
              name: { stringValue: "비타민B" },
              amount: { stringValue: "10 mg" },
              dailyValue: { stringValue: "100%" },
            },
          },
        }],
      },
    },
    dosage: { stringValue: "1일 1회" },
    origin: { stringValue: "대한민국" },
    certifications: { arrayValue: {} },
    cautions: { arrayValue: {} },
    stock: { integerValue: "5" },
    isBest: { booleanValue: true },
    isNew: { booleanValue: false },
    ...(salesRank === undefined ? {} : { salesRank: { integerValue: String(salesRank) } }),
    ratingAverage: { doubleValue: 4.7 },
    reviewCount: { integerValue: "12" },
    createdAt: { timestampValue: "2026-08-10T00:00:00.000Z" },
    updatedAt: { timestampValue: "2026-08-11T00:00:00.000Z" },
  },
});

describe("Firestore REST value decoding", () => {
  it("decodes every value shape used by products and reviews, including nested maps and timestamps", () => {
    expect(decodeFirestoreValue({
      mapValue: {
        fields: {
          empty: { nullValue: null },
          enabled: { booleanValue: true },
          count: { integerValue: "7" },
          rating: { doubleValue: 4.5 },
          label: { stringValue: "활력" },
          createdAt: { timestampValue: "2026-08-10T01:02:03.000Z" },
          values: { arrayValue: { values: [{ stringValue: "A" }, { integerValue: "2" }] } },
          location: { geoPointValue: { latitude: 37.5, longitude: 127 } },
          bytes: { bytesValue: "AQI=" },
          reference: { referenceValue: "projects/demo/databases/(default)/documents/products/p1" },
        },
      },
    })).toEqual({
      empty: null,
      enabled: true,
      count: 7,
      rating: 4.5,
      label: "활력",
      createdAt: new Date("2026-08-10T01:02:03.000Z"),
      values: ["A", 2],
      location: { latitude: 37.5, longitude: 127 },
      bytes: "AQI=",
      reference: "projects/demo/databases/(default)/documents/products/p1",
    });
  });
});

describe("Worker-safe Firestore server reads", () => {
  it("loads default-name-ordered pages, keeps unranked products, and sorts ranks locally", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        documents: [productDocument("a-unranked"), productDocument("rank-2", 2)],
        nextPageToken: "next/page",
      }))
      .mockResolvedValueOnce(jsonResponse({ documents: [productDocument("rank-1", 1)] }));
    const repository = createServerReadRepository({
      projectId: "demo-project",
      apiKey: "public-api-key",
      fetch: fetchMock,
    });

    const products = await repository.getProducts();

    expect(products.map((product) => product.id)).toEqual(["rank-1", "rank-2", "a-unranked"]);
    expect(products[0]).toMatchObject({
      price: 32_000,
      concerns: ["활력"],
      ingredients: [{ name: "비타민B", amount: "10 mg", dailyValue: "100%" }],
      isBest: true,
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
    });
    expect(products[2].salesRank).toBeNull();

    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(firstUrl.pathname).toBe("/v1/projects/demo-project/databases/(default)/documents/products");
    expect(firstUrl.searchParams.get("pageSize")).toBe("100");
    expect(firstUrl.searchParams.get("orderBy")).toBeNull();
    expect(firstUrl.searchParams.get("key")).toBe("public-api-key");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: "force-cache",
      next: { revalidate: 60, tags: ["products"] },
    });

    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(secondUrl.searchParams.get("pageToken")).toBe("next/page");
  });

  it("preserves an empty collection without inventing fallback products", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const repository = createServerReadRepository({ projectId: "demo-project", fetch: fetchMock });

    await expect(repository.getProducts()).resolves.toEqual([]);
  });

  it("returns null only for a missing product and surfaces other HTTP failures", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "missing" } }, 404))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "unavailable" } }, 503));
    const repository = createServerReadRepository({ projectId: "demo-project", fetch: fetchMock });

    await expect(repository.getProduct("missing/product")).resolves.toBeNull();
    await expect(repository.getProduct("offline")).rejects.toThrow("Firestore REST request failed (503)");
    expect(String(fetchMock.mock.calls[0][0])).toContain("products/missing%2Fproduct");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: "force-cache",
      next: { revalidate: 60, tags: ["products", "product:missing/product"] },
    });
  });

  it("queries only approved reviews for the requested product and decodes the response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([
      {
        document: {
          name: "projects/demo-project/databases/(default)/documents/reviews/review-1",
          fields: {
            productId: { stringValue: "rank-1" },
            rating: { integerValue: "5" },
            text: { stringValue: "좋아요" },
            authorAlias: { stringValue: "건강한 구매자" },
            approved: { booleanValue: true },
            createdAt: { timestampValue: "2026-08-10T09:00:00.000Z" },
          },
        },
      },
      { readTime: "2026-08-10T09:01:00.000Z" },
    ]));
    const repository = createServerReadRepository({ projectId: "demo-project", fetch: fetchMock });

    await expect(repository.getApprovedReviews("rank-1")).resolves.toEqual([{
      id: "review-1",
      productId: "rank-1",
      rating: 5,
      text: "좋아요",
      authorAlias: "건강한 구매자",
      approved: true,
      createdAt: new Date("2026-08-10T09:00:00.000Z"),
    }]);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toBe(
      "https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents:runQuery",
    );
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.cache).toBe("no-store");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      structuredQuery: {
        from: [{ collectionId: "reviews" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "productId" },
                  op: "EQUAL",
                  value: { stringValue: "rank-1" },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "approved" },
                  op: "EQUAL",
                  value: { booleanValue: true },
                },
              },
            ],
          },
        },
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
      },
    });
  });

  it("fails before making a request when the public Firebase project ID is missing", () => {
    expect(() => createServerReadRepository({ projectId: "" })).toThrow(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    );
  });
});
