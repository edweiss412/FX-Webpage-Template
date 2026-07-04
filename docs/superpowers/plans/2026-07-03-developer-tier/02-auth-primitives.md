# Phase 2 — Auth Primitives (Tasks 3–5)

Clone `lib/auth/requireAdmin.ts` structure. Reference points: `AdminInfraError` (`:81`, `code="ADMIN_SESSION_LOOKUP_FAILED"`), `AdminIdentity` (`:88`), `resolveAdminIdentity = cache(...)` (`:154`), `getClaims()` (`:182`), `canonicalize` (`:208`), `Promise.all([rpc("is_session_live"), rpc("is_admin")])` (`:222`), error-first throws (`:242-259`), `sessionLive!==true`→`redirectToSignIn()` (`:264`), `isAdmin!==true`→`forbidden()` + `log.warn code:"ADMIN_ACCESS_DENIED"` (`:270-273`), `requireAdminIdentity` (`:279`), `requireAdmin` (`:294`), `maybeForceTestInfraFail` outside cache (`:289`), `RequireAdminOpts={layer}`.

---

### Task 3: `requireDeveloper` / `requireDeveloperIdentity` chokepoint

Implements spec §5.

**Files:**
- Create: `lib/auth/requireDeveloper.ts`
- Modify: `lib/auth/constants.ts` (add `DEVELOPER_SESSION_LOOKUP_FAILED` to the `AuthFailureCode` union at `:1-4`)
- Create: `tests/auth/requireDeveloper.test.ts`

**Interfaces:**
- Produces: `DeveloperInfraError` (`code="DEVELOPER_SESSION_LOOKUP_FAILED"`), `requireDeveloper(opts?: RequireDeveloperOpts): Promise<void>`, `requireDeveloperIdentity(opts?): Promise<DeveloperIdentity>` where `DeveloperIdentity = { email: string }`, `isCurrentUserDeveloper(): Promise<boolean>` (Task 4).

- [ ] **Step 1: Write the failing test** — `tests/auth/requireDeveloper.test.ts`. Mirror `tests/auth/requireAdmin.test.ts`'s mocking of `createSupabaseServerClient` / `getClaims` / `rpc`. Assert BOTH thrown AND returned infra paths (invariant 9 — the live `requireAdmin` wraps `getClaims()` and `Promise.all([rpc,rpc])` in try/catch; `requireAdmin.ts:181-193` thrown-getClaims, `:222-235` thrown-rpc):
  - `getClaims` **returns** `{ error }` (non-session-missing) → throws `DeveloperInfraError`;
  - `getClaims` **throws** → throws `DeveloperInfraError`;
  - `createSupabaseServerClient()` throws → throws `DeveloperInfraError`;
  - `rpc("is_developer")` **returns** `{ error }` → throws `DeveloperInfraError` (BEFORE any verdict);
  - `Promise.all([rpc,rpc])` **throws** → throws `DeveloperInfraError`;
  - `getClaims` returns an `AuthSessionMissingError` → `redirect` to `/auth/sign-in?next=...`;
  - `is_session_live!==true` → `redirect` to sign-in;
  - `is_developer!==true` (confirmed non-developer, session live) → calls `forbidden()`;
  - both true → returns `{ email }`.

```ts
// shape (fill mocks per tests/auth/requireAdmin.test.ts):
import { describe, expect, test, vi } from "vitest";
// mock @/lib/supabase/server, next/navigation (redirect/forbidden), next/headers
test("infra fault on is_developer rpc throws DeveloperInfraError", async () => {
  // getClaims ok with email; rpc is_session_live -> {data:true}; rpc is_developer -> {error:{message:'boom'}}
  const { requireDeveloperIdentity, DeveloperInfraError } = await import("@/lib/auth/requireDeveloper");
  await expect(requireDeveloperIdentity()).rejects.toBeInstanceOf(DeveloperInfraError);
});
test("confirmed non-developer calls forbidden()", async () => {
  // is_session_live true, is_developer false
  const forbidden = vi.fn(() => { throw new Error("FORBIDDEN"); });
  // ... assert forbidden called
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/auth/requireDeveloper.test.ts` → FAIL (module missing).

- [ ] **Step 3: Add the union member** — `lib/auth/constants.ts`, extend `AuthFailureCode`:

