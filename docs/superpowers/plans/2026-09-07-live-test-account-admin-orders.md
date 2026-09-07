# VITALEAF Live Test Account and Admin Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Firebase member authentication in deployed environments, create a real test customer whose mock orders are labeled server-side, and let authorized administrators review and operate member and guest orders.

**Architecture:** Keep the existing Firebase Auth and split member/guest order collections. Add one shared order-operations domain module, mark test member orders from the verified UID and a server-only environment variable, and expose administrator-only list/detail/update APIs backed directly by the existing collections. Mount a focused order panel in the current admin dashboard so the large dashboard component only coordinates tabs and authorization.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Firebase Web SDK 12, Firebase Admin SDK 13, Firestore, Vitest 4, Testing Library, ESLint, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-07-live-test-account-admin-orders-design.md`

## Global Constraints

- Use real Firebase Email/Password authentication; do not add a front-end authentication bypass.
- Keep passwords, ID tokens, Firebase Admin keys, and environment values out of source control, logs, screenshots, and test fixtures.
- `TEST_CUSTOMER_UID` is server-only and is the only authority used to label a member order as a test order.
- Keep member orders in `users/{uid}/orders/{orderNumber}` and guest orders in `guestOrders/{orderNumber}`; do not add a replicated admin-order collection.
- Preserve `mock-received` as the stored initial state and display it as `접수`.
- Do not implement actual PG approval, refunds, carrier APIs, messaging, accounting reports, or bulk order updates.
- Every production-code change starts with a test that fails for the intended missing behavior.
- Preserve legacy orders by normalizing missing or invalid operational fields safely.
- Administrator APIs independently verify a fresh Firebase ID token and `admins/{uid}.role == "admin"` on every request.

---

## File Structure

- `lib/orders/operations.ts`: canonical order states, labels, legacy normalization, update validation, and safe operational-field parsing.
- `lib/orders/operations.test.ts`: domain behavior and hostile-input coverage.
- `lib/firebase/member-orders.ts`: member order types and normalization of operational fields.
- `lib/guest-orders/types.ts`: guest order types extended with operational fields.
- `lib/firebase/guest-orders.ts`: exported guest-order normalizer and operational-field parsing.
- `lib/member-orders/service.ts`: server-derived `isTestOrder` when a member order is created.
- `app/api/member-orders/route.ts`: injects the configured test UID into the member-order service.
- `lib/admin-orders/types.ts`: API-safe admin list/detail/reference contracts.
- `lib/firebase/admin-orders.ts`: reads and updates the existing Firestore order documents.
- `lib/admin-orders/service.ts`: merges, sorts, limits, redacts, validates, and updates admin orders.
- `app/api/admin/orders/route.ts`: authenticated admin list endpoint.
- `app/api/admin/orders/detail/route.ts`: authenticated admin detail endpoint.
- `app/api/admin/orders/update/route.ts`: authenticated operational-field update endpoint.
- `lib/admin-orders/client.ts`: fresh-token browser client with strict response parsing.
- `components/admin/order-panel.tsx`: order search, filters, list, detail, and update form.
- `components/admin/admin-dashboard.tsx`: adds the order tab and delegates its body to `OrderPanel`.
- `app/globals.css`: order-panel desktop and mobile layout.
- `.env.example`, `README.md`: environment and live verification instructions without values.

---

### Task 1: Canonical order operations domain

**Files:**
- Create: `lib/orders/operations.ts`
- Create: `lib/orders/operations.test.ts`
- Modify: `lib/firebase/member-orders.ts`
- Modify: `lib/guest-orders/types.ts`
- Modify: `lib/firebase/guest-orders.ts`
- Test: `lib/firebase/member-orders.test.ts`
- Test: `lib/firebase/guest-orders.test.ts`

**Interfaces:**
- Produces: `OrderStatus`, `ORDER_STATUSES`, `ORDER_STATUS_LABELS`, `normalizeOrderStatus(value)`, `normalizeOrderOperations(value)`, and `parseOrderOperationsUpdate(value)`.
- Produces: exported `normalizeGuestOrder(orderNumber, value)` for the admin repository.
- Consumes: existing Firestore timestamp-like objects and legacy order data.

- [ ] **Step 1: Write failing domain and normalizer tests**

Add tests that describe the exact new behavior:

```ts
import {
  normalizeOrderOperations,
  parseOrderOperationsUpdate,
} from "./operations";

