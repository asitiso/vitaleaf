# VITALEAF Product Options, Cart, and Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sealed-duration purchase options with signed price adjustments and per-option stock, then carry the selected option safely through product cards, detail, cart, and authoritative member/guest orders.

**Architecture:** Normalize every product to at least one purchase option while preserving option-less Firestore documents. Key cart lines by product and option, keep cart snapshots for display, and recalculate price/stock from Firestore on the server before order creation. Keep the existing product wizard and checkout layout, adding focused components instead of expanding already large files further.

**Tech Stack:** Next.js 16, React 19, Firebase Firestore/Admin, Vitest, Testing Library, TypeScript

**Spec:** `docs/superpowers/specs/2026-08-28-auth-product-options-inquiries-design.md`

## Global Constraints

- A purchase option is a manufacturer-sealed sellable package, never an opened or divided bottle.
- Final price is `product.price + option.priceAdjustment` and must be at least 1 KRW.
- `priceAdjustment` accepts negative and positive integer KRW values.
- Stock is authoritative per option; top-level product stock is only a synchronized compatibility total.
- Exactly one active option is the default.
- Products without options normalize to one implicit `default` option using base price and legacy stock.
- Same product and same option trigger the keep/add dialog; different options create separate lines.
- Server data, not browser cart snapshots, determines order price and availability.
- Implement by TDD and commit after each independently reviewable task.

---

### Task 1: Define and normalize purchase options

**Files:**
- Modify: `lib/products/types.ts`
- Create: `lib/products/purchase-options.ts`
- Create: `lib/products/purchase-options.test.ts`
- Modify: `lib/products/normalize.ts`
- Modify: `lib/products/normalize.test.ts`

**Interfaces:**
- Produces: `PurchaseOption`, `LEGACY_PURCHASE_OPTION_ID`, `normalizePurchaseOptions`, `getPurchaseOptionPrice`, `getDefaultPurchaseOption`, `getProductDisplayPrice`, and `getProductAvailableStock`.
- Later tasks consume `Product.purchaseOptions?: PurchaseOption[]` through helpers that always return a concrete normalized array. Keeping the source field optional preserves existing fixtures and legacy callers.

- [ ] **Step 1: Add failing domain tests**

```ts
expect(normalizePurchaseOptions(undefined, 24_900, 8)).toEqual([{
  id: "default", label: "기본 구성", sku: "", durationMonths: null,
  priceAdjustment: 0, stock: 8, active: true, isDefault: true,
}]);
expect(getPurchaseOptionPrice(80_000, option({ priceAdjustment: -35_000 }))).toBe(45_000);
expect(getProductDisplayPrice(productWith45kAnd80kOptions)).toEqual({ price: 45_000, varies: true });
expect(getProductAvailableStock(productWithStocks12And20)).toBe(32);
```

Also test rejection/normalization of duplicate IDs, duplicate SKU values, fractional adjustments, negative stock, no active default, and final price below 1 KRW.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
pnpm test -- lib/products/purchase-options.test.ts lib/products/normalize.test.ts
```

- [ ] **Step 3: Add the canonical types and helpers**

```ts
export type PurchaseOption = {
  id: string;
  label: string;
  durationMonths: number | null;
  sku: string;
  priceAdjustment: number;
  stock: number;
  active: boolean;
  isDefault: boolean;
};

export const LEGACY_PURCHASE_OPTION_ID = "default";
export const getPurchaseOptionPrice = (basePrice: number, option: PurchaseOption) =>
  basePrice + option.priceAdjustment;
