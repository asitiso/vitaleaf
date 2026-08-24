# VITALEAF Member Accounts and Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add useful email member accounts, saved delivery details, member order history, and complete working storefront menus while preserving guest checkout and existing admin behavior.

**Architecture:** A client-side `AuthProvider` owns Firebase Authentication state. Focused Firebase repositories own profile and member-order persistence under `users/{uid}`, and checkout coordinates mock payment with those repositories without clearing the cart before required writes succeed. All visible navigation consumes one shared route contract that is verified against App Router pages and supported product queries.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Firebase Authentication/Firestore 12, Vitest 4, Testing Library, Firebase Rules Unit Testing.

**Spec:** `docs/superpowers/specs/2026-08-24-member-account-orders-design.md`

## Global Constraints

- Keep guest checkout available and do not persist guest personal data or orders.
- Use email/password authentication with password reset; do not add social login.
- Do not require email verification for the current mock checkout.
- Preserve the existing administrator role check and product CRUD behavior.
- Keep the browser-local cart across sign-in and sign-out.
- A member may read and write only their own profile and create/read only their own immutable orders.
- Do not add a client secret; continue using the existing public Firebase configuration.
- Every visible desktop, mobile, footer, product, account, and order-complete action must produce its documented result.
- Follow red-green-refactor for every production behavior.

---

### Task 1: Member Authentication Domain

**Files:**
- Create: `lib/firebase/member-auth.ts`
- Create: `lib/firebase/member-auth.test.ts`
- Modify: `lib/firebase/auth.ts`

**Interfaces:**
- Produces: `MemberIdentity`, `MemberAuthAdapter`, `createMemberAuth(adapter)`, `memberAuth.signUp`, `signIn`, `signOut`, `sendPasswordReset`, `sendVerification`, `observe`, `getMemberAuthErrorMessage(error)`, `validateMemberPassword(password)`, and `safeReturnPath(candidate)`.
- Preserves: `signInAdmin`, `signOutAdmin`, `observeAdminSession`, and `getAdminAuthErrorMessage` exports.

- [ ] **Step 1: Write failing validation and error-mapping tests**

```ts
vi.mock("./client", () => ({ auth: {}, db: {} }));

import {
  getMemberAuthErrorMessage,
  safeReturnPath,
  validateMemberPassword,
} from "./member-auth";

it.each([
  ["abc12345", null],
  ["abcdefgh", "영문과 숫자를 각각 하나 이상 포함해 주세요."],
  ["12345678", "영문과 숫자를 각각 하나 이상 포함해 주세요."],
  ["a1", "비밀번호는 8자 이상 입력해 주세요."],
])("validates a member password", (password, expected) => {
  expect(validateMemberPassword(password)).toBe(expected);
});

it.each([
  ["/checkout", "/checkout"],
  ["/products?category=vitamin", "/products?category=vitamin"],
  ["https://attacker.example", "/mypage"],
  ["//attacker.example", "/mypage"],
])("accepts only a same-origin relative return path", (candidate, expected) => {
  expect(safeReturnPath(candidate)).toBe(expected);
});

it("maps duplicate-email and throttling errors to Korean guidance", () => {
  expect(getMemberAuthErrorMessage({ code: "auth/email-already-in-use" }))
    .toContain("이미 가입된 이메일");
  expect(getMemberAuthErrorMessage({ code: "auth/too-many-requests" }))
    .toContain("잠시 후");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run lib/firebase/member-auth.test.ts`

Expected: FAIL because `member-auth.ts` and its exports do not exist.

- [ ] **Step 3: Implement the pure domain helpers and injectable auth adapter**