it("normalizes a legacy order to the received state", () => {
  expect(normalizeOrderOperations({})).toEqual({
    status: "mock-received",
    isTestOrder: false,
    shippingCarrier: "",
    trackingNumber: "",
    statusUpdatedAt: null,
    statusUpdatedBy: "",
  });
});

it("requires shipping data only when changing to shipped", () => {
  expect(() => parseOrderOperationsUpdate({ status: "shipped" }))
    .toThrow("배송사와 송장번호를 입력해 주세요.");
  expect(parseOrderOperationsUpdate({
    status: "shipped",
    shippingCarrier: " CJ대한통운 ",
    trackingNumber: " 1234-5678 ",
  })).toEqual({
    status: "shipped",
    shippingCarrier: "CJ대한통운",
    trackingNumber: "1234-5678",
  });
});

it("rejects unknown fields and unknown states", () => {
  expect(() => parseOrderOperationsUpdate({ status: "paid", total: 1 }))
    .toThrow("주문 처리 정보를 다시 확인해 주세요.");
});
```

Extend member and guest normalizer tests with stored `preparing`/`shipped` fields and an invalid-status legacy case. Assert that the exported guest normalizer returns the same shape used by lookup.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node node_modules/vitest/vitest.mjs run lib/orders/operations.test.ts lib/firebase/member-orders.test.ts lib/firebase/guest-orders.test.ts
```

Expected: failures because the operations module, expanded statuses, and exported guest normalizer do not exist.

- [ ] **Step 3: Implement the minimal order operations module**

Create the canonical state definitions and strict update parser:

```ts
export const ORDER_STATUSES = [
  "mock-received", "preparing", "shipped", "completed", "cancelled",
] as const;

export type OrderStatus = typeof ORDER_STATUSES[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  "mock-received": "접수",
  preparing: "상품 준비",
  shipped: "배송 중",
  completed: "완료",
  cancelled: "취소",
};

export class OrderOperationsValidationError extends Error {}

export type OrderOperationsUpdate = {
  status: OrderStatus;
  shippingCarrier: string;
  trackingNumber: string;
};

export function normalizeOrderStatus(value: unknown): OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus)
    ? value as OrderStatus
    : "mock-received";
}

export function parseOrderOperationsUpdate(value: unknown): OrderOperationsUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrderOperationsValidationError("주문 처리 정보를 다시 확인해 주세요.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["status", "shippingCarrier", "trackingNumber"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new OrderOperationsValidationError("주문 처리 정보를 다시 확인해 주세요.");
  }
  if (!ORDER_STATUSES.includes(record.status as OrderStatus)) {
    throw new OrderOperationsValidationError("주문 처리 정보를 다시 확인해 주세요.");
  }
  const status = record.status as OrderStatus;
  const shippingCarrier = typeof record.shippingCarrier === "string"
    ? record.shippingCarrier.trim()
    : "";
  const trackingNumber = typeof record.trackingNumber === "string"
    ? record.trackingNumber.trim()
    : "";
  if (status === "shipped" && (!shippingCarrier || !trackingNumber)) {
    throw new OrderOperationsValidationError("배송사와 송장번호를 입력해 주세요.");
  }
  return {
    status,
    shippingCarrier: status === "shipped" ? shippingCarrier : "",
    trackingNumber: status === "shipped" ? trackingNumber : "",
  };
}
```

Implement `normalizeOrderOperations` with safe date conversion matching the existing member-order timestamp parser. Extend member and guest stored/public types with `isTestOrder`, `shippingCarrier`, `trackingNumber`, `statusUpdatedAt`, and `statusUpdatedBy`. Replace hard-coded status normalization in both repositories with the shared module and export `normalizeGuestOrder`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests pass with legacy and new operational fields covered.

- [ ] **Step 5: Commit the domain change**

