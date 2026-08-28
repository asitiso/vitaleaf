# Final fix wave report

Date: 2026-08-28 (Asia/Seoul)
Base commit: `b9ba84e fix: layer mobile drawer above purchase bar`

## Outcome

Implemented all three Important final-review findings and the bounded public-response parser hardening in one coherent fix wave. The API now returns a server-owned receipt, one checkout retry is idempotent without writing the client key to browser storage, guest checkout reads current product data directly through Firebase Admin, and bundled sample orders with an empty thumbnail parse successfully.

No deployment, rules publication, external configuration, or real credentials were used.

## RED evidence

### 1. Empty sample thumbnail and parser boundaries

Command:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'lib/guest-orders/client.test.ts'
```

Initial result: exit `1`; 12 tests ran, 8 failed. The empty sample thumbnail lookup rejected in `lib/guest-orders/client.ts:68`. The added bounds also exposed accepted zero/1000 quantities, unsafe/overlarge money, and non-canonical or impossible timestamps. Fractional quantity already failed under the old parser and remained as focused coverage.

After the minimal implementation, the same file passed 12/12. The sample regression was then strengthened to exercise real service sample creation, masked public lookup output, and browser parsing in sequence.

### 2. Server-owned receipt and idempotent retry

Command:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'lib/guest-orders/service.test.ts'
```

Initial result: exit `1`; 28 tests ran, 6 failed. The service rejected malformed/tampered browser receipt data, returned the browser order number/time, stored under the browser order number, and did not recover the original receipt for an idempotent retry.

API contract RED:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'app/api/guest-orders/route.test.ts'
```

Initial result: exit `1`; 10 tests ran, 3 failed. The route did not forward an idempotency key and accepted a missing key.

Checkout contract RED:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'components/checkout/checkout-form.test.tsx'
```

Initial result: exit `1`; 26 tests ran, 2 failed. Guest checkout did not supply an idempotency key and therefore could not prove the same in-memory key was reused after a lost/failed response.

GREEN behavior:

- The server uses `node:crypto.randomInt` for a six-character `[A-Z0-9]` code and its own UTC timestamp to form `VL-YYYYMMDD-XXXXXX`.
- Browser `payment.orderNumber` and `payment.receivedAt` remain an opaque, replaceable mock-payment seam and are never authoritative for guest receipt identity/time.
- Checkout creates one `crypto.randomUUID()` key per mounted guest checkout and keeps it only in a React ref across retries.
- The service HMACs the key with the configured server secret and never persists the raw key.
- `guestOrders/{orderNumber}` and `guestOrderIdempotency/{fingerprint}` are created atomically in a Firestore transaction. A concurrent retry returns the already stored order; a later retry resolves the mapping before rechecking mutable price/stock.
- The API returns only `orderNumber` and `receivedAt`; member checkout behavior remains on its existing path.

### 3. Fresh authoritative product read

Command:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'lib/firebase/guest-orders.test.ts'
```

Initial result: exit `1`; 14 tests ran, 4 failed. The default guest repository still called the cached REST storefront reader, so the new immediate price/stock test failed with the missing public-project configuration; the new atomic idempotency repository expectations also failed.

GREEN behavior:

- Guest order creation directly reads each `products/{id}` document through the injected/default Firebase Admin Firestore instance on every new checkout.
- The storefront `server-read.ts` 60-second display cache is unchanged.
- Two consecutive repository reads observe an immediate `price: 12000, stock: 5` to `price: 15000, stock: 0` change.
- The service continues using a bundled sample only when the Admin product snapshot does not exist; an existing zero-stock product never falls back to a sample.

## Final verification

Focused guest service, repository, create/lookup API, client, checkout, and completion tests:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'lib/guest-orders/service.test.ts' 'lib/firebase/guest-orders.test.ts' 'app/api/guest-orders/route.test.ts' 'app/api/guest-orders/lookup/route.test.ts' 'lib/guest-orders/client.test.ts' 'components/checkout/checkout-form.test.tsx' 'components/checkout/order-complete-actions.test.tsx' 'app/order-complete/page.test.tsx'
```

Result: exit `0`; 8 files passed, 111 tests passed.

Full test suite:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run
```

Result: exit `0`; 70 files passed, 2 conditionally skipped; 673 tests passed, 31 skipped.

Lint:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\eslint\bin\eslint.js' . --ignore-pattern dist --ignore-pattern .next
```

