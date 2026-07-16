# Role-Vocab Mapping Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mapping-only `role_token_mappings` changes converge on already-published shows at the next cron tick, via a derived drift-eligibility set that suppresses the watermark skip for affected files.

**Architecture:** A read-only batch SQL pre-pass per cron tick (`lib/sync/roleVocabDrift.ts`) computes drift-eligible `drive_file_id`s from persisted stamp + warnings; the set threads through `ProcessOneFileDeps` → `prepareProcessOneFile` → `perFileProcessor`, which rescues only the plain cron watermark skip (no live pending_syncs row) and marks the run `driftResync`; the locked pipeline re-verifies published/archived/pending as its first drift step before Phase 1, and Phase 2 uses the `less_than_or_equal` stale guard for marked runs so the equal-modtime apply actually rewrites `role_flags`/warnings/stamp.

**Tech Stack:** TypeScript, postgres.js (tick-level reads), Vitest (fake-supabase unit tests + DB-bound `.db.test.ts` against local Supabase), no migrations.

**Spec:** `docs/superpowers/specs/2026-07-16-role-vocab-mapping-convergence.md` (adversarially APPROVED R6). Sections cited per task.

## Global Constraints

- TDD per task: failing test → minimal implementation → green → commit (invariant 1). Commit format `<type>(<scope>): <summary>` — scope `sync` for code tasks, `plan` for docs.
- No migrations, no DDL, no new SQL functions (spec §3.2). `role_mappings_stamp_satisfied` is NOT modified (spec D4).
- No new advisory-lock holder; pre-pass is lock-free read; rescued runs use the existing `withPostgresSyncPipelineLock` single holder (invariant 2, spec §3.3).
- Push / manual / onboarding_scan / retry behavior byte-identical (spec §3.3, §9). `driftResync` is never set by those paths.
- Forensic codes `ROLE_VOCAB_DRIFT_SCAN_FAILED` (warn) and `ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE` (info), both `persist: true`, `source: "cron/sync"`. NOT §12.4 rows; must not match `REPORT_*` namespace (spec §3.2).
- New module `lib/sync/roleVocabDrift.ts` contains no `.toLowerCase()`/`.trim()` (no-inline-email guard scans `lib/sync/**`); no timestamps in the predicate (no new AC-X.4 watermark symbol).
- Pre-push (final task): `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` all green locally.

## Meta-test inventory (declared)

- `tests/auth/_metaInfraContract.test.ts`: no new registry row — postgres.js call sites only (precedent comment `lib/sync/runScheduledCronSync.ts:3441-3442`).
- `tests/auth/advisoryLockRpcDeadlock.test.ts`: untouched — no `pg_advisory*` change anywhere in this diff.
- `tests/sync/_phase2ArgsParityContract.test.ts`: WILL be exercised — Task 5 adds a `Phase2Args` member; the parity contract walks arg-object shapes, so the member must appear consistently at the definition and every call site it pins. Run this test in Task 5.
- `lib/audit/noGlobalCursor.ts` suite: expected to pass unmodified (content-based predicate, no timestamp symbols). Task 6 runs it.
- `tests/log/_metaMutationSurfaceObservability.test.ts`: no new mutation surface.
- Sentinel-hiding / admin-alert-catalog: N/A (no tiles, no admin_alerts codes).

## Advisory-lock holder topology (declared)

No task adds/moves a lock acquisition. Holders remain: cron file loop → `processOneFile` → `withPostgresSyncPipelineLock` (`runScheduledCronSync.ts:1839`) — the single JS-side holder for `show:<driveFileId>`. The drift pre-pass runs before any lock; the in-lock recheck runs on the already-locked tx.

## File structure

| File | Responsibility |
|---|---|
| Create `lib/sync/roleVocabDrift.ts` | Batch eligibility query (read-only, tick-level) |
| Create `tests/db/roleVocabDriftPredicate.db.test.ts` | DB-bound predicate matrix |
| Modify `lib/sync/perFileProcessor.ts` | Gate opts param + rescue disjunct + `driftResync` on proceed result |
| Modify `lib/sync/runScheduledCronSync.ts` | Deps members, prepare threading, in-lock recheck, Phase 2 arg, tick pre-pass wiring |
| Modify `lib/sync/phase2.ts` | `Phase2Args.driftResync` + stale-guard relaxation |
| Modify `tests/sync/perFileProcessor.test.ts` | Gate tests + pin-test revision |
| Modify `tests/sync/runScheduledCronSync.test.ts` (or sibling new file `tests/sync/roleVocabDriftResync.test.ts`) | Threading, recheck races, tick wiring tests |
| Modify `BACKLOG.md` (repo root) | Status line |
| Modify `docs/superpowers/specs/2026-07-16-role-vocab-staging-overlay.md` §3.4 | Pointer line |

