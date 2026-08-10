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
