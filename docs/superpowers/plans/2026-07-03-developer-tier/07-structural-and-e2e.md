# Phase 7 — Structural Guards + E2E (Tasks 19–21)

---

### Task 19: Extend `auth-chain-audit` for developer routes/pages

Spec §10.2. `lib/audit/trustDomains.ts`: `ChainStep` union (`:12`), `PROTECTED_ROUTES` (`:26`, dev page row `:40` `chain:["requireAdmin"]`). `lib/audit/authPrimitives.ts`: `auditProjectAuthChains` (`:813-823`, skips `non-route`), recognizer (`~:135`), precedence `chain[0]==="requireAdmin"` (`~:622`). **Routes/pages only** — non-route server actions are Task 20.

**Files:** Modify `lib/audit/trustDomains.ts`, `lib/audit/authPrimitives.ts`, `tests/cross-cutting/auth-chain-audit.test.ts`.

- [ ] **Step 1: Failing test** — extend `auth-chain-audit.test.ts` to assert `auditProjectAuthChains()` returns zero findings when the dev page + `source-link-dim` + `observability-dim` pages + observability page + reap route declare `chain:["requireDeveloper"]` and their sources gate on `requireDeveloper*`. First it fails because `ChainStep` has no `requireDeveloper` and the recognizer rejects it.

- [ ] **Step 2: Fails → Step 3: implement**
  - `ChainStep`: add `"requireDeveloper"`.
  - `PROTECTED_ROUTES`: change the rows for `app/admin/dev/page.tsx`, `app/admin/dev/source-link-dim/page.tsx`, `app/admin/dev/observability-dim/page.tsx`, `app/admin/observability/page.tsx`, `app/api/admin/onboarding/reap-stale-sessions/route.ts` from `chain:["requireAdmin"]`/`["requireAdminIdentity"]` to `chain:["requireDeveloper"]`/`["requireDeveloperIdentity"]` as appropriate.
  - `authPrimitives.ts`: teach the validator recognizer (`~:135`) to accept `requireDeveloper`/`requireDeveloperIdentity`, and the precedence/first-line check (`~:622`) to treat them as valid first-line gates (mirror the `requireAdmin` handling).

- [ ] **Step 4: Green + Commit**

```bash
git add lib/audit/trustDomains.ts lib/audit/authPrimitives.ts tests/cross-cutting/auth-chain-audit.test.ts
git commit --no-verify -m "test(auth): auth-chain-audit recognizes requireDeveloper for dev routes/pages"
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

**Files:** Create `tests/e2e/developer-tier.spec.ts`.

- [ ] **Step 1: Write the e2e** — 
  - Sign in as the **normal-admin** fixture → on `/admin/settings`: assert NO Maintenance section, NO Diagnostics section, NO Developer-tools row, and (Administrators) NO developer toggle; nav has NO "Activity" item; direct-nav to `/admin/observability` → 403; direct-nav to `/admin/dev` → 404 (build-gated) or 403.
  - For a **table-backed developer** (seed an `admin_emails` row `is_developer=true` for the developer fixture email via `db query`, since mutation/visibility for the toggle needs the table arm; the JWT arm alone grants viewing): on `/admin/settings` → Maintenance + Diagnostics + Developer-tools row present (Developer-tools only if `DEV_PANEL_PRESENT`); Administrators shows the developer toggle; nav has "Activity"; `/admin/observability` renders.

- [ ] **Step 2: Run** — `pnpm exec playwright test tests/e2e/developer-tier.spec.ts` → PASS. (Ensure `ENABLE_TEST_AUTH`/`TEST_AUTH_SECRET`/local seed are set as the other e2e specs require.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/developer-tier.spec.ts
git commit --no-verify -m "test(e2e): normal-admin sees no dev surfaces; developer sees all four"
```