```

Add optional `purchaseOptions` to `Product` and `ProductInput`; `normalizeProduct` writes a concrete normalized array for Firestore reads. Callers must use `normalizePurchaseOptions`/selection helpers rather than assuming the optional source field exists. Derive top-level `stock` from active options when real options exist.

- [ ] **Step 4: Run focused tests and lint**

```powershell
pnpm test -- lib/products/purchase-options.test.ts lib/products/normalize.test.ts lib/firebase/products.test.ts lib/firebase/products.firestore.test.ts
pnpm exec eslint lib/products/types.ts lib/products/purchase-options.ts lib/products/normalize.ts
```

- [ ] **Step 5: Commit the option domain model**

```powershell
git add lib/products/types.ts lib/products/purchase-options.ts lib/products/purchase-options.test.ts lib/products/normalize.ts lib/products/normalize.test.ts
git commit -m "feat: normalize product purchase options"
```

### Task 2: Preserve options in drafts, CSV, and mock products

**Files:**
- Modify: `lib/products/draft.ts`
- Modify: `lib/products/draft.test.ts`
- Modify: `lib/products/sample-products.ts`
- Modify: `lib/csv/products-csv.ts`
- Modify: `lib/csv/products-csv.test.ts`
- Modify: `public/products-template.csv`
- Modify: `components/admin/admin-dashboard.tsx`

**Interfaces:**
- Consumes: `PurchaseOption[]` and validation helpers from Task 1.
- Produces: drafts and CSV round trips that never drop `purchaseOptions`.

- [ ] **Step 1: Write failing draft and CSV preservation tests**

```ts
expect(toPublishedProductInput(draftWithOptions).purchaseOptions).toEqual(draftWithOptions.purchaseOptions);
expect(validatePublishableDraft(draftWithNoActiveDefault)).toContainEqual(
  expect.objectContaining({ field: "purchaseOptions", step: 4 }),
);
expect(parseProductCsv(serializeProducts([productWithOptions])).valid[0].purchaseOptions)
  .toEqual(productWithOptions.purchaseOptions);
```

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- lib/products/draft.test.ts lib/csv/products-csv.test.ts
```

- [ ] **Step 3: Persist the option array and make CSV lossless**

Add `purchaseOptions` to `toPublishedProductInput`, `blankDraft`, and `toInput`. Add a `purchaseOptionsJson` CSV column containing a JSON array; parse it through the same domain normalizer and return a row-level error for malformed JSON instead of silently dropping options.

```ts
const purchaseOptionsJson = JSON.stringify(product.purchaseOptions);
const purchaseOptions = normalizePurchaseOptions(
  JSON.parse(row.purchaseOptionsJson || "[]"),
  price,
  stock,
);
```

- [ ] **Step 4: Add sealed 2/4-month options to sample products**

Use deterministic IDs and two price patterns:

```ts
purchaseOptions: [
  { id: "2-month", label: "2개월분", durationMonths: 2, sku: "SAMPLE-2M", priceAdjustment: -12_450, stock: 18, active: true, isDefault: false },
  { id: "4-month", label: "4개월분", durationMonths: 4, sku: "SAMPLE-4M", priceAdjustment: 0, stock: 30, active: true, isDefault: true },
]
```

At least one sample must price the 2-month option above exact half to cover the merchant requirement.

- [ ] **Step 5: Run preservation tests and commit**

```powershell
pnpm test -- lib/products/draft.test.ts lib/csv/products-csv.test.ts lib/products/normalize.test.ts
git add lib/products/draft.ts lib/products/draft.test.ts lib/products/sample-products.ts lib/csv/products-csv.ts lib/csv/products-csv.test.ts public/products-template.csv components/admin/admin-dashboard.tsx
git commit -m "feat: persist purchase options in catalog workflows"
```

### Task 3: Add an administrator purchase-option editor

**Files:**
- Create: `components/admin/product-wizard/purchase-options-editor.tsx`
- Create: `components/admin/product-wizard/purchase-options-editor.test.tsx`
- Modify: `components/admin/product-wizard/sales-step.tsx`
- Modify: `components/admin/product-wizard/product-wizard.tsx`
- Modify: `components/admin/product-wizard/product-wizard.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `PurchaseOption[]`, `getPurchaseOptionPrice`, and draft validation errors.
- Produces: `PurchaseOptionsEditor({ basePrice, options, errors, onChange })`.

- [ ] **Step 1: Write failing interaction tests**

```tsx
await user.click(screen.getByRole("button", { name: "구매 옵션 추가" }));
await user.type(screen.getByLabelText("옵션 2 이름"), "2개월분");
await user.clear(screen.getByLabelText("옵션 2 가격 조정액"));
await user.type(screen.getByLabelText("옵션 2 가격 조정액"), "-35000");
expect(screen.getByText("최종가격 45,000원")).toBeVisible();
expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
  expect.objectContaining({ label: "2개월분", priceAdjustment: -35_000 }),
]));
```

Also test option clone, reorder, delete, one default, duplicate SKU error, negative stock block, and final price below 1 block.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- components/admin/product-wizard/purchase-options-editor.test.tsx components/admin/product-wizard/product-wizard.test.tsx
```

