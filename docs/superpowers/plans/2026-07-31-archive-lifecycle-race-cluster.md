# Plan — archive/lifecycle race cluster

**Spec:** `docs/superpowers/specs/2026-07-31-archive-lifecycle-race-cluster-design.md` (canonical; §-refs below are to it) · **Branch:** `fix/archive-lifecycle-race-cluster` · **Mode:** autonomous ship (owner-ratified; spec §1.1) · TDD per task, commit per task (invariants 1, 6).

## Meta-test inventory (mandatory declaration)

- **EXTENDS:** `tests/log/adminOutcomeBehavior.test.ts` (no-op-branch zero-emission cases, T4); `tests/db/unarchive_show_rpc.test.ts` (peers for the three migrated RPCs, T2); `tests/showLifecycle/callers.test.ts` (performed mapping, T3).
- **CREATES:** none. No new registry — `AUDITABLE_MUTATIONS` rows unchanged (spec §1.1 row 10); `tests/log/_metaMutationSurfaceObservability` discovery unaffected (same emit call sites, narrower guard).
- **UNCHANGED-BY-CONTRACT:** `tests/auth/advisoryLockRpcDeadlock.test.ts` — acceptance criterion §9.2 requires it green WITHOUT modification.

## Advisory-lock topology (mandatory: plan touches `pg_advisory*` code text)

Every migrated RPC keeps its existing single in-RPC holder (`pg_advisory_xact_lock(hashtext('show:' || v_drive))` inside `archive_show` / `publish_show` / `unpublish_show`); JS callers hold nothing (`archiveShow.ts` doc comment: "The RPC self-locks; do NOT wrap in withShowLock"). The migration re-emits identical lock lines; no layer added or moved. Holder enumeration per hashkey `show:<drive_file_id>`: exactly one (in-RPC), before and after.

## Tasks

### T1 — migration: performed discriminator (spec §3)

A new migration file `<timestamp>_lifecycle_rpc_performed_discriminator` under supabase/migrations.

TDD: write T2's failing DB tests FIRST (they assert boolean returns; red against void RPCs), then the migration, then green.

