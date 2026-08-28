# VITALEAF 1:1 Inquiries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give signed-in members and verified guest-order customers a private 1:1 inquiry board with secure image attachments, while giving administrators a pending badge, filters, replies, and delete controls.

**Architecture:** Put all inquiry reads and writes behind Vercel server APIs using Firebase Admin. Members authenticate with Firebase ID tokens; guest customers exchange order number plus phone verification for a short-lived HMAC token held only in memory. Upload images directly to Firebase Storage through short-lived signed PUT URLs, then validate and finalize them server-side so 5MB files do not cross Vercel's 4.5MB Function payload boundary.

**Tech Stack:** Next.js 16 Route Handlers, React 19, Firebase Admin Auth/Firestore/Storage, Node crypto, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-08-28-auth-product-options-inquiries-design.md`

## Global Constraints

- Members can read/create only their own inquiries.
- Guests must verify order number plus order phone and can access only inquiries for that order.
- Only administrators can reply to or delete inquiries.
- Categories are `order`, `shipping`, `product`, `return`, and `other`.
- Statuses are `waiting` and `answered`; no external email/SMS notification in this release.
- Attachments are JPG, PNG, or WebP; at most 3 files; at most 5MB each.
- File bytes, not extension alone, determine accepted image type.
- Inquiry and attachment browser access is denied by default; authorized server APIs issue short-lived signed URLs.
- Never log full phone numbers, addresses, bearer tokens, signed URLs, or Firebase credentials.
- Implement by TDD and commit after each independently reviewable task.

---

### Task 1: Define inquiry records and strict request validation

**Files:**
- Create: `lib/inquiries/types.ts`
- Create: `lib/inquiries/validation.ts`
- Create: `lib/inquiries/validation.test.ts`

**Interfaces:**
- Produces: `InquiryCategory`, `InquiryStatus`, `InquiryAttachment`, `InquiryRecord`, `InquiryPublic`, `InquiryCreateInput`, `parseInquiryCreateInput`, and `parseInquiryListFilters`.
- All server and UI tasks consume these exact types.

- [ ] **Step 1: Write failing validation tests**

```ts
expect(parseInquiryCreateInput({
  category: "product", title: "2개월분 문의", body: "섭취 기간을 확인하고 싶습니다.",
  orderNumber: "", uploadReceipts: [],
})).toMatchObject({ category: "product", title: "2개월분 문의" });
expect(() => parseInquiryCreateInput({
  category: "invalid", title: "", body: "x", uploadReceipts: Array(4).fill("receipt"),
})).toThrow(InquiryValidationError);
```

Test title 1–100 characters, body 1–3,000, order number format when present, allowed category/status, no control characters, no more than 3 upload receipts, and filters with a maximum page size of 50.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- lib/inquiries/validation.test.ts
```

- [ ] **Step 3: Implement exact domain types**

```ts
export type InquiryCategory = "order" | "shipping" | "product" | "return" | "other";
export type InquiryStatus = "waiting" | "answered";
export type InquiryOwner =
  | { ownerType: "member"; memberUid: string; guestOrderNumber: null }
  | { ownerType: "guest"; memberUid: null; guestOrderNumber: string };
```

Use discriminated unions so a guest document cannot accidentally carry a member UID and vice versa.

- [ ] **Step 4: Run tests, lint, and commit**

```powershell
pnpm test -- lib/inquiries/validation.test.ts
pnpm exec eslint lib/inquiries
git add lib/inquiries/types.ts lib/inquiries/validation.ts lib/inquiries/validation.test.ts
git commit -m "feat: define private inquiry contracts"
```

### Task 2: Issue and verify short-lived guest and upload tokens

**Files:**
- Create: `lib/inquiries/access.ts`
- Create: `lib/inquiries/access.test.ts`

**Interfaces:**
- Consumes: `verifyBearerMember` and `verifyBearerAdmin` from the authentication plan.
- Produces: `InquirySubject`, `issueGuestInquiryToken`, `verifyGuestInquiryToken`, `issueUploadReceipt`, and `verifyUploadReceipt`.
- Uses: server-only `INQUIRY_TOKEN_SECRET`, minimum 32 characters.

- [ ] **Step 1: Write failing token tests**

