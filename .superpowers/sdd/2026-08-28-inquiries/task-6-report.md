# Task 6 report — member inquiry pages

## Delivered

- Added member list, create, and detail routes with auth checking/error/signed-out gates. Login destinations preserve the exact list/new/detail path.
- Added guest-reusable list/form/detail components: access is passed in, form completion is a callback, and member-only auth/order loading stays in thin wrappers.
- Added strict browser upload-url parsing and direct signed `PUT` helper. Upload URLs and receipts are never rendered, logged, persisted, or placed in route state.
- Form validates text through the shared contract, validates image MIME/size/first 12-byte signature, limits to three files and two concurrent uploads, revokes object URLs on remove/unmount, refreshes receipts aged nine minutes, and invalidates receipts after failed create while retaining form text/files.
- Added My Page `1:1 문의` card and responsive/focus/44px controls for inquiry and auth-gate states.

## TDD evidence

- RED: `node_modules/.bin/vitest.cmd run lib/inquiries/client.test.ts` — 6 expected failures (`requestInquiryUploadUrl`/`putInquiryUpload` missing).
- GREEN: same command — 21/21 passed after strict parser and direct PUT implementation.
- RED: component tests initially failed resolving new list/detail/form modules; implementation then made the corresponding focused cases green.
- Final focused: `node_modules/.bin/vitest.cmd run lib/inquiries/client.test.ts components/inquiries/inquiry-list.test.tsx components/inquiries/inquiry-detail.test.tsx components/inquiries/inquiry-form.test.tsx components/account/my-page.test.tsx app/storefront-route-contract.test.ts` — 6 files, 70/70 passed.

## Verification

- Focused ESLint for changed inquiry routes/components/client/My Page: passed with 0 errors/warnings.
- Focused strict TypeScript command exposed pre-existing project-wide test-global errors; changed-file errors were fixed. Full `tsc --noEmit` remains unsuitable in this repository because test globals are intentionally not declared in `tsconfig`.
- `git diff --check`: passed. Removed generated `tsconfig.tsbuildinfo`.
- Browser smoke (controller): `/mypage/inquiries`, `/new`, and detail route returned HTTP 200 at 390px without overflow, overlay, or console errors. Firebase environment is absent, so logged-in live browser behavior was not verified; auth-error gate was verified.

## Notes / follow-up

- Component tests cover direct PUT request shape, strict response rejection, list/detail state, shared validation, and create-failure retained text. The upload concurrency/partial-failure/object-URL cleanup behavior is implemented but needs broader dedicated interaction tests in the next review pass.
- The existing deferred client timestamp-ordering parser finding was not changed.

## Continuation correction — 2026-09-03

This section supersedes the original report's incomplete upload/lifecycle coverage and its non-isolated TypeScript claim. The continuation started from `c49b577`, preserving the unfinished first-submit test in `components/inquiries/inquiry-form.test.tsx`. Formal Task 6 review must cover `c77cbe3..HEAD`, not just this continuation commit.

### Reproduced failures and corrections

1. **First-submit correctness.** The preserved test initially stopped at an ambiguous `/leaf.png/` query matching both filename and remove button. After making the query accessible-role-specific, it reached the real failure: the upload rendered as complete but `createInquiry` was called **zero times** on the first submit. The form previously read an effect-synchronized ref before React had flushed upload status. Upload mutations now synchronously update the canonical ref and render state in the same operation. The `setTimeout(0)`/effect-flush dependency is removed. Original form tests went from 1 failing / 3 passing to 4/4 passing. Their intent was retained when the tests were later upgraded to real client calls with fetch/Firebase boundary mocks.

2. **Real upload interactions.** Added `inquiry-form.integration.test.tsx`, exercising the actual form, shared input/file validation, real upload/create helpers, strict response parsers, and fetch boundary. Initially 12 of its first 17 cases failed, exposing unlocked mid-submit attachment controls, rapid selection beyond three images, preview leaks after late validation, missing cancellation at signing/PUT/create, an invisible locked guest order, and code-unit truncation. The tests also independently established working partial-failure and receipt behavior. Together with two new client failures, the combined RED run was **14 failing / 32 passing**. After correction the combined form/client run was **46/46 GREEN**.

