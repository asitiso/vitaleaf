# Task 6 report — site shell and mega menu

## Delivered

- Added the shared benefit bar, Vitaleaf wordmark, query-string product search, login/admin links, and live cart count.
- Added an accessible category mega menu with product categories, health-concern circles, age targets, and the 7-day trial promotion. Concern circles are exclusive to this menu.
- Added Escape and outside-click dismissal, trigger focus restoration, and a no-horizontal-scroll mobile drawer.
- Added a responsive footer and installed the shared shell in the root layout.

## Verification

- `pnpm test -- components/shell` — 33 tests passed.
- `pnpm lint` — passed.
- `pnpm run build` — passed.

## Notes

- The local executable PATH does not expose `npm` or `node`; verification used the bundled Codex Node runtime with `pnpm`.
- The Vitest configuration contains a minimal `next/link` test alias so the production Next navigation component is exercised in the Vite test environment.

## Fix round 1 evidence

- The mobile drawer now contains the product search form and the same product-category, health-concern, and age-recommendation menu groups as the desktop mega menu.
- Opening the drawer moves focus to its close control. Tab and Shift+Tab wrap within the drawer; Escape closes it and restores focus to the menu trigger.
- Primary navigation now includes today's deal, health concerns, and gift sets. The substituted new-products and duplicate first-purchase entries were removed.
- Header, mega menu, and footer use `next/link` for all internal routes. The phone link remains a native `tel:` anchor.
- Global typography imports and prioritizes Pretendard, then Noto Sans KR, before Arial.

### Verification

- New test-first evidence: the added mobile drawer availability and keyboard-focus tests failed before implementation because the drawer had neither the search/category content nor initial focus.
- `pnpm test -- components/shell` — 35 tests passed.
- `pnpm lint` — passed.
- `pnpm run build` — passed.
