# Task 2 Report — Functional Menu States and Information Routes

## Implemented

- Added `resolveMenuState` with taxonomy-backed, strict menu query parsing. Supported category, concern, age, promotion, discovery, and sort destinations now provide a title, description, filters, and any applicable promotion/age state.
- Unsupported and duplicate menu query values reset to the unfiltered catalog state while retaining valid ordinary filters such as search and price.
- Updated `/products` to consume the shared menu state and display the active destination title in both page and results headings.
- Added real App Router pages for `/story`, `/help`, `/help/shipping`, `/help/returns`, and `/ingredients`; all use the shared accessible `InfoPage` component.
- Centralized support, shipping, and return copy values in `lib/site/policies.ts` for quick editing. The ingredients page includes general-information-only language and related product links.
- Added responsive Sage/Sand information-page styles.

## RED → GREEN Evidence

- RED: `menu-state` and `InfoPage` tests initially failed because both modules were absent; the invalid menu URL integration test also failed because `unknown` category/concern values created a blank listing.
- GREEN: `vitest run lib/navigation components/content app/products app/info-routes.test.tsx` passed with 32 tests in 8 files.
- Review RED: duplicate menu URL values were initially accepted by taking the first item. Added a regression test, observed it fail, then reject multi-valued menu parameters; the same focused suite passed after the change.

## Verification

- `node node_modules/vitest/vitest.mjs run lib/navigation components/content app/products app/info-routes.test.tsx` — PASS (32/32).
- `node node_modules/eslint/bin/eslint.js app components/content components/commerce/product-browser.tsx lib/navigation lib/site --ignore-pattern dist --ignore-pattern .next` — PASS.
- `node node_modules/vinext/dist/cli.js build` — PASS; all five information routes appeared in the App Router route output. The existing bundle-size advisory (>500 kB chunk) remained non-blocking.
- `git diff --check` — PASS.

## Self Review

- Confirmed menu URL values are validated against Task 1 taxonomy, arrays cannot bypass strict parsing, and invalid menu values do not create filter chips or empty catalog states.
- Confirmed age filtering preserves the pre-existing concern groups, no product document IDs or payment/order persistence code changed, and information language avoids diagnostic or treatment claims.
- Independent review identified the duplicate-query parsing issue; it was covered with a regression test and fixed before commit. No remaining actionable review findings.

## Concerns / Deferred

- No functional concerns. Build emits the pre-existing non-blocking client chunk-size advisory.

## Fix Round — Strict Multi-Value Query Parsing

- Review finding: menu state parsing used the first item in array-valued query parameters, allowing malformed URLs such as `category=gift&category=unknown` to resolve as a valid menu destination.
- RED: added category and promotion duplicate-value assertions to `lib/navigation/menu-state.test.ts`; the focused test failed with `선물세트` received where `전체 상품` and an empty category filter were expected.
- GREEN: added `singleMenuValue` and used it for taxonomy menu values, promotion, discovery view, and sort. Array-valued menu parameters now normalize to the safe default state instead of selectively accepting the first value.
- Verification: focused navigation/content/product route suite passed (32/32), lint passed, and `vinext build` passed with all new routes listed.
