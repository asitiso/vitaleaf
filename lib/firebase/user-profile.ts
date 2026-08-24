import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "./client";

export type DeliveryAddress = {
  recipient: string;
  phone: string;
  postcode: string;
  address: string;
  addressDetail: string;
};

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  defaultAddress: DeliveryAddress | null;
  termsAcceptedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type NewUserProfile = Pick<
  UserProfile,
  "uid" | "email" | "displayName" | "termsAcceptedAt"
> & Partial<Pick<UserProfile, "phone" | "defaultAddress">>;

export type UserProfilePatch = Pick<UserProfile, "displayName" | "phone" | "defaultAddress">;

type UserProfileRecord = Record<string, unknown>;

export type UserProfileDocument = {
  data(): unknown;
  exists?: () => boolean;
};

export type UserProfileWrite = UserProfileRecord;

export type UserProfileAdapter = {
  create: (uid: string, profile: UserProfileWrite) => Promise<void>;
  get: (uid: string) => Promise<UserProfileDocument | null>;
  update: (uid: string, patch: UserProfileWrite) => Promise<void>;
  timestamp?: () => unknown;
};

const asRecord = (value: unknown): UserProfileRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UserProfileRecord
    : {};

const asString = (value: unknown): string => typeof value === "string" ? value : "";

const asDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "object" || value === null || !("toDate" in value)) return null;

  const toDate = (value as { toDate?: unknown }).toDate;
  if (typeof toDate !== "function") return null;
  try {
    const date = toDate.call(value);
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  } catch {
    return null;
  }
};

const asAddress = (value: unknown): DeliveryAddress | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const address = asRecord(value);
  return {
    recipient: asString(address.recipient),
    phone: asString(address.phone),
    postcode: asString(address.postcode),
    address: asString(address.address),
    addressDetail: asString(address.addressDetail),
  };
};

export const normalizeUserProfile = (uid: string, raw: unknown): UserProfile => {
  const profile = asRecord(raw);
  return {
    uid,
    email: asString(profile.email),
    displayName: asString(profile.displayName),
    phone: asString(profile.phone),
    defaultAddress: asAddress(profile.defaultAddress),
    termsAcceptedAt: asDate(profile.termsAcceptedAt),
    createdAt: asDate(profile.createdAt),
    updatedAt: asDate(profile.updatedAt),
  };
};

const timestampFor = (adapter: UserProfileAdapter): unknown =>
  (adapter.timestamp ?? serverTimestamp)();

export const createUserProfileRepository = (adapter: UserProfileAdapter) => ({
  async create(input: NewUserProfile): Promise<void> {
    const timestamp = timestampFor(adapter);
    await adapter.create(input.uid, {
      uid: input.uid,
      email: input.email,
      displayName: input.displayName,
      phone: input.phone ?? "",
      defaultAddress: input.defaultAddress ?? null,
      termsAcceptedAt: input.termsAcceptedAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  },

  async get(uid: string): Promise<UserProfile | null> {
    const document = await adapter.get(uid);
    if (!document || document.exists?.() === false) return null;
    return normalizeUserProfile(uid, document.data());
  },

  async update(uid: string, patch: UserProfilePatch): Promise<void> {
    await adapter.update(uid, {
      displayName: patch.displayName,
      phone: patch.phone,
      defaultAddress: patch.defaultAddress,
      updatedAt: timestampFor(adapter),
    });
  },
});

const firebaseUserProfileAdapter: UserProfileAdapter = {
  async create(uid, profile) {
    await setDoc(doc(db, "users", uid), profile, { merge: false });
  },
  async get(uid) {
    const snapshot = await getDoc(doc(db, "users", uid));
    return snapshot.exists() ? snapshot : null;
  },
  async update(uid, patch) {
    await updateDoc(doc(db, "users", uid), patch);
  },
  timestamp: serverTimestamp,
};

const userProfileRepository = createUserProfileRepository(firebaseUserProfileAdapter);

export const createUserProfile = userProfileRepository.create;
export const getUserProfile = userProfileRepository.get;
export const updateUserProfile = userProfileRepository.update;
