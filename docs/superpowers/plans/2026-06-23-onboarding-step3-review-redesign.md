# Onboarding Step 3 "Review & Publish" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild onboarding wizard step 3 as inline parse-preview cards with a per-sheet **publish checkbox** (checked → Live, unchecked → **Held**, Ignore → no show), plus dedicated **Unpublished** and **Ignored-sheets** admin views, with honest Approve/Publish copy.

**Architecture:** The checkbox is durable publish-intent. Finalize creates a show for **every clean row** (born `published=false`) and the CAS step flips only `publish_intent=true` rows to Live; unchecked-clean first-seen rows stay **Held** (an existing first-class state with an existing one-tap Publish). "Ignore" writes a durable **live-partition** `deferred_ingestions` row (reversible via a new un-ignore route + Ignored-sheets view). The finish gate is narrowed (UI + server, identical predicate) so unchecked rows never block, only genuine error/conflict rows do.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Supabase/Postgres (SECURITY DEFINER RPCs, advisory locks, postgres.js in finalize routes), Tailwind v4, Jest + Playwright. Spec: `docs/superpowers/specs/2026-06-23-onboarding-step3-review-redesign.md`.

## Global Constraints

- **TDD per task.** Failing test → minimal impl → passing test → commit. Never impl before test.
- **Per-show advisory lock, single holder.** New/changed mutating routes acquire `withPostgresSyncPipelineLock(driveFileId)` at exactly one layer; finalize/CAS changes ride the existing holder. No nested holders. (AGENTS.md invariant 2.)
- **Email canonicalization** via `lib/email/canonicalize.ts` at every boundary that writes an email.
- **No raw error codes in UI.** All codes surface through `lib/messages/lookup.ts` / `ErrorExplainer`.
- **Commit per task**, conventional commits: `feat(onboarding|admin|db|sync|crew-page):`, `test(...)`, `docs(...)`.
- **Supabase call-boundary discipline.** Every Supabase call destructures `{ data, error }`; thrown vs returned errors distinguished; infra faults → typed `{ kind: 'infra_error' }`; new helpers registered in `tests/admin/_metaInfraContract.test.ts`.
- **PostgREST DML lockdown.** `deferred_ingestions` / `onboarding_scan_manifest` / `shows` mutations flow through server routes / RPCs only. `deferred_ingestions` is already in `tests/db/postgrest-dml-lockdown.test.ts:214`.
- **Migration→validation parity.** Each new/altered migration: apply locally → `pnpm gen:schema-manifest` (commit manifest) → apply surgically to validation `vzakgrxqwcalbmagufjh` via `supabase db query --linked` / `psql "$TEST_DATABASE_URL" -f`. The `validation-schema-parity` gate (`tests/db/validation-schema-parity.test.ts`) enforces it.
- **UI quality gate (invariant 8).** Every UI surface passes `/impeccable critique` AND `/impeccable audit` (HIGH/CRITICAL fixed or DEFERRED), externally attested, before close.
- **Spec canonical.** §12.4 catalog-prose edits land as the 3-part lockstep in one commit; real gate `tests/cross-cutting/codes.test.ts` (`pnpm test:audit:x1-catalog-parity`).
- **`finishable` blocking set (single source of truth):** `{ hard_failed, live_row_conflict, discard_retryable }`. UI predicate + both server gates use this identical 3-element set (drop only `staged`).

---

## Meta-test inventory (CREATE / EXTEND)

- **EXTEND** `tests/admin/_metaInfraContract.test.ts` — new admin Supabase call sites: Unpublished-view loader (Task E1), Ignored-sheets loader (Task E2), the changed `fetchStep3Data` if its boundary shape changes (Task D1).
- **EXTEND** `tests/db/postgrest-dml-lockdown.test.ts` — confirm `onboarding_scan_manifest` is registry-covered for the new `publish_intent` write path; `deferred_ingestions` already covered (`:214`) — assert the un-ignore route uses the server path.
- **CREATE** `tests/onboarding/heldShowCleanupSafety.test.ts` — structural test pinning §7.5: a Held show from a **completed** finalize session survives `cleanupAbandonedFinalize` + `reapStaleSessions` (AC5). Confirms existing safety; guards against regression.
- **EXTEND** `tests/auth/advisoryLockRpcDeadlock.test.ts` — add the un-ignore route's lock surface (single holder) if it introduces a new hashkey holder.
- Layout-dimensions (real browser) + transition-audit tests for the Step-3 cards (Tasks D2/D3).

## Advisory-lock holder topology (plan touches `pg_advisory*`)