```ts
export type MemberIdentity = {
  uid: string;
  email: string;
  emailVerified: boolean;
};

export type MemberAuthAdapter = {
  create(email: string, password: string): Promise<MemberIdentity>;
  signIn(email: string, password: string): Promise<MemberIdentity>;
  signOut(): Promise<void>;
  reset(email: string): Promise<void>;
  verify(): Promise<void>;
  removeCurrent(): Promise<void>;
  observe(next: (user: MemberIdentity | null) => void, fail: (error: unknown) => void): () => void;
};

export const validateMemberPassword = (password: string): string | null => {
  if (password.length < 8) return "비밀번호는 8자 이상 입력해 주세요.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "영문과 숫자를 각각 하나 이상 포함해 주세요.";
  }
  return null;
};

export const safeReturnPath = (candidate?: string | null): string =>
  candidate?.startsWith("/") && !candidate.startsWith("//") ? candidate : "/mypage";
```

Wrap `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `sendPasswordResetEmail`, `sendEmailVerification`, `deleteUser`, `signOut`, and `onAuthStateChanged` in the adapter. Reuse `auth` from `client.ts`; leave the admin adapter unchanged.

- [ ] **Step 4: Add adapter lifecycle tests and make them pass**

Test that `observe` emits `checking` before the first Firebase callback, that an unsubscribe invalidates late callbacks, and that the member error mapper handles invalid credentials, network failure, disabled user, duplicate email, weak password, and throttling.

Run: `pnpm vitest run lib/firebase/member-auth.test.ts lib/firebase/auth.test.ts`

Expected: PASS with existing admin tests unchanged.

- [ ] **Step 5: Commit the authentication domain**

```bash
git add lib/firebase/member-auth.ts lib/firebase/member-auth.test.ts lib/firebase/auth.ts
git commit -m "feat: add member authentication domain"
```

---

### Task 2: User Profile Repository

**Files:**
- Create: `lib/firebase/user-profile.ts`
- Create: `lib/firebase/user-profile.test.ts`

**Interfaces:**
- Consumes: authenticated Firebase UID and email from Task 1.
- Produces: `DeliveryAddress`, `UserProfile`, `NewUserProfile`, `createUserProfile(input)`, `getUserProfile(uid)`, and `updateUserProfile(uid, patch)`.

- [ ] **Step 1: Write failing normalization and repository contract tests**

```ts
it("normalizes a missing saved address to null", () => {
  expect(normalizeUserProfile("user-1", {
    uid: "user-1",
    email: "member@example.com",
    displayName: "홍길동",
    phone: "",
  })).toMatchObject({ uid: "user-1", defaultAddress: null });
});

