# Phase 7 — Structural Guards + E2E (Tasks 19–21)

---

### Task 19: Verify + pin `auth-chain-audit` developer-route coverage

Spec §10.2. **The recognizer capability + all `PROTECTED_ROUTES` chain flips already landed in Phase 5** (Task 10 added `requireDeveloper` to `ChainStep`/`normalizeValidator`/`kindChecked`/`AUTH_LIB_ALLOWLIST` + flipped the 3 dev-route rows; Tasks 11/12 flipped the observability + reap rows — each atomic with its gate swap to keep `x3-trust-domain` green per commit). This task is the VERIFICATION + a durable regression pin, NOT a re-implementation. `auditProjectAuthChains` (`lib/audit/authPrimitives.ts:813-823`) skips `non-route`, so this covers routes/pages only — non-route server actions (dev `actions.ts`, `developerActions.ts`, `validationReset.ts`) are Task 20's `developerGatingContract`.

**Files:** Modify `tests/cross-cutting/auth-chain-audit.test.ts` (add the regression assertion). No `lib/audit/**` edits expected here — if any are needed, a Phase-5 commit left x3 red and that is a Phase-5 regression to fix there.

- [ ] **Step 1: Confirm green baseline** — run `pnpm test:audit:x3-trust-domain` → GREEN (Phase 5 already made `auditProjectAuthChains()` return `[]` with the 5 developer routes gating on `requireDeveloper*` and their `PROTECTED_ROUTES` chains = `["requireDeveloper"]`). If it is RED, STOP — a Phase-5 commit regressed x3; fix the offending Phase-5 surface, do not patch it here.

- [ ] **Step 2: Add a focused regression assertion** — in `auth-chain-audit.test.ts`, add a test that pins the developer surfaces explicitly: assert `PROTECTED_ROUTES` contains each of `app/admin/dev/page.tsx`, `app/admin/dev/source-link-dim/page.tsx`, `app/admin/dev/observability-dim/page.tsx`, `app/admin/observability/page.tsx`, `app/api/admin/onboarding/reap-stale-sessions/route.ts` with a `chain` whose first step is `"requireDeveloper"` (so a future accidental revert to `requireAdmin`, or a dropped row, fails here with a developer-specific message — not just the generic `auditProjectAuthChains()` toEqual([])). This is the durable pin that survives even if someone edits the recognizer.

- [ ] **Step 3: Green + Commit** — `pnpm test:audit:x3-trust-domain` GREEN.

```bash
git add tests/cross-cutting/auth-chain-audit.test.ts
git commit --no-verify -m "test(auth): pin auth-chain-audit developer-route coverage (regression guard)"
```

---

### Task 20: `developerGatingContract` structural meta-test

