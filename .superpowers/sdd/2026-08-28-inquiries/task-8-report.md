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
