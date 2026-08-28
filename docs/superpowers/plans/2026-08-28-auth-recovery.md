# VITALEAF Authentication Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore member signup/login and admin login in Preview and Production, with actionable Korean configuration errors and reusable Firebase ID-token access.

**Architecture:** Keep Firebase Email/Password authentication. Validate the statically referenced `NEXT_PUBLIC_FIREBASE_*` object before Firebase initialization, preserve the existing injectable auth adapters, and expose one client ID-token helper for later member-order and inquiry APIs. Treat Vercel/Firebase console configuration as an explicit deployment gate rather than hiding it behind generic UI errors.

**Tech Stack:** Next.js 16, React 19, Firebase Auth/Firestore, Vitest, Testing Library, Vercel

**Spec:** `docs/superpowers/specs/2026-08-28-auth-product-options-inquiries-design.md`

## Global Constraints

- Keep the existing Next.js, Firebase, and Vercel architecture.
- Configure both Vercel Preview and Production; `NEXT_PUBLIC_*` changes require a new build.
- Use a stable Preview alias and the Production domain in Firebase Auth authorized domains.
- Never print Firebase values, ID tokens, passwords, or server credentials in tests, logs, docs, or command output.
- Only `admins/{uid}.role == "admin"` grants administrator access.
- Do not add social login or a second authentication provider.
- Implement by TDD and commit after each independently reviewable task.

---

### Task 1: Validate Firebase browser configuration before initialization

**Files:**
- Create: `lib/firebase/client-config.ts`
- Create: `lib/firebase/client-config.test.ts`
- Modify: `lib/firebase/client.ts`

**Interfaces:**
- Produces: `FirebasePublicConfig`, `FirebaseClientConfigurationError`, `validateFirebasePublicConfig(config): FirebasePublicConfig`, and `assertFirebaseClientConfigured(): void`.
- Later tasks consume: the normalized error code `firebase/client-config-missing` from both member and admin error mapping.

- [ ] **Step 1: Write the failing configuration tests**

```ts
expect(validateFirebasePublicConfig(validConfig)).toEqual(validConfig);
expect(() => validateFirebasePublicConfig({ ...validConfig, apiKey: "" }))
  .toThrowError(expect.objectContaining({ code: "firebase/client-config-missing" }));
expect(validateFirebasePublicConfig({ ...validConfig, measurementId: undefined }).measurementId)
  .toBeUndefined();
```

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
pnpm test -- lib/firebase/client-config.test.ts
```

Expected: FAIL because `client-config.ts` does not exist.

- [ ] **Step 3: Implement strict validation without dynamic environment lookup**

```ts
export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export class FirebaseClientConfigurationError extends Error {
  readonly code = "firebase/client-config-missing";
}

export function validateFirebasePublicConfig(
  config: Partial<FirebasePublicConfig>,
): FirebasePublicConfig {
  const required = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;
  if (required.some((key) => !config[key]?.trim())) throw new FirebaseClientConfigurationError();
  return { ...config, measurementId: config.measurementId?.trim() || undefined } as FirebasePublicConfig;
}
```

In `client.ts`, construct the object with literal references such as `process.env.NEXT_PUBLIC_FIREBASE_API_KEY`; do not use `process.env[name]`, because Next.js must replace public values at build time. Catch the validation error during module setup and retain it for `assertFirebaseClientConfigured`; do not throw during import, which would replace the login form with a page-level crash. Call the assertion immediately before create/sign-in/reset/verification operations.

```ts
let configurationError: FirebaseClientConfigurationError | null = null;
try { validateFirebasePublicConfig(rawConfig); } catch (error) {
  if (error instanceof FirebaseClientConfigurationError) configurationError = error;
  else throw error;
}
export const assertFirebaseClientConfigured = () => {
  if (configurationError) throw configurationError;
};
```

- [ ] **Step 4: Run the focused test and lint the files**

```powershell
pnpm test -- lib/firebase/client-config.test.ts
pnpm exec eslint lib/firebase/client-config.ts lib/firebase/client.ts
```

Expected: tests PASS and ESLint exits 0.

- [ ] **Step 5: Commit the configuration boundary**

```powershell
git add lib/firebase/client-config.ts lib/firebase/client-config.test.ts lib/firebase/client.ts
git commit -m "fix: validate firebase client configuration"
```

### Task 2: Map member and admin configuration failures to actionable messages

**Files:**
- Modify: `lib/firebase/member-auth.test.ts`
- Modify: `lib/firebase/member-auth.ts`
- Modify: `lib/firebase/auth.test.ts`
- Modify: `lib/firebase/auth.ts`
- Test: `components/auth/login-form.test.tsx`
- Test: `components/auth/signup-form.test.tsx`
- Test: `components/admin/admin-dashboard.test.tsx`

**Interfaces:**
- Consumes: `FirebaseClientConfigurationError.code` from Task 1.
- Produces: stable Korean messages from `getMemberAuthErrorMessage(error)` and `getAdminAuthErrorMessage(error)`.

- [ ] **Step 1: Add failing error-table cases**

```ts
it.each([
  ["firebase/client-config-missing", "사이트 인증 설정이 필요합니다"],
  ["auth/invalid-api-key", "사이트 인증 설정이 필요합니다"],
  ["auth/configuration-not-found", "로그인 방식 설정이 필요합니다"],
  ["auth/operation-not-allowed", "이메일 로그인 설정이 필요합니다"],
  ["auth/unauthorized-domain", "현재 접속 주소의 로그인 승인이 필요합니다"],
])("maps %s without exposing credentials", (code, copy) => {
  expect(getMemberAuthErrorMessage({ code })).toContain(copy);
  expect(getMemberAuthErrorMessage({ code })).not.toContain("AIza");
});
```

Repeat the same operational distinctions for `getAdminAuthErrorMessage` while preserving the existing generic invalid-credential copy.

- [ ] **Step 2: Run member/admin auth tests and confirm RED**

```powershell
pnpm test -- lib/firebase/member-auth.test.ts lib/firebase/auth.test.ts
```

Expected: new configuration-message cases FAIL.

- [ ] **Step 3: Add explicit switch cases**

```ts
case "firebase/client-config-missing":
case "auth/invalid-api-key":
  return "사이트 인증 설정이 필요합니다. 관리자에게 알려 주세요.";