```powershell
git add lib/orders/operations.ts lib/orders/operations.test.ts lib/firebase/member-orders.ts lib/firebase/member-orders.test.ts lib/guest-orders/types.ts lib/firebase/guest-orders.ts lib/firebase/guest-orders.test.ts
git commit -m "feat: define order operations states"
```

---

### Task 2: Server-derived test-order labeling

**Files:**
- Modify: `lib/member-orders/service.ts`
- Modify: `lib/member-orders/service.test.ts`
- Modify: `app/api/member-orders/route.ts`
- Modify: `app/api/member-orders/route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createMemberOrderService({ repository, testCustomerUid })`.
- Produces: `MemberOrderStored.isTestOrder`, derived only from authenticated `uid === testCustomerUid`.
- Produces: route dependency `process.env.TEST_CUSTOMER_UID?.trim() || null`.

- [ ] **Step 1: Write failing service and route tests**

Add a service test whose submitted order body contains a forged test flag but whose authenticated UID differs, plus one whose UID matches:

```ts
it("marks only the configured authenticated UID as a test order", async () => {
  const service = createMemberOrderService({
    repository,
    testCustomerUid: "test-uid",
  });
  await service.create("test-uid", createInput(), payment, IDEMPOTENCY_KEY);
  expect(repository.createOrder).toHaveBeenCalledWith(
    "test-uid",
    expect.objectContaining({ isTestOrder: true }),
    IDEMPOTENCY_KEY,
    expect.any(String),
  );
});

it("ignores a client-supplied test flag for an ordinary member", async () => {
  const service = createMemberOrderService({ repository, testCustomerUid: "test-uid" });
  await service.create("member-uid", { ...createInput(), isTestOrder: true }, payment, IDEMPOTENCY_KEY);
  expect(repository.createOrder).toHaveBeenCalledWith(
    "member-uid",
    expect.objectContaining({ isTestOrder: false }),
    IDEMPOTENCY_KEY,
    expect.any(String),
  );
});
```

In the route test, temporarily set `process.env.TEST_CUSTOMER_UID = "member-uid"`, execute the real route dependency path, and assert the persisted order is labeled. Restore the previous environment value in `afterEach`.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
node node_modules/vitest/vitest.mjs run lib/member-orders/service.test.ts app/api/member-orders/route.test.ts
```

Expected: `testCustomerUid` is not accepted and persisted orders do not include `isTestOrder`.

- [ ] **Step 3: Implement UID-only test labeling**

Change the dependency contract to:

```ts
type MemberOrderServiceDependencies = {
  repository: MemberOrderServerRepository;
  testCustomerUid?: string | null;
};
```

Set `isTestOrder: Boolean(testCustomerUid) && uid === testCustomerUid` when building `MemberOrderStored`. In the route, construct the service with the trimmed server environment value. Add `TEST_CUSTOMER_UID=` to `.env.example` under the server-only Firebase values.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: both route and service tests pass, including the forged-flag case.

- [ ] **Step 5: Commit test labeling**

```powershell
git add lib/member-orders/service.ts lib/member-orders/service.test.ts app/api/member-orders/route.ts app/api/member-orders/route.test.ts .env.example
git commit -m "feat: label configured customer test orders"
```

---

### Task 3: Administrator order repository and service

**Files:**
- Create: `lib/admin-orders/types.ts`
- Create: `lib/admin-orders/validation.ts`
- Create: `lib/admin-orders/validation.test.ts`
- Create: `lib/admin-orders/service.ts`
- Create: `lib/admin-orders/service.test.ts`
- Create: `lib/firebase/admin-orders.ts`
- Create: `lib/firebase/admin-orders.test.ts`

**Interfaces:**
- Produces: `AdminOrderReference`, `AdminOrderListItem`, `AdminOrderDetail`, `AdminOrderRepository`, and `AdminOrderService`.
- Produces: `parseAdminOrderReference(value)` and strict public response constructors.
- Consumes: `normalizeMemberOrder`, `normalizeGuestOrder`, `parseOrderOperationsUpdate`, Firebase Admin Firestore, and an authenticated admin UID supplied by the API.

- [ ] **Step 1: Write failing validation and service tests**

Define references without exposing raw Firestore paths:

```ts
export type AdminOrderReference =
  | { source: "member"; ownerId: string; orderNumber: string }
  | { source: "guest"; ownerId: null; orderNumber: string };
