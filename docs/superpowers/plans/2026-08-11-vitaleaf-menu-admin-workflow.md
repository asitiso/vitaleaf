# Vitaleaf Complete Menu and Admin Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every storefront menu destination functional and provide an admin-friendly draft, image-upload, preview, and publish workflow for products.

**Architecture:** Storefront navigation and admin select options share one taxonomy/menu registry. Published products remain in `products`, while unfinished work lives in admin-only `productDrafts`; publishing uses one Firestore batch to replace the public document and remove the draft. Firebase Storage is accessed through a small upload adapter, and the current product detail UI is reused for authenticated draft preview.

**Tech Stack:** React 19, TypeScript, Next.js App Router-compatible Vinext, Firebase Auth/Firestore/Storage, Vitest, Testing Library, Firebase Emulator, CSS.

## Global Constraints

- Preserve the existing Sage & Sand visual system, Korean copy, 30–50 target readability, and current private Sites deployment.
- Do not revert the project to a single HTML file and do not replace Firestore products with hardcoded production data.
- Keep real payment and order persistence out of scope; preserve the `processPayment(orderDraft)` replacement boundary.
- Public product links continue to use Firestore document IDs, not slugs.
- `products` contains only published products; `productDrafts` is admin-only.
- Product uploads accept only JPEG, PNG, and WebP files up to exactly 10 MiB (`10 * 1024 * 1024` bytes).
- Do not introduce a drag-and-drop dependency; use native input/drag events plus keyboard move buttons.
- Do not generate unverified certifications, treatment claims, review counts, ratings, or sales ranks.
- Every task uses RED → GREEN tests, preserves unrelated work, runs focused lint, and ends in a scoped commit.

---

## File Structure

- `lib/catalog/taxonomy.ts`: shared category, concern, age, promotion, and product template definitions.
- `lib/navigation/storefront-menu.ts`: all header, mega-menu, mobile, and footer destinations.
- `lib/navigation/menu-state.ts`: maps supported URL search parameters to page title, description, and normalized filters.
- `lib/site/policies.ts`: editable brand, support, shipping, returns, and health-information copy.
- `components/content/info-page.tsx`: reusable content-page presentation.
- `lib/products/types.ts`: published product, media, and draft types.
- `lib/products/normalize.ts`: legacy `thumbnailUrl`/`images[]` compatibility and new media normalization.
- `lib/firebase/product-drafts.ts`: draft CRUD, autosave, publish, unpublish, duplicate, and draft subscription.
- `lib/firebase/product-media.ts`: Storage validation, resumable upload, delete, and URL/path mapping.
- `components/admin/product-wizard/*`: focused wizard shell and four steps.
- `features/admin/use-draft-autosave.ts`: debounced autosave state machine.
- `app/admin/products/preview/[draftId]/*`: authenticated draft preview.
- `firestore.rules` and `storage.rules`: explicit admin-only draft/media writes.

---

### Task 1: Shared Taxonomy and Menu Registry

**Files:**
- Create: `lib/catalog/taxonomy.ts`
- Create: `lib/navigation/storefront-menu.ts`
- Create: `lib/navigation/storefront-menu.test.ts`
- Modify: `components/shell/site-header.tsx`
- Modify: `components/shell/mega-menu.tsx`
- Modify: `components/shell/site-footer.tsx`
- Modify: `components/shell/site-header.test.tsx`
- Modify: `components/shell/mega-menu.test.tsx`
- Modify: `components/shell/site-footer.test.tsx`

**Interfaces:**
- Produces: `PRODUCT_CATEGORIES`, `HEALTH_CONCERNS`, `AGE_TARGETS`, `PRODUCT_TEMPLATES`.
- Produces: `STOREFRONT_MENU` with `header`, `categories`, `concerns`, `ages`, `footer` arrays.
- Consumers: storefront shell, product query state, and admin wizard.

- [ ] **Step 1: Write the registry contract test**

```ts
it("uses unique supported destinations and shares taxonomy values", () => {
  const links = flattenMenuLinks(STOREFRONT_MENU);
  expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
  expect(STOREFRONT_MENU.categories.map((item) => item.value))
    .toEqual(PRODUCT_CATEGORIES.map((item) => item.value));
  expect(links.every((link) => link.href.startsWith("/"))).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- lib/navigation/storefront-menu.test.ts`
