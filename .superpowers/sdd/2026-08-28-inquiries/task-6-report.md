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
