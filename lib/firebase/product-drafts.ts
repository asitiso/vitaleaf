import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { toPublishedProductInput, validatePublishableDraft, type DraftValidationError } from "../products/draft";
import { normalizeMedia } from "../products/normalize";
import type { DraftStatus, Ingredient, Product, ProductDraft, ProductInput } from "../products/types";
import { auth, db } from "./client";
import type { FirestoreDocument, Unsubscribe } from "./products";

type ProductDraftData = Omit<ProductDraft, "id" | "createdAt" | "updatedAt">;

export type ProductDraftWrite = ProductDraftData & {
  createdAt?: unknown;
  updatedAt: unknown;
  createdBy?: string;
  updatedBy: string;
};

export type ProductDraftRepositoryAdapter = {
  createId(): string;
  save(id: string, value: ProductDraftWrite): Promise<void>;
  get(id: string): Promise<FirestoreDocument | null>;
  subscribe(
    onData: (documents: FirestoreDocument[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  commitPublish(id: string, product: ProductInput): Promise<void>;
  commitUnpublish(id: string, draft: ProductDraftWrite): Promise<void>;
  delete(id: string): Promise<void>;
  timestamp(): unknown;
  ownerId?(): string | null;
};

export class ProductDraftValidationError extends Error {
  readonly errors: DraftValidationError[];

  constructor(errors: DraftValidationError[]) {
    super("Product draft is not ready to publish.");
    this.name = "ProductDraftValidationError";
    this.errors = errors;
  }
}

export class ProductDraftConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductDraftConflictError";
  }
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);

const asString = (value: unknown): string => typeof value === "string" ? value : "";

const asStringArray = (value: unknown): string[] => (
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
);

const asNonNegativeNumber = (value: unknown): number => (
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
);

const asNullableNonNegativeNumber = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
);

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value !== "object" || value === null || !("toDate" in value)) return null;

  const toDate = (value as { toDate?: unknown }).toDate;
  const date = typeof toDate === "function" ? toDate.call(value) : null;
  return date instanceof Date ? date : null;
};

const asIngredients = (value: unknown): Ingredient[] => (
  Array.isArray(value)
    ? value.map((item) => {
        const ingredient = asRecord(item);
        return {
          name: asString(ingredient.name),
          amount: asString(ingredient.amount),
          dailyValue: asString(ingredient.dailyValue),
        };
      })
    : []
);

const asDraftStatus = (value: unknown): DraftStatus => (
  value === "publishing" || value === "published-copy" ? value : "draft"
);

const asCurrentStep = (value: unknown): ProductDraft["currentStep"] => (
  value === 2 || value === 3 || value === 4 ? value : 1
);

const normalizeDraft = (id: string, value: unknown): ProductDraft => {
  const draft = asRecord(value);
  const media = normalizeMedia(draft.media, draft.thumbnailUrl, draft.images);

  return {
    id,
    name: asString(draft.name),
    slug: asString(draft.slug),
    category: asString(draft.category),
    concerns: asStringArray(draft.concerns),
    price: asNonNegativeNumber(draft.price),
    originalPrice: asNullableNonNegativeNumber(draft.originalPrice),
    thumbnailUrl: media[0]?.url ?? asString(draft.thumbnailUrl),
    images: media.length > 0 ? media.map((item) => item.url) : asStringArray(draft.images),
    media,
    description: asString(draft.description),
    benefits: asStringArray(draft.benefits),
    ingredients: asIngredients(draft.ingredients),
    dosage: asString(draft.dosage),
    origin: asString(draft.origin),
    certifications: asStringArray(draft.certifications),
    cautions: asStringArray(draft.cautions),
    stock: asNonNegativeNumber(draft.stock),
    isBest: draft.isBest === true,
    isNew: draft.isNew === true,
    salesRank: asNullableNonNegativeNumber(draft.salesRank),
    ratingAverage: Math.min(5, asNonNegativeNumber(draft.ratingAverage)),
    reviewCount: asNonNegativeNumber(draft.reviewCount),
    status: asDraftStatus(draft.status),
    sourceProductId: typeof draft.sourceProductId === "string" ? draft.sourceProductId : null,
    currentStep: asCurrentStep(draft.currentStep),
    createdAt: asDate(draft.createdAt),
    updatedAt: asDate(draft.updatedAt),
  };
};

