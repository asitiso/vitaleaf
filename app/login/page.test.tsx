import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";

const suspendedSearchParams = new Promise<never>(() => undefined);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => {
    throw suspendedSearchParams;
  },
}));

import LoginPage from "./page";

it("renders an accessible fallback when search params suspend during static rendering", () => {
  const markup = renderToString(<LoginPage />);

  expect(markup).toContain('role="status"');
  expect(markup).toContain("로그인 화면을 불러오는 중입니다.");
});