```

Test that IDs are trimmed, nonempty, contain no `/` or control characters, and that guest requests reject an owner ID. Test merging with two member rows and two guest rows:

```ts
it("merges both sources newest-first and redacts list data", async () => {
  const service = createAdminOrderService(repository);
  const result = await service.list();
  expect(result.map((row) => row.orderNumber)).toEqual(["G-2", "M-2", "G-1", "M-1"]);
  expect(result[0]).not.toHaveProperty("phone");
  expect(result[0]).not.toHaveProperty("address");
});
```

Test an input of 100 member plus 100 guest rows, deterministic tie ordering, list item summary, missing detail, mismatched member `userId`, and `shipped` updates. Assert the repository update receives only operational fields plus `statusUpdatedAt` and `statusUpdatedBy`.

- [ ] **Step 2: Run service tests and verify RED**

```powershell
node node_modules/vitest/vitest.mjs run lib/admin-orders/validation.test.ts lib/admin-orders/service.test.ts lib/firebase/admin-orders.test.ts
```

Expected: failures because no admin-order contracts, service, or repository exist.

- [ ] **Step 3: Implement contracts and pure service**

Create an API-safe list type that omits phone and address, and a detail type containing shipping fields only for the authorized detail response. Define the repository boundary:

```ts
export type AdminOrderRepository = {
  listMember(limit: number): Promise<MemberOrder[]>;
  listGuest(limit: number): Promise<GuestOrderStored[]>;
  get(reference: AdminOrderReference): Promise<MemberOrder | GuestOrderStored | null>;
  update(
    reference: AdminOrderReference,
    operations: ReturnType<typeof parseOrderOperationsUpdate>,
    adminUid: string,
    now: Date,
  ): Promise<MemberOrder | GuestOrderStored>;
};
```

`createAdminOrderService(repository, now = () => new Date())` exposes `list()`, `detail(reference)`, and `update(reference, value, adminUid)`. `list()` requests 100 from each source, maps list-only fields, merges, sorts by `createdAt` descending then `orderNumber` descending, and caps at 200. `detail()` validates a member row's stored `userId` against `ownerId`. `update()` parses operations before repository access.

- [ ] **Step 4: Implement the Firebase Admin repository**

Use `getAdminFirestore().collectionGroup("orders").orderBy("createdAt", "desc").limit(limit)` for member orders and `collection("guestOrders")` for guests. For member collection-group rows, accept only document paths matching `users/{uid}/orders/{orderNumber}`. Normalize all records through existing normalizers.

For update, build the exact document reference from the validated `AdminOrderReference`, run a transaction, ensure the document exists and member `userId` matches, and update only:

```ts
{
  status,
  shippingCarrier,
  trackingNumber,
  statusUpdatedAt: now,
  statusUpdatedBy: adminUid,
}
```

Return the normalized post-update object assembled from the existing data and these fields.

- [ ] **Step 5: Run repository and service tests and verify GREEN**

Run the Step 2 command. Expected: all admin-order domain, redaction, path-validation, merge, and update tests pass.

- [ ] **Step 6: Commit the admin order service layer**

```powershell
git add lib/admin-orders lib/firebase/admin-orders.ts lib/firebase/admin-orders.test.ts
git commit -m "feat: add administrator order service"
```

---

### Task 4: Authenticated administrator order APIs

**Files:**
- Create: `app/api/admin/orders/route.ts`
- Create: `app/api/admin/orders/route.test.ts`
- Create: `app/api/admin/orders/detail/route.ts`
- Create: `app/api/admin/orders/detail/route.test.ts`
- Create: `app/api/admin/orders/update/route.ts`
- Create: `app/api/admin/orders/update/route.test.ts`

**Interfaces:**
- Consumes: `verifyBearerAdmin(request)`, `adminOrderService`, strict reference/update parsers, and `FirebaseAdminConfigurationError`.
- Produces: `{ orders: AdminOrderListItem[] }`, `{ order: AdminOrderDetail }`, and updated `{ order: AdminOrderDetail }` envelopes.

- [ ] **Step 1: Write failing API authorization and response tests**

Use the injectable/mocked dependency pattern already used by `app/api/admin/inquiries/route.test.ts`. For every endpoint, test missing token (401), ordinary member (403), Firebase Admin configuration failure (503), malformed JSON (400), and unexpected repository failure (500).

For the list route, also assert:

```ts
expect(await response.json()).toEqual({
  orders: [expect.not.objectContaining({ phone: expect.anything(), address: expect.anything() })],
});
```

For detail, assert 404 for a valid-but-missing reference. For update, assert that the verified admin UID is passed to the service and that extra keys such as `total` produce 400.

- [ ] **Step 2: Run API tests and verify RED**

```powershell
node node_modules/vitest/vitest.mjs run app/api/admin/orders/route.test.ts app/api/admin/orders/detail/route.test.ts app/api/admin/orders/update/route.test.ts
```

Expected: route modules are missing.

- [ ] **Step 3: Implement the three Node.js routes**

Each route starts with:

```ts
export const runtime = "nodejs";

