import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";

import { toPublishedProductInput, validatePublishableDraft, type DraftValidationError } from "../products/draft";
import { normalizeMedia, normalizeProduct } from "../products/normalize";
import { normalizePurchaseOptions } from "../products/purchase-options";
import type {
  DraftMode,
  DraftStatus,
  Ingredient,
  Product,
  ProductDraft,
  ProductInput,
  ProductMedia,
} from "../products/types";
import { auth, db } from "./client";
import type { FirestoreDocument, Unsubscribe } from "./products";
import { canonicalAgeTargets, canonicalTaxonomyValue, canonicalTaxonomyValues, HEALTH_CONCERNS, PRODUCT_CATEGORIES } from "../catalog/taxonomy";

type DraftContent = ProductInput & {
  media: ProductMedia[];
  status: DraftStatus;
  currentStep: ProductDraft["currentStep"];
};

export type ProductDraftWrite = DraftContent & {
  mode: DraftMode;
  sessionId: string;
  revision: number;
  sourceProductId: string | null;
  sourceProductRevision: number | null;
  sourceCreatedAt: unknown;
  sourceCreatedBy: string | null;
  createdAt: unknown;
  updatedAt: unknown;
  createdBy: string;
  updatedBy: string;
};

export type PublishedProductWrite = ProductInput & {
  media: ProductMedia[];
  revision: number;
  createdAt: unknown;
  updatedAt: unknown;
  createdBy: string | null;
  updatedBy: string;
};

export type ProductDraftTransaction = {
  getDraft(id: string): Promise<FirestoreDocument | null>;
  getProduct(id: string): Promise<FirestoreDocument | null>;
  setDraft(id: string, value: ProductDraftWrite): void;
  setProduct(id: string, value: PublishedProductWrite): void;
  deleteDraft(id: string): void;
  deleteProduct(id: string): void;
  timestamp(): unknown;
  ownerId(): string | null;
};

export type ProductDraftRepositoryAdapter = {
  createId(): string;
  createSessionId(): string;
  get(id: string): Promise<FirestoreDocument | null>;
  subscribe(
    onData: (documents: FirestoreDocument[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  runTransaction<T>(operation: (transaction: ProductDraftTransaction) => Promise<T>): Promise<T>;
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
type DraftIdentity = Pick<ProductDraft, "id" | "sessionId" | "revision">;

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

const asNonNegativeInteger = (value: unknown): number => Math.floor(asNonNegativeNumber(value));

const asNullableNonNegativeNumber = (value: unknown): number | null => (
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
);

const asNullableNonNegativeInteger = (value: unknown): number | null => {
  const number = asNullableNonNegativeNumber(value);
  return number === null ? null : Math.floor(number);
};

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value !== "object" || value === null || !("toDate" in value)) return null;
  const toDate = (value as { toDate?: unknown }).toDate;
  const date = typeof toDate === "function" ? toDate.call(value) : null;
  return date instanceof Date ? date : null;
};

const asIngredients = (value: unknown): Ingredient[] => (
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
        const ingredient = asRecord(item);
        const name = asString(ingredient.name).trim();
        if (!name) return [];
        return [{
          name,
          amount: asString(ingredient.amount),
          dailyValue: asString(ingredient.dailyValue),
        }];
      })
    : []
);

const asDraftStatus = (value: unknown): DraftStatus => (
  value === "publishing" || value === "published-copy" ? value : "draft"
);

const asDraftMode = (value: unknown): DraftMode => (
  value === "edit" || value === "restore" ? value : "create"
);

const asCurrentStep = (value: unknown): ProductDraft["currentStep"] => (
  value === 2 || value === 3 || value === 4 ? value : 1
);