1. `drop function if exists public.archive_show(uuid);` + recreate `returns boolean` — body = `20260601000000_b2_show_lifecycle.sql` archive_show verbatim except `if v_archived then return false; end if;` and trailing `return true;` after `perform public._archive_show_core(p_show_id);`. Re-revoke all / re-grant execute to `authenticated`.
2. `drop function if exists public._publish_show_core(uuid);` + recreate `returns boolean` — body = `20260716210000_role_mappings_publish_freshness.sql` core verbatim (INCLUDING the role-mappings freshness gate + consumed-token stamp) except `if v_pub then return false; end if;` and trailing `return true;`. Revoke-all, NO grant (current posture).
3. `drop function if exists public.publish_show(uuid);` + recreate `returns boolean` — outer body verbatim from `20260601000000` except final line `return public._publish_show_core(p_show_id);`. Re-revoke/re-grant.
4. `drop function if exists public.unpublish_show(uuid);` + recreate `returns boolean` — body verbatim from `20260701000000_published_toggle_unpublish_show.sql` except `if not v_published then return false; end if;` and trailing `return true;` after `perform public._unpublish_show_core(p_show_id);`. Re-revoke/re-grant.
5. `notify pgrst, 'reload schema';`
6. **Whole file wrapped in one explicit `begin;` … `commit;`** (spec §3 R1-finding-1 bullet; precedent `20260619000001_lockdown_shows_internal.sql`) — recreate+revoke atomic on both the migration-runner path and the autocommitting surgical `psql -f` path; closes the default-EXECUTE grant window on the gate-free `_publish_show_core`.
7. Apply-twice idempotency: file re-runs clean (DROP IF EXISTS guards; asserted by applying twice locally in the task's verification step).
8. `pnpm gen:schema-manifest` regen + commit manifest in the same commit.

`unarchive_show`: untouched (spec §1.1 row 8).

Commit: `feat(db): lifecycle RPCs return performed discriminator (archive/publish/unpublish)`

### T2 — DB discriminator tests (spec §6.1)

Extend/add alongside `tests/db/unarchive_show_rpc.test.ts` (same harness/idioms — postgres.js against local DB, loopback-guarded). Per RPC (archive, publish, unpublish; unarchive already covered by the existing file):

- performed path: seed eligible show → RPC returns `true` → row state flipped.
- repeat call: returns `false`, row unchanged, AND no-op side-effect probe — for archive: `show_share_tokens.rotated_at` unchanged by the second call (failure mode: recreate dropped the early-return; core would rotate twice).
- refusal paths unchanged: e.g. publish on archived → `SHOW_ARCHIVED_IMMUTABLE` raise (failure mode: recreate lost a gate).

Failure modes stated per test in-file. Commit: `test(db): performed/no-op discriminator coverage for lifecycle RPCs`

### T3 — type + caller mapping (spec §4)

TDD: extend `tests/showLifecycle/callers.test.ts` first — injected rpc `{data:true}` → `performed:true`; `{data:false}` / `{data:null}` / `{data:undefined}` → `performed:false`; thrown → `{ok:false, code:"infra_error"}`. Red (field absent), then:

- `lib/showLifecycle/_shared.ts`: `LifecycleResult = { ok: true; performed: boolean } | { ok: false; code: string }`; `mapRpcResult(error, data)` gains the data param → `{ ok: true, performed: data === true }`; `callLifecycleRpc` passes `data` through (single chokepoint — the ONLY `{ok:true}` producer, verified `rg "ok: true" lib/showLifecycle` → `lib/showLifecycle/_shared.ts:4` and line 40 only).
- Callers (`archiveShow.ts`, `publishShow.ts`, `unpublishShow.ts`, `unarchiveShow.ts`) need no per-file mapping change (chokepoint produces the field); `unarchiveShow`'s `data === true` catch-up gate untouched.
- `pnpm typecheck` sweeps the 13 enumerated `LifecycleResult`-referencing files (consumers read `.ok`/`.code`; required-field addition compiles clean or surfaces each site).
- Mock-literal sweep (spec §6.5 disposition): add `performed` to `{ok: true}` lifecycle mocks in `tests/app/admin/set-published-action.test.ts`, `tests/app/admin/show-lifecycle-actions.test.ts`, `tests/components/admin/per-show-lifecycle.test.tsx:73-75` (plus the two suites already in T2/T4 scope).

Commit: `feat(showLifecycle): LifecycleResult carries performed discriminator`

### T4 — action emission gating (spec §4)

TDD: extend `tests/log/adminOutcomeBehavior.test.ts` first — per action (archive / unarchive / setPublished×2 directions): no-op branch (`{ok:true, performed:false}` via injected deps) → sink-spy records ZERO codes while revalidate spy observed; performed branch → exactly one code (existing cases updated to construct `performed:true`). Red, then:

- `app/admin/show/[slug]/_actions/archive.ts`, `app/admin/show/[slug]/_actions/unarchive.ts`, `app/admin/show/[slug]/_actions/setPublished.ts`: wrap `await logAdminOutcome(...)` in `if (result.performed)` (archive/setPublished) / gate on `result.ok && result.performed` (unarchive's void flow). Revalidates stay on `ok` (spec §1.1 row 4).
- Comment repairs: the three "never on a ... no-op" claims become accurate; update wording.

Commit: `fix(admin): lifecycle telemetry emits only on performed transitions`

### T5 — ShareHub layout-effect close (spec §5)

TDD ordering: T6's e2e paint-sampler case is the failing test (red against `useEffect` — sampler catches the painted frame; measured 6ms in probe Cases A/D). Then: `components/admin/showpage/ShareHub.tsx` §4 lifecycle-close effect `useEffect` → `useLayoutEffect` (import + call site; body byte-identical; keep the existing `eslint-disable-next-line react-hooks/set-state-in-effect` if the rule fires on the new primitive). Transition-audit note: spec §5 Transition Inventory delta embedded in the e2e case comment.

Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) runs on this diff at close-out (invariant 8), findings dispositioned in the PR body / DEFERRED.md.

Commit: `fix(admin): close ShareHub pre-paint on lifecycle flip (kills 6ms enabled-replacement frame)`

### T6 — restored e2e case (spec §6.4)

In `tests/e2e/admin-lifecycle-transitions.spec.ts` (mobile-safari project; already wired in `lifecycle-layout-e2e.yml` ~line 119):

- Replace the header's removal note (lines ~11-17, "It NO LONGER exercises the compound transition…") with the restoration rationale: realtime vector, backdrop-immune.
- New case, probe Case D productionized: tab B `signInAs(ADMIN_FIXTURE)` → open modal → open hub (existing `toPass` hydration idiom) → arm Archive; tab A archives the seeded Held show; assertions on tab B: (a) popover closes within timeout, (b) no armed-confirm remnant / no error banner, (c) rAF sampler (installed pre-archive via `page.evaluate`: `requestAnimationFrame` loop recording per-frame `{enabled unarchive-row present, popover open}`) recorded NO frame with both true.
- Harness readiness (mandatory checklist): server boot = existing workflow's dev server :3000 mechanism (no new boot); readiness gate = the spec-file's existing kebab-click `toPass` hydration proof + nav retry on `admin-layout-infra-error` (probe §2 environmental note); detach-safety = sampler runs in page context off `document.querySelector` (no Playwright locator that can auto-wait on unmounted nodes), stopped + drained via `page.evaluate` before assertions.
- Seed via `seedHeldShow` + `settleDashboardAdminState` (probe-proven necessity on a wizard-state shared DB); cleanup per existing afterAll idiom.
- Local verification: 3 consecutive green runs (acceptance §9.4).

Commit: `test(e2e): restore armed-Archive-during-concurrent-refresh coverage via realtime vector`

### T7 — validation apply + backlog dispositions (spec §3, §8)

1. Apply T1's migration to validation surgically (`psql "$TEST_DATABASE_URL" -f supabase/migrations/<file>.sql` then `notify pgrst, 'reload schema';`) — validation-schema-parity Layer 2.
2. `BACKLOG.md`: rewrite the three entries per spec §8 (SWAP-RACE refuted w/ Case A/B timelines; DEDUP resolved; ARMED-CONCURRENT-REFRESH resolved) and graduate all three to `BACKLOG-archive.md`.
3. Delete the untracked probe spec file from the worktree (recorded in spec Appendix A).

Commit: `docs: graduate archive race-cluster backlog items (probe-resolved)`

### T8 — close-out gates

Full suite + `pnpm typecheck` (vitest AND playwright configs) + `pnpm lint` + `pnpm format:check` locally; impeccable dual-gate on T5 diff; whole-diff Codex cross-model review (fresh-eyes brief, split-scope if needed per AGENTS.md); push; real CI green (all twelve required contexts); `gh pr merge --merge`; ff-sync main checkout, verify `0  0`; Stage 4.4 cron delete + pane clear.

## Checklist

- [ ] T1 migration + manifest
- [ ] T2 DB tests
- [ ] T3 type/caller mapping
- [ ] T4 emission gating
- [ ] T5 ShareHub layout-effect
- [ ] T6 e2e restoration ×3 green
- [ ] T7 validation apply + backlog
- [ ] Self-review (this doc, pre-draft verification transcript below)
- [ ] Adversarial review (cross-model) — plan
- [ ] T8 close-out (impeccable → whole-diff review → CI → merge)

## Pre-draft verification transcript (writing-plans mandate)

- `rg "ok: true" lib/showLifecycle app/admin/show` → LifecycleResult producers: `_shared.ts:4` (type), `_shared.ts:40` (mapRpcResult) ONLY; other `ok: true` hits are unrelated result shapes (`useRaw.ts`, `roleToken.ts`, `ResetPickerEpochButton.tsx`, `RotateShareTokenButton.tsx` — distinct types, not LifecycleResult).
- `rg -ln "LifecycleResult"` → 13 files (listed in session log; all consumers read `.ok`/`.code` only).
- Latest RPC definitions confirmed per spec §3 table (`grep -l "create or replace function public.<fn>(" supabase/migrations/*.sql | sort | tail`).
- `lifecycle-layout-e2e.yml:119` runs `admin-lifecycle-transitions.spec.ts` on mobile-safari.
- `tests/db/unarchive_show_rpc.test.ts` exists (harness template for T2).
- `settleDashboardAdminState` exported from `tests/e2e/helpers/dashboardState.ts:36`.
- Snippet typecheck: no snippets pasted verbatim in this plan (task bodies reference spec §6 shapes); T2/T3/T4 test code is written red-first in-repo where `pnpm typecheck` gates it (strict tsconfig incl. `exactOptionalPropertyTypes`).