const message = (text: string, status: number) =>
  Response.json({ message: text }, { status });
```

Call `verifyBearerAdmin` before reading or applying request data. The list route accepts exactly `{ action: "list" }`. The detail route accepts exactly the reference fields. The update route accepts exactly the reference fields plus `status`, `shippingCarrier`, and `trackingNumber`. Map expected errors to safe Korean messages and never include error messages, tokens, document paths, environment names, phone numbers, or addresses in server logs.

- [ ] **Step 4: Run API tests and verify GREEN**

Run the Step 2 command. Expected: all authentication, validation, redaction, and service-delegation cases pass.

- [ ] **Step 5: Commit the API routes**

```powershell
git add app/api/admin/orders
git commit -m "feat: expose secured admin order APIs"
```

---

### Task 5: Strict administrator order browser client

**Files:**
- Create: `lib/admin-orders/client.ts`
- Create: `lib/admin-orders/client.test.ts`

**Interfaces:**
- Produces: `AdminOrderClient` with `list(signal?)`, `get(reference, signal?)`, and `update(reference, operations, signal?)`.
- Consumes: `getFreshMemberIdToken()`, Fetch, `AdminOrderReference`, and strict public types.

- [ ] **Step 1: Write failing client tests**

Test fresh-token headers, abort propagation, non-2xx Korean errors, strict single-key envelopes, maximum 200 list rows, invalid dates/money/statuses, extra private fields, reference mismatch, and update response mismatch:

```ts
it("sends a fresh member token to the administrator list endpoint", async () => {
  tokenMock.mockResolvedValue("fresh-token");
  fetchMock.mockResolvedValue(Response.json({ orders: [] }));
  await adminOrderClient.list();
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/orders", expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
    body: JSON.stringify({ action: "list" }),
  }));
});
```

- [ ] **Step 2: Run the client test and verify RED**

```powershell
node node_modules/vitest/vitest.mjs run lib/admin-orders/client.test.ts
```

Expected: the client module does not exist.

- [ ] **Step 3: Implement the strict client**

Define:

```ts
export type AdminOrderClient = {
  list(signal?: AbortSignal): Promise<AdminOrderListItem[]>;
  get(reference: AdminOrderReference, signal?: AbortSignal): Promise<AdminOrderDetail>;
  update(
    reference: AdminOrderReference,
    operations: OrderOperationsUpdate,
    signal?: AbortSignal,
  ): Promise<AdminOrderDetail>;
};
```

Fetch a fresh ID token for every request. Parse every primitive, reject unknown status values, reject list rows containing detail-only keys, require ISO timestamps, enforce nonnegative safe-integer money, and require the returned reference to match the requested reference. Convert 401/403 to `관리자 권한을 확인하고 다시 로그인해 주세요.` and preserve abort errors.

- [ ] **Step 4: Run the client test and verify GREEN**

Run the Step 2 command. Expected: all transport and hostile-response tests pass.

- [ ] **Step 5: Commit the client**

```powershell
git add lib/admin-orders/client.ts lib/admin-orders/client.test.ts
git commit -m "feat: add strict admin order client"
```

---

### Task 6: Administrator order-management panel

**Files:**
- Create: `components/admin/order-panel.tsx`
- Create: `components/admin/order-panel.test.tsx`
- Modify: `components/admin/admin-dashboard.tsx`
- Modify: `components/admin/admin-dashboard.test.tsx`

**Interfaces:**
- Consumes: `AdminOrderClient`, `AdminOrderListItem`, `AdminOrderDetail`, status labels, and the dashboard authorization generation.
- Produces: `<OrderPanel client={adminOrderClient} onReceivedCountChange={setOrderReceivedCount} />`.
- Produces: dashboard view key `orders` and an `주문 관리` tab with an initial-state count badge.

- [ ] **Step 1: Write failing panel behavior tests**

Test loading, retry, empty state, newest list, local order-number/customer-name search, test-only filter, state filter, selecting a row, stale detail cancellation, and private data appearing only after detail is selected.

Test update behavior:

```tsx
await user.click(screen.getByRole("button", { name: /VL-20260907-TEST01/ }));
await screen.findByText("서울시 테스트구");
await user.selectOptions(screen.getByLabelText("처리 상태"), "shipped");
await user.type(screen.getByLabelText("배송사"), "CJ대한통운");
await user.type(screen.getByLabelText("송장번호"), "1234567890");
await user.click(screen.getByRole("button", { name: "처리 정보 저장" }));
expect(client.update).toHaveBeenCalledWith(
  expect.objectContaining({ orderNumber: "VL-20260907-TEST01" }),
  { status: "shipped", shippingCarrier: "CJ대한통운", trackingNumber: "1234567890" },
  expect.any(AbortSignal),
);
```

Assert duplicate clicks issue one mutation, a failed mutation preserves the previous displayed state, and a later selected order is not overwritten by a stale response.

- [ ] **Step 2: Run panel tests and verify RED**

```powershell
node node_modules/vitest/vitest.mjs run components/admin/order-panel.test.tsx components/admin/admin-dashboard.test.tsx
```

Expected: `OrderPanel` and the `orders` dashboard view are missing.

- [ ] **Step 3: Implement the focused panel**

Keep list state, selection state, detail state, filters, request generations, and mutation locks inside `OrderPanel`. Use semantic controls:

```tsx
<section aria-labelledby="admin-orders-heading">
  <div className="admin-order-filters">
    <label>주문 검색<input type="search" /></label>
    <label>주문 구분<select><option value="all">전체</option><option value="test">테스트</option></select></label>
    <label>처리 상태<select><option value="all">전체</option><option value="mock-received">접수</option><option value="preparing">상품 준비</option><option value="shipped">배송 중</option><option value="completed">완료</option><option value="cancelled">취소</option></select></label>
  </div>
  <div className="admin-order-layout">
    <ol aria-label="주문 목록">
      {filteredOrders.map((order) => (
        <li key={`${order.source}:${order.ownerId ?? "guest"}:${order.orderNumber}`}>
          <button type="button" onClick={() => selectOrder(order)}>{order.orderNumber}</button>
        </li>
      ))}
    </ol>
    <article aria-label="주문 상세">
      {detail ? <OrderDetailForm order={detail} onSubmit={updateOrder} /> : <p>주문을 선택해 주세요.</p>}
    </article>
  </div>