const normalizeDraft = (id: string, value: unknown): ProductDraft => {
  const draft = asRecord(value);
  const media = normalizeMedia(draft.media, draft.thumbnailUrl, draft.images);
  const price = asNonNegativeNumber(draft.price);
  const stock = asNonNegativeNumber(draft.stock);

  return {
    id,
    name: asString(draft.name),
    slug: asString(draft.slug),
    category: canonicalTaxonomyValue(PRODUCT_CATEGORIES, asString(draft.category)),
    concerns: canonicalTaxonomyValues(HEALTH_CONCERNS, asStringArray(draft.concerns)),
    ageTargets: canonicalAgeTargets(asStringArray(draft.ageTargets)),
    price,
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
    stock,
    purchaseOptions: normalizePurchaseOptions(draft.purchaseOptions, price, stock),
    isBest: draft.isBest === true,
    isNew: draft.isNew === true,
    salesRank: asNullableNonNegativeNumber(draft.salesRank),
    ratingAverage: Math.min(5, asNonNegativeNumber(draft.ratingAverage)),
    reviewCount: asNonNegativeNumber(draft.reviewCount),
    status: asDraftStatus(draft.status),
    mode: asDraftMode(draft.mode),
    sessionId: asString(draft.sessionId).trim() || null,
    revision: asNonNegativeInteger(draft.revision),
    sourceProductId: asString(draft.sourceProductId).trim() || null,
    sourceProductRevision: asNullableNonNegativeInteger(draft.sourceProductRevision),
    sourceCreatedAt: asDate(draft.sourceCreatedAt),
    sourceCreatedBy: asString(draft.sourceCreatedBy).trim() || null,
    currentStep: asCurrentStep(draft.currentStep),
    createdAt: asDate(draft.createdAt),
    updatedAt: asDate(draft.updatedAt),
    createdBy: asString(draft.createdBy).trim() || null,
    updatedBy: asString(draft.updatedBy).trim() || null,
  };
};

const draftContentFrom = (source: Product | ProductDraft): DraftContent => ({
  name: source.name,
  slug: source.slug,
  category: canonicalTaxonomyValue(PRODUCT_CATEGORIES, source.category),
  concerns: canonicalTaxonomyValues(HEALTH_CONCERNS, source.concerns),
  ageTargets: canonicalAgeTargets(source.ageTargets ?? []),
  price: source.price,
  originalPrice: source.originalPrice,
  thumbnailUrl: source.thumbnailUrl,
  images: [...source.images],
  media: source.media.map((item) => ({ ...item })),
  description: source.description,
  benefits: [...source.benefits],
  ingredients: source.ingredients.map((ingredient) => ({ ...ingredient })),
  dosage: source.dosage,
  origin: source.origin,
  certifications: [...source.certifications],
  cautions: [...source.cautions],
  stock: source.stock,
  ...(source.purchaseOptions === undefined
    ? {}
    : { purchaseOptions: source.purchaseOptions.map((option) => ({ ...option })) }),
  isBest: source.isBest,
  isNew: source.isNew,
  salesRank: source.salesRank,
  ratingAverage: source.ratingAverage,
  reviewCount: source.reviewCount,
  status: "status" in source ? source.status : "draft",
  currentStep: "currentStep" in source ? source.currentStep : 1,
});

const productDraftFromProduct = (
  product: Product,
  lifecycle: Pick<
    ProductDraft,
    "id" | "status" | "mode" | "sessionId" | "revision" | "sourceProductId"
      | "sourceProductRevision" | "sourceCreatedAt" | "sourceCreatedBy"
  >,
): ProductDraft => ({
  ...draftContentFrom(product),
  ...lifecycle,
  currentStep: 1,
  createdAt: null,
  updatedAt: null,
  createdBy: null,
  updatedBy: null,
});

const requireOwnerId = (transaction: ProductDraftTransaction): string => {
  const ownerId = transaction.ownerId()?.trim() ?? "";
  if (!ownerId) throw new Error("An authenticated admin is required to write product drafts.");
  return ownerId;
};

const conflict = (message: string): never => {
  throw new ProductDraftConflictError(message);
};

const requireIdentity = (document: FirestoreDocument | null, identity: DraftIdentity): ProductDraft => {
  if (!document) return conflict("This product draft no longer exists. Refresh the draft list.");
  const draft = normalizeDraft(document.id, document.data());
  if (!draft.sessionId || draft.sessionId !== identity.sessionId) {
    return conflict("This product draft belongs to a different editing session. Refresh the draft list.");
  }
  if (draft.revision !== identity.revision) {
    return conflict("This product draft changed in another session. Refresh before continuing.");
  }
  return draft;
};

const productRevision = (product: Product, expected: number | null): void => {
  if (expected === null || (product.revision ?? 0) !== expected) {
    conflict("The published product changed in another session. Refresh before continuing.");
  }
};