Expected: FAIL because the registry modules do not exist.

- [ ] **Step 3: Define exact shared values**

```ts
export type TaxonomyOption = { value: string; label: string; description: string };

export const PRODUCT_CATEGORIES = [
  { value: "nutrition", label: "영양제", description: "매일 챙기는 기본 영양" },
  { value: "vitamin", label: "비타민", description: "비타민과 미네랄" },
  { value: "probiotic", label: "유산균", description: "장 건강을 위한 프로바이오틱스" },
  { value: "wellness", label: "웰니스", description: "생활 습관별 건강 관리" },
  { value: "food", label: "건강식품", description: "간편하게 섭취하는 건강식품" },
  { value: "gift", label: "선물세트", description: "건강을 전하는 구성" },
] as const satisfies readonly TaxonomyOption[];
```

Define concerns `energy`, `immunity`, `sleep`, `eyes`, `gut`, `brain`, age values `30`, `40`, `50`, and template values `vitamin`, `probiotic`, `omega3` in the same file.

- [ ] **Step 4: Create the menu registry and consume it in shell components**

```ts
export type StorefrontMenuItem = {
  key: string;
  label: string;
  href: string;
  value?: string;
  description?: string;
};

export const STOREFRONT_MENU = {
  header: [
    { key: "best", label: "베스트", href: "/products?sort=popular" },
    { key: "today", label: "오늘의 특가", href: "/products?promotion=today" },
    { key: "concerns", label: "건강 고민별", href: "/products?view=concerns" },
    { key: "gift", label: "선물세트", href: "/products?category=gift" },
    { key: "ingredients", label: "성분 가이드", href: "/ingredients" },
  ],
  footer: [
    { key: "story", label: "브랜드 소개", href: "/story" },
    { key: "help", label: "고객센터", href: "/help" },
    { key: "shipping", label: "배송 안내", href: "/help/shipping" },
    { key: "returns", label: "교환·반품", href: "/help/returns" },
  ],
  categories: PRODUCT_CATEGORIES.map(toCategoryMenuItem),
  concerns: HEALTH_CONCERNS.map(toConcernMenuItem),
  ages: AGE_TARGETS.map(toAgeMenuItem),
} as const;
```

- [ ] **Step 5: Run shell tests and lint**

Run: `npm test -- lib/navigation/storefront-menu.test.ts components/shell`
Expected: PASS; desktop and drawer use the same labels and hrefs.

Run: `npm run lint -- components/shell lib/catalog lib/navigation`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/catalog lib/navigation components/shell
git commit -m "feat: centralize storefront navigation taxonomy"
```

---

### Task 2: Functional Menu States and Information Routes

**Files:**
- Create: `lib/navigation/menu-state.ts`
- Create: `lib/navigation/menu-state.test.ts`
- Create: `lib/site/policies.ts`
- Create: `components/content/info-page.tsx`
- Create: `components/content/info-page.test.tsx`
- Create: `app/story/page.tsx`
- Create: `app/help/page.tsx`
- Create: `app/help/shipping/page.tsx`
- Create: `app/help/returns/page.tsx`
- Create: `app/ingredients/page.tsx`
- Modify: `app/products/page.tsx`
- Modify: `components/commerce/product-browser.tsx`
- Modify: `app/products/products-page.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 1 taxonomy and menu values.
- Produces: `resolveMenuState(searchParams): MenuPageState`.
- Produces: real routes for every informational menu destination.

- [ ] **Step 1: Write failing URL-state tests**

```ts
it.each([
  [{ sort: "popular" }, "베스트 상품"],
  [{ promotion: "today" }, "오늘의 특가"],
  [{ view: "concerns" }, "건강 고민별 상품"],
  [{ category: "gift" }, "선물세트"],
  [{ age: "40" }, "40대 추천"],
])("resolves supported menu state", (params, title) => {
  expect(resolveMenuState(params)).toMatchObject({ title });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- lib/navigation/menu-state.test.ts app/products/products-page.test.tsx`
Expected: FAIL because menu-state resolution and information routes are absent.

- [ ] **Step 3: Implement strict state parsing**

