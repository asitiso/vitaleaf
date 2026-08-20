import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { normalizeProduct } from "../products/normalize";
import type { Product, ProductInput } from "../products/types";
import { auth, db } from "./client";

export type Unsubscribe = () => void;

export type FirestoreDocument = {
  id: string;
  data(): unknown;
};

export type ProductWrite = ProductInput & {
  createdAt?: unknown;
  updatedAt: unknown;
};

export type ProductUpdateTarget = {
  id: string;
  expectedRevision: number;
};

export type ProductDeleteTarget = ProductUpdateTarget;

export class ProductRevisionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductRevisionConflictError";
  }
}

export type ProductRepositoryAdapter = {
  list: () => Promise<FirestoreDocument[]>;
  get?: (id: string) => Promise<FirestoreDocument | null>;
  subscribe?: (onData: (documents: FirestoreDocument[]) => void, onError: (error: Error) => void) => Unsubscribe;
  save?: (target: ProductUpdateTarget | undefined, product: ProductWrite) => Promise<string>;
  delete?: (target: ProductDeleteTarget) => Promise<void>;
  timestamp?: () => unknown;
};

const requireAdapterMethod = <T>(method: T | undefined, name: string): T => {
  if (!method) throw new Error(`Product repository adapter does not implement ${name}.`);
  return method;
};

const bySalesRank = (left: Product, right: Product): number => {
  const leftRank = left.salesRank ?? Number.POSITIVE_INFINITY;
  const rightRank = right.salesRank ?? Number.POSITIVE_INFINITY;
  return leftRank - rightRank;
};

export const createProductRepository = (adapter: ProductRepositoryAdapter) => ({
  async getProducts(): Promise<Product[]> {
    const documents = await adapter.list();
    return documents.map((document) => normalizeProduct(document.id, document.data())).sort(bySalesRank);
  },

  async getProduct(id: string): Promise<Product | null> {
    const get = requireAdapterMethod(adapter.get, "get");
    const document = await get(id);
    return document ? normalizeProduct(document.id, document.data()) : null;
  },

  subscribeProducts(onData: (products: Product[]) => void, onError: (error: Error) => void): Unsubscribe {
    const subscribe = requireAdapterMethod(adapter.subscribe, "subscribe");
    return subscribe(
      (documents) => onData(documents.map((document) => normalizeProduct(document.id, document.data())).sort(bySalesRank)),
      onError,
    );
  },

  async saveProduct(input: ProductInput, target?: ProductUpdateTarget): Promise<string> {
    if (target !== undefined && (
      typeof target !== "object"
      || target === null
      || typeof target.id !== "string"
      || !target.id.trim()
      || !Number.isInteger(target.expectedRevision)
      || target.expectedRevision < 0
    )) {
      throw new ProductRevisionConflictError("Product updates require a valid id and expected revision.");
    }
    const save = requireAdapterMethod(adapter.save, "save");
    const timestamp = (adapter.timestamp ?? serverTimestamp)();
    return save(target, {
      ...input,
      ...(target ? {} : { createdAt: timestamp }),
      updatedAt: timestamp,
    });
  },

  async deleteProduct(target: ProductDeleteTarget): Promise<void> {
    if (
      typeof target !== "object"
      || target === null
      || typeof target.id !== "string"
      || !target.id.trim()
      || !Number.isInteger(target.expectedRevision)
      || target.expectedRevision < 0
    ) {
      throw new ProductRevisionConflictError("Product deletions require a valid id and expected revision.");
    }
    const remove = requireAdapterMethod(adapter.delete, "delete");
    await remove(target);
  },
});

const firebaseProductAdapter: Required<ProductRepositoryAdapter> = {
  async list() {
    const snapshot = await getDocs(collection(db, "products"));
    return snapshot.docs;
  },
  async get(id) {
    const snapshot = await getDoc(doc(db, "products", id));
    return snapshot.exists() ? snapshot : null;
  },
  subscribe(onData, onError) {
    return onSnapshot(
      collection(db, "products"),
      (snapshot) => onData(snapshot.docs),
      onError,
    );
  },
  async save(target, product) {
    if (target) {
      await runTransaction(db, async (transaction) => {
        const ownerId = auth.currentUser?.uid;
        if (!ownerId) throw new Error("An authenticated administrator is required.");

        const reference = doc(db, "products", target.id);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) throw new Error("The product no longer exists.");

        const stored = snapshot.data();
        const storedRevision = typeof stored.revision === "number" && Number.isInteger(stored.revision)
          ? stored.revision
          : 0;
        if (storedRevision !== target.expectedRevision) {
          throw new ProductRevisionConflictError(
            "The product changed in another session. Refresh before saving.",
          );
        }
        transaction.set(reference, {
          ...product,
          revision: target.expectedRevision + 1,
          updatedBy: ownerId,
        }, { merge: true });
      });
      return target.id;
    }

    const ownerId = auth.currentUser?.uid;
    if (!ownerId) throw new Error("An authenticated administrator is required.");
    const reference = await addDoc(collection(db, "products"), {
      ...product,
      revision: 1,
      createdBy: ownerId,
      updatedBy: ownerId,
    });
    return reference.id;
  },
  async delete(target) {
    await runTransaction(db, async (transaction) => {
      const ownerId = auth.currentUser?.uid;
      if (!ownerId) throw new Error("An authenticated administrator is required.");

      const reference = doc(db, "products", target.id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("The product no longer exists.");

      const stored = snapshot.data();
      const storedRevision = typeof stored.revision === "number" && Number.isInteger(stored.revision)
        ? stored.revision
        : 0;
      if (storedRevision !== target.expectedRevision) {
        throw new ProductRevisionConflictError(
          "The product changed in another session. Refresh before deleting.",
        );
      }
      transaction.delete(reference);
    });
  },
  timestamp: serverTimestamp,
};

const productRepository = createProductRepository(firebaseProductAdapter);

export const getProducts = productRepository.getProducts;
export const getProduct = productRepository.getProduct;
export const subscribeProducts = productRepository.subscribeProducts;
export const saveProduct = productRepository.saveProduct;
export const deleteProduct = productRepository.deleteProduct;
