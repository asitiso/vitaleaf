# Task 8 implementation report

## Outcome

Implemented authenticated administrator count/list/detail/reply/delete APIs, one strict typed client, and one isolated dashboard inquiry panel. The panel owns filters, cursor pagination, detail, reply draft/state, accessible deletion, and stale-response cancellation. The dashboard loads count only after authorization and retains the existing product/draft subscriptions and authorizationGeneration.

The only shared boundaries were the approved parseInquiryReplyInput export, the approved public response-parser export, and 204 support in the existing POST transport. Guest/member transport and repository schema were not duplicated or redesigned.

## TDD evidence

Server/validation RED:

- Command: node_modules/.bin/vitest.cmd run app/api/admin/inquiries lib/inquiries/reply-validation.test.ts --reporter=dot
- Missing route modules were observed first. With 501 stubs, 61 tests failed and 6 passed for unimplemented behavior.
- Reply input parser was separately observed failing 7/7 because parseInquiryReplyInput did not exist.

Server/validation GREEN:

- Same command: 4 files passed, 67 tests passed.
- Coverage: 401/403/admin; authorization before repository/Storage; safe 503/500; count-only; filters/cursor/page bound; detail image signing/privacy; server UID/time/status reply; 1-3000 Unicode multiline validation; missing/repeated delete; image-first order; Storage preservation; repository retry.

Admin client RED/GREEN:

- RED command: node_modules/.bin/vitest.cmd run lib/inquiries/admin-client.test.ts --reporter=dot
- RED: 1 suite failed because the typed module did not exist.
- GREEN command: node_modules/.bin/vitest.cmd run lib/inquiries/admin-client.test.ts lib/inquiries/client.test.ts --reporter=dot
- GREEN: 2 files passed, 48 tests passed.
- Covered fresh bearer tokens, POST-only bodies, AbortSignal, exact envelopes/counts/public fields, safe Korean errors, sanitized token/network errors, reply/delete bodies, and exact 204.

Inquiry panel RED/GREEN:

- RED command: node_modules/.bin/vitest.cmd run components/admin/inquiry-panel.test.tsx --reporter=dot
- RED: missing module; after initial implementation, 2/7 failed and revealed a matcher/fixture sequencing issue.
- GREEN: 1 file, 7 tests. Later correction tests caught badge-refresh failure being confused with reply failure and malformed response IDs being accepted: 2 failed, 26 passed; fixes produced 2 files, 28 passing tests.
- A final detail-refresh test then failed 1 of 8 panel tests until successful replies also refreshed authorized signed-image detail; the panel finished at 8/8.

Dashboard RED/GREEN:

- RED command: node_modules/.bin/vitest.cmd run components/admin/admin-dashboard.test.tsx --reporter=dot
- RED: 3 failed, 39 passed because tab/badge/panel were absent.
- GREEN command: node_modules/.bin/vitest.cmd run components/admin/admin-dashboard.test.tsx components/admin/inquiry-panel.test.tsx --reporter=dot
- GREEN: 2 files, 49 tests. Covered badge, Arrow/Home/End roving tabs, correct tabpanel semantics, unchanged subscription counts, and generation/auth cancellation.

## Final verification

All commands used PATH prefix C:/Users/우/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin.

Regression command:

node_modules/.bin/vitest.cmd run app/api/admin/inquiries components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.test.ts lib/inquiries/client.test.ts lib/inquiries/validation.test.ts lib/inquiries/reply-validation.test.ts lib/inquiries/server.test.ts lib/firebase/admin-auth.test.ts lib/firebase/inquiries.test.ts lib/firebase/inquiry-uploads.test.ts lib/firebase/admin.storage.test.ts --reporter=dot

Result: 14 files passed, 268 tests passed, zero failures.

Focused ESLint command:

node_modules/.bin/eslint.cmd app/api/admin/inquiries lib/inquiries/admin-client.ts lib/inquiries/admin-client.test.ts lib/inquiries/client.ts lib/inquiries/validation.ts lib/inquiries/reply-validation.test.ts components/admin/inquiry-panel.tsx components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.tsx components/admin/admin-dashboard.test.tsx tests/admin-inquiry-harness.ts

Result: exit 0, no warnings/errors.