- [ ] **Step 3: Implement the focused editor component**

```tsx
<input aria-label={`옵션 ${index + 1} 가격 조정액`} type="number" step="1"
  value={option.priceAdjustment}
  onChange={(event) => update(index, { priceAdjustment: Number(event.currentTarget.value) })} />
<output>{`최종가격 ${formatWon(basePrice + option.priceAdjustment)}`}</output>
```

Keep option IDs stable during editing; generate with `crypto.randomUUID()` only when adding a new row. Clone creates a new ID and clears/auto-suggests a non-conflicting SKU.

- [ ] **Step 4: Integrate into SalesStep and responsive CSS**

Replace the single authoritative stock input for optioned products with the options editor and a read-only active-stock total. Keep the legacy stock control only for a draft normalized to the implicit default option.

- [ ] **Step 5: Run wizard tests and commit**

```powershell
pnpm test -- components/admin/product-wizard components/admin/admin-dashboard.test.tsx lib/products/draft.test.ts
pnpm exec eslint components/admin/product-wizard lib/products/draft.ts
git add components/admin/product-wizard app/globals.css lib/products/draft.ts lib/products/draft.test.ts
git commit -m "feat: manage purchase options in product wizard"
```

### Task 4: Display option-aware prices and selection on storefront

**Files:**
- Modify: `components/commerce/product-card.tsx`
- Modify: `components/commerce/product-card.test.tsx`
- Create: `components/product/purchase-option-selector.tsx`
- Create: `components/product/purchase-option-selector.test.tsx`
- Modify: `components/product/product-detail.tsx`
- Modify: `components/product/product-detail.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `PurchaseOptionSelector({ product, selectedId, onSelect })` and selected option state in `ProductDetail`.
- Later cart task consumes the selected `PurchaseOption` object.

- [ ] **Step 1: Add failing product-card and selector tests**

```tsx
expect(screen.getByText("45,000원부터")).toBeVisible();
expect(screen.queryByText(/%/)).not.toBeInTheDocument();
expect(screen.getByRole("radio", { name: /2개월분.*45,000원/ })).toBeEnabled();
expect(screen.getByRole("radio", { name: /품절/ })).toBeDisabled();
await user.click(screen.getByRole("radio", { name: /2개월분/ }));
expect(screen.getByText("재고 12개 남음")).toBeVisible();
```

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- components/commerce/product-card.test.tsx components/product/purchase-option-selector.test.tsx components/product/product-detail.test.tsx
```

- [ ] **Step 3: Implement card pricing and detail selection**

Use `getProductDisplayPrice` for cards and `getDefaultPurchaseOption` for initial detail state. Reset quantity to `min(currentQuantity, selectedOption.stock)` when the option changes. Calculate the mobile purchase total from the selected final unit price. Do not compare a shorter-duration option against the product-level `originalPrice`: cards with varying option prices hide the product-level discount/original-price pair, and detail shows it only when the selected default option uses the base package price.

- [ ] **Step 4: Run focused UI tests and commit**

```powershell
pnpm test -- components/commerce/product-card.test.tsx components/product/purchase-option-selector.test.tsx components/product/product-detail.test.tsx
git add components/commerce/product-card.tsx components/commerce/product-card.test.tsx components/product/purchase-option-selector.tsx components/product/purchase-option-selector.test.tsx components/product/product-detail.tsx components/product/product-detail.test.tsx app/globals.css
git commit -m "feat: select sealed purchase options on product pages"
```

### Task 5: Key cart lines by product and option and add the duplicate decision