case "auth/configuration-not-found":
case "auth/operation-not-allowed":
  return "이메일 로그인 설정이 필요합니다. 관리자에게 알려 주세요.";
case "auth/unauthorized-domain":
  return "현재 접속 주소의 로그인 승인이 필요합니다. 관리자에게 알려 주세요.";
```

Call `assertFirebaseClientConfigured()` at the start of member create/sign-in/reset/verification and administrator sign-in adapters so the error reaches the existing form-level `catch` blocks.

- [ ] **Step 4: Verify forms render the mapped errors**

```powershell
pnpm test -- components/auth/login-form.test.tsx components/auth/signup-form.test.tsx components/admin/admin-dashboard.test.tsx
```

Expected: PASS; no form replaces the helper message with an unrelated generic error.

- [ ] **Step 5: Commit the error diagnostics**

```powershell
git add lib/firebase/member-auth.ts lib/firebase/member-auth.test.ts lib/firebase/auth.ts lib/firebase/auth.test.ts components/auth/login-form.test.tsx components/auth/signup-form.test.tsx components/admin/admin-dashboard.test.tsx
git commit -m "fix: explain firebase authentication setup errors"
```

### Task 3: Add a reusable authenticated ID-token helper

**Files:**
- Create: `lib/firebase/id-token.ts`
- Create: `lib/firebase/id-token.test.ts`

**Interfaces:**
- Produces: `getCurrentFirebaseIdToken(forceRefresh?: boolean): Promise<string>`.
- Product-order and inquiry plans consume this function for `Authorization: Bearer <token>`.
- Throws: `MemberAuthenticationRequiredError` when `auth.currentUser` is absent.

- [ ] **Step 1: Write failing token tests with a mocked Firebase client**

```ts
it("returns the current user's ID token", async () => {
  getIdToken.mockResolvedValue("member-token");
  await expect(getCurrentFirebaseIdToken()).resolves.toBe("member-token");
  expect(getIdToken).toHaveBeenCalledWith(false);
});