Isolated strict TypeScript command:

node_modules/.bin/tsc.cmd --project tsconfig.task8.json --pretty false

Result: exit 0. Temporary config extended the repository config, disabled incremental output, included Vitest and Testing Library globals, and was removed. No build info was generated; next-env.d.ts remained unchanged.

Diff commands: git diff --check; git status --short; rg --files -g '*.tsbuildinfo' -g 'tsconfig.task8.json'; git diff -- next-env.d.ts.

Result before report/commit: no whitespace errors, no temporary config/build info, and no next-env.d.ts diff.

## Limits

- Browser was not run because the brief records the URL-policy blocker and prohibits workarounds.
- No live Firebase/Storage data, cloud configuration, account, credential, push, deploy, or production action.
- No full repository build/full-suite run was required by this focused Task 8 gate. Task 8 plus client/validation/server/auth/repository/Storage regressions ran.
- Responsive/focus behavior has CSS and component-test coverage; authenticated real-device visual verification remains for the later authorized end-to-end task.

## Review fix round 1

Review findings addressed:

- Detail and reply clients now reject an otherwise-valid response when its inquiry ID differs from the requested ID.
- Reply mutations use an explicit generation, AbortController, and selected-ID guard. Selecting another inquiry, changing filters, or unmounting/auth-generation replacement invalidates the mutation; a server-side completion can occur, but its stale result cannot update detail, draft, list refresh, or count refresh.
- Delete confirmation now focuses Cancel first, contains forward/reverse Tab focus, blocks keyboard events focused outside the modal, cancels on Escape, and restores focus to the invoking Delete button.
- List/detail retry buttons have a 44px minimum target.
- The exact 1:1 inquiry tab name remains unchanged while the pending count is exposed through its accessible description.

Fix RED command:

node_modules/.bin/vitest.cmd run lib/inquiries/admin-client.test.ts components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx --reporter=dot

RED result: 3 files failed; 5 tests failed and 69 passed. Each failure matched one review boundary: requested-ID binding, selection stale reply, filter stale reply, keyboard modal, and badge description.

Fix GREEN command:

node_modules/.bin/vitest.cmd run lib/inquiries/admin-client.test.ts components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx --reporter=dot

GREEN result: 3 files passed, 74 tests passed, no warnings.

Modal edge RED/GREEN: the strengthened outside-focus Escape assertion first failed 1 of 11 panel tests; the busy-safe document capture cancellation then passed 11/11.

Final fix regression command:

node_modules/.bin/vitest.cmd run app/api/admin/inquiries components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.test.ts lib/inquiries/client.test.ts lib/inquiries/validation.test.ts lib/inquiries/reply-validation.test.ts lib/inquiries/server.test.ts lib/firebase/admin-auth.test.ts lib/firebase/inquiries.test.ts lib/firebase/inquiry-uploads.test.ts lib/firebase/admin.storage.test.ts --reporter=dot

Result: 14 files passed, 272 tests passed, zero failures.

Fix ESLint:

node_modules/.bin/eslint.cmd components/admin/inquiry-panel.tsx components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.ts lib/inquiries/admin-client.test.ts

Result: exit 0, no warnings or errors.

Fix isolated strict TypeScript:

node_modules/.bin/tsc.cmd --project tsconfig.task8-fix.json --pretty false

Result: exit 0. The temporary non-incremental config with Vitest/Testing Library globals was removed afterward.

## Review fix round 2

The duplicate reply-submit path is closed with a mutation invariant independent of React display state. While a reply request is active, the reply textarea and Save button remain disabled, selecting the already-open inquiry does not reset the saving state, and the in-flight guard rejects any repeated invocation. The guard is released only by that request settling or by the existing selection/filter/auth/unmount invalidation boundary. After selecting a different inquiry, the stale request remains ignored and the newly selected inquiry can start its own reply request.

Fix 2 RED command:

node_modules/.bin/vitest.cmd run components/admin/inquiry-panel.test.tsx --reporter=dot

RED result: 1 test failed and 11 passed because the reply textarea remained enabled while the controlled reply promise was pending.

Fix 2 GREEN command:

node_modules/.bin/vitest.cmd run components/admin/inquiry-panel.test.tsx --reporter=dot