| Hashkey | Existing holders | New code's holder |
|---|---|---|
| `show:<driveFileId>` | JS wrappers `withPostgresSyncPipelineLock` (live discard/apply routes); in-RPC `publish_show`/`archive_show`; finalize/CAS per-row `pg_advisory_xact_lock` | **Un-ignore route (Task C2):** JS-side `withPostgresSyncPipelineLock(driveFileId)` — single holder, mirrors live discard route. **Changed ignore route (C1):** same wrapper, unchanged topology. Finalize/CAS changes (B2/B3): ride the existing per-row holder, no new lock. |

No new hashkey is introduced; no nested holders. `tests/auth/advisoryLockRpcDeadlock.test.ts` extended to pin the un-ignore surface.

## CHECK/enum + migration→validation-parity matrix

| Object | Change | CHECK? | Parity steps |
|---|---|---|---|
| `onboarding_scan_manifest.publish_intent` | `ADD COLUMN IF NOT EXISTS publish_intent boolean not null default false` | none (plain boolean — **no** `status` enum change; we deliberately avoid a new status value) | apply local → `pnpm gen:schema-manifest` → apply to validation surgically |
| `deferred_ingestions.drive_file_name` | `ADD COLUMN IF NOT EXISTS drive_file_name text` (nullable) | none | same |

Both migrations are `ADD COLUMN IF NOT EXISTS` → apply-twice idempotent. No inline `tables/` CHECK touched. `status` enum is unchanged.

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `supabase/migrations/2026XXXX0001_onboarding_publish_intent.sql` | Create | `onboarding_scan_manifest.publish_intent` column |
| `supabase/migrations/2026XXXX0002_deferred_drive_file_name.sql` | Create | `deferred_ingestions.drive_file_name` column |
| `app/api/admin/onboarding/finalize/route.ts` | Modify | widen selector, 4-branch processing, stamp `publish_intent`, narrow gate count |
| `app/api/admin/onboarding/finalize-cas/route.ts` | Modify | narrow flip `AND publish_intent=true`, narrow gate count |
| `app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts` + `retry/route.ts` | Modify | onboarding ignore → live partition + drive_file_name + admin email |
| `app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts` | Create | un-ignore (delete live deferral) |
| `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts` | Create | uncheck (un-approve) action |
| `components/admin/OnboardingWizard.tsx` | Modify | thread full `parse_result`, `finishable` predicate, FinalizeButton wiring |
| `components/admin/wizard/Step3Review.tsx` | Modify | inline cards, checkbox, select-all, needs-attention group, remove staged link |
| `components/admin/wizard/Step3SheetCard.tsx` | Create | summary + breakdown + checkbox (one card) |
| `components/admin/FinalizeButton.tsx` | Modify | "Publish N shows & finish setup" + soft confirm |
| `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx` | Modify | conditional failure heading |
| `app/admin/unpublished/page.tsx` | Create | Held-shows view |
| `app/admin/ignored-sheets/page.tsx` | Create | Ignored-sheets view + un-ignore |
| `components/admin/StagedReviewCard.tsx` | Modify | Approve/Publish label gated on wizard mode |
| Tests under `tests/onboarding/`, `tests/admin/`, `tests/api/`, `tests/db/`, `tests/components/`, Playwright | Create/Modify | per task |

---

## Phase A — Schema

### Task A1: `onboarding_scan_manifest.publish_intent` column

**Files:**
- Create: `supabase/migrations/2026XXXX0001_onboarding_publish_intent.sql`
- Test: `tests/db/onboarding-publish-intent-column.test.ts`

**Interfaces:**
- Produces: column `onboarding_scan_manifest.publish_intent boolean not null default false`, read by the CAS flip (B3), written by finalize batch (B2).

- [ ] **Step 1: Failing test** — assert the column exists with the right type/default against `TEST_DATABASE_URL`.

```ts
// tests/db/onboarding-publish-intent-column.test.ts
import postgres from "postgres";
const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, prepare: false });
afterAll(() => sql.end());
test("onboarding_scan_manifest.publish_intent exists, boolean, default false, not null", async () => {
  const rows = await sql`
    select data_type, column_default, is_nullable
      from information_schema.columns
     where table_schema='public' and table_name='onboarding_scan_manifest' and column_name='publish_intent'`;
  expect(rows[0]).toBeDefined();
  expect(rows[0].data_type).toBe("boolean");
  expect(rows[0].is_nullable).toBe("NO");
  expect(String(rows[0].column_default)).toMatch(/false/);
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm jest tests/db/onboarding-publish-intent-column.test.ts`) — column missing.
- [ ] **Step 3: Write migration**

```sql
-- supabase/migrations/2026XXXX0001_onboarding_publish_intent.sql
alter table public.onboarding_scan_manifest
  add column if not exists publish_intent boolean not null default false;
comment on column public.onboarding_scan_manifest.publish_intent is
  'Onboarding checkbox: true=publish (CAS flip → Live), false=leave Held. Set at finalize from pending_syncs.wizard_approved.';
```