const writeToDomain = (id: string, write: ProductDraftWrite): ProductDraft => normalizeDraft(id, write);

export const createProductDraftRepository = (adapter: ProductDraftRepositoryAdapter) => {
  const localSessions = new Map<string, {
    sessionId: string;
    revision: number;
    acceptsSessionless: boolean;
  }>();
  const retiredSessions = new Set<string>();
  const retiredSessionlessDrafts = new Set<string>();
  const pendingSaves = new Map<string, Promise<ProductDraft>>();
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

  const sessionKey = (id: string, sessionId: string): string => `${id}:${sessionId}`;

  const resolveLocalIdentity = (draft: ProductDraft): DraftIdentity | null => {
    const localSession = localSessions.get(draft.id);
    if (draft.sessionId === null) {
      if (retiredSessionlessDrafts.has(draft.id)) return null;
      return localSession?.acceptsSessionless
        ? { id: draft.id, sessionId: localSession.sessionId, revision: localSession.revision }
        : { id: draft.id, sessionId: null, revision: draft.revision };
    }
    if (retiredSessions.has(sessionKey(draft.id, draft.sessionId))) return null;
    return localSession?.sessionId === draft.sessionId
      ? { id: draft.id, ...localSession }
      : { id: draft.id, sessionId: draft.sessionId, revision: draft.revision };
  };

  const retireLocalIdentity = (identity: DraftIdentity): void => {
    if (!identity.sessionId) return;
    retiredSessions.add(sessionKey(identity.id, identity.sessionId));
    const localSession = localSessions.get(identity.id);
    if (localSession?.sessionId !== identity.sessionId) return;
    if (localSession.acceptsSessionless) retiredSessionlessDrafts.add(identity.id);
    localSessions.delete(identity.id);
  };

  const retiredIdentityError = (): ProductDraftConflictError => new ProductDraftConflictError(
    "This local draft session already finished. Start a new editing session to continue.",
  );

  const persistDraft = (
    snapshot: ProductDraft,
    identity: { sessionId: string; revision: number },
  ): Promise<ProductDraft> => adapter.runTransaction(async (transaction) => {
    const storedDocument = await transaction.getDraft(snapshot.id);
    const targetProductDocument = await transaction.getProduct(snapshot.id);
    const sourceDocument = !storedDocument
      && snapshot.mode === "create"
      && snapshot.sourceProductId
      && snapshot.sourceProductId !== snapshot.id
      ? await transaction.getProduct(snapshot.sourceProductId)
      : null;
    const ownerId = requireOwnerId(transaction);
    const timestamp = transaction.timestamp();
    const content = draftContentFrom(snapshot);

    if (!storedDocument) {
      if (identity.revision !== 0) conflict("This product draft no longer exists. Refresh the draft list.");
      if (snapshot.mode === "restore") conflict("Only unpublish can create a restore draft.");
      if (snapshot.mode === "create" && targetProductDocument) {
        conflict("A product with this draft id already exists.");
      }
      if (snapshot.mode === "edit" && !targetProductDocument) {
        conflict("The published product no longer exists.");
      }

      let sourceProductId = snapshot.sourceProductId;
      let sourceProductRevision = snapshot.sourceProductRevision;
      let sourceCreatedAt: unknown = snapshot.sourceCreatedAt;
      let sourceCreatedBy = snapshot.sourceCreatedBy;

      if (snapshot.mode === "edit") {
        if (sourceProductId !== snapshot.id || !targetProductDocument) {
          conflict("An edit draft must target its same-id published product.");
        }
        const product = normalizeProduct(snapshot.id, targetProductDocument!.data());
        productRevision(product, sourceProductRevision);
        const productRecord = asRecord(targetProductDocument!.data());
        sourceProductId = snapshot.id;
        sourceProductRevision = product.revision ?? 0;
        sourceCreatedAt = productRecord.createdAt ?? null;
        sourceCreatedBy = asString(productRecord.createdBy).trim() || null;
      } else if (sourceProductId) {
        if (!sourceDocument) conflict("The product being duplicated no longer exists.");
        const sourceProduct = normalizeProduct(sourceProductId, sourceDocument!.data());
        productRevision(sourceProduct, sourceProductRevision);
        const sourceRecord = asRecord(sourceDocument!.data());
        sourceProductRevision = sourceProduct.revision ?? 0;
        sourceCreatedAt = sourceRecord.createdAt ?? null;
        sourceCreatedBy = asString(sourceRecord.createdBy).trim() || null;
      }

      const write: ProductDraftWrite = {
        ...content,
        mode: snapshot.mode,
        sessionId: identity.sessionId,
        revision: 1,
        sourceProductId,
        sourceProductRevision,
        sourceCreatedAt: sourceCreatedAt ?? null,
        sourceCreatedBy,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: ownerId,
        updatedBy: ownerId,
      };
      transaction.setDraft(snapshot.id, write);
      return writeToDomain(snapshot.id, write);
    }

    const stored = requireIdentity(storedDocument, {
      id: snapshot.id,
      sessionId: identity.sessionId,
      revision: identity.revision,
    });
    if (snapshot.mode !== stored.mode) conflict("The draft mode cannot change during an editing session.");
    if (stored.mode === "create" && targetProductDocument) {
      conflict("This draft was already published.");
    }
    if (stored.mode === "edit") {
      if (!targetProductDocument) conflict("The published product no longer exists.");
      productRevision(normalizeProduct(snapshot.id, targetProductDocument!.data()), stored.sourceProductRevision);
    }
    if (stored.mode === "restore" && targetProductDocument) {
      conflict("This restore draft was already published.");
    }

    const storedRecord = asRecord(storedDocument.data());
    const write: ProductDraftWrite = {
      ...content,
      mode: stored.mode,
      sessionId: stored.sessionId!,
      revision: stored.revision + 1,
      sourceProductId: stored.sourceProductId,
      sourceProductRevision: stored.sourceProductRevision,
      sourceCreatedAt: storedRecord.sourceCreatedAt ?? null,
      sourceCreatedBy: stored.sourceCreatedBy,
      createdAt: storedRecord.createdAt ?? timestamp,
      updatedAt: timestamp,
      createdBy: stored.createdBy ?? ownerId,
      updatedBy: ownerId,
    };
    transaction.setDraft(snapshot.id, write);
    return writeToDomain(snapshot.id, write);
  });

  const saveDraft = (draft: ProductDraft): Promise<ProductDraft> => {
    if (pendingPublishes.has(draft.id)) {
      return Promise.reject(new Error("This product draft is being published."));
    }
    if (pendingDiscards.has(draft.id)) {
      return Promise.reject(new Error("This product draft is being discarded."));
    }

    const snapshot = { ...draft, ...draftContentFrom(draft) };
    const resolvedIdentity = resolveLocalIdentity(draft);
    if (!resolvedIdentity) return Promise.reject(retiredIdentityError());
    const identity = {
      sessionId: resolvedIdentity.sessionId ?? adapter.createSessionId(),
      revision: resolvedIdentity.revision,
    };
    const previousSave = pendingSaves.get(draft.id);
    const persistence = previousSave
      ? previousSave.then((previous) => persistDraft(snapshot, {
          sessionId: draft.sessionId && draft.sessionId !== previous.sessionId
            ? draft.sessionId
            : previous.sessionId!,
          revision: draft.sessionId && draft.sessionId !== previous.sessionId
            ? draft.revision
            : previous.revision,
        }))
      : persistDraft(snapshot, identity);
    const operation = persistence.then((saved) => {
      const previousLocal = localSessions.get(saved.id);
      localSessions.set(saved.id, {
        sessionId: saved.sessionId!,
        revision: saved.revision,
        acceptsSessionless: previousLocal?.sessionId === saved.sessionId
          ? previousLocal.acceptsSessionless
          : draft.sessionId === null && !retiredSessionlessDrafts.has(saved.id),
      });
      return saved;
    });

    return track(pendingSaves, draft.id, operation);
  };

  const repository = {
    createDraftId(): string {
      return adapter.createId();
    },

    startDraftSession(draft: ProductDraft): ProductDraft {
      return {
        ...draft,
        sessionId: adapter.createSessionId(),
        revision: 0,
      };
    },

    createProductEditDraft(product: Product): ProductDraft {
      return productDraftFromProduct(product, {
        id: product.id,
        status: "published-copy",
        mode: "edit",
        sessionId: adapter.createSessionId(),
        revision: 0,
        sourceProductId: product.id,
        sourceProductRevision: product.revision ?? 0,
        sourceCreatedAt: product.createdAt,
        sourceCreatedBy: product.createdBy ?? null,
      });
    },

    saveDraft,

    async getDraft(id: string): Promise<ProductDraft | null> {
      const document = await adapter.get(id);
      return document ? normalizeDraft(document.id, document.data()) : null;
    },

    subscribeDrafts(
      onData: (drafts: ProductDraft[]) => void,
      onError: (error: Error) => void,
    ): Unsubscribe {
      return adapter.subscribe(
        (documents) => onData(documents.map((document) => normalizeDraft(document.id, document.data()))),
        onError,
      );
    },

    publishDraft(draft: ProductDraft): Promise<void> {
      if (pendingDiscards.has(draft.id)) {
        return Promise.reject(new Error("This product draft is being discarded."));
      }
      if (pendingUnpublishes.has(draft.id)) {
        return Promise.reject(new Error("This product is being unpublished."));
      }
      const existing = pendingPublishes.get(draft.id);
      if (existing) return existing;

      const pendingSave = pendingSaves.get(draft.id);
      const operation = (async () => {
        const identity = pendingSave ? await pendingSave : resolveLocalIdentity(draft);
        if (!identity) throw retiredIdentityError();
        await adapter.runTransaction(async (transaction) => {
          const draftDocument = await transaction.getDraft(identity.id);
          const productDocument = await transaction.getProduct(identity.id);
          const authoritativeDraft = requireIdentity(draftDocument, identity);
          const validationErrors = validatePublishableDraft(authoritativeDraft);
          if (validationErrors.length > 0) throw new ProductDraftValidationError(validationErrors);

          const ownerId = requireOwnerId(transaction);
          const timestamp = transaction.timestamp();
          const productInput = toPublishedProductInput(authoritativeDraft);
          let revision: number;
          let createdAt: unknown;
          let createdBy: string | null;

          if (authoritativeDraft.mode === "create") {
            if (productDocument) conflict("This draft was already published.");
            revision = 1;
            createdAt = timestamp;
            createdBy = ownerId;
          } else if (authoritativeDraft.mode === "edit") {
            if (!productDocument) conflict("The published product no longer exists.");
            const product = normalizeProduct(identity.id, productDocument!.data());
            productRevision(product, authoritativeDraft.sourceProductRevision);
            const productRecord = asRecord(productDocument!.data());
            revision = (product.revision ?? 0) + 1;
            createdAt = productRecord.createdAt ?? null;
            createdBy = asString(productRecord.createdBy).trim() || null;
          } else {
            if (productDocument) conflict("This restore draft was already published.");
            const draftRecord = asRecord(draftDocument!.data());
            revision = (authoritativeDraft.sourceProductRevision ?? 0) + 1;
            createdAt = draftRecord.sourceCreatedAt ?? null;
            createdBy = authoritativeDraft.sourceCreatedBy;
          }

          transaction.setProduct(identity.id, {
            ...productInput,
            revision,
            createdAt,
            updatedAt: timestamp,
            createdBy,
            updatedBy: ownerId,
          });
          transaction.deleteDraft(identity.id);
        });
        retireLocalIdentity(identity);
      })();

      return track(pendingPublishes, draft.id, operation);
    },

    unpublishProduct(product: Product): Promise<ProductDraft> {
      const existing = pendingUnpublishes.get(product.id);
      if (existing) return existing;
      if (pendingPublishes.has(product.id)) {
        return Promise.reject(new Error("This product is being published."));
      }

      const sessionId = adapter.createSessionId();
      const operation = adapter.runTransaction(async (transaction) => {
        const productDocument = await transaction.getProduct(product.id);
        const draftDocument = await transaction.getDraft(product.id);
        if (!productDocument) conflict("The published product no longer exists.");
        if (draftDocument) conflict("A same-id editing draft already exists.");
        const authoritativeProduct = normalizeProduct(product.id, productDocument!.data());
        if ((authoritativeProduct.revision ?? 0) !== (product.revision ?? 0)) {
          conflict("The published product changed in another session. Refresh before continuing.");
        }

        const productRecord = asRecord(productDocument!.data());
        const ownerId = requireOwnerId(transaction);
        const timestamp = transaction.timestamp();
        const write: ProductDraftWrite = {
          ...draftContentFrom(authoritativeProduct),
          status: "draft",
          currentStep: 1,
          mode: "restore",
          sessionId,
          revision: 1,
          sourceProductId: product.id,
          sourceProductRevision: authoritativeProduct.revision ?? 0,
          sourceCreatedAt: productRecord.createdAt ?? null,
          sourceCreatedBy: asString(productRecord.createdBy).trim() || null,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: ownerId,
          updatedBy: ownerId,
        };
        transaction.setDraft(product.id, write);
        transaction.deleteProduct(product.id);
        return writeToDomain(product.id, write);
      });
      return track(pendingUnpublishes, product.id, operation);
    },

    discardDraft(draft: ProductDraft): Promise<void> {
      const existing = pendingDiscards.get(draft.id);
      if (existing) return existing;
      if (pendingPublishes.has(draft.id)) {
        return Promise.reject(new Error("This product draft is being published."));
      }

      const pendingSave = pendingSaves.get(draft.id);
      const operation = (async () => {
        const identity = pendingSave ? await pendingSave : resolveLocalIdentity(draft);
        if (!identity) throw retiredIdentityError();
        await adapter.runTransaction(async (transaction) => {
          const document = await transaction.getDraft(identity.id);
          requireIdentity(document, identity);
          transaction.deleteDraft(identity.id);
        });
        retireLocalIdentity(identity);
      })();
      return track(pendingDiscards, draft.id, operation);
    },

    async duplicateProductToDraft(product: Product): Promise<ProductDraft> {
      const draft = productDraftFromProduct(product, {
        id: adapter.createId(),
        status: "published-copy",
        mode: "create",
        sessionId: null,
        revision: 0,
        sourceProductId: product.id,
        sourceProductRevision: product.revision ?? 0,
        sourceCreatedAt: product.createdAt,
        sourceCreatedBy: product.createdBy ?? null,
      });
      return saveDraft({
        ...draft,
        name: `${product.name} (복사본)`,
        stock: 0,
        salesRank: null,
        ratingAverage: 0,
        reviewCount: 0,
      });
    },
  };

  return repository;
};

