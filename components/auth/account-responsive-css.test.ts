import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function mediaBlock(css: string, condition: string): string {
  const mediaStart = css.indexOf(condition);
  expect(mediaStart, `Missing media query: ${condition}`).toBeGreaterThanOrEqual(0);

  const bodyStart = css.indexOf("{", mediaStart);
  let depth = 0;
  for (let index = bodyStart; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return css.slice(bodyStart + 1, index);
  }

  throw new Error(`Unclosed media query: ${condition}`);
}

describe("member account responsive CSS contract", () => {
  it("keeps account forms readable and actions full-width on narrow screens", async () => {
    const css = await readFile(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toMatch(/\.member-auth-card form, \.my-page form\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.member-auth-card form button\[type="submit"\],\s*\.my-page form button\[type="submit"\],\s*\.my-page > section button,\s*\.checkout-save-address\s*\{[^}]*min-height:\s*48px/);
    expect(css).toMatch(/\.member-auth-card input[\s\S]*min-height:\s*48px/);
    expect(css).toMatch(/\.my-page\s*\{[\s\S]*grid-template-columns:/);
    expect(css).toMatch(/\.checkout-empty a, \.order-complete__actions a\s*\{[^}]*display:\s*inline-flex[^}]*min-height:\s*48px/);

    const mobile = mediaBlock(css, "@media (max-width: 720px)");
    expect(mobile).toMatch(/\.my-page\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(mobile).toMatch(/\.order-complete__actions a\s*\{[^}]*width:\s*100%[^}]*min-height:\s*48px/);

    expect(css).not.toContain(".auth-page");
    expect(css).not.toContain(".auth-form");
    expect(css).not.toContain(".mypage-page");
  });
});
