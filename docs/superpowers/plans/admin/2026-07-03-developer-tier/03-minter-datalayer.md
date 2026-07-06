# Phase 3 — Test Minter + Data Layer (Tasks 6–7)

---

### Task 6: Developer fixture in the test-only session minter

Implements spec §9. `app/api/test-auth/set-session/route.ts`: `FIXTURE_ALLOWLIST` (`:63`, shape `{ isAdmin: boolean }`), `auth.admin.createUser` (`:173`), `app_metadata` (`:177`, currently `isAdmin ? { role: "admin" } : {}`). Gates unchanged (`ENABLE_TEST_AUTH`, `TEST_AUTH_SECRET`, host allowlist, `FIXTURE_ALLOWLIST`).

**Files:**
- Modify: `app/api/test-auth/set-session/route.ts`
- Create: `tests/auth/set-session-developer-fixture.test.ts`

- [ ] **Step 1: Failing test** — assert (a) the allowlist entry shape accepts `isDeveloper`; (b) for a developer fixture the `app_metadata` passed to `createUser` is `{ role: "admin", developer: true }` (developer ⟹ admin at the test layer); (c) a non-developer admin fixture stays `{ role: "admin" }`. Mock `createUser` and capture its args.

```ts
test("developer fixture mints app_metadata { role:'admin', developer:true }", async () => {
  // arrange ENABLE_TEST_AUTH + bearer + host + a developer allowlist email
  // capture createUser call
  expect(captured.app_metadata).toEqual({ role: "admin", developer: true });
});
test("developer implies admin (never developer:true without role:admin)", () => {
  // static assertion over FIXTURE_ALLOWLIST + the app_metadata builder
});
```

- [ ] **Step 2: Fails** — `pnpm vitest run tests/auth/set-session-developer-fixture.test.ts` → FAIL.

- [ ] **Step 3: Implement**
  - Widen the type: `const FIXTURE_ALLOWLIST: Readonly<Record<string, { isAdmin: boolean; isDeveloper?: boolean }>>`.
  - Add a developer entry (a new fixture email, e.g. `fxav-developer@example.com`, `{ isAdmin: true, isDeveloper: true }`).
  - Change the `app_metadata` builder (`:177`) to:

```ts
app_metadata: allowEntry.isDeveloper
  ? { role: "admin", developer: true }
  : allowEntry.isAdmin
    ? { role: "admin" }
    : {},
```
  (Invariant: `isDeveloper` ⟹ `isAdmin` — enforce in the allowlist and/or with a static test so a `developer:true` token always also carries `role:"admin"`.)

- [ ] **Step 4: Green + Commit**

```bash
git add app/api/test-auth/set-session/route.ts tests/auth/set-session-developer-fixture.test.ts
git commit --no-verify -m "feat(auth): developer fixture in test-only session minter"
```

---

### Task 7: `adminEmails` data layer — `is_developer` field + `setAdminDeveloper` wrapper

Implements spec §7 (data layer). `lib/data/adminEmails.ts`: `AdminEmailRow` (`:43-50`), `listAdminEmails` `.select()` (`:75`), `addAdminEmail` (`:91`), `revokeAdminEmail` (`:128`), `AdminEmailsInfraError` (`:30`), `AdminEmailWriteOutcome` (`:53`), `translate*`/status sets (`:161-185`).

**Files:**
- Modify: `lib/data/adminEmails.ts`
- Create: `tests/data/setAdminDeveloper.test.ts`

**Interfaces:**
- Produces: `AdminEmailRow.is_developer: boolean`; `setAdminDeveloper(args: { rawEmail: string; isDeveloper: boolean }): Promise<SetDeveloperOutcome>` where `SetDeveloperOutcome = { kind: "ok"; email: string; isDeveloper: boolean } | { kind: "self_developer_demote_forbidden"; email: string } | { kind: "not_found"; email: string } | { kind: "invalid_email" } | { kind: "not_authorized" }`; throws `AdminEmailsInfraError` on transient infra fault; maps a PostgREST `42501` to `{ kind: "not_authorized" }` (NOT infra).

- [ ] **Step 1: Failing test** — `tests/data/setAdminDeveloper.test.ts`, mocking the Supabase client `.rpc("set_admin_developer_rpc", …)`:
  - `{ data: { status: "ok", email, is_developer: true } }` → `{ kind: "ok", email, isDeveloper: true }`;
  - `{ data: { status: "self_developer_demote_forbidden", email } }` → that kind;
  - `{ data: { status: "not_found", email } }` / `{ status: "invalid_email" }` → those kinds;
  - `{ error: { code: "42501" } }` → `{ kind: "not_authorized" }` (assert NOT a throw);
  - `{ error: { code: "57014" /* transient */ } }` → throws `AdminEmailsInfraError`.
  - Also: `listAdminEmails` selects `is_developer` (assert the `.select` column string includes `is_developer`).

- [ ] **Step 2: Fails** — FAIL.

- [ ] **Step 3: Implement**
  - `AdminEmailRow`: add `is_developer: boolean;`.
  - `listAdminEmails` `.select("email, added_by, added_at, revoked_by, revoked_at, note, is_developer")` (extend the existing column list at `:75`).
  - Add `setAdminDeveloper` mirroring `revokeAdminEmail`'s `{ data, error }` destructure + envelope translation; canonicalize `rawEmail` via `canonicalize`; distinguish the `42501` authorization error (→ `not_authorized`) from transient infra (→ throw `AdminEmailsInfraError`) using the returned error `code`.

- [ ] **Step 4: Green + Commit**

```bash
git add lib/data/adminEmails.ts tests/data/setAdminDeveloper.test.ts
git commit --no-verify -m "feat(admin): adminEmails.is_developer + setAdminDeveloper data wrapper"
```
