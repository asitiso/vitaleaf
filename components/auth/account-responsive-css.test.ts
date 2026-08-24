import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("member account responsive CSS contract", () => {
  it("keeps account forms readable and actions full-width on narrow screens", async () => {
    const css = await readFile(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toContain(".auth-page");
    expect(css).toContain(".member-auth-page");
    expect(css).toContain(".mypage-page");
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)/);
    expect(css).toMatch(/\.auth-form[\s\S]*min-height:\s*48px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*720px\)[\s\S]*\.mypage-page[\s\S]*grid-template-columns:\s*1fr/);
  });
});