**Files:**
- Modify: `features/cart/cart-types.ts`
- Modify: `features/cart/cart-utils.ts`
- Modify: `features/cart/cart-utils.test.ts`
- Modify: `features/cart/cart-context.tsx`
- Modify: `features/cart/cart-context.test.tsx`
- Modify: `components/product/product-detail.tsx`
- Modify: `components/product/product-detail.test.tsx`
- Modify: `components/cart/cart-view.tsx`
- Modify: `components/cart/cart-view.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: exported `normalizeStoredCart(value)`, `cartLineId(productId, optionId)`, `DuplicateCartStrategy = "keep" | "increment"`, and `add(product, option, quantity, strategy?)`.
- Changes line mutation APIs to accept `lineId` rather than `productId`.

- [ ] **Step 1: Write failing cart identity and legacy-storage tests**

```ts
expect(cartLineId("p1", "2-month")).not.toBe(cartLineId("p1", "4-month"));
expect(normalizeStoredCart([legacyLine])).toMatchObject([{
  purchaseOptionId: "default", purchaseOptionLabel: "기본 구성",
}]);
expect(calculateCart([twoMonthLine, fourMonthLine]).subtotal).toBe(125_000);
```

- [ ] **Step 2: Write failing duplicate-dialog tests**

```tsx
await user.click(screen.getByRole("button", { name: "장바구니 담기" }));
expect(screen.getByRole("dialog", { name: "장바구니 수량 선택" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "1개 추가하여 3개로 변경" }));
expect(add).toHaveBeenCalledWith(product, selectedOption, 1, "increment");
```

Test `기존 수량 유지`, Escape/close as keep, stock cap messaging, and different-option no-dialog behavior.

- [ ] **Step 3: Run cart/detail tests and confirm RED**

```powershell
pnpm test -- features/cart components/cart components/product/product-detail.test.tsx
```

- [ ] **Step 4: Implement the option snapshot and migration**

```ts
export type CartLine = {
  lineId: string;
  productId: string;
  purchaseOptionId: string;
  purchaseOptionLabel: string;
  sku: string;
  name: string;
  thumbnailUrl: string;
  unitPrice: number;
  stock: number;
  quantity: number;
  selected: boolean;
};
```

Backfill missing fields when reading the existing `vitaleaf-cart-v1` value, so deployed users do not lose carts. Render `purchaseOptionLabel` in cart rows and use `lineId` for React keys, remove, selection, quantity updates, and submitted-line clearing.

- [ ] **Step 5: Implement accessible desktop dialog and mobile bottom sheet**

Keep focus inside the decision surface, restore focus to the add button on close, and use the existing cart toast only after a successful add decision.

- [ ] **Step 6: Run tests and commit**

```powershell
pnpm test -- features/cart components/cart components/product/product-detail.test.tsx components/checkout/checkout-form.test.tsx
git add features/cart components/cart components/product/product-detail.tsx components/product/product-detail.test.tsx components/checkout/checkout-form.test.tsx app/globals.css
git commit -m "feat: manage cart quantities per purchase option"
```

### Task 6: Recalculate guest orders from option data

**Files:**
- Modify: `lib/guest-orders/types.ts`
- Modify: `lib/guest-orders/validation.ts`
- Modify: `lib/guest-orders/service.ts`
- Modify: `lib/guest-orders/service.test.ts`
- Modify: `lib/firebase/guest-orders.ts`
- Modify: `lib/firebase/guest-orders.test.ts`
- Modify: `lib/guest-orders/client.ts`
- Modify: `components/checkout/checkout-form.tsx`
- Modify: `app/api/guest-orders/route.test.ts`

**Interfaces:**
- Consumes: normalized product options from Task 1 and cart lines from Task 5.
- Produces: guest order lines with option snapshots and authoritative option price/stock.

- [ ] **Step 1: Add failing guest-order tests**

```ts
lines: [{ productId: "p1", purchaseOptionId: "2-month", quantity: 2 }]
```

Assert stored values include `purchaseOptionLabel`, `sku`, `basePrice`, `priceAdjustment`, and `unitPrice`; reject unknown, inactive, and insufficient-stock options. Treat duplicate input identity as the pair `productId + purchaseOptionId`.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- lib/guest-orders/service.test.ts lib/firebase/guest-orders.test.ts app/api/guest-orders/route.test.ts
```

- [ ] **Step 3: Resolve each submitted option on the server**

```ts
const option = product.purchaseOptions.find((candidate) =>
  candidate.id === line.purchaseOptionId && candidate.active,
);
if (!option || option.stock < line.quantity) throw new GuestOrderUnavailableError();
const unitPrice = getPurchaseOptionPrice(product.price, option);
```

Ignore browser `unitPrice`, option label, SKU, and stock. Update repository normalization so existing guest orders without option fields read as `default` safely.

