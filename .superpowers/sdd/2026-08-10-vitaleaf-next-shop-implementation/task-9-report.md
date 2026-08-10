# Task 9 Report — Cart Page

## Status

Complete.

## Delivered

- Added `/cart` and a client cart view backed by the existing `useCart()` API and its calculated selected-line totals.
- Added empty-cart guidance, individual/all selection, selection deletion confirmation, stock-capped quantity controls, selected subtotal/shipping/total, and free-shipping progress.
- Preserved zero-stock persisted lines so customers can see, deselect, or remove them; selected unavailable lines visibly block checkout.
- Added semantic controls, named progress and dialog elements, keyboard-accessible disabled checkout behavior, and responsive desktop/mobile layouts.
- Kept checkout out of scope: the view only provides the selected-product `/checkout` link.

## TDD Evidence

- Confirmed RED because `CartView` did not exist.
- Confirmed a separate RED for a persisted selected zero-stock item, which was previously discarded and therefore could not be blocked at checkout.

## Verification

- `vitest run components/cart/cart-view.test.tsx features/cart` — 3 files, 11 tests passed.
- `eslint components/cart app/cart features/cart/cart-context.tsx` — passed.
- `vitest run` — 18 files, 79 tests passed.
- `vinext build` — passed; `/cart` emitted.
- `git diff --check` — passed.

## Concerns

- Vinext emits its existing non-blocking client-chunk-size warning during the build. This task does not add enough independent loading behavior to justify code-splitting or extra maintenance.

## Fix Round 1/5 — 2026-08-10

### Changes

- Moved initial keyboard focus into the delete dialog.
- Trapped Tab and Shift+Tab between the dialog actions, closed the dialog with Escape, and restored focus to the original delete trigger when it remains available.

### TDD Evidence

- New keyboard-flow test failed before the change because focus remained on the delete trigger outside the open `aria-modal` dialog.
- The test now verifies initial focus, forward/reverse Tab wrapping, Escape dismissal, and focus restoration.

### Verification

- `vitest run components/cart/cart-view.test.tsx` — 1 file, 4 tests passed.
- `vinext build` — passed; `/cart` emitted.
