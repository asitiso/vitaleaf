# Inquiry Task 4 fix round 1 report

## Result

- A present `x-inquiry-access` header now always selects guest authentication. Empty or invalid guest values fail with 401 and cannot fall back to a valid member bearer token.
- Browser success parsing now requires exact keys on the guest-verification wrapper, public order, order line, list/detail wrappers, inquiry, and attachment. Extra private or unknown fields fail with the generic client error.
- `InquiryAttachmentPublic.readUrl` still accepts `null` and future HTTPS URLs while rejecting unsafe schemes.
- `verifyBearerMember` preserves `FirebaseAdminConfigurationError`; inquiry subject resolution maps it to `InquiryConfigurationError`, so create/list/detail routes return their existing safe 503 response. Invalid bearer tokens remain 401.
- Route-level regressions exercise the real inquiry subject resolver with only the external bearer verification and repository boundaries mocked.

## Verification

- Focused changed-file tests: 4 files, 37 tests passed.
- Task 4 inquiry plus admin-auth/member-order/guest regressions: 23 files, 346 tests passed.
- Focused ESLint on the seven changed source/test files: passed.
- Focused strict TypeScript check on the seven changed source/test files with project path aliases and Vitest globals: passed.
- `git diff --check`: passed.
- `tsconfig.tsbuildinfo`: absent.

The repository-wide TypeScript check remains outside this fix: the existing project configuration includes unrelated legacy tests without Vitest globals and stale cart fixtures, so it reports pre-existing errors outside the changed files.

## Deferred

- Timestamp ordering validation remains the previously identified Minor and is intentionally deferred from this fix.