3. **Account isolation.** Added real `AuthProvider` integration with a Firebase adapter double, not mocked inquiry children or a mocked auth hook. The initial 12-case run had **6 failures**: list/detail fetched again for stable UID re-notification, and an A→B commit briefly retained A's draft during validation/upload/token/create. A layout-effect observer records the actual committed DOM before passive effects, so immediate privacy is checked rather than merely eventual disappearance. The member gate now keys private children by UID and exact route; member access and list/detail effect dependencies are stable. Old list/detail requests are aborted; unsupported-abort member-order reads retain a current-operation guard. The corrected run was **12/12 GREEN**.

4. **Shared navigation and detail states.** Added real-client read integration. Initial **4 failing / 12 passing** exposed missing guest callback navigation, nested main landmarks, and a crash on an undefined detail ID. List accepts optional `onCreate`/`onSelect`, detail accepts optional `onBack`, and member href navigation remains available. Reusable content uses sections; only the member page gate provides main. Missing/malformed IDs never fetch. The corrected 16-case read integration suite is GREEN.

5. **Multiline and Unicode contract.** Added a real client parser regression for server-valid LF/tab body and reply, including 100-codepoint title and 3,000-codepoint body. It initially rejected the response. Only inquiry title/body/reply use server-compatible codepoint bounds; only body/reply allow LF/tab. CR, NUL, C1 controls, newline in title, oversized fields, and extra/private response fields remain rejected. URL/token/receipt parsing is not loosened. Native field maxLength allows the possible two UTF-16 units per character; the shared parser enforces actual 100/3,000-codepoint limits before the request. The form test submits real multiline content and receives/parses the response successfully.

6. **Cancellation across Firebase token acquisition.** A new client RED resolved the pending token as the next member's token after abort and observed the old draft still being sent. Client POST helpers now accept optional AbortSignal, check it before and after token acquisition, pass it to fetch, and check after fetch. Form side effects guard the captured signal after every asynchronous boundary. Signing/PUT/create unmount tests prove abort and no subsequent network/navigation; A→B tests also cover pending token resolution. Cancellation is best effort for already accepted server work; no claim is made that abort reverses an already completed server mutation.

7. **CSS and readability.** Replaced minified inquiry TSX, member routes and inquiry CSS with ordinary multiline code and named operation handlers. New parsed-CSS/computed-style tests initially failed for missing guest-row control sizing and mobile grid behavior. They now verify 44px-or-larger actions, 16px page text, visible focus on the auth error button, a one-column mobile list/form, wrapping, and zero minimum widths. As jsdom does not evaluate viewport media queries, the test applies the parsed 720px media block explicitly; this is CSS behavior coverage, not a claim of browser pixel-layout measurement. A jsdom computed-style caching assumption was corrected by focusing before the first style read. Images use `next/image` with `unoptimized`, preserving direct blob/signed URLs without routing private media through the public image optimizer.

### Upload and retained-state guarantees

- Canonical `validateUploadRequest` and `detectImageType` are reused. Only the first 12 bytes are read. Zero-byte, over-five-MiB, unsupported MIME and renamed executable/signature-mismatch files fail before upload/preview allocation. Copy now correctly says **5MB 이하**, not a one-MB minimum.
- File-picker events reserve available attachment slots synchronously before awaiting validation; selected sequence numbers preserve original order even if validation completes out of order. Validation pending state blocks submission. At most three selected/reserved images and two simultaneous signing/PUT workers are allowed.
- A synchronous busy guard prevents duplicate submissions. File addition/removal controls are disabled and their handlers also guard the operation, keeping its attachment set fixed. Explicit deferred PUT tests resolve files out of order while proving no create occurs early, concurrency peaks at exactly two, and receipt order remains the original file order.
- Original `File` instances are the direct PUT bodies with method PUT and exact content-type; no bytes go to VITALEAF API routes. Successful receipts survive a partial failure; retry uploads only failures. Text/category/order/previews remain intact. Removing a ready file omits its receipt.
- Failed create invalidates all potentially consumed receipts while keeping original files, previews and text. A real two-file failure/retry test observes receipt-1/2 followed by fresh receipt-3/4 and both originals uploaded again. Receipts aged at least nine minutes are refreshed; expiresAt and post-upload age are checked too so a slow concurrent upload cannot silently use a stale ready receipt.
- Preview ownership is registered immediately in a component-owned Set. Removal revokes once; unmount revokes every remaining allocation. Late validation after unmount/identity change is discarded before a new URL is allocated, and previously allocated URLs are still revoked. No draft, UID, token, receipt or signed PUT URL is persisted in local/session storage or navigation state.
- All new inquiry interaction tests mock only Firebase adapter/token, fetch, router, and browser file/object-URL boundaries. Production components, client helpers and parsers execute together. No credentials, live accounts or external services are needed.

