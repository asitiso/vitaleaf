import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const luminance = (hex: string): number => {
  const channels = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (foreground: string, background: string): number => {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

const selectorColor = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{[^}]*color:\\s*(#[0-9a-f]{6})`, "i"))?.[1] ?? "";
};

it("keeps the mobile purchase actions fixed above the safe area", () => {
  const mobileStart = css.lastIndexOf("@media (max-width: 620px) {");
  const mobileBlock = mobileStart === -1 ? "" : css.slice(mobileStart);
  const actionRule = mobileBlock.match(/\.product-detail__actions\s*\{([^}]*)\}/)?.[1] ?? "";

  expect(actionRule).toMatch(/position:\s*fixed/);
  expect(actionRule).toMatch(/bottom:\s*0/);
  expect(actionRule).toMatch(/env\(safe-area-inset-bottom\)/);
});

it.each([
  [".product-card__original-price", "#fffefb"],
  [".product-detail__price-row del", "#fffefb"],
  [".product-card__rating > span:first-child", "#fffefb"],
  [".product-card__rating > span:last-child", "#fffefb"],
  [".review-section__summary > div > span", "#f7f3eb"],
  [".review-section__summary p", "#f7f3eb"],
  [".review-section__distribution li", "#f7f3eb"],
  [".review-section__list header span", "#fffefb"],
  [".review-section__list time", "#fffefb"],
] as const)("keeps %s small text at WCAG AA contrast", (selector, background) => {
  const foreground = selectorColor(selector);

  expect(foreground).toMatch(/^#[0-9a-f]{6}$/i);
  expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
});
