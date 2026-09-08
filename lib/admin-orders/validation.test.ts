import { describe, expect, it } from "vitest";
import { AdminOrderValidationError, parseAdminOrderReference } from "./validation";

describe("admin order references", () => {
  it("trims member identifiers and accepts a guest with null ownership", () => {
    expect(parseAdminOrderReference({ source: "member", ownerId: " u1 ", orderNumber: " M-1 " }))
      .toEqual({ source: "member", ownerId: "u1", orderNumber: "M-1" });
    expect(parseAdminOrderReference({ source: "guest", ownerId: null, orderNumber: " G-1 " }))
      .toEqual({ source: "guest", ownerId: null, orderNumber: "G-1" });
  });

  it.each(["", " ", "a/b", "\na", "a\t", "a\u0000b", "a\u007fb", "a\u0085b", 123, null])(
    "rejects invalid identifiers %j before trimming can hide controls", (id) => {
      expect(() => parseAdminOrderReference({ source: "member", ownerId: id, orderNumber: "M-1" }))
        .toThrow(AdminOrderValidationError);
      expect(() => parseAdminOrderReference({ source: "guest", ownerId: null, orderNumber: id }))
        .toThrow(AdminOrderValidationError);
    },
  );

  it.each([
    null, [], {}, { source: "other", ownerId: null, orderNumber: "G-1" },
    { source: "guest", ownerId: "u1", orderNumber: "G-1" },
    { source: "guest", ownerId: "", orderNumber: "G-1" },
    { source: "guest", orderNumber: "G-1" },
    { source: "member", ownerId: "u1", orderNumber: "M-1", path: "users/u1/orders/M-1" },
  ])("rejects malformed or extra reference fields %j", (value) => {
    expect(() => parseAdminOrderReference(value)).toThrow(AdminOrderValidationError);
  });
});