const firebaseTransaction = (transaction: Transaction): ProductDraftTransaction => ({
  async getDraft(id) {
    const snapshot = await transaction.get(doc(db, "productDrafts", id));
    return snapshot.exists() ? snapshot : null;
  },
  async getProduct(id) {
    const snapshot = await transaction.get(doc(db, "products", id));
    return snapshot.exists() ? snapshot : null;
  },
  setDraft(id, value) {
    transaction.set(doc(db, "productDrafts", id), value);
  },
  setProduct(id, value) {
    transaction.set(doc(db, "products", id), value);
  },
  deleteDraft(id) {
    transaction.delete(doc(db, "productDrafts", id));
  },
  deleteProduct(id) {
    transaction.delete(doc(db, "products", id));
  },
  timestamp: serverTimestamp,
  ownerId: () => auth.currentUser?.uid ?? null,
});

const firebaseProductDraftAdapter: ProductDraftRepositoryAdapter = {
  createId: () => doc(collection(db, "productDrafts")).id,
  createSessionId: () => crypto.randomUUID(),
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
  runTransaction: (operation) => runTransaction(db, (transaction) => operation(firebaseTransaction(transaction))),
};

const productDraftRepository = createProductDraftRepository(firebaseProductDraftAdapter);

export const createDraftId = productDraftRepository.createDraftId;
export const startDraftSession = productDraftRepository.startDraftSession;
export const createProductEditDraft = productDraftRepository.createProductEditDraft;
export const saveDraft = productDraftRepository.saveDraft;
export const getDraft = productDraftRepository.getDraft;
export const subscribeDrafts = productDraftRepository.subscribeDrafts;
export const publishDraft = productDraftRepository.publishDraft;
export const unpublishProduct = productDraftRepository.unpublishProduct;
export const discardDraft = productDraftRepository.discardDraft;
export const duplicateProductToDraft = productDraftRepository.duplicateProductToDraft;