- [ ] **Step 4: Apply locally** — `psql "$TEST_DATABASE_URL" -f supabase/migrations/2026XXXX0001_onboarding_publish_intent.sql` then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`. Run test → PASS.
- [ ] **Step 5: Manifest + validation parity** — `pnpm gen:schema-manifest`; apply the same SQL to validation (`supabase db query --linked "<sql>"` against `vzakgrxqwcalbmagufjh`). Confirm `pnpm jest tests/db/validation-schema-parity.test.ts` green.
- [ ] **Step 6: Commit** — `git add supabase/migrations/2026XXXX0001_onboarding_publish_intent.sql supabase/**/schema-manifest.json tests/db/onboarding-publish-intent-column.test.ts && git commit -m "feat(db): onboarding_scan_manifest.publish_intent for Held vs Live"`

### Task A2: `deferred_ingestions.drive_file_name` column

**Files:** Create `supabase/migrations/2026XXXX0002_deferred_drive_file_name.sql`; Test `tests/db/deferred-drive-file-name-column.test.ts`.
**Interfaces:** Produces nullable `deferred_ingestions.drive_file_name text`, written at ignore time (C1), read by the Ignored-sheets view (E2).

- [ ] **Step 1: Failing test** — mirror A1's column-introspection test for `deferred_ingestions.drive_file_name` (type `text`, `is_nullable='YES'`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Migration**

```sql
-- supabase/migrations/2026XXXX0002_deferred_drive_file_name.sql
alter table public.deferred_ingestions
  add column if not exists drive_file_name text;
comment on column public.deferred_ingestions.drive_file_name is
  'Human sheet name captured at ignore time (first-seen ignored sheets have no shows row to join for a name).';
```

- [ ] **Step 4: Apply locally + reload + test → PASS.**
- [ ] **Step 5: Manifest + validation parity** (as A1).
- [ ] **Step 6: Commit** — `feat(db): deferred_ingestions.drive_file_name for Ignored-sheets view`

---

## Phase B — Server: finalize Held creation + gate

> **⚠️ SEQUENCING (CRITICAL — codex plan R1 HIGH): execute B2 BEFORE B1.** Tasks are listed below as B1 (gate) then B2 (Held creation), but they **MUST land in the order B2 → B1**. If B1 (drop `staged` from the gate) lands first, a finalize whose only remaining rows are unchecked-clean would have `approvedRows.length===0` **and** `unresolved===0`, so it falls through to completion (`final_cas_done`) and **purges those rows without ever creating their Held shows — the sheets silently vanish (data loss).** B2 widens the selector so unchecked-clean rows are *processed into Held shows* first; only then is it safe to stop counting `staged` as blocking. The subagent-driven executor MUST run B2's commit before B1's. (B2-before-B1 is safe: the gate's 409 fires only when `approvedRows.length===0`, and after B2 those rows are in the processed set.)

### Task B1: Narrow the server finish gate (drop `staged`) — **run AFTER Task B2**

**Files:** Modify `app/api/admin/onboarding/finalize/route.ts:284-298` (`unresolvedManifestCount`) and the `finalize-cas` peer; Test `tests/api/onboarding-finalize-gate.test.ts`.
**Interfaces:**
- **Consumes: Task B2 must already be landed** (the widened selector creates Held shows for unchecked-clean rows). Relaxing this gate before B2 silently purges unchecked-clean rows — see Phase B sequencing note.
- Produces: finalize 409s `ONBOARDING_NOT_RESOLVED` iff a row in `{hard_failed, live_row_conflict, discard_retryable}` remains; a clean `staged` row no longer blocks.

- [ ] **Step 1: Failing test** — with a manifest containing one clean `staged` row (no blocking rows) + approved rows, `handleOnboardingFinalize` must NOT 409; with one `hard_failed` row it MUST 409 `ONBOARDING_NOT_RESOLVED`. (Use the route's injected deps `withTx`/`withRowTx` per its existing test harness; assert response status + code.)
- [ ] **Step 2: Run → FAIL** (today `staged` blocks).
- [ ] **Step 3: Edit the SQL** — change `and status in ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict')` → `and status in ('hard_failed', 'live_row_conflict', 'discard_retryable')` in `unresolvedManifestCount` (`finalize/route.ts:293`) and the identical `finalize-cas` count. Add a one-line comment citing the spec `finishable` set.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): finish gate drops 'staged' — unchecked-clean no longer blocks`

### Task B2: Finalize creates a show for every clean row + stamps `publish_intent` (4 branches)