---

### Task 1: Drift-eligibility query module + DB-bound predicate matrix

**Files:**
- Create: `lib/sync/roleVocabDrift.ts`
- Test: `tests/db/roleVocabDriftPredicate.db.test.ts`

**Interfaces:**
- Consumes: `public.shows` (`drive_file_id`, `published`, `archived`), `public.shows_internal` (`applied_role_mappings`, `parse_warnings`), `public.role_token_mappings` (`token`, `grants`).
- Produces: `export async function listRoleVocabDriftEligibleFileIds(): Promise<Set<string>>` — Task 6 consumes it as the default scanner.

- [ ] **Step 1: Write the failing DB-bound test** (template: `tests/db/roleMappingsStampPredicate.db.test.ts`; helpers from `tests/db/_b2Helpers`). Seed one show per case with a unique token prefix `RVDC` so cases can't cross-match; derive every expectation from the seeded fixture (anti-tautology).

```ts
/**
 * Drift-eligibility predicate matrix (spec 2026-07-16-role-vocab-mapping-convergence §3.1/§6.1).
 * DB-bound (local Supabase). Each case seeds shows + shows_internal + role_token_mappings and
 * asserts membership of the seeded drive_file_id in listRoleVocabDriftEligibleFileIds().
 */
import { afterAll, describe, expect, it } from "vitest";
import { sqlClient, seedLiveShowWithToken, seedHeldShow } from "@/tests/db/_b2Helpers";
import { listRoleVocabDriftEligibleFileIds } from "@/lib/sync/roleVocabDrift";

const T = (s: string) => `RVDC ${s}`; // canonical (upper, trimmed) per role_token_mappings_token_canonical

async function seedMapping(token: string, grants: string[]) {
  await sqlClient`
    insert into public.role_token_mappings (token, grants, decided_by)
    values (${token}, ${grants}, 'doug@fxav.com')
    on conflict (token) do update set grants = excluded.grants, updated_at = now()`;
}
async function deleteMapping(token: string) {
  await sqlClient`delete from public.role_token_mappings where token = ${token}`;
}
async function setInternal(showId: string, stamp: unknown, warnings: unknown) {
  await sqlClient`
    insert into public.shows_internal (show_id, applied_role_mappings, parse_warnings)
    values (${showId}, ${stamp === null ? null : JSON.stringify(stamp)}::text::jsonb,
            ${warnings === null ? null : JSON.stringify(warnings)}::text::jsonb)
    on conflict (show_id) do update
      set applied_role_mappings = excluded.applied_role_mappings,
          parse_warnings = excluded.parse_warnings`;
}
const unknownWarning = (token: string) => ({
  severity: "warn", code: "UNKNOWN_ROLE_TOKEN",
  message: `Unknown role token: '${token}'`, roleToken: token,
});

// Cases (each `it` seeds, evaluates, asserts, cleans up its mapping):
// 1. CREATE: published show, stamp null, warning carries roleToken T("CREATE"), mapping exists → ELIGIBLE
// 2. legacy carve-out: same but warning WITHOUT roleToken key → NOT eligible (pins R1 F2)
// 3. BROADEN: stamp [{token, grants:["A1"]}], mapping grants ["A1","V1"] → ELIGIBLE
// 4. NARROW: stamp [{token, grants:["A1","V1"]}], mapping grants ["A1"] → ELIGIBLE
// 5. DELETE-consumed: stamp entry present, mapping row deleted → ELIGIBLE
// 6. DELETE-unconsumed: stamp null, warning w/ roleToken, NO mapping row → NOT eligible
// 7. equal (edit-revert / steady state): stamp grants == mapping grants exactly → NOT eligible
// 8. recognize-only steady state: stamp [{token, grants:[]}], mapping grants [] → NOT eligible
// 9. malformed stamp (jsonb string "corrupt") → ELIGIBLE (self-heal)
// 10. published=false (seedHeldShow) with NARROW drift → NOT eligible (pins R2 F1)
// 11. archived=true with NARROW drift → NOT eligible
```

