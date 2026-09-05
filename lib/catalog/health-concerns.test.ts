import { describe, expect, it } from "vitest";

import { HEALTH_CONCERNS } from "./taxonomy";

describe("health concern taxonomy", () => {
  it("includes customer-facing skin and liver health choices", () => {
    expect(HEALTH_CONCERNS).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "skin", label: "피부 건강" }),
      expect.objectContaining({ value: "liver", label: "간 건강" }),
    ]));
  });
});