</section>
```

Show order number, member type, item summary, total, state label, date, and test badge in the list. Render phone/address only from a successful detail call. Require shipping fields in the form when the selected state is `shipped`. Abort list/detail/update requests on authorization-generation change or unmount.

- [ ] **Step 4: Integrate the panel into the dashboard**

Extend `DashboardView` and `dashboardViews` with `orders`, add `orderClient` to `AdminDashboardDependencies`, keep it injectable for tests, and render the new tab between `판매 상품` and `1:1 문의`. Reset the received count to unknown on authorization changes. Pass a `key` based on the existing authorization generation so no previous administrator's order data survives sign-out.

- [ ] **Step 5: Run panel and dashboard tests and verify GREEN**

Run the Step 2 command. Expected: panel flows and dashboard authorization lifecycle pass.

- [ ] **Step 6: Commit the admin UI**

```powershell
git add components/admin/order-panel.tsx components/admin/order-panel.test.tsx components/admin/admin-dashboard.tsx components/admin/admin-dashboard.test.tsx
git commit -m "feat: manage orders from admin dashboard"
```

---

### Task 7: Responsive order-management styling and storefront status labels

**Files:**
- Modify: `app/globals.css`
- Create: `components/admin/order-panel-responsive-css.test.ts`
- Modify: `components/account/order-history.tsx`
- Modify: `components/account/order-history.test.tsx`
- Modify: `components/orders/guest-order-lookup-form.tsx`
- Modify: `components/orders/guest-order-lookup-form.test.tsx`

**Interfaces:**
- Consumes: existing admin design tokens and `ORDER_STATUS_LABELS`.
- Produces: two-column desktop admin order layout, stacked mobile layout, and customer-visible canonical Korean status labels.

- [ ] **Step 1: Write failing CSS and customer-label tests**

Assert that desktop uses a bounded list/detail grid, mobile switches to one column, order list buttons maintain 44px minimum targets, long order numbers wrap safely, and detail content has no fixed width. In component tests, render `preparing`, `shipped`, and legacy status values and assert their Korean labels.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node node_modules/vitest/vitest.mjs run components/admin/order-panel-responsive-css.test.ts components/account/order-history.test.tsx components/orders/guest-order-lookup-form.test.tsx
```

