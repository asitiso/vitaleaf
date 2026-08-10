# Task 8 Report — Product Detail and Approved Reviews

## Status

Complete.

## Delivered

- Added `/products/[id]` with product lookup, not-found handling, loading state, and review failure isolation.
- Added a thumbnail gallery with selected-image fallback, product pricing/discount/stock/shipping facts, stock-capped quantity, cart and direct checkout actions.
- Added up to three benefits plus controlled, accessible accordions for dosage, semantic ingredient data, origin, certifications, and cautions.
- Added approved-only review average/count/distribution/list, the required zero-review message, and a working Firestore retry action that does not hide product details.
- Added a single responsive purchase bar that becomes fixed on mobile and includes safe-area bottom padding.
- Added Vitest's missing `next/navigation` test adapter so the dynamic route boundary can be tested.

## TDD Evidence

- Confirmed RED for the missing detail component, then implemented stock-capped quantity/cart behavior.
- Confirmed separate RED states for sold-out facts, image fallback, information accordions/table, approved reviews, zero reviews, review retry, and route not-found/error isolation before each GREEN implementation.

## Verification

- `pnpm test components/product` — 1 file, 7 tests passed.
- `pnpm test` — 16 files, 65 tests passed.
- `pnpm build` — passed; `/products/:id` emitted as a dynamic route.
- `git diff --check` — passed.

## Concerns

- The production build retains the existing Vinext chunk-size warning for a client chunk over 500 kB; it does not fail the build and is not specific enough to justify scope expansion in this task.

## Fix Round 1/5 — 2026-08-10

### Changes

- Replaced native form navigation with an explicit `preventDefault()` → `add(product, quantity)` → `router.push("/checkout")` client flow.
- Added a load-bearing test proving quantity `3` is added before the exact `/checkout` navigation call.
- Added a focused CSS contract test proving the mobile action bar remains `position: fixed`, `bottom: 0`, and padded with `env(safe-area-inset-bottom)`.
- Darkened normal-price, star, review-count/distribution, and review-date small text while preserving the existing neutral/gold palette.

### RED Evidence

- Buy-now test: `add(product, 3)` occurred, but `push("/checkout")` had 0 calls under native form navigation.
- Initial measured contrast on actual backgrounds:
  - normal prices: 2.50:1 and 2.56:1;
  - stars: 2.39:1–2.62:1;
  - review small text: 2.99:1–4.28:1.

### GREEN Evidence

- Normal price `#5f6f67`: 5.26:1 on cream and 4.80:1 on sand.
- Star `#8a5b16`: 5.80:1 on cream and 5.29:1 on sand.
- Review text colors `#52645b`, `#596b62`, and `#5f6f67`: minimum 4.80:1 on tested backgrounds.
- `pnpm test components/product --reporter=dot` — 2 files, 18 tests passed.
- `pnpm test --reporter=dot` — 17 files, 76 tests passed.
- `pnpm build` — passed; `/products/:id` remains a dynamic route.

### Remaining Concerns

- Full tests emit the pre-existing `CartProvider` storage-event `act(...)` warning; no failures.
- Vinext build emits the pre-existing client chunk-size warning; no build failure.