**Files:** Modify `app/api/admin/onboarding/finalize/route.ts` (`selectApprovedRows:300-318` → widen; `processApprovedRow` → 4-branch; manifest stamp); Test `tests/api/onboarding-finalize-held-creation.test.ts`.
**Interfaces:**
- Consumes: A1's `publish_intent` column.
- Produces: after a finalize batch, each clean first-seen row has a `shows` row (`published=false`) + manifest `status='applied', created_show_id, publish_intent=<wizard_approved>`; each existing-show checked row stages a shadow; each existing-show **unchecked** row is a **no-op** (no shadow, no `shows` write) with its `pending_syncs` row consumed + manifest resolved.

- [ ] **Step 1: Failing tests** (in one file, four cases):
  - first-seen + `wizard_approved=true` → `shows` row created `published=false`, manifest `publish_intent=true`, pending row deleted.
  - first-seen + `wizard_approved=false` → `shows` row created `published=false`, manifest `publish_intent=false`, pending row deleted.
  - existing-show + checked → `shows_pending_changes` shadow inserted (existing behavior), no `published` change.
  - existing-show + **unchecked** → **no** shadow inserted, **no** `shows` mutation, `pending_syncs` row deleted, manifest resolved (non-blocking). (Assert against the injected tx.)
  - **Data-loss guard (the sequencing-hazard regression test):** a finalize batch with **zero** `wizard_approved=true` rows but **N unchecked-clean** first-seen rows must process **all N** (create N Held shows, `published=false`) and consume their pending rows — **none** left unprocessed/purged-without-a-show. This is the test that proves the widened selector picks up unchecked rows, so it is safe to later relax the gate (B1).
- [ ] **Step 2: Run → FAIL** (today only `wizard_approved=true` rows are selected/processed).
- [ ] **Step 3: Implement**
  - Widen the batch selector: rename/adjust `selectApprovedRows` → `selectFinishableCleanRows` selecting rows where `wizard_session_id=$1` and the manifest status is **not** in the blocking set (i.e. clean `staged` OR `applied`), regardless of `wizard_approved`, ordered by `drive_file_id`, `limit $2`. Carry `wizard_approved` into the row shape.
  - In `processApprovedRow`, branch on `(showExists, row.wizard_approved)`:
    - `!showExists` (first-seen): run the existing first-seen apply core (`:683-704`) with `firstSeenPublished:false`; after `recordCreatedShowProvenance`, `update onboarding_scan_manifest set publish_intent = $approved` for the row; `deleteApprovedPending`.
    - `showExists && wizard_approved` → existing `stageExistingShowShadow` + `deleteApprovedPending` (unchanged).
    - `showExists && !wizard_approved` (**D10 no-op**): do **not** call `stageExistingShowShadow`; `update onboarding_scan_manifest set status='applied', created_show_id=null, publish_intent=false` (resolved, non-blocking, flip-excluded since `created_show_id IS NULL`); `deleteApprovedPending` for the row. Add a comment citing spec §7.4 D10.
  - The first-seen INSERT must also persist `publish_intent` — simplest is the manifest UPDATE above (the flip reads the manifest, B3), so no `shows` column.
- [ ] **Step 4: Run → PASS** (all four cases).
- [ ] **Step 5: Commit** — `feat(onboarding): finalize creates Held shows for unchecked clean rows; existing-show-unchecked no-op (D10)`

### Task B3: Narrow the CAS publish-flip to `publish_intent = true`

**Files:** Modify `app/api/admin/onboarding/finalize-cas/route.ts:446-481` (`publishAppliedWizardShows`); Test `tests/api/onboarding-finalize-cas-flip.test.ts`.
**Interfaces:** Consumes A1's `publish_intent`, B2's stamped manifest. Produces: after CAS, only `publish_intent=true` first-seen shows are `published=true`; `publish_intent=false` shows stay `published=false` (Held).