- [ ] **Step 4: Run focused tests and commit**

```powershell
pnpm test -- lib/guest-orders app/api/guest-orders components/checkout/checkout-form.test.tsx
git add lib/guest-orders lib/firebase/guest-orders.ts lib/firebase/guest-orders.test.ts app/api/guest-orders components/checkout/checkout-form.tsx components/checkout/checkout-form.test.tsx
git commit -m "feat: validate guest orders by purchase option"
```

### Task 7: Move member-order creation behind authoritative server validation

**Files:**
- Create: `app/api/member-orders/route.ts`
- Create: `app/api/member-orders/route.test.ts`
- Create: `lib/member-orders/client.ts`
- Create: `lib/member-orders/client.test.ts`
- Modify: `lib/firebase/member-orders.ts`
- Modify: `lib/firebase/member-orders.test.ts`
- Modify: `components/checkout/checkout-form.tsx`
- Modify: `components/checkout/checkout-form.test.tsx`
- Modify: `firestore.rules`
- Modify: `firestore.rules.test.ts`

**Interfaces:**
- Consumes: `getCurrentFirebaseIdToken` and `verifyBearerMember` from the authentication plan.
- Produces: `createMemberOrder(input, payment, idempotencyKey): Promise<PaymentResult>` HTTP client and `POST /api/member-orders`.

- [ ] **Step 1: Write failing API authorization and option-validation tests**

```ts
expect(await POST(requestWithoutBearer)).toMatchObject({ status: 401 });
expect(await POST(memberRequestWithUnknownOption)).toMatchObject({ status: 409 });
expect(await POST(validMemberRequest)).toMatchObject({ status: 201 });
```

Assert the server derives user ID from the verified token, recalculates option unit price/total, and does not accept a different `userId` from the browser.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- app/api/member-orders/route.test.ts lib/member-orders/client.test.ts
```

- [ ] **Step 3: Implement the member API and authenticated client**

```ts
const token = await getCurrentFirebaseIdToken();
return fetch("/api/member-orders", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ order, payment, idempotencyKey }),
});
```

Reuse the same authoritative option-line resolver as guest orders. The Admin SDK writes `users/{uid}/orders/{orderNumber}` and preserves idempotency. Keep `listMemberOrders` for client-side reads.

- [ ] **Step 4: Deny direct browser order creation**

Change `users/{uid}/orders/{orderId}` to `allow read` for the owner and `allow create, update, delete: if false`; the server Admin SDK remains the only writer.

- [ ] **Step 5: Run member checkout and rules tests**

```powershell
pnpm test -- app/api/member-orders/route.test.ts lib/member-orders components/checkout/checkout-form.test.tsx firestore.rules.test.ts
```

- [ ] **Step 6: Commit authoritative member orders**

```powershell
git add app/api/member-orders lib/member-orders lib/firebase/member-orders.ts lib/firebase/member-orders.test.ts components/checkout/checkout-form.tsx components/checkout/checkout-form.test.tsx firestore.rules firestore.rules.test.ts
git commit -m "feat: validate member orders on the server"
```

### Task 8: Run the product-option regression gate

**Files:**
- Verify only; modify only defects inside this plan's scope.

**Interfaces:**
- Produces: a verified product-option, cart, and order foundation for inquiry order linking.

- [ ] **Step 1: Run all focused suites**

```powershell
pnpm test -- lib/products lib/csv components/admin/product-wizard components/commerce/product-card.test.tsx components/product/product-detail.test.tsx features/cart components/cart lib/guest-orders app/api/guest-orders app/api/member-orders components/checkout firestore.rules.test.ts
```

- [ ] **Step 2: Run all repository checks**

```powershell
pnpm lint
pnpm test
pnpm build:vercel
git status --short --branch
```

Expected: lint exits 0, all Vitest tests pass, Production build exits 0, and no uncommitted files remain.

- [ ] **Step 3: Browser-verify the complete option journey**

```text
관리자 2개월/4개월 옵션 저장 → 상품 카드 최저가 표시 → 상세 옵션 선택
→ 같은 옵션 재담기 유지/추가 → 다른 옵션 별도 줄 → 수량/총액 즉시 변경
→ 회원 주문과 비회원 주문 완료 → 주문조회에서 옵션명 확인
```
