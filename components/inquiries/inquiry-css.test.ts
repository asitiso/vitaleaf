import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let style: HTMLStyleElement;
let fixture: HTMLDivElement;

beforeEach(async () => {
  const css = await readFile(resolve(process.cwd(), "app/globals.css"), "utf8");
  const inquiryCss = css.slice(css.indexOf("/* Member inquiries */"));
  style = document.createElement("style");
  style.textContent = inquiryCss.slice(0, inquiryCss.indexOf("@media (max-width: 480px)"));
  document.head.append(style);
  fixture = document.createElement("div");
  fixture.innerHTML = `<section class="inquiry-page inquiry-gate">
    <button class="inquiry-button">인증 다시 확인</button><a class="inquiry-button" href="/login">로그인</a>
    <ul class="inquiry-list"><li><button class="inquiry-list__row"><span>긴문의제목</span></button></li></ul>
    <form class="inquiry-form"><input/><select></select><textarea></textarea>
      <ul class="inquiry-upload-list"><li><img alt="미리보기"/><span>긴파일이름</span><button>제거</button></li></ul>
    </form></section>`;
  document.body.append(fixture);
});

afterEach(() => {
  style.remove();
  fixture.remove();
});

it("gives error/login gates and all form controls readable 44px targets and visible keyboard focus", () => {
  const gateButton = fixture.querySelector<HTMLButtonElement>(".inquiry-gate > button")!;
  gateButton.focus();
  expect(getComputedStyle(gateButton).outline).toContain("3px");
  for (const control of fixture.querySelectorAll<HTMLElement>("button, a, input, select, textarea")) {
    expect(parseFloat(getComputedStyle(control).minHeight)).toBeGreaterThanOrEqual(44);
  }
  expect(getComputedStyle(fixture.querySelector(".inquiry-page")!).fontSize).toBe("16px");
});

it("applies a one-column mobile list and wraps long filenames and titles without fixed minimum widths", () => {
  // jsdom does not evaluate viewport media queries. Apply the parsed mobile rules explicitly.
  const mobile = [...style.sheet!.cssRules].filter((rule): rule is CSSMediaRule => (
    rule instanceof CSSMediaRule && rule.conditionText.includes("max-width: 720px")
  ));
  expect(mobile).toHaveLength(1);
  const mobileStyle = document.createElement("style");
  mobileStyle.textContent = mobile.flatMap((rule) => [...rule.cssRules].map((child) => child.cssText)).join("\n");
  document.head.append(mobileStyle);
  try {
    expect(getComputedStyle(fixture.querySelector(".inquiry-list__row")!).gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(getComputedStyle(fixture.querySelector(".inquiry-form")!).gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(getComputedStyle(fixture.querySelector(".inquiry-page")!).overflowWrap).toBe("anywhere");
    expect(getComputedStyle(fixture.querySelector(".inquiry-upload-list li")!).minWidth).toBe("0px");
    expect(getComputedStyle(fixture.querySelector(".inquiry-list__row")!).position).not.toBe("sticky");
  } finally {
    mobileStyle.remove();
  }
});
