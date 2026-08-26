# Cart, Guest Order, Header, and Age Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cart feedback and quantity editing immediate, add secure guest order storage and lookup, improve desktop/mobile account navigation, verify signup, and expose only administrator-tagged products in six age recommendation menus.

**Architecture:** Keep the existing Firebase client architecture for products, members, and member orders. Add a server-only Firebase Admin boundary for guest orders, with pure validation/service functions behind two Next.js route handlers; retain current cart and auth contexts and extend them rather than duplicating state. Add `ageTargets` as a legacy-tolerant normalized product field that is editable through the existing product wizard and CSV workflow.

**Tech Stack:** Next.js 16.2.6, React 19.2.6, TypeScript 5.9.3, Firebase Web SDK 12.17.1, Firebase Admin SDK, Firestore, Vitest 4.1.10, Testing Library, ESLint, Vercel

**Spec:** `docs/superpowers/specs/2026-08-26-cart-guest-order-header-age-design.md`

## Global Constraints

- Keep Firebase and the existing Next.js/Vercel deployment; do not migrate to Supabase.
- Actual PG approval, refunds, administrator fulfillment tools, social login, coupons, points, wishlists, and subscriptions remain out of scope.
- Guest order documents and lookup-attempt documents must never be readable or writable by a browser Firestore client.
- Never expose Firebase Admin credentials, complete phone numbers, complete addresses, or lookup secrets in client bundles, error bodies, logs, tests, or commits.
- Guest lookup requires both an order number matching `^VL-\d{8}-[A-Z0-9]{6}$` and the normalized phone used at checkout.
- Guest lookup responses mask recipient, phone, and address; mismatch responses do not reveal which field failed.
- Product age recommendations use only administrator-selected `ageTargets`; do not infer age suitability from health concerns.
- Preserve legacy Firestore products without `ageTargets` in general catalog and detail pages, but exclude them from age recommendation results.
- Every UI control needs a visible pressed/focus state and a minimum 44×44px mobile touch target where it is used in the mobile header.
- Work test-first, keep unrelated user changes intact, and make a focused commit after every task.

## File Structure

### New files

- `lib/guest-orders/types.ts`: client/server request types, stored order shape, and masked public result.
- `lib/guest-orders/validation.ts`: bounded input parsing, phone normalization, masking, and order-number validation.
- `lib/guest-orders/service.ts`: price recalculation, storage orchestration, lookup verification, and rate-limit policy behind an adapter.
- `lib/guest-orders/service.test.ts`: pure service tests using an in-memory adapter.
- `lib/firebase/admin.ts`: lazy server-only Firebase Admin initialization from private environment variables.
- `lib/firebase/guest-orders.ts`: Firestore Admin adapter for guest orders and lookup-attempt counters.
- `lib/firebase/guest-orders.test.ts`: adapter contract tests with mocked Admin Firestore calls.
- `lib/guest-orders/client.ts`: typed browser calls to guest create and lookup APIs.
- `app/api/guest-orders/route.ts`: validated guest-order creation endpoint.
- `app/api/guest-orders/route.test.ts`: creation endpoint status and privacy tests.
- `app/api/guest-orders/lookup/route.ts`: order-number/phone lookup endpoint and request fingerprint extraction.
- `app/api/guest-orders/lookup/route.test.ts`: lookup, generic error, and rate-limit response tests.
- `app/order-lookup/page.tsx`: public nonmember order lookup route.
- `app/order-lookup/page.test.tsx`: route contract test.
- `components/orders/guest-order-lookup-form.tsx`: accessible client lookup form and result display.
- `components/orders/guest-order-lookup-form.test.tsx`: lookup interaction, masking, loading, and failure tests.

### Existing files to modify

- `package.json`, `pnpm-lock.yaml`: add the pinned Firebase Admin dependency.
- `features/cart/cart-context.tsx`: reuse existing synchronous summary calculation; no new duplicated totals state.
- `components/cart/cart-view.tsx`, `components/cart/cart-view.test.tsx`: controlled quantity draft input and validation.
- `components/product/product-detail.tsx`, `components/product/product-detail.test.tsx`: desktop add-to-cart status toast.
- `components/shell/site-header.tsx`, header tests: desktop account/order links, mobile icons, and search button contract.
- `components/shell/site-footer.tsx`, `components/shell/site-footer.test.tsx`: bottom administrator link.
- `lib/navigation/storefront-menu.ts`, its tests, and route contract tests: `orderLookup` destination and six age links.
- `app/globals.css` and CSS contract tests: toast, quantity input, search width, mobile icons, lookup page, and footer admin styling.
- `lib/catalog/taxonomy.ts`: six age options.
- `lib/products/types.ts`, normalization/draft tests: legacy-tolerant `ageTargets` field.
- `lib/products/normalize.ts`, `lib/products/draft.ts`, `lib/firebase/product-drafts.ts`: normalize, copy, save, and publish age targets.
- `lib/products/sample-products.ts`: explicit age tags for all sample products, avoiding unsafe child/teen assumptions.
- `app/products/page.tsx`, product route tests: direct `ageTargets` filtering and empty state.
- `components/admin/product-wizard/basic-step.tsx`, wizard tests: administrator age multi-select and explanatory copy.
- `lib/csv/products-csv.ts`, CSV tests: import/export `ageTargets`.
- `components/checkout/checkout-form.tsx`, checkout tests: persist guest order before clearing submitted cart.
- `app/order-complete/page.tsx`, its tests, and `components/checkout/order-complete-actions.tsx`: guest lookup affordance and order-number retention.
- `firestore.rules`, `firestore.rules.test.ts`: explicit client denial for guest orders and lookup attempts.
- `.env.example`, `README.md`: private server configuration, Firebase Email/Password setup, rules deployment, and end-to-end verification.

---

### Task 1: Add explicit age targets to product data and storefront filtering