- [ ] **Step 1: Failing test** — seed a session with two created first-seen shows (one `publish_intent=true`, one `false`), run the CAS publish step; assert the `true` one is `published=true` and the `false` one stays `published=false`.
- [ ] **Step 2: Run → FAIL** (today both flip).
- [ ] **Step 3: Implement** — add `and publish_intent = true` to BOTH the manifest SELECT (`:450-459`) and the UPDATE join (`:466-480` — `and m.publish_intent = true`). Comment cites spec §7.4.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): CAS flip publishes only publish_intent=true shows`

### Task B4: Cleanup-safety structural test (confirms, no impl change)

**Files:** Create `tests/onboarding/heldShowCleanupSafety.test.ts`.
**Interfaces:** Pins §7.5 — a Held show from a completed session survives cleanup.

- [ ] **Step 1: Test** — seed a completed (`final_cas_done`) session that created a Held show (`published=false`, `wizard_created_session_id` set, `created_show_id` in manifest), with `app_settings.pending_wizard_session_id = null` (post-finalize). Run `cleanupAbandonedFinalize(sessionId)` (expect `already_cleaned`/no-op — session not pending) AND `reapStaleSessions` (terminal → no show delete). Assert the Held `shows` row still exists.
- [ ] **Step 2: Run → PASS immediately** (existing code is already safe — this is a regression pin). If it FAILS, that's a real §7.5 violation → stop and reconcile with spec.
- [ ] **Step 3: Commit** — `test(onboarding): pin Held-show survives cleanup after completed finalize (§7.5)`

---

## Phase C — Server: Ignore (live) + un-ignore + un-approve

### Task C1: Onboarding "Ignore" writes the LIVE partition

**Files:** Modify `app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts` + `retry/route.ts` (`handleAction`/`upsertWizardDeferral`); Test `tests/api/onboarding-ignore-live-partition.test.ts`.
**Interfaces:** Produces: an onboarding `permanent_ignore` writes `deferred_ingestions(wizard_session_id=NULL, deferred_kind='permanent_ignore', deferred_by_email=canonicalize(admin), drive_file_name=<name>, deferred_at_modified_time=NULL)` and removes the manifest/pending row from the wizard list.

- [ ] **Step 1: Failing test** — POST the onboarding `permanent_ignore` route; assert the written `deferred_ingestions` row has `wizard_session_id IS NULL` and a non-null `deferred_by_email` + `drive_file_name`; assert the row survives a simulated `purgeWizardRows`. (Today it's wizard-scoped → fails: row purged / `wizard_session_id` non-null.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — for the onboarding ignore path, write the live-partition deferral (mirror `app/api/admin/pending-ingestions/[id]/discard/route.ts:32-69` `upsertLiveDeferral`): `on conflict (drive_file_id) where wizard_session_id is null`, `wizard_session_id=null`, `deferred_by_email=canonicalize(adminEmail)`, `drive_file_name=<from pending_ingestions.drive_file_name or manifest name>`. Plumb the admin email (from `requireAdminIdentity`) into `handleAction`. Keep removing the manifest/pending row so it leaves the list. Run under `withPostgresSyncPipelineLock(driveFileId)` (single holder).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): Ignore writes durable live-partition deferral (survives finalize)`

### Task C2: New un-ignore route

**Files:** Create `app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts`; Test `tests/api/unignore-route.test.ts`; Extend `tests/db/postgrest-dml-lockdown.test.ts` + `tests/auth/advisoryLockRpcDeadlock.test.ts`.
**Interfaces:** Produces: `POST` deletes the live `permanent_ignore` deferral for `driveFileId`; idempotent; admin-gated; single advisory-lock holder.

- [ ] **Step 1: Failing test** — POST un-ignore for a drive file with a live ignore row → 200 + row deleted; POST again → 200 (idempotent no-op); non-admin → 403.
- [ ] **Step 2: Run → FAIL** (route missing).
- [ ] **Step 3: Implement** — `requireAdmin`; under `withPostgresSyncPipelineLock(driveFileId)`, `delete from public.deferred_ingestions where drive_file_id=$1 and wizard_session_id is null` (the `deleteLiveDeferral` primitive). Return typed JSON; never a bare 500 (wrap). Destructure `{ data, error }` at the boundary.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Lockdown + topology** — confirm `tests/db/postgrest-dml-lockdown.test.ts` still green (deferred_ingestions already registered :214); add the un-ignore lock surface to `tests/auth/advisoryLockRpcDeadlock.test.ts` (single JS-side holder). Run both → PASS.
- [ ] **Step 6: Commit** — `feat(admin): un-ignore route (delete live deferral under advisory lock)`

### Task C3: Un-approve (uncheck) action

**Files:** Create `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts`; Test `tests/api/wizard-unapprove-route.test.ts`.
**Interfaces:** Produces: `POST` reverts `pending_syncs.wizard_approved=false` + manifest back to clean `staged` for the row (the inverse of the wizard apply approve).

