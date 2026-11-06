# Site Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the reproducible storefront review failure, accessibility violations, and missing favicon, then deploy the verified branch to Vercel production.

**Architecture:** Preserve the existing Firebase/Next.js design. Add the exact Firestore composite index required by the live review query, correct only the failing semantic/CSS surfaces, and supply a Next.js app icon. Verify each change locally, deploy indexes before the app, then exercise the production user and administrator flows.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Firebase Auth/Firestore, Vercel, agent-browser/axe-core

**Spec:** `dogfood-output/report.md`

## Global Constraints

- Keep the existing Firebase project `todaysell-d4bbc` and Vercel project `asitiso/vitaleaf`.
- Do not change product, order, member, or inquiry data except for clearly labeled test transactions.
- Prefer fixes with a clear user benefit and low maintenance burden.
- Preserve the existing public URLs and shopping flow.

## Review Focus

- Review queries must load approved reviews without `FAILED_PRECONDITION`.
- Empty review collections must render the normal empty state, not an error.
- Mobile product-card supporting text must meet WCAG 2 AA contrast.
- Loading states must expose valid landmarks and live regions.
- `/favicon.ico` or the generated app icon route must return success.

---

### Task 1: Firestore Review Query Index

**Files:**
- Modify: `tests/firebase-config.test.ts`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: the review query emitted by `getServerApprovedReviews(productId)` and `getApprovedReviews(productId)`.
- Produces: a `reviews` collection composite index on `approved ASC`, `productId ASC`, `createdAt DESC`.

- [x] **Step 1: Add a failing configuration-contract test**

Add a test that parses `firestore.indexes.json` and requires the exact review query index.

- [x] **Step 2: Run the focused test and verify failure**

Run: `pnpm test tests/firebase-config.test.ts`
Expected: FAIL because no `reviews` composite index exists.

- [x] **Step 3: Add the minimal index definition**

Add one `COLLECTION` composite index for `reviews` using the field order returned by Firestore's live error.

- [x] **Step 4: Run the focused test and verify success**

Run: `pnpm test tests/firebase-config.test.ts`
Expected: PASS.

### Task 2: Accessibility and Browser Metadata

**Files:**
- Modify: `components/admin/admin-dashboard.test.tsx`
- Modify: `app/admin/products/preview/[draftId]/draft-preview.test.tsx`
- Modify: `components/admin/admin-dashboard.tsx`
- Modify: `app/admin/products/preview/[draftId]/draft-preview.tsx`
- Modify: `app/globals.css`
- Create: `app/icon.svg`

**Interfaces:**
- Consumes: existing admin loading states and product-card CSS classes.
- Produces: valid `<main>` landmarks with nested status regions, WCAG-compliant supporting text colors, and a Next.js-generated site icon.

- [x] **Step 1: Add failing admin semantics assertions**

Require the `role=status` node to be nested inside, rather than applied to, the `main` landmark.

- [x] **Step 2: Run focused component tests and verify failure**

Run: `pnpm test components/admin/admin-dashboard.test.tsx app/admin/products/preview/[draftId]/draft-preview.test.tsx`
Expected: FAIL because the current status node is `MAIN`.

- [x] **Step 3: Implement minimal semantic, contrast, and icon fixes**

Move `role=status` to a child paragraph, darken only the three failing supporting-text colors, and add `app/icon.svg`.

- [x] **Step 4: Run focused component tests and local browser audits**

Expected: component tests PASS; axe reports no targeted contrast violation; icon request returns 200.

### Task 3: Full Verification and Deployment

**Files:**
- Update: `dogfood-output/report.md`
- Update: `docs/superpowers/plans/2026-11-06-site-audit-fixes.md`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: pushed Git commit, deployed Firestore index, Ready Vercel production deployment, and verified customer/admin flows.

- [x] **Step 1: Run full tests, lint, and production build**

Run: `pnpm test`, `pnpm lint`, `pnpm build:vercel`.

- [x] **Step 2: Deploy Firestore indexes and wait for readiness**

Run: `firebase deploy --only firestore:indexes --project todaysell-d4bbc`.

- [x] **Step 3: Commit and push the branch**

Commit only the fixes, tests, plan, and audit report; push `feat/member-account-orders`.

- [ ] **Step 4: Deploy/promote to Vercel production**

Deploy the verified commit to `asitiso/vitaleaf` and confirm `https://vitaleaf.vercel.app` points to a Ready production deployment.

- [ ] **Step 5: Re-run production smoke tests**

Verify review empty/success state, mobile navigation, cart/checkout, test order visibility, administrator orders/inquiries, favicon, axe results, and error logs.
