# Task 11 Report — Admin Authentication and Product CRUD

## Status

Complete.

## Delivered

- Added Firebase email/password administrator authentication with an `admins/{uid}` lookup that requires `role == "admin"`.
- Added initial-session authorization checks; authenticated users without the required admin record are signed out and never mount product write controls.
- Added Korean messages for invalid credentials, network failures, disabled users, forbidden users, and unexpected login failures.
- Added `/admin` with login, product subscription, Korean search, create/edit forms, stock availability toggle, delete confirmation, logout, loading/error/empty states, and success/error toasts.
- Added complete product input coverage including image URL lists; line-based concerns, benefits, cautions, and certifications; structured ingredient rows; badges; pricing; stock; rank; dosage; and origin.
- Added required name/category checks, nonnegative price/stock checks, line normalization, save progress, and duplicate-submit prevention.
- Reused the existing Firebase auth client and product repository. CSV import/export was intentionally not added.

## TDD Evidence

- Auth tests failed first because `lib/firebase/auth.ts` was missing, then passed after the adapter seam, role gate, forced sign-out, observer, and Korean error mapping were added.
- Product form tests failed first because `ProductForm` was missing, then covered required fields, negative price/stock rejection, line-list parsing, structured ingredients, and synchronous save locking.
- Dashboard tests failed first because `AdminDashboard` was missing, then covered the unauthorized no-write-controls boundary, login, search, stock toggle, delete confirmation, and create/edit entry points.

## Verification

- `vitest run lib/firebase/auth.test.ts components/admin` — 3 files, 12 tests passed.
- Focused ESLint for all Task 11 TypeScript/TSX files — passed.
- `vitest run` — 24 files, 102 tests passed on the fresh full run.
- `vinext build` — passed; `/admin` emitted.
- `git diff --check` — passed (line-ending conversion warning only for the existing `app/globals.css` working-copy convention).

## Self-review

- Confirmed authorization is checked before the product subscription or any CRUD control is rendered.
- Confirmed forbidden sign-in and restored forbidden sessions both call Firebase sign-out.
- Confirmed product writes flow only through the existing repository and preserve ratings/review counts on edits and stock toggles.
- Confirmed all Task 11 brief capabilities are covered and no CSV code was introduced.

## Concerns

- The first pre-change full-suite run intermittently failed the existing cart delete-dialog focus restoration test; the fresh final full run passed all 102 tests.
- Repository-wide `tsc --noEmit` remains blocked by pre-existing missing Vitest-global and Cloudflare worker type declarations. No reported TypeScript error pointed to Task 11 files; focused ESLint and the production build pass.
- The build retains the existing non-blocking client chunk-size warning. Splitting this single admin route further would add maintenance without a clear user-facing time saving at the current scale.

## Fix Round 1 — 2026-08-10

### Changes

- Added observer generation and current-UID checks so a delayed `admins/{uid}` result cannot publish an obsolete admin state, remount write controls after sign-out, or sign out a newer user because an older forbidden lookup completed late.
- Treat blank price and stock as missing instead of coercing them to zero; all required-field errors now have Korean messages linked with `aria-describedby`, and validation focuses the first invalid field.
- Added delete-dialog focus entry, Tab and Shift+Tab trapping, Escape cancellation, and safe trigger-focus restoration when the trigger remains mounted.

### TDD Evidence

- Deterministic deferred-role tests failed first when a stale admin lookup remounted `새 상품 등록` after sign-out and when an older forbidden lookup signed out the newer user.
- The untouched-form regression failed first because blank number fields produced no errors, error text was not programmatically associated, and focus did not move to the first invalid input.
- The dialog regression failed first because focus stayed on the background delete trigger and keyboard containment/cancellation was absent.

### Deferred Minor Findings

- Stock toggle still writes the complete product snapshot rather than a stock-only patch.
- Stock toggle still has no per-row mutation lock.

These were intentionally not changed in this round per review scope. Addressing them would add repository API and row-state complexity without being required for the Critical/Important fixes.

### Verification

- `vitest run lib/firebase/auth.test.ts components/admin` — 3 files, 17 tests passed.
- `vitest run components/cart/cart-view.test.tsx` — 1 file, 4 tests passed after the known focus test intermittently failed in the first full-suite run.
- `vitest run` — 24 files, 107 tests passed on the fresh final run.
- `eslint . --ignore-pattern dist --ignore-pattern .next` — passed.
- `vinext build` — passed; `/admin` emitted. The existing non-blocking chunk-size warning remains.
- `git diff --check` — passed with line-ending conversion warnings only.

## Fix Round 2 — 2026-08-10

### Changes

- Extended the authentication adapter with a current `{ uid, generation }` session snapshot and added a distinct `stale` sign-in result.
- `signInAdmin` now compares both its own attempt generation and the authenticated session snapshot before returning `admin` or invoking `signOut`, so an older login cannot authorize or sign out a newer session.
- AdminDashboard ignores `stale` sign-in results and leaves the observer-confirmed current session untouched.

### TDD Evidence

- A deferred login-A role lookup first failed by returning `admin` after the adapter session had changed to signed-out.
- A deferred forbidden login-A lookup first failed by calling `signOut` after the adapter session had changed to user B.
- A Dashboard race first failed when observer-authorized user B's write controls were unmounted after stale login A resolved.
- All three regressions passed after adding the attempt/session snapshot checks and `stale` Dashboard branch.

### Scope

- Observer generation/current-UID guards from Fix Round 1 remain covered and unchanged in behavior.
- The stock snapshot write and missing stock mutation lock remain deferred; no Minor finding was changed in this round.

### Verification

- `vitest run lib/firebase/auth.test.ts components/admin` — 3 files, 20 tests passed.
- `vitest run --no-file-parallelism` — 24 files, 110 tests passed.
- The standard parallel full run still intermittently fails only the pre-existing cart focus-restoration test; that file passes 4/4 in isolation. No cart code was changed.
- `eslint . --ignore-pattern dist --ignore-pattern .next` — passed.
- `vinext build` — passed; `/admin` emitted. The existing non-blocking chunk-size warning remains.
- `git diff --check` — passed with line-ending conversion warnings only.
