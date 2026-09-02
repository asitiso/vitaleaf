# Inquiry Task 5 report — private direct image uploads

## Outcome

- Browsers receive a five-minute V4 signed PUT URL and upload JPG, PNG, or WebP bytes directly to the private Firebase Storage bucket. File bytes never cross the inquiry Vercel route.
- Pending paths are `inquiryPending/{subjectHash}/{uploadId}`. The subject hash is HMAC-SHA256 and the random path segments match the existing receipt path contract; UID, order number, phone, token, and client filename are absent from paths and logs.
- Ten-minute HMAC receipts bind the exact verified subject, pending path, canonical content type, and declared size.
- Inquiry creation verifies every receipt, rejects duplicate receipts and paths, compares Storage size and content type exactly, pins subsequent operations to the inspected Storage generation, downloads only the 3/8/12 signature bytes required for the declared image type, and moves accepted objects to `inquiries/{inquiryId}/{uploadId}` before repository creation.
- Inquiry detail checks member/guest ownership before issuing five-minute V4 signed GET URLs. Public JSON contains `readUrl` but never `storagePath`.

## TDD evidence

The implementation followed small RED/GREEN cycles:

1. File policy RED: the new test initially failed because `lib/inquiries/uploads.ts` did not exist. GREEN: 15 file-policy tests passed.
2. Admin Storage RED: `getAdminStorageBucket` was absent. GREEN: the configured server app and required bucket were selected.
3. Storage adapter RED: the adapter module was absent; later focused RED tests exposed missing deletion for executable bytes, signed PUT issuance before strong-secret validation, failure to clean the current move destination, and a generation-unpinned metadata-to-move race. GREEN: adapter compensation, signing-order, and generation-pinning tests passed.
4. Upload URL route RED: the route was absent. GREEN: member/guest, malformed input, invalid authentication, configuration, generic failure, and exact response-shape tests passed.
5. Create route RED: verified receipts were still rejected, repository failure did not compensate finalized objects, and Storage configuration was not mapped. A separate RED caught the zero-receipt error path calling the cleanup adapter. GREEN: all create-route cases passed.
6. Detail route RED: authorized attachments still had `readUrl: null` and signing configuration errors returned success. GREEN: ownership-before-signing, authorized HTTPS reads, private-field exclusion, and safe signing failures passed.
7. Independent security review found the previous 512-character create-input bound could reject a valid receipt for a maximum-length multibyte Firebase UID. A real-receipt RED test reproduced the failure; the bounded parser limit is now 2,048 characters and still rejects oversized input.

Fresh verification before the final commit:

- Broader inquiry Task 1–5 regression: 14 files, 273 tests passed.
- Focused ESLint for every changed TypeScript file: passed.
- Focused strict TypeScript for every changed TypeScript file and test: passed.
- `git diff --check`: passed.

The repository-wide TypeScript command was also sampled, but unrelated pre-existing test-global and legacy-fixture errors make it unsuitable as this task's focused gate; no Task 5 error remained in the focused strict run.

## Cleanup semantics

- Invalid verified pending objects are deleted immediately. Missing-object deletion is idempotent.
- Before Storage access, all receipts are verified for subject, expiry, token uniqueness, and path uniqueness.
- A move failure deletes the current pending object and attempts deletion of every possible final destination from that attempt, including destinations whose remote move may have completed before a client-visible failure.
- If repository creation fails after finalization, the create route deletes every finalized object before returning failure.
- A zero-receipt inquiry neither resolves the upload secret nor touches Storage.
- Cleanup failures remain server failures; the code does not weaken validation or pretend that compensation succeeded.

## Design choices

- Original filenames are neither trusted nor preserved. Attachments use deterministic labels such as `첨부 이미지 1.jpg`, reducing receipt/header surface without losing meaningful customer value.
- List serialization remains unchanged with `readUrl: null`; only an already-authorized detail request incurs signed GET generation.
- Storage operations are dependency-injectable and tested without Firebase credentials or network access.
- Signed URLs are required to be HTTPS and are never logged.

## Deferred external work

- Firebase Storage rules, CORS, and `inquiryPending/` lifecycle policy remain Task 9/final external-gate work.
- No live Firebase/Vercel configuration, deployment, rules, CORS, lifecycle, or push operation was performed.

## Changed files

- `lib/firebase/admin.ts`
- `lib/firebase/admin.storage.test.ts`
- `lib/firebase/inquiry-uploads.ts`
- `lib/firebase/inquiry-uploads.test.ts`
- `lib/inquiries/uploads.ts`
- `lib/inquiries/uploads.test.ts`
- `lib/inquiries/validation.ts`
- `lib/inquiries/validation.test.ts`
- `app/api/inquiries/upload-url/route.ts`
- `app/api/inquiries/upload-url/route.test.ts`
- `app/api/inquiries/route.ts`
- `app/api/inquiries/route.test.ts`
- `app/api/inquiries/detail/route.ts`
- `app/api/inquiries/detail/route.test.ts`
- `.superpowers/sdd/2026-08-28-inquiries/task-5-report.md`