it("creates immutable identity metadata and an empty address", async () => {
  await repository.create({
    uid: "user-1",
    email: "member@example.com",
    displayName: "홍길동",
    termsAcceptedAt: new Date("2026-08-24T00:00:00.000Z"),
  });
  expect(adapter.create).toHaveBeenCalledWith("user-1", expect.objectContaining({
    uid: "user-1",
    email: "member@example.com",
    defaultAddress: null,
  }));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run lib/firebase/user-profile.test.ts`

Expected: FAIL because the profile repository does not exist.

- [ ] **Step 3: Implement profile types, normalization, and Firestore operations**

```ts
export type DeliveryAddress = {
  recipient: string;
  phone: string;
  postcode: string;
  address: string;
  addressDetail: string;
};

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  defaultAddress: DeliveryAddress | null;
  termsAcceptedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type UserProfilePatch = Pick<UserProfile, "displayName" | "phone" | "defaultAddress">;
```

Use `setDoc(doc(db, "users", uid), ..., { merge: false })` for creation, `getDoc` for reads, and `updateDoc` with only the three mutable fields plus `updatedAt` for updates. Convert Firestore timestamps to `Date` without leaking SDK types to components.

- [ ] **Step 4: Verify GREEN and repository error propagation**

Run: `pnpm vitest run lib/firebase/user-profile.test.ts`

Expected: PASS, including malformed snapshot normalization and adapter rejection propagation.

- [ ] **Step 5: Commit the profile repository**

```bash
git add lib/firebase/user-profile.ts lib/firebase/user-profile.test.ts
git commit -m "feat: add member profile repository"
```

---

### Task 3: Authentication Provider and Account Entry Pages

**Files:**
- Create: `features/auth/auth-context.tsx`
- Create: `features/auth/auth-context.test.tsx`
- Create: `components/auth/login-form.tsx`
- Create: `components/auth/login-form.test.tsx`
- Create: `components/auth/signup-form.tsx`
- Create: `components/auth/signup-form.test.tsx`
- Create: `app/login/page.tsx`
- Create: `app/signup/page.tsx`
- Modify: `app/providers.tsx`

**Interfaces:**
- Consumes: Task 1 auth API and Task 2 `createUserProfile`.
- Produces: `useAuth(): { status; user; error; signOutMember }`, login and signup routes.

- [ ] **Step 1: Write a failing AuthProvider state test**

```tsx
it("clears the previous member immediately when Firebase signs out", async () => {
  render(<AuthProvider adapter={adapter}><SessionProbe /></AuthProvider>);
  emit({ uid: "user-1", email: "member@example.com", emailVerified: false });
  expect(await screen.findByText("signed-in:user-1")).toBeVisible();
  emit(null);
  expect(await screen.findByText("signed-out:none")).toBeVisible();
});
```

- [ ] **Step 2: Run the provider test and verify RED**

Run: `pnpm vitest run features/auth/auth-context.test.tsx`

Expected: FAIL because `AuthProvider` does not exist.

- [ ] **Step 3: Implement `AuthProvider` and nest it outside `CartProvider`**

```tsx
export type AuthStatus = "checking" | "signed-out" | "signed-in" | "error";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}
```

The provider subscribes once, ignores callbacks after cleanup, clears `user` on sign-out and errors, and exposes an async logout action with a user-facing error.

- [ ] **Step 4: Write failing login/signup form tests**

```tsx
it("returns to a safe requested page after login", async () => {
  render(<LoginForm next="/checkout" />);
  await userEvent.type(screen.getByLabelText("이메일"), "member@example.com");
  await userEvent.type(screen.getByLabelText("비밀번호"), "abc12345");
  await userEvent.click(screen.getByRole("button", { name: "로그인" }));
  expect(signInMock).toHaveBeenCalledWith("member@example.com", "abc12345");
  expect(pushMock).toHaveBeenCalledWith("/checkout");
});

it("creates the profile before reporting signup success", async () => {
  render(<SignupForm />);
  await fillSignupForm();
  await userEvent.click(screen.getByRole("checkbox", { name: /이용약관/ }));
  await userEvent.click(screen.getByRole("button", { name: "회원가입" }));
  expect(createUserProfileMock).toHaveBeenCalledWith(expect.objectContaining({
    displayName: "홍길동",
  }));
  expect(pushMock).toHaveBeenCalledWith("/mypage");
});
```

- [ ] **Step 5: Run form tests and verify RED**

Run: `pnpm vitest run components/auth/login-form.test.tsx components/auth/signup-form.test.tsx`

Expected: FAIL because the forms and routes do not exist.

- [ ] **Step 6: Implement accessible forms and rollback behavior**

The signup submit sequence is `validate → create auth user → create profile → send verification → /mypage`. If profile creation fails, call `removeCurrent`; if verification sending fails after the profile exists, keep the account and show a non-blocking verification notice. Disable each submit button while its promise is pending. The reset action sends only when a syntactically valid email is present and announces success with `role="status"`.

- [ ] **Step 7: Verify account entry pages and commit**

Run: `pnpm vitest run features/auth/auth-context.test.tsx components/auth/login-form.test.tsx components/auth/signup-form.test.tsx`

Expected: PASS with no act warnings.

```bash
git add features/auth components/auth app/login app/signup app/providers.tsx
git commit -m "feat: add member login and signup flows"
```

---

### Task 4: Member Orders and Firestore Rules

**Files:**
- Create: `lib/firebase/member-orders.ts`
- Create: `lib/firebase/member-orders.test.ts`
- Modify: `firestore.rules`
- Modify: `firestore.rules.test.ts`

**Interfaces:**
- Consumes: `OrderDraft`, `PaymentResult`, and authenticated UID.
- Produces: `MemberOrder`, `createMemberOrder(uid, draft, payment)`, and `listMemberOrders(uid)` sorted newest first.

- [ ] **Step 1: Write failing order repository tests**

```ts
it("stores a member-owned immutable order snapshot", async () => {
  await repository.create("user-1", draft, {
    orderNumber: "VL-20260824-ABC123",
    receivedAt: "2026-08-24T02:00:00.000Z",
  });
  expect(adapter.add).toHaveBeenCalledWith("user-1", expect.objectContaining({
    userId: "user-1",
    status: "mock-received",
    lines: [{ productId: "omega", name: "오메가3", quantity: 2, unitPrice: 16000 }],
    total: 32000,
  }));
});

it("returns newest orders first", async () => {
  adapter.list.mockResolvedValue([olderOrder, newerOrder]);
  await expect(repository.list("user-1")).resolves.toEqual([newerOrder, olderOrder]);
});
```

- [ ] **Step 2: Run the repository test and verify RED**

Run: `pnpm vitest run lib/firebase/member-orders.test.ts`

Expected: FAIL because the order repository does not exist.

- [ ] **Step 3: Implement immutable order writes and normalized reads**

Use `addDoc(collection(db, "users", uid, "orders"), snapshot)` and query with `orderBy("createdAt", "desc")`. Copy only product ID, name, quantity, and unit price from cart lines; do not copy selection or stock state.

- [ ] **Step 4: Add failing Firestore ownership and immutability tests**

```ts
it("allows an owner profile and order but denies another user", async () => {
  const owner = testEnvironment.authenticatedContext("user-1").firestore();
  const stranger = testEnvironment.authenticatedContext("user-2").firestore();
  await assertSucceeds(setDoc(doc(owner, "users/user-1"), validProfile("user-1")));
  await assertFails(getDoc(doc(stranger, "users/user-1")));
  await assertSucceeds(setDoc(doc(owner, "users/user-1/orders/order-1"), validOrder("user-1")));
  await assertFails(updateDoc(doc(owner, "users/user-1/orders/order-1"), { total: 1 }));
  await assertFails(deleteDoc(doc(owner, "users/user-1/orders/order-1")));
});
```

- [ ] **Step 5: Run rules tests and verify RED**

Run: `pnpm vitest run firestore.rules.test.ts`

Expected: FAIL because `users` and nested member orders are denied by the default rule.

- [ ] **Step 6: Implement strict profile and member-order rules**

```text
match /users/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow create: if request.auth != null && request.auth.uid == uid
    && request.resource.data.uid == uid;
  allow update: if request.auth != null && request.auth.uid == uid
    && request.resource.data.uid == resource.data.uid
    && request.resource.data.email == resource.data.email
    && request.resource.data.termsAcceptedAt == resource.data.termsAcceptedAt
    && request.resource.data.createdAt == resource.data.createdAt;
  allow delete: if false;

  match /orders/{orderId} {
    allow read: if request.auth != null && request.auth.uid == uid;
    allow create: if request.auth != null && request.auth.uid == uid
      && request.resource.data.userId == uid
      && request.resource.data.status == "mock-received"
      && request.resource.data.lines is list
      && request.resource.data.lines.size() > 0
      && request.resource.data.subtotal >= 0
      && request.resource.data.shippingFee >= 0
      && request.resource.data.total >= 0;
    allow update, delete: if false;
  }
}
```

Add explicit allowed-key and required-type checks in the actual rules so callers cannot add privilege or hidden fields. Keep top-level `/orders` denied.

- [ ] **Step 7: Verify repositories, rules, and regressions; then commit**

Run: `pnpm vitest run lib/firebase/member-orders.test.ts firestore.rules.test.ts`

Expected: PASS for owner operations, FAIL assertions for stranger/spoof/update/delete attempts, and all existing admin/product/review cases still passing.

```bash
git add lib/firebase/member-orders.ts lib/firebase/member-orders.test.ts firestore.rules firestore.rules.test.ts
git commit -m "feat: secure member order history"
```

---

### Task 5: My Page

**Files:**
- Create: `components/account/my-page.tsx`
- Create: `components/account/my-page.test.tsx`
- Create: `components/account/profile-form.tsx`
- Create: `components/account/order-history.tsx`
- Create: `app/mypage/page.tsx`

**Interfaces:**
- Consumes: `useAuth`, profile repository, and member-order repository.
- Produces: `/mypage` with isolated profile, saved-address, and order-history states.

- [ ] **Step 1: Write failing authentication and data-state tests**

```tsx
it("offers login with a return path when signed out", () => {
  authState.status = "signed-out";
  render(<MyPage />);
  expect(screen.getByRole("link", { name: "로그인" }))
    .toHaveAttribute("href", "/login?next=%2Fmypage");
});

