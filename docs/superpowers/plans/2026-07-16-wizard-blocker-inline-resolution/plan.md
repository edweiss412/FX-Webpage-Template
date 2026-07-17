# Wizard blocker in-wizard resolution + badge fidelity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the three dead-end `cas_per_row` publish blockers (`SHOW_ARCHIVED_IMMUTABLE`, `STAGED_REVIEW_ITEMS_CORRUPT`, `STAGED_PARSE_RESULT_CORRUPT`) an in-wizard resolution via a new `BlockedRowResolver` + `POST /api/admin/onboarding/resolve-blocker`, and fix `deriveStep3DisplayState` so an existing archived/held show never renders the `"ready"` badge.

**Architecture:** One new DB table (`onboarding_rebuild_attempts`, cap counter), one new lock-free gate-free SECURITY DEFINER helper (`_unarchive_show_apply`, refactoring `unarchive_show` to delegate), one new optional in-txn hook on `applyRescanDecisionUnderLock` (`onShadowDeleted`), one new admin route (`resolve-blocker`) that reuses the finalize inline-auto-heal locking pattern (route holds the per-show lock once, calls the lock-free core directly — never `rescanWizardSheet`, which self-locks), one new client component (`BlockedRowResolver`, mirroring `RescanSheetButton`'s two-tap arm/confirm idiom) wired into both `FinalizeButton.tsx` and `RunFinalCASButton.tsx`, and a one-line broadening of Rule 6 in `lib/admin/step3DisplayState.ts`.

**Tech Stack:** Next.js 16 App Router route handlers, `postgres.js` privileged connection (not PostgREST), Supabase Postgres migrations, React 19 client components, Vitest + `@testing-library/react` (jsdom for component/unit tests; `psql`-driven structural meta-tests for DB-layer proofs).

**Spec:** `docs/superpowers/specs/2026-07-16-wizard-blocker-inline-resolution.md` (adversarially APPROVED, 6 rounds — do NOT redesign; this plan transcribes it into tasks).

---

## Pre-draft verification notes

Live-code grep pass against the worktree confirmed nearly every citation in the spec. Deltas found:

1. **`ApplyRescanDecisionDeps` (`lib/onboarding/applyRescanDecisionUnderLock.ts:56-58`)** currently has only `scanOnboardingPreparedFiles?`. Task 4 below adds `onShadowDeleted` as specified — confirmed no naming collision.
2. **Delete-site line numbers** are `:206` and `:259` (spec said `:205`/`:258` — off by one line each; harmless, both delete statements confirmed by content, not just line number).
3. **`messageFor()` no longer throws on unknown codes** (`lib/messages/lookup.ts:69-107`) — it returns an all-null fallback entry (`fallbackEntryFor`). The "throws" comment at `:66` refers to a *different*, unrelated function (`getRequiredDougFacing`). `BlockedRowResolver`'s local copy wrapper should mirror `FinalizeButton.tsx`'s existing `lookupDougFacing` helper (checks `code in MESSAGE_CATALOG` then calls `messageFor`), not assume a throw.
4. **`corruptionReason` enum has no existing source.** `parseShadowPayloadForApply` (`lib/onboarding/shadowPayload.ts`) only discriminates on 3 codes (`STAGED_PARSE_RESULT_CORRUPT` / `STAGED_REVIEW_ITEMS_CORRUPT` / `STAGED_PARSE_OUTDATED_AT_PHASE_D`) across 12 `refuse()` call sites — there is no existing 5-value enum, and the spec's own citation groups them into only two buckets ("`:140/148/160/167/171`" and "`:178/182/188-192/226/231-240`"), not five. Building the 5-value `corruptionReason` classifier by re-parsing the payload a second time in the route would duplicate `shadowPayload.ts`'s logic (DRY violation) and could drift from it. **Resolution (this plan, Task 5, new — not in the original 11-task skeleton):** extend `ParsedShadowPayloadForApply`'s `{ ok: false }` branch with a `reason: CorruptionReason` field computed by `refuse()` itself at each of its 12 call sites, so the SAME `parseShadowPayloadForApply` call the route's authz re-derivation already makes (spec §3.2 point 3) yields the reason — no second parser, no drift. Verified safe: only 3 call sites read the failure branch today (`finalize-cas/route.ts:401-402,894-895`, `applyRescanDecisionUnderLock.ts:128`), none destructure exhaustively, so adding a field is purely additive.
5. **`unarchive_show`'s current body** (`supabase/migrations/20260602000002_b2_r8_unarchive_returns_transition_flag.sql:16-42`) confirmed byte-exact against the spec's described transition: `is_admin()` gate (`:25`), `pg_advisory_xact_lock(hashtext('show:'||v_drive))` (`:30`), re-read-under-lock early-return-false idempotent no-op, else `archived=false, published=false, archived_at=null, requires_resync=true, picker_epoch+1, picker_epoch_bumped_at=clock_timestamp()`, share-token rotation, purge of non-wizard `pending_syncs`/`pending_ingestions`/`deferred_ingestions`, `return true`. `search_path = public, pg_temp` is declared inline in the function header (`:22`), not a separate line.
6. **A closer EXEC-lockdown precedent already exists**: `tests/db/b2-lifecycle-rpc-meta.test.ts:16-51` pins the exact "admin wrapper takes the in-RPC lock + is callable by `authenticated`; private lockless `_*_core` takes no lock + is revoked from `authenticated`/`anon`/`service_role`" shape for `archive_show`/`_archive_show_core` and `publish_show`/`_publish_show_core` via `psql` + `has_function_privilege`/`pg_get_functiondef` regex probes. This is the template Task 3's meta-test extends (not a new file), stronger fit than the abstract "create a meta-test" framing.
7. **The per-show advisory-lock acquisition idiom for a new `postgres.js`-based route** is a raw single-statement call inside `sql.begin(...)`: `tx.query("select pg_advisory_xact_lock(hashtext('show:' || $1))", [driveFileId])`, exactly as `finalize-cas/route.ts:149,576` and `finalize/route.ts:200` already do. `lib/sync/lockedShowTx.ts`'s `withShowLock` helper is a *different* idiom (`LockableSyncTx.queryOne`-based) used by simpler single-statement RPC wrappers elsewhere; the finalize-cas/finalize routes do NOT use it, so Task 6 follows their raw-statement idiom for consistency with the route it's patterned on.
8. **`RunFinalCASButton.tsx` has no `useFinalizeRun`** — it owns a local `handleClick` (`:68-100`) and local `State` union, unlike `FinalizeButton.tsx`'s `useFinalizeRun` hook (`:159-492`, which already exposes a reusable `runLoop` in its returned `run` object at `:480-492` — no new "reRun" method is needed, `run.runLoop()` is the reusable trigger the spec anticipates). Task 12 wires `onResolved` differently per host: `run.runLoop()` for `FinalizeButton`, `handleClick()` for `RunFinalCASButton`.
9. **PostgREST DML lockdown has a live class-wide registry** at `tests/db/postgrest-dml-lockdown.test.ts:147` (`RPC_GATED_TABLES`, 4-layer live-DB test: catalog-level REVOKE, PostgREST `authenticated` probe, PostgREST `anon` probe, registry-freshness scan). Task 2 registers `onboarding_rebuild_attempts` here rather than authoring a new bespoke meta-test file.
10. **`§4.2.2` archived test case is at `tests/admin/step3DisplayState.test.ts:77-87`** (`it("rule 4 R6: archived linked show is NOT Live", ...)`), confirming the spec's `:77-86` citation.
11. All other citations (finalize-cas `ShadowApplyResult` union `:76-98`, `databaseUrl()` `:109-116`, `requireAdminIdentity` import `:160-161`/use `:959`, `adoptShowLockHeld` `:427`, `readShowArchived_unlocked` `:435`; `lib/sync/lifecycleGuards.ts` `SHOW_ARCHIVED_IMMUTABLE`/`readShowArchived_unlocked` `:5,12`; `onboarding_scan_manifest` DDL `:336-358`; `shows_pending_changes` DDL `:433-443`; `recovery_drift_cooldowns` DDL `:447-453`; `wizard_finalize_checkpoints`/`app/admin/_finalizeCheckpoint.ts` shape `:21-25`; `logAdminOutcome.ts` `AdminOutcome` shape `:7-19`; `tests/log/_auditableMutations.ts` `AuditableMutation = {file,fn,code}` `:11`; `catalog.ts` `STAGED_REVIEW_ITEMS_CORRUPT`/`STAGED_PARSE_RESULT_CORRUPT` rows `:2121-2145`; `pending_syncs.last_finalize_failure_code` migration file) verified byte-accurate.
12. **`onboarding_rebuild_attempts` cleanup** is folded into Task 2 (not a separate task): `lib/onboarding/sessionLifecycle.ts` deletes `shows_pending_changes` at two call sites — the session-discard path (`:566-570`, `delete ... where wizard_session_id = $1::uuid and drive_file_id = any($2)`) and the per-drive reap loop (`:875-878`, same shape with `returning 1 as deleted`). A parallel `onboarding_rebuild_attempts` delete (session-scoped, not drive-id-scoped — a leftover attempts row gates nothing about lock-order correctness) is added immediately after each, satisfying spec §3.3's "add to whatever cleanup already removes `shows_pending_changes` for a session."

---

## Global Constraints

- **TDD per task** (AGENTS.md invariant 1): failing test → minimal implementation → passing test → commit. Never write implementation before its test.
- **Advisory-lock single-holder rule** (invariant 2): for `hashtext('show:' || driveFileId)`, `resolve-blocker` (both actions) is the SOLE lock holder — it calls only lock-free cores (`_unarchive_show_apply`, `applyRescanDecisionUnderLock`) directly, never `unarchive_show` (self-locks, `is_admin()`-gated — the route's owner connection has no JWT) or `rescanWizardSheet` (self-locks — would nest). See "Advisory-lock holder topology" below.
- **No raw §12.4 codes in UI** (invariant 5): every coded route status resolves to `messageFor(code).dougFacing` + `<HelpAffordance code={code} />`. No new §12.4 code is introduced (forensic codes are NOT §12.4 — `lib/log/logAdminOutcome.ts:5-6`).
- **Supabase call-boundary discipline** (invariant 9): the new route uses the privileged `postgres.js` connection (`databaseUrl()`), never a `{data,error}` PostgREST client; `logAdminOutcome`'s internal try/catch preserves fail-open telemetry.
- **Admin mutation instrumentation** (invariant 10): `resolve-blocker` is an admin-gated mutating route under `app/api/admin/` → BOTH mutating branches (`ONBOARDING_BLOCKER_UNARCHIVED`, `ONBOARDING_BLOCKER_REBUILT`) get `AUDITABLE_MUTATIONS` registry rows + executable success-branch sink-spy proofs in `tests/log/adminOutcomeBehavior.test.ts`; the escalation emit (`ONBOARDING_SHADOW_REBUILD_EXHAUSTED`) is on the already-instrumented `finalize-cas` route and gets its own row. `logAdminOutcome` calls are POST-COMMIT, outside the advisory-lock txn.
- **PostgREST DML/EXEC lockdown** (cross-cutting rule): `onboarding_rebuild_attempts` REVOKEs INSERT/UPDATE/DELETE from `public`/`anon`/`authenticated`; `_unarchive_show_apply` REVOKEs EXECUTE from `public`/`anon`/`authenticated`/`service_role` and grants to NO role.
- **Migration → validation-parity in the same change**: every migration task runs `pnpm gen:schema-manifest` + commits the regenerated manifest + applies surgically to the validation project (`psql "$TEST_DATABASE_URL" -f supabase/migrations/<file>.sql` then `notify pgrst, 'reload schema';`) in the SAME task/commit.
- **Commit per task**, conventional-commits style (`feat(admin): …`, `test(admin): …`, `fix(admin): …`).
- **UI work = Opus + impeccable dual-gate** (AGENTS.md hard rule + invariant 8): Tasks 11 and 12 touch `components/` → `/impeccable critique` AND `/impeccable audit` on the diff before cross-model review; P0/P1 findings fixed or logged in `DEFERRED.md`.
- **No em dashes in UI copy** (`DESIGN.md:321`).

## Meta-test inventory

- **Extends** `tests/auth/advisoryLockRpcDeadlock.test.ts` — Task 9 adds the `resolve-blocker` topology (both actions single-holder, no nesting).
- **Extends** `tests/log/_auditableMutations.ts` + `tests/log/adminOutcomeBehavior.test.ts` + `tests/log/_metaMutationSurfaceObservability.test.ts` — Tasks 7, 8, 10 add rows for `ONBOARDING_BLOCKER_UNARCHIVED`, `ONBOARDING_BLOCKER_REBUILT`, `ONBOARDING_SHADOW_REBUILD_EXHAUSTED`.
- **Extends** `tests/admin/step3DisplayState.test.ts` — Task 1 adds the §4.2.2 matrix rows.
- **Extends** `tests/db/postgrest-dml-lockdown.test.ts` (`RPC_GATED_TABLES`) — Task 2 registers `onboarding_rebuild_attempts`.
- **Extends** `tests/db/b2-lifecycle-rpc-meta.test.ts` — Task 3 adds the `unarchive_show`/`_unarchive_show_apply` wrapper-lock/core-lockless/EXEC-revoked-from-all/`proconfig` proof, following its `archive_show`/`_archive_show_core` precedent exactly.
- **Creates** an outcome-enumeration test (structural defense, Task 8) driving all seven `RescanDecisionOutcome`s and asserting `onboarding_rebuild_attempts.attempts` incremented iff the corrupt shadow was deleted — lives in a new `tests/api/admin/onboarding/resolveBlockerRebuild.db.test.ts` (reuses the fake-tx harness pattern from `tests/onboarding/applyRescanDecisionUnderLock.test.ts:99-126`).
- **N/A**: no new §12.4 code → no `_metaAdminAlertCatalog`/catalog-parity touch; no email boundary → no `no-inline-email-normalization` touch.

## Advisory-lock holder topology

Hashkey: `hashtext('show:' || driveFileId)`.

| Path | Holder | Nesting |
| --- | --- | --- |
| Dashboard unarchive | `unarchive_show` RPC self-locks (`20260602000002_...:30`) | none — calls lock-free `_unarchive_show_apply` |
| `resolve-blocker / unarchive` | route acquires the lock ONCE (raw `pg_advisory_xact_lock` statement inside `sql.begin`), calls lock-free `_unarchive_show_apply` directly | none — `unarchive_show` RPC and its self-lock are NOT on this path |
| `resolve-blocker / rebuild` | route acquires the lock ONCE, calls lock-free `applyRescanDecisionUnderLock` directly (finalize inline-auto-heal pattern, `finalize/route.ts:810-864`) | none — `rescanWizardSheet` (self-locks) is NOT reused |
| finalize inline auto-heal | route holds the lock via `holdPort()`, calls lock-free `applyRescanDecisionUnderLock` | none (existing, unchanged) |
| finalize-cas | `adoptShowLockHeld` (`route.ts:427`) | none (existing, unchanged) |

The finalize batch that follows a resolve (auto-retry, Task 12) is a **separate HTTP request → separate txn** — never nested with the resolve-blocker txn. Pinned by Task 9.

---

## Task 1 — WS2 badge fix: broaden Rule 6, drop the `sessionLinked` guard

**Files:**
- Modify: `lib/admin/step3DisplayState.ts:68-70` (Rule 6)
- Modify: `tests/admin/step3DisplayState.test.ts` (extend the matrix; existing archived case `:77-87`)
- Modify: `docs/superpowers/specs/step3-onboarding/2026-07-05-step3-review-consolidation.md` §4.2 (`:102`) and §4.2.2 (`:106`, matrix `:134`)

**Interfaces:** `deriveStep3DisplayState(input: DisplayDerivationInput): Step3DisplayState` — no signature change, only the Rule 6 body.

- [ ] Write failing tests in `tests/admin/step3DisplayState.test.ts` (append after the existing `it("rule 6: session-linked published=false + no intent → Held", ...)` block, using the file's existing `base` fixture at `:6-13`):
  ```ts
  it("rule 6 broadened: existing archived show (sessionLinked:false) → Held (the reported hole)", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: false, archived: true },
        sessionLinked: false,
        publishIntent: false,
      }),
    ).toBe("held");
  });

  it("rule 6 broadened: existing HELD show with a corrupt-shadow blocker (not archived) → Held, not Ready", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: false, archived: false },
        sessionLinked: false,
        publishIntent: false,
      }),
    ).toBe("held");
  });

  it("rule 6 broadened: publishIntent does NOT resurrect Ready for an existing show", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: false, archived: false },
        sessionLinked: false,
        publishIntent: true,
      }),
    ).toBe("held");
  });

  it("rule 4 unchanged: existing published show (sessionLinked:false) stays Live", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: true, archived: false },
        sessionLinked: false,
      }),
    ).toBe("live");
  });

  it("rule 7 guard: no linked show still falls through to Ready (broadened Rule 6 did not swallow Rule 7)", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: null,
        sessionLinked: false,
      }),
    ).toBe("ready");
  });
  ```
  Anti-tautology: each case derives its expected state from the rule definitions in §4.2 (not hardcoded against current behavior) — the pre-fix code returns `"ready"` for the first three, so these tests fail red against the CURRENT Rule 6 body.
- [ ] Run: `pnpm vitest run tests/admin/step3DisplayState.test.ts` — expect 3 new failures (`"ready"` received, `"held"` expected) for the first three new cases; the `live`/`ready` regression cases pass immediately (pre-existing behavior).
- [ ] Minimal implementation — replace Rule 6 in `lib/admin/step3DisplayState.ts:68-70`:
  ```ts
  // 6. Held: any linked show that is neither crew-visible-live (Rule 4) nor a
  //    session-created ready-to-publish (Rule 5) is Held, regardless of
  //    provenance (session-linked OR existing-show branch). Was
  //    `input.sessionLinked && input.linkedShow` — that guard let an existing
  //    archived/held-with-blocker show fall through to Rule 7 "ready", a green
  //    badge on a publish-blocked show (spec 2026-07-16-wizard-blocker-inline-
  //    resolution §4.1). Only `linkedShow===null` now reaches Rule 7.
  if (input.linkedShow) return "held";
  ```
- [ ] Run: `pnpm vitest run tests/admin/step3DisplayState.test.ts` — all cases green, including every pre-existing case in the file (full-file run, not just new cases).
- [ ] Amend `docs/superpowers/specs/step3-onboarding/2026-07-05-step3-review-consolidation.md`: in §4.2's rule list, restate Rule 6 as "any `linkedShow` not already resolved by Rule 4 (live) or Rule 5 (session-created ready-to-publish), provenance-agnostic" and note the `sessionLinked` guard now belongs to Rule 5 only. In §4.2.2's matrix, add rows for `sessionLinked:false` archived and held-existing → `held`.
- [ ] Commit: `fix(admin): broaden step3 Rule 6 to any linked show, closing the archived/held existing-show ready-badge hole`

## Task 2 — Migration: `onboarding_rebuild_attempts` + DML lockdown + session cleanup

**Files:**
- Create: `supabase/migrations/20260717000000_onboarding_rebuild_attempts.sql`
- Modify: `tests/db/postgrest-dml-lockdown.test.ts` (register in `RPC_GATED_TABLES`, `:147`)
- Modify: `lib/onboarding/sessionLifecycle.ts` (`:566-570`, `:875-878`)
- Modify: `tests/onboarding/sessionLifecycle.test.ts`
- Modify (generated): `supabase/__generated__/schema-manifest.json`

**Interfaces:** New table `public.onboarding_rebuild_attempts (wizard_session_id uuid, drive_file_id text, attempts int not null default 0 check (attempts >= 0), escalation_logged boolean not null default false, updated_at timestamptz not null default now(), primary key (wizard_session_id, drive_file_id))`.

- [ ] Write failing test — extend `RPC_GATED_TABLES` in `tests/db/postgrest-dml-lockdown.test.ts` (after the `show_share_tokens` entry, `:186-194`):
  ```ts
  {
    table: "onboarding_rebuild_attempts",
    closed_at: "supabase/migrations/20260717000000_onboarding_rebuild_attempts.sql",
    selectAnon: false,
    selectAuthenticated: false,
    postBody: {
      wizard_session_id: "00000000-0000-0000-0000-000000000000",
      drive_file_id: "lockdown-test",
    },
    rowFilter: "?wizard_session_id=eq.00000000-0000-0000-0000-000000000000",
  },
  ```
  This asserts (Layer 1, 2, 3 of the existing file) the table doesn't exist yet — a fresh `RPC_GATED_TABLES` entry against a nonexistent table fails Layer 1's `has_table_privilege` catalog probe with a Postgres "relation does not exist" error.
- [ ] Run: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` — expect a hard failure ("relation \"onboarding_rebuild_attempts\" does not exist").
- [ ] Minimal implementation — `supabase/migrations/20260717000000_onboarding_rebuild_attempts.sql`:
  ```sql
  -- Wizard blocker in-wizard resolution (2026-07-16 spec §3.3): cap counter for the
  -- STAGED_*_CORRUPT rebuild action. Composite PK mirrors the recovery_drift_cooldowns
  -- precedent (20260501001000_internal_and_admin.sql:447-453).
  create table if not exists public.onboarding_rebuild_attempts (
    wizard_session_id uuid not null,
    drive_file_id text not null,
    attempts int not null default 0 check (attempts >= 0),
    escalation_logged boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (wizard_session_id, drive_file_id)
  );

  -- PostgREST DML lockdown (AGENTS.md cross-cutting rule): writes flow ONLY through the
  -- resolve-blocker/finalize-cas routes' privileged postgres.js connection. Include PUBLIC
  -- per the class-wide default-ACL reason (tests/db/postgrest-dml-lockdown.test.ts).
  revoke insert, update, delete on public.onboarding_rebuild_attempts from public, anon, authenticated;
  revoke select on public.onboarding_rebuild_attempts from public, anon, authenticated;
  ```
- [ ] Run migration locally: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260717000000_onboarding_rebuild_attempts.sql`
- [ ] Run: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` — Layers 1-4 green.
- [ ] Write failing test — `tests/onboarding/sessionLifecycle.test.ts`: add a case asserting `purgeWizardRowsForSession`'s session-discard path and the per-drive reap loop each delete a seeded `onboarding_rebuild_attempts` row for the torn-down session (seed one row, run the existing discard/reap flow the file already exercises, assert `select count(*) from onboarding_rebuild_attempts where wizard_session_id = $1` returns 0). Follow the file's existing DB-test seeding/assert idiom for `shows_pending_changes` teardown (same file, sibling test).
- [ ] Run the new test — fails (table not cleaned).
- [ ] Minimal implementation — in `lib/onboarding/sessionLifecycle.ts`, immediately after each `shows_pending_changes` delete (`:566-570` session-discard path, `:875-878` per-drive reap loop), add:
  ```ts
  await tx.query(`delete from public.onboarding_rebuild_attempts where wizard_session_id = $1::uuid`, [
    sessionId,
  ]);
  ```
- [ ] Run: `pnpm vitest run tests/onboarding/sessionLifecycle.test.ts` — green.
- [ ] Regenerate manifest: `pnpm gen:schema-manifest` — commit the diff to `supabase/__generated__/schema-manifest.json`.
- [ ] Apply to validation: `psql "$VALIDATION_DATABASE_URL" -f supabase/migrations/20260717000000_onboarding_rebuild_attempts.sql` then `psql "$VALIDATION_DATABASE_URL" -c "notify pgrst, 'reload schema';"`.
- [ ] Commit: `feat(db): add onboarding_rebuild_attempts cap-counter table with DML lockdown + session cleanup`

## Task 3 — Migration: `_unarchive_show_apply` (lock-free, gate-free) + refactor `unarchive_show`

**Files:**
- Create: `supabase/migrations/20260717000001_unarchive_show_apply_gate_free.sql`
- Modify: `tests/db/b2-lifecycle-rpc-meta.test.ts` (extend, following `:16-51`)
- Create: `tests/db/unarchiveShowBehaviorPreserved.db.test.ts` (regression: pre/post refactor effect parity)
- Modify (generated): `supabase/__generated__/schema-manifest.json`

**Interfaces:** New `public._unarchive_show_apply(p_show_id uuid) returns boolean` — SECURITY DEFINER, `set search_path = public, pg_temp`, no lock, no `is_admin()` gate. Refactored `public.unarchive_show(p_show_id uuid) returns boolean` — same signature/grant/behavior, body now `is_admin()` gate + self-lock + `return public._unarchive_show_apply(p_show_id)`.

- [ ] Write failing test — extend `tests/db/b2-lifecycle-rpc-meta.test.ts` with a new `test()` mirroring `:18-51` exactly, for `unarchive_show`/`_unarchive_show_apply`:
  ```ts
  test("unarchive_show wrapper takes the in-RPC show lock; _unarchive_show_apply takes none, is revoked from all roles, and pins search_path", () => {
    const out = runPsql(`
      select
        (pg_get_functiondef('public.unarchive_show(uuid)'::regprocedure) ~ 'pg_advisory_xact_lock\\s*\\(\\s*hashtext\\s*\\(\\s*''show:''') || '|' ||
        has_function_privilege('authenticated', 'public.unarchive_show(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public.unarchive_show(uuid)', 'EXECUTE') || '|' ||
        (pg_get_functiondef('public._unarchive_show_apply(uuid)'::regprocedure) ~ 'pg_advisory_xact_lock') || '|' ||
        (pg_get_functiondef('public._unarchive_show_apply(uuid)'::regprocedure) ~ 'search_path TO ''public'', ''pg_temp''') || '|' ||
        has_function_privilege('authenticated', 'public._unarchive_show_apply(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('anon', 'public._unarchive_show_apply(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('service_role', 'public._unarchive_show_apply(uuid)', 'EXECUTE') || '|' ||
        has_function_privilege('public', 'public._unarchive_show_apply(uuid)', 'EXECUTE')
    `);
    expect(out).toBe(
      [
        "true", // unarchive_show takes the lock
        "true", // authenticated may call unarchive_show
        "false", // service_role may NOT call unarchive_show
        "false", // _unarchive_show_apply takes NO lock
        "true", // _unarchive_show_apply pins search_path=public,pg_temp
        "false", // authenticated may NOT call _unarchive_show_apply
        "false", // anon may NOT call _unarchive_show_apply
        "false", // service_role may NOT call _unarchive_show_apply
        "false", // PUBLIC may NOT call _unarchive_show_apply
      ].join("|"),
    );
  });
  ```
  Note: `pg_get_functiondef`'s rendering of an inline `set search_path = public, pg_temp` clause is `SET search_path TO 'public', 'pg_temp'` (verify literal output against the existing `archive_show` function via a local `psql -c "select pg_get_functiondef('public.archive_show(uuid)'::regprocedure)"` before finalizing the regex — the archive/publish cores already carry this clause per the same migration family).
- [ ] Run: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/db/b2-lifecycle-rpc-meta.test.ts` — fails (`_unarchive_show_apply` does not exist; `unarchive_show`'s body has no lock-free delegate).
- [ ] Write failing DB regression test — `tests/db/unarchiveShowBehaviorPreserved.db.test.ts`: seed an archived show (`archived=true, published=false`) + a `show_share_tokens` row, call `select public.unarchive_show($1)` as an admin-context connection (mirrors the file's existing admin-session fixture pattern used by sibling `*.db.test.ts` files, e.g. `tests/db/rotate_show_share_token.test.ts`), assert `archived=false, published=false, archived_at is null, requires_resync=true, picker_epoch` incremented by 1, `show_share_tokens.share_token` rotated, orphaned non-wizard `pending_syncs`/`pending_ingestions`/`deferred_ingestions` rows purged, return value `true`; a second call on the now-non-archived row returns `false` with NO further mutation (idempotent no-op).
- [ ] Run — fails only if the refactor introduces a behavior regression (expected green against the CURRENT unarchive_show; this test is the safety net for the refactor about to happen, so it should pass BEFORE the refactor too — run once now as a baseline, again after the refactor).
- [ ] Minimal implementation — `supabase/migrations/20260717000001_unarchive_show_apply_gate_free.sql`:
  ```sql
  -- Wizard blocker in-wizard resolution (2026-07-16 spec §3.2): the wizard resolve-blocker
  -- route's privileged postgres.js connection has no JWT, so is_admin() (which reads
  -- auth.jwt()) would return false if it called unarchive_show directly. Extract the
  -- archived->held transition into a lock-free, gate-free internal helper both the
  -- Dashboard RPC (self-locked, is_admin()-gated) and the wizard route (route-locked,
  -- HTTP-gated via requireAdminIdentity) can call by ownership, needing no grant.
  --
  -- Body is the EXACT transition SQL of unarchive_show (20260602000002_...:22-41) minus
  -- the advisory lock and the is_admin() gate.
  create or replace function public._unarchive_show_apply(p_show_id uuid)
  returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
  declare v_drive text; v_archived boolean;
  begin
    select drive_file_id into v_drive from public.shows where id = p_show_id;
    if v_drive is null then raise exception using errcode='P0002', message='ADMIN_LINK_SHOW_NOT_FOUND'; end if;
    select archived into v_archived from public.shows where id = p_show_id;
    if not v_archived then return false; end if;
    update public.shows
       set archived = false, published = false, archived_at = null, requires_resync = true,
           picker_epoch = picker_epoch + 1, picker_epoch_bumped_at = clock_timestamp()
     where id = p_show_id;
    update public.show_share_tokens
       set share_token = encode(extensions.gen_random_bytes(32),'hex'), rotated_at = clock_timestamp()
     where show_id = p_show_id;
    delete from public.pending_syncs       where drive_file_id = v_drive and wizard_session_id is null;
    delete from public.pending_ingestions  where drive_file_id = v_drive and wizard_session_id is null;
    delete from public.deferred_ingestions where drive_file_id = v_drive and wizard_session_id is null;
    return true;
  end $$;
  -- Grant to NO role (Codex R1 F1 + R4 F1): callable ONLY by ownership (unarchive_show's
  -- delegate call, and the wizard route's owner postgres.js connection). NOT even
  -- service_role — a service_role grant would re-expose the gate-free transition through
  -- any service-role PostgREST/RPC path, bypassing requireAdminIdentity + session-membership
  -- + archived-state + per-show-lock checks.
  revoke all on function public._unarchive_show_apply(uuid) from public, anon, authenticated, service_role;

  -- Refactor unarchive_show to delegate (behavior-preserving: same signature, gate, lock,
  -- grant, boolean contract). Return-type-preserving create-or-replace is fine here (the
  -- signature and return type are unchanged from 20260602000002).
  create or replace function public.unarchive_show(p_show_id uuid)
  returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
  declare v_drive text;
  begin
    if not public.is_admin() then
      raise exception using errcode='42501', message='forbidden', hint='unarchive_show is admin-only';
    end if;
    select drive_file_id into v_drive from public.shows where id = p_show_id;
    if v_drive is null then raise exception using errcode='P0002', message='ADMIN_LINK_SHOW_NOT_FOUND'; end if;
    perform pg_advisory_xact_lock(hashtext('show:' || v_drive));
    return public._unarchive_show_apply(p_show_id);
  end $$;
  revoke all on function public.unarchive_show(uuid) from public, anon, authenticated, service_role;
  grant execute on function public.unarchive_show(uuid) to authenticated;
  ```
- [ ] Run migration locally, then: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/db/b2-lifecycle-rpc-meta.test.ts tests/db/unarchiveShowBehaviorPreserved.db.test.ts` — both green.
- [ ] Regenerate manifest: `pnpm gen:schema-manifest` — commit diff.
- [ ] Apply to validation: `psql "$VALIDATION_DATABASE_URL" -f supabase/migrations/20260717000001_unarchive_show_apply_gate_free.sql` then `notify pgrst, 'reload schema';`.
- [ ] Commit: `feat(db): extract lock-free gate-free _unarchive_show_apply; unarchive_show delegates`

## Task 4 — `ApplyRescanDecisionDeps.onShadowDeleted` in-txn hook

**Files:**
- Modify: `lib/onboarding/applyRescanDecisionUnderLock.ts:56-58` (type), `:202-231` (`hard_failed` delete site), `:255-260` (main delete site)
- Modify: `tests/onboarding/applyRescanDecisionUnderLock.test.ts`

**Interfaces:**
```ts
export type ApplyRescanDecisionDeps = {
  scanOnboardingPreparedFiles?: typeof scanOnboardingPreparedFiles;
  /** In-txn callback invoked immediately after EACH shows_pending_changes delete (both the
   * hard_failed site and the main dirty/clean site) — never on shadow-RETAINING outcomes.
   * Passed the SAME `tx` the core is running on, so writes stay in the same commit/rollback
   * boundary as the delete they're co-located with. Optional; only cap-counted rebuilds pass it. */
  onShadowDeleted?: (tx: PostgresTransaction) => Promise<void>;
};
```

- [ ] Write failing test in `tests/onboarding/applyRescanDecisionUnderLock.test.ts` — extend the existing `makeTx`-based harness (`:99-126`): assert `onShadowDeleted` fires exactly once, called with the same `tx`, for a `hard_failed` outcome (mock `scanOnboardingPreparedFiles` to report `processed: [{ driveFileId: DRIVE, outcome: "hard_failed" }]`, matching the file's existing pattern) and for a `dirty_demoted`/`clean_restamped`/`clean_unchecked` outcome; assert it does NOT fire for `schema_missing`/`superseded`/`not_staged`:
  ```ts
  test("onShadowDeleted fires once, on tx, for hard_failed (shadow-deleting outcome)", async () => {
    const { tx } = makeTx({ /* ...prior row... */ });
    const onShadowDeleted = vi.fn(async (calledTx: PostgresTransaction) => {
      expect(calledTx).toBe(tx);
    });
    const hardFailedScan = (async () => ({
      outcome: "completed",
      processed: [{ driveFileId: DRIVE, outcome: "hard_failed" }],
    })) as never;
    await applyRescanDecisionUnderLock(
      tx,
      { wizardSessionId: WIZARD, driveFileId: DRIVE, pendingFolderId: FOLDER, prepared: preparedFor(PRIOR_PARSE), refreshedParse: PRIOR_PARSE, isBlockerHeal: true },
      { scanOnboardingPreparedFiles: hardFailedScan, onShadowDeleted },
    );
    expect(onShadowDeleted).toHaveBeenCalledTimes(1);
  });

  test("onShadowDeleted does NOT fire for schema_missing (shadow retained)", async () => {
    const { tx } = makeTx({ /* ...prior row... */ });
    const onShadowDeleted = vi.fn();
    const schemaMissingScan = (async () => ({ outcome: "schema_missing", code: "STAGED_PARSE_FAILED" })) as never;
    await applyRescanDecisionUnderLock(
      tx,
      { wizardSessionId: WIZARD, driveFileId: DRIVE, pendingFolderId: FOLDER, prepared: preparedFor(PRIOR_PARSE), refreshedParse: PRIOR_PARSE, isBlockerHeal: true },
      { scanOnboardingPreparedFiles: schemaMissingScan, onShadowDeleted },
    );
    expect(onShadowDeleted).not.toHaveBeenCalled();
  });
  ```
  Failure mode caught: a future refactor that moves the delete without moving the hook call, or that fires the hook on a retained-shadow path (would double-consume the rebuild cap on a non-destructive outcome).
- [ ] Run: `pnpm vitest run tests/onboarding/applyRescanDecisionUnderLock.test.ts` — new tests fail (`onShadowDeleted` never called; property doesn't exist on the type yet).
- [ ] Minimal implementation:
  ```ts
  export type ApplyRescanDecisionDeps = {
    scanOnboardingPreparedFiles?: typeof scanOnboardingPreparedFiles;
    onShadowDeleted?: (tx: PostgresTransaction) => Promise<void>;
  };
  ```
  At the `hard_failed` delete site (`:206-209`), immediately after the `tx.unsafe("delete from public.shows_pending_changes ...")` call:
  ```ts
  if (deps.onShadowDeleted) await deps.onShadowDeleted(tx);
  ```
  At the main delete site (`:259-262`), same one-line addition immediately after that `tx.unsafe(...)` call.
- [ ] Run: `pnpm vitest run tests/onboarding/applyRescanDecisionUnderLock.test.ts` — green, full file.
- [ ] Commit: `feat(onboarding): add ApplyRescanDecisionDeps.onShadowDeleted in-txn hook co-located with shadow deletes`

## Task 5 — Extend `parseShadowPayloadForApply` with `corruptionReason`

**Files:**
- Modify: `lib/onboarding/shadowPayload.ts:35-38` (types), `:67-69` (`refuse`), all 12 call sites (`:140,148,160,167,171,178,182,192,222,226,236,240`)
- Modify: `tests/onboarding/shadowPayload.test.ts` (or the file's existing test suite — confirm exact path with `find tests -iname "*shadowPayload*"` before editing)

**Interfaces:**
```ts
export type CorruptionReason =
  | "parse_result_absent"
  | "parse_result_shape_invalid"
  | "review_items_invalid"
  | "reviewer_choice_element_invalid"
  | "override_snapshot_malformed";

export type ParsedShadowPayloadForApply =
  | { ok: true; /* ...unchanged... */ }
  | { ok: false; code: ShadowPayloadRefusalCode; reason: CorruptionReason };
```

- [ ] Write failing tests (locate/extend the existing shadowPayload test file): for each of the 12 refuse call sites, construct a payload that trips exactly that branch and assert the returned `reason` matches the mapping below (grouping call sites that represent the same conceptual failure):
  | Call site(s) | Failure | `reason` |
  | --- | --- | --- |
  | `:140` (non-object/array/null payload) | payload itself malformed | `parse_result_shape_invalid` |
  | `:148` (`parse_result` absent/null) | field missing | `parse_result_absent` |
  | `:160` (`asParseResult` throws) | shape invalid | `parse_result_shape_invalid` |
  | `:167` (`staged_id` missing/empty) | shape invalid | `parse_result_shape_invalid` |
  | `:171` (`staged_modified_time` unparseable) | shape invalid | `parse_result_shape_invalid` |
  | `:178` (`triggered_review_items` key absent) | items invalid | `review_items_invalid` |
  | `:182` (`parseTriggeredReviewItems` fails) | items invalid | `review_items_invalid` |
  | `:192` (element fails `isStructurallyValidReviewItem`) | items invalid | `review_items_invalid` |
  | `:222` (`coerceJsonbArray` throws on `reviewer_choices`) | choices field malformed | `reviewer_choice_element_invalid` |
  | `:226` (element fails `isReviewerChoice`) | choice element invalid | `reviewer_choice_element_invalid` |
  | `:236` (`pull_sheet_override` malformed) | override malformed | `override_snapshot_malformed` |
  | `:240` (`pull_sheet_override_applied` malformed) | override malformed | `override_snapshot_malformed` |

  Example test:
  ```ts
  test("parse_result absent → reason parse_result_absent", () => {
    const result = parseShadowPayloadForApply({ staged_id: "s1", staged_modified_time: "2026-01-01T00:00:00Z", triggered_review_items: [], base_modified_time: null });
    expect(result).toMatchObject({ ok: false, code: "STAGED_PARSE_RESULT_CORRUPT", reason: "parse_result_absent" });
  });
  ```
  Anti-tautology: each fixture is built to trip ONE specific check (verified by first checking it does NOT trip an earlier check in the function's linear order), so the assertion proves the reason maps to the right branch, not just "some corrupt reason came back."
- [ ] Run the test file — new assertions fail (`reason` is `undefined`, property not yet on the type).
- [ ] Minimal implementation — widen `refuse()` to take a reason and update all 12 call sites:
  ```ts
  export type CorruptionReason =
    | "parse_result_absent"
    | "parse_result_shape_invalid"
    | "review_items_invalid"
    | "reviewer_choice_element_invalid"
    | "override_snapshot_malformed";

  function refuse(code: ShadowPayloadRefusalCode, reason: CorruptionReason): ParsedShadowPayloadForApply {
    return { ok: false, code, reason };
  }
  ```
  Update each call site with its mapped reason, e.g. `:140` → `refuse("STAGED_PARSE_RESULT_CORRUPT", "parse_result_shape_invalid")`; `:148` → `refuse("STAGED_PARSE_RESULT_CORRUPT", "parse_result_absent")`; `:178` → `refuse("STAGED_REVIEW_ITEMS_CORRUPT", "review_items_invalid")`; `:222` → `refuse("STAGED_PARSE_RESULT_CORRUPT", "reviewer_choice_element_invalid")` (NOTE: this call site's code stays `STAGED_PARSE_RESULT_CORRUPT` per the existing code contract at `:222` — only the new `reason` field distinguishes it from the shape-invalid bucket); etc. per the table above.
- [ ] Run: `pnpm vitest run <shadowPayload test file>` — green.
- [ ] Run the 3 existing consumers' test suites to confirm the additive field breaks nothing: `pnpm vitest run tests/api/admin/onboarding/finalizeCas` (or the file's actual location — confirm via `find tests -iname "*finalizeCas*"`) `tests/onboarding/applyRescanDecisionUnderLock.test.ts` — green, unchanged.
- [ ] Commit: `feat(onboarding): carry a low-cardinality corruptionReason on parseShadowPayloadForApply refusal`

## Task 6 — `resolve-blocker` route scaffold

**Files:**
- Create: `app/api/admin/onboarding/resolve-blocker/route.ts`
- Create: `tests/api/admin/onboarding/resolveBlocker.test.ts`

**Interfaces:**
```ts
export type ResolveBlockerRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: ResolveBlockerRouteTx) => Promise<R>) => Promise<R>; // mirrors FinalizeCasRouteTx shape
};
type ResolveBlockerResponse =
  | { ok: true; status: "resolved" }
  | { ok: false; status: "escalated"; code: string }
  | { ok: false; status: "needs_attention" | "busy"; code: string }
  | { ok: false; status: "superseded" | "no_active_session" | "not_found" | "not_currently_blocked" | "bad_request" | "wrong_action" };
```

- [ ] Write failing tests in `tests/api/admin/onboarding/resolveBlocker.test.ts` (pattern-matched to `tests/api/admin/onboarding/rescanSheet.test.ts` if present — locate via `find tests -iname "*rescanSheet*" -path "*api*"`):
  - malformed JSON body → `{ ok: false, status: "bad_request" }`, HTTP 200
  - missing `action`/`code`/`driveFileId`/`wizardSessionId` → `bad_request`
  - `wizardSessionId` not equal to `app_settings.pending_wizard_session_id` → `superseded`
  - `app_settings.pending_wizard_session_id` null → `no_active_session`
  - `driveFileId` resolves to no `shows` row → `not_found`
  - `action: "unarchive"` with `code !== SHOW_ARCHIVED_IMMUTABLE` → `wrong_action`, no mutation
  - `action: "rebuild"` with `code` not a `STAGED_*_CORRUPT` value → `wrong_action`, no mutation
  ```ts
  test("malformed JSON body returns typed bad_request at HTTP 200", async () => {
    const req = new Request("http://x/api/admin/onboarding/resolve-blocker", { method: "POST", body: "{not json" });
    const res = await handleResolveBlocker(req, { requireAdminIdentity: async () => ({ email: "admin@example.com" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, status: "bad_request" });
  });
  ```
- [ ] Run: `pnpm vitest run tests/api/admin/onboarding/resolveBlocker.test.ts` — fails (module doesn't exist).
- [ ] Minimal implementation — `app/api/admin/onboarding/resolve-blocker/route.ts`, scaffold ONLY the parse/guard branches (unarchive/rebuild transition logic is Tasks 7-8), following `rescan-sheet/route.ts`'s body-validation shape (`:52-89`) and `finalize-cas/route.ts`'s `databaseUrl()`/`postgresTxAdapter` shape (`:109-138`):
  ```ts
  import { NextResponse, after } from "next/server";
  import postgres from "postgres";
  import { requireAdminIdentity as realRequireAdminIdentity } from "@/lib/auth/requireAdmin";
  import { SHOW_ARCHIVED_IMMUTABLE, readShowArchived_unlocked } from "@/lib/sync/lifecycleGuards";
  import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
  import { prepareOnboardingFiles as defaultPrepareOnboardingFiles } from "@/lib/sync/runOnboardingScan";
  import { applyRescanDecisionUnderLock, applyRescanDecisionUnderLock as defaultApplyRescanDecisionUnderLock } from "@/lib/onboarding/applyRescanDecisionUnderLock";
  import { parseShadowPayloadForApply } from "@/lib/onboarding/shadowPayload";
  import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

  const REBUILDABLE_CODES = new Set(["STAGED_REVIEW_ITEMS_CORRUPT", "STAGED_PARSE_RESULT_CORRUPT"]);

  function databaseUrl(): string {
    const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (configured) return configured;
    if (process.env.NODE_ENV === "production") {
      throw new Error("resolve-blocker route requires DATABASE_URL in production");
    }
    return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  }

  export type ResolveBlockerRouteDeps = {
    requireAdminIdentity?: () => Promise<{ email: string }>;
    // Test seams (Task 8): force a specific RescanDecisionOutcome / inject a prepared file.
    prepareOnboardingFiles?: typeof defaultPrepareOnboardingFiles;
    applyRescanDecisionUnderLock?: typeof defaultApplyRescanDecisionUnderLock;
  };

  type Body = { wizardSessionId?: unknown; driveFileId?: unknown; code?: unknown; action?: unknown };

  export async function handleResolveBlocker(req: Request, deps?: ResolveBlockerRouteDeps): Promise<Response> {
    const requireAdminIdentity = deps?.requireAdminIdentity ?? realRequireAdminIdentity;
    const admin = await requireAdminIdentity();

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, status: "bad_request" });
    }
    const { wizardSessionId, driveFileId, code, action } = body;
    if (
      typeof wizardSessionId !== "string" || wizardSessionId.length === 0 ||
      typeof driveFileId !== "string" || driveFileId.length === 0 ||
      typeof code !== "string" || code.length === 0 ||
      (action !== "unarchive" && action !== "rebuild")
    ) {
      return NextResponse.json({ ok: false, status: "bad_request" });
    }
    if (action === "unarchive" && code !== SHOW_ARCHIVED_IMMUTABLE) {
      return NextResponse.json({ ok: false, status: "wrong_action" });
    }
    if (action === "rebuild" && !REBUILDABLE_CODES.has(code)) {
      return NextResponse.json({ ok: false, status: "wrong_action" });
    }

    const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
    try {
      // ── PRE-LOCK PHASE (spec §3.2: "Drive-fetch + prepareOnboardingFiles … pre-lock,
      // side-effect-free"). For rebuild ONLY: an advisory session read + the slow Drive
      // fetch + parse happen with NO advisory lock held (mirrors rescanWizardSheet.ts's
      // pre-lock Drive read — NEVER hold pg_advisory_xact_lock + an open txn across a
      // multi-second network round-trip). The authoritative session/authz re-checks run
      // again UNDER the lock below. Unarchive has no Drive step → skips this phase.
      let prepared: Awaited<ReturnType<typeof defaultPrepareOnboardingFiles>>[number] | undefined;
      let preFolderId: string | undefined;
      if (action === "rebuild") {
        const pre = await sql.begin(async (t) => {
          const rows = (await t.unsafe(
            `select pending_wizard_session_id, pending_folder_id from public.app_settings where id = 'default'`,
          )) as Array<{ pending_wizard_session_id: string | null; pending_folder_id: string | null }>;
          const sid = rows[0]?.pending_wizard_session_id ?? null;
          if (sid === null) return { early: { ok: false, status: "no_active_session" } as const };
          if (sid !== wizardSessionId) return { early: { ok: false, status: "superseded" } as const };
          return { folderId: rows[0]?.pending_folder_id ?? null };
        });
        if ("early" in pre) return NextResponse.json(pre.early);
        preFolderId = pre.folderId ?? undefined;
        if (!preFolderId) return NextResponse.json({ ok: false, status: "no_active_session" });
        // Drive fetch + parse — NO lock held (side-effect-free reads). Fail-closed on a
        // Drive error, and enforce the folder-scope guard (a sheet moved out of the pending
        // folder → not this session's gear), mirroring finalize inline (`finalize/route.ts:800`).
        let metadata;
        try {
          metadata = await fetchDriveFileMetadata(driveFileId);
        } catch {
          return NextResponse.json({ ok: false, status: "needs_attention", code: "DRIVE_FETCH_FAILED" });
        }
        if (!metadata.parents.includes(preFolderId)) {
          return NextResponse.json({ ok: false, status: "needs_attention", code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" });
        }
        const preparedFiles = await (deps?.prepareOnboardingFiles ?? defaultPrepareOnboardingFiles)(
          preFolderId,
          { listFolder: async () => [metadata] },
        );
        prepared = preparedFiles[0];
      }

      // ── LOCKED PHASE — authoritative session re-check (FOR UPDATE) + show lookup + the
      // single per-show advisory lock + the mutation. `prepared` (rebuild) was computed
      // pre-lock above and is passed in; the core is called lock-free under THIS lock.
      return await sql.begin(async (rawTx) => {
        const sessRows = (await rawTx.unsafe(
          `select pending_wizard_session_id from public.app_settings where id = 'default' for update`,
        )) as Array<{ pending_wizard_session_id: string | null }>;
        if (sessRows[0] === undefined || sessRows[0].pending_wizard_session_id === null) {
          return NextResponse.json({ ok: false, status: "no_active_session" });
        }
        if (sessRows[0].pending_wizard_session_id !== wizardSessionId) {
          return NextResponse.json({ ok: false, status: "superseded" });
        }
        const showRows = (await rawTx.unsafe(`select id from public.shows where drive_file_id = $1`, [
          driveFileId,
        ])) as Array<{ id: string }>;
        if (showRows.length === 0) {
          return NextResponse.json({ ok: false, status: "not_found" });
        }
        await rawTx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
        if (action === "unarchive") {
          return await resolveUnarchive(rawTx, { wizardSessionId, driveFileId, showId: showRows[0].id, admin });
        }
        return await resolveRebuild(rawTx, { wizardSessionId, driveFileId, code, admin, prepared, pendingFolderId: preFolderId!, deps });
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  export function POST(req: Request): Promise<Response> {
    return handleResolveBlocker(req);
  }
  ```
  `resolveUnarchive`/`resolveRebuild` are stubbed to `throw new Error("not implemented")` for this task — Tasks 7/8 fill them in (each task's own failing-test cycle covers the stub).
- [ ] Run: `pnpm vitest run tests/api/admin/onboarding/resolveBlocker.test.ts` — the guard-branch tests pass; any test reaching `resolveUnarchive`/`resolveRebuild` is deferred to Tasks 7/8 (mark `.todo` or omit until then).
- [ ] Commit: `feat(admin): scaffold POST /api/admin/onboarding/resolve-blocker with session/body guards`

## Task 7 — `action: "unarchive"`

**Files:**
- Modify: `app/api/admin/onboarding/resolve-blocker/route.ts` (`resolveUnarchive`)
- Modify: `tests/api/admin/onboarding/resolveBlocker.test.ts`
- Modify: `tests/log/_auditableMutations.ts` (add row)
- Modify: `tests/log/adminOutcomeBehavior.test.ts` (add sink-spy proof)

**Interfaces:** `resolveUnarchive(tx, { wizardSessionId, driveFileId, showId, admin }): Promise<Response>` — internal to the route module.

- [ ] Write failing tests in `tests/api/admin/onboarding/resolveBlocker.test.ts`:
  - unrelated archived show (no `onboarding_scan_manifest` row for `(wizardSessionId, driveFileId)`) → `not_currently_blocked`, `shows.archived` unchanged
  - already-unarchived show (manifest row exists, `readShowArchived_unlocked` false) → `not_currently_blocked`, no mutation
  - real archived+in-manifest show → `{ ok: true, status: "resolved" }`, `shows.archived` becomes `false`, `picker_epoch` incremented
  - idempotent no-op (same request replayed after a prior resolve committed) → still `{ ok: true, status: "resolved" }` (the `_unarchive_show_apply` `false` return still maps to `resolved` per spec §3.2 step 5)
  ```ts
  test("unarchive: unrelated archived show (not in session manifest) → not_currently_blocked, no mutation", async () => {
    // seed: app_settings.pending_wizard_session_id = WIZARD; an archived show NOT in
    // onboarding_scan_manifest for WIZARD
    const res = await handleResolveBlocker(reqFor({ wizardSessionId: WIZARD, driveFileId: UNRELATED_DRIVE, code: "SHOW_ARCHIVED_IMMUTABLE", action: "unarchive" }));
    expect(await res.json()).toEqual({ ok: false, status: "not_currently_blocked" });
    const row = await queryShow(UNRELATED_DRIVE);
    expect(row.archived).toBe(true); // unmutated
  });
  ```
  Failure mode caught: a forged/stale admin POST during any active wizard unarchiving an unrelated show (the exact hole Codex R2 F2 flagged).
- [ ] Run: `pnpm vitest run tests/api/admin/onboarding/resolveBlocker.test.ts` — new cases fail (stub throws).
- [ ] Minimal implementation:
  ```ts
  async function resolveUnarchive(
    tx: RawTx,
    { wizardSessionId, driveFileId, showId, admin }: { wizardSessionId: string; driveFileId: string; showId: string; admin: { email: string } },
  ): Promise<Response> {
    const manifestRows = (await tx.unsafe(
      `select 1 from public.onboarding_scan_manifest where wizard_session_id = $1::uuid and drive_file_id = $2`,
      [wizardSessionId, driveFileId],
    )) as unknown[];
    if (manifestRows.length === 0) {
      return NextResponse.json({ ok: false, status: "not_currently_blocked" });
    }
    const archived = await readShowArchived_unlocked({ unsafe: tx.unsafe.bind(tx) }, driveFileId);
    if (!archived) {
      return NextResponse.json({ ok: false, status: "not_currently_blocked" });
    }
    const applyRows = (await tx.unsafe(`select public._unarchive_show_apply($1) as transitioned`, [
      showId,
    ])) as Array<{ transitioned: boolean }>;
    const transitioned = applyRows[0]?.transitioned ?? false;
    after(async () => {
      await logAdminOutcome({
        code: "ONBOARDING_BLOCKER_UNARCHIVED",
        source: "api.admin.onboarding.resolveBlocker",
        actorEmail: admin.email,
        driveFileId,
        wizardSessionId,
        showId,
        result: transitioned ? "unarchived" : "noop",
      });
    });
    return NextResponse.json({ ok: true, status: "resolved" });
  }
  ```
  (`after` from `next/server`, matching `finalize-cas/route.ts:1`'s import; the post-commit emit rides `after()` the same way the file's existing streaming revalidation does — the lock txn commits when `sql.begin` returns, and `after()` schedules the emit post-response, which is after-commit since `sql.begin` already resolved.)
- [ ] Run: `pnpm vitest run tests/api/admin/onboarding/resolveBlocker.test.ts` — green.
- [ ] Add to `tests/log/_auditableMutations.ts`: `{ file: "app/api/admin/onboarding/resolve-blocker/route.ts", fn: "POST", code: "ONBOARDING_BLOCKER_UNARCHIVED" }`.
- [ ] Write failing sink-spy test in `tests/log/adminOutcomeBehavior.test.ts` (follow the file's existing per-surface pattern, `collectSurfaceUnits`/real-logger sink-spy, `:1-20`): assert `ONBOARDING_BLOCKER_UNARCHIVED` is emitted with `result: "unarchived"` only after a committed real transition, and NOT emitted on the `not_currently_blocked` branch.
- [ ] Run: `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts tests/log/_metaMutationSurfaceObservability.test.ts` — green (the discovery meta-test now sees the registered route + `fn: "POST"`).
- [ ] Commit: `feat(admin): resolve-blocker unarchive action with re-derived authz scoping + post-commit telemetry`

## Task 8 — `action: "rebuild"`

**Files:**
- Modify: `app/api/admin/onboarding/resolve-blocker/route.ts` (`resolveRebuild`)
- Create: `tests/api/admin/onboarding/resolveBlockerRebuild.db.test.ts` (seven-outcome enumeration + concurrency)
- Modify: `tests/log/_auditableMutations.ts`
- Modify: `tests/log/adminOutcomeBehavior.test.ts`

**Interfaces:** `resolveRebuild(tx, { wizardSessionId, driveFileId, code, admin }): Promise<Response>`.

- [ ] Write failing tests in `tests/api/admin/onboarding/resolveBlockerRebuild.db.test.ts` (real DB, using the `applyRescanDecisionUnderLock.test.ts` fake-restage-injection idiom is NOT sufficient here since this test must drive the route's Drive-fetch + `prepareOnboardingFiles` pre-lock step too — inject via the route's dep-injection seam analogous to `finalize/route.ts`'s `prepareOnboardingFiles` dep):
  - **not_currently_blocked cases:** rebuild requested for a sheet with no `shows_pending_changes` row → `not_currently_blocked`, no mutation; a sheet whose shadow parses clean (not `STAGED_*_CORRUPT`) → `not_currently_blocked`.
  - **Pre-restage cap gate:** seed `onboarding_rebuild_attempts.attempts = 1` (== CAP) for `(session, sheet)` → `{ ok: false, status: "escalated", code }`, NO restage attempted (assert the injected `prepareOnboardingFiles` dep was never called).
  - **Seven-outcome enumeration (structural defense):** drive each of `schema_missing`/`superseded`/`not_staged`/`hard_failed`/`dirty_demoted`/`clean_restamped`/`clean_unchecked` (via the injected `scanOnboardingPreparedFiles` seam threaded through to `applyRescanDecisionUnderLock`) and assert `onboarding_rebuild_attempts.attempts` increments iff the outcome is one of `hard_failed`/`dirty_demoted`/`clean_restamped`/`clean_unchecked`:
    ```ts
    const OUTCOMES: Array<{ outcome: RescanDecisionOutcome["kind"]; consumesCap: boolean }> = [
      { outcome: "schema_missing", consumesCap: false },
      { outcome: "superseded", consumesCap: false },
      { outcome: "not_staged", consumesCap: false },
      { outcome: "hard_failed", consumesCap: true },
      { outcome: "dirty_demoted", consumesCap: true },
      { outcome: "clean_restamped", consumesCap: true },
      { outcome: "clean_unchecked", consumesCap: true },
    ];
    for (const { outcome, consumesCap } of OUTCOMES) {
      test(`rebuild outcome ${outcome}: attempts increments iff shadow deleted (consumesCap=${consumesCap})`, async () => {
        // seed a corrupt shows_pending_changes row for (WIZARD, DRIVE); mock the scan seam to
        // report `outcome`; call the route's rebuild action
        const before = await readAttempts(WIZARD, DRIVE); // 0
        await handleResolveBlocker(reqFor({ wizardSessionId: WIZARD, driveFileId: DRIVE, code: "STAGED_REVIEW_ITEMS_CORRUPT", action: "rebuild" }), depsForcingOutcome(outcome));
        const after = await readAttempts(WIZARD, DRIVE);
        expect(after).toBe(consumesCap ? before + 1 : before);
      });
    }
    ```
    Failure mode caught: exactly the R5 F1 hole — `hard_failed` deletes-and-commits-and-returns-`needs_attention`, indistinguishable at the route from a shadow-retaining `needs_attention` (`schema_missing`) without this per-outcome enumeration.
  - **Concurrent double-submit:** two simultaneous rebuild POSTs for the same `(session, sheet)` → exactly one shadow-deleting rescan consumes one attempt; the other (blocked on the lock, then re-reading `attempts >= CAP`) returns `escalated`.
  - **Forensic reason survives a shadow-deleting `hard_failed`:** the authz-scoping re-derivation's `parseShadowPayloadForApply` call (Task 5) captures `corruptionReason` BEFORE the rescan; assert it's non-null even when the outcome is `hard_failed`.
- [ ] Run the new test file — fails (stub throws / table doesn't gate anything yet).
- [ ] Minimal implementation:
  ```ts
  async function resolveRebuild(
    tx: RawTx,
    {
      wizardSessionId, driveFileId, code, admin, prepared, pendingFolderId, deps = {},
    }: {
      wizardSessionId: string; driveFileId: string; code: string; admin: { email: string };
      // `prepared` + `pendingFolderId` were computed PRE-LOCK by handleResolveBlocker
      // (spec §3.2 "pre-lock, side-effect-free"); no Drive fetch happens under the lock.
      prepared: Awaited<ReturnType<typeof defaultPrepareOnboardingFiles>>[number] | undefined;
      pendingFolderId: string;
      deps?: { applyRescanDecisionUnderLock?: typeof defaultApplyRescanDecisionUnderLock };
    },
  ): Promise<Response> {
    // Authoritative authz re-derivation UNDER the lock (spec §3.2 point 3): the corrupt
    // shadow must still exist AND still parse as STAGED_*_CORRUPT right now.
    const shadowRows = (await tx.unsafe(
      `select payload from public.shows_pending_changes where wizard_session_id = $1::uuid and drive_file_id = $2`,
      [wizardSessionId, driveFileId],
    )) as Array<{ payload: unknown }>;
    if (shadowRows.length === 0) {
      return NextResponse.json({ ok: false, status: "not_currently_blocked" });
    }
    const parsed = parseShadowPayloadForApply(shadowRows[0].payload);
    if (parsed.ok) {
      return NextResponse.json({ ok: false, status: "not_currently_blocked" });
    }
    const corruptionReason = parsed.reason;

    const attemptRows = (await tx.unsafe(
      `select attempts from public.onboarding_rebuild_attempts where wizard_session_id = $1::uuid and drive_file_id = $2`,
      [wizardSessionId, driveFileId],
    )) as Array<{ attempts: number }>;
    const attempts = attemptRows[0]?.attempts ?? 0;
    const CAP = 1;
    if (attempts >= CAP) {
      return NextResponse.json({ ok: false, status: "escalated", code });
    }

    // `prepared` was fetched + parsed PRE-LOCK. A sheet that vanished / became a non-sheet
    // between the pre-lock fetch and here fails closed (never publishes stale gear).
    if (!prepared || prepared.kind !== "sheet") {
      return NextResponse.json({ ok: false, status: "needs_attention", code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" });
    }

    const runApply = deps.applyRescanDecisionUnderLock ?? applyRescanDecisionUnderLock;
    const rescanTx = { unsafe: (sql: string, params: unknown[] = []) => tx.unsafe(sql, params) };
    let shadowDeleted = false;
    const outcome = await runApply(
      rescanTx,
      { wizardSessionId, driveFileId, pendingFolderId, prepared, refreshedParse: prepared.parseResult, isBlockerHeal: true },
      {
        onShadowDeleted: async (t) => {
          shadowDeleted = true;
          await t.unsafe(
            `insert into public.onboarding_rebuild_attempts (wizard_session_id, drive_file_id, attempts)
               values ($1::uuid, $2, 1)
             on conflict (wizard_session_id, drive_file_id)
               do update set attempts = onboarding_rebuild_attempts.attempts + 1, updated_at = now()
               where onboarding_rebuild_attempts.attempts < $3`,
            [wizardSessionId, driveFileId, CAP],
          );
        },
      },
    );

    after(async () => {
      await logAdminOutcome({
        code: "ONBOARDING_BLOCKER_REBUILT",
        source: "api.admin.onboarding.resolveBlocker",
        actorEmail: admin.email,
        driveFileId,
        wizardSessionId,
        result: outcome.kind,
        extra: { corruptionReason, shadowDeleted },
      });
    });

    switch (outcome.kind) {
      case "dirty_demoted":
      case "clean_restamped":
      case "clean_unchecked":
        return NextResponse.json({ ok: true, status: "resolved" });
      case "superseded":
        return NextResponse.json({ ok: false, status: "superseded" });
      case "hard_failed":
      case "schema_missing":
      case "not_staged":
        return NextResponse.json({ ok: false, status: "needs_attention", code: outcome.code });
    }
  }
  ```
- [ ] Run: `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/api/admin/onboarding/resolveBlockerRebuild.db.test.ts` — all seven outcomes + cap gate + concurrency + reason-survival green.
- [ ] Add to `tests/log/_auditableMutations.ts`: `{ file: "app/api/admin/onboarding/resolve-blocker/route.ts", fn: "POST", code: "ONBOARDING_BLOCKER_REBUILT" }`.
- [ ] Write failing sink-spy test in `tests/log/adminOutcomeBehavior.test.ts`: `ONBOARDING_BLOCKER_REBUILT` emits on every committed rebuild-initiated rescan (all four shadow-deleting outcomes AND `schema_missing`/`superseded`/`not_staged` — spec §3.2 says the emit fires "on every committed rebuild-initiated rescan," not only cap-consuming ones); does NOT emit on the `escalated` gate-abort or `not_currently_blocked` branches (non-mutating).
- [ ] Run: `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts tests/log/_metaMutationSurfaceObservability.test.ts` — green.
- [ ] Commit: `feat(admin): resolve-blocker rebuild action, cap consumption co-located with shadow deletion (seven-outcome enumeration)`

## Task 9 — Advisory-lock topology pin

**Files:**
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts`

**Interfaces:** none (test-only).

- [ ] Write failing test extending `lockTakingRpcNames()`'s enumerated set (`:31-52`) and the file's assertion helpers: add `app/api/admin/onboarding/resolve-blocker/route.ts` to whatever JS-side single-holder registry the file maintains for route-level (not RPC-level) lock topology (grep the file for how `finalize-cas/route.ts` or `finalize/route.ts` are already registered as JS-side holders before writing this — the file's structure at `:1-60` is RPC-body-scanning; the JS-side route registry, if separate, is likely a sibling section further down — read the full file before editing). Assert: (a) `resolve-blocker`'s route body contains exactly one `pg_advisory_xact_lock` call textually; (b) it does NOT reference `rescanWizardSheet` or import `unarchive_show`-calling code; (c) `_unarchive_show_apply` and the direct `applyRescanDecisionUnderLock` call are the only mutation entry points reached after the lock.
- [ ] Run: `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` — fails (new route unregistered / assertion added against not-yet-verified source).
- [ ] Minimal implementation: register the route per the file's existing registration idiom (no production code changes — Tasks 6-8 already satisfy the invariant; this task only adds the structural pin).
- [ ] Run: `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` — green.
- [ ] Commit: `test(auth): pin resolve-blocker single-holder advisory-lock topology`

## Task 10 — `finalize-cas`: `rebuildExhausted` join + escalation telemetry

**Files:**
- Modify: `app/api/admin/onboarding/finalize-cas/route.ts` (per-row `ShadowApplyResult` construction near `:401-402,894-895`)
- Modify: `tests/log/_auditableMutations.ts`
- Modify: `tests/log/adminOutcomeBehavior.test.ts`
- Modify (test file for finalize-cas's own per-row response shape — locate via `find tests -iname "*finalizeCas*"` before editing)

**Interfaces:** `ShadowApplyResult`'s corrupt-code branch (spec's discriminated union `:87-97`) gains an optional `rebuild_exhausted?: boolean` field the client reads.

- [ ] Write failing test: seed `onboarding_rebuild_attempts.attempts = 1` (== CAP) for a corrupt row's `(session, sheet)`; call `finalize-cas`; assert the corresponding `per_row` entry carries `rebuild_exhausted: true`; assert a fresh row with no `onboarding_rebuild_attempts` entry (COALESCE 0) carries `rebuild_exhausted: false`.
- [ ] Write failing test: a corrupt row re-observed with `attempts >= CAP` on its first re-observation flips `escalation_logged` and emits `logAdminOutcome({ code: "ONBOARDING_SHADOW_REBUILD_EXHAUSTED", ... })` exactly once, post-commit; a second finalize-cas run against the same still-corrupt row does NOT re-emit (idempotent, `escalation_logged` already `true`); a rolled-back finalize-cas transaction (simulate via a forced throw after the in-txn claim but before commit, matching the file's existing throw-injection test idiom) never flips the flag and never emits.
- [ ] Run — both new tests fail (join/telemetry not wired).
- [ ] Minimal implementation: LEFT JOIN `onboarding_rebuild_attempts` into the corrupt-row query at `:401`/`:894` (`coalesce(ora.attempts, 0) as rebuild_attempts`), set `rebuild_exhausted = rebuild_attempts >= 1` (CAP) on the `ShadowApplyResult`; in the same locked per-row txn, in-txn conditional claim:
  ```sql
  update public.onboarding_rebuild_attempts
     set escalation_logged = true
   where wizard_session_id = $1::uuid and drive_file_id = $2
     and attempts >= 1 and not escalation_logged
  returning attempts
  ```
  capture whether a row returned; post-commit (mirroring the file's existing post-commit outcome-telemetry loop), iff flipped this run:
  ```ts
  await logAdminOutcome({
    code: "ONBOARDING_SHADOW_REBUILD_EXHAUSTED",
    source: "api.admin.onboarding.finalizeCas",
    actorEmail: admin.email,
    driveFileId, wizardSessionId, showId,
    result: code,
    extra: { corruptionReason, attemptCount: attempts },
  });
  ```
- [ ] Run: `pnpm vitest run <finalize-cas test file>` — green.
- [ ] Add to `tests/log/_auditableMutations.ts`: `{ file: "app/api/admin/onboarding/finalize-cas/route.ts", fn: "POST", code: "ONBOARDING_SHADOW_REBUILD_EXHAUSTED" }`.
- [ ] Write failing sink-spy test in `tests/log/adminOutcomeBehavior.test.ts` for the exhaustion emit's once-only + post-commit-only behavior.
- [ ] Run: `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` — green.
- [ ] Commit: `feat(admin): finalize-cas rebuildExhausted panel wiring + once-only escalation telemetry`

## Task 11 — `BlockedRowResolver` client component (Opus + impeccable dual-gate)

**Files:**
- Create: `components/admin/BlockedRowResolver.tsx`
- Create: `tests/components/admin/BlockedRowResolver.test.tsx`

**Interfaces:**
```ts
export type BlockedRowResolverProps = {
  driveFileId: string;
  wizardSessionId: string;
  code: string;
  displayName?: string;
  rebuildExhausted?: boolean;
  disabled?: boolean;
  onResolved: () => void;
};
```

- [ ] Write failing component tests in `tests/components/admin/BlockedRowResolver.test.tsx` (follow `RescanSheetButton`'s existing test file's harness idiom — locate via `find tests -iname "*RescanSheetButton*"`):
  - `code: "SHOW_ARCHIVED_IMMUTABLE"` renders an "Unarchive & retry" trigger; two taps (arm then confirm) POSTs `{ wizardSessionId, driveFileId, code, action: "unarchive" }` to `/api/admin/onboarding/resolve-blocker`.
  - `code: "STAGED_REVIEW_ITEMS_CORRUPT", rebuildExhausted: false` renders "Discard & rebuild"; posts `action: "rebuild"`.
  - `code: "STAGED_REVIEW_ITEMS_CORRUPT", rebuildExhausted: true` renders escalation copy on first paint, NO button (assert no `role="button"`/clickable trigger in the subtree).
  - `code: "STAGED_PARSE_OUTDATED_AT_PHASE_D"` (freshness) renders NOTHING (`container.firstChild` is `null` or an empty fragment — defensive; freshness stays on `RescanSheetButton`, not this component).
  - Armed state auto-reverts after 4000ms (`vi.useFakeTimers()`, assert label reverts, matching `RescanSheetButton`'s `ARM_REVERT_MS` idiom).
  - `onResolved` fires ONLY when the route returns `{ ok: true, status: "resolved" }`; does NOT fire on `escalated` or `error`/network-catch (assert with a mocked fetch returning each status).
  - `disabled: true` while `armed` disarms back to idle (compound transition per spec §3.1) — set armed, then rerender with `disabled: true`, assert label reverts to idle without a click.
  - Unmount while armed clears the revert timer (assert no `act()` warning / no state update after unmount — `vi.useFakeTimers` + unmount + advance timers + no console error).
  - No raw code rendered: assert the DOM text content never contains the literal string `"SHOW_ARCHIVED_IMMUTABLE"` or `"STAGED_REVIEW_ITEMS_CORRUPT"` (only via `<HelpAffordance code={...}>`'s accessible disclosure, never as visible body text) — clone-and-strip the `HelpAffordance` subtree before the text-content scan (anti-tautology: proves the code itself isn't leaking into the dougFacing copy path).
- [ ] Run: `pnpm vitest run tests/components/admin/BlockedRowResolver.test.tsx` — fails (component doesn't exist).
- [ ] Minimal implementation — `components/admin/BlockedRowResolver.tsx`, mirroring `RescanSheetButton.tsx`'s two-tap idiom (`:27-224`) exactly for the arm/confirm/timer/aria-busy/sr-only-announce mechanics, with per-code branching:
  ```tsx
  "use client";
  import { useEffect, useRef, useState } from "react";
  import { messageFor, isMessageCode } from "@/lib/messages/lookup";
  import { HelpAffordance } from "@/components/admin/HelpAffordance";
  import { renderEmphasis } from "@/components/messages/renderEmphasis";

  const ARM_REVERT_MS = 4_000;
  const REBUILDABLE_CODES = new Set(["STAGED_REVIEW_ITEMS_CORRUPT", "STAGED_PARSE_RESULT_CORRUPT"]);

  type ResolveBlockerResponse =
    | { ok: true; status: "resolved" }
    | { ok: false; status: "escalated"; code: string }
    | { ok: false; status: "needs_attention" | "busy"; code: string }
    | { ok: false; status: "superseded" | "no_active_session" | "not_found" | "not_currently_blocked" | "bad_request" | "wrong_action" };

  function lookupDougFacing(code: string): string | null {
    return isMessageCode(code) ? messageFor(code).dougFacing : null;
  }

  export function BlockedRowResolver({
    driveFileId, wizardSessionId, code, displayName, rebuildExhausted = false, disabled = false, onResolved,
  }: BlockedRowResolverProps) {
    const action: "unarchive" | "rebuild" | null =
      code === "SHOW_ARCHIVED_IMMUTABLE" ? "unarchive" : REBUILDABLE_CODES.has(code) ? "rebuild" : null;
    const [armed, setArmed] = useState(false);
    const [pending, setPending] = useState(false);
    const [errorCopy, setErrorCopy] = useState<string | null>(null);
    const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    function clearArmTimer() {
      if (armTimerRef.current !== null) { clearTimeout(armTimerRef.current); armTimerRef.current = null; }
    }
    useEffect(() => clearArmTimer, []);
    useEffect(() => {
      if (disabled && armed) { clearArmTimer(); setArmed(false); }
    }, [disabled, armed]);

    if (!driveFileId || !wizardSessionId || action === null) return null;
    if (action === "rebuild" && rebuildExhausted) {
      const name = displayName || driveFileId;
      return (
        <p className="text-sm text-warning-text" data-testid={`blocked-row-escalated-${driveFileId}`}>
          {renderEmphasis(`We could not automatically rebuild ${name} after one attempt. Contact the developer to clear it.`)}
        </p>
      );
    }

    async function handleClick() {
      if (pending) return;
      setPending(true);
      setErrorCopy(null);
      try {
        const response = await fetch("/api/admin/onboarding/resolve-blocker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wizardSessionId, driveFileId, code, action }),
        });
        const body = (await response.json()) as ResolveBlockerResponse;
        if (body.ok) {
          onResolved();
          return;
        }
        if (body.status === "escalated") return; // escalation copy renders via rebuildExhausted on next paint
        setErrorCopy(lookupDougFacing((body as { code?: string }).code ?? "") ?? "Something went wrong. Refresh and try again.");
      } catch {
        setErrorCopy("Something went wrong. Refresh and try again.");
      } finally {
        setPending(false);
      }
    }

    function onGuardedClick() {
      if (disabled) return;
      if (!armed) {
        setArmed(true);
        clearArmTimer();
        armTimerRef.current = setTimeout(() => { armTimerRef.current = null; setArmed(false); }, ARM_REVERT_MS);
        return;
      }
      clearArmTimer();
      setArmed(false);
      void handleClick();
    }

    const idleLabel = action === "unarchive" ? "Unarchive & retry" : "Discard & rebuild";
    const armedLabel =
      action === "unarchive"
        ? "Confirm unarchive: brings this show back to publish it"
        : "Confirm rebuild: discards the staged copy and re-scans";

    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          data-testid={`blocked-row-resolver-${driveFileId}`}
          onClick={onGuardedClick}
          disabled={pending || disabled}
          aria-busy={pending}
          className={
            armed
              ? "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-transparent bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              : "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          }
        >
          {armed ? armedLabel : pending ? (action === "unarchive" ? "Unarchiving…" : "Rebuilding…") : idleLabel}
        </button>
        <span role="status" className="sr-only">{armed ? "Tap again to confirm." : ""}</span>
        {errorCopy ? (
          <div role="status" aria-live="polite" className="rounded-sm border border-border bg-warning-bg px-3 py-2 text-sm text-warning-text">
            <p>{renderEmphasis(errorCopy)}</p>
            <HelpAffordance code={code} />
          </div>
        ) : null}
      </div>
    );
  }
  ```
- [ ] Run: `pnpm vitest run tests/components/admin/BlockedRowResolver.test.tsx` — green.
- [ ] `/impeccable critique` on `components/admin/BlockedRowResolver.tsx`; fix P0/P1 or log to `DEFERRED.md`.
- [ ] `/impeccable audit` on the same diff; fix P0/P1 or log to `DEFERRED.md`.
- [ ] Commit: `feat(admin): add BlockedRowResolver two-tap in-wizard blocker resolution component`

## Task 12 — Wire `BlockedRowResolver` into both panels (Opus + impeccable dual-gate)

**Files:**
- Modify: `components/admin/FinalizeButton.tsx:75-83` (`CasPerRowEntry`, add `rebuild_exhausted?: boolean`), `:632-642` (panel conditional)
- Modify: `components/admin/RunFinalCASButton.tsx:35` (`CasPerRowEntry`), `:124-136` (panel conditional)
- Modify: `tests/components/admin/FinalizeButton.test.tsx` (or existing suite — locate exact path)
- Modify: `tests/components/admin/RunFinalCASButton.test.tsx` (or existing suite)
- Create/extend: a real-browser transition-audit test for `BlockedRowResolver`'s states (Playwright or chrome-devtools `evaluate_script`, per AGENTS.md layout/transition-audit convention)

**Interfaces:** no new exported types; `FinalizeButton`'s `run.runLoop()` (already returned at `:480-492`) becomes the `onResolved` callback for `FinalizeButton`; `RunFinalCASButton`'s local `handleClick` becomes the `onResolved` callback there.

- [ ] Write failing tests:
  - `FinalizeButton`: for a `cas_per_row` row with `code: "SHOW_ARCHIVED_IMMUTABLE"`, assert `<BlockedRowResolver>` renders (via its `data-testid={`blocked-row-resolver-${driveFileId}`}`) instead of nothing; for `STAGED_PARSE_OUTDATED_AT_PHASE_D` assert `<RescanSheetButton>` STILL renders (byte-parity regression — the freshness path must be untouched).
  - `FinalizeButton`: simulate a successful resolve (mock `fetch` for `/resolve-blocker` → `{ ok: true, status: "resolved" }`) and assert `runLoop`'s POST to `/api/admin/onboarding/finalize` fires again (auto-retry) — spy on `global.fetch` call count/args before and after.
  - `RunFinalCASButton`: same two assertions, with `handleClick` (re-POST to `/api/admin/onboarding/finalize-cas`) as the retry proof.
  - **Byte-parity:** existing default-placement tests for `RescanSheetButton`'s two Step3SheetCard call sites (unrelated to this panel) stay green, unmodified — run the full existing `RescanSheetButton` suite, not just the two panel files.
  - **Transition-audit (real browser):** drive `BlockedRowResolver` through idle → armed → pending → resolved in a live-rendered page (Playwright), asserting each transition is instant (no `transition-*` class beyond the pre-existing `transition-colors`/`transition-opacity duration-fast` hover treatment already on the button — assert no added `motion`/`AnimatePresence`/enter-exit wrapper was introduced around the resolver's mount point).
- [ ] Run: existing + new tests — new assertions fail (component not wired).
- [ ] Minimal implementation — `FinalizeButton.tsx`: replace the `:636-641` conditional
  ```tsx
  {RESCANNABLE_CAS_CODES.has(row.code) ? (
    <RescanSheetButton driveFileId={row.drive_file_id} wizardSessionId={wizardSessionId} />
  ) : (
    <BlockedRowResolver
      driveFileId={row.drive_file_id}
      wizardSessionId={wizardSessionId}
      code={row.code}
      displayName={row.display_name}
      rebuildExhausted={row.rebuild_exhausted}
      onResolved={() => void run.runLoop()}
    />
  )}
  ```
  (`run` is already in scope inside `FinalizeStatusRegion({ run })`, `:571`.) `RunFinalCASButton.tsx`: same replacement at `:132-134`, `onResolved={() => void handleClick()}`.
- [ ] Run: `pnpm vitest run <FinalizeButton test file> <RunFinalCASButton test file>` — green.
- [ ] Run the full existing `RescanSheetButton` test suite (byte-parity) — green, unmodified.
- [ ] Run the real-browser transition-audit test — green.
- [ ] `/impeccable critique` on the diff (both panel files + the resolver wiring); fix P0/P1 or log to `DEFERRED.md`.
- [ ] `/impeccable audit` on the same diff; fix P0/P1 or log to `DEFERRED.md`.
- [ ] Commit: `feat(admin): wire BlockedRowResolver into FinalizeButton + RunFinalCASButton panels with auto-retry`

---

## Closeout

- [ ] Full suite: `pnpm test` (feedback_full_suite_before_push — scoped gates miss regressions).
- [ ] `pnpm typecheck` (vitest strips types).
- [ ] `pnpm lint` (canonical Tailwind classes ERROR).
- [ ] `pnpm format:check` (prettier).
- [ ] Adversarial review (cross-model, Codex) on the whole diff, fresh-eyes posture, EXPLICITLY DO NOT RELITIGATE the §9 watchpoints list from the spec (wizard unarchive skips `runManualSyncForShow`; broadened Rule 6 not archived-only; forensic code not §12.4; cap=1; corrupt excluded from `RESCANNABLE_CAS_CODES`; no lock nesting; wizard unarchive doesn't call `unarchive_show`; rebuild/shadow "supersede not rebuild" semantics; `exhausted = attempts >= CAP`; escalation emit site = finalize-cas post-commit; authz re-derived under lock; `_unarchive_show_apply` granted to no role).
