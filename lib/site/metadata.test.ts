import { describe, expect, it } from "vitest";

import { resolveSiteOrigin } from "./metadata";

describe("resolveSiteOrigin", () => {
  it("uses the incoming forwarded host and protocol for absolute social metadata", () => {
    expect(
      resolveSiteOrigin({
        forwardedHost: "vitaleaf.example.com",
        forwardedProto: "https",
        host: "internal.worker",
      }),
    ).toBe("https://vitaleaf.example.com");
  });

  it("uses the configured URL or a safe local fallback without proxy headers", () => {
    expect(resolveSiteOrigin({ siteUrl: "https://store.example.com/" })).toBe("https://store.example.com");
    expect(resolveSiteOrigin({ host: "localhost:3000" })).toBe("http://localhost:3000");
  });
});