Write each case as a real `it()` with the seed calls above; assert via
`const ids = await listRoleVocabDriftEligibleFileIds(); expect(ids.has(show.driveFileId)).toBe(true/false)`.

- [ ] **Step 2: Run it — expect FAIL** (module not found):
`pnpm exec vitest run tests/db/roleVocabDriftPredicate.db.test.ts` → import error.

- [ ] **Step 3: Implement `lib/sync/roleVocabDrift.ts`**

```ts
import postgres from "postgres";
import { databaseUrl } from "@/lib/sync/runScheduledCronSync";
// (plan R1 F2) SINGLE resolver: export the existing private `databaseUrl()` from
// runScheduledCronSync (the one listPostgresLiveShows uses, :652 region — precedence
// TEST_DATABASE_URL ?? DATABASE_URL ?? local fallback, production guard included) and
// import it here. Do NOT write a second resolver — a precedence divergence points the
// scanner at a different DB than the cron pipeline. If a circular-import issue arises,
// extract the function verbatim to `lib/sync/_databaseUrl.ts` and import it from BOTH
// files in the same commit. Add a unit test asserting roleVocabDrift and the cron
// pipeline share the same resolver function (referential identity or module source).

/**
 * Drift-eligibility pre-pass (spec 2026-07-16-role-vocab-mapping-convergence §3.1/§3.2).
 * Read-only; published+non-archived shows only; content-based (no timestamps — deliberately
 * NOT a watermark; see spec §7 noGlobalCursor note). Exact-match grants (set equality via
 * mutual containment), NOT the publish gate's containment predicate.
 */
export async function listRoleVocabDriftEligibleFileIds(): Promise<Set<string>> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(`
      with vocab as (select token, grants from public.role_token_mappings)
      select s.drive_file_id
        from public.shows s
        join public.shows_internal si on si.show_id = s.id
       where s.archived = false
         and s.published = true
         and s.drive_file_id is not null
         and (
           (si.applied_role_mappings is not null
             and jsonb_typeof(si.applied_role_mappings) <> 'array')
           or exists (
             select 1
               from jsonb_array_elements(
                      case when jsonb_typeof(si.applied_role_mappings) = 'array'
                           then si.applied_role_mappings else '[]'::jsonb end) e
              cross join lateral (
                select case when jsonb_typeof(e->'grants') = 'array'
                       then (select coalesce(array_agg(t), '{}'::text[])
                               from jsonb_array_elements_text(e->'grants') t)
                       end as entry_grants
              ) g
               left join vocab v
                 on jsonb_typeof(e->'token') = 'string' and v.token = e->>'token'
              where jsonb_typeof(e) <> 'object'
                 or jsonb_typeof(e->'token') <> 'string'
                 or g.entry_grants is null
                 or v.token is null
                 or not (v.grants @> g.entry_grants and g.entry_grants @> v.grants)
           )
           or exists (
             select 1
               from jsonb_array_elements(
                      case when jsonb_typeof(si.parse_warnings) = 'array'
                           then si.parse_warnings else '[]'::jsonb end) w
               join vocab v on v.token = w->>'roleToken'
              where w->>'code' = 'UNKNOWN_ROLE_TOKEN'
                and jsonb_typeof(w->'roleToken') = 'string'
           )
         )
    `)) as Array<{ drive_file_id: string }>;
    return new Set(rows.map((r) => r.drive_file_id));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
```

- [ ] **Step 4: Run test — expect PASS.** If a malformed-jsonb case errors instead of returning eligibility, fix the guarded `case` extraction, not the test.
- [ ] **Step 5: Run the no-inline-email meta-test** (module lives in `lib/sync/`): `pnpm exec vitest run tests/admin/no-inline-email-normalization.test.ts` → PASS.
- [ ] **Step 6: Commit** `feat(sync): drift-eligibility pre-pass query for role-vocab mapping convergence`

### Task 2: Gate rescue disjunct in `perFileProcessor` (+ pin-test revision)

**Files:**
- Modify: `lib/sync/perFileProcessor.ts` (`:8-22` result type, `:165` signature, `:214-218` skip block)
- Test: `tests/sync/perFileProcessor.test.ts` (existing fake-supabase pattern; pin test at `:334-356`)

