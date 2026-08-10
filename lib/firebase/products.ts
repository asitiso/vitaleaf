import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { normalizeProduct } from "../products/normalize";
import type { Product, ProductInput } from "../products/types";
import { db } from "./client";

export type Unsubscribe = () => void;

type FirestoreDocument = {
  id: string;
  data(): unknown;
};

type ProductWrite = ProductInput & {
  createdAt?: unknown;
  updatedAt: unknown;
};

export type ProductRepositoryAdapter = {
  list: () => Promise<FirestoreDocument[]>;
  get?: (id: string) => Promise<FirestoreDocument | null>;
  subscribe?: (onData: (documents: FirestoreDocument[]) => void, onError: (error: Error) => void) => Unsubscribe;
  save?: (id: string | undefined, product: ProductWrite) => Promise<string>;
  delete?: (id: string) => Promise<void>;
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

  async saveProduct(input: ProductInput, id?: string): Promise<string> {
    const save = requireAdapterMethod(adapter.save, "save");
    const timestamp = (adapter.timestamp ?? serverTimestamp)();
    return save(id, {
      ...input,
      ...(id ? {} : { createdAt: timestamp }),
      updatedAt: timestamp,
    });
  },

  async deleteProduct(id: string): Promise<void> {
    const remove = requireAdapterMethod(adapter.delete, "delete");
    await remove(id);
  },
});

const firebaseProductAdapter: Required<ProductRepositoryAdapter> = {
  async list() {
    const snapshot = await getDocs(query(collection(db, "products"), orderBy("salesRank", "asc")));
    return snapshot.docs;
  },
  async get(id) {
    const snapshot = await getDoc(doc(db, "products", id));
    return snapshot.exists() ? snapshot : null;
  },
  subscribe(onData, onError) {
    return onSnapshot(
      query(collection(db, "products"), orderBy("salesRank", "asc")),
      (snapshot) => onData(snapshot.docs),
      onError,
    );
  },
  async save(id, product) {
    if (id) {
      await setDoc(doc(db, "products", id), product, { merge: true });
      return id;
    }

    const reference = await addDoc(collection(db, "products"), product);
    return reference.id;
  },
  async delete(id) {
    await deleteDoc(doc(db, "products", id));
  },
  timestamp: serverTimestamp,
};

const productRepository = createProductRepository(firebaseProductAdapter);

export const getProducts = productRepository.getProducts;
export const getProduct = productRepository.getProduct;
export const subscribeProducts = productRepository.subscribeProducts;
export const saveProduct = productRepository.saveProduct;
export const deleteProduct = productRepository.deleteProduct;
