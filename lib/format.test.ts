import { describe, expect, it } from "vitest";

import { formatWon } from "./format";

describe("formatWon", () => {
  it("formats Korean won without decimals", () => {
    expect(formatWon(44900)).toBe("44,900원");
  });
});