- [ ] **Step 1: Failing test** — given an `applied`/`wizard_approved=true` wizard row, POST un-approve → `wizard_approved=false`, manifest `staged`; superseded session → 409 `WIZARD_SESSION_SUPERSEDED` (reuse the existing rollback pattern).
- [ ] **Step 2: Run → FAIL** (route missing).
- [ ] **Step 3: Implement** — admin-gated; under the per-show lock + active-session CAS (mirror the apply route's guards); `update pending_syncs set wizard_approved=false, wizard_approved_by_email=null, wizard_approved_at=null, wizard_reviewer_choices=null, wizard_reviewer_choices_version=null where wizard_session_id=$wsid and drive_file_id=$dfid`; `update onboarding_scan_manifest set status='staged', transitioned_at=now() where ...`. Typed JSON; no bare 500.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): un-approve (uncheck) reverts wizard row to staged`

---

## Phase D — UI: Step 3 inline cards (Opus + impeccable)

### Task D1: `fetchStep3Data` — thread `parse_result` + `finishable`

**Files:** Modify `components/admin/OnboardingWizard.tsx:113-244`; Test `tests/components/onboardingWizard.fetchStep3.test.ts`.
**Interfaces:** Produces: `Step3FetchResult` gains `finishable: boolean` (replaces/augments `allResolved`); each `Step3Row` gains `parseResult: ParseResult | null` (guarded). `FinalizeButton disabled={!result.finishable}`.

- [ ] **Step 1: Failing tests** — (a) `finishable` is `false` iff a row's status ∈ `{hard_failed, live_row_conflict, discard_retryable}`; a clean `staged` row alone → `finishable=true`. (b) a `staged` row carries `parseResult` (full object) not just title. (Mock the supabase client per the existing `_metaInfraContract` harness.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — stop discarding `parse_result` (line 199): coerce to `ParseResult | null` (guarded) and attach to `Step3Row`. Compute `finishable = rows.length===0 || rows.every(r => !BLOCKING.has(r.status))` where `BLOCKING = new Set(['hard_failed','live_row_conflict','discard_retryable'])`. Return `{ kind:'ok', rows, finishable }`. Update the `Step3Container` to pass `disabled={!result.finishable}` and pass rows (with parseResult) to `Step3Review`. Keep `infra_error` branch + register the (unchanged-shape) boundary in `tests/admin/_metaInfraContract.test.ts`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): thread parse_result + finishable predicate into step-3 loader`

### Task D2: Step-3 sheet card — summary + breakdown (+ layout-dimensions)

**Files:** Create `components/admin/wizard/Step3SheetCard.tsx`; Modify `Step3Review.tsx` (render cards); Tests `tests/components/step3SheetCard.test.tsx` + Playwright `tests/e2e/step3-card-dimensions.spec.ts`.
**Interfaces:** Consumes `Step3Row.parseResult`. Produces a card with `data-testid="wizard-step3-card-<dfid>"`, `…-summary`, `…-breakdown`, `…-warnings`; an expand toggle.

- [ ] **Step 1: Failing unit tests** — derive expected values from a fixture `ParseResult` (NOT hardcoded): summary shows title/client/dates and counts `crewMembers.length`/`rooms.length`/`hotelReservations.length`/`Object.keys(runOfShow??{}).length`; diagrams/reel badges per guard; warnings chip iff `warnings.length>0`. Guard cases: `parseResult=null` → renders title fallback + "couldn't read details" + **no checkbox**; empty arrays → "0 crew" etc. rendered. Breakdown lists crew names+roles, schedule outline, rooms, hotels with the §4.3 caps ("…+K more").
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the card per spec §4.2/§4.3/§4.6 — invoke the **impeccable** skill for the visual craft within these exact field/guard constraints. Dimensional invariants per §4.4 (checkbox `shrink-0`; summary block `min-w-0 flex-1`; bounded expand region).
- [ ] **Step 4: Run unit → PASS.**
- [ ] **Step 5: Layout-dimensions test** — Playwright renders the card in a fixed-width column at the documented viewport band; `getBoundingClientRect()` on each `data-testid` asserts `child.width <= parent.width` within 0.5px; assert no horizontal overflow when title is very long. Run → PASS.
- [ ] **Step 6: Commit** — `feat(onboarding): step-3 inline parse-preview card (summary + breakdown)`

### Task D3: Publish checkbox + select-all + intent wiring (+ transition-audit)

**Files:** Modify `Step3SheetCard.tsx` + `Step3Review.tsx`; Tests `tests/components/step3Checkbox.test.tsx` + transition-audit `tests/components/step3SheetCard.transitions.test.tsx`.
**Interfaces:** Consumes C3 (un-approve) + the wizard apply route (approve). Produces: checkbox (default unchecked) posts approve on check / un-approve on uncheck; `Select all` toggles all clean cards; live count.

- [ ] **Step 1: Failing tests** — check posts to the apply route (approve) and reflects `applied`; uncheck posts to un-approve and reverts to `staged`; checkbox disabled while a write is in flight (guard §4.6); `Select all` checks every clean card and updates the count line (tabular-nums, no layout shift). Transition-audit: enumerate the card's `AnimatePresence`/ternary/conditional blocks; assert expand has height-morph (reduced-motion instant) and checkbox/count are instant per §4.5; compound: expand while toggling Select-all is independent.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — wire check/uncheck to the routes (optimistic + `router.refresh()`); `Select all` iterates clean rows; reduced-motion respected. impeccable for the interaction polish.
- [ ] **Step 4: Run → PASS** (unit + transition-audit).
- [ ] **Step 5: Commit** — `feat(onboarding): publish checkbox + select-all (durable publish-intent)`

### Task D4: "Needs your attention" group

**Files:** Modify `Step3Review.tsx`; Test `tests/components/step3NeedsAttention.test.tsx`.
**Interfaces:** Renders blocking rows (`hard_failed`/`live_row_conflict`/`discard_retryable`) in a distinct group with the §4.1 actions.

- [ ] **Step 1: Failing tests** — `hard_failed` → Retry + Ignore; `live_row_conflict` → `LIVE_ROW_CONFLICT` cataloged copy (via `messageFor`, no raw code) + dashboard link + Ignore; `discard_retryable` → Ignore. Ignore posts to the live-partition ignore route (C1) and the row leaves the list. Group hidden when empty.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per §4.1; impeccable for grouping/visual hierarchy.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): step-3 needs-attention group with in-wizard exits`

### Task D5: FinalizeButton — "Publish N shows & finish setup" + soft confirm

**Files:** Modify `components/admin/FinalizeButton.tsx`; Test `tests/components/finalizeButton.test.tsx`.
**Interfaces:** Consumes `finishable` (disabled) + checked count.

- [ ] **Step 1: Failing tests** — label reads "Publish N shows & finish setup" with N = checked count; `disabled` follows `finishable`; clicking with unchecked-clean rows present shows the soft-confirm ("N sheets won't be published — you'll find them under Unpublished. Continue?") before running the finalize loop; confirming proceeds, cancel aborts. (React-19 form-action note: the confirm must not self-disable mid-submit — see `feedback_react_form_action_synchronous_disable_cancels_submit`; use a controlled confirm state, not an in-onClick disable.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — count prop + label; soft-confirm dialog; preserve the existing finalize→finalize-cas loop. impeccable for the dialog.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): publish-count finish button + soft confirm for unchecked`

