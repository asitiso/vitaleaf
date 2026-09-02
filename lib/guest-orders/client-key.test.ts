import { describe, expect, it } from "vitest";

import { guestOrderClientKeyFrom } from "./client-key";

describe("guestOrderClientKeyFrom", () => {
  it.each([
    [{ "x-forwarded-for": "198.51.100.42, 203.0.113.7", "x-real-ip": "192.0.2.9" }, "198.51.100.42"],
    [{ "x-real-ip": "192.0.2.9" }, "192.0.2.9"],
    [{}, "unknown"],
  ])("uses the trusted lookup header precedence for %j", (headers, expected) => {
    expect(guestOrderClientKeyFrom(new Request("http://localhost", { headers }))).toBe(expected);
  });
});
