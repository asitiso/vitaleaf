import { describe, expect, it } from "vitest";

import { resolveSiteOrigin } from "./metadata";

describe("resolveSiteOrigin", () => {
  it("prefers a valid configured origin over untrusted forwarded headers", () => {
    expect(
      resolveSiteOrigin({
        forwardedHost: "evil.example.com",
        forwardedProto: "https",
        host: "internal.worker",
        siteUrl: "https://store.example.com/catalog",
      }),
    ).toBe("https://store.example.com");
  });

  it("falls back to validated request headers when configuration is missing or invalid", () => {
    expect(
      resolveSiteOrigin({
        forwardedHost: "vitaleaf.example.com",
        forwardedProto: "https",
        siteUrl: "javascript:alert(1)",
      }),
    ).toBe("https://vitaleaf.example.com");

    expect(resolveSiteOrigin({ host: "localhost:3000" })).toBe("http://localhost:3000");
  });

  it("rejects non-http protocols and malformed hosts without returning an opaque origin", () => {
    const invalidProtocolOrigin = resolveSiteOrigin({
      forwardedHost: "vitaleaf.example.com",
      forwardedProto: "javascript",
      siteUrl: "data:text/plain,hello",
    });
    const malformedHostOrigin = resolveSiteOrigin({
      forwardedHost: "vitaleaf.example.com/path",
      forwardedProto: "https",
    });

    expect(invalidProtocolOrigin).toBe("http://localhost:3000");
    expect(malformedHostOrigin).toBe("http://localhost:3000");
    expect(invalidProtocolOrigin).not.toBe("null");
    expect(() => new URL(invalidProtocolOrigin)).not.toThrow();
  });
});