GREEN result: 1 file passed, 12 tests passed. The controlled-promise regression verifies attempted editing, same-inquiry reselection, and repeated Save produce exactly one reply request while the UI remains visibly saving; both controls return after settlement. The selection-change regression also verifies that a new inquiry can save after the prior request is invalidated.

Focused interaction/client command:

node_modules/.bin/vitest.cmd run components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.test.ts --reporter=dot

Result: 3 files passed, 75 tests passed.

Fix 2 regression command:

node_modules/.bin/vitest.cmd run app/api/admin/inquiries components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.test.ts lib/inquiries/client.test.ts lib/inquiries/validation.test.ts lib/inquiries/reply-validation.test.ts lib/inquiries/server.test.ts lib/firebase/admin-auth.test.ts lib/firebase/inquiries.test.ts lib/firebase/inquiry-uploads.test.ts lib/firebase/admin.storage.test.ts --reporter=dot

Result: 14 files passed, 273 tests passed, zero failures.

Fix 2 ESLint:

node_modules/.bin/eslint.cmd components/admin/inquiry-panel.tsx components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.ts lib/inquiries/admin-client.test.ts

Result: exit 0, no warnings or errors.

Fix 2 isolated strict TypeScript:

node_modules/.bin/tsc.cmd --project tsconfig.task8-fix2.json --pretty false

Result: exit 0. The temporary non-incremental config used Vitest/Testing Library globals and was removed afterward. Browser, cloud, account, credential, push, and deploy actions remained outside this fix round, consistent with the Task 8 limits.

## Review fix round 3

Reply and delete mutations are now serialized. The root cause was that Delete remained enabled during a reply save, and both mutations shared the same controller/generation; starting delete replaced the reply mutation while leaving the retained inquiry in a saving/in-flight state if delete failed. During the full reply-save interval, the Delete trigger and any pre-existing delete-confirm action are disabled, while both open and confirm handlers independently reject a disabled-attribute bypass through the in-flight ref. Once the reply settles, Delete becomes available again. Existing selection/filter/auth invalidation behavior remains unchanged.

Fix 3 RED command:

node_modules/.bin/vitest.cmd run components/admin/inquiry-panel.test.tsx --reporter=dot

RED result: 2 tests failed and 12 passed. The Delete trigger remained enabled during a controlled pending reply, and a programmatic confirmation invoked delete once and displaced the reply mutation. After changing the immediate delete mock to a controlled promise to remove unrelated React timing warnings, the same two failures reproduced with clean output.

Fix 3 GREEN command:

node_modules/.bin/vitest.cmd run components/admin/inquiry-panel.test.tsx --reporter=dot

GREEN result: 1 file passed, 14 tests passed. The tests cover the visible disabled interval, disabled-attribute bypasses at both dialog-open and confirm handlers, preservation of the active reply signal/request, post-settlement Delete restoration, and the existing selection-change behavior.

Fix 3 focused interaction/client command:

node_modules/.bin/vitest.cmd run components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.test.ts --reporter=dot

Result: 3 files passed, 77 tests passed.

Fix 3 regression command:

node_modules/.bin/vitest.cmd run app/api/admin/inquiries components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.test.ts lib/inquiries/client.test.ts lib/inquiries/validation.test.ts lib/inquiries/reply-validation.test.ts lib/inquiries/server.test.ts lib/firebase/admin-auth.test.ts lib/firebase/inquiries.test.ts lib/firebase/inquiry-uploads.test.ts lib/firebase/admin.storage.test.ts --reporter=dot

Result: 14 files passed, 275 tests passed, zero failures.

Fix 3 ESLint:

node_modules/.bin/eslint.cmd components/admin/inquiry-panel.tsx components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.tsx components/admin/admin-dashboard.test.tsx lib/inquiries/admin-client.ts lib/inquiries/admin-client.test.ts

Result: exit 0, no warnings or errors.

Fix 3 isolated strict TypeScript:

node_modules/.bin/tsc.cmd --project tsconfig.task8-fix3.json --pretty false

Result: exit 0. The temporary non-incremental config used Vitest/Testing Library globals and was removed afterward. No browser, cloud, account, credential, push, or deploy action was performed.
