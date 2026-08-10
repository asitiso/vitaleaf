import { normalizeProduct } from "../products/normalize";
import type { Product, Review } from "../products/types";

type FirestoreValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number | string;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude?: number; longitude?: number };
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type ServerReadRepositoryOptions = {
  projectId: string | undefined;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
};

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const decodeFields = (fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(fields ?? {}).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );

export function decodeFirestoreValue(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) {
    const timestamp = new Date(value.timestampValue ?? "");
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }
  if ("stringValue" in value) return value.stringValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) {
    return {
      latitude: value.geoPointValue?.latitude ?? 0,
      longitude: value.geoPointValue?.longitude ?? 0,
    };
  }
  if ("arrayValue" in value) {
    return (value.arrayValue?.values ?? []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) return decodeFields(value.mapValue?.fields);
  return null;
}

const documentId = (document: FirestoreDocument): string => {
  const encodedId = document.name?.split("/").at(-1);
  if (!encodedId) throw new Error("Firestore REST response is missing a document name.");
  return decodeURIComponent(encodedId);
};

const normalizeReview = (document: FirestoreDocument): Review => {
  const review = asObject(decodeFields(document.fields));
  const rating = typeof review.rating === "number" && Number.isFinite(review.rating)
    ? Math.min(5, Math.max(0, review.rating))
    : 0;

  return {
    id: documentId(document),
    productId: typeof review.productId === "string" ? review.productId : "",
    rating,
    text: typeof review.text === "string" ? review.text : "",
    authorAlias: typeof review.authorAlias === "string" ? review.authorAlias : "",
    approved: review.approved === true,
    createdAt: review.createdAt instanceof Date ? review.createdAt : null,
  };
};

const bySalesRank = (left: Product, right: Product): number =>
  (left.salesRank ?? Number.POSITIVE_INFINITY) -
  (right.salesRank ?? Number.POSITIVE_INFINITY);

export function createServerReadRepository({
  projectId,
  apiKey,
  fetch: fetchImplementation = globalThis.fetch,
}: ServerReadRepositoryOptions) {
  const normalizedProjectId = projectId?.trim();
  if (!normalizedProjectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is required for server Firestore reads.");
  }

  const documentsUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(normalizedProjectId)}` +
    "/databases/(default)/documents";

  const withApiKey = (url: URL): URL => {
    if (apiKey) url.searchParams.set("key", apiKey);
    return url;
  };

  const fetchJson = async (url: URL, init?: RequestInit): Promise<unknown> => {
    const response = await fetchImplementation(url.toString(), {
      cache: "no-store",
      ...init,
    });
    if (!response.ok) {
      throw new Error(`Firestore REST request failed (${response.status}).`);
    }
    return response.json();
  };

  return {
    async getProducts(): Promise<Product[]> {
      const documents: FirestoreDocument[] = [];
      let pageToken = "";
      const seenPageTokens = new Set<string>();

      do {
        const url = withApiKey(new URL(`${documentsUrl}/products`));
        url.searchParams.set("pageSize", "100");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const body = asObject(await fetchJson(url));
        if (Array.isArray(body.documents)) {
          documents.push(...body.documents.map((document) => document as FirestoreDocument));
        }

        const nextPageToken = typeof body.nextPageToken === "string" ? body.nextPageToken : "";
        if (nextPageToken && seenPageTokens.has(nextPageToken)) {
          throw new Error("Firestore REST pagination repeated a page token.");
        }
        if (nextPageToken) seenPageTokens.add(nextPageToken);
        pageToken = nextPageToken;
      } while (pageToken);

      return documents
        .map((document) => normalizeProduct(documentId(document), decodeFields(document.fields)))
        .sort(bySalesRank);
    },

    async getProduct(id: string): Promise<Product | null> {
      const url = withApiKey(new URL(`${documentsUrl}/products/${encodeURIComponent(id)}`));
      const response = await fetchImplementation(url.toString(), { cache: "no-store" });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`Firestore REST request failed (${response.status}).`);
      }

      const document = await response.json() as FirestoreDocument;
      return normalizeProduct(documentId(document), decodeFields(document.fields));
    },

    async getApprovedReviews(productId: string): Promise<Review[]> {
      const url = withApiKey(new URL(`${documentsUrl}:runQuery`));
      const body = await fetchJson(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
                      value: { stringValue: productId },
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
        }),
      });

      return Array.isArray(body)
        ? body.flatMap((entry) => {
            const document = asObject(entry).document;
            return document ? [normalizeReview(document as FirestoreDocument)] : [];
          })
        : [];
    },
  };
}

const createConfiguredRepository = () => createServerReadRepository({
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
});

export const getServerProducts = (): Promise<Product[]> =>
  createConfiguredRepository().getProducts();

export const getServerProduct = (id: string): Promise<Product | null> =>
  createConfiguredRepository().getProduct(id);

export const getServerApprovedReviews = (productId: string): Promise<Review[]> =>
  createConfiguredRepository().getApprovedReviews(productId);