```ts
export type AuthFailureCode =
  | "GOOGLE_NO_CREW_MATCH"
  | "AMBIGUOUS_EMAIL_BINDING"
  | "ADMIN_SESSION_LOOKUP_FAILED"
  | "DEVELOPER_SESSION_LOOKUP_FAILED";
```

- [ ] **Step 4: Write `lib/auth/requireDeveloper.ts`** — clone `requireAdmin.ts`, swapping the RPC `is_admin`→`is_developer`, the error class, and the log code. Structure:

```ts
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canonicalize } from "@/lib/email/canonicalize";
import { hashForLog } from "@/lib/email/hashForLog";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
import { validateNextParam, DEFAULT_AUTH_NEXT_PATH } from "@/lib/auth/validateNextParam";
import { log } from "@/lib/log";

export class DeveloperInfraError extends Error {
  readonly code = "DEVELOPER_SESSION_LOOKUP_FAILED";
  constructor(message: string) { super(message); this.name = "DeveloperInfraError"; }
}
export type DeveloperIdentity = { email: string };
export type RequireDeveloperOpts = { layer?: "layout" | "page" };

// redirectToSignIn + maybeForceTestInfraFail: copy verbatim from requireAdmin.ts
// (:44-116), changing the thrown class to DeveloperInfraError in the force hook.

const resolveDeveloperIdentity = cache(async (): Promise<DeveloperIdentity> => {
  let supabase;
  try { supabase = await createSupabaseServerClient(); }
  catch (e) { throw new DeveloperInfraError(`client construction failed: ${String(e)}`); }

  // getClaims() can THROW (network/JWKS/decode) in addition to returning {error};
  // BOTH arms -> DeveloperInfraError except the AuthSessionMissing redirect.
  // Mirrors requireAdmin.ts:181-208.
  let claimsData; let claimsError;
  try { const r = await supabase.auth.getClaims(); claimsData = r.data; claimsError = r.error; }
  catch (e) { throw new DeveloperInfraError(`getClaims threw: ${String(e)}`); }
  if (claimsError) {
    if (isAuthSessionMissingError(claimsError)) return redirectToSignIn();
    throw new DeveloperInfraError(`getClaims failed: ${String(claimsError.message)}`);
  }
  const email = canonicalize(
    (claimsData as { claims?: { email?: string } } | null)?.claims?.email,
  );
  if (!email) return redirectToSignIn();

  // Promise.all the QUERY promises (they resolve, not reject) but ALSO wrap in
  // try/catch for a thrown transport fault -> DeveloperInfraError. Never
  // allSettled (invariant 9). Mirrors requireAdmin.ts:222-235.
  let sessionRpc; let devRpc;
  try {
    [sessionRpc, devRpc] = await Promise.all([
      supabase.rpc("is_session_live"),
      supabase.rpc("is_developer"),
    ]);
  } catch (e) { throw new DeveloperInfraError(`session/developer RPC threw: ${String(e)}`); }
  const { data: sessionLive, error: sessionError } = sessionRpc;
  const { data: isDev, error: devError } = devRpc;
  if (sessionError) throw new DeveloperInfraError(`is_session_live failed: ${String(sessionError.message)}`);
  if (devError) throw new DeveloperInfraError(`is_developer failed: ${String(devError.message)}`);
  if (sessionLive !== true) return redirectToSignIn();
  if (isDev !== true) {
    log.warn("developer access denied", { code: "DEVELOPER_ACCESS_DENIED", emailHash: hashForLog(email) });
    forbidden();
  }
  return { email };
});

export async function requireDeveloperIdentity(opts?: RequireDeveloperOpts): Promise<DeveloperIdentity> {
  const layer = opts?.layer ?? "page";
  // Header handling is INLINE (there is NO safeHeaders helper); copy the exact
  // pattern from requireAdminIdentity (requireAdmin.ts:279-291): the force hook
  // stays OUTSIDE the cached core so it fires per-layer.
  let reqHeaders: Awaited<ReturnType<typeof headers>> | null = null;
  try { reqHeaders = await headers(); } catch { reqHeaders = null; }
  maybeForceTestInfraFail(reqHeaders, layer);
  return resolveDeveloperIdentity();
}
export async function requireDeveloper(opts?: RequireDeveloperOpts): Promise<void> {
  const layer = opts?.layer ?? "page";
  let reqHeaders: Awaited<ReturnType<typeof headers>> | null = null;
  try { reqHeaders = await headers(); } catch { reqHeaders = null; }
  maybeForceTestInfraFail(reqHeaders, layer);
  await resolveDeveloperIdentity();
}
```
(`maybeForceTestInfraFail` is copied from `requireAdmin.ts:116` changing its thrown class to `DeveloperInfraError`; `redirectToSignIn` copied from `requireAdmin.ts:44-64`. `DEVELOPER_ACCESS_DENIED` is a log string only, NOT in `AuthFailureCode` — mirrors `ADMIN_ACCESS_DENIED`.)

