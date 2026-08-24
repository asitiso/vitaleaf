import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("member account responsive CSS contract", () => {
  it("keeps account forms readable and actions full-width on narrow screens", async () => {
    const css = await readFile(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toMatch(/\.member-auth-card input[\s\S]*min-height:\s*48px/);
    expect(css).toMatch(/\.my-page\s*\{[\s\S]*grid-template-columns:/);
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*\.my-page[\s\S]*grid-template-columns:\s*1fr/);
    expect(css).toMatch(/\.checkout-empty a, \.order-complete__actions a\s*\{[\s\S]*display:\s*inline-flex[\s\S]*min-height:\s*48px/);
    expect(css).not.toContain(".auth-page");
    expect(css).not.toContain(".auth-form");
    expect(css).not.toContain(".mypage-page");
  });
});