**Interfaces:**
- Produces: `perFileProcessor(driveFileId, mode, fileMeta, opts?: { roleVocabDriftEligible?: boolean })`; proceed variant gains `driftResync?: true`. Task 3 consumes both.

- [ ] **Step 1: Write failing tests** in `tests/sync/perFileProcessor.test.ts`:

```ts
// (a) cron + at-watermark + eligible + NO pending row → proceed with driftResync
await expect(
  perFileProcessor("file-1", "cron", fileMeta(AT_WATERMARK), { roleVocabDriftEligible: true }),
).resolves.toEqual({ outcome: "proceed", mode: "cron", driftResync: true });
// (b) cron + eligible + live pending_syncs row at/after modifiedTime → STILL watermark skip (R1 F1)
// seed fake pending_syncs staged_modified_time >= modifiedTime
// → { outcome: "skip", reason: "watermark" }
// (c) eligible flag does NOT override deferral / archived / partial_failure_restage_required
// (d) push mode + eligible → WEBHOOK_NOOP_ALREADY_SYNCED (flag ignored outside cron)
// (e) opts absent → all existing behavior identical (run existing suite)
```

Revise the pin test (`:334-356`) to the new topology (spec §6.3): cron at-watermark WITHOUT flag → skip `watermark`; WITH flag → proceed `driftResync: true`; manual unconditional proceed unchanged. Keep the comment block, rewritten to describe the bounded window.

- [ ] **Step 2: Run — expect FAIL** (unknown opts param / result shape): `pnpm exec vitest run tests/sync/perFileProcessor.test.ts`
- [ ] **Step 3: Implement.** Result type: proceed variant `{ outcome: "proceed"; mode: ResolvedSyncMode; driftResync?: true }`. Signature adds trailing `opts: { roleVocabDriftEligible?: boolean } = {}`. Rescue inside the final skip block (`:214-218`):

```ts
if (isAtOrBefore(fileMeta.modifiedTime, effectiveWatermark)) {
  // Role-vocab drift rescue (spec 2026-07-16 §3.3): cron-only, and never past a live
  // pending review — a pending_syncs gate row keeps its watermark hold (R1 F1).
  if (mode === "cron" && opts.roleVocabDriftEligible === true && pendingSync == null) {
    return { outcome: "proceed", mode: "cron", driftResync: true };
  }
  return {
    outcome: "skip",
    reason: mode === "push" ? "WEBHOOK_NOOP_ALREADY_SYNCED" : "watermark",
  };
}
```

(`pendingSync` is the existing `readLivePendingSyncGateRow` result at `:187`. Verify the local variable name at implementation time.)
- [ ] **Step 4: Run full file — PASS**: `pnpm exec vitest run tests/sync/perFileProcessor.test.ts`
- [ ] **Step 5: Commit** `feat(sync): cron watermark-skip rescue for drift-eligible published shows`

### Task 3: Threading — deps set → prepare → prepared.driftResync

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (`ProcessOneFileDeps` `:479`, `PreparedProcessOneFile` ready variant `~:2745`, `prepareProcessOneFile` `:2779`)
- Test: new `tests/sync/roleVocabDriftResync.test.ts` (threading + later recheck/race cases live here)

**Interfaces:**
- Consumes: Task 2's opts + `driftResync` proceed flag.
- Produces: `ProcessOneFileDeps.roleVocabDriftEligibleIds?: ReadonlySet<string>`; `PreparedProcessOneFile` ready variant gains `driftResync?: true`. Tasks 4-6 consume.