const cloneProductData = (product: Product | ProductDraft): ProductDraftData => ({
  name: product.name,
  slug: product.slug,
  category: product.category,
  concerns: [...product.concerns],
  price: product.price,
  originalPrice: product.originalPrice,
  thumbnailUrl: product.thumbnailUrl,
  images: [...product.images],
  media: product.media.map((item) => ({ ...item })),
  description: product.description,
  benefits: [...product.benefits],
  ingredients: product.ingredients.map((ingredient) => ({ ...ingredient })),
  dosage: product.dosage,
  origin: product.origin,
  certifications: [...product.certifications],
  cautions: [...product.cautions],
  stock: product.stock,
  isBest: product.isBest,
  isNew: product.isNew,
  salesRank: product.salesRank,
  ratingAverage: product.ratingAverage,
  reviewCount: product.reviewCount,
  status: "status" in product ? product.status : "draft",
  sourceProductId: "sourceProductId" in product ? product.sourceProductId : product.id,
  currentStep: "currentStep" in product ? product.currentStep : 1,
});

const requireOwnerId = (adapter: ProductDraftRepositoryAdapter, explicitOwnerId?: string): string => {
  const ownerId = explicitOwnerId ?? adapter.ownerId?.() ?? "";
  if (!ownerId.trim()) throw new Error("An authenticated admin is required to write product drafts.");
  return ownerId;
};

const toDraftWrite = (
  draft: ProductDraftData,
  ownerId: string,
  timestamp: unknown,
  includeCreationMetadata: boolean,
): ProductDraftWrite => ({
  ...draft,
  ...(includeCreationMetadata ? { createdAt: timestamp, createdBy: ownerId } : {}),
  updatedAt: timestamp,
  updatedBy: ownerId,
});

const toDraftFromProduct = (
  product: Product,
  overrides: Pick<ProductDraft, "id" | "name" | "status" | "sourceProductId" | "stock" | "salesRank" | "ratingAverage" | "reviewCount">,
): ProductDraft => ({
  ...cloneProductData(product),
  ...overrides,
  currentStep: 1,
  createdAt: null,
  updatedAt: null,
});

export const createProductDraftRepository = (adapter: ProductDraftRepositoryAdapter) => {
  const knownDraftIds = new Set<string>();
  const pendingSaves = new Map<string, Promise<void>>();
  const pendingPublishes = new Map<string, Promise<void>>();
  const pendingDiscards = new Map<string, Promise<void>>();
  const pendingUnpublishes = new Map<string, Promise<ProductDraft>>();

  const track = <T>(map: Map<string, Promise<T>>, id: string, operation: Promise<T>): Promise<T> => {
    map.set(id, operation);
    void operation.finally(() => {
      if (map.get(id) === operation) map.delete(id);
    }).catch(() => undefined);
    return operation;
  };

  const saveDraft = (draft: ProductDraft, explicitOwnerId?: string): Promise<void> => {
    if (pendingPublishes.has(draft.id)) {
      return Promise.reject(new Error("This product draft is being published."));
    }
    if (pendingDiscards.has(draft.id)) {
      return Promise.reject(new Error("This product draft is being discarded."));
    }

    const ownerId = requireOwnerId(adapter, explicitOwnerId);
    const data = cloneProductData(draft);
    const callerHasCreationMetadata = draft.createdAt !== null;
    const previousSave = pendingSaves.get(draft.id);
    const operation = (previousSave ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const write = toDraftWrite(
          data,
          ownerId,
          adapter.timestamp(),
          !callerHasCreationMetadata && !knownDraftIds.has(draft.id),
        );
        await adapter.save(draft.id, write);
        knownDraftIds.add(draft.id);
      });

    return track(pendingSaves, draft.id, operation);
  };

  const repository = {
    createDraftId(): string {
      return adapter.createId();
    },

    saveDraft,

    async getDraft(id: string): Promise<ProductDraft | null> {
      const document = await adapter.get(id);
      if (!document) return null;
      knownDraftIds.add(document.id);
      return normalizeDraft(document.id, document.data());
    },

    subscribeDrafts(
      onData: (drafts: ProductDraft[]) => void,
      onError: (error: Error) => void,
    ): Unsubscribe {
      return adapter.subscribe(
        (documents) => onData(documents.map((document) => {
          knownDraftIds.add(document.id);
          return normalizeDraft(document.id, document.data());
        })),
        onError,
      );
    },

    publishDraft(draft: ProductDraft): Promise<void> {
      const errors = validatePublishableDraft(draft);
      if (errors.length > 0) return Promise.reject(new ProductDraftValidationError(errors));
      if (pendingDiscards.has(draft.id)) {
        return Promise.reject(new Error("This product draft is being discarded."));
      }

      const existing = pendingPublishes.get(draft.id);
      if (existing) return existing;

      const pendingSave = pendingSaves.get(draft.id);
      const product = toPublishedProductInput(draft);
      const operation = (async () => {
        if (pendingSave) await pendingSave;
        await adapter.commitPublish(draft.id, product);
        knownDraftIds.delete(draft.id);
      })();

      return track(pendingPublishes, draft.id, operation);
    },

    unpublishProduct(product: Product, explicitOwnerId?: string): Promise<ProductDraft> {
      const existing = pendingUnpublishes.get(product.id);
      if (existing) return existing;
      if (pendingPublishes.has(product.id)) {
        return Promise.reject(new Error("This product is being published."));
      }

      const ownerId = requireOwnerId(adapter, explicitOwnerId);
      const draft = toDraftFromProduct(product, {
        id: product.id,
        name: product.name,
        status: "draft",
        sourceProductId: product.id,
        stock: product.stock,
        salesRank: product.salesRank,
        ratingAverage: product.ratingAverage,
        reviewCount: product.reviewCount,
      });
      const write = toDraftWrite(cloneProductData(draft), ownerId, adapter.timestamp(), true);
      const operation = adapter.commitUnpublish(product.id, write).then(() => {
        knownDraftIds.add(product.id);
        return draft;
      });
      return track(pendingUnpublishes, product.id, operation);
    },

    discardDraft(id: string): Promise<void> {
      const existing = pendingDiscards.get(id);
      if (existing) return existing;
      if (pendingPublishes.has(id)) {
        return Promise.reject(new Error("This product draft is being published."));
      }

      const pendingSave = pendingSaves.get(id);
      const operation = (async () => {
        if (pendingSave) await pendingSave;
        await adapter.delete(id);
        knownDraftIds.delete(id);
      })();
      return track(pendingDiscards, id, operation);
    },

    async duplicateProductToDraft(product: Product, explicitOwnerId?: string): Promise<ProductDraft> {
      const draft = toDraftFromProduct(product, {
        id: adapter.createId(),
        name: `${product.name} (복사본)`,
        status: "published-copy",
        sourceProductId: product.id,
        stock: 0,
        salesRank: null,
        ratingAverage: 0,
        reviewCount: 0,
      });
      await saveDraft(draft, explicitOwnerId);
      return draft;
    },
  };

  return repository;
};

