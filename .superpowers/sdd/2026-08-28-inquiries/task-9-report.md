# Task 9 report — Firebase inquiry boundary artifacts

## Status

Implemented local Firebase denial rules, query indexes, Storage CORS/lifecycle templates, emulator/config tests, and documentation. No Firebase, GCP, Vercel, bucket, environment, credential, deploy, or browser action was performed.

## Changes

- Added explicit Firestore denial for `inquiries/{inquiryId}` and explicit Storage denial for `inquiryPending/**` and `inquiries/**`.
- Added emulator regression coverage for unauthenticated users, members, other members, and browser admins attempting direct inquiry document and image reads/lists/writes/deletes.
- Added all repository query shapes: member and guest owner bases with none/status/category/both filters, plus admin status/category/both filters, all ordered by `createdAt DESC`; all are collection-scope `inquiries` indexes.
- Pointed `firebase.json` to `firestore.indexes.json` and preserved existing rules/emulator configuration.
- Added official gcloud-shaped `storage.cors.json` and a lifecycle rule that deletes only `inquiryPending/` objects older than one day.
- Added `tests/firebase-config.test.ts`, which checks index/query semantics, Firebase wiring, CORS shape, and lifecycle target safety without asserting a fixed index count or raw source text.
- Documented server/client environment names, signed upload/finalization/read flow, safe missing configuration behavior, local-only emulator verification, and approved future deployment with inspect/merge warnings.
- Added placeholder-only `FIREBASE_STORAGE_BUCKET` and `INQUIRY_TOKEN_SECRET` names to `.env.example` so copied local configuration does not omit required server settings; no secret values are included.

## Verification

| Check | Result |
| --- | --- |
| TDD RED: `pnpm test -- tests/firebase-config.test.ts` before artifacts | Expected failure: 4 tests failed because index/CORS/lifecycle files were absent and `firebase.json` lacked the index pointer. |
| Focused config/rules tests: `node ./node_modules/vitest/vitest.mjs run firestore.rules.test.ts storage.rules.test.ts tests/firebase-config.test.ts --maxWorkers=1 --no-file-parallelism` | 1 file passed; 2 rules files skipped because no emulator endpoint was configured; 4 config tests passed, 33 emulator tests skipped. |
| Non-emulator repository/config tests: `node ./node_modules/vitest/vitest.mjs run tests/firebase-config.test.ts lib/firebase/inquiries.test.ts --maxWorkers=1 --no-file-parallelism` | 2 files passed; 19 tests passed. |
| Focused ESLint via `node_modules/.bin/eslint.cmd` | Exit 0; no diagnostics. `pnpm exec eslint` could not resolve the local shim in this environment. |
| Changed-files TypeScript via `node_modules/.bin/tsc.cmd --noEmit --module esnext --moduleResolution bundler --target es2022 --lib es2022,dom --types vitest/globals,node --skipLibCheck ...` | Exit 0. |
| Full-project `tsc --noEmit` | Not a clean repository gate: existing unrelated test typing errors (Vitest globals, cart type fixtures, CSS test types, and implicit-any cases) were reported. |
| JSON parse (`firebase.json`, `firestore.indexes.json`, `storage.cors.json`, `storage.lifecycle.json`) | 4 files parsed successfully. |
| `git diff --check` | Exit 0 (only Git autocrlf notices). |

## Emulator and external boundary

Read-only availability detection found `java`, `firebase`, and `gcloud` missing from PATH. Cached Firestore v1.22.0 and Storage rules v1.1.3 JARs exist, but JARs alone are not a runnable Java/Firebase CLI installation. Therefore emulator tests were skipped, not reported as passed. No live project or bucket was inspected or changed.

The README links the primary schema/command references: [Firestore index definition reference](https://firebase.google.com/docs/reference/firestore/indexes), [Cloud Storage CORS configuration](https://docs.cloud.google.com/storage/docs/cors-configurations), and [Cloud Storage lifecycle management](https://docs.cloud.google.com/storage/docs/managing-lifecycles).