**Files:**
- Modify: `lib/catalog/taxonomy.ts`
- Modify: `lib/products/types.ts`
- Modify: `lib/products/normalize.ts`
- Modify: `lib/products/draft.ts`
- Modify: `lib/products/sample-products.ts`
- Modify: `lib/firebase/product-drafts.ts`
- Modify: `lib/navigation/menu-state.ts`
- Modify: `app/products/page.tsx`
- Test: `lib/products/normalize.test.ts`
- Test: `lib/products/draft.test.ts`
- Test: `lib/navigation/menu-state.test.ts`
- Test: `app/products/products-page.test.tsx`
- Test: `app/storefront-route-contract.test.ts`

**Interfaces:**
- Produces: `AGE_TARGETS` values `child | teen | 20 | 30 | 40 | 50`.
- Produces: `Product.ageTargets?: string[]`, normalized to a concrete array for Firestore reads.
- Produces: `ProductDraft.ageTargets?: string[]`, copied through draft create/edit/restore/publish.
- Produces: `MenuPageState.age: string | null` constrained by `AGE_TARGETS` parsing.
- Consumes: existing `canonicalTaxonomyValues()` and `resolveMenuState()`.

- [ ] **Step 1: Write failing normalization, navigation, and page tests**

```ts
it("normalizes only supported age targets", () => {
  const product = normalizeProduct("p1", validRawProduct({ ageTargets: ["어린이", "20", "unknown", "20"] }));
  expect(product.ageTargets).toEqual(["child", "20"]);
});

it.each([
  ["child", "어린이 추천"], ["teen", "청소년 추천"], ["20", "20대 추천"],
  ["30", "30대 추천"], ["40", "40대 추천"], ["50", "50대+ 추천"],
])("resolves age=%s", (age, title) => {
  expect(resolveMenuState({ age })).toMatchObject({ age, title });
});

it("shows only products explicitly tagged for the selected age", async () => {
  getServerProductsMock.mockResolvedValue([
    makeProduct({ id: "child", ageTargets: ["child"] }),
    makeProduct({ id: "legacy", ageTargets: undefined, concerns: ["immunity"] }),
  ]);
  render(await ProductsPage({ searchParams: Promise.resolve({ age: "child" }) }));
  expect(screen.getByText("child")).toBeInTheDocument();
  expect(screen.queryByText("legacy")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm vitest run lib/products/normalize.test.ts lib/products/draft.test.ts lib/navigation/menu-state.test.ts app/products/products-page.test.tsx app/storefront-route-contract.test.ts`

Expected: FAIL because `ageTargets`, the three new age options, and explicit age filtering do not exist.

- [ ] **Step 3: Add canonical age data and legacy-tolerant normalization**

```ts
export const AGE_TARGETS = [
  { value: "child", label: "어린이", description: "성장기 어린이를 위해 확인된 상품" },
  { value: "teen", label: "청소년", description: "청소년 생활 리듬에 맞춘 상품" },
  { value: "20", label: "20대", description: "바쁜 일상의 기초 건강 관리" },
  { value: "30", label: "30대", description: "바쁜 일상을 위한 기본 관리" },
  { value: "40", label: "40대", description: "변화가 느껴질 때의 건강 관리" },
  { value: "50", label: "50대+", description: "활기찬 일상을 위한 건강 관리" },
] as const satisfies readonly TaxonomyOption[];
```

Add `ageTargets?: string[]` immediately after `concerns` in `Product`. Add a `canonicalAgeTargets(candidates)` helper that canonicalizes labels and values, removes duplicates, and filters the result against the six allowed `AGE_TARGETS` values. Use that helper in product normalization, draft normalization, draft copies, and `toPublishedProductInput`; copy `source.ageTargets ?? []` at legacy boundaries.

- [ ] **Step 4: Replace concern inference with explicit age filtering**

```ts
if (menuState.age) {
  products = products.filter((product) => (product.ageTargets ?? []).includes(menuState.age!));
}
```

Remove `AGE_CONCERN_GROUPS`, remove the health-concern import used only for age filtering, and set the age page context label to `관리자가 확인한 추천 연령 기준`.

- [ ] **Step 5: Assign safe sample age targets and run focused tests**

Give every sample an explicit adult age selection. Only a sample whose dosage/cautions explicitly support a child or teen may receive `child` or `teen`; otherwise those routes render the intentional empty state.

Run: `pnpm vitest run lib/products/normalize.test.ts lib/products/draft.test.ts lib/navigation/menu-state.test.ts app/products/products-page.test.tsx app/storefront-route-contract.test.ts app/page.test.tsx`

Expected: PASS; all six age routes are accepted, legacy products remain in general listings, and legacy products are absent from age results.

- [ ] **Step 6: Commit**

```bash
git add lib/catalog/taxonomy.ts lib/products/types.ts lib/products/normalize.ts lib/products/normalize.test.ts lib/products/draft.ts lib/products/draft.test.ts lib/products/sample-products.ts lib/firebase/product-drafts.ts lib/navigation/menu-state.ts lib/navigation/menu-state.test.ts app/products/page.tsx app/products/products-page.test.tsx app/storefront-route-contract.test.ts app/page.test.tsx
git commit -m "feat: add explicit product age recommendations"
```

### Task 2: Add administrator and CSV age-target editing