it("rejects a signed-out request", async () => {
  currentUser = null;
  await expect(getCurrentFirebaseIdToken()).rejects.toBeInstanceOf(MemberAuthenticationRequiredError);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
pnpm test -- lib/firebase/id-token.test.ts
```

- [ ] **Step 3: Implement the helper against `auth.currentUser.getIdToken`**

```ts
export class MemberAuthenticationRequiredError extends Error {}

export async function getCurrentFirebaseIdToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new MemberAuthenticationRequiredError("Firebase sign-in is required.");
  return user.getIdToken(forceRefresh);
}
```

- [ ] **Step 4: Run focused tests and lint**

```powershell
pnpm test -- lib/firebase/id-token.test.ts
pnpm exec eslint lib/firebase/id-token.ts lib/firebase/id-token.test.ts
```

- [ ] **Step 5: Commit the token interface**

```powershell
git add lib/firebase/id-token.ts lib/firebase/id-token.test.ts
git commit -m "feat: expose authenticated firebase id tokens"
```

### Task 4: Add server token verification primitives

**Files:**
- Modify: `lib/firebase/admin.ts`
- Create: `lib/firebase/admin-auth.ts`
- Create: `lib/firebase/admin-auth.test.ts`

**Interfaces:**
- Produces: `getAdminAuth(): Auth`, `requiredFirebaseAdminEnv(name): string`, `verifyBearerMember(request): Promise<DecodedIdToken>`, and `verifyBearerAdmin(request): Promise<DecodedIdToken>`.
- Throws: `ServerAuthenticationError` with `status` 401 or 403.
- Inquiry and member-order APIs consume these functions.

- [ ] **Step 1: Write failing bearer-token and role tests**

```ts
await expect(verifyBearerMember(requestWithoutHeader, dependencies)).rejects.toMatchObject({ status: 401 });
await expect(verifyBearerAdmin(requestWithMemberToken, dependencies)).rejects.toMatchObject({ status: 403 });
await expect(verifyBearerAdmin(requestWithAdminToken, dependencies)).resolves.toMatchObject({ uid: "admin-1" });
```

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- lib/firebase/admin-auth.test.ts
```

- [ ] **Step 3: Implement Firebase Admin Auth and role lookup**

```ts
export const getAdminAuth = (): Auth => getAuth(getServerApp());

export async function verifyBearerAdmin(request: Request, dependencies = defaults) {
  const identity = await verifyBearerMember(request, dependencies);
  const admin = await dependencies.getAdminRecord(identity.uid);
  if (admin?.role !== "admin") throw new ServerAuthenticationError(403);
  return identity;
}
```

Export `getServerApp` from `admin.ts` without exporting credentials or resolved environment values.
Rename the existing private `required` helper to exported `requiredFirebaseAdminEnv`; callers receive a value but must never log it.

- [ ] **Step 4: Run tests and lint**

```powershell
pnpm test -- lib/firebase/admin-auth.test.ts
pnpm exec eslint lib/firebase/admin.ts lib/firebase/admin-auth.ts lib/firebase/admin-auth.test.ts
```

- [ ] **Step 5: Commit server authentication**

```powershell
git add lib/firebase/admin.ts lib/firebase/admin-auth.ts lib/firebase/admin-auth.test.ts
git commit -m "feat: verify member and admin api tokens"
```

### Task 5: Verify Vercel and Firebase deployment configuration

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: an exact operator checklist for Preview/Production configuration and administrator provisioning.
- Does not change or reveal secret values in the repository.

- [ ] **Step 1: Record the seven public variable names and server-only variable separation in README**

```markdown
#### Authentication deployment gate
1. Confirm the six required `NEXT_PUBLIC_FIREBASE_*` values in Preview and Production; Measurement ID is optional.
2. Redeploy after any public-variable change.
3. Enable Firebase Auth Email/Password.
4. Authorize the stable Preview alias and Production domain.
5. Create the Auth admin user and `admins/{uid}` with `role: admin`.
```

- [ ] **Step 2: Check environment scopes without printing values**

```powershell
vercel env ls preview
vercel env ls production
```

Expected: every required public key name appears in both scopes. If mutation is required, pause for action-time approval and use Vercel's environment UI or scoped CLI prompts; never echo values in the terminal.

- [ ] **Step 3: Trigger a fresh Preview build and inspect the fixed URL**

```powershell
git status --short
pnpm test -- lib/firebase/client-config.test.ts lib/firebase/member-auth.test.ts lib/firebase/auth.test.ts lib/firebase/id-token.test.ts lib/firebase/admin-auth.test.ts
pnpm build:vercel
```

Expected: clean status before deployment, focused tests PASS, build exits 0.

- [ ] **Step 4: Browser-verify the real flows**

Verify on the stable Preview alias:

```text
회원가입 → 마이페이지 → 로그아웃 → 회원 로그인
관리자 로그인 → 상품 관리 화면
일반 회원 계정 → 관리자 로그인 거부
```

Do not create or change real accounts without action-time confirmation. Record only pass/fail and error class, never credentials.

- [ ] **Step 5: Commit the operator documentation**

```powershell
git add README.md
git commit -m "docs: add firebase authentication deployment gate"
```

### Task 6: Run the authentication regression gate

**Files:**
- Verify only; modify files only if a failing test exposes a defect within this plan's scope.

**Interfaces:**
- Produces: a verified authentication foundation for the product-options and inquiries plans.

- [ ] **Step 1: Run all authentication and rules tests**

```powershell
pnpm test -- lib/firebase/client-config.test.ts lib/firebase/member-auth.test.ts lib/firebase/auth.test.ts lib/firebase/id-token.test.ts lib/firebase/admin-auth.test.ts components/auth components/admin/admin-dashboard.test.tsx firestore.rules.test.ts
```

- [ ] **Step 2: Run full static and production checks**

```powershell
pnpm lint
pnpm test
pnpm build:vercel
git status --short --branch
```

Expected: lint exits 0, all Vitest tests pass with zero failures, Production build exits 0, and the worktree has no uncommitted files.