Spec §6.1 structural defense (4 enforcements). Self-contained (does NOT rely on `auth-chain-audit`'s route classification). Templates: `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts` (ts-morph exhaustiveness), `tests/auth/_metaInfraContract.test.ts` (registry + set-equality).

**Files:** Create `tests/auth/developerGatingContract.test.ts`.

- [ ] **Step 1: Write the test** — a `DEVELOPER_GATED_SURFACES` registry (one row per §6 surface: `{ id, file, consumerKind, gate, declaredPosture }`), then four enforcements:

  1. **Server-action gate coverage (AST).** For each registered developer-gated server-action file — `app/admin/dev/actions.ts`, `app/admin/settings/_actions/validationReset.ts`, `app/admin/settings/admins/developerActions.ts` — use `ts-morph` to find every exported `async` function that is a server action (file-level or function-level `"use server"`). Assert each is gated by `requireDeveloper`/`requireDeveloperIdentity`, per posture:
     - `boundary-500` actions → `await requireDeveloper*()` is the **first statement of the function body, outside any `try`**;
     - `inline-typed-exception` actions (the two validationReset) → `await requireDeveloper()` is the **first statement inside the top-level `try`**, with no statement (and specifically no `destructiveResetAllowed`/Supabase-client call) before it.
     - **Set-equality:** the discovered exported server actions == the registry's action rows for that file.
  2. **Admin-gate assertion:** `app/admin/settings/admins/actions.ts` exports `addAdminAction` + `revokeAdminAction`, both gated by `requireAdminIdentity` (NOT developer-gated, NOT ungated).
  3. **Route/page coverage:** `PROTECTED_ROUTES` contains the dev page + 2 harnesses + observability page + reap route with `chain` starting `requireDeveloper*`.
  4. **Mutation-RPC SQL guard:** read `supabase/migrations/20260703230100_admin_emails_developer_tier.sql`; assert the `set_admin_developer_rpc` body (a) contains a table-backed `exists ( select 1 from public.admin_emails … and ae.is_developer )` actor check (≥2 occurrences — fast-reject + post-lock), and (b) does NOT contain `public.is_developer()` anywhere within the `set_admin_developer_rpc` function body.

- [ ] **Step 2: Run** — `pnpm vitest run tests/auth/developerGatingContract.test.ts` → PASS (all prior tasks make it green; if any surface regresses, it fails).

- [ ] **Step 3: Commit**

```bash
git add tests/auth/developerGatingContract.test.ts
git commit --no-verify -m "test(auth): developerGatingContract — AST gate coverage + posture + RPC SQL guard"
```

---

### Task 21: Playwright e2e — normal-admin vs developer surfaces

Spec §10.7 e2e. Uses the test-only session minter (Task 6): a normal-admin fixture (`{ isAdmin: true }`) and a developer fixture (`{ isAdmin: true, isDeveloper: true }`). Reuse the picker/e2e env pattern (env copy minus `TEST_DATABASE_URL` + local `db:seed`).

**Files:** Modify `app/api/test-auth/set-session/route.ts` (add the normal-admin fixture — see Step 0); Create `tests/e2e/developer-tier.spec.ts`.

- [ ] **Step 0: Add a normal-admin minter fixture (prerequisite; plan-gap fix).** The e2e needs an admin-but-NOT-developer persona, and none is mintable: `edweiss412@gmail.com` is bootstrapped `is_developer=true` by the migration, `fxav-developer@example.com` carries the developer JWT bit, and the real normal admin `dlarson@fxav.net` is not in `FIXTURE_ALLOWLIST`. Add `"fxav-admin@example.com": { isAdmin: true }` (no `isDeveloper`) to `FIXTURE_ALLOWLIST` in `app/api/test-auth/set-session/route.ts` (the allowlist type was already widened to `{ isAdmin; isDeveloper? }` in Task 6), and add a `fxav-admin@example.com` fixture const mirroring the developer one. This is the symmetric companion to Task 6's developer fixture. Re-run the minter's own tests (`tests/auth/set-session-developer-fixture.test.ts` + any FIXTURE_ALLOWLIST exhaustiveness test) → still green. Commit separately: `feat(auth): normal-admin fixture in test-only session minter`. (JWT role=admin with no developer claim ⇒ `is_admin()` true so the admin layout admits it, but `isCurrentUserDeveloper()` false ⇒ sees none of the four dev surfaces — exactly the normal-admin persona.)

- [ ] **Step 1: Write the e2e** —
  - Sign in as the **normal-admin** fixture → on `/admin/settings`: assert NO Maintenance section, NO Diagnostics section, NO Developer-tools row, and (Administrators) NO developer toggle; nav has NO "Activity" item; direct-nav to `/admin/observability` → 403; direct-nav to `/admin/dev` → 404 (build-gated) or 403.
  - For a **table-backed developer** (seed an `admin_emails` row `is_developer=true` for the developer fixture email via `db query`, since mutation/visibility for the toggle needs the table arm; the JWT arm alone grants viewing): on `/admin/settings` → Maintenance + Diagnostics + Developer-tools row present (Developer-tools only if `DEV_PANEL_PRESENT`); Administrators shows the developer toggle; nav has "Activity"; `/admin/observability` renders.

- [ ] **Step 2: Run** — `pnpm exec playwright test tests/e2e/developer-tier.spec.ts` → PASS. (Ensure `ENABLE_TEST_AUTH`/`TEST_AUTH_SECRET`/local seed are set as the other e2e specs require.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/developer-tier.spec.ts
git commit --no-verify -m "test(e2e): normal-admin sees no dev surfaces; developer sees all four"
```