- [ ] **Step 1: Failing tests** — call `prepareProcessOneFile("file-1", "cron", meta, { roleVocabDriftEligibleIds: new Set(["file-1"]), perFileProcessor: spyGate, ...pipelineStubs })`; assert the spy received `{ roleVocabDriftEligible: true }`; assert the returned ready object carries `driftResync: true` when the gate proceeds with it; assert manual/push callers (no set) → spy receives `{ roleVocabDriftEligible: false }` or omitted and prepared has no `driftResync`.
- [ ] **Step 2: Run — FAIL** (unknown deps member).
- [ ] **Step 3: Implement:** add deps member; in `prepareProcessOneFile` compute `const roleVocabDriftEligible = deps.roleVocabDriftEligibleIds?.has(driveFileId) ?? false;` pass as gate opts; when `gate.outcome === "proceed" && gate.driftResync` carry `driftResync: true` onto the ready result object (spread-conditional, matching the file's `...(x ? { x } : {})` idiom).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(sync): thread drift-eligibility set through prepare into the locked pipeline`

### Task 4: In-lock recheck — first drift step before Phase 1

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (`processOneFile_unlocked` `:3167`, insert after `pipeline` assignment `:3189`, BEFORE `recheckLiveDeferralAfterLock` `:3191`)
- Test: `tests/sync/roleVocabDriftResync.test.ts`

**Interfaces:**
- Consumes: `pipeline.driftResync` (Task 3), locked tx.
- Produces: skipped result `{ outcome: "skipped", reason: "drift_recheck_failed" }`; helper `readDriftRecheckBlocked_unlocked(tx, driveFileId): Promise<boolean>`.

- [ ] **Step 1: Failing tests** (spec §6.6 race cases; use the file's existing injected `withShowLock`/tx-stub pattern from `tests/sync/runScheduledCronSync.test.ts`):
  - unpublish race: prepared ready + `driftResync: true`, locked read returns `published=false` → result `{ outcome: "skipped", reason: "drift_recheck_failed" }` AND zero Phase 1 side effects (phase1 spy not called; no pending_syncs/shows writes on the tx recorder).
  - archive race (plan R1 F1): the EXISTING DEF-4 in-lock archived re-read (`processOneFile_unlocked:3176-3180`, `readShowArchived_unlocked`) fires BEFORE the pipeline/prepared derivation and returns `{ outcome: "skipped", reason: ARCHIVED_SKIP_REASON }` silently — that existing guard IS the archived leg of the spec's in-lock re-verification (spec §3.3 item iii), already satisfying "benign skip, zero Phase 1 side effects." The test therefore expects `ARCHIVED_SKIP_REASON` (NOT `drift_recheck_failed`) for a drift-rescued run racing an archive, and additionally asserts phase1 spy not called. Do NOT reorder the existing guard and do NOT expect the drift-specific reason for this case.
  - pending race: same setup with a live pending_syncs row found in-lock → `drift_recheck_failed`.
  - non-drift runs: recheck query NEVER issued when `pipeline.driftResync` absent (spy on the helper).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** Helper (same file, near `readShowArchived_unlocked`):

```ts
/** Drift-rescued runs only (spec §3.3 R4/R5): re-verify published+archived+no-live-pending
 *  under the held lock, BEFORE runPhase1_unlocked — Phase 1 mutates on non-happy paths. */
async function readDriftRecheckBlocked_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<boolean> {
  // archived=false kept as defense-in-depth; the archived RACE is authoritatively handled
  // by the earlier DEF-4 re-read (:3176-3180) which returns ARCHIVED_SKIP_REASON first
  // (plan R1 F1). This helper's load-bearing legs are published + no-live-pending.
  const rows = await tx.unsafe(
    `select (s.published = true and s.archived = false
             and not exists (select 1 from public.pending_syncs p
                              where p.drive_file_id = s.drive_file_id
                                and p.wizard_session_id is null)) as ok
       from public.shows s where s.drive_file_id = $1`,
    [driveFileId],
  );
  return rows[0]?.ok !== true;
}
```

(Adjust the tx query call to the `SyncPipelineTx` interface actually exposed — `makeSyncPipelineTx` `:1817` shows the available methods; use its `queryOne`/`unsafe` equivalent. The live-partition predicate `wizard_session_id is null` mirrors `:954`.)

Insertion in `processOneFile_unlocked` right after `const pipeline = prepared;` (`:3189`):

```ts
if (pipeline.kind === "ready" && pipeline.driftResync) {
  if (await readDriftRecheckBlocked_unlocked(tx, driveFileId)) {
    const result = { outcome: "skipped" as const, reason: "drift_recheck_failed" };
    await logSync(txDeps, driveFileId, result);
    return result;
  }
}
```

- [ ] **Step 4: Run — PASS.** Also run the whole `tests/sync/runScheduledCronSync.test.ts` (regression).
- [ ] **Step 5: Commit** `feat(sync): in-lock drift recheck before Phase 1 (published/archived/pending races)`

### Task 5: Phase 2 equal-watermark stale guard for drift runs

**Files:**
- Modify: `lib/sync/phase2.ts` (`Phase2Args` `:85`, `staleGuardForMode` `:217-219`, call site `:355`)
- Modify: `lib/sync/runScheduledCronSync.ts` (`runPhase2_unlocked` args construction `:3452-3483` — add `...(pipeline.driftResync ? { driftResync: true } : {})`)
- Test: phase2 unit tests (same file/pattern as existing staleGuard coverage; locate via `rg -n "staleGuard" tests/`)

**Interfaces:**
- Consumes: `pipeline.driftResync`.
- Produces: `Phase2Args.driftResync?: boolean`; `staleGuardForMode(mode, driftResync?)`.

- [ ] **Step 1: Failing tests:** applyShowSnapshot spy asserts `staleGuard === "less_than_or_equal"` for `mode: "cron", driftResync: true`; `"strict_less_than"` for plain cron and push regardless of flag absence; manual unchanged. Stale code remains `STALE_WRITE_ABORTED` for a stale drift run (assert via the stale outcome path).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement:**

```ts
function staleGuardForMode(
  mode: Phase2Mode,
  driftResync?: boolean,
): "strict_less_than" | "less_than_or_equal" {
  if (mode === "cron" && driftResync === true) return "less_than_or_equal"; // spec §3.3 R3 F1 — manual-mode precedent for equal-watermark apply
  return mode === "cron" || mode === "push" ? "strict_less_than" : "less_than_or_equal";
}
```

Call site `:355`: `staleGuard: staleGuardForMode(args.mode, args.driftResync)`.
- [ ] **Step 4: Run phase2 tests + `pnpm exec vitest run tests/sync/_phase2ArgsParityContract.test.ts` — PASS.**
- [ ] **Step 5: Commit** `feat(sync): less_than_or_equal stale guard for drift-rescued cron applies`

### Task 6: Tick pre-pass wiring + forensic emits

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (`RunScheduledCronSyncDeps` `:557`; tick body around `list-live-shows` `:3663-3668`; per-file deps at the `runOne` call `:3734` / `processDeps` `:3659`)
- Test: `tests/sync/roleVocabDriftResync.test.ts` (tick-level cases, injected deps)

**Interfaces:**
- Consumes: Task 1 `listRoleVocabDriftEligibleFileIds`, Task 3 deps member.
- Produces: `RunScheduledCronSyncDeps.listRoleVocabDriftEligible?: () => Promise<ReadonlySet<string>>`.

- [ ] **Step 1: Failing tests** (spec §6.4, injected `listFolder`/`processOneFile`/`listRoleVocabDriftEligible`):
  - scanner returns `{"file-1"}` → injected `processOneFile` receives deps containing `roleVocabDriftEligibleIds` with `file-1`.
  - scanner returns empty set → deps member is an empty set (or omitted) and behavior identical to a run without the dep.
  - scanner THROWS → tick completes normally; `log.warn` called once with second-arg object whose top-level `code === "ROLE_VOCAB_DRIFT_SCAN_FAILED"` and `persist === true` (assert the args object per the AST-guard lesson — code must be on the log call's payload, not the message); set treated as empty.
  - non-empty set → one `log.info` with `code === "ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE"`, `persist: true`, payload carrying count + ids.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** in the tick (inside the `list-live-shows` phase region, before `setPhase("missing-shows")`):

```ts
let driftEligible: ReadonlySet<string> = new Set();
try {
  driftEligible = await (deps.listRoleVocabDriftEligible ?? listRoleVocabDriftEligibleFileIds)();
  if (driftEligible.size > 0) {
    await log.info("role-vocab drift resync eligibility computed", {
      source: "cron/sync",
      code: "ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE",
      persist: true,
      count: driftEligible.size,
      driveFileIds: [...driftEligible],
    });
  }
} catch (error) {
  await log.warn("role-vocab drift scan failed; treating set as empty", {
    source: "cron/sync",
    code: "ROLE_VOCAB_DRIFT_SCAN_FAILED",
    persist: true,
    ...errorPayload(error),
  });
}
```

Then thread into the file loop's per-file deps: extend `processDeps` construction so every `runOne` call receives `roleVocabDriftEligibleIds: driftEligible` (merge with the existing `logSync` conditional — keep exactOptional semantics: include the member always; an empty set is inert).
- [ ] **Step 4: Run — PASS.** Also run `pnpm exec vitest run lib/audit` watermark suite (or the test that executes `noGlobalCursor`; locate via `rg -ln "noGlobalCursor" tests/`) → PASS with zero symbol changes.
- [ ] **Step 5: Commit** `feat(sync): per-tick drift pre-pass wiring with fail-open forensic telemetry`

### Task 7: End-to-end equal-watermark + self-clear integration (DB-bound)

**Files:**
- Test: extend `tests/db/roleVocabDriftPredicate.db.test.ts` (self-clear) + a pipeline-level test in `tests/sync/roleVocabDriftResync.test.ts` using the hold-aware/apply testkits (`tests/sync/_applyStagedCoreTestkit.ts` patterns; `tests/sync/def1-cron-resync-clear.db.test.ts` is the DB-bound cron template)

**Interfaces:** consumes everything above; produces no new API.

- [ ] **Step 1: Failing tests** (spec §6.6):
  - **applied-not-just-proceed:** drift-rescued cron run over an unchanged binding (equal `modifiedTime`) returns `outcome: "applied"` and the DB shows rewritten `crew_members.role_flags`, `shows_internal.parse_warnings`, `shows_internal.applied_role_mappings` (derive expected flags from the seeded mapping fixture, not hardcoded).
  - **strict-guard regression:** identical run WITHOUT `driftResync` → `stale` outcome, nothing rewritten.
  - **concurrent advance:** watermark advanced past `binding.modifiedTime` before apply → drift run ends `stale` (`STALE_WRITE_ABORTED`).
  - **self-clear:** after the successful drift apply, `listRoleVocabDriftEligibleFileIds()` no longer contains the file id.
- [ ] **Step 2: Run — FAIL** (before Tasks 2-6 landed they'd fail anyway; at this point they fail only if wiring is incomplete — a genuinely green first run means the coverage is tautological: strengthen per the anti-tautology rule).
- [ ] **Step 3: Fix any wiring gaps surfaced.**
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `test(sync): drift-resync equal-watermark apply, stale regressions, self-clear`

### Task 8: Docs + full local gates

**Files:**
- Modify: `BACKLOG.md` (status line under `BL-ROLE-VOCAB-MAPPING-CONVERGENCE`, `:15` block)
- Modify: `docs/superpowers/specs/2026-07-16-role-vocab-staging-overlay.md` (§3.4 — one pointer sentence: window now bounded by next cron tick for published shows, cite this spec)

- [ ] **Step 1: Edit BACKLOG.md** — add `**Status:** ✅ SHIPPED — feat/role-vocab-mapping-convergence (2026-07-16; spec docs/superpowers/specs/2026-07-16-role-vocab-mapping-convergence.md). Drift-derived cron re-sync eligibility: published-show batch predicate per tick, watermark-skip rescue (no live pending row), in-lock pre-Phase-1 recheck, <= stale guard for drift applies. Pin test revised.`
- [ ] **Step 2: Edit staging-overlay spec §3.4** — append pointer line only; do NOT run prettier on the master spec (untouched anyway).
- [ ] **Step 3: Full gates:** `pnpm test` && `pnpm typecheck` && `pnpm lint` && `pnpm format:check` && `pnpm build` — all green. Fix regressions before committing.
- [ ] **Step 4: Commit** `docs(plan): close BL-ROLE-VOCAB-MAPPING-CONVERGENCE — status + staging-overlay §3.4 pointer`

---

## Self-review notes (run after drafting — completed)

- Spec coverage: §3.1→T1, §3.2→T1+T6, §3.3 gate→T2, threading→T3, recheck→T4, stale guard→T5, §3.4 self-clear→T7, §6 tests→T1-T7 mapped 1:1, §4 docs row→T8. No gaps found.
- Placeholders: none — every step carries code or exact commands; two "verify at implementation time" notes are deliberate live-shape checks, not deferrals (exact variable/interface names pinned to cited lines).
- Type consistency: `driftResync?: true` on gate result + prepared ready variant; `Phase2Args.driftResync?: boolean` (boolean at phase2 — set only via `...(x ? { driftResync: true } : {})`, so runtime value is `true` when present); `roleVocabDriftEligibleIds: ReadonlySet<string>`; `listRoleVocabDriftEligible: () => Promise<ReadonlySet<string>>`. Names match across tasks.