const requireFirebaseOwnerId = (): string => {
  const uid = auth.currentUser?.uid ?? "";
  if (!uid) throw new Error("An authenticated admin is required to write product drafts.");
  return uid;
};

const firebaseProductDraftAdapter: ProductDraftRepositoryAdapter = {
  createId() {
    return doc(collection(db, "productDrafts")).id;
  },
  async save(id, value) {
    const isCreation = Object.prototype.hasOwnProperty.call(value, "createdAt");
    await runTransaction(db, async (transaction) => {
      const productReference = doc(db, "products", id);
      const draftReference = doc(db, "productDrafts", id);
      const productSnapshot = await transaction.get(productReference);
      const draftSnapshot = await transaction.get(draftReference);

      if (productSnapshot.exists()) {
        throw new ProductDraftConflictError("This product was already published. Refresh the draft list.");
      }
      if (!isCreation && !draftSnapshot.exists()) {
        throw new ProductDraftConflictError("This product draft no longer exists. Refresh the draft list.");
      }

      transaction.set(draftReference, value, { merge: true });
    });
  },
  async get(id) {
    const snapshot = await getDoc(doc(db, "productDrafts", id));
    return snapshot.exists() ? snapshot : null;
  },
  subscribe(onData, onError) {
    return onSnapshot(
      collection(db, "productDrafts"),
      (snapshot) => onData(snapshot.docs),
      onError,
    );
  },
  async commitPublish(id, product) {
    const ownerId = requireFirebaseOwnerId();
    const timestamp = serverTimestamp();
    const batch = writeBatch(db);
    batch.set(doc(db, "products", id), {
      ...product,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: ownerId,
      updatedBy: ownerId,
    });
    batch.delete(doc(db, "productDrafts", id));
    await batch.commit();
  },
  async commitUnpublish(id, draft) {
    const batch = writeBatch(db);
    batch.set(doc(db, "productDrafts", id), draft);
    batch.delete(doc(db, "products", id));
    await batch.commit();
  },
  async delete(id) {
    await deleteDoc(doc(db, "productDrafts", id));
  },
  timestamp: serverTimestamp,
  ownerId: () => auth.currentUser?.uid ?? null,
};

const productDraftRepository = createProductDraftRepository(firebaseProductDraftAdapter);

export const createDraftId = productDraftRepository.createDraftId;
export const saveDraft = productDraftRepository.saveDraft;
export const getDraft = productDraftRepository.getDraft;
export const subscribeDrafts = productDraftRepository.subscribeDrafts;
export const publishDraft = productDraftRepository.publishDraft;
export const unpublishProduct = productDraftRepository.unpublishProduct;
export const discardDraft = productDraftRepository.discardDraft;
export const duplicateProductToDraft = productDraftRepository.duplicateProductToDraft;