```ts
export type MenuPageState = {
  title: string;
  description: string;
  filters: ProductFilters;
  promotion: "today" | "trial" | null;
  age: "30" | "40" | "50" | null;
};

export function resolveMenuState(params: Record<string, string | string[] | undefined>): MenuPageState {
  const category = readAllowed(params.category, PRODUCT_CATEGORIES);
  const concern = readAllowed(params.concern, HEALTH_CONCERNS);
  const age = readAllowed(params.age, AGE_TARGETS);
  return buildMenuPageState({ category, concern, age, ...parseExistingFilters(params) });
}
```

Unsupported values must normalize to an unfiltered product list instead of creating a blank or broken state.

- [ ] **Step 4: Add editable policies and real pages**

```ts
export const STORE_POLICIES = {
  support: { phone: "02-1234-5678", hours: "평일 09:00–18:00", lunch: "12:00–13:00" },
  shipping: { freeThreshold: 30_000, baseFee: 3_000, dispatch: "결제 확인 후 영업일 기준 순차 출고" },
  returns: { requestWindow: "수령 후 7일 이내", contactRequired: true },
} as const;
```

Use `InfoPage` for story/help/shipping/returns. The ingredients page lists vitamins, probiotics, omega-3, minerals, and botanical ingredients with “일반 정보이며 질병의 진단·치료를 대신하지 않습니다” and related product links.

- [ ] **Step 5: Verify routes, filters, accessibility, and CSS**

Run: `npm test -- lib/navigation components/content app/products`
Expected: PASS; all menu titles, empty states, and links render.

Run: `npm run lint -- app components/content lib/navigation lib/site`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/story app/help app/ingredients app/products components/content components/commerce lib/navigation lib/site app/globals.css
git commit -m "feat: complete storefront menu destinations"
```

---

### Task 3: Product Media and Draft Domain

**Files:**
- Modify: `lib/products/types.ts`
- Modify: `lib/products/normalize.ts`
- Modify: `lib/products/normalize.test.ts`
- Create: `lib/products/draft.ts`
- Create: `lib/products/draft.test.ts`

**Interfaces:**
- Produces: `ProductMedia`, `ProductDraft`, `DraftStatus`, `normalizeMedia`, `validatePublishableDraft`, `toPublishedProductInput`.
- Consumers: Storage adapter, draft repository, wizard, preview, and dashboard.

- [ ] **Step 1: Write legacy and draft validation tests**

```ts
it("normalizes legacy image fields into ordered media", () => {
  expect(normalizeProduct("legacy", { ...legacyProduct, thumbnailUrl: "a.jpg", images: ["b.jpg"] }).media)
    .toEqual([
      { url: "a.jpg", storagePath: null, alt: "상품 대표 이미지", order: 0 },
      { url: "b.jpg", storagePath: null, alt: "상품 상세 이미지 2", order: 1 },
    ]);
});