- [ ] **Step 5: Green** — `pnpm vitest run tests/auth/requireDeveloper.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/auth/requireDeveloper.ts lib/auth/constants.ts tests/auth/requireDeveloper.test.ts
git commit --no-verify -m "feat(auth): requireDeveloper/requireDeveloperIdentity chokepoint"
```

---

### Task 4: `isCurrentUserDeveloper()` visibility helper (fail-to-false)

Implements spec §5.1.

**Files:**
- Modify: `lib/auth/requireDeveloper.ts` (add export)
- Create: `tests/auth/isCurrentUserDeveloper.test.ts`

- [ ] **Step 1: Failing test** — assert: `rpc("is_developer")` returns `{data:true}` → `true`; `{data:false}` → `false`; `{error:...}` or client-construction throw → `false` (fail-to-false, never throws).

```ts
test("infra fault -> false (fail to false, no throw)", async () => {
  // mock rpc is_developer -> { error: { message: 'boom' } }
  const { isCurrentUserDeveloper } = await import("@/lib/auth/requireDeveloper");
  await expect(isCurrentUserDeveloper()).resolves.toBe(false);
});
```

- [ ] **Step 2: Fails** — `pnpm vitest run tests/auth/isCurrentUserDeveloper.test.ts` → FAIL.

- [ ] **Step 3: Implement** — append to `lib/auth/requireDeveloper.ts`:

```ts
/**
 * VISIBILITY-ONLY developer probe. Fail-to-false: any infra fault or non-true
 * value returns false, so a blip hides dev tools (never reveals them to a
 * normal admin). Deliberately NOT error-first — the opposite posture from
 * requireDeveloper, correct for visibility (spec §3.4/§5.1).
 * not-subject-to-meta: visibility-only fail-to-false, not an access gate.
 */
export async function isCurrentUserDeveloper(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("is_developer");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Green** — PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/requireDeveloper.ts tests/auth/isCurrentUserDeveloper.test.ts
git commit --no-verify -m "feat(auth): isCurrentUserDeveloper visibility helper (fail-to-false)"
```

---

### Task 5: Register developer producers in `_metaInfraContract`

Implements spec §10.1. The registry `INFRA_PRODUCERS` (`tests/auth/_metaInfraContract.test.ts:69-76`) is a bare-string `as const` array with an `afterAll` set-equality vs producers actually covered by `assertEmits(producer, source, code)` calls (helper `:81-87`). Adding a producer REQUIRES both an array entry AND a matching behavioral block+`assertEmits`.

**Files:**
- Modify: `tests/auth/_metaInfraContract.test.ts`

- [ ] **Step 1: Add the producers + behavioral rows** — add `"requireDeveloper"` and `"requireDeveloperIdentity"` to `INFRA_PRODUCERS`, and add a describe block that drives each producer's infra arm and calls `assertEmits("requireDeveloper", <source>, <code>)` / same for identity. Pin: infra fault → throws `DeveloperInfraError` (not `forbidden`); confirmed non-developer → `forbidden()`; unauthed → redirect. Model the block on the existing `requireAdmin`/`requireAdminIdentity` blocks in the same file.

- [ ] **Step 2: Run** — `pnpm vitest run tests/auth/_metaInfraContract.test.ts` → PASS (set-equality holds; without the behavioral block the `afterAll` fails, proving coverage).

- [ ] **Step 3: Commit**

```bash
git add tests/auth/_metaInfraContract.test.ts
git commit --no-verify -m "test(auth): register requireDeveloper producers in _metaInfraContract"
```