### Task D6: Remove staged link + conditional failure heading

**Files:** Modify `Step3Review.tsx` (remove "Review and apply" link) + `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx:260-264`; Tests `tests/components/step3NoStagedLink.test.tsx` + `tests/components/wizardStagedPage.heading.test.tsx`.
**Interfaces:** Staged page heading conditional on `row.last_finalize_failure_code`.

- [ ] **Step 1: Failing tests** — (a) Step3 clean card has no link to `/admin/onboarding/staged/...` (inline now). (b) staged page with `last_finalize_failure_code=null` renders neutral "Re-review this sheet" copy; with a code set renders the failure copy.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — delete the staged `<Link>` branch in `Step3Review` (replaced by the inline card); gate the page heading/subcopy on `row.last_finalize_failure_code !== null`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): inline step-3 review; staged page failure copy now conditional`

### Task D7: impeccable dual-gate — Step-3 surfaces

- [ ] Run `/impeccable critique` AND `/impeccable audit` (v3 preflight gates) on the Step-3 diff (cards, group, finalize button). Fix HIGH/CRITICAL or record DEFERRED.md entries. Record findings + dispositions in the milestone handoff §12. Externally attested (fresh subagent), not self-attested.

---

## Phase E — UI: new views (Opus + impeccable)

### Task E1: `/admin/unpublished` (Held shows)

**Files:** Create `app/admin/unpublished/page.tsx` (+ `loading.tsx`); Test `tests/admin/unpublishedView.test.tsx`; Extend `tests/admin/_metaInfraContract.test.ts`.
**Interfaces:** Lists Held shows (`!published && !archived && !finalizeOwned`) with one-tap Publish (reuse `PublishShowButton` + `publishShowAction`).

- [ ] **Step 1: Failing tests** — loader returns only Held shows (a published show + an archived show + a finalize-owned show are excluded; uses the `readFinalizeOwned` fan-out to exclude Publishing…); a Publish action is bound per row; empty state copy. Boundary destructures `{ data, error }` → typed infra_error.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — RSC loader (`archived=false, published=false`, minus finalize-owned), render `ShowsTable` (or a focused list) with per-row Publish `.bind(null, slug)`; impeccable for the view.
- [ ] **Step 4: Run → PASS;** register the loader in `tests/admin/_metaInfraContract.test.ts` (admin-surface registry; the `tests/auth/_metaInfraContract.test.ts` file is for auth helpers and is NOT touched here).
- [ ] **Step 5: Commit** — `feat(admin): /admin/unpublished Held-shows view`

### Task E2: Ignored-sheets view

**Files:** Create `app/admin/ignored-sheets/page.tsx` (+ `loading.tsx`); Test `tests/admin/ignoredSheetsView.test.tsx`; Extend `_metaInfraContract.test.ts`.
**Interfaces:** Consumes A2 (`drive_file_name`) + C2 (un-ignore). Lists live `permanent_ignore` rows; per-row Un-ignore.

- [ ] **Step 1: Failing tests** — loader returns `deferred_ingestions where wizard_session_id is null and deferred_kind='permanent_ignore'` with `drive_file_name`, `deferred_at`, `deferred_by_email`; renders name (not raw id); Un-ignore action posts to C2 and the row leaves. Empty state.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — RSC loader + Un-ignore client action; impeccable.
- [ ] **Step 4: Run → PASS;** register loader in `tests/admin/_metaInfraContract.test.ts` (admin-surface registry).
- [ ] **Step 5: Commit** — `feat(admin): ignored-sheets view + un-ignore`

### Task E3: impeccable dual-gate — new views + nav entry

- [ ] Add nav entries to the admin surface for Unpublished + Ignored-sheets (per DESIGN.md). Run `/impeccable critique` + `/impeccable audit` on both views + nav. Fix HIGH/CRITICAL or DEFER. Record in handoff §12. Externally attested.

---

## Phase F — Copy + §12.4

### Task F1: Approve/Publish language (onboarding-only)

**Files:** Modify `components/admin/StagedReviewCard.tsx:189,637` (gate label on `isWizardMode`) + `Step3Review.tsx` header copy; Test `tests/components/approveLabel.test.tsx`.
**Interfaces:** Wizard-mode label = "Approve"/"Publish"; live mode label unchanged ("Apply").

- [ ] **Step 1: Failing tests** — `StagedReviewCard mode='wizard_failed_reapply'` renders "Approve"/"Publish"; `mode='live'` renders "Apply this change" (unchanged, D9).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — gate `actionLabel`/button text on `isWizardMode`; rewrite Step3 header copy ("Review & publish your sheets…", held-aware, no "every row must be resolved").
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(onboarding): Approve/Publish copy (onboarding-only; live Apply unchanged)`

