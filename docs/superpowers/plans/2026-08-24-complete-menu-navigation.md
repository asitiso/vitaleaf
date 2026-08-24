# Complete Menu Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every visible storefront menu and shortcut navigate reliably to a useful destination on desktop and mobile.

**Architecture:** Extend the existing shared storefront navigation registry rather than creating a second menu system. Validate every registered destination against the App Router and product-query parser, then test sample-catalog reachability and use native document navigation inside removable menus.

**Tech Stack:** TypeScript, React 19, Vinext App Router, Vitest, Testing Library, Firebase Firestore, OpenAI Sites.

**Spec:** `docs/superpowers/specs/2026-08-24-complete-menu-navigation.md`

## Global Constraints

- Preserve the existing visual design, Firebase data model, local cart behavior, and owner-only Site access.
- Prefer changes that remove user confusion and reduce future navigation maintenance.
- Write and observe a failing test before each production behavior change.
- Do not add new dependencies.

---

### Task 1: Complete the public destination contract

**Files:**
- Modify: `lib/navigation/storefront-menu.ts`
- Modify: `app/page.tsx`
- Modify: `components/shell/site-header.tsx`
- Modify: `app/storefront-route-contract.test.ts`

**Interfaces:**
- Consumes: `STOREFRONT_MENU`, `parseProductQuery`, `resolveMenuState`, `SAMPLE_PRODUCTS`
- Produces: shared `STOREFRONT_MENU.utility`, `STOREFRONT_MENU.promotions`, and `STOREFRONT_MENU.flows` destinations included by `flattenMenuLinks`

- [ ] **Step 1: Write the failing route-contract test**

Add literal expectations for `/`, `/admin`, `/cart`, `/checkout`, `/products`, `/products?stock=1`, `/products?promotion=trial`, `/products?view=ingredients`, `/products?sort=newest`, and `/products?q=오메가-3`, and require every filter-style menu destination to yield at least one `SAMPLE_PRODUCTS` result after applying its route state.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- app/storefront-route-contract.test.ts`

Expected: FAIL because the direct destinations are absent from `flattenMenuLinks` and the search punctuation variant is not matched.

- [ ] **Step 3: Implement the minimal shared destination registry**

Add utility, promotion, and flow items to `STOREFRONT_MENU`; reuse their `href` values in the header and home page; keep labels and page copy unchanged.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `npm test -- app/storefront-route-contract.test.ts`

Expected: PASS with every registered URL mapped to a supported route and useful sample result.

### Task 2: Make removable-menu navigation reliable

**Files:**
- Modify: `components/shell/mega-menu.test.tsx`
- Modify: `components/shell/mega-menu.tsx`
- Modify: `components/shell/site-header.test.tsx`

**Interfaces:**
- Consumes: shared storefront menu destinations
- Produces: native anchor navigation for desktop dropdown and mobile drawer destinations that unmount on selection

- [ ] **Step 1: Write the failing menu behavior test**

Assert that a representative desktop mega-menu destination, like the mobile drawer destination, is not client navigation because the menu closes during selection.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- components/shell/mega-menu.test.tsx`

Expected: FAIL because desktop mega-menu links currently use `next/link`.

- [ ] **Step 3: Implement document navigation for the removable menu**

Render menu destinations as ordinary anchors for both dropdown and drawer variants and preserve the close callback and accessible structure.

- [ ] **Step 4: Run focused shell tests to verify GREEN**

Run: `npm test -- components/shell/mega-menu.test.tsx components/shell/site-header.test.tsx`

Expected: PASS.

### Task 3: Support equivalent ingredient search spellings

**Files:**
- Modify: `lib/products/filter-products.test.ts`
- Modify: `lib/products/filter-products.ts`

**Interfaces:**
- Consumes: `ProductFilters.query`
- Produces: punctuation-insensitive Korean product search while retaining existing category and concern matching

- [ ] **Step 1: Write the failing search test**

Assert that `오메가-3` finds a product whose searchable product text contains `오메가3`.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `npm test -- lib/products/filter-products.test.ts`

Expected: FAIL with zero matches.

- [ ] **Step 3: Implement minimal search normalization**

Normalize whitespace and common hyphen characters only for free-text search comparison; leave taxonomy normalization unchanged.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `npm test -- lib/products/filter-products.test.ts app/storefront-route-contract.test.ts`

Expected: PASS.

### Task 4: Verify, publish, and hand off

**Files:**
- Verify only: entire project

**Interfaces:**
- Consumes: completed Tasks 1–3
- Produces: validated private deployment on the existing VITALEAF Site

- [ ] **Step 1: Run all automated checks**

Run: `npm test`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit successfully.

- [ ] **Step 2: Run the approved browser click matrix**

Verify desktop and mobile navigation for search, top menu, mega-menu category, age, promotion, footer, product detail, cart, checkout guard, and admin entry. Confirm meaningful page content, no error overlay, and no horizontal overflow on mobile.

- [ ] **Step 3: Commit and publish the validated source**

Commit only the files in this plan, package the successful build, save one Site version, deploy it with the existing owner-only policy, and open the deployed URL in the retained Site tab.

