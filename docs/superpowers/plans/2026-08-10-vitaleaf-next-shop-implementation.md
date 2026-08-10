# Vitaleaf Next.js Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional Korean health-supplement storefront for customers aged 30–50, with Firestore products, persistent cart, mock checkout, and authenticated product administration.

**Architecture:** Use the Next.js App Router with focused route components and client-side Firebase repositories. Keep product filtering, cart calculations, CSV parsing, and mock payment as pure TypeScript modules so they can be tested independently; isolate browser persistence and Firebase SDK calls behind small adapters.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase Web SDK (Firestore, Authentication, Analytics), Vitest, Testing Library, CSS Modules/global design tokens, Firebase Security Rules.

## Global Constraints

- Target customers are Korean adults aged 30–50; Korean copy must remain readable at desktop and mobile widths.
- Brand theme is Sage & Sand: `#215C45`, `#173F32`, `#F7F3EB`, `#E6EFE7`, `#FFFEFB`, `#183229`, with sale accent `#C94E3C`.
- Product records come from Firestore `products`; production must not substitute fake products when Firestore is empty.
- Cart state persists in `localStorage` and respects stock limits.
- Payment is UI-only and must call the replaceable `processPayment(orderDraft)` boundary.
- Administrator access uses Firebase email/password authentication and requires `admins/{uid}`.
- Product administration includes single-item CRUD and CSV import/export.
- Reviews are read-only and show only records where `approved == true`.
- Product images are managed as URLs; Firebase Storage upload is not included.
- Actual PG integration and order persistence are not included.
- Every user-visible Firebase state has distinct loading, empty, permission, and network-error treatment.

---

## Planned File Structure

```text
app/
  layout.tsx                  # Metadata, fonts, global providers and shell
  globals.css                 # Design tokens and global responsive rules
  providers.tsx               # Cart and toast providers
  page.tsx                    # Home route
  products/page.tsx           # Product discovery route
  products/[id]/page.tsx      # Product detail route
  cart/page.tsx               # Cart route
  checkout/page.tsx           # Checkout route
  order-complete/page.tsx     # Mock completion route
  admin/page.tsx              # Admin route
components/
  shell/site-header.tsx       # Benefit bar, search, nav and cart count
  shell/mega-menu.tsx         # Product, concern, age and trial links
  commerce/product-card.tsx   # Reusable merchandising card
  commerce/product-grid.tsx   # Loading, empty, error and product states
  commerce/product-filters.tsx# Filter and sort controls
  product/product-detail.tsx  # Gallery, price, quantity and CTA
  product/product-info.tsx    # Benefits and information accordions
  product/review-section.tsx  # Approved reviews and summary
  cart/cart-view.tsx          # Select, quantity, totals and shipping progress
  checkout/checkout-form.tsx  # Address, payment selector and submit
  admin/admin-dashboard.tsx   # Login gate and product table
  admin/product-form.tsx      # Product create/edit form
  admin/csv-tools.tsx         # Import validation and export controls
features/cart/
  cart-types.ts               # CartLine and CartState
  cart-utils.ts               # Pure totals and stock functions
  cart-context.tsx            # localStorage-backed React state
lib/firebase/
  client.ts                   # Firebase singleton initialization
  products.ts                 # Product reads and admin writes
  reviews.ts                  # Approved review reads
  auth.ts                     # Login, logout and admin-role check
lib/products/
  types.ts                    # Product domain model
  normalize.ts                # Firestore document validation/defaults
  filter-products.ts          # Search, filters and sort
lib/csv/products-csv.ts       # CSV parse, validate and serialize
lib/payment/process-payment.ts# Replaceable mock payment boundary
lib/format.ts                 # Currency and date formatting
public/products-template.csv  # Bulk import template
firestore.rules               # Public reads and admin-only writes
tests/setup.ts                # Testing Library and browser mocks
vitest.config.ts              # Unit/component test configuration
.env.example                  # Firebase public client variables
README.md                     # Setup, admin, rules and PG replacement guide
```

## Shared Interfaces

All tasks use these names and shapes without renaming them:

```ts
export type Ingredient = {
  name: string;
  amount: string;
  dailyValue: string;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  category: string;
  concerns: string[];
  price: number;
  originalPrice: number | null;
  thumbnailUrl: string;
  images: string[];
  description: string;
  benefits: string[];
  ingredients: Ingredient[];
  dosage: string;
  origin: string;
  certifications: string[];
  cautions: string[];
  stock: number;
  isBest: boolean;
  isNew: boolean;
  salesRank: number | null;
  ratingAverage: number;
  reviewCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ProductFilters = {
  query: string;
  category: string;
  concern: string;
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  sort: 'popular' | 'newest' | 'price-asc' | 'price-desc';
};

export type CartLine = {
  productId: string;
  name: string;
  thumbnailUrl: string;
  unitPrice: number;
  stock: number;
  quantity: number;
  selected: boolean;
};

export type OrderDraft = {
  customerName: string;
  phone: string;
  postcode: string;
  address: string;
  addressDetail: string;
  deliveryNote: string;
  paymentMethod: 'card' | 'bank' | 'easy';
  lines: CartLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
};

export type Review = {
  id: string;
  productId: string;
  rating: number;
  text: string;
  authorAlias: string;
  approved: boolean;
  createdAt: Date | null;
};

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

export type CsvRowError = {
  row: number;
  field: keyof ProductInput | 'row';
  message: string;
};

export type CartContextValue = {
  lines: CartLine[];
  itemCount: number;
  add(product: Product, quantity: number): void;
  remove(productId: string): void;
  setQuantity(productId: string, quantity: number): void;
  setSelected(productId: string, selected: boolean): void;
  selectAll(selected: boolean): void;
  clearSelected(): void;
};
```

---

### Task 1: Scaffold the Next.js App and Test Foundation

**Files:**
- Create: `package.json`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `app/providers.tsx`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `app/page.test.tsx`
- Modify: `.openai/hosting.json`

**Interfaces:**
- Consumes: None.
- Produces: `RootLayout`, `Providers`, global color tokens, `npm run test`, and `npm run build`.

- [ ] **Step 1: Initialize the site project in the existing `vitaleaf-shop` directory**

Run the Sites initializer exactly once, preserve the generated package manager and hosting configuration, then add `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `@firebase/rules-unit-testing` as development dependencies.

- [ ] **Step 2: Write the failing home-shell test**

```tsx
import { render, screen } from '@testing-library/react';
import Home from './page';