Result: exit `0`; no findings.

Vercel build:

```powershell
$taskNodeBin = 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'; $taskOriginalPath = $env:Path; try { $env:Path = "$taskNodeBin;$taskOriginalPath"; $env:NEXT_PUBLIC_FIREBASE_API_KEY = 'build-placeholder-not-a-secret'; & 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' build:vercel } finally { $env:Path = $taskOriginalPath }
```

Result: exit `0`; Next.js compiled, TypeScript completed, and 19/19 static pages generated. The non-secret, process-local placeholder was necessary because the checkout contained no `.env.local`; an initial run without it completed compilation and TypeScript but failed `/admin` prerender with `auth/invalid-api-key`. No real credential was read or written. Next.js emitted only the pre-existing multiple-lockfile/workspace-root warning.

Firestore rules bounded check:

```powershell
& 'C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules\vitest\vitest.mjs' run 'firestore.rules.test.ts'
```

Result: exit `0`; 1 file / 26 tests conditionally skipped because `FIRESTORE_EMULATOR_HOST` was unset and no local `firebase` CLI executable was installed. The committed rules and parameterized rules test now explicitly include `guestOrderIdempotency`; no emulator was downloaded or external service configured.

Final whitespace check:

```powershell
git diff --check
```

Result: recorded after this report was added; exit `0` with only Git's Windows LF-to-CRLF notices and no whitespace errors.

## Changed files

- `app/api/guest-orders/route.ts` and `.test.ts`: require/forward the idempotency key and retain a minimal public receipt response.
- `components/checkout/checkout-form.tsx` and `.test.tsx`: keep one memory-only guest key across a failed submission/retry while preserving member and cart-clearing behavior.
- `lib/guest-orders/client.ts` and `.test.ts`: send the key; parse empty/omitted thumbnails, safe bounded integers, quantities 1-999, bounded money, and canonical ISO timestamps; cover real bundled sample creation through lookup parsing.
- `lib/guest-orders/service.ts`, `types.ts`, `validation.ts`, and `service.test.ts`: server receipt generation, opaque client payment receipt, HMAC idempotency, early retry recovery, and updated contracts.
- `lib/firebase/guest-orders.ts` and `.test.ts`: fresh Admin product reads and atomic order/idempotency persistence.
- `firestore.rules` and `firestore.rules.test.ts`: explicit browser denial for the idempotency collection.
- `.superpowers/sdd/2026-08-26-cart-guest-order-header-age/final-fix-report.md`: this evidence report.

The build-generated `next-env.d.ts` edit was restored and is not part of the fix.

## Design and self-review

- Convenience/effort: retry safety is automatic and invisible to the shopper; it removes duplicate-order risk without adding a form control, stored browser secret, or a second workflow to learn.
- Maintenance: the existing Firebase boundary remains. One small idempotency mapping collection is preferable to querying orders or adding another datastore; both writes share a transaction.
- Privacy: raw phone/address and the raw idempotency key are not logged or returned. Existing generic lookup mismatch, HMAC client fingerprint, and atomic lookup-rate reservation are unchanged.
- Persistence ordering: guest cart/buy-now data clears only after the persisted server receipt returns. A failed/lost response keeps cart and inputs, and the retry uses the same key.
- Freshness: existing storefront caching remains effective; only the authoritative checkout repository takes the direct Admin path.
- Sample fallback: absent local-demo products still work, but an existing out-of-stock product cannot be bypassed by sample data.
- Member behavior and order-complete UI were not otherwise changed and are covered in the focused checkout/completion tests.
- Mutation review: removing the empty-thumbnail branch, safe-integer/range checks, strict timestamp canonicalization, server code/time generation, HMAC namespace, early idempotency read, Firestore transaction creates, or direct Admin read causes at least one focused regression test to fail.

## Concerns

- Firestore emulator execution was not feasible in the current checkout because neither a configured emulator host nor a local Firebase CLI was present. The rules suite therefore remains conditionally skipped here.
- `guestOrderIdempotency` rules must be published together with the application when deployment is later authorized; this fix wave intentionally did not publish them.
- Next.js continues to warn that multiple workspace lockfiles make its inferred Turbopack root ambiguous; the build still completes and this pre-existing repository-layout warning is outside the requested scope.