Expected: admin order selectors and non-received status labels are missing.

- [ ] **Step 3: Add compact responsive styles and shared labels**

Add styles under the existing admin section rather than introducing a second design system. Desktop uses `grid-template-columns: minmax(300px, .85fr) minmax(0, 1.4fr)`. At the existing tablet breakpoint, switch to one column and limit the list to a usable scroll region. At the phone breakpoint, stack filter fields, remove inner fixed heights, and keep the update button full width.

Replace customer-side hard-coded `접수` text with `ORDER_STATUS_LABELS[order.status]`. For `shipped`, show carrier and tracking number only when both are present.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all responsive contract and customer status tests pass.

- [ ] **Step 5: Commit responsive and customer-facing behavior**

```powershell
git add app/globals.css components/admin/order-panel-responsive-css.test.ts components/account/order-history.tsx components/account/order-history.test.tsx components/orders/guest-order-lookup-form.tsx components/orders/guest-order-lookup-form.test.tsx
git commit -m "feat: show responsive order operations status"
```

---

### Task 8: Configuration documentation and complete local verification

**Files:**
- Modify: `README.md`
- Modify: `tests/firebase-config.test.ts`
- Verify: all changed source and test files

**Interfaces:**
- Consumes: the exact environment list from the approved spec.
- Produces: a deployment checklist that checks names and scopes without recording values.

- [ ] **Step 1: Write a failing configuration documentation test**

Extend `tests/firebase-config.test.ts` to require `TEST_CUSTOMER_UID` in `.env.example`, require README instructions for Preview and Production Firebase public variables, and require warnings that test credentials and Admin keys are never committed.

- [ ] **Step 2: Run the configuration test and verify RED**

```powershell
node node_modules/vitest/vitest.mjs run tests/firebase-config.test.ts
```

Expected: README does not yet document the test UID and full live verification sequence.

- [ ] **Step 3: Update README with exact operational steps**

Document:

1. Vercel Preview and Production need all seven `NEXT_PUBLIC_FIREBASE_*` names and the correct `NEXT_PUBLIC_SITE_URL`.
2. Server order APIs need the four Firebase Admin/storage names plus the guest/inquiry secrets.
3. Firebase Email/Password must be enabled and the stable Preview alias and Production domain must be authorized.
4. Create the test customer only after authentication works, copy its UID without logging the password, and set `TEST_CUSTOMER_UID` in Preview and Production.
5. The administrator Auth user also needs `admins/{uid}.role = "admin"`.
6. Redeploy after changing any `NEXT_PUBLIC_*` value because it is embedded at build time.

- [ ] **Step 4: Run configuration and related focused tests**