it("shows profile and newest orders without exposing another UID", async () => {
  authState.user = { uid: "user-1", email: "member@example.com", emailVerified: false };
  render(<MyPage />);
  expect(getUserProfileMock).toHaveBeenCalledWith("user-1");
  expect(listMemberOrdersMock).toHaveBeenCalledWith("user-1");
  expect(await screen.findByText("VL-20260824-NEW123")).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run components/account/my-page.test.tsx`

Expected: FAIL because the account components and route do not exist.

- [ ] **Step 3: Implement request-safe My Page state**

Load profile and orders independently after a signed-in UID appears. Capture the requested UID and discard each result if the current UID changed before resolution. On sign-out, synchronously clear profile and orders. Each section has its own loading, error, retry, empty, and success state.

- [ ] **Step 4: Implement profile/address saves and verification notice**

The profile form writes only `{ displayName, phone, defaultAddress }`, validates the same Korean phone/postcode patterns as checkout, disables duplicate submits, and announces success. Show a verification reminder only when `emailVerified` is false, with a button that calls `sendVerification`.

- [ ] **Step 5: Verify My Page behavior and commit**

Run: `pnpm vitest run components/account/my-page.test.tsx`

Expected: PASS for signed-out, checking, profile failure, order failure, empty orders, successful update, and stale-request cases.

```bash
git add components/account app/mypage
git commit -m "feat: add member profile and order history"
```

---

### Task 6: Checkout Member Integration

**Files:**
- Modify: `components/checkout/checkout-form.tsx`
- Modify: `components/checkout/checkout-form.test.tsx`
- Create: `components/checkout/order-complete-actions.tsx`
- Create: `components/checkout/order-complete-actions.test.tsx`
- Modify: `app/order-complete/page.tsx`
- Modify: `app/order-complete/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `getUserProfile`, `updateUserProfile`, `createMemberOrder`, `processPayment`, and existing cart actions.
- Produces: guest/member checkout branches and an order-complete link to member history.

- [ ] **Step 1: Add failing saved-address hydration tests**

```tsx
it("prefills a signed-in member address without overwriting typing", async () => {
  getUserProfileMock.mockReturnValue(profileDeferred.promise);
  renderMemberCheckout();
  await userEvent.type(screen.getByLabelText("받는 분"), "직접 입력");
  profileDeferred.resolve(profileWithSavedAddress);
  expect(await screen.findByLabelText("받는 분")).toHaveValue("직접 입력");
  expect(screen.getByRole("checkbox", { name: /기본 배송지로 저장/ })).toBeVisible();
});
```

- [ ] **Step 2: Add failing member/guest submission tests**

```tsx
it("stores a member order before clearing selected cart lines", async () => {
  renderMemberCheckout();
  await submitValidCheckout();
  expect(createMemberOrderMock).toHaveBeenCalledWith(
    "user-1",
    expect.objectContaining({ lines: [selectedLine] }),
    paymentResult,
  );
  expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([unselectedLine]);
});

it("keeps the cart when member order storage fails", async () => {
  createMemberOrderMock.mockRejectedValue(new Error("write failed"));
  renderMemberCheckout();
  await submitValidCheckout();
  expect(screen.getByRole("alert")).toHaveTextContent("주문 정보를 저장하지 못했습니다");
  expect(JSON.parse(localStorage.getItem(storageKey) ?? "[]")).toEqual([selectedLine, unselectedLine]);
  expect(pushMock).not.toHaveBeenCalled();
});

it("does not persist a guest mock order", async () => {
  renderGuestCheckout();
  await submitValidCheckout();
  expect(createMemberOrderMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run checkout tests and verify RED**

Run: `pnpm vitest run components/checkout/checkout-form.test.tsx`

Expected: FAIL because checkout does not consume member state or persist orders.

- [ ] **Step 4: Implement the ordered checkout transaction flow**

Track whether the customer changed delivery fields before profile hydration. On submit, call `processPayment`; for a member, call `createMemberOrder` before `clearSelected`. If address saving is selected, update the saved address and surface a non-blocking completion notice if that optional write fails after order creation. Keep the existing duplicate-submit ref and all existing guest behavior.

- [ ] **Step 5: Add the member-history completion action and verify GREEN**

Create a client `OrderCompleteActions` component that consumes `useAuth`. Show `주문내역 보기` when signed in and preserve product/cart actions for every visitor. If optional saved-address persistence failed after the order write, navigate with `addressSaved=0` and render `주문은 접수되었지만 기본 배송지는 저장하지 못했습니다.` without treating the order as failed. Preserve order-number validation.

Run: `pnpm vitest run components/checkout/checkout-form.test.tsx app/order-complete/page.test.tsx`

Expected: PASS for guest/member success, duplicate submission, unavailable stock, storage failure, address hydration, and completion links.

- [ ] **Step 6: Commit checkout integration**

```bash
git add components/checkout/checkout-form.tsx components/checkout/checkout-form.test.tsx app/order-complete
git commit -m "feat: connect member orders to checkout"
```

---

### Task 7: Complete Desktop, Mobile, Footer, and Purchase Menus

**Files:**
- Modify: `lib/navigation/storefront-menu.ts`
- Modify: `lib/navigation/storefront-menu.test.ts`
- Modify: `app/storefront-route-contract.test.ts`
- Modify: `components/shell/site-header.tsx`
- Modify: `components/shell/site-header.test.tsx`
- Modify: `components/shell/site-footer.test.tsx`
- Modify: `components/product/product-detail.test.tsx`
- Modify: `app/order-complete/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, existing `STOREFRONT_MENU`, supported product query parser, and existing product/cart routes.
- Produces: account destinations in the shared route contract and verified results for every visible action.

- [ ] **Step 1: Extend the failing route contract with account destinations**

```ts
expect(hrefs).toEqual(expect.arrayContaining([
  "/",
  "/login",
  "/signup",
  "/mypage",
  "/admin",
  "/cart",
  "/checkout",
]));
```

Replace the previous assertion that authentication is absent from public navigation with assertions that every account destination resolves to an App Router page and that all help pages remain present.

- [ ] **Step 2: Run menu contract tests and verify RED**

Run: `pnpm vitest run lib/navigation/storefront-menu.test.ts app/storefront-route-contract.test.ts components/shell/site-header.test.tsx`

Expected: FAIL because account destinations and auth-aware header actions are missing.

- [ ] **Step 3: Add shared account destinations and auth-aware header actions**

```ts
login: { key: "login", label: "로그인", href: "/login" },
signup: { key: "signup", label: "회원가입", href: "/signup" },
mypage: { key: "mypage", label: "마이페이지", href: "/mypage" },
```

Render `로그인` while signed out; render `마이페이지` and an actual logout button while signed in; render a fixed-width neutral placeholder while checking. Apply the same contract in the mobile drawer and close the drawer after logout. Keep administrator and cart actions visible.

- [ ] **Step 4: Verify each storefront result, not only its URL**

Extend the route test to render every product menu destination against sample products and assert its title plus a non-empty product result. Keep dedicated tests for today-discount filtering, concern/category filters, ingredient/name/benefit search, invalid query normalization, and empty-result reset. Assert footer pages render their unique heading. Preserve product-detail tests proving add-to-cart and buy-now ordering.

- [ ] **Step 5: Run the complete navigation and purchase-flow test slice**

Run: `pnpm vitest run lib/navigation app/storefront-route-contract.test.ts components/shell components/commerce components/product/product-detail.test.tsx app/order-complete/page.test.tsx`

Expected: PASS with every destination unique, supported, rendered, and functionally useful.

- [ ] **Step 6: Commit complete menu behavior**

```bash
git add lib/navigation app/storefront-route-contract.test.ts components/shell components/product/product-detail.test.tsx app/order-complete/page.test.tsx
git commit -m "feat: complete account and storefront menus"
```

---

### Task 8: Responsive Styling, Documentation, and Full Verification

**Files:**
- Modify: `app/globals.css`
- Create: `components/auth/account-responsive-css.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all account and navigation components.
- Produces: responsive account/checkout UI, Firebase Console setup instructions, and fresh completion evidence.

- [ ] **Step 1: Write a failing responsive CSS contract test**

```ts
it("keeps account forms readable and actions full-width on narrow screens", async () => {
  const css = await readFile(resolve(process.cwd(), "app/globals.css"), "utf8");
  expect(css).toContain(".auth-page");
  expect(css).toContain(".mypage-page");
  expect(css).toMatch(/@media\s*\(max-width:\s*720px\)/);
  expect(css).toMatch(/\.auth-form[\s\S]*min-height:\s*48px/);
});
```

- [ ] **Step 2: Run the CSS test and verify RED**

Run: `pnpm vitest run components/auth/account-responsive-css.test.ts`

Expected: FAIL because the account selectors do not exist.

- [ ] **Step 3: Add account and My Page styles**

Use the existing white/beige/green tokens. Keep content width between 680px for forms and 1120px for My Page. Use at least 48px touch targets, visible focus rings, 16px minimum mobile inputs, one-column mobile cards, and sticky behavior only where it does not cover form errors.

- [ ] **Step 4: Document the one-time Firebase setup**

Add a README section that instructs the owner to enable **Firebase Console → Authentication → Sign-in method → Email/Password**, add the Vercel production domain to authorized domains if absent, and deploy `firestore.rules`. State that passwords never enter Firestore and guest orders are intentionally not stored.

- [ ] **Step 5: Run the complete automated verification**

Run in this order:

```bash
pnpm test
pnpm lint
pnpm build:vercel
pnpm build
```

Expected: all Vitest files pass with zero failing tests; ESLint exits 0; Next.js production build exits 0; Vinext build exits 0.

- [ ] **Step 6: Perform browser verification**

Start the app with `pnpm dev` and verify at desktop and a 390px mobile viewport:

1. Every desktop header, mobile drawer, and footer action reaches the documented page or filtered result.
2. A product card opens its detail page; add-to-cart and buy-now reach cart/checkout.
3. Signup shows validation, creates a member, sends verification, and opens My Page.
4. Logout changes the header; login returns to the requested internal page; reset request shows success.
5. Saved delivery data prefills checkout without overwriting typed input.
6. Member mock order appears in My Page; guest mock order is not persisted.
7. No application console errors occur.

- [ ] **Step 7: Commit responsive styling and setup documentation**

```bash
git add app/globals.css components/auth/account-responsive-css.test.ts README.md
git commit -m "docs: finalize member account rollout"
```

- [ ] **Step 8: Deploy required external configuration and production code**

With the user's action-time approval, enable Email/Password authentication in the existing Firebase project, deploy `firestore.rules`, push commits to GitHub `main`, and redeploy the Vercel `vitaleaf` production project. Do not expose API keys or credentials in logs or chat.

- [ ] **Step 9: Verify production**

Confirm the Vercel deployment is `READY`, `/`, `/login`, `/signup`, `/mypage`, `/products`, one product detail, `/cart`, and `/checkout` return HTTP 200, and Vercel reports no recent runtime errors.