### Fresh final verification

All commands ran from `C:\Users\우\Documents\작업\vitaleaf-shop\.worktrees\member-account-orders`, with this runtime prefix:

```powershell
$env:PATH='C:\Users\우\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
```

**Truly isolated strict TypeScript**:

```powershell
node_modules/.bin/tsc.cmd --project tsconfig.inquiry-task6.check.json --pretty false
```

Result: **exit 0, empty output**. The focused configuration was a temporary file (removed before commit), extending the repository tsconfig with `strict: true`, `noEmit: true`, `incremental: false`, `types: ["node", "vitest/globals", "@testing-library/jest-dom"]`, and `plugins: []`. Its include list was exactly:

```json
[
  "app/mypage/inquiries/**/*.tsx",
  "components/inquiries/**/*.ts",
  "components/inquiries/**/*.tsx",
  "components/account/my-page.tsx",
  "components/account/my-page.test.tsx",
  "lib/inquiries/client.ts",
  "lib/inquiries/client.test.ts",
  "tests/inquiry-fixtures.ts"
]
```

The only new type issue found was literal widening of a newly constructed queued upload before sorting. It was corrected with an explicit `Upload` value. No repository-wide noisy tsc run is labeled a pass here.

**Focused ESLint**:

```powershell
node_modules/.bin/eslint.cmd app/mypage/inquiries components/inquiries lib/inquiries/client.ts lib/inquiries/client.test.ts tests/inquiry-fixtures.ts components/account/my-page.tsx components/account/my-page.test.tsx
```

Result: **exit 0, empty output** after adding keys to three JSX elements in a parameterized test fixture.

**Focused component/client/My Page/route inventory**:

```powershell
node_modules/.bin/vitest.cmd run lib/inquiries/client.test.ts components/inquiries components/account/my-page.test.tsx app/storefront-route-contract.test.ts --reporter=dot
```

Result: **10 files, 132/132 tests passed; no warnings or unhandled errors**. This includes 61 inquiry component/CSS tests and 29 client tests.

**Inquiry Task 1–6 plus auth/member-order regression**:

```powershell
node_modules/.bin/vitest.cmd run lib/inquiries app/api/inquiries components/inquiries lib/firebase/inquiries.test.ts lib/firebase/inquiry-uploads.test.ts lib/firebase/admin.storage.test.ts lib/firebase/member-auth.test.ts lib/firebase/id-token.test.ts lib/firebase/member-orders.test.ts lib/firebase/member-orders.server.test.ts features/auth/auth-context.test.tsx components/account/my-page.test.tsx components/auth app/storefront-route-contract.test.ts --reporter=dot
```

Result: **32 files, 443/443 tests passed, exit 0**. Existing `features/auth/auth-context.test.tsx` emits React act warnings in its sign-out/error/retry tests; those unrelated test fixtures were not changed. New inquiry suites are warning-free.

- `git diff --check`: exit 0; only Git's LF→CRLF informational warnings.
- `git diff -- next-env.d.ts`: empty. The vinext augmentation remains intact.
- `Test-Path tsconfig.tsbuildinfo`: False. No build-info deletion was needed.
- Removed only the temporary focused TypeScript configuration. No user files or generated browser artifacts were deleted.

### Remaining limits / handoff

- No live Firebase/Vercel mutation, Storage rules, CORS, lifecycle policy, account creation, credential reading, push or deployment was performed. No subagent or reviewer was spawned.
- The local Firebase environment is not configured, so **signed-in live-browser behavior remains unverified**. The prior controller smoke compiled the three routes at 390px, but this continuation did not rerun a browser/dev server (avoiding interference with type artifacts). Auth/upload/data integration is verified with controlled local boundaries; the controller can perform its next browser smoke after this worker commits.
- Storage pending-object lifecycle cleanup remains Task 9. Abort cannot guarantee server rollback after a request has already been accepted; previous server compensation tests remain green.
- The previously documented timestamp-ordering parser finding remains unchanged.
- Task 7 can directly reuse section-based list/form/detail with callbacks; optional guest order locking includes the locked option even when no member order array is supplied. Member navigation is not forced on inline guest content.