```powershell
node node_modules/vitest/vitest.mjs run tests/firebase-config.test.ts lib/orders/operations.test.ts lib/member-orders/service.test.ts lib/admin-orders components/admin/order-panel.test.tsx components/admin/admin-dashboard.test.tsx app/api/admin/orders
```

Expected: all related tests pass.

- [ ] **Step 5: Run the complete verification suite**

```powershell
npm test
npm run lint
npm run build:vercel
git diff --check
git status --short
```

Expected: tests, lint, and production build exit 0; `git diff --check` is empty. Firebase emulator tests may be reported as skipped only when Java or the Firebase CLI is unavailable; report the exact skip count. Restore `next-env.d.ts` if the framework rewrites it, remove untracked build cache files, then rerun `git diff --check`.

- [ ] **Step 6: Commit documentation**

```powershell
git add README.md tests/firebase-config.test.ts
git commit -m "docs: document live auth and test account setup"
```

---

### Task 9: Preview configuration, real test account, and end-to-end verification

**Files:**
- Do not commit: `.env.local`, generated passwords, Firebase Admin credentials, ID tokens, Vercel tokens, browser storage, or test shipping data containing real personal information.
- Verify: Vercel project settings, Firebase Authentication settings, deployed Preview, and Firebase order documents.

**Interfaces:**
- Consumes: approved Vercel project, Firebase project, deployed feature branch, and the completed code from Tasks 1–8.
- Produces: one real Firebase test customer, one labeled mock order, verified administrator order handling, and a private credential handoff to the user.

- [ ] **Step 1: Confirm the exact Vercel project and environment scopes without exposing values**

Link the repository only after confirming the team and project IDs, then list environment-variable names for Preview and Production. Compare names against the approved spec. Never use commands that print values. If server credentials are absent, stop and request the service-account values through the platform's secret input rather than chat.

- [ ] **Step 2: Configure Firebase Authentication and approved domains**

Enable Email/Password, add the stable Preview alias and Production domain to Authorized domains, and verify the administrator Auth user plus `admins/{uid}.role = "admin"`. These are external account/security changes; obtain any required action-time UI confirmation immediately before saving.

- [ ] **Step 3: Deploy the feature branch to Preview**

Push the verified commits to `origin/feat/member-account-orders`, wait for the Preview deployment, and confirm the signup page no longer displays `사이트 인증 설정이 필요합니다`. Check browser console errors before creating an account.

- [ ] **Step 4: Create the real test customer**

Generate a unique strong password outside the repository. Submit the live signup form with:

```text
이름: 바이탈리프 테스트고객
이메일: testcustomer@vitaleaf.kr
전화번호/주소: 실제 개인이 아닌 명시적인 테스트 값
```

If the email already exists, sign in and reuse it only when the supplied password works; otherwise create a new timestamped test email. Capture the Firebase UID without printing the password or ID token. Set that UID as `TEST_CUSTOMER_UID` for Preview, redeploy, and sign in again.

- [ ] **Step 5: Execute the complete customer journey**

On desktop and mobile, verify home/category/search navigation, open a product detail, select a purchase option, add it twice and exercise the keep/add dialog, directly edit cart quantity, confirm immediate totals, fill only test shipping data, complete mock payment, record the order number, and verify the same order in My Page. No actual payment data is entered.

- [ ] **Step 6: Execute the administrator journey**

Sign in as the authorized administrator, open `주문 관리`, find the recorded order, verify the `테스트` badge and full detail, change it to `상품 준비`, then to `배송 중` with test carrier/tracking values. Reload and confirm persistence. Verify an ordinary member cannot call the same admin APIs.

- [ ] **Step 7: Record evidence and hand off credentials**

Report the Preview URL, order number, tested viewport sizes, visible success states, console status, and any skipped emulator tests. Provide the test account email and password only to the user in the final handoff; never commit them. Keep the labeled test order so the user can inspect it later.

- [ ] **Step 8: Integrate and deploy Production only from a verified tree**

Use `superpowers:finishing-a-development-branch` to let the user choose merge or PR. After the feature reaches the Production branch, apply the same environment names and authorized domain, redeploy, repeat signup/login and one non-financial smoke order, then report the final Production URL. Do not delete the preserved test order.
