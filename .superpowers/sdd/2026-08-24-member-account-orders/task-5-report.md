# Task 5: My Page report

## Delivered

- Added the client-side `/mypage` route and Korean-accessible My Page UI.
- Signed-out visitors receive a login link that returns to `/mypage`; checking state is explicit.
- Profile, default address, and order history load independently with loading, error, retry, empty, and success states.
- Authenticated content is remounted per session and request results are bound to their requested UID/retry generation, preventing stale data from rendering after a user change or a sign-out/re-login cycle.
- Profile saves send only `displayName`, `phone`, and `defaultAddress`; the form validates the checkout-equivalent mobile and postcode patterns, prevents duplicate submits, and announces the outcome.
- Unverified members see an informational verification reminder and can resend the email. The signup `notice=verification-email-failed` query value remains visible on My Page without restricting checkout.

## Tests and verification

- RED: `components/account/my-page.test.tsx` initially failed because `./my-page` did not exist.
- Focused GREEN: `components/account/my-page.test.tsx` — 10 passed.
- Lint: `eslint components/account app/mypage` — passed.
- Non-emulator suite: `vitest run --exclude firestore.rules.test.ts --exclude storage.rules.test.ts` — 58 files / 487 tests passed.
- `tsc --noEmit` remains unsuitable as a repository-wide gate: pre-existing test-global and `lib/firebase/member-orders.ts` errors occur outside this task. It also generated `tsconfig.tsbuildinfo`, which was removed.

## Review notes

- Reviewed the changed route and all account components against Task 5 requirements; no unresolved Task 5 issues found.
- The full non-emulator run emits the existing jsdom message `Not implemented: navigation to another Document`; it does not fail any test.

## Review fixes

- Empty order history now includes a clear `/products` link.
- All five default-address inputs retain `aria-invalid` and now point to their unique conditional error message via `aria-describedby`.
- Added coverage for a successful profile retry, empty-order guidance, invalid postcodes, and partial-address validation.
- Verification after the fixes: focused 14 tests passed; non-emulator suite 58 files / 491 tests passed; account lint passed.