it("allows incomplete drafts but blocks publishing them", () => {
  expect(validatePublishableDraft(makeDraft({ name: "" }))).toContainEqual(
    expect.objectContaining({ field: "name" }),
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- lib/products/normalize.test.ts lib/products/draft.test.ts`
Expected: FAIL because media and draft types do not exist.

- [ ] **Step 3: Add types with backward compatibility**

```ts
export type ProductMedia = {
  url: string;
  storagePath: string | null;
  alt: string;
  order: number;
};

export type DraftStatus = "draft" | "publishing" | "published-copy";

export type ProductDraft = ProductInput & {
  id: string;
  media: ProductMedia[];
  status: DraftStatus;
  sourceProductId: string | null;
  currentStep: 1 | 2 | 3 | 4;
  createdAt: Date | null;
  updatedAt: Date | null;
};
```

Add `media` to `Product` and keep `thumbnailUrl`/`images` so existing components and cart snapshots remain compatible during migration.

- [ ] **Step 4: Implement deterministic conversion and publish validation**

`normalizeMedia` deduplicates URLs, orders by `order`, and falls back to legacy fields. `toPublishedProductInput` derives `thumbnailUrl` from media item 0 and `images` from all ordered media URLs. Validation returns `{ step, field, message }[]` for name, category, price, stock, media, dosage, ingredients, origin, and cautions.

- [ ] **Step 5: Run focused tests and lint**

Run: `npm test -- lib/products`
Expected: PASS, including all pre-existing product tests.

Run: `npm run lint -- lib/products`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/products
git commit -m "feat: add product draft and media domain"
```

---

### Task 4: Firebase Storage Upload Boundary and Rules

**Files:**
- Create: `lib/firebase/product-media.ts`
- Create: `lib/firebase/product-media.test.ts`
- Modify: `lib/firebase/client.ts`
- Create: `storage.rules`
- Create: `storage.rules.test.ts`
- Create: `firebase.json`

**Interfaces:**
- Consumes: `ProductMedia` from Task 3.
- Produces: `validateImageFile`, `uploadProductImage`, `deleteProductImage`, `UploadTaskController`.

- [ ] **Step 1: Write file validation and adapter tests**

```ts
it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s under 10 MiB", (type) => {
  expect(validateImageFile(fakeFile({ type, size: 10 * 1024 * 1024 }))).toEqual({ ok: true });
});

it("rejects oversized or unsupported files before upload", () => {
  expect(validateImageFile(fakeFile({ type: "image/gif", size: 1 }))).toMatchObject({ ok: false });
  expect(validateImageFile(fakeFile({ type: "image/png", size: 10 * 1024 * 1024 + 1 }))).toMatchObject({ ok: false });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- lib/firebase/product-media.test.ts`
Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the resumable adapter**

```ts
export type UploadTaskController = {
  promise: Promise<ProductMedia>;
  cancel(): void;
};

export function uploadProductImage(args: {
  productId: string;
  file: File;
  alt: string;
  order: number;
  onProgress(percent: number): void;
}): UploadTaskController;
```

Generate a filename from `crypto.randomUUID()` plus a verified extension, use `products/${productId}/${filename}`, and wrap `uploadBytesResumable`. Return `storagePath` and download URL only after completion. `deleteProductImage` accepts an already validated `storagePath` beginning with `products/${productId}/`.

- [ ] **Step 4: Add explicit Storage admin rules**

```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAdmin() {
      return request.auth != null
        && firestore.get(/databases/(default)/documents/admins/$(request.auth.uid)).data.role == "admin";
    }
    match /products/{productId}/{fileName} {
      allow read: if true;
      allow create, update: if isAdmin()
        && request.resource.size <= 10 * 1024 * 1024
        && request.resource.contentType.matches('image/(jpeg|png|webp)');
      allow delete: if isAdmin();
    }
    match /{allPaths=**} { allow read, write: if false; }
  }
}
```

Configure `firebase.json` with Firestore and Storage rule paths and emulator ports, without setting a production project ID.

- [ ] **Step 5: Run focused unit and emulator tests**

Run: `npm test -- lib/firebase/product-media.test.ts`
Expected: PASS.

Run: `npx firebase-tools@15.26.0 emulators:exec --only firestore,storage --project demo-vitaleaf-rules-test "npm test -- storage.rules.test.ts --maxWorkers=1 --no-file-parallelism"`
Expected: admin upload/delete allowed; signed-out, role mismatch, invalid MIME, and >10 MiB denied.

- [ ] **Step 6: Commit**

```bash
git add lib/firebase/client.ts lib/firebase/product-media.ts lib/firebase/product-media.test.ts storage.rules storage.rules.test.ts firebase.json
git commit -m "feat: add secure product image uploads"
```

---

### Task 5: Draft Repository, Publish Batch, and Firestore Rules

**Files:**
- Create: `lib/firebase/product-drafts.ts`
- Create: `lib/firebase/product-drafts.test.ts`
- Modify: `lib/firebase/products.ts`
- Modify: `firestore.rules`
- Modify: `firestore.rules.test.ts`

**Interfaces:**
- Consumes: Task 3 conversion and validation functions.
- Produces: `createDraftId`, `saveDraft`, `getDraft`, `subscribeDrafts`, `publishDraft`, `unpublishProduct`, `discardDraft`, `duplicateProductToDraft`.

- [ ] **Step 1: Write repository boundary tests**

```ts
it("publishes with one batch and removes the completed draft", async () => {
  await repository.publishDraft(completeDraft);
  expect(batch.set).toHaveBeenCalledWith(productRef, expect.objectContaining({ name: completeDraft.name }));
  expect(batch.delete).toHaveBeenCalledWith(draftRef);
  expect(batch.commit).toHaveBeenCalledOnce();
});

it("duplicates as a zero-stock draft without social proof", async () => {
  const copy = await repository.duplicateProductToDraft(publishedProduct);
  expect(copy).toMatchObject({ name: `${publishedProduct.name} (복사본)`, stock: 0, ratingAverage: 0, reviewCount: 0, salesRank: null });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- lib/firebase/product-drafts.test.ts firestore.rules.test.ts`
Expected: FAIL because draft repository and rules are absent.

- [ ] **Step 3: Implement adapter-injected repository**

```ts
export type ProductDraftRepositoryAdapter = {
  createId(): string;
  save(id: string, value: ProductDraftWrite): Promise<void>;
  get(id: string): Promise<FirestoreDocument | null>;
  subscribe(onData: (documents: FirestoreDocument[]) => void, onError: (error: Error) => void): Unsubscribe;
  commitPublish(id: string, product: ProductInput): Promise<void>;
  commitUnpublish(id: string, draft: ProductDraftWrite): Promise<void>;
  delete(id: string): Promise<void>;
  timestamp(): unknown;
};
```

Use the same race-safe adapter/test style as existing auth and product repositories. `publishDraft` calls `validatePublishableDraft` before the adapter batch.

- [ ] **Step 4: Extend Firestore rules**

```rules
match /productDrafts/{draftId} {
  allow read, create, update, delete: if isAdmin();
}
```

Keep public `products` reads and explicit-role admin writes unchanged. Add role mismatch and signed-out draft read/write denial, admin draft CRUD allowance, and nested default-deny tests.

- [ ] **Step 5: Run repository and emulator tests**

Run: `npm test -- lib/firebase/product-drafts.test.ts lib/firebase/products.test.ts`
Expected: PASS.

Run: `npx firebase-tools@15.26.0 emulators:exec --only firestore --project demo-vitaleaf-rules-test "npm test -- firestore.rules.test.ts --maxWorkers=1 --no-file-parallelism"`
Expected: all existing and new rule contracts PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/firebase/product-drafts.ts lib/firebase/product-drafts.test.ts lib/firebase/products.ts firestore.rules firestore.rules.test.ts
git commit -m "feat: add secure product draft publishing"
```

---

### Task 6: Four-Step Product Wizard Shell

**Files:**
- Create: `components/admin/product-wizard/product-wizard.tsx`
- Create: `components/admin/product-wizard/product-wizard.test.tsx`
- Create: `components/admin/product-wizard/basic-step.tsx`
- Create: `components/admin/product-wizard/details-step.tsx`
- Create: `components/admin/product-wizard/sales-step.tsx`
- Create: `components/admin/product-wizard/wizard-actions.tsx`
- Modify: `components/admin/admin-dashboard.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 1 taxonomy and Task 3 draft validation.
- Produces: `ProductWizard({ draft, onChange, onSave, onPreview, onPublish })`.
- Leaves media step as a typed slot completed in Task 7.

- [ ] **Step 1: Write wizard behavior tests**

```tsx
it("moves through four labelled steps and focuses the first publish error", async () => {
  render(<ProductWizard {...propsFor(incompleteDraft)} />);
  expect(screen.getByRole("navigation", { name: "상품 등록 단계" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "판매 공개" }));
  expect(screen.getByLabelText("상품명")).toHaveFocus();
  expect(screen.getByText("상품명을 입력해 주세요.")).toBeVisible();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- components/admin/product-wizard/product-wizard.test.tsx`
Expected: FAIL because the wizard does not exist.

- [ ] **Step 3: Implement wizard state and step components**

```ts
export type WizardProps = {
  draft: ProductDraft;
  saveState: "idle" | "saving" | "saved" | "error";
  onChange(next: ProductDraft): void;
  onSave(): Promise<void>;
  onPreview(): void;
  onPublish(): Promise<void>;
};
```

Basic step uses shared taxonomy values and tracks `slugWasManuallyEdited`. Details step uses repeatable benefit, ingredient, certification, and caution rows. Sales step owns price, original price, stock, `isBest`, `isNew`, and promotion flags. Each button is at least 44px tall.

- [ ] **Step 4: Add error summary and mobile action bar**

On publish, group errors by step, navigate to the first error step, set `aria-invalid`/`aria-describedby`, and focus the first invalid input. `WizardActions` shows previous, next, save, preview, publish; mobile CSS uses `position: sticky`, `bottom: 0`, and `env(safe-area-inset-bottom)`.

- [ ] **Step 5: Run tests and lint**

Run: `npm test -- components/admin/product-wizard components/admin/product-form.test.tsx`
Expected: PASS; preserve existing form behavior until Task 9 removes the old entry point.

Run: `npm run lint -- components/admin/product-wizard components/admin/admin-dashboard.tsx`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/admin/product-wizard components/admin/admin-dashboard.tsx app/globals.css
git commit -m "feat: add guided product registration wizard"
```

---

### Task 7: Wizard Media Upload Step

**Files:**
- Create: `components/admin/product-wizard/media-step.tsx`
- Create: `components/admin/product-wizard/media-step.test.tsx`
- Modify: `components/admin/product-wizard/product-wizard.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 4 `uploadProductImage`/`deleteProductImage` and Task 3 media type.
- Produces: accessible upload queue and ordered `ProductMedia[]` updates.

- [ ] **Step 1: Write upload, retry, representative image, and keyboard reorder tests**

```tsx
it("uploads valid files, makes the first success representative, and supports keyboard reorder", async () => {
  render(<MediaStep {...props} upload={uploadMock} />);
  await user.upload(screen.getByLabelText("상품 이미지 추가"), [firstFile, secondFile]);
  expect(await screen.findByText("업로드 완료")).toBeVisible();
  expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ order: 0, alt: expect.any(String) }),
  ]));
  await user.click(screen.getByRole("button", { name: "두 번째 이미지를 앞으로 이동" }));
  expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ url: "second.jpg", order: 0 }),
  ]));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- components/admin/product-wizard/media-step.test.tsx`
Expected: FAIL because media step is absent.

- [ ] **Step 3: Implement native drop zone and upload queue**

Validate every file before calling the adapter. Show filename, preview, percentage, cancel, retry, and failure reason per item. Revoke object URLs on replacement and unmount. Disable publish while uploads are running.

- [ ] **Step 4: Implement media editing**

Support representative selection, alt text, native pointer drag, keyboard “앞으로/뒤로 이동”, and delete confirmation. Reindex `order` after every operation. Deleting order 0 promotes the next item. Storage deletion failure keeps the item and shows a retryable alert.

- [ ] **Step 5: Run tests and lint**

Run: `npm test -- components/admin/product-wizard/media-step.test.tsx lib/firebase/product-media.test.ts`
Expected: PASS.

Run: `npm run lint -- components/admin/product-wizard/media-step.tsx`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/admin/product-wizard/media-step.tsx components/admin/product-wizard/media-step.test.tsx components/admin/product-wizard/product-wizard.tsx app/globals.css
git commit -m "feat: add accessible product image manager"
```

---

### Task 8: Autosave, Draft Preview, and Publish Flow

**Files:**
- Create: `features/admin/use-draft-autosave.ts`
- Create: `features/admin/use-draft-autosave.test.tsx`
- Create: `app/admin/products/preview/[draftId]/page.tsx`
- Create: `app/admin/products/preview/[draftId]/draft-preview.tsx`
- Create: `app/admin/products/preview/[draftId]/draft-preview.test.tsx`
- Modify: `components/admin/product-wizard/product-wizard.tsx`
- Modify: `components/admin/admin-dashboard.tsx`

**Interfaces:**
- Consumes: Task 5 draft repository and existing admin session observer.
- Produces: `useDraftAutosave({ draft, save, delayMs: 1200 })` and authenticated preview route.

- [ ] **Step 1: Write fake-timer autosave and preview authorization tests**

```ts
it("saves the latest draft once after 1200ms and exposes retry after failure", async () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(useDraftAutosave, { initialProps: props(draftA) });
  rerender(props(draftB));
  await vi.advanceTimersByTimeAsync(1_199);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenCalledWith(draftB);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- features/admin/use-draft-autosave.test.tsx app/admin/products/preview/[draftId]/draft-preview.test.tsx`
Expected: FAIL because hook and preview are absent.

- [ ] **Step 3: Implement race-safe autosave**

Use a generation counter so a slow response for draft A cannot overwrite draft B’s status. State is `idle | dirty | saving | saved | error`; retry saves the latest ref. Skip blank untouched drafts, flush pending changes on explicit save, and do not clear draft state on failure. Register `beforeunload` only while state is `dirty` or `saving`, remove it after save/unmount, and route dashboard-close actions through the same unsaved-change confirmation.

- [ ] **Step 4: Implement admin-only preview and publishing**

Preview observes admin session, loads `productDrafts/{draftId}` only after authorization, converts it with `toPublishedProductInput`, and renders the existing `ProductDetail` with a visible “미리보기” banner and disabled purchase controls. Publish locks once, flushes autosave, validates, calls `publishDraft`, shows status, and returns to the dashboard.

- [ ] **Step 5: Run focused tests and lint**

Run: `npm test -- features/admin app/admin/products components/admin/product-wizard`
Expected: PASS, including stale response and double-publish tests.

Run: `npm run lint -- features/admin app/admin/products components/admin`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add features/admin app/admin/products components/admin
git commit -m "feat: add autosaved draft preview and publish"
```

---

### Task 9: Admin Dashboard Status, Duplicate, and Unpublish Operations

**Files:**
- Modify: `components/admin/admin-dashboard.tsx`
- Modify: `components/admin/admin-dashboard.test.tsx`
- Create: `components/admin/product-table.tsx`
- Create: `components/admin/product-table.test.tsx`
- Delete: `components/admin/product-form.tsx`
- Delete: `components/admin/product-form.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: Task 5 published/draft subscriptions and operations, Task 6 wizard.
- Produces: dashboard views `published | drafts | csv` and quick actions.

- [ ] **Step 1: Write status/filter/action tests**

```tsx
it("searches both collections and duplicates into an unpublished zero-stock draft", async () => {
  render(<AdminDashboard dependencies={dependencies} />);
  await user.type(screen.getByRole("searchbox", { name: "상품 검색" }), "오메가");
  expect(screen.getByText("데일리 오메가3")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "데일리 오메가3 복제" }));
  expect(dependencies.duplicateProductToDraft).toHaveBeenCalledWith("daily-omega-3");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- components/admin/admin-dashboard.test.tsx components/admin/product-table.test.tsx`
Expected: FAIL because draft tabs and actions are absent.

- [ ] **Step 3: Split product table from dashboard orchestration**

`ProductTable` receives rows with `kind: "published" | "draft"`, supports name/ID/category search, status filters `all | published | draft | sold-out`, and modified-desc sorting. Each row shows media, status, price, stock, timestamp, edit, duplicate, preview, publish/unpublish, and delete.

- [ ] **Step 4: Implement guarded operations**

Use per-document mutation locks. Duplicate creates only a draft. Unpublish dialog explains that the public product disappears and calls `unpublishProduct`. Delete distinguishes draft discard from published deletion and restores focus after modal close. Remove the legacy form only after the wizard covers its fields and tests.

- [ ] **Step 5: Run admin tests and lint**

Run: `npm test -- components/admin lib/firebase/product-drafts.test.ts`
Expected: PASS; auth race and existing delete-dialog accessibility tests remain green.

Run: `npm run lint -- components/admin`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/admin app/globals.css
git commit -m "feat: streamline admin product operations"
```

---

### Task 10: CSV Import to Drafts and Category Templates

**Files:**
- Modify: `components/admin/csv-tools.tsx`
- Modify: `components/admin/csv-tools.test.tsx`
- Modify: `lib/csv/products-csv.ts`
- Modify: `lib/csv/products-csv.test.ts`
- Modify: `public/products-template.csv`
- Modify: `components/admin/product-wizard/basic-step.tsx`
- Modify: `components/admin/product-wizard/product-wizard.test.tsx`

**Interfaces:**
- Consumes: Task 1 `PRODUCT_TEMPLATES`, Task 5 `saveDraft`.
- Produces: CSV preview-to-draft flow and template application without claims.

- [ ] **Step 1: Write import and template safety tests**

```ts
it("imports valid CSV rows as drafts and never overwrites published IDs", async () => {
  render(<CsvTools products={products} onImportDrafts={onImportDrafts} />);
  await selectCsv(validCsv);
  await user.click(screen.getByRole("button", { name: "2개 상품을 임시저장으로 가져오기" }));
  expect(onImportDrafts).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ status: "draft", stock: expect.any(Number) }),
  ]));
});

it("templates do not populate benefits, certifications, ratings, or reviews", () => {
  expect(applyProductTemplate(emptyDraft, "omega3")).toMatchObject({
    benefits: [], certifications: [], ratingAverage: 0, reviewCount: 0,
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- components/admin/csv-tools.test.tsx lib/csv/products-csv.test.ts components/admin/product-wizard/product-wizard.test.tsx`
Expected: FAIL because imports publish immediately and template application is absent.

- [ ] **Step 3: Preserve parser safety while changing the destination**

Keep strict RFC parsing, exact headers, UTF-8 BOM, formula escaping, reversible arrays, 400-valid-row maximum, all-error blocking, latest-file race protection, and preview confirmation. Map each valid row to a newly generated draft ID and call `onImportDrafts` with no public write.

- [ ] **Step 4: Add field-structure-only templates**

Templates set category, default ingredient row labels, and dosage input hints only. They leave description, benefits, amounts, daily values, certifications, cautions, price, stock, ratings, reviews, and rank blank/zero. Applying a template to a non-empty draft requires confirmation and changes only empty fields.

- [ ] **Step 5: Run CSV/admin tests and lint**

Run: `npm test -- lib/csv components/admin/csv-tools.test.tsx components/admin/product-wizard`
Expected: PASS with all existing security tests retained.

Run: `npm run lint -- lib/csv components/admin`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add components/admin lib/csv public/products-template.csv
git commit -m "feat: import products as reviewable drafts"
```

---

### Task 11: Full Verification, Operations Guide, and Private Deployment

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `app/globals.css`
- Test: all test files and both rule suites

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: verified private deployment and operator checklist.

- [ ] **Step 1: Add final route and responsive contract tests**

Add a test that imports `flattenMenuLinks(STOREFRONT_MENU)`, verifies every internal path has an App Router page or a supported `/products` query contract, and asserts no `/login` or missing `/help*` route remains. Add CSS contract assertions for 390px wizard single-column layout, 44px controls, sticky safe-area actions, and image queue wrapping.

- [ ] **Step 2: Update the operator guide**

README must explain:

1. enable Firebase Storage;
2. publish `firestore.rules` and `storage.rules` only after confirming project ID;
3. create Auth user plus `admins/{uid}` with `role: "admin"`;
4. draft → preview → publish → unpublish workflow;
5. upload limits and orphan-image cleanup behavior;
6. CSV now imports to drafts;
7. real PG/order persistence remains excluded;
8. emulator commands pinned to Firebase CLI `15.26.0` and JDK 21+.

- [ ] **Step 3: Run complete emulator-backed tests**

Run: `npx firebase-tools@15.26.0 emulators:exec --only firestore,storage --project demo-vitaleaf-rules-test "npm test -- --maxWorkers=1 --no-file-parallelism"`
Expected: every application, Firestore, and Storage test PASS.

- [ ] **Step 4: Run static and production verification**

Run: `npm run lint`
Expected: exit 0.

Run: `npm run build`
Expected: all App Router routes, including information and admin preview routes, emit successfully.

Run: `git diff --check`
Expected: no whitespace errors.

- [ ] **Step 5: Browser full-story verification**

At 1440×900 and 390×844 verify:

- each desktop/mobile/footer menu reaches its route or correct product state;
- menu Escape and focus restoration;
- admin sign-in, new draft, autosave indicator, reload/continue;
- valid and rejected image uploads, progress, retry, representative change, keyboard reorder;
- preview matches product detail and has disabled purchase controls;
- publish makes the product visible, edit draft leaves the old public version visible, and unpublish removes it;
- duplicate and CSV create drafts only;
- no horizontal overflow or broken Korean text.

- [ ] **Step 6: Request independent code review**

Review the complete range against `docs/superpowers/specs/2026-08-11-vitaleaf-menu-admin-workflow-design.md`. Fix all Critical and Important findings, rerun affected tests, and record deferred Minor items only when their effort clearly exceeds user/administrator benefit.

- [ ] **Step 7: Commit documentation and deploy privately**

```bash
git add README.md .env.example app/globals.css
git commit -m "docs: add product publishing operations guide"
```

Push the exact validated commit to the existing Sites source repository, save one new version, and use the private owner-only deployment flow. Do not change access to public without explicit user approval. Poll to `succeeded` and return the existing site URL.
