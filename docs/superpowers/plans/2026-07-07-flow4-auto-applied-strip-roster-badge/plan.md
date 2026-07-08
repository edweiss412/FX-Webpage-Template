# Flow 4.2 + 4.3 — Auto-applied strip + roster-shift badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a cross-show "Recently auto-applied" strip (per-row + bulk Accept/Undo) in the admin dashboard needs-attention column, and fold a roster-shift input into the existing `DataQualityBadge`, so silent cron auto-applies become visible + dispositionable.

**Architecture:** New per-row disposition column `show_change_log.acknowledged_at`; a `acknowledge_changes(show_id, ids)` SECURITY DEFINER RPC (explicit capped read-snapshot ids) for Accept; reuse of the shipped `undo_change` RPC for Undo; a service-role `roster_shift_counts(ids)` aggregate RPC for the badge; a server-side loader + dashboard-scoped server actions + two client components; the badge extended with an OR'd roster-shift input.

**Tech Stack:** Next.js 16 (App Router, RSC + `useActionState`), Supabase/Postgres (plpgsql SECURITY DEFINER RPCs), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-07-flow4-auto-applied-strip-roster-badge.md` (Codex-APPROVED, 6 rounds). Section refs below (§N) point at it.

## Global Constraints

- **TDD per task** — failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task**, conventional-commits (`feat(db):`, `feat(admin):`, `test(admin):`, …); `--no-verify` (shared hooks live in the main checkout).
- **Advisory lock:** `acknowledge_changes` + `roster_shift_counts` take **no** `pg_advisory*` — they touch only `show_change_log` (not in invariant-2's lock set). Topology unchanged; `advisoryLockRpcDeadlock.test.ts` unchanged (§13 D1).
- **Email canonicalization:** `acknowledged_by = auth_email_canonical()`; no new inline email handling.
- **No raw error codes in UI:** failures render via `<ErrorExplainer code surface="admin" />` → `lib/messages/lookup`. Badge aria-label is plain language.
- **No new §12.4 catalog code.** New forensic `logAdminOutcome` code `CHANGES_ACKNOWLEDGED` is §12.4-EXEMPT and MUST be added to `SANCTIONED_CODES` (`tests/log/_auditableMutations.ts:312`).
- **Mutation-surface observability (invariant 10):** the 3 dashboard actions are admin mutations → `AUDITABLE_MUTATIONS` rows + post-commit `logAdminOutcome` + behavioral proof.
- **Supabase call-boundary (invariant 9):** every client call destructures `{ data, error }`; infra faults → typed `{ ok:false, code:'SYNC_INFRA_ERROR' }`.
- **UI-is-Opus + impeccable v3 dual-gate (invariant 8):** the UI diff (`DataQualityBadge`, `RecentAutoAppliedStrip`, `AcceptChangeButton`, `Dashboard`/`ShowsTable`) runs `/impeccable critique` + `/impeccable audit` at close-out (Task 9) before the whole-diff Codex review.
- **Migration reaches validation** (`validation-schema-parity`): apply local → `pnpm gen:schema-manifest` + commit manifest → apply to validation via `psql "$TEST_DATABASE_URL"` (Task 1).
- **Meta-test inventory:** EXTEND `tests/log/_auditableMutations.ts` (3 actions + `SANCTIONED_CODES`) AND add behavioral coverage in `tests/log/adminOutcomeBehavior.test.ts` (R1-F3); `tests/sync/_metaInfraContract.test.ts` (`acknowledgeChanges` — the sync-helper registry where `undoChange` lives, NOT `tests/auth`, R1-F2); `tests/admin/_metaInfraContract.test.ts` + `tests/admin/_metaBoundedReads.test.ts` (`loadRecentAutoApplied`). Also UPDATE two existing pinned tests broken by the changes: `tests/db/show-change-log-schema.test.ts` (exact-column list gains `acknowledged_at`/`acknowledged_by`, R1-F4) and `tests/components/admin/dataGapsTransitionAudit.test.tsx` (badge early-return source line changes; stays INSTANT, R1-F5). No new advisory-lock/email/sentinel/alert-catalog meta-test.

---

## File Structure

**New**
- `supabase/migrations/<ts>_show_change_log_acknowledged.sql` — columns + one-shot backfill + `acknowledge_changes` + `roster_shift_counts` (§5.1/§5.3/§5.4).
- `lib/sync/holds/acknowledgeChanges.ts` — Accept helper (§7.1).
- `lib/admin/loadRecentAutoApplied.ts` — strip loader + roster counts (§6.1).
- `app/admin/_actions/autoApplied.ts` — `acceptChangeAction`, `acceptAllAction`, `undoFromDashboardAction` (§7.2).
- `components/admin/AcceptChangeButton.tsx` — Accept button (mirror `UndoChangeButton`).
- `components/admin/RecentAutoAppliedStrip.tsx` — strip UI.
- Tests: `tests/db/acknowledge-changes.test.ts`, `tests/db/roster-shift-counts.test.ts`, `tests/sync/acknowledgeChanges.test.ts`, `tests/admin/loadRecentAutoApplied.test.ts`, `tests/admin/autoAppliedActions.test.ts`, `tests/components/admin/AcceptChangeButton.test.tsx`, `tests/components/admin/RecentAutoAppliedStrip.test.tsx`, `tests/components/admin/DataQualityBadge.rosterShift.test.tsx`.

**Modified**
- `components/admin/DataQualityBadge.tsx` — `rosterShift` prop (§6.5).
- `lib/admin/showDisplay.ts` — `rosterShift?: RosterShiftSummary` on `ActiveShowRow` (:15).
- `components/admin/ShowsTable.tsx:471` — thread `rosterShift` into `<DataQualityBadge>`.
- `components/admin/Dashboard.tsx` — fetch `loadRecentAutoApplied` in the `:398` Promise.all; map `rosterShiftByShow` onto rows (`:430`/`:454`); render `<RecentAutoAppliedStrip>` after `<NeedsAttentionInbox>` (`:690`).
- `tests/log/_auditableMutations.ts` — 3 action rows + `CHANGES_ACKNOWLEDGED` in `SANCTIONED_CODES`.
- `tests/log/adminOutcomeBehavior.test.ts` — behavioral success-branch coverage for the 3 actions (R1-F3).
- `tests/sync/_metaInfraContract.test.ts` — `acknowledgeChanges` row (R1-F2; the sync-helper registry, not `tests/auth`).
- `tests/admin/_metaInfraContract.test.ts` + `tests/admin/_metaBoundedReads.test.ts` — `loadRecentAutoApplied` rows.
- `tests/db/show-change-log-schema.test.ts` — exact-column list + type block gain the 2 new columns (R1-F4).
- `tests/components/admin/dataGapsTransitionAudit.test.tsx` — updated badge early-return regex; stays INSTANT (R1-F5).
- `supabase/__generated__/schema-manifest.json` — regen.

**Shared types** (define in `lib/admin/showDisplay.ts` next to `ActiveShowRow`, imported by badge + loader + Dashboard):
```ts
export type RosterShiftSummary = { added: number; removed: number; renamed: number; total: number };
```

---

### Task 1: Migration — columns, backfill, `acknowledge_changes`, `roster_shift_counts`

**Files:**
- Create: `supabase/migrations/<ts>_show_change_log_acknowledged.sql`
- Create test: `tests/db/acknowledge-changes.test.ts`, `tests/db/roster-shift-counts.test.ts`
- Modify: `supabase/__generated__/schema-manifest.json` (regen), `tests/db/show-change-log-schema.test.ts` (R1-F4 — exact-column list + type block gain the two new columns)

**Interfaces — Produces:**
- `public.acknowledge_changes(p_show_id uuid, p_ids uuid[]) returns jsonb` → `{ok:true,count:int}`; raises 42501 (non-admin), 22004 (NULL p_ids).
- `public.roster_shift_counts(p_show_ids uuid[]) returns table(show_id uuid, added int, removed int, renamed int)` (service-role only).
- Columns `show_change_log.acknowledged_at timestamptz`, `acknowledged_by text`.

- [ ] **Step 1: Write failing DB tests.** Follow the harness in `tests/db/undo-change-direction-a.test.ts` (same `TEST_DATABASE_URL`/postgres.js pattern + is_admin JWT seeding). `tests/db/acknowledge-changes.test.ts` asserts:
  - seeds a show + several `show_change_log` auto_apply `applied` rows; `acknowledge_changes(show, [id1])` stamps `acknowledged_at` + `acknowledged_by=<admin canonical email>` on id1 only; returns `{ok:true,count:1}`.
  - idempotent: 2nd identical call → `count:0`.
  - `p_ids='{}'::uuid[]` → `count:0` (acks nothing).
  - `p_ids=NULL` → raises SQLSTATE `22004`.
  - non-admin JWT → raises `42501`.
  - won't ack a `mi11_approve`-source or already-`undone`/`superseded` row (filter proof).
  - `p_show_id` scoping: an id belonging to another show passed in `p_ids` is NOT acked.
  - **backfill:** a row inserted BEFORE running the migration's backfill is `acknowledged_at IS NOT NULL`; a row inserted after keeps NULL. (Assert by seeding a pre-existing applied row via the fixture, running the migration file, then checking.)
  `tests/db/roster-shift-counts.test.ts` asserts:
  - grouped per-show `{added,removed,renamed}` for un-dispositioned roster rows; excludes acked/undone/superseded/non-roster (`field_changed`/`crew_email_changed`) rows.
  - **published-agnostic:** given ids of a published AND an unpublished show, BOTH are counted (proves the RPC does not filter published — the loader does).
  - a show with zero un-dispositioned roster rows is absent from the result.
  - **grant boundary (R1-F6):** a connection acting as `authenticated` (self-signed role JWT + a valid `apikey`, per the gateway/PostgREST split — memory `gateway_apikey_not_postgrest_jwt`) is DENIED execute on `roster_shift_counts` (spec §5.4 service-role-only); a `service_role` connection succeeds.

- [ ] **Step 2: Run tests, verify they fail.** `pnpm vitest run tests/db/acknowledge-changes.test.ts tests/db/roster-shift-counts.test.ts` → FAIL (functions/columns absent).

- [ ] **Step 3: Write the migration.** Create `supabase/migrations/<ts>_show_change_log_acknowledged.sql` with (verbatim from spec §5.1/§5.3/§5.4):
  ```sql
  alter table public.show_change_log
    add column if not exists acknowledged_at timestamptz,
    add column if not exists acknowledged_by text;

  -- one-shot clean-start backfill (forward-only): pre-existing applied auto-applies count as reviewed
  update public.show_change_log
     set acknowledged_at = now()
   where source = 'auto_apply' and status = 'applied' and acknowledged_at is null;
  ```
  then the `acknowledge_changes` function + grants (spec §5.3) and the `roster_shift_counts` function + grants (spec §5.4). Copy both SQL blocks exactly.

- [ ] **Step 4: Apply locally + run tests.** Apply to the loopback DB (NOT `TEST_DATABASE_URL`, which is remote/validation): `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/<ts>_show_change_log_acknowledged.sql` then `psql "…54322/postgres" -c "notify pgrst,'reload schema';"`. Run: `pnpm vitest run tests/db/acknowledge-changes.test.ts tests/db/roster-shift-counts.test.ts` → PASS.

- [ ] **Step 4b: Update the pinned schema test (R1-F4).** `tests/db/show-change-log-schema.test.ts:86` ("has exactly the contract columns") asserts an alpha-ordered column list and a per-column data_type/is_nullable block — add `"acknowledged_at"` + `"acknowledged_by"` (they sort FIRST, before `after_image`) to the expected array and add their type rows (`timestamptz`/`text`, both nullable, no default). Run `pnpm vitest run tests/db/show-change-log-schema.test.ts` → PASS (this test would otherwise fail outside this task's TDD loop).

- [ ] **Step 5: Regen manifest + apply to validation.** `pnpm gen:schema-manifest` (writes `supabase/__generated__/schema-manifest.json`); then apply the same migration to validation: `psql "$TEST_DATABASE_URL" -f supabase/migrations/<ts>_show_change_log_acknowledged.sql` + `psql "$TEST_DATABASE_URL" -c "notify pgrst,'reload schema';"`.

- [ ] **Step 6: Commit.**
  ```bash
  git add supabase/migrations tests/db/acknowledge-changes.test.ts tests/db/roster-shift-counts.test.ts tests/db/show-change-log-schema.test.ts supabase/__generated__/schema-manifest.json
  git commit --no-verify -m "feat(db): acknowledge_changes + roster_shift_counts RPCs + acknowledged_at column"
  ```

---

### Task 2: `acknowledgeChanges` helper + infra-contract registration

**Files:**
- Create: `lib/sync/holds/acknowledgeChanges.ts`
- Create test: `tests/sync/acknowledgeChanges.test.ts`
- Modify: `tests/sync/_metaInfraContract.test.ts` (R1-F2 — the sync-helper registry where `undoChange` is registered, NOT `tests/auth/_metaInfraContract`)

**Interfaces:**
- Consumes: the `acknowledge_changes` RPC (Task 1).
- Produces: `acknowledgeChanges(showId: string, ids: string[]): Promise<{ok:true;count:number}|{ok:false;code:string}>`.

- [ ] **Step 1: Write failing test.** Mirror `tests/sync/` undo-helper tests (mock the supabase client's `.rpc`). Assert:
  - success `{ ok:true, count }` from `data.count`.
  - returned-error (`{data:null,error}`) → `{ ok:false, code:'SYNC_INFRA_ERROR' }`.
  - thrown error → `{ ok:false, code:'SYNC_INFRA_ERROR' }` (not a leaked throw).
```ts
import { acknowledgeChanges } from "@/lib/sync/holds/acknowledgeChanges";
// mock createClient().rpc to resolve {data:{ok:true,count:2},error:null}
it("returns count on success", async () => {
  const r = await acknowledgeChanges("show-1", ["a","b"]);
  expect(r).toEqual({ ok: true, count: 2 });
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm vitest run tests/sync/acknowledgeChanges.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `lib/sync/holds/acknowledgeChanges.ts` mirroring `lib/sync/holds/undoChange.ts` structure: server client, `const { data, error } = await client.rpc("acknowledge_changes", { p_show_id: showId, p_ids: ids })`, distinguish returned-error vs thrown (try/catch), map both infra paths to `{ ok:false, code:"SYNC_INFRA_ERROR" }`, else `{ ok:true, count: data.count }`.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Register in `tests/sync/_metaInfraContract.test.ts`** (R1-F2 — the registry where `undoChange` lives; grep it for `undoChange` to find the row shape and mirror it: file path + `{data,error}` destructure contract). Run `pnpm vitest run tests/sync/_metaInfraContract.test.ts` → PASS. (Memory: this meta-test is comment/format-fragile — no stray `;`/comment between `supabase` and `.rpc`.)

- [ ] **Step 6: Commit** `feat(sync): acknowledgeChanges helper (accept auto-applied changes via RPC)`.

---

### Task 3: `loadRecentAutoApplied` loader + admin meta-test registration

**Files:**
- Create: `lib/admin/loadRecentAutoApplied.ts`
- Create test: `tests/admin/loadRecentAutoApplied.test.ts`
- Modify: `tests/admin/_metaInfraContract.test.ts`, `tests/admin/_metaBoundedReads.test.ts`

**Interfaces:**
- Consumes: `roster_shift_counts` RPC (Task 1); the **service-role** client `createSupabaseServiceRoleClient` (`@/lib/supabase/server`) — the pattern from `lib/observe/query/changeLog.ts:43` (NOT the cookie client, R2-F1).
- Produces (spec §6.1):
```ts
export type AutoAppliedRow = { id: string; changeKind: string; summary: string; occurredAt: string; undoable: boolean };
export type AutoAppliedGroup = { showId: string; slug: string; showName: string; rows: AutoAppliedRow[]; acceptableIds: string[]; undoableIds: string[] };
export type RecentAutoApplied =
  | { kind: "ok"; groups: AutoAppliedGroup[]; renderedCount: number; overflowCount: number; rosterShiftByShow: Record<string, RosterShiftSummary> }
  | { kind: "infra_error"; message: string };
export const STRIP_RENDER_CAP = 50;
export async function loadRecentAutoApplied(
  deps: { publishedShowIds: string[]; supabase?: SupabaseClient },
): Promise<RecentAutoApplied>;
```
- **Service-role client (R2-F1):** `show_change_log` is REVOKEd from `authenticated` (deny-by-default, service-role only), and `roster_shift_counts` is granted to `service_role` only. So the loader MUST use a service-role client — NOT the dashboard's cookie-bound `createSupabaseServerClient` (which would degrade every call to `infra_error`). The loader defaults `supabase` to `createSupabaseServiceRoleClient()` (`@/lib/supabase/server`) internally — mirroring `lib/observe/query/changeLog.ts:43` — and accepts an injected client only for tests. Dashboard does NOT pass a client (Task 8).
- **`publishedShowIds` (R1-F1):** the caller (Dashboard, which already has the active show rows) passes the FULL list of active-published show ids. `roster_shift_counts(publishedShowIds)` is driven by THIS list — NOT by the display-capped rows — so a published show whose rows fall outside `STRIP_RENDER_CAP` (or which has zero displayed rows because other shows filled the cap) still gets an accurate badge. The badge is decoupled from the strip's display cap.

- [ ] **Step 1: Write failing test** (`tests/admin/loadRecentAutoApplied.test.ts`, follow `tests/admin/loadNeedsAttention.test.ts` mock shape). Assert against a seeded/mock row set:
  - groups by show, newest-first; `summary` passed through verbatim.
  - filter: only `source='auto_apply' AND status='applied' AND acknowledged_at IS NULL AND change_kind IN (5 kinds)`; excludes acked/undone/superseded/`mi11_approve`/`undo`-source rows (derive fixtures so each exclusion is a distinct row that must NOT appear).
  - `undoable` true only for `crew_added/removed/renamed` with `individually_undoable=true`; false for `field_changed`/`crew_email_changed`.
  - `acceptableIds` = displayed rows' ids; `undoableIds` = displayed undoable subset.
  - cap: with `STRIP_RENDER_CAP+3` matching rows, `renderedCount===STRIP_RENDER_CAP`, `overflowCount===3`.
  - `rosterShiftByShow` populated from the `roster_shift_counts` rpc mock, driven by the passed `publishedShowIds` (R1-F1: a published show with roster rows but ZERO displayed strip rows — because the cap filled with other shows — STILL gets its badge count; assert its id is in the rpc arg and its count is in `rosterShiftByShow`).
  - **published filter is the loader's job:** `publishedShowIds` (the caller's active-published list) is exactly what's passed to `roster_shift_counts`; an unpublished show's id is never in it (assert the rpc arg excludes it).
  - client fault → `{ kind:'infra_error' }` (call-boundary invariant 9).
  - **Anti-tautology:** derive expected counts from the fixture rows, not hardcoded; scope each exclusion assertion to the specific row id.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `lib/admin/loadRecentAutoApplied.ts`: use `const supabase = deps.supabase ?? createSupabaseServiceRoleClient()` (R2-F1 — service-role, not cookie); (a) one bounded `.from('show_change_log').select(...).eq('source','auto_apply').eq('status','applied').is('acknowledged_at', null).in('change_kind', [...5]).order('occurred_at',{ascending:false}).limit(STRIP_RENDER_CAP+1)` join/lookup show name+slug; slice to cap + compute `overflowCount`; build groups + `acceptableIds`/`undoableIds`; (b) `.rpc('roster_shift_counts',{ p_show_ids: publishedShowIds })` (the caller-supplied list, R1-F1) → map to `rosterShiftByShow` (`total=added+removed+renamed`; shows absent from the result → omitted, so the badge sees `undefined`); each supabase call destructures `{data,error}` → `infra_error` on fault.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Register meta-tests.** Add a `tests/admin/_metaInfraContract.test.ts` `infraRegistry` row (`helper:"loadRecentAutoApplied", path:"lib/admin/loadRecentAutoApplied.ts"`) like `loadNeedsAttention:225`. Add `"lib/admin/loadRecentAutoApplied.ts"` to `READ_MODULES` in `tests/admin/_metaBoundedReads.test.ts:30`. Run both → PASS (the `.from` is `limit`-bounded; the roster `.rpc` isn't a scanned `.from`).

- [ ] **Step 6: Commit** `feat(admin): loadRecentAutoApplied loader (un-dispositioned auto-applies + roster counts)`.

---

### Task 4: Dashboard server actions + observability registry

**Files:**
- Create: `app/admin/_actions/autoApplied.ts`
- Create test: `tests/admin/autoAppliedActions.test.ts`
- Modify: `tests/log/_auditableMutations.ts`, `tests/log/adminOutcomeBehavior.test.ts` (R1-F3 — the file-local behavioral recorder that proves every registered admin mutation emits on its success branch)

**Interfaces:**
- Consumes: `acknowledgeChanges` (Task 2), `undoChange` helper (`@/lib/sync/holds/undoChange`), `requireAdminIdentity`, `revalidatePath` (`next/cache`), `revalidateShow` (`@/lib/data/showCacheTag`), `logAdminOutcome` (`@/lib/log/logAdminOutcome`).
- Produces three `(prev, formData) => Result` actions (spec §7.2): `acceptChangeAction`, `acceptAllAction`, `undoFromDashboardAction`.

- [ ] **Step 1: Write failing test.** Mirror the undo-action test for `app/admin/show/[slug]/_actions/feed.ts`. For each action assert: reads `requireAdminIdentity`; calls the right helper with form fields (`acceptChangeAction`→`acknowledgeChanges(showId,[changeLogId])`; `acceptAllAction`→`acknowledgeChanges(showId, acceptableIds)` from a comma-joined hidden field; `undoFromDashboardAction`→`undoChange(changeLogId)`); on success calls `revalidatePath("/admin","page")` (undo also `revalidateShow(showId)`); **behavioral observability proof** — a `logAdminOutcome` spy records ONLY after the committed-success branch, with `code:"CHANGES_ACKNOWLEDGED"` (accept actions) / `"CHANGE_UNDONE"` (undo action) and the documented `source`.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `app/admin/_actions/autoApplied.ts` (`"use server"`). Each action mirrors `feed.ts:121-149`: `requireAdminIdentity()` → parse formData → helper → on `ok`: revalidate + post-commit `try { await logAdminOutcome({...}) } catch {}`. `acceptAllAction` parses `acceptableIds` from a hidden field (e.g. `String(formData.get("ids")).split(",").filter(Boolean)`). `undoFromDashboardAction` reuses `undoChange` + **`if (result.showId) revalidateShow(result.showId)`** (guarded — `undoChange` returns `showId?` optional, R2-F2, matching `feed.ts:132`) + `revalidatePath("/admin","page")`.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Register observability.** In `tests/log/_auditableMutations.ts`: add three `AUDITABLE_MUTATIONS` rows (`file:"app/admin/_actions/autoApplied.ts"`, `fn`, `code`) mirroring the `undoChangeAction:155` row; add `"CHANGES_ACKNOWLEDGED"` to `SANCTIONED_CODES:312`. **In `tests/log/adminOutcomeBehavior.test.ts` (R1-F3):** add executable success-branch behavioral coverage for each of the three actions (its file-local recorder must observe the `code` on the committed-success branch — a spy in the Task-4 action test does NOT satisfy this file's assertion). Run `pnpm vitest run tests/log/` → the static `_metaMutationSurfaceObservability` + `_metaAdminOutcomeContract` + `adminOutcomeBehavior` all PASS. (Prove fails-by-default once: temporarily delete a registry row → red → restore.)

- [ ] **Step 6: Commit** `feat(admin): dashboard accept/undo server actions for auto-applied strip`.

---

### Task 5: `AcceptChangeButton` component

**Files:**
- Create: `components/admin/AcceptChangeButton.tsx`
- Create test: `tests/components/admin/AcceptChangeButton.test.tsx`

**Interfaces:**
- Consumes: an accept server action of shape `(prev, formData) => Result`; `ErrorExplainer`, `SubmitButton` (same imports as `UndoChangeButton`).
- Produces: `<AcceptChangeButton acceptAction hiddenFields={{...}} label />`.

- [ ] **Step 1: Write failing test.** Mirror `UndoChangeButton` tests: renders a `<form action={dispatch}>` with the hidden field(s); the submit button shows pending/disabled via `useActionState`; on `{ok:false,code}` renders `<ErrorExplainer code surface="admin"/>`; on success no error. Use an async-focus `waitFor` for pending state if needed.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `components/admin/AcceptChangeButton.tsx` — a near-copy of `UndoChangeButton.tsx` (`useActionState(acceptAction,null)`, `<form action={dispatch}>`, hidden inputs, `<SubmitButton disabled={pending} aria-busy={pending}>Accept</SubmitButton>`, `ErrorExplainer` on failure). NO synchronous onClick disable (would cancel the submit — memory `react_form_action_synchronous_disable_cancels_submit`).

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** `feat(admin): AcceptChangeButton (form-action accept, typed-failure surfacing)`.

---

### Task 6: `RecentAutoAppliedStrip` component

**Files:**
- Create: `components/admin/RecentAutoAppliedStrip.tsx`
- Create test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx`

**Interfaces:**
- Consumes: `RecentAutoApplied` (Task 3 types), the three actions (Task 4), `AcceptChangeButton` (Task 5), `UndoChangeButton`.
- Produces: `<RecentAutoAppliedStrip data={RecentAutoApplied} actions={{acceptChangeAction, acceptAllAction, undoFromDashboardAction}} />`.

- [ ] **Step 1: Write failing test.** Assert:
  - `kind:'ok'` with 2 groups → one section per show, rows newest-first, verbatim summary text.
  - per-row: an `Accept` control on every row; a `Undo` control ONLY on undoable rows — **absent** for `field_changed`/`crew_email_changed` (query the specific row's testid, clone-and-scope to avoid a sibling match — anti-tautology).
  - group header: `Accept all` always; `Undo all` only when `undoableIds.length>0`; `Undo all` triggers a confirm before dispatching (assert the confirm gate exists).
  - `overflowCount>0` → renders the plain-text `"+N older changes not shown"` line.
  - `kind:'ok'` with `groups:[]` → component renders **nothing** (no empty card).
  - `kind:'infra_error'` → a bounded inline error, no raw code.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `components/admin/RecentAutoAppliedStrip.tsx` (client component). Map groups → group cards; each row renders `<AcceptChangeButton>` (hidden `changeLogId`) + conditional `<UndoChangeButton changeLogId undoAction={undoFromDashboardAction}>`; group header renders Accept-all (`<AcceptChangeButton>` variant submitting `ids=acceptableIds.join(",")`) + conditional Undo-all (loops `undoFromDashboardAction` over `undoableIds` behind a confirm). Empty groups → `return null`. Follow existing needs-attention card styling.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** `feat(admin): RecentAutoAppliedStrip (grouped auto-applies, Accept/Undo, bulk)`.

---

### Task 7: `DataQualityBadge` roster-shift input

**Files:**
- Modify: `components/admin/DataQualityBadge.tsx`, `lib/admin/showDisplay.ts` (:15, add `rosterShift` + `RosterShiftSummary`), `components/admin/ShowsTable.tsx:471`, `tests/components/admin/dataGapsTransitionAudit.test.tsx` (R1-F5 — its pinned early-return source regex changes; badge stays INSTANT)
- Create test: `tests/components/admin/DataQualityBadge.rosterShift.test.tsx`

**Interfaces:**
- Consumes: `RosterShiftSummary`.
- Produces: `<DataQualityBadge slug dataGaps rosterShift? />` (extended).

- [ ] **Step 1: Write failing test.** Visibility truth table: (dataGaps only)→amber; (rosterShift.total>0 only)→amber; (both)→amber; (neither/both undefined/zero)→`null`. Combined aria-label exact strings (spec §6.5): roster-only `"Roster changed since last review: 1 added, 1 renamed"` (omit zero-count segments, singular/plural); gap-only unchanged; both concatenated. Guards: `rosterShift` undefined and `dataGaps` undefined → null. Assert on the rendered `aria-label`/`role="img"` node.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement.** Add `RosterShiftSummary` + `rosterShift?` to `showDisplay.ts`. Extend `DataQualityBadge`: `const rosterTotal = rosterShift?.total ?? 0; const gapTotal = dataGaps?.total ?? 0; if (gapTotal===0 && rosterTotal===0) return null;` build a combined label (roster segment from `rosterShift`, then the existing gap breakdown), keep the `TriangleAlert` glyph. Thread `rosterShift={row.rosterShift}` at `ShowsTable.tsx:471`. (`ArchivedShowRow` shows archived shows — roster-shift is published-only, so pass nothing there; badge behaves as today.)

- [ ] **Step 4: Update the pinned transition audit (R1-F5).** `tests/components/admin/dataGapsTransitionAudit.test.tsx:147` matches the badge source against `/if \(!dataGaps \|\| dataGaps\.total === 0\) return null;/` and documents it as INSTANT. Update the regex to the new combined early-return (`/if \(gapTotal === 0 && rosterTotal === 0\) return null;/` or the exact form implemented) and the audit-table comment (add the roster-shift input; it remains an INSTANT early-return — no `AnimatePresence`, no animated mount). Run `pnpm vitest run tests/components/admin/dataGapsTransitionAudit.test.tsx` → PASS. (Satisfies spec §12 transition inventory: the new conditional is instant.)

- [ ] **Step 5: Run, verify pass** (badge test + transition audit).

- [ ] **Step 6: Commit** `feat(admin): fold roster-shift into DataQualityBadge (amber until dispositioned)`.

---

### Task 8: Dashboard wiring (fetch + thread + render)

**Files:**
- Modify: `components/admin/Dashboard.tsx`
- Modify test: `tests/components/admin/Dashboard.test.tsx` (or `tests/admin/fetchDashboardData.test.ts`)

**Interfaces:**
- Consumes: `loadRecentAutoApplied` (Task 3), `RecentAutoAppliedStrip` (Task 6), the three actions (Task 4).

- [ ] **Step 1: Write failing test.** Assert `fetchDashboardData` runs `loadRecentAutoApplied` in the concurrent block and (a) maps `rosterShiftByShow[show.id]` onto each `ActiveShowRow.rosterShift` (a show with roster counts gets the summary; one without gets `undefined`); (b) passes the loader result to a rendered `<RecentAutoAppliedStrip>`. Self-derive expected from the mock loader output (no hardcoded values).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement.** The loader needs `publishedShowIds` (R1-F1), which come from the active show rows — so it runs AFTER `showsRows` resolves (not blindly in the `:398` cookie-client `Promise.all`). Compute `publishedShowIds = showsRows.filter(published).map(r=>r.id)`, then `const recentAutoApplied = await loadRecentAutoApplied({ publishedShowIds })` — **no `supabase` arg** (the loader self-creates a service-role client, R2-F1; the dashboard's cookie client can't read `show_change_log`). Set `rosterShift: recentAutoApplied.kind==='ok' ? recentAutoApplied.rosterShiftByShow[r.id] : undefined` in the rows `.map` (`:430`/`:454`); render `<RecentAutoAppliedStrip data={recentAutoApplied} actions={{acceptChangeAction, acceptAllAction, undoFromDashboardAction}} />` as a sibling after `<NeedsAttentionInbox>` (`:690`). Infra-error result → strip renders its bounded error; dashboard otherwise unaffected.

- [ ] **Step 4: Run, verify pass.** Also run the full admin suite: `pnpm vitest run tests/admin tests/components/admin` → green.

- [ ] **Step 5: Commit** `feat(admin): wire auto-applied strip + roster badge into dashboard`.

---

### Task 9: Close-out gates (impeccable dual-gate + full suite + typecheck/lint/format)

**Files:** none new (verification + any fix commits).

- [ ] **Step 1: Full suite + static gates.** `pnpm vitest run` (full — scoped gates miss cross-file regressions), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Fix reds; re-run. (Memory: `--no-verify` skipped the prettier hook — `format:check` catches it; canonical-Tailwind eslint; `next build`-level TS.)
- [ ] **Step 2: impeccable v3 dual-gate (invariant 8).** Run `/impeccable critique` AND `/impeccable audit` on the UI diff (`DataQualityBadge`, `RecentAutoAppliedStrip`, `AcceptChangeButton`, `Dashboard`, `ShowsTable`). HIGH/CRITICAL findings fixed, or deferred via a `DEFERRED.md` entry. Record findings + dispositions.
- [ ] **Step 3: Playwright real-browser check (badge + strip actions).** Verify the amber badge renders for a show with un-dispositioned roster rows and clears after Accept-all; verify Undo hidden on field/email rows. (No fixed-dimension parent → no `getBoundingClientRect` parity task per spec §12.)
- [ ] **Step 4: Commit** any fixes (`fix(admin): …`); then proceed to Stage 4 whole-diff Codex review.

---

## Self-Review (run after drafting — checklist, not a subagent)

1. **Spec coverage:** §5.1 backfill→T1; §5.3 acknowledge_changes→T1; §5.4 roster_shift_counts→T1; §6.1 loader→T3; §6.2 strip actions→T4/T6; §6.4/§6.5 badge→T7; §7.1 helper→T2; §7.2 actions→T4; §8 files→all; §12 tests→per-task; §13 meta-tests→T2/T3/T4; invariant-8 gate→T9. AC-1..AC-11 each map to a task test. ✅
2. **Placeholder scan:** `<ts>` migration timestamp is the only stub (resolved at creation). No TBD/TODO.
3. **Type consistency:** `RosterShiftSummary` single-defined in `showDisplay.ts`, imported everywhere; `acknowledgeChanges(showId, ids)` 2-arg everywhere; `RecentAutoApplied`/`AutoAppliedGroup` names consistent T3→T6→T8; `STRIP_RENDER_CAP` from the loader module.
4. **Anti-tautology:** T3 derives counts from fixtures + scopes exclusions per-row; T6 clones/scopes DOM to avoid sibling Undo match; T7 asserts on the badge node's aria-label; T8 self-derives from mock loader output.
