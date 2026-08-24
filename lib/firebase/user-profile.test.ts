import { beforeEach, describe, expect, it, vi } from "vitest";

const { docMock, getDocMock, serverTimestampMock, setDocMock, updateDocMock } = vi.hoisted(() => ({
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  serverTimestampMock: vi.fn(),
  setDocMock: vi.fn(),
  updateDocMock: vi.fn(),
}));

vi.mock("./client", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: docMock,
  getDoc: getDocMock,
  serverTimestamp: serverTimestampMock,
  setDoc: setDocMock,
  updateDoc: updateDocMock,
}));

import {
  createUserProfile,
  createUserProfileRepository,
  getUserProfile,
  normalizeUserProfile,
  updateUserProfile,
  type DeliveryAddress,
} from "./user-profile";

const createdAt = new Date("2026-08-24T00:00:00.000Z");
const address: DeliveryAddress = {
  recipient: "홍길동",
  phone: "010-1234-5678",
  postcode: "12345",
  address: "서울시 중구 세종대로",
  addressDetail: "101호",
};

beforeEach(() => {
  docMock.mockReset().mockImplementation((_db: unknown, collection: string, uid: string) => ({
    collection,
    uid,
  }));
  getDocMock.mockReset();
  serverTimestampMock.mockReset().mockReturnValue({ marker: "server-time" });
  setDocMock.mockReset().mockResolvedValue(undefined);
  updateDocMock.mockReset().mockResolvedValue(undefined);
});

describe("user profile normalization", () => {
  it("normalizes a missing saved address to null", () => {
    expect(normalizeUserProfile("user-1", {
      uid: "user-1",
      email: "member@example.com",
      displayName: "홍길동",
      phone: "",
    })).toMatchObject({ uid: "user-1", defaultAddress: null });
  });

  it("uses the path uid and safely normalizes malformed values", () => {
    const timestamp = { toDate: () => createdAt };
    expect(normalizeUserProfile("path-user", {
      uid: "spoofed-user",
      email: 123,
      displayName: null,
      phone: undefined,
      defaultAddress: { recipient: "홍길동", phone: 123 },
      termsAcceptedAt: timestamp,
      createdAt: { toDate: () => new Date("invalid") },
      updatedAt: "not-a-timestamp",
    })).toEqual({
      uid: "path-user",
      email: "",
      displayName: "",
      phone: "",
      defaultAddress: {
        recipient: "홍길동",
        phone: "",
        postcode: "",
        address: "",
        addressDetail: "",
      },
      termsAcceptedAt: createdAt,
      createdAt: null,
      updatedAt: null,
    });
  });
});

describe("user profile repository", () => {
  it("creates immutable identity metadata and an empty address", async () => {
    const adapter = {
      create: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      update: vi.fn(),
      timestamp: vi.fn().mockReturnValue({ marker: "server-time" }),
    };
    const repository = createUserProfileRepository(adapter);

    await repository.create({
      uid: "user-1",
      email: "member@example.com",
      displayName: "홍길동",
      termsAcceptedAt: createdAt,
    });

    expect(adapter.create).toHaveBeenCalledWith("user-1", expect.objectContaining({
      uid: "user-1",
      email: "member@example.com",
      defaultAddress: null,
      phone: "",
      termsAcceptedAt: createdAt,
    }));
  });

  it("creates a repaired profile with the member-entered phone and default address", async () => {
    const adapter = {
      create: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      update: vi.fn(),
      timestamp: vi.fn().mockReturnValue({ marker: "server-time" }),
    };
    const repository = createUserProfileRepository(adapter);

    await repository.create({
      uid: "user-1",
      email: "member@example.com",
      displayName: "복구 회원",
      phone: "010-1234-5678",
      defaultAddress: address,
      termsAcceptedAt: createdAt,
    });

    expect(adapter.create).toHaveBeenCalledWith("user-1", expect.objectContaining({
      email: "member@example.com",
      displayName: "복구 회원",
      phone: "010-1234-5678",
      defaultAddress: address,
    }));
  });

  it("reads and converts Firestore timestamps without exposing SDK values", async () => {
    const adapter = {
      create: vi.fn(),
      get: vi.fn().mockResolvedValue({ data: () => ({
        email: "member@example.com",
        displayName: "홍길동",
        phone: "010-1234-5678",
        defaultAddress: address,
        termsAcceptedAt: { toDate: () => createdAt },
        createdAt: { toDate: () => createdAt },
        updatedAt: { toDate: () => createdAt },
      }) }),
      update: vi.fn(),
    };

    await expect(createUserProfileRepository(adapter).get("user-1")).resolves.toEqual({
      uid: "user-1",
      email: "member@example.com",
      displayName: "홍길동",
      phone: "010-1234-5678",
      defaultAddress: address,
      termsAcceptedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  });

  it("returns null for a missing profile", async () => {
    const adapter = { create: vi.fn(), get: vi.fn().mockResolvedValue(null), update: vi.fn() };
    await expect(createUserProfileRepository(adapter).get("user-1")).resolves.toBeNull();
  });

  it("updates only mutable fields and updatedAt", async () => {
    const adapter = {
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      timestamp: vi.fn().mockReturnValue({ marker: "server-time" }),
    };
    await createUserProfileRepository(adapter).update("user-1", {
      displayName: "새 이름",
      phone: "010-9999-9999",
      defaultAddress: address,
    });

    expect(adapter.update).toHaveBeenCalledWith("user-1", {
      displayName: "새 이름",
      phone: "010-9999-9999",
      defaultAddress: address,
      updatedAt: { marker: "server-time" },
    });
  });

  it("propagates adapter rejections", async () => {
    const failure = new Error("profile unavailable");
    const adapter = {
      create: vi.fn().mockRejectedValue(failure),
      get: vi.fn().mockRejectedValue(failure),
      update: vi.fn().mockRejectedValue(failure),
    };
    const repository = createUserProfileRepository(adapter);

    await expect(repository.create({
      uid: "user-1",
      email: "member@example.com",
      displayName: "홍길동",
      termsAcceptedAt: createdAt,
    })).rejects.toBe(failure);
    await expect(repository.get("user-1")).rejects.toBe(failure);
    await expect(repository.update("user-1", {
      displayName: "홍길동",
      phone: "",
      defaultAddress: null,
    })).rejects.toBe(failure);
  });
});

describe("Firebase user profile functions", () => {
  it("writes, reads, and updates the users document through Firestore", async () => {
    getDocMock.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });

    await createUserProfile({
      uid: "user-1",
      email: "member@example.com",
      displayName: "홍길동",
      termsAcceptedAt: createdAt,
    });
    expect(setDocMock).toHaveBeenCalledWith(
      { collection: "users", uid: "user-1" },
      expect.objectContaining({ uid: "user-1", defaultAddress: null }),
      { merge: false },
    );

    await getUserProfile("user-1");
    expect(getDocMock).toHaveBeenCalledWith({ collection: "users", uid: "user-1" });

    await updateUserProfile("user-1", {
      displayName: "새 이름",
      phone: "010-9999-9999",
      defaultAddress: address,
    });
    expect(updateDocMock).toHaveBeenCalledWith(
      { collection: "users", uid: "user-1" },
      expect.objectContaining({ displayName: "새 이름", phone: "010-9999-9999", defaultAddress: address }),
    );
  });
});