**Files:**
- Modify: `components/admin/product-wizard/basic-step.tsx`
- Modify: `components/admin/product-wizard/product-wizard.test.tsx`
- Modify: `lib/csv/products-csv.ts`
- Modify: `lib/csv/products-csv.test.ts`
- Modify: `components/admin/csv-tools.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `AGE_TARGETS` and `ProductDraft.ageTargets` from Task 1.
- Produces: administrator checkbox updates through `onChange({ ...draft, ageTargets })`.
- Produces: CSV column `ageTargets`, encoded with the existing escaped pipe-list format.

- [ ] **Step 1: Write failing wizard and CSV tests**

```tsx
it("lets an administrator select more than one recommendation age", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ProductWizard {...propsFor({ ageTargets: [] })} onChange={onChange} />);
  await user.click(screen.getByRole("checkbox", { name: "어린이" }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ageTargets: ["child"] }));
});
```

```ts
it("round trips ageTargets", () => {
  const product = validProductInput({ ageTargets: ["teen", "20"] });
  const csv = exportProductsCsv([product]);
  expect(parseProductsCsv(csv).products[0].ageTargets).toEqual(["teen", "20"]);
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `pnpm vitest run components/admin/product-wizard/product-wizard.test.tsx lib/csv/products-csv.test.ts components/admin/csv-tools.test.tsx`

Expected: FAIL because the wizard and CSV schema do not expose `ageTargets`.

- [ ] **Step 3: Add the administrator multi-select**

In `BasicStep`, import `AGE_TARGETS`, canonicalize `draft.ageTargets ?? []`, and render this fieldset after health concerns:

```tsx
<fieldset className="product-wizard__checks">
  <legend>추천 연령 (선택)</legend>
  <p className="product-wizard__field-help">실제 표시사항을 확인한 연령만 선택하세요. 선택하지 않으면 연령별 추천에 노출되지 않습니다.</p>
  {AGE_TARGETS.map((option) => (
    <label key={option.value}>
      <input
        type="checkbox"
        checked={ageTargetValues.includes(option.value)}
        onChange={(event) => updateAgeTarget(option.value, event.target.checked)}
      />
      {option.label}
    </label>
  ))}
</fieldset>
```

The updater must de-duplicate checked values and preserve taxonomy order by filtering `AGE_TARGETS` against the selected set.

- [ ] **Step 4: Extend CSV parsing and export**

Add `ageTargets` immediately after `concerns` in `PRODUCT_CSV_HEADERS`, initialize it as `[]`, parse with `canonicalTaxonomyValues(AGE_TARGETS, list("ageTargets"))`, and export with `encodeList(product.ageTargets ?? [])`.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run components/admin/product-wizard/product-wizard.test.tsx lib/csv/products-csv.test.ts components/admin/csv-tools.test.tsx lib/firebase/product-drafts.test.ts lib/firebase/product-drafts.lifecycle.test.ts`

Expected: PASS with multi-select, autosave-compatible drafts, publish copies, and CSV round trips.

```bash
git add components/admin/product-wizard/basic-step.tsx components/admin/product-wizard/product-wizard.test.tsx lib/csv/products-csv.ts lib/csv/products-csv.test.ts components/admin/csv-tools.test.tsx app/globals.css
git commit -m "feat: manage product recommendation ages"
```

### Task 3: Rework desktop and mobile account navigation

**Files:**
- Modify: `lib/navigation/storefront-menu.ts`
- Modify: `lib/navigation/storefront-menu.test.ts`
- Modify: `components/shell/site-header.tsx`
- Modify: `components/shell/site-header.test.tsx`
- Modify: `components/shell/site-header-responsive-css.test.tsx`
- Modify: `components/shell/site-footer.tsx`
- Modify: `components/shell/site-footer.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `STOREFRONT_DESTINATIONS.orderLookup = { href: "/order-lookup", label: "주문조회" }`.
- Consumes: `useAuth()` and `useCart().itemCount`.
- Produces: desktop signed-out order `로그인, 회원가입, 마이페이지, 장바구니, 주문조회`.
- Produces: mobile icon links with stable classes `site-header__mobile-cart` and `site-header__mobile-account`.

- [ ] **Step 1: Write failing header/footer tests**

```tsx
it("shows shopper links instead of admin in the signed-out desktop header", () => {
  renderHeader({ authStatus: "signed-out", itemCount: 3 });
  const nav = screen.getByRole("navigation", { name: "사용자 메뉴" });
  expect(within(nav).getByRole("link", { name: "마이페이지" })).toHaveAttribute("href", "/login?next=/mypage");
  expect(within(nav).getByRole("link", { name: /장바구니 3개/ })).toHaveAttribute("href", "/cart");
  expect(within(nav).getByRole("link", { name: "주문조회" })).toHaveAttribute("href", "/order-lookup");
  expect(within(nav).queryByRole("link", { name: "관리자" })).not.toBeInTheDocument();
});

it("places administrator login at the bottom footer", () => {
  render(<SiteFooter />);
  expect(screen.getByRole("link", { name: "관리자 로그인" })).toHaveAttribute("href", "/admin");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `pnpm vitest run components/shell/site-header.test.tsx components/shell/site-footer.test.tsx components/shell/site-header-responsive-css.test.tsx lib/navigation/storefront-menu.test.ts`

Expected: FAIL because order lookup, signed-out My Page, explicit mobile icons, and footer admin are absent.

- [ ] **Step 3: Implement state-aware desktop links**

Keep `AccountActions` responsible for login/signup/logout, add a separate My Page entry that resolves to `/mypage` for members and `/login?next=/mypage` for visitors, then render cart followed by guest-only order lookup. Do not render duplicate My Page links for signed-in users.

Expose `isMember` from a small `AccountMenu` composition or keep all account links in one component; do not call `useAuth()` twice in the same navigation branch.

- [ ] **Step 4: Add explicit mobile icons and move admin to the footer**

```tsx
<Link className="site-header__mobile-cart" href="/cart" aria-label={`장바구니, 상품 ${itemCount}개`}>
  <CartIcon aria-hidden="true" />
  <span aria-hidden="true">{itemCount}</span>
</Link>
<Link className="site-header__mobile-account" href={accountHref} aria-label="마이페이지">
  <AccountIcon aria-hidden="true" />
</Link>
```

Use inline SVG components with `currentColor`, `focusable="false"`, and no external icon dependency. Remove admin from the desktop utility nav and mobile drawer. Add `<Link className="site-footer__admin" href="/admin">관리자 로그인</Link>` after the primary footer content.

- [ ] **Step 5: Fix search-button layout and mobile hit areas**

```css
.site-header__search button { min-width: 72px; white-space: nowrap; }
.site-header__mobile-cart,
.site-header__mobile-account { display: none; }
@media (max-width: 767px) {
  .site-header__mobile-cart,
  .site-header__mobile-account { display: inline-grid; width: 44px; height: 44px; place-items: center; }
}
```

Keep existing desktop cart text. Do not use `font-size: 0` as the icon-rendering mechanism.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm vitest run components/shell/site-header.test.tsx components/shell/site-footer.test.tsx components/shell/site-header-responsive-css.test.tsx lib/navigation/storefront-menu.test.ts app/interaction-feedback-css.test.ts`

Expected: PASS for link order, auth states, icon labels, badge count, 44px targets, search text, and footer admin.

```bash
git add lib/navigation/storefront-menu.ts lib/navigation/storefront-menu.test.ts components/shell/site-header.tsx components/shell/site-header.test.tsx components/shell/site-header-responsive-css.test.tsx components/shell/site-footer.tsx components/shell/site-footer.test.tsx app/globals.css app/interaction-feedback-css.test.ts
git commit -m "feat: improve shopper navigation and mobile account access"
```

### Task 4: Add direct cart quantity entry with immediate totals

**Files:**
- Modify: `components/cart/cart-view.tsx`
- Modify: `components/cart/cart-view.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `useCart().setQuantity(productId: string, quantity: number)`.
- Consumes: existing memoized `subtotal`, `shippingFee`, `total` from `CartProvider`.
- Produces: `CartQuantity` local string draft synchronized to external `line.quantity`.

- [ ] **Step 1: Write failing input and total tests**

```tsx
it("updates the payment total while the shopper types a valid quantity", async () => {
  const user = userEvent.setup();
  renderCart([makeLine({ unitPrice: 10_000, quantity: 1, stock: 10 })]);
  const input = screen.getByRole("spinbutton", { name: /수량/ });
  await user.clear(input);
  await user.type(input, "3");
  expect(screen.getByText("30,000원")).toBeInTheDocument();
});

it("restores blank input and clamps stock overflow", async () => {
  const user = userEvent.setup();
  renderCart([makeLine({ quantity: 2, stock: 5 })]);
  const input = screen.getByRole("spinbutton", { name: /수량/ });
  await user.clear(input);
  await user.tab();
  expect(input).toHaveValue(2);
  await user.clear(input);
  await user.type(input, "99");
  expect(input).toHaveValue(5);
});
```

- [ ] **Step 2: Run the cart test and verify it fails**

Run: `pnpm vitest run components/cart/cart-view.test.tsx`

Expected: FAIL because the quantity is an `<output>` and cannot be typed.

- [ ] **Step 3: Implement the controlled draft input**

```tsx
const [draftQuantity, setDraftQuantity] = useState(String(line.quantity));
useEffect(() => setDraftQuantity(String(line.quantity)), [line.quantity]);

const commitValidQuantity = (raw: string) => {
  if (!/^\d+$/.test(raw)) return false;
  const requested = Number(raw);
  if (!Number.isSafeInteger(requested) || requested < 1) return false;
  const next = Math.min(requested, line.stock);
  setDraftQuantity(String(next));
  setQuantity(line.productId, next);
  return true;
};
```

Render `<input type="number" min={1} max={line.stock} step={1} inputMode="numeric">`. On change, preserve an empty string; commit a valid integer immediately. On blur or Enter, restore `String(line.quantity)` when the draft is invalid. Announce stock clamping in an adjacent `role="status"` message.

- [ ] **Step 4: Verify cart totals and commit**

Run: `pnpm vitest run components/cart/cart-view.test.tsx features/cart/cart-context.test.tsx features/cart/cart-utils.test.ts`

Expected: PASS; entering a valid number updates subtotal, shipping threshold, shipping fee, and total without a save button.

```bash
git add components/cart/cart-view.tsx components/cart/cart-view.test.tsx app/globals.css
git commit -m "feat: allow direct cart quantity editing"
```

### Task 5: Add desktop add-to-cart confirmation toast

**Files:**
- Modify: `components/product/product-detail.tsx`
- Modify: `components/product/product-detail.test.tsx`
- Modify: `components/product/product-detail-css.test.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `useCart().add(product, quantity)`.
- Produces: local `CartToastState = { productName: string; quantity: number } | null`.
- Produces: a `장바구니 보기` link to `/cart` and automatic dismissal after 3,000ms.

- [ ] **Step 1: Write failing timer and action tests**

```tsx
it("shows a desktop cart confirmation with a cart action", async () => {
  const user = userEvent.setup();
  renderDetail(inStockProduct);
  await user.click(screen.getByRole("button", { name: "장바구니 담기" }));
  expect(screen.getByRole("status")).toHaveTextContent(`${inStockProduct.name} 1개`);
  expect(screen.getByRole("link", { name: "장바구니 보기" })).toHaveAttribute("href", "/cart");
});

it("resets the three-second dismissal when a product is added again", async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderDetail(inStockProduct);
  const addButton = screen.getByRole("button", { name: "장바구니 담기" });
  await user.click(addButton);
  act(() => vi.advanceTimersByTime(2_000));
  await user.click(addButton);
  act(() => vi.advanceTimersByTime(2_999));
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run the detail tests and verify they fail**

Run: `pnpm vitest run components/product/product-detail.test.tsx components/product/product-detail-css.test.ts`

Expected: FAIL because no cart confirmation exists.

- [ ] **Step 3: Implement the accessible toast**

Create a `useEffect` that starts one 3,000ms timeout whenever the toast state changes and clears the previous timeout on cleanup. The add handler calls `add(product, quantity)` first, then stores the current product name and quantity. Render only for successful in-stock adds:

```tsx
{cartToast ? (
  <aside className="product-detail__cart-toast" role="status" aria-live="polite">
    <p><strong>{cartToast.productName}</strong> {cartToast.quantity}개를 장바구니에 담았습니다.</p>
    <Link href="/cart">장바구니 보기</Link>
    <button type="button" aria-label="장바구니 알림 닫기" onClick={() => setCartToast(null)}>×</button>
  </aside>
) : null}
```

Hide the full toast below 768px or reduce it to a non-blocking one-line status that does not overlap the fixed purchase bar.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm vitest run components/product/product-detail.test.tsx components/product/product-detail-css.test.ts app/interaction-feedback-css.test.ts`

Expected: PASS for text, cart link, manual close, timer reset, sold-out exclusion, and desktop positioning.

```bash
git add components/product/product-detail.tsx components/product/product-detail.test.tsx components/product/product-detail-css.test.ts app/globals.css app/interaction-feedback-css.test.ts
git commit -m "feat: confirm desktop cart additions"
```

### Task 6: Build the server-only guest order domain and Firebase Admin adapter

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `lib/guest-orders/types.ts`
- Create: `lib/guest-orders/validation.ts`
- Create: `lib/guest-orders/service.ts`
- Create: `lib/guest-orders/service.test.ts`
- Create: `lib/firebase/admin.ts`
- Create: `lib/firebase/guest-orders.ts`
- Create: `lib/firebase/guest-orders.test.ts`

**Interfaces:**
- Produces: `normalizePhone(value: string): string` returning 10–11 digits or throwing `GuestOrderValidationError`.
- Produces: `parseGuestOrderCreateInput(value: unknown): GuestOrderCreateInput` with 1–20 distinct lines and quantities 1–999.
- Produces: `parseGuestOrderLookupInput(value: unknown): { orderNumber: string; phone: string }`.
- Produces: `GuestOrderPublic = { orderNumber; status; receivedAt; customerNameMasked; phoneMasked; addressMasked; lines; subtotal; shippingFee; total }`.
- Produces: `GuestOrderRepository = { loadProducts; createOrder; getOrder; getAttempt; setAttempt; deleteAttempt }`.
- Produces: `createGuestOrderService(dependencies)` with `create(input, payment): Promise<PaymentResult>` and `lookup(input, clientKey): Promise<GuestOrderPublic>`.
- Produces: `getAdminFirestore(): FirebaseFirestore.Firestore` and a Firestore `GuestOrderRepository` adapter.

- [ ] **Step 1: Add Firebase Admin and write failing pure service tests**

Run: `pnpm add firebase-admin@^13.4.0`

Write service tests for malformed names/phones/addresses, duplicate product IDs, more than 20 lines, invalid quantity, server catalog price recalculation, stock shortage, duplicate order number, correct lookup, incorrect phone, masked response, five failures in ten minutes, and successful-attempt reset.

```ts
it.each([
  ["name", createInput({ customerName: "" })],
  ["phone", createInput({ phone: "123" })],
  ["address", createInput({ address: "\u0000" })],
  ["line count", createInput({ lines: Array.from({ length: 21 }, (_, index) => ({ productId: `p${index}`, quantity: 1 })) })],
  ["quantity", createInput({ lines: [{ productId: "p1", quantity: 0 }] })],
])("rejects invalid %s input", async (_name, input) => {
  const service = createGuestOrderService(inMemoryDependencies());
  await expect(service.create(input, paymentResult)).rejects.toThrow(GuestOrderValidationError);
});

it("recalculates totals from server products instead of client prices", async () => {
  const service = createGuestOrderService(inMemoryDependencies({ products: [product({ id: "p1", price: 12_000, stock: 5 })] }));
  const stored = await service.create(createInput({ lines: [{ productId: "p1", quantity: 2 }] }), paymentResult);
  expect(stored).toMatchObject({ subtotal: 24_000, total: 27_000 });
});

it("blocks the sixth failed lookup in ten minutes", async () => {
  const service = createGuestOrderService(inMemoryDependencies({ storedOrder }));
  for (let count = 0; count < 5; count += 1) await expect(service.lookup(wrongPhone, "client-a")).rejects.toThrow(GuestOrderNotFoundError);
  await expect(service.lookup(correctPhone, "client-a")).rejects.toThrow(GuestOrderRateLimitError);
});

it("returns only masked personal data and clears failures after success", async () => {
  const dependencies = inMemoryDependencies({ storedOrder });
  const service = createGuestOrderService(dependencies);
  const result = await service.lookup(correctPhone, "client-a");
  expect(result).toMatchObject({ customerNameMasked: "김**", phoneMasked: "010-****-5678" });
  expect(JSON.stringify(result)).not.toContain(storedOrder.addressDetail);
  expect(dependencies.repository.deleteAttempt).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run service tests and verify they fail**

Run: `pnpm vitest run lib/guest-orders/service.test.ts`

Expected: FAIL because the guest-order modules do not exist.

- [ ] **Step 3: Implement bounded parsing and masking**

Use explicit maximum lengths: name 50, phone input 30, postcode 10, base address 200, address detail 100, delivery note 200. Reject control characters. Normalize phone with `value.replace(/\D/g, "")` and accept only `/^0\d{9,10}$/`.

```ts
export const maskPhone = (phone: string) => phone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3").replace(/-(\d{3,4})-/, "-****-");
export const maskName = (name: string) => name.length < 2 ? "*" : `${name[0]}${"*".repeat(Math.max(1, name.length - 1))}`;
export const maskAddress = (postcode: string, address: string) => `${postcode} ${address.split(" ").slice(0, 2).join(" ")} ***`;
```

- [ ] **Step 4: Implement price recalculation and lookup policy**

Use `STORE_POLICIES.shipping` or `calculateCart` with server-created `CartLine` values so the checkout and server use one shipping rule. Load every unique product ID, fall back to `findSampleProduct(id)` only when the public catalog read returns null, reject missing or insufficient-stock products, and store server prices/names/images.

Define five failures per ten-minute window. Generate the attempt document ID with `createHmac("sha256", lookupSecret).update(clientKey).digest("hex")`; never persist the raw client key.

- [ ] **Step 5: Implement lazy Firebase Admin initialization**

```ts
const privateKey = required("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
const app = getApps()[0] ?? initializeApp({
  credential: cert({
    projectId: required("FIREBASE_ADMIN_PROJECT_ID"),
    clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL"),
    privateKey,
  }),
});
export const getAdminFirestore = () => getFirestore(app);
```

Do not initialize at module import time; tests and builds without secrets must import route modules safely.

- [ ] **Step 6: Implement the Firestore adapter and tests**

Store orders at `guestOrders/{orderNumber}` with create-only semantics. Store rate windows at `guestOrderLookupAttempts/{fingerprint}` using transactions. Return domain `Date` values from Firestore timestamps and delete the attempt document on successful lookup.

Run: `pnpm vitest run lib/guest-orders/service.test.ts lib/firebase/guest-orders.test.ts`

Expected: PASS for server recalculation, legacy sample fallback, masked lookup, rate windows, lazy env validation, and create-only writes.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/guest-orders/types.ts lib/guest-orders/validation.ts lib/guest-orders/service.ts lib/guest-orders/service.test.ts lib/firebase/admin.ts lib/firebase/guest-orders.ts lib/firebase/guest-orders.test.ts
git commit -m "feat: add secure guest order service"
```

### Task 7: Expose guest order APIs and lock Firestore client access

**Files:**
- Create: `app/api/guest-orders/route.ts`
- Create: `app/api/guest-orders/route.test.ts`
- Create: `app/api/guest-orders/lookup/route.ts`
- Create: `app/api/guest-orders/lookup/route.test.ts`
- Modify: `firestore.rules`
- Modify: `firestore.rules.test.ts`

**Interfaces:**
- Consumes: guest service from Task 6.
- Produces: `POST /api/guest-orders` returning `{ orderNumber: string; receivedAt: string }` with HTTP 201.
- Produces: `POST /api/guest-orders/lookup` returning `{ order: GuestOrderPublic }` with HTTP 200.
- Produces: error bodies `{ message: string }` without field-specific mismatch details.

- [ ] **Step 1: Write failing route and security-rule tests**

```ts
it("returns 201 without exposing stored phone or address", async () => {
  const response = await POST(createJsonRequest(validCreateBody));
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body).toEqual({ orderNumber: "VL-20260826-ABC123", receivedAt: expect.any(String) });
  expect(JSON.stringify(body)).not.toContain("01012345678");
});

it("uses the same generic message for unknown order and wrong phone", async () => {
  const unknown = await lookupPost(requestFor("VL-20260826-ABC123", "01012345678"));
  const mismatch = await lookupPost(requestFor("VL-20260826-DEF456", "01012345678"));
  expect(await unknown.json()).toEqual(await mismatch.json());
});
```

Add rule tests that unauthenticated users, members, and browser-authenticated admins all fail to `get`, `list`, `create`, `update`, and `delete` documents under both guest collections.

- [ ] **Step 2: Run route tests and verify they fail**

Run: `pnpm vitest run app/api/guest-orders/route.test.ts app/api/guest-orders/lookup/route.test.ts`

Expected: FAIL because the route handlers do not exist.

- [ ] **Step 3: Implement the creation route**

Parse JSON inside a try/catch, invoke the service, and map errors exactly: validation 400, unavailable product 409, duplicate order 409, missing server configuration 503, unexpected failure 500. Log only an error class and generated request ID; do not log request bodies.

- [ ] **Step 4: Implement lookup route and fingerprint extraction**

Read the first `x-forwarded-for` address, fall back to `x-real-ip`, then `unknown`. Pass it as the service `clientKey`; the service hashes it. Map validation to 400, mismatch to 404 with `주문번호와 휴대전화 번호를 다시 확인해 주세요.`, rate limit to 429 with `잠시 후 다시 시도해 주세요.`, and configuration failure to 503.

- [ ] **Step 5: Add explicit client-deny rules**

```rules
match /guestOrders/{orderNumber} {
  allow read, write: if false;
}
match /guestOrderLookupAttempts/{fingerprint} {
  allow read, write: if false;
}
```

Place these before the recursive default deny so the privacy contract is visible and separately testable.

- [ ] **Step 6: Run API and emulator rule tests, then commit**

Run: `pnpm vitest run app/api/guest-orders/route.test.ts app/api/guest-orders/lookup/route.test.ts`

Expected: PASS.

Run: `pnpm exec firebase emulators:exec --only firestore --project demo-vitaleaf-rules-test "pnpm vitest run firestore.rules.test.ts --maxWorkers=1 --no-file-parallelism"`

Expected: PASS with all guest collections denied to clients and existing product/member rules unchanged.

```bash
git add app/api/guest-orders/route.ts app/api/guest-orders/route.test.ts app/api/guest-orders/lookup/route.ts app/api/guest-orders/lookup/route.test.ts firestore.rules firestore.rules.test.ts
git commit -m "feat: expose protected guest order APIs"
```

### Task 8: Persist guest checkout before clearing the cart

**Files:**
- Create: `lib/guest-orders/client.ts`
- Modify: `components/checkout/checkout-form.tsx`
- Modify: `components/checkout/checkout-form.test.tsx`

**Interfaces:**
- Produces: `createGuestOrder(input: OrderDraft, payment: PaymentResult): Promise<PaymentResult>`.
- Produces: `lookupGuestOrder(orderNumber: string, phone: string): Promise<GuestOrderPublic>` for Task 9.
- Consumes: `/api/guest-orders` and `/api/guest-orders/lookup` from Task 7.
- Preserves: member flow `processPayment` → `createMemberOrder`.

- [ ] **Step 1: Replace the obsolete guest non-persistence test with failing persistence tests**

```tsx
it("persists a guest order before clearing and navigating", async () => {
  const user = userEvent.setup();
  createGuestOrderMock.mockResolvedValue(paymentResult);
  renderCheckout({ authStatus: "signed-out" });
  await submitValidCheckout(user);
  await waitFor(() => expect(createGuestOrderMock).toHaveBeenCalledWith(expect.objectContaining({ phone: "010-1234-5678" }), paymentResult));
  expect(clearSubmittedMock).toHaveBeenCalledAfter(createGuestOrderMock);
  expect(pushMock).toHaveBeenCalledWith("/order-complete?orderNumber=VL-20260810-ABC123&guest=1");
});

it("keeps the cart when guest order persistence fails", async () => {
  const user = userEvent.setup();
  createGuestOrderMock.mockRejectedValue(new Error("storage failed"));
  renderCheckout({ authStatus: "signed-out" });
  await submitValidCheckout(user);
  await screen.findByRole("alert");
  expect(clearSubmittedMock).not.toHaveBeenCalled();
  expect(pushMock).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("주문을 저장하지 못했습니다");
});
```

- [ ] **Step 2: Run checkout tests and verify they fail**

Run: `pnpm vitest run components/checkout/checkout-form.test.tsx`

Expected: FAIL because guests are intentionally not persisted in the current implementation.

- [ ] **Step 3: Add the typed client**

```ts
export async function createGuestOrder(order: OrderDraft, payment: PaymentResult): Promise<PaymentResult> {
  const response = await fetch("/api/guest-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order, payment }),
  });
  if (!response.ok) throw new GuestOrderClientError(await readMessage(response));
  return parsePaymentResult(await response.json());
}
```

Use the same bounded response parsing for lookup; do not return raw `unknown` to UI components.

- [ ] **Step 4: Branch checkout persistence by auth state**

After `processPayment(orderDraft)`, call `createMemberOrder` for members or `createGuestOrder` for guests. Only after the chosen persistence call succeeds may `clearSubmitted`/`clearBuyNow` run. Append `guest=1` only for a stored guest order.

Replace the old guest copy `개인정보와 주문 정보는 저장되지 않습니다.` with `비회원 주문은 주문번호와 휴대전화 번호로 조회할 수 있습니다.`

- [ ] **Step 5: Run checkout and payment tests, then commit**

Run: `pnpm vitest run components/checkout/checkout-form.test.tsx lib/payment/process-payment.test.ts features/cart/cart-context.test.tsx`

Expected: PASS for member storage, guest storage, duplicate-submit blocking, retry after failure, cart preservation, and correct completion query.

```bash
git add lib/guest-orders/client.ts components/checkout/checkout-form.tsx components/checkout/checkout-form.test.tsx
git commit -m "feat: persist nonmember checkout orders"
```

### Task 9: Add the guest order lookup page and completion affordance

**Files:**
- Create: `app/order-lookup/page.tsx`
- Create: `app/order-lookup/page.test.tsx`
- Create: `components/orders/guest-order-lookup-form.tsx`
- Create: `components/orders/guest-order-lookup-form.test.tsx`
- Modify: `app/order-complete/page.tsx`
- Modify: `app/order-complete/page.test.tsx`
- Modify: `components/checkout/order-complete-actions.tsx`
- Modify: `components/checkout/order-complete-actions.test.tsx`
- Modify: `app/globals.css`
- Modify: `app/storefront-route-contract.test.ts`

**Interfaces:**
- Consumes: `lookupGuestOrder(orderNumber, phone)` from Task 8.
- Consumes: `STOREFRONT_DESTINATIONS.orderLookup` from Task 3.
- Produces: `/order-lookup` form with order number and telephone fields.
- Produces: masked result cards from `GuestOrderPublic`; no client-side unmasking data exists.

- [ ] **Step 1: Write failing lookup form and completion tests**

```tsx
it("shows a masked order after both fields are submitted", async () => {
  const user = userEvent.setup();
  lookupGuestOrderMock.mockResolvedValue(publicOrder);
  render(<GuestOrderLookupForm />);
  await user.type(screen.getByLabelText("주문번호"), "VL-20260826-ABC123");
  await user.type(screen.getByLabelText("주문 시 휴대전화 번호"), "01012345678");
  await user.click(screen.getByRole("button", { name: "주문 조회" }));
  expect(await screen.findByText("김**")).toBeInTheDocument();
  expect(screen.queryByText("01012345678")).not.toBeInTheDocument();
});

it("offers lookup only for a guest completion", async () => {
  render(await OrderCompletePage({ searchParams: Promise.resolve({ orderNumber: "VL-20260826-ABC123", guest: "1" }) }));
  expect(screen.getByRole("link", { name: "비회원 주문조회" })).toHaveAttribute("href", "/order-lookup?orderNumber=VL-20260826-ABC123");
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `pnpm vitest run components/orders/guest-order-lookup-form.test.tsx app/order-lookup/page.test.tsx app/order-complete/page.test.tsx components/checkout/order-complete-actions.test.tsx`

Expected: FAIL because the route and guest completion action do not exist.

- [ ] **Step 3: Implement the form and masked result**

Use local `idle | submitting | success | error` state. Normalize only display formatting in the browser; the server remains authoritative. Disable the submit button while pending, retain the entered order number after failure, clear the phone field after a successful lookup, and move focus to the result heading.

Render order status, received date, each item name/quantity/price, subtotal, shipping, total, masked name, masked phone, and masked address. Use `formatWon` and `<dl>`/`<ul>` semantics.

- [ ] **Step 4: Implement route and completion link**

The page may prefill only a valid order number from `searchParams`; never prefill or put a phone number in the URL. Extend the completion page params with `guest`. Pass the validated order number and guest flag into `OrderCompleteActions` so the guest action link is constructed without reading browser state.

- [ ] **Step 5: Add responsive styles and route contract**

Use one-column fields below 640px, preserve a 44px submit target, and ensure long product names/order numbers wrap. Add `/order-lookup` to the storefront route contract and assert the header destination resolves to the page.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm vitest run components/orders/guest-order-lookup-form.test.tsx app/order-lookup/page.test.tsx app/order-complete/page.test.tsx components/checkout/order-complete-actions.test.tsx app/storefront-route-contract.test.ts`

Expected: PASS for prefill, validation, pending state, generic failures, masked results, and guest/member completion differences.

```bash
git add app/order-lookup/page.tsx app/order-lookup/page.test.tsx components/orders/guest-order-lookup-form.tsx components/orders/guest-order-lookup-form.test.tsx app/order-complete/page.tsx app/order-complete/page.test.tsx components/checkout/order-complete-actions.tsx components/checkout/order-complete-actions.test.tsx app/globals.css app/storefront-route-contract.test.ts
git commit -m "feat: add nonmember order lookup experience"
```

### Task 10: Verify signup, document configuration, and run the complete quality gate

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify only if a failing test proves a defect: `components/auth/signup-form.tsx`
- Test: `components/auth/signup-form.test.tsx`
- Test: `components/auth/signup-form.pending.test.tsx`
- Test: `app/login/page.test.tsx`

**Interfaces:**
- Consumes: existing Firebase Authentication signup and profile creation.
- Produces: documented private environment variables `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, and `GUEST_ORDER_LOOKUP_SECRET`.
- Preserves: credentials never use `NEXT_PUBLIC_` and never appear in repository values.

- [ ] **Step 1: Add or confirm signup regression coverage**

Ensure tests cover valid signup, required terms, password mismatch, duplicate email, profile-write rollback, verification-email warning, double-submit blocking, and success navigation to `/mypage`. Add this cross-navigation assertion:

```tsx
it("returns a signed-out My Page visitor to My Page after authentication", async () => {
  render(<LoginPage searchParams={Promise.resolve({ next: "/mypage" })} />);
  await submitValidLogin();
  expect(pushMock).toHaveBeenCalledWith("/mypage");
});
```

- [ ] **Step 2: Run auth tests before changing auth code**

Run: `pnpm vitest run components/auth/signup-form.test.tsx components/auth/signup-form.pending.test.tsx components/auth/login-form.test.tsx app/login/page.test.tsx features/auth/auth-context.test.tsx lib/firebase/member-auth.test.ts`

Expected: PASS. If a test fails, make the smallest change in `signup-form.tsx`, `login-form.tsx`, or `member-auth.ts` that satisfies that named behavior, then rerun the same command.

- [ ] **Step 3: Document environment and deployment checks**

Append these names with non-secret example values to `.env.example`:

```dotenv
FIREBASE_ADMIN_PROJECT_ID=YOUR_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@YOUR_PROJECT_ID.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nREPLACE_ME\n-----END PRIVATE KEY-----\n"
GUEST_ORDER_LOOKUP_SECRET=GENERATE_AT_LEAST_32_RANDOM_BYTES
```

README instructions must cover Firebase Console → Authentication → Sign-in method → Email/Password enabled, Vercel production domain in authorized domains, the four server-only Vercel values, Firestore rules deployment, and a warning never to paste the service-account JSON into a public variable or commit.

- [ ] **Step 4: Run static and complete automated verification**

Run: `pnpm lint`

Expected: exit 0.

Run: `pnpm test`

Expected: all tests pass with zero unhandled rejections.

Run: `pnpm build:vercel`

Expected: Next.js production build exits 0 and includes `/order-lookup`, `/api/guest-orders`, and `/api/guest-orders/lookup`.

- [ ] **Step 5: Run Firestore rules verification**

Run: `pnpm exec firebase emulators:exec --only firestore,storage --project demo-vitaleaf-rules-test "pnpm vitest run firestore.rules.test.ts storage.rules.test.ts --maxWorkers=1 --no-file-parallelism"`

Expected: all Firestore and Storage rules tests pass.

- [ ] **Step 6: Run desktop and mobile browser verification**

Start: `pnpm dev`

Verify at 1440×900:

1. Add an in-stock product and see the toast.
2. Open cart, type a new quantity, and see total update immediately.
3. Confirm signed-out header order and search button text.
4. Confirm admin link is at the footer bottom.
5. Complete guest checkout, preserve the order number, and retrieve it with the matching phone.
6. Confirm a mismatched phone returns the generic error without personal data.
7. Complete signup, enter My Page, log out, and sign in again.

Verify at 390×844:

1. Cart and My Page icons remain visible in the top-right header with 44px targets.
2. Cart badge changes after adding a product.
3. Search toggle, mobile drawer, and fixed purchase bar do not overlap.
4. Guest lookup form and result fit without horizontal scrolling.
5. All six age menus open, and untagged products never appear in age results.

- [ ] **Step 7: Inspect secrets and working tree, then commit**

Run: `rg -n "BEGIN PRIVATE KEY|firebase-adminsdk-[a-z0-9]+@" . --glob "!.env.example" --glob "!node_modules/**" --glob "!.next/**"`

Expected: no matches.

Run: `git diff --check`

Expected: no whitespace errors.

```bash
git add .env.example README.md components/auth/signup-form.tsx components/auth/login-form.tsx lib/firebase/member-auth.ts components/auth/signup-form.test.tsx components/auth/signup-form.pending.test.tsx components/auth/login-form.test.tsx app/login/page.test.tsx
git commit -m "docs: document guest orders and member signup setup"
```

If auth source files were unchanged, omit them from `git add`. Do not push, deploy, publish Firestore rules, or register Vercel secrets until the user explicitly approves those external actions after local verification.