it('renders the Vitaleaf storefront entry point in Korean', () => {
  render(<Home />);
  expect(screen.getByRole('heading', { name: '하루 한 번, 기초 건강을 빈틈없이' })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the focused test and verify the starter fails**

Run: `npm test -- app/page.test.tsx`

Expected: FAIL because the starter page does not contain the approved heading.

- [ ] **Step 4: Replace starter metadata, preview skeleton, and global theme**

`app/layout.tsx` must set title `바이탈리프 | 건강을 고르는 새로운 기준`, Korean description, viewport metadata, and wrap children in `<Providers>`. `app/globals.css` must define the exact theme tokens from Global Constraints, a 1180px content width, accessible focus ring, reduced-motion rule, and responsive breakpoints at 900px and 620px. Remove the starter preview component and its imports.

- [ ] **Step 5: Implement the minimum approved home heading**

```tsx
export default function Home() {
  return <main><h1>하루 한 번, 기초 건강을 빈틈없이</h1></main>;
}
```

- [ ] **Step 6: Run tests and build**

Run: `npm test -- app/page.test.tsx && npm run build`

Expected: one passing test and successful deployment build.

- [ ] **Step 7: Commit the foundation**

```bash
git add package.json pnpm-lock.yaml app vitest.config.ts tests .openai/hosting.json
git commit -m "chore: scaffold Vitaleaf Next.js storefront"
```

---

### Task 2: Define and Normalize the Product Domain

**Files:**
- Create: `lib/products/types.ts`
- Create: `lib/products/normalize.ts`
- Create: `lib/products/normalize.test.ts`
- Create: `lib/format.ts`
- Create: `lib/format.test.ts`

**Interfaces:**
- Consumes: Firestore-like `{ id: string; data(): unknown }` input.
- Produces: `normalizeProduct(id: string, raw: unknown): Product`, `formatWon(value: number): string`.

- [ ] **Step 1: Write failing normalization and currency tests**

```ts
it('normalizes missing arrays and timestamps without hiding invalid required fields', () => {
  expect(() => normalizeProduct('p1', { price: 1000 })).toThrow('상품명이 필요합니다');
  const product = normalizeProduct('p1', { name: '루테인', category: '눈 건강', price: 28000, stock: 3 });
  expect(product.images).toEqual([]);
  expect(product.originalPrice).toBeNull();
});

it('formats Korean won without decimals', () => {
  expect(formatWon(44900)).toBe('44,900원');
});
```

- [ ] **Step 2: Run tests and verify missing modules fail**

Run: `npm test -- lib/products/normalize.test.ts lib/format.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement `Product`, `Ingredient`, and normalization**

Use the exact Shared Interfaces. Reject missing `name`, non-finite or negative `price`, and negative `stock`; coerce optional arrays to arrays, booleans to `false`, rating to `0..5`, and Firestore timestamps through `toDate()` when present.

- [ ] **Step 4: Implement `formatWon`**

```ts
export const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
```

- [ ] **Step 5: Run domain tests**

Run: `npm test -- lib/products/normalize.test.ts lib/format.test.ts`

Expected: all domain tests pass.

- [ ] **Step 6: Commit the product domain**

```bash
git add lib/products lib/format.ts lib/format.test.ts
git commit -m "feat: define validated product domain"
```

---

### Task 3: Add Firebase Client and Product Repositories

**Files:**
- Create: `.env.example`
- Create: `lib/firebase/client.ts`
- Create: `lib/firebase/products.ts`
- Create: `lib/firebase/reviews.ts`
- Create: `lib/firebase/products.test.ts`
- Create: `lib/firebase/reviews.test.ts`

**Interfaces:**
- Consumes: Firebase configuration from `NEXT_PUBLIC_FIREBASE_*` variables and `normalizeProduct`.
- Produces: `createProductRepository(adapter)`, `createReviewRepository(adapter)`, `getProducts(): Promise<Product[]>`, `getProduct(id: string): Promise<Product | null>`, `subscribeProducts(onData, onError): Unsubscribe`, `getApprovedReviews(productId): Promise<Review[]>`, `saveProduct(input: ProductInput, id?: string): Promise<string>`, `deleteProduct(id: string): Promise<void>`.

- [ ] **Step 1: Write repository contract tests with a Firebase adapter seam**

```ts
it('returns normalized products and preserves an empty collection', async () => {
  const repository = createProductRepository({ list: async () => [] });
  await expect(repository.getProducts()).resolves.toEqual([]);
});

it('queries only approved reviews for the current product', async () => {
  const calls: unknown[] = [];
  const repository = createReviewRepository({ query: async (...args) => { calls.push(args); return []; } });
  await repository.getApprovedReviews('p1');
  expect(calls[0]).toEqual(['p1', true]);
});
```

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npm test -- lib/firebase/products.test.ts lib/firebase/reviews.test.ts`

Expected: FAIL because repository factories do not exist.

- [ ] **Step 3: Implement the Firebase singleton**

Initialize Firebase once with the supplied project values mapped through `.env.example`; initialize Analytics only when `window` exists and `isSupported()` resolves true. Export `db` and `auth` from `lib/firebase/client.ts`.

- [ ] **Step 4: Implement Firestore repositories**

Read `products`, normalize every document, order best lists by `salesRank`, and write `serverTimestamp()` for `createdAt` and `updatedAt`. `getApprovedReviews` must query `productId == id`, `approved == true`, ordered by `createdAt desc`.

- [ ] **Step 5: Run repository tests**

Run: `npm test -- lib/firebase/products.test.ts lib/firebase/reviews.test.ts`

Expected: repository contract tests pass without network access.

- [ ] **Step 6: Commit Firebase repositories**

```bash
git add .env.example lib/firebase
git commit -m "feat: add Firebase product and review repositories"
```

---

### Task 4: Implement Product Search, Filters, and Sort

**Files:**
- Create: `lib/products/filter-products.ts`
- Create: `lib/products/filter-products.test.ts`

**Interfaces:**
- Consumes: `Product[]`, `ProductFilters`.
- Produces: `filterProducts(products: Product[], filters: ProductFilters): Product[]`.

- [ ] **Step 1: Write table-driven failing tests**

```ts
it.each([
  ['name query', { query: '오메가' }, ['omega']],
  ['benefit query', { query: '혈행' }, ['omega']],
  ['category and stock', { category: '유산균', inStockOnly: true }, ['probiotic']],
  ['price ascending', { sort: 'price-asc' }, ['vitamin', 'probiotic', 'omega']],
])('%s', (_name, partial, expectedIds) => {
  const result = filterProducts(products, { ...defaultFilters, ...partial });
  expect(result.map((product) => product.id)).toEqual(expectedIds);
});
```

- [ ] **Step 2: Run tests and confirm missing function failure**

Run: `npm test -- lib/products/filter-products.test.ts`

Expected: FAIL because `filterProducts` does not exist.

- [ ] **Step 3: Implement deterministic filtering**

Normalize Korean search text with `trim().toLocaleLowerCase('ko-KR')`; match name, category, concerns, benefits, and ingredient names. Apply category, concern, price, and stock filters before a stable sort. Popular sort uses `salesRank`, then `reviewCount`, then name.

- [ ] **Step 4: Run filter tests**

Run: `npm test -- lib/products/filter-products.test.ts`

Expected: all filter and sort cases pass.

- [ ] **Step 5: Commit product discovery logic**

```bash
git add lib/products/filter-products.ts lib/products/filter-products.test.ts
git commit -m "feat: add product search filtering and sort"
```

---

### Task 5: Build the Persistent Cart Domain and Provider

**Files:**
- Create: `features/cart/cart-types.ts`
- Create: `features/cart/cart-utils.ts`
- Create: `features/cart/cart-utils.test.ts`
- Create: `features/cart/cart-context.tsx`
- Create: `features/cart/cart-context.test.tsx`
- Modify: `app/providers.tsx`

**Interfaces:**
- Consumes: `CartLine`, product stock, browser `localStorage`.
- Produces: `calculateCart(lines)`, `clampQuantity(line, next)`, `useCart()` with `add`, `remove`, `setQuantity`, `setSelected`, `selectAll`, `clearSelected`.

- [ ] **Step 1: Write failing cart calculation tests**

```ts
it('calculates selected totals and free shipping at 30,000 won', () => {
  expect(calculateCart([{ ...line, unitPrice: 16000, quantity: 2, selected: true }])).toEqual({
    subtotal: 32000,
    shippingFee: 0,
    total: 32000,
    remainingForFreeShipping: 0,
  });
});

it('clamps quantity between one and stock', () => {
  expect(clampQuantity({ ...line, stock: 3 }, 7)).toBe(3);
  expect(clampQuantity({ ...line, stock: 3 }, 0)).toBe(1);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- features/cart/cart-utils.test.ts`

Expected: FAIL because cart utilities do not exist.

- [ ] **Step 3: Implement pure cart utilities**

Use `3_000` shipping below `30_000`, zero shipping at or above it, and zero totals when no lines are selected.

- [ ] **Step 4: Write and run failing provider persistence test**

```tsx
it('restores valid lines from localStorage and writes updates', async () => {
  localStorage.setItem('vitaleaf-cart-v1', JSON.stringify([line]));
  render(<CartProvider><CartProbe /></CartProvider>);
  expect(await screen.findByText('1개')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
  expect(JSON.parse(localStorage.getItem('vitaleaf-cart-v1')!)[0].quantity).toBe(2);
});
```

Run: `npm test -- features/cart/cart-context.test.tsx`

Expected: FAIL because the provider is missing.

- [ ] **Step 5: Implement `CartProvider`**

Validate stored JSON, discard malformed entries, listen for the browser `storage` event, clamp quantities when stock changes, and expose selected-line totals from `calculateCart`.

- [ ] **Step 6: Run cart tests**

Run: `npm test -- features/cart`

Expected: utility and provider tests pass.

- [ ] **Step 7: Commit the cart domain**

```bash
git add features/cart app/providers.tsx
git commit -m "feat: add persistent stock-aware cart"
```

---

### Task 6: Build the Professional Site Shell and Mega Menu

**Files:**
- Create: `components/shell/site-header.tsx`
- Create: `components/shell/site-header.test.tsx`
- Create: `components/shell/mega-menu.tsx`
- Create: `components/shell/mega-menu.test.tsx`
- Create: `components/shell/site-footer.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `useCart().itemCount`, Next.js navigation, query-string search.
- Produces: responsive global navigation and accessible mega menu.

- [ ] **Step 1: Write failing keyboard and content tests**

```tsx
it('opens the category menu and exposes concern links', async () => {
  render(<SiteHeader />);
  const trigger = screen.getByRole('button', { name: '전체 카테고리' });
  await userEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: '피로·활력' })).toBeVisible();
});
```

- [ ] **Step 2: Run shell tests and verify failure**

Run: `npm test -- components/shell`

Expected: FAIL because shell components do not exist.

- [ ] **Step 3: Implement the approved header hierarchy**

Include the benefit bar, Vitaleaf wordmark, search field, login/admin link, cart count, primary nav, and a mega menu containing product categories, health concerns, age targets, and 7-day trial promotion. The concern circles appear only in the mega menu, not on the home page.

- [ ] **Step 4: Implement keyboard and responsive behavior**

Escape closes the menu, outside click closes it, focus returns to the trigger, and mobile navigation becomes a drawer without horizontal scrolling.

- [ ] **Step 5: Run shell tests and build**

Run: `npm test -- components/shell && npm run build`

Expected: shell tests and build pass.

- [ ] **Step 6: Commit the site shell**

```bash
git add components/shell app/layout.tsx app/globals.css
git commit -m "feat: build responsive Vitaleaf shopping shell"
```

---

### Task 7: Build Home Merchandising and Product Listing

**Files:**
- Create: `components/commerce/product-card.tsx`
- Create: `components/commerce/product-card.test.tsx`
- Create: `components/commerce/product-grid.tsx`
- Create: `components/commerce/product-filters.tsx`
- Create: `components/commerce/product-browser.tsx`
- Modify: `app/page.tsx`
- Create: `app/products/page.tsx`
- Create: `app/products/products-page.test.tsx`

**Interfaces:**
- Consumes: `getProducts`, `filterProducts`, `formatWon`, and URL search params.
- Produces: reusable product cards, home best/new sections, and a complete product browser.

- [ ] **Step 1: Write failing merchandising card tests**

```tsx
it('shows discount, benefit, rating, and sold-out status without relying on color', () => {
  render(<ProductCard product={{ ...product, originalPrice: 40000, price: 32000, stock: 0 }} />);
  expect(screen.getByText('20%')).toBeInTheDocument();
  expect(screen.getByText('품절')).toBeInTheDocument();
  expect(screen.getByText('리뷰 1,624')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run card test and confirm failure**

Run: `npm test -- components/commerce/product-card.test.tsx`

Expected: FAIL because `ProductCard` does not exist.

- [ ] **Step 3: Implement product cards and state grid**

`ProductGrid` accepts `{ status: 'loading' | 'ready' | 'empty' | 'error'; products; retry }`. Loading uses stable skeleton dimensions, empty state links to admin guidance only for administrators, and error state provides a retry button.

- [ ] **Step 4: Write failing filter interaction test**

```tsx
it('combines search and category filters and exposes removable chips', async () => {
  render(<ProductBrowser initialProducts={products} />);
  await userEvent.type(screen.getByRole('searchbox'), '루테인');
  await userEvent.selectOptions(screen.getByLabelText('카테고리'), '눈 건강');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('button', { name: '검색어 루테인 해제' })).toBeVisible();
});
```

- [ ] **Step 5: Implement home and product routes**

Home contains hero, two side promotions, trust bar, daily sales-rank best products with age tabs, new products, and ingredient-transparency section. Product listing includes filters, sort, result count, active chips, and responsive 4/3/2-column grid.

- [ ] **Step 6: Run merchandising tests**

Run: `npm test -- components/commerce app/products`

Expected: card and product-browser tests pass.

- [ ] **Step 7: Commit home and listing**

```bash
git add components/commerce app/page.tsx app/products
git commit -m "feat: add home merchandising and product discovery"
```

---

### Task 8: Build Product Detail and Approved Reviews

**Files:**
- Create: `components/product/product-detail.tsx`
- Create: `components/product/product-detail.test.tsx`
- Create: `components/product/product-info.tsx`
- Create: `components/product/review-section.tsx`
- Create: `app/products/[id]/page.tsx`
- Create: `app/products/[id]/loading.tsx`
- Create: `app/products/[id]/not-found.tsx`

**Interfaces:**
- Consumes: `getProduct`, `getApprovedReviews`, `useCart().add`.
- Produces: gallery, product facts, quantity selection, accordions, reviews, sticky mobile CTA.

- [ ] **Step 1: Write failing quantity and cart tests**

```tsx
it('caps quantity at stock and sends the selected quantity to cart', async () => {
  render(<ProductDetail product={{ ...product, stock: 2 }} reviews={[]} />);
  await userEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
  await userEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
  expect(screen.getByLabelText('수량')).toHaveValue(2);
  await userEvent.click(screen.getByRole('button', { name: '장바구니 담기' }));
  expect(add).toHaveBeenCalledWith(product, 2);
});
```

- [ ] **Step 2: Run detail test and confirm failure**

Run: `npm test -- components/product/product-detail.test.tsx`

Expected: FAIL because detail components do not exist.

- [ ] **Step 3: Implement gallery, facts, and purchase controls**

Show thumbnail gallery, image fallback with product name, price and discount, stock message, shipping benefit, quantity control, add-to-cart and buy-now actions. On mobile, render a fixed bottom action bar with safe-area padding.

- [ ] **Step 4: Implement information accordions**

Render up to three core benefits, dosage, a semantic ingredient table, origin, certifications, and cautions. Accordion buttons use `aria-expanded` and reference controlled regions.

- [ ] **Step 5: Implement approved reviews**

Show average, count, five-to-one rating distribution, and review list. Zero reviews render `아직 등록된 리뷰가 없습니다`; Firestore errors render a retry action without hiding product details.

- [ ] **Step 6: Run detail tests and build**

Run: `npm test -- components/product && npm run build`

Expected: detail tests and dynamic route build pass.

- [ ] **Step 7: Commit product detail**

```bash
git add components/product app/products/[id]
git commit -m "feat: build informative product detail flow"
```

---

### Task 9: Build the Cart Page

**Files:**
- Create: `components/cart/cart-view.tsx`
- Create: `components/cart/cart-view.test.tsx`
- Create: `app/cart/page.tsx`

**Interfaces:**
- Consumes: full `useCart()` API and `calculateCart` results.
- Produces: selected-line checkout link and cart management UI.

- [ ] **Step 1: Write failing cart interaction test**

```tsx
it('updates selection, quantity, free-shipping progress, and total', async () => {
  render(<CartView />);
  expect(screen.getByText('무료배송까지 14,000원 남았어요')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '수량 늘리기' }));
  expect(screen.getByText('배송비 0원')).toBeVisible();
  await userEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }));
  expect(screen.getByRole('link', { name: '선택 상품 주문하기' })).toHaveAttribute('aria-disabled', 'true');
});
```

- [ ] **Step 2: Run cart view test and confirm failure**

Run: `npm test -- components/cart/cart-view.test.tsx`

Expected: FAIL because `CartView` is missing.

- [ ] **Step 3: Implement cart states and controls**

Render empty-cart guidance, line checkboxes, select all, quantity stepper, delete confirmation, selected subtotal, shipping, total, and free-shipping progress. Disable checkout when nothing is selected or selected stock is zero.

- [ ] **Step 4: Run cart tests**

Run: `npm test -- features/cart components/cart`

Expected: domain and cart-view tests pass.

- [ ] **Step 5: Commit cart page**

```bash
git add components/cart app/cart
git commit -m "feat: add complete cart management page"
```

---

### Task 10: Build Validated Mock Checkout and Completion

**Files:**
- Create: `lib/payment/process-payment.ts`
- Create: `lib/payment/process-payment.test.ts`
- Create: `components/checkout/checkout-form.tsx`
- Create: `components/checkout/checkout-form.test.tsx`
- Create: `app/checkout/page.tsx`
- Create: `app/order-complete/page.tsx`

**Interfaces:**
- Consumes: selected cart lines and `OrderDraft`.
- Produces: `processPayment(orderDraft): Promise<{ orderNumber: string; receivedAt: string }>` and validated checkout UI.

- [ ] **Step 1: Write failing payment boundary test**

```ts
it('returns a stable mock order shape without persisting personal data', async () => {
  const result = await processPayment(orderDraft, new Date('2026-08-10T09:00:00Z'));
  expect(result.orderNumber).toMatch(/^VL-20260810-[A-Z0-9]{6}$/);
  expect(result.receivedAt).toBe('2026-08-10T09:00:00.000Z');
});
```

- [ ] **Step 2: Run payment test and confirm failure**

Run: `npm test -- lib/payment/process-payment.test.ts`

Expected: FAIL because payment boundary is missing.

- [ ] **Step 3: Implement the replaceable mock payment boundary**

Generate `VL-YYYYMMDD-XXXXXX`, return ISO time, and make no Firestore or localStorage writes. Keep this module free of React imports.

- [ ] **Step 4: Write failing checkout validation test**

```tsx
it('focuses the first invalid field and submits a valid order once', async () => {
  render(<CheckoutForm />);
  await userEvent.click(screen.getByRole('button', { name: '결제하기' }));
  expect(screen.getByLabelText('받는 분')).toHaveFocus();
  await fillValidAddress();
  await userEvent.click(screen.getByRole('radio', { name: '간편결제' }));
  await userEvent.click(screen.getByRole('button', { name: '결제하기' }));
  expect(processPayment).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Implement checkout and completion routes**

Validate required fields and Korean phone format, show three payment methods, render a sticky order summary on desktop, prevent double submission, move only mock order number through URL state, clear selected cart lines after success, and show `주문이 접수되었습니다` on completion.

- [ ] **Step 6: Run checkout tests**

Run: `npm test -- lib/payment components/checkout`

Expected: payment and form tests pass.

- [ ] **Step 7: Commit checkout**

```bash
git add lib/payment components/checkout app/checkout app/order-complete
git commit -m "feat: add validated mock checkout flow"
```

---

### Task 11: Add Admin Authentication and Product CRUD

**Files:**
- Create: `lib/firebase/auth.ts`
- Create: `lib/firebase/auth.test.ts`
- Create: `components/admin/admin-dashboard.tsx`
- Create: `components/admin/admin-dashboard.test.tsx`
- Create: `components/admin/product-form.tsx`
- Create: `components/admin/product-form.test.tsx`
- Create: `app/admin/page.tsx`

**Interfaces:**
- Consumes: Firebase Auth, `admins/{uid}`, `saveProduct`, `deleteProduct`.
- Produces: `signInAdmin(email, password): Promise<'admin' | 'forbidden'>`, `signOutAdmin()`, authenticated CRUD UI.

- [ ] **Step 1: Write failing admin authorization tests**

```ts
it('signs out an authenticated user without an admins document', async () => {
  const result = await createAdminAuth(adapter).signInAdmin('staff@example.com', 'password');
  expect(result).toBe('forbidden');
  expect(adapter.signOut).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run auth test and confirm failure**

Run: `npm test -- lib/firebase/auth.test.ts`

Expected: FAIL because the admin auth adapter is missing.

- [ ] **Step 3: Implement email/password sign-in and role check**

After `signInWithEmailAndPassword`, check `admins/{uid}` and `role == 'admin'`; sign out and return `forbidden` otherwise. Map invalid credential, network, and disabled-user codes to clear Korean messages.

- [ ] **Step 4: Write failing product-form validation tests**

```tsx
it('rejects negative price and parses line-based arrays', async () => {
  render(<ProductForm onSave={onSave} />);
  await userEvent.type(screen.getByLabelText('상품명'), '데일리 루테인');
  await userEvent.type(screen.getByLabelText('판매가'), '-1');
  await userEvent.click(screen.getByRole('button', { name: '상품 저장' }));
  expect(screen.getByText('판매가는 0원 이상이어야 합니다')).toBeVisible();
  expect(onSave).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement the admin dashboard and form**

Provide login, search, create, edit, delete confirmation, stock toggle, image URL list, line-based benefits/cautions/certifications, structured ingredient rows, save progress, and success/error toasts. Keep the login form separate from the product table so unauthorized users never mount write controls.

- [ ] **Step 6: Run admin tests**

Run: `npm test -- lib/firebase/auth.test.ts components/admin`

Expected: admin auth and form tests pass.

- [ ] **Step 7: Commit admin CRUD**

```bash
git add lib/firebase/auth.ts lib/firebase/auth.test.ts components/admin app/admin
git commit -m "feat: add authenticated product administration"
```

---

### Task 12: Add CSV Bulk Import and Export

**Files:**
- Create: `lib/csv/products-csv.ts`
- Create: `lib/csv/products-csv.test.ts`
- Create: `components/admin/csv-tools.tsx`
- Create: `components/admin/csv-tools.test.tsx`
- Create: `public/products-template.csv`
- Modify: `components/admin/admin-dashboard.tsx`

**Interfaces:**
- Consumes: UTF-8 CSV text and `saveProduct` batch adapter.
- Produces: `parseProductCsv(text): { valid: ProductInput[]; errors: CsvRowError[] }`, `serializeProducts(products): string`.

- [ ] **Step 1: Write failing CSV parsing tests**

```ts
it('parses quoted commas, line arrays, booleans, and reports row numbers', () => {
  const result = parseProductCsv('name,category,price,stock,benefits\n"오메가3, 프리미엄",혈행,35000,10,"혈행|기억력"\n불량,혈행,-1,2,혈행');
  expect(result.valid[0].benefits).toEqual(['혈행', '기억력']);
  expect(result.errors[0]).toMatchObject({ row: 3, field: 'price' });
});
```

- [ ] **Step 2: Run CSV test and confirm failure**

Run: `npm test -- lib/csv/products-csv.test.ts`

Expected: FAIL because CSV functions do not exist.

- [ ] **Step 3: Implement CSV parser and serializer**

Support RFC-style quotes, UTF-8 BOM, `|`-delimited arrays, numeric and boolean conversion, exact row/field messages, and safe spreadsheet export by prefixing cells beginning with `=`, `+`, `-`, or `@` with an apostrophe.

- [ ] **Step 4: Write failing CSV tool test**

```tsx
it('blocks upload when any row is invalid and shows every row error', async () => {
  render(<CsvTools products={[]} onImport={onImport} />);
  await userEvent.upload(screen.getByLabelText('CSV 파일'), invalidCsvFile);
  expect(screen.getByText('3행 판매가: 0원 이상이어야 합니다')).toBeVisible();
  expect(onImport).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement CSV UI and template**

Download the exact header template, preview valid row count, list every invalid row, require confirmation before Firestore batch import, limit one batch to 400 writes, and export current products with a UTF-8 BOM for Excel.

- [ ] **Step 6: Run CSV tests**

Run: `npm test -- lib/csv components/admin/csv-tools.test.tsx`

Expected: parser and UI tests pass.

- [ ] **Step 7: Commit bulk administration**

```bash
git add lib/csv components/admin/csv-tools.tsx components/admin/csv-tools.test.tsx public/products-template.csv components/admin/admin-dashboard.tsx
git commit -m "feat: add safe product CSV import and export"
```

---

### Task 13: Add Firestore Rules and Operations Guide

**Files:**
- Create: `firestore.rules`
- Create: `firestore.rules.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: Firebase Auth UID and `admins/{uid}` documents.
- Produces: public product reads, approved-review reads, admin-only product writes, denied order/review writes.

- [ ] **Step 1: Write failing rules contract tests**

```ts
it('allows public products reads and blocks non-admin writes', async () => {
  await assertSucceeds(publicDb.doc('products/p1').get());
  await assertFails(publicDb.doc('products/p1').set(validProduct));
  await assertSucceeds(adminDb.doc('products/p1').set(validProduct));
});
```

- [ ] **Step 2: Run rules tests and confirm failure**

Run: `npm test -- firestore.rules.test.ts`

Expected: FAIL until emulator test setup and rules are present.

- [ ] **Step 3: Implement rules**

```text
function isAdmin() {
  return request.auth != null
    && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
}
match /products/{id} { allow read: if true; allow write: if isAdmin(); }
match /reviews/{id} { allow read: if resource.data.approved == true; allow write: if false; }
match /admins/{id} { allow read: if request.auth.uid == id; allow write: if false; }
match /orders/{id} { allow read, write: if false; }
```

- [ ] **Step 4: Write the operations guide**

README must include exact environment variable names, `npm install`, `npm run dev`, `npm test`, `npm run build`, Firebase Auth email/password enablement, admin UID document creation, rules deployment through Firebase Console, CSV column descriptions, image URL expectations, and the file/function to replace for PG integration.

- [ ] **Step 5: Run rules and full unit suite**

Run: `npm test`

Expected: all application and rules tests pass.

- [ ] **Step 6: Commit security and documentation**

```bash
git add firestore.rules firestore.rules.test.ts README.md
git commit -m "docs: add Firebase security and operations guide"
```

---

### Task 14: Full-Story Verification, Social Preview, and Hosting

**Files:**
- Create: `public/og.png`
- Modify: `app/layout.tsx`
- Modify: implementation files only when verification exposes a failing requirement

**Interfaces:**
- Consumes: complete storefront and configured Firebase project.
- Produces: verified build, social metadata, and deployed Sites URL.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test && npm run build`

Expected: zero failing tests and successful production build.

- [ ] **Step 2: Start the retained development server and open it once**

Run: `npm run dev`

Use the exact local URL printed by the server. Do not scan ports or open duplicate preview tabs.

- [ ] **Step 3: Verify the desktop customer flow**

At desktop width, verify: mega menu open/close, search, combined filters, sort, product detail gallery, accordion, add to cart, cart quantity and selection, checkout validation, payment-method selection, double-submit prevention, and completion message.

- [ ] **Step 4: Verify the mobile customer flow**

At 390px width, verify: no horizontal overflow, readable Korean, drawer navigation, two-column products, mobile sticky product CTA, cart totals, checkout form, and safe-area spacing.

- [ ] **Step 5: Verify persistence and failure states**

Reload the cart and confirm quantities remain. Test empty Firestore, denied admin, failed product image, unavailable reviews, and network retry UI without showing hardcoded production products.

- [ ] **Step 6: Verify the administrator flow**

Sign in as an admin, create a product, edit price and stock, export CSV, import a valid CSV, reject an invalid CSV, and delete the created product after confirmation.

- [ ] **Step 7: Generate and inspect one social preview image**

Generate a single 1200×630 social card using the approved Sage & Sand palette, Vitaleaf wordmark, Korean headline, and the same restrained product-pack motif as the finished hero. Inspect the resulting Korean text; retry once only if unusable. Wire a passing image to absolute Open Graph and X metadata.

- [ ] **Step 8: Re-run verification after social metadata**

Run: `npm test && npm run build`

Expected: all tests pass and the final production build succeeds.

- [ ] **Step 9: Commit verified release**

```bash
git add app public components features lib firestore.rules README.md
git commit -m "feat: complete verified Vitaleaf storefront"
```

- [ ] **Step 10: Publish through Sites**

Use `sites-hosting`, confirm the deployed URL loads, then stop the retained development server and return the deployed URL as the primary deliverable.