### Task F2: §12.4 catalog audit + any new codes

**Files:** (conditional) `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 + `lib/messages/__generated__/spec-codes.ts` + `lib/messages/catalog.ts`; Test `tests/cross-cutting/codes.test.ts`.
**Interfaces:** Any NEW user-visible error code (e.g. an un-ignore/un-approve failure) is cataloged via the 3-part lockstep; existing `ONBOARDING_SCAN_REVIEW` prose verified still accurate.

- [ ] **Step 1:** Audit — does any NEW user-facing code get introduced (un-ignore/un-approve/unpublished-view failures)? If a route returns a NEW code surfaced in UI, add the §12.4 row + regen `pnpm gen:spec-codes` + add the `catalog.ts` row in ONE commit. If reusing existing codes (`SYNC_INFRA_ERROR`, `ADMIN_FORBIDDEN`, `LIVE_ROW_CONFLICT`, etc.), no catalog change. Confirm `ONBOARDING_SCAN_REVIEW` copy still matches the new flow (it says "review the parse before activating" — still accurate).
- [ ] **Step 2:** Run `pnpm test:audit:x1-catalog-parity` → PASS (lockstep intact).
- [ ] **Step 3: Commit** (only if a code changed) — `feat(messages): <CODE> for <surface> (§12.4 lockstep)`.

---

## Phase G — Verification & close-out

- [ ] **G1: Full local suite** — `pnpm test` (or the project's canonical task) green; `pnpm lint`; `pnpm build` (catches MDX/route issues). Never pipe a suite to `|tail` (memory).
- [ ] **G2: Self-review** — run the writing-plans self-review (spec coverage, placeholder scan, type consistency) — see below.
- [ ] **G3: Adversarial review (cross-model)** — invoke `adversarial-review` on this plan; iterate to APPROVE (no round budget). *(This task sits between self-review and execution handoff per AGENTS.md.)*
- [ ] **G4: Execution handoff** — subagent-driven-development, fresh subagent per task, two-stage review.
- [ ] **G5: Whole-milestone close-out + whole-diff Codex review → real CI green → `gh pr merge --merge` → fast-forward main** (pipeline task #9).

---

## Self-Review (run before G3)

1. **Spec coverage:** D1 (§7.1/finishable) · D2/D3 (§4.2-4.6) · D4 (§4.1 needs-attention) · D5 (§4 footer/soft confirm) · D6 (§7.7 staged-link/§8.3) · E1 (§5) · E2/C1/C2 (§6) · B1 (§7.3) · B2 (§7.4 branches) · B3 (§7.4 flip) · B4 (§7.5 AC5) · C3 (§7.2 uncheck) · F1 (§8.1/D9) · F2 (§8.2) · A1/A2 (migration matrix). AC1-AC11 each map to a task. **D10 existing-show no-op = B2 branch 4 + AC8. live_row_conflict exit = D4 + AC11.**
2. **Placeholder scan:** migration filenames use a `2026XXXX` placeholder for the date prefix — the implementer stamps the real timestamp at creation (not a content gap). No TODO/TBD in steps.
3. **Type consistency:** `finishable` (D1) used by D5/FinalizeButton; `publish_intent` column (A1) written by B2, read by B3; `BLOCKING` set identical in D1 (UI) and B1 (server); `Step3Row.parseResult` (D1) consumed by D2/D3.