```ts
const token = issueGuestInquiryToken("VL-20260826-ABC123", NOW, SECRET);
expect(verifyGuestInquiryToken(token, new Date(NOW.getTime() + 5 * 60_000), SECRET))
  .toEqual({ kind: "guest", orderNumber: "VL-20260826-ABC123" });
expect(() => verifyGuestInquiryToken(`${token}x`, NOW, SECRET)).toThrow(InquiryAccessError);
expect(() => verifyGuestInquiryToken(token, new Date(NOW.getTime() + 31 * 60_000), SECRET))
  .toThrow(InquiryAccessError);
```

Prove an upload receipt is bound to the exact subject, object path, content type, declared size, and 10-minute expiration.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- lib/inquiries/access.test.ts
```

- [ ] **Step 3: Implement versioned base64url payloads with HMAC-SHA256**

```ts
type SignedEnvelope = { v: 1; purpose: "guest-inquiry" | "inquiry-upload"; exp: number; payload: unknown };
const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
if (!timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new InquiryAccessError();
```

Reject wrong version, purpose, signature length, malformed JSON, expired time, weak secret, and subject mismatch. Never place phone data in either token.

- [ ] **Step 4: Run tests and commit**

```powershell
pnpm test -- lib/inquiries/access.test.ts
git add lib/inquiries/access.ts lib/inquiries/access.test.ts
git commit -m "feat: secure guest inquiry access tokens"
```

### Task 3: Create the Firestore inquiry repository

**Files:**
- Create: `lib/inquiries/repository.ts`
- Create: `lib/firebase/inquiries.ts`
- Create: `lib/firebase/inquiries.test.ts`

**Interfaces:**
- Produces: `InquiryRepository` with `create`, `listForMember`, `listForGuestOrder`, `get`, `listAdmin`, `countWaiting`, `reply`, and `delete`.
- Produces: `createFirestoreInquiryRepository({ getFirestore })`.

- [ ] **Step 1: Write failing repository tests**

```ts
await repository.create(memberRecord);
await expect(repository.listForMember("member-1", filters)).resolves.toHaveLength(1);
await expect(repository.listForMember("member-2", filters)).resolves.toEqual([]);
await repository.reply("inquiry-1", { adminReply: "답변", repliedBy: "admin-1", repliedAt: NOW });
await expect(repository.get("inquiry-1")).resolves.toMatchObject({ status: "answered" });
```

Test malformed dates/attachments, newest-first ordering, filters, waiting count, and delete returning attachment paths for cleanup.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- lib/firebase/inquiries.test.ts
```

- [ ] **Step 3: Implement repository methods**

```ts
export type InquiryRepository = {
  create(record: InquiryRecord): Promise<void>;
  listForMember(uid: string, filters: InquiryListFilters): Promise<InquiryRecord[]>;
  listForGuestOrder(orderNumber: string, filters: InquiryListFilters): Promise<InquiryRecord[]>;
  get(id: string): Promise<InquiryRecord | null>;
  listAdmin(filters: InquiryListFilters): Promise<InquiryRecord[]>;
  countWaiting(): Promise<number>;
  reply(id: string, reply: InquiryReplyWrite): Promise<void>;
  delete(id: string): Promise<InquiryAttachment[]>;
};
```

Limit lists to 50. Reply in a transaction so status, reply, reply author/time, and update time change together.

- [ ] **Step 4: Run tests and commit**

```powershell
pnpm test -- lib/firebase/inquiries.test.ts
pnpm exec eslint lib/inquiries/repository.ts lib/firebase/inquiries.ts lib/firebase/inquiries.test.ts
git add lib/inquiries/repository.ts lib/firebase/inquiries.ts lib/firebase/inquiries.test.ts
git commit -m "feat: persist private inquiry records"
```

### Task 4: Verify guest orders and expose inquiry CRUD APIs

**Files:**
- Create: `app/api/inquiries/guest-verify/route.ts`
- Create: `app/api/inquiries/guest-verify/route.test.ts`
- Create: `app/api/inquiries/route.ts`
- Create: `app/api/inquiries/route.test.ts`
- Create: `app/api/inquiries/list/route.ts`
- Create: `app/api/inquiries/list/route.test.ts`
- Create: `app/api/inquiries/detail/route.ts`
- Create: `app/api/inquiries/detail/route.test.ts`
- Create: `lib/inquiries/client.ts`
- Create: `lib/inquiries/client.test.ts`

**Interfaces:**
- Consumes: guest-order lookup service, repository, access tokens, and member bearer verification.
- Produces: `verifyGuestInquiryAccess`, `createInquiry`, `listInquiries`, and `getInquiry` browser clients.

- [ ] **Step 1: Write failing guest verification tests**

```ts
expect(await POST(validOrderAndPhoneRequest)).toMatchObject({ status: 200 });
expect(await POST(wrongPhoneRequest)).toMatchObject({ status: 404 });
expect(await POST(sixthAttemptRequest)).toMatchObject({ status: 429 });
```

Success returns `{ order, accessToken, expiresAt }`; phone and unmasked address never appear.

- [ ] **Step 2: Write failing owner-isolation API tests**

```ts
expect(await list(memberOneRequest)).toEqual(memberOneInquiries);
expect(await detail(memberTwoRequestForMemberOneInquiry)).toMatchObject({ status: 404 });
expect(await detail(guestTokenForOtherOrder)).toMatchObject({ status: 404 });
```

Return 404, not 403, when an inquiry exists but belongs to somebody else.

- [ ] **Step 3: Run and confirm RED**

```powershell
pnpm test -- app/api/inquiries lib/inquiries/client.test.ts
```

- [ ] **Step 4: Implement one access resolver**

```ts
export async function resolveInquirySubject(request: Request): Promise<InquirySubject> {
  const guestToken = request.headers.get("x-inquiry-access");
  if (guestToken) return verifyGuestInquiryToken(guestToken, new Date(), requiredSecret());
  const member = await verifyBearerMember(request);
  return { kind: "member", uid: member.uid };
}
```

Use POST for list/detail so guest identifiers never enter query strings. Validate ownership after every repository read.

- [ ] **Step 5: Implement the browser access contract**

```ts
export type InquiryClientAccess =
  | { kind: "member" }
  | { kind: "guest"; token: string };
```

Member calls get a fresh Firebase ID token; guest calls send `x-inquiry-access`. Do not persist guest tokens.

- [ ] **Step 6: Run tests and commit**

```powershell
pnpm test -- app/api/inquiries lib/inquiries/client.test.ts lib/guest-orders/service.test.ts
git add app/api/inquiries lib/inquiries/client.ts lib/inquiries/client.test.ts
git commit -m "feat: add member and guest inquiry APIs"
```

### Task 5: Upload and finalize private inquiry images

**Files:**
- Modify: `lib/firebase/admin.ts`
- Create: `lib/inquiries/uploads.ts`
- Create: `lib/inquiries/uploads.test.ts`
- Create: `lib/firebase/inquiry-uploads.ts`
- Create: `lib/firebase/inquiry-uploads.test.ts`
- Create: `app/api/inquiries/upload-url/route.ts`
- Create: `app/api/inquiries/upload-url/route.test.ts`
- Modify: `app/api/inquiries/route.ts`
- Modify: `app/api/inquiries/route.test.ts`

**Interfaces:**
- Produces: `getAdminStorageBucket`, `validateUploadRequest`, `detectImageType`, `createInquiryUploadUrl`, `finalizeInquiryUploads`, and `deleteInquiryObjects`.
- Upload route returns `{ uploadUrl, receipt, expiresAt }`.

- [ ] **Step 1: Write failing file-policy tests**

```ts
expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
expect(detectImageType(PNG_SIGNATURE)).toBe("image/png");
expect(detectImageType(WEBP_SIGNATURE)).toBe("image/webp");
expect(() => validateUploadRequest({ contentType: "image/jpeg", size: 5 * 1024 * 1024 + 1 }))
  .toThrow(InquiryUploadError);
```

Test unsupported MIME, zero length, fourth attachment, executable bytes with image extension, expired receipt, and subject mismatch.

- [ ] **Step 2: Write failing signed-upload adapter tests**

```ts
expect(file.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
  version: "v4", action: "write", contentType: "image/webp",
}));
expect(finalPath).toMatch(/^inquiries\/inquiry-1\//);
expect(pendingPath).toMatch(/^inquiryPending\//);
```

Simulate Firestore create failure and assert moved files are deleted as compensation.

- [ ] **Step 3: Run and confirm RED**

```powershell
pnpm test -- lib/inquiries/uploads.test.ts lib/firebase/inquiry-uploads.test.ts app/api/inquiries/upload-url/route.test.ts
```

- [ ] **Step 4: Add Admin Storage and signed paths**

```ts
export const getAdminStorageBucket = (): Bucket =>
  getStorage(getServerApp()).bucket(requiredFirebaseAdminEnv("FIREBASE_STORAGE_BUCKET"));
```

Generate random paths under `inquiryPending/{subjectHash}/{uploadId}`. Write URLs expire in 5 minutes; upload receipts expire in 10 minutes.

- [ ] **Step 5: Verify and finalize with compensation**

Read metadata and only the signature bytes needed for JPEG/PNG/WebP detection. Move accepted objects to `inquiries/{inquiryId}/{uploadId}` before writing metadata. On inquiry-write failure, delete moved objects; delete invalid objects immediately.

- [ ] **Step 6: Run tests and commit**

```powershell
pnpm test -- lib/inquiries/uploads.test.ts lib/firebase/inquiry-uploads.test.ts app/api/inquiries
git add lib/firebase/admin.ts lib/inquiries/uploads.ts lib/inquiries/uploads.test.ts lib/firebase/inquiry-uploads.ts lib/firebase/inquiry-uploads.test.ts app/api/inquiries
git commit -m "feat: upload private inquiry images directly"
```

### Task 6: Build member inquiry pages

**Files:**
- Create: `app/mypage/inquiries/page.tsx`
- Create: `app/mypage/inquiries/new/page.tsx`
- Create: `app/mypage/inquiries/[id]/page.tsx`
- Create: `components/inquiries/inquiry-list.tsx`
- Create: `components/inquiries/inquiry-list.test.tsx`
- Create: `components/inquiries/inquiry-form.tsx`
- Create: `components/inquiries/inquiry-form.test.tsx`
- Create: `components/inquiries/inquiry-detail.tsx`
- Create: `components/inquiries/inquiry-detail.test.tsx`
- Modify: `components/account/my-page.tsx`
- Modify: `components/account/my-page.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: inquiry client access, CRUD calls, and upload-url client.
- Produces: member list/create/detail routes and a My Page `1:1 문의` entry.

- [ ] **Step 1: Write failing member journey tests**

```tsx
expect(screen.getByRole("link", { name: "1:1 문의" })).toHaveAttribute("href", "/mypage/inquiries");
await user.selectOptions(screen.getByLabelText("문의 유형"), "product");
await user.upload(screen.getByLabelText("이미지 첨부"), [jpeg, png]);
await user.click(screen.getByRole("button", { name: "문의 등록" }));
expect(createInquiry).toHaveBeenCalledWith(expect.objectContaining({ category: "product" }));
```

Test signed-out redirect, preview/removal, 3-file/5MB errors, retained text after failure, waiting/answered labels, and authorized attachment display.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- components/inquiries components/account/my-page.test.tsx
```

- [ ] **Step 3: Implement list, form, and detail components**

Upload with concurrency 2 to avoid saturating mobile connections. Show per-file progress/error and keep successful files visible. Route successful creation to `/mypage/inquiries/{id}`.

- [ ] **Step 4: Add responsive accessible styling**

Use visible labels, `role="status"` for progress, `role="alert"` for failures, keyboard attachment removal, and 44px mobile controls.

- [ ] **Step 5: Run tests and commit**

```powershell
pnpm test -- components/inquiries components/account/my-page.test.tsx app/info-routes.test.tsx
git add app/mypage/inquiries components/inquiries components/account/my-page.tsx components/account/my-page.test.tsx app/globals.css
git commit -m "feat: add member inquiry pages"
```

### Task 7: Add guest inquiry access to order lookup

**Files:**
- Modify: `components/orders/guest-order-lookup-form.tsx`
- Modify: `components/orders/guest-order-lookup-form.test.tsx`
- Create: `components/inquiries/guest-inquiry-panel.tsx`
- Create: `components/inquiries/guest-inquiry-panel.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `verifyGuestInquiryAccess` and shared inquiry components.
- Produces: an in-memory verified guest session for the current order result.

- [ ] **Step 1: Write failing guest journey tests**

```tsx
await submitValidOrderLookup();
expect(screen.getByRole("button", { name: "이 주문으로 1:1 문의하기" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "이 주문으로 1:1 문의하기" }));
expect(screen.getByLabelText("관련 주문번호")).toHaveValue("VL-20260826-ABC123");
```

Assert the token never appears in the URL or localStorage, disappears when a different order is submitted, and must be reacquired after remount.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- components/orders/guest-order-lookup-form.test.tsx components/inquiries/guest-inquiry-panel.test.tsx
```

- [ ] **Step 3: Integrate verified access**

Keep `{ order, accessToken, expiresAt }` only in component state. Preselect and lock the verified order number in the inquiry form.

- [ ] **Step 4: Run tests and commit**

```powershell
pnpm test -- components/orders components/inquiries/guest-inquiry-panel.test.tsx app/order-lookup/page.test.tsx
git add components/orders/guest-order-lookup-form.tsx components/orders/guest-order-lookup-form.test.tsx components/inquiries/guest-inquiry-panel.tsx components/inquiries/guest-inquiry-panel.test.tsx app/globals.css
git commit -m "feat: let verified guests submit inquiries"
```

### Task 8: Add administrator inquiry triage, reply, and delete

**Files:**
- Create: `app/api/admin/inquiries/route.ts`
- Create: `app/api/admin/inquiries/route.test.ts`
- Create: `app/api/admin/inquiries/reply/route.ts`
- Create: `app/api/admin/inquiries/reply/route.test.ts`
- Create: `app/api/admin/inquiries/delete/route.ts`
- Create: `app/api/admin/inquiries/delete/route.test.ts`
- Create: `components/admin/inquiry-panel.tsx`
- Create: `components/admin/inquiry-panel.test.tsx`
- Modify: `components/admin/admin-dashboard.tsx`
- Modify: `components/admin/admin-dashboard.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: admin bearer verification, inquiry repository, Storage delete helper, and client ID-token helper.
- Produces: admin list/count/reply/delete endpoints and `DashboardView = "inquiries"`.

- [ ] **Step 1: Write failing API authorization tests**

```ts
expect(await list(memberBearerRequest)).toMatchObject({ status: 403 });
expect(await reply(adminBearerRequest)).toMatchObject({ status: 200 });
expect(await remove(adminBearerRequest)).toMatchObject({ status: 204 });
expect(deleteInquiryObjects).toHaveBeenCalledWith(deletedAttachments);
```

Test empty/over-3,000-character replies, missing inquiries, and safe repeated delete.

- [ ] **Step 2: Write failing dashboard tests**

```tsx
expect(screen.getByRole("tab", { name: /1:1 문의/ })).toHaveTextContent("3");
await user.click(screen.getByRole("tab", { name: /1:1 문의/ }));
await user.selectOptions(screen.getByLabelText("답변 상태"), "waiting");
await user.type(screen.getByLabelText("관리자 답변"), "확인 후 안내드립니다.");
await user.click(screen.getByRole("button", { name: "답변 저장" }));
```

- [ ] **Step 3: Run and confirm RED**

```powershell
pnpm test -- app/api/admin/inquiries components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx
```

- [ ] **Step 4: Implement APIs and isolated panel**

Verify admin on every endpoint. Return short-lived authorized image read URLs. On delete, remove the Firestore record and connected objects; do not expose object paths in browser errors.

- [ ] **Step 5: Add inquiry tab and pending badge**

Extend `DashboardView` and roving keyboard tabs with `inquiries`. Keep product subscriptions unchanged; `InquiryPanel` owns its load, filters, reply, delete, and pending count.

- [ ] **Step 6: Run tests and commit**

```powershell
pnpm test -- app/api/admin/inquiries components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx
git add app/api/admin/inquiries components/admin/inquiry-panel.tsx components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.tsx components/admin/admin-dashboard.test.tsx app/globals.css
git commit -m "feat: manage customer inquiries in admin"
```

### Task 9: Lock down Firebase and add indexes/lifecycle configuration

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.rules.test.ts`
- Modify: `storage.rules`
- Modify: `storage.rules.test.ts`
- Create: `firestore.indexes.json`
- Create: `storage.cors.json`
- Create: `storage.lifecycle.json`
- Modify: `firebase.json`
- Modify: `README.md`

**Interfaces:**
- Produces: explicit client denial and query indexes for member, guest, and admin lists.

- [ ] **Step 1: Add emulator regression tests for the existing default-deny boundary**

```ts
await assertFails(memberDb.doc("inquiries/inquiry-1").get());
await assertFails(memberDb.doc("inquiries/inquiry-1").set({ title: "blocked" }));
await assertFails(uploadBytes(memberStorageRef("inquiryPending/x.jpg"), jpegBytes));
await assertFails(getBytes(memberStorageRef("inquiries/inquiry-1/x.jpg")));
```

- [ ] **Step 2: Run the rules tests and confirm the catch-all deny already protects the new paths**

```powershell
pnpm test -- firestore.rules.test.ts storage.rules.test.ts
```

- [ ] **Step 3: Add explicit deny rules and indexes**

Create these Firestore composite indexes:

```text
memberUid ASC + createdAt DESC
guestOrderNumber ASC + createdAt DESC
status ASC + createdAt DESC
category ASC + createdAt DESC
status ASC + category ASC + createdAt DESC
```

Point `firebase.json` to `firestore.indexes.json`.

- [ ] **Step 4: Add CORS and pending lifecycle documents**

```json
[{"origin":["*"],"method":["PUT"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]
```

The wildcard only permits use of an already-authorized, short-lived signed PUT URL; it grants no Storage credential. `storage.lifecycle.json` deletes only `inquiryPending/` objects older than 1 day.

```json
{"rule":[{"action":{"type":"Delete"},"condition":{"age":1,"matchesPrefix":["inquiryPending/"]}}]}
```

- [ ] **Step 5: Run tests and commit**

```powershell
pnpm test -- firestore.rules.test.ts storage.rules.test.ts
git add firestore.rules firestore.rules.test.ts storage.rules storage.rules.test.ts firestore.indexes.json storage.cors.json storage.lifecycle.json firebase.json README.md
git commit -m "chore: secure inquiry data and upload storage"
```

- [ ] **Step 6: Apply Firebase configuration only with action-time approval**

```powershell
firebase deploy --only firestore:rules,firestore:indexes,storage
gcloud storage buckets update "gs://$env:FIREBASE_STORAGE_BUCKET" --cors-file=storage.cors.json
gcloud storage buckets update "gs://$env:FIREBASE_STORAGE_BUCKET" --lifecycle-file=storage.lifecycle.json
```

Before running, confirm the resolved project and bucket are the VITALEAF project. Never run these mutations merely because the plan exists.

### Task 10: Run full inquiry and deployment verification

**Files:**
- Verify only; modify only defects inside this plan's scope.

**Interfaces:**
- Produces: evidence that browser, API, Firestore, and Storage boundaries work end to end.

- [ ] **Step 1: Run all focused inquiry tests**

```powershell
pnpm test -- lib/inquiries lib/firebase/inquiries.test.ts lib/firebase/inquiry-uploads.test.ts app/api/inquiries app/api/admin/inquiries components/inquiries components/orders/guest-order-lookup-form.test.tsx components/account/my-page.test.tsx components/admin/inquiry-panel.test.tsx components/admin/admin-dashboard.test.tsx firestore.rules.test.ts storage.rules.test.ts
```

- [ ] **Step 2: Run the repository-wide gate**

```powershell
pnpm lint
pnpm test
pnpm build:vercel
git status --short --branch
```

Expected: lint exits 0, every Vitest test passes, Production build exits 0, and the worktree is clean.

- [ ] **Step 3: Verify Preview end to end**

```text
회원 로그인 → 문의 작성 → JPG/PNG/WebP 첨부 → 답변 대기 확인
비회원 주문번호/전화 확인 → 해당 주문 문의 작성 → 재방문 시 재검증
관리자 로그인 → 미답변 배지 → 유형/상태 필터 → 답변 → 고객 답변 완료 확인
일반 회원 타인 문의 차단 → 비회원 다른 주문 차단 → 고객 삭제 차단
5MB 직접 업로드 성공 → 5MB 초과/4번째 파일/위장 파일 차단
```

- [ ] **Step 4: Verify deployment configuration without exposing values**

Confirm Preview and Production contain `FIREBASE_STORAGE_BUCKET` and `INQUIRY_TOKEN_SECRET`, indexes are built, Storage CORS/lifecycle are active, and no token or phone appears in logs.
