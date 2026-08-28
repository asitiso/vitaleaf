import { describe, expect, it } from "vitest";

import { validateFirebasePublicConfig } from "./client-config";

const validConfig = {
  apiKey: "api-key",
  authDomain: "vitaleaf.firebaseapp.com",
  projectId: "vitaleaf",
  storageBucket: "vitaleaf.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
  measurementId: "G-ABC123",
};

describe("Firebase public client configuration", () => {
  it("accepts a complete public configuration unchanged", () => {
    expect(validateFirebasePublicConfig(validConfig)).toEqual(validConfig);
  });

  it("rejects a missing required value with a normalized configuration error", () => {
    expect(() => validateFirebasePublicConfig({ ...validConfig, apiKey: "" }))
      .toThrowError(expect.objectContaining({ code: "firebase/client-config-missing" }));
  });

  it("omits an unset optional measurement ID", () => {
    expect(validateFirebasePublicConfig({ ...validConfig, measurementId: undefined }).measurementId)
      .toBeUndefined();
  });
});
