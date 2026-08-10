# Task 7 Report: Home Merchandising and Product Listing

## Status

Complete. The home page now uses Firestore products for professional merchandising, and `/products` provides full search, filtering, sorting, active filter chips, result counts, and responsive product discovery. No production product fallback was added.

## Implemented

- Reusable product cards with discount rate, current/original price, rating and review count, benefit badges, sales rank, explicit sold-out text, and missing-image presentation.
- Product grid states for loading, ready, empty, and error, including stable skeletons, retry, and administrator-only catalog guidance.
- Sage & Sand home merchandising with a hero, two side promotions, four-item trust bar, daily ranked products, age-target navigation, new products, and ingredient-transparency principles.
- A single polished catalog state when Firestore is empty or unavailable; the home page does not repeat health-concern circles.
- Product listing controls for search, category, concern, minimum/maximum price, in-stock-only, and four sort modes.
- Individually removable active filter chips, live result count, and responsive 4/3/2-column grids.
- URL hydration for all listing filters, including normalization of the existing header/mega-menu category and concern slugs and age-target metadata search.

## TDD Evidence

- Product card test first failed because `ProductCard` did not exist, then passed after implementation.
- Product grid state tests first failed because `ProductGrid` did not exist, then passed after implementation.
- Product browser interaction tests first failed because `ProductBrowser` did not exist, then passed after implementation.
- Home and route tests first failed against the placeholder/missing routes, then passed after implementation.
- Existing menu slug and age-target integration test failed against direct query copying, then passed after URL normalization.

## Verification

- `pnpm test`: 13 files passed, 45 tests passed.
- `pnpm run lint`: passed with no errors or warnings.
- `pnpm run build`: passed; `/` and `/products` were included in the Vinext build.

## Review

- Read-only code review found no critical issues.
- Corrected the age navigation semantics from invalid ARIA tabs to named navigation links.
- Corrected incompatibility between existing symbolic menu URLs and catalog display values.
- React review found no effects, client data-fetching waterfalls, or unnecessary component abstractions; filtering remains derived and memoized.

## Concerns

- Age targeting uses searchable catalog metadata such as benefits (for example, `30대 추천`) because the approved `Product` schema has no dedicated age-segment or age-specific sales-rank field. Adding authoritative age-specific rankings later requires an explicit schema/data contract change.
- A standalone `tsc --noEmit` remains unsuitable as a repository gate because existing project configuration does not include Vitest globals or Cloudflare Worker ambient types. The required Vinext production build succeeds.

---

## Fix Round 1/5 — 2026-08-10

### Status

Complete. All Important findings and the requested route-loading state were addressed without adding fake products or changing the approved visual direction.

### Corrections

- Existing header and mega-menu URLs now produce meaningful listing states:
  - `sort=popular` replaces the unsupported `sort=best` emitter.
  - `promotion=today` selects products whose `originalPrice` is greater than `price`.
  - `promotion=trial` uses the named `TRIAL_MAX_PRICE_WON` rule: in stock and priced at or below 30,000 won.
  - `view=concerns` opens concern quick discovery and applies the selected concern.
  - `view=ingredients` opens ingredient quick discovery and applies the selected ingredient search.
- `ProductBrowser` now synchronizes its local controls when `initialFilters` change during same-route App Router navigation, without effect-driven cascading renders.
- Ranked cards display only their actual Firestore `salesRank`; an unranked `isBest` product receives no fabricated badge.
- The prior free-text age convention is superseded by the named `AGE_CONCERN_GROUPS` mapping:
  - 30s: `장 건강`, `피로·활력`
  - 40s: `눈 건강`, `혈행`
  - 50s: `뇌 건강`, `관절·뼈 건강`
- Added `/products/loading.tsx`, which reaches the shared stable `ProductGrid` skeleton during Firestore latency.

### TDD Evidence

- The first focused run failed 11 tests for unsupported menu URLs, stale rerendered filters, fabricated ranks, and free-text age matching.
- The loading test then failed because `app/products/loading.tsx` did not exist.
- Implementations were added only after those expected failures; the focused suite then passed 24/24.

### Exact Verification Commands

- `$env:Path = 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path; pnpm test app/products/loading.test.tsx app/products/products-page.test.tsx components/commerce/product-grid.test.tsx components/shell/site-header.test.tsx`
  - Result: 4 files passed, 24 tests passed.
- `$env:Path = 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path; pnpm test`
  - Result: 14 files passed, 56 tests passed.
- `$env:Path = 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path; pnpm run lint`
  - Result: passed with no errors or warnings.
- `$env:Path = 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path; pnpm run build`
  - Result: passed; Vinext completed all five build stages and emitted `/` and `/products`.

### Remaining Concerns

- Age recommendations are deterministic editorial mappings over the approved concern schema, not age-specific sales ranks. Authoritative demographic rankings would still require a new analytics-backed schema contract.
