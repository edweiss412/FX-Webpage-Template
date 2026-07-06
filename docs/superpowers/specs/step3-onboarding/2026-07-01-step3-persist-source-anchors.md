# Spec: Persist source anchors at scan; delete the Step-3 finalize XLSX export

- **Date:** 2026-07-01
- **Status:** Draft (autonomous-ship pipeline)
- **Slug:** `step3-persist-source-anchors`
- **Owner:** Opus / Claude Code
- **Related:** Step-3 publish streaming progress (PR #210); onboarding finalize (`app/api/admin/onboarding/finalize/route.ts`); scan (`lib/sync/runOnboardingScan.ts`).

---

## 1. Problem

The Step-3 wizard "Publish N shows & finish setup" button drives `POST /api/admin/onboarding/finalize`, which publishes staged shows in a **strictly sequential** per-row loop (`app/api/admin/onboarding/finalize/route.ts:1142`). For **every** approved row, PRE-LOCK, it calls `runtime.fetchOnboardingSourceAnchors(row.drive_file_id)` (route.ts:1151), whose default (`defaultFetchOnboardingSourceAnchors`, route.ts:205-211) performs a **full Google Drive XLSX export** (`fetchSheetMarkdownWithBinding`) plus a tab title→gid fetch (`fetchSheetTitleToGid`) and `extractSourceAnchors`.

The XLSX export is the dominant cost: the drive layer itself documents it as ~20.8s "healthy-but-slow" with a 45s timeout ceiling (`lib/drive/fetch.ts:45`, `DRIVE_EXPORT_TIMEOUT_MS`). With the loop serial, publishing ~7 shows spends **~7 × ~20s ≈ ~145s** in exports alone.

This work is redundant:

- **It is irrelevant to publish safety.** Freshness is enforced solely by the cheap metadata `files.get` — `sameTimestamp(metadata.modifiedTime, row.staged_modified_time)` (route.ts:734) — plus the generation-scoped `parse_result` re-read pinned to `(staged_id, staged_modified_time)` under the per-show lock (route.ts:766-800). The anchor export feeds **neither**.
- **Anchors are best-effort.** A failure already degrades to "apply without anchors" / `#gid=0` (route.ts:1149-1158); they are consumed **only** by the first-seen branch's `applyStagedCore` (route.ts:987-990). Existing-show / re-onboard rows compute the export and then ignore it.
- **Scan already fetched the same bytes.** The onboarding scan's `prepareOne` already downloads the workbook `bytes` via `fetchMarkdownWithBinding` (`runOnboardingScan.ts:932`) and can already reach the tab→gid map via `fetchSheetTitleToGid` (`runOnboardingScan.ts:915`), which it uses for `attachWarningAnchors` (`runOnboardingScan.ts:946`). Computing `extractSourceAnchors(bytes, titleToGid)` there is nearly free and runs under scan's existing bounded concurrency (`mapWithConcurrency`, `runOnboardingScan.ts:950`) — off the finalize critical path.

## 2. Goal

Compute source anchors **once at scan time** (where the bytes are already in hand), persist them to a new `pending_syncs.source_anchors` jsonb column, and have finalize **read the column instead of exporting**. Delete the finalize XLSX export path entirely.

**Expected result:** ~145s → ~7s for 7 shows. Finalize's only remaining per-show Drive call becomes the cheap freshness `fetchDriveFileMetadata` that already exists (route.ts:713).

**Non-goal (explicitly out of scope):** parallelizing the finalize per-row loop. With the export gone, the residual sequential cost is ~1s/row; parallelizing it is deferred (it would touch error semantics, connection-pool sizing, and streaming-progress ordering for marginal benefit). This spec keeps the loop sequential and byte-identical in lock/checkpoint/error behavior.

## 3. Design overview

```
SCAN (runOnboardingScan.prepareOne, bounded-concurrent, PRE-lock):
  bytes  = fetchMarkdownWithBinding(...)          // already happens today
  gids   = fetchSheetTitleToGid(...)              // today: lazy/warnings-only → NOW: unconditional
  anchors = extractSourceAnchors(bytes, gids)      // NEW, best-effort → {} on any failure
  reuse `anchors` as attachWarningAnchors' regionAnchors arg (no double compute)
        │
        ▼  thread anchors through PreparedOnboardingFile → Phase1Args → Phase1PendingSyncRow
UPSERT (runOnboardingScan.upsertLivePendingSync):
  INSERT ... source_anchors = $N::jsonb ...
  ON CONFLICT DO UPDATE SET source_anchors = excluded.source_anchors   // re-stage refresh
        │
        ▼  (rescanWizardSheet re-stages via the SAME prepare+scan path → auto-wired)
pending_syncs.source_anchors  jsonb NOT NULL DEFAULT '{}'::jsonb
        │
        ▼
FINALIZE (app/api/admin/onboarding/finalize/route.ts):
  freshRead (under per-show lock) SELECTs source_anchors alongside parse_result
  coerce best-effort → Record<string, SourceAnchor> (any failure → {})
  pass to applyStagedCore first-seen branch (empty {} → omit, == today's #gid=0)
  DELETE defaultFetchOnboardingSourceAnchors + fetchOnboardingSourceAnchors dep + pre-lock call
  DELETE now-unused imports (fetchSheetMarkdownWithBinding, fetchSheetTitleToGid, extractSourceAnchors)
```

The persisted map is exactly `extractSourceAnchors`' return type, `Record<string, SourceAnchor>` where `SourceAnchor = { title: string; gid: number; a1?: string }` (`lib/sheet-links/buildSheetDeepLink.ts:3`) — the same value finalize hands `applyStagedCore` today, so the downstream apply is unchanged.

## 4. Data model

### 4.1 New column

```sql
alter table public.pending_syncs
  add column if not exists source_anchors jsonb not null default '{}'::jsonb;
```

- **Shape:** `Record<string, SourceAnchor>` (region-id → `{title, gid, a1?}`), the `extractSourceAnchors` output.
- **`NOT NULL DEFAULT '{}'` is load-bearing:** it is the single graceful-degradation mechanism. Any row a writer does not populate (pre-ship in-flight sessions; staging paths other than the onboarding scan; a best-effort compute failure) reads back `'{}'`, which finalize treats as "no anchors" → `#gid=0` fallback. There is **no** null case to guard at the DB level, and no CHECK/enum constraint is added or changed.
- **Precedent:** `public.shows.source_anchors` already exists and stores the identical shape; the cron path already writes it with the postgres.js "pass raw object to `$N::jsonb`, never `JSON.stringify`" pattern (`runScheduledCronSync.ts:1064-1067, 1112-1113`). This spec mirrors that pattern for `pending_syncs`.

### 4.2 Migration lifecycle

- New migration file: `supabase/migrations/20260701000001_pending_syncs_source_anchors.sql` (naming/idempotency matches `20260623000001_onboarding_publish_intent.sql`: `add column if not exists`, apply-twice safe, plus a `comment on column`).
- **Migration→validation parity (AGENTS.md cross-cutting):** in the SAME change — (1) apply locally + test; (2) `pnpm gen:schema-manifest` and commit the regenerated `supabase/__generated__/schema-manifest.json`; (3) apply the migration surgically to the validation project (`supabase db query --linked "alter table ..."` + `notify pgrst, 'reload schema'`). The `validation-schema-parity` gate (`tests/db/validation-schema-parity.test.ts`) fails Layer 1 if the manifest isn't regenerated and Layer 2 if validation wasn't patched.
- The `dev.*` shadow clone (`supabase/migrations/20260502000000_dev_schema_clone.sql`) is local-seed infrastructure, not a deploy target; add the column to its `dev.pending_syncs` clone **only** if the manifest/seed requires it for local parity. The implementer MUST record the outcome explicitly in the task's commit/handoff (either "dev clone patched because <test/seed> needs it" or "dev clone left untouched — no consumer"), rather than leaving it as an open "verified during implementation" branch.

## 5. Scan side — compute, thread, persist

### 5.1 Compute (in `prepareOne`, `runOnboardingScan.ts:928-948`)

Replace the current lazy, warnings-only anchor path with an unconditional best-effort compute that also feeds `attachWarningAnchors`:

```
let sourceAnchors: Record<string, SourceAnchor> = {};
let resolveGids = () => listSheetGids(file.driveFileId);   // lazy default (only if bytes missing)
if (bytes) {
  try {
    const titleToGid = await listSheetGids(file.driveFileId);
    resolveGids = () => Promise.resolve(titleToGid);        // reuse — no second fetch; set BEFORE extract
    try {
      sourceAnchors = extractSourceAnchors(bytes, titleToGid);
    } catch {
      sourceAnchors = {};                                  // region-extract failed, but KEEP the valid
                                                           // titleToGid resolver for warning anchors
    }
  } catch {
    // gid FETCH failed → {} + an EMPTY-map resolver so attachWarningAnchors degrades link-less
    // WITHOUT a second (also-failing) fetch (avoids the double-call; warnings still safe).
    sourceAnchors = {};
    resolveGids = () => Promise.resolve(new Map<string, number>());
  }
}
try {
  await attachWarningAnchors(parseResult.warnings, bytes, resolveGids, sourceAnchors);
} catch { /* attachWarningAnchors is contractually no-throw; belt-and-suspenders best-effort */ }
return { file, kind: "sheet", binding, parseResult, sourceAnchors };
```

The inner/outer split matters: a gid fetch that SUCCEEDS but a region extract that THROWS must still hand `attachWarningAnchors` the real `titleToGid` (else valid cell-anchored warnings lose their links). Only a gid-fetch FAILURE uses the empty-map resolver.

- `attachWarningAnchors` already accepts a precomputed `regionAnchors` 4th arg and uses it in lieu of self-computing (`attachWarningAnchors.ts:27,49`) — so passing `sourceAnchors` avoids double work; the warning-attachment **output** is otherwise unchanged. (The *timing* does change: `attachWarningAnchors` today skips `resolveGids` entirely for a warning-free sheet, `attachWarningAnchors.ts:29`; `prepareOne` now fetches gids eagerly for every sheet — see the "new cost" note below.)
- **New cost:** the gid fetch (`listSheetGids`) now runs for **every** sheet, not just sheets with cell-anchored warnings. This is one lightweight Sheets `spreadsheets.get` per sheet, parallelized under `ONBOARDING_PREPARE_CONCURRENCY`, on top of the XLSX export scan already performs. Marginal at scan; removes ~20s/sheet from finalize.

### 5.2 Thread through Phase-1 staging

- `PreparedOnboardingFile` sheet variant (`runOnboardingScan.ts:135-142`): add `sourceAnchors: Record<string, SourceAnchor>`.
- `scanPreparedFileWithTx` (`runOnboardingScan.ts:585-592`): pass `sourceAnchors: prepared.sourceAnchors` into the `runPhase1` args.
- `Phase1Args` (`lib/sync/phase1.ts:70-77`): add optional `sourceAnchors?: Record<string, SourceAnchor>`.
- `Phase1PendingSyncRow` (`lib/sync/phase1.ts:30-42`): add optional `sourceAnchors?: Record<string, SourceAnchor>`.
- `runPhase1`'s staging upsert row build (`phase1.ts:361-373`): set `sourceAnchors: args.sourceAnchors`.

Optionality is deliberate: only the onboarding scan supplies anchors. Cron/push callers of `runPhase1` leave it `undefined`, and their staged rows (not consumed by wizard finalize) fall to the `'{}'` DB default.

Under `exactOptionalPropertyTypes`, an optional field cannot be assigned `undefined`; the thread uses the conditional-spread idiom already established in the apply core — `...(args.sourceAnchors !== undefined ? { sourceAnchors: args.sourceAnchors } : {})` (`phase2.ts:301,376`; finalize route.ts:990,1170) — rather than `sourceAnchors: args.sourceAnchors`.

### 5.3 Persist (`upsertLivePendingSync`, `runOnboardingScan.ts:382-445`)

- Add `source_anchors` to the INSERT column list and a `$N::jsonb` value, passing the **raw object** `row.sourceAnchors ?? {}` (never `JSON.stringify` — postgres.js serializes; mirrors `parse_result` at `$4::jsonb` in the same statement and the cron precedent).
- **Add `source_anchors = excluded.source_anchors` to the `ON CONFLICT ... DO UPDATE SET` clause** (route currently updates parse_result et al. but not this new column). This is **required for rescan correctness**: a re-stage hits the conflict path, and without it the re-staged row would keep stale anchors.

### 5.4 Rescan — auto-wired, no separate code

`rescanWizardSheet` re-fetches + re-parses via `prepareOnboardingFiles` (`rescanWizardSheet.ts:227`) and re-stages via `scanOnboardingPreparedFiles([prepared], …)` (`rescanWizardSheet.ts:281`) — the **same** `prepareOne` + `runPhase1` + `upsertLivePendingSync` chain. So fresh, generation-consistent anchors are recomputed and repersisted on every rescan automatically once §5.1-5.3 land. No rescan-specific edits beyond the shared thread.

## 6. Finalize side — read, delete export

`app/api/admin/onboarding/finalize/route.ts`:

1. **Read under the lock (generation-consistent):** add `source_anchors` to the locked `freshRead` SELECT (route.ts:766-800) and to `PendingFinalizeRow`. The freshRead is already pinned to `(wizard_session_id, drive_file_id, staged_id, staged_modified_time)`, so the anchors read come from the exact staged generation being published. (`selectFinishableCleanRows` at route.ts:382-407 need not select it — the locked freshRead is authoritative.)
2. **Coerce best-effort:** decode via `coerceJsonbObject` (`lib/db/coerceJsonbObject.ts:61`). **Unlike `parse_result`, a coercion failure must NOT throw** — anchors are best-effort, so any `JsonbCoercionError` (or empty `'{}'`) resolves to `{}` and publish continues with `#gid=0`. This is the finalize-side guard.
3. **Feed `applyStagedCore`:** pass the coerced anchors to the first-seen branch exactly where `input.sourceAnchors` is used today (route.ts:987-990); an empty `{}` is equivalent to omitting (both yield the current `#gid=0` behavior, since `applyParseResult` uses `region: args.sourceAnchors ?? {}`, `applyParseResult.ts:184`).
4. **Delete:** `defaultFetchOnboardingSourceAnchors` (route.ts:204-211), the `fetchOnboardingSourceAnchors` dep field (route.ts:65) + its `depsWithDefaults` wiring (route.ts:219-220), the pre-lock compute block (route.ts:1149-1158), and the now-unused imports `fetchSheetMarkdownWithBinding` (route.ts:7), `fetchSheetTitleToGid` (route.ts:9), `extractSourceAnchors` (route.ts:10). `SourceAnchor` type import stays (used by the row type).

The freshness gate (`sameTimestamp`, route.ts:734) and the generation-scoped `parse_result` re-read are **untouched** — anchors are never coupled into freshness. This separation is what makes read-from-column safe.

## 7. Write-path × read-path matrix

| Staging path | Populates `source_anchors`? | Notes |
|---|---|---|
| Initial onboarding scan (`runOnboardingScan` → `prepareOne` → `runPhase1` → `upsertLivePendingSync`) | **Yes (required wiring)** | §5.1-5.3 |
| Per-sheet rescan (`rescanWizardSheet` → same prepare+scan path) | **Yes (auto, via ON CONFLICT DO UPDATE)** | §5.4 — no separate code |
| Cron / push / manual sync staging (`runScheduledCronSync.upsertLivePendingSync`, `phase1` via non-onboarding modes) | No → DB default `'{}'` | Rows not consumed by wizard finalize; default-safe |
| `runManualStageForFirstSeen.upsertLivePendingSync` | No → DB default `'{}'` | If ever wizard-consumed, finalize uses `#gid=0`; acceptable best-effort. Not wired now (YAGNI) |

| Read path | Uses `source_anchors` | Notes |
|---|---|---|
| Finalize first-seen apply (`processApprovedRow` → `applyStagedCore`) | **Yes** | §6 — the whole point |
| Finalize existing-show / re-onboard branches (route.ts:908-939) | No | These never consumed anchors even today |
| `readLivePendingSync` (`Phase1PendingSyncRow` reader) | No | Field optional; readers omit it — no SELECT change needed |

## 8. Guard conditions (every input)

- **`bytes` undefined** (test mocks, or `fetchMarkdownWithBinding` returned no bytes — the deps type marks `bytes?` optional, `runOnboardingScan.ts:150`): skip compute → `sourceAnchors = {}`.
- **`listSheetGids` throws** (Drive/Sheets failure, no injected mock in a unit test): caught → `{}` + `attachWarningAnchors` keeps its lazy resolveGids (unchanged behavior).
- **`extractSourceAnchors` throws** (workbook edge case): caught → `{}`. Never breaks the scan (mirrors the existing best-effort contract, `attachWarningAnchors.ts:14-15`).
- **Empty result** (`{}` — no allowlisted tabs / no anchorable regions): persisted as `{}`; finalize → `#gid=0`. Valid, common, not an error.
- **`source_anchors` reads back as a legacy/corrupt scalar** at finalize: `coerceJsonbObject` throws `JsonbCoercionError` → caught → `{}` (publish continues). Anchors never wedge a publish.
- **DB default for un-populated rows:** `'{}'` → `#gid=0`. No null branch exists (`NOT NULL`).
- **postgres.js jsonb encoding:** pass the raw object to `$N::jsonb`; never `JSON.stringify` (would double-encode). Matches `parse_result` in the same INSERT and the cron `shows.source_anchors` precedent.

## 9. Invariants preserved

- **Invariant #2 (per-show advisory lock, single-holder).** No `pg_advisory*` acquisition is added, removed, or moved. This change deletes a **pre-lock** Drive call and adds a column to an **already-locked** SELECT; the sole `show:<id>` acquirer stays `defaultWithRowTx` (route.ts:186), and `adoptShowLockHeld` stays non-acquiring. `tests/auth/advisoryLockRpcDeadlock.test.ts` must pass **unchanged** (the named `tryFinalizeLock` handler is not split). Rescan's lock order (`rescanWizardSheet.ts:244-269`) is untouched.
- **Invariant #9 (Supabase call-boundary).** N/A — the scan/finalize/rescan paths use raw `postgres.js` SQL (`tx.unsafe` / tagged), not the Supabase JS client. No `{ data, error }` destructure surface is added, so no `_metaInfraContract` registry row is required.
- **Invariant #5 (no raw error codes in UI).** N/A — no new user-facing code or copy. The `#gid=0` fallback is silent and pre-existing; anchors never surface an error string.
- **No global sync cursor / email canonicalization / PostgREST DML lockdown:** unaffected (no new table, no email boundary, no new RPC-gated surface; `pending_syncs` DML posture is unchanged by a column add).

## 10. Meta-test inventory (declared)

- **CREATES:** none.
- **EXTENDS:** none structurally. `tests/auth/advisoryLockRpcDeadlock.test.ts` is a **regression witness** (must stay green, topology unchanged) — not extended.
- **Rationale for "no new meta-test":** the change adds no Supabase-client call site (invariant 9 registry N/A), no `admin_alerts` catalog row, no new advisory-lock surface, no new RPC-gated table. The correctness risks are covered by the functional tests in §11, not a structural registry.

## 11. Test plan (TDD, per task)

Each test states the concrete failure mode it catches; expected values derive from fixtures, not hardcoded literals.

1. **Migration + manifest (DB):** `pending_syncs.source_anchors` exists with default `'{}'`; `schema-manifest.json` includes it; `validation-schema-parity` passes. *Catches:* forgotten manifest regen / validation apply (silent prod drift).
2. **Scan persists computed anchors:** stage a first-seen sheet whose fixture has an anchorable region → `pending_syncs.source_anchors` is a non-empty object equal to `extractSourceAnchors(bytes, gids)` for that fixture. *Anti-tautology:* assert against the `extractSourceAnchors` output for the fixture (data source), not the rendered anchor. *Catches:* anchors not threaded / not written.
3. **Scan best-effort failure:** `listSheetGids` (or `extractSourceAnchors`) throws → row persists `'{}'`, scan still succeeds, warnings still parse. **Also cover a sheet WITH a cell-anchored warning:** after the eager gid fetch fails, `attachWarningAnchors`'s lazy resolver runs and must still not throw (the warning is simply left link-less) — proving the eager-failure path doesn't break warning attachment. *Catches:* a compute failure breaking the scan or the warning-anchor path.
4. **Rescan refresh (ON CONFLICT):** stage a row, then rescan a fixture with different anchorable content → `source_anchors` reflects the NEW parse (not the stale first value). *Catches:* missing `source_anchors = excluded.source_anchors` in the upsert.
5. **Finalize reads column, does NO export (structural, not a spy):** stage a row with known `source_anchors`, run finalize → `applyStagedCore` receives exactly the stored anchors. Because §6 deletes the import AND the injectable `fetchOnboardingSourceAnchors` dep, the negative-regression assertion is **structural/dependency-based, not a spy on a deleted function**: (a) the finalize execution double supplies NO anchor-fetch dependency (the dep field no longer exists on `FinalizeRouteDeps`), and (b) a source-level guard asserts `app/api/admin/onboarding/finalize/route.ts` no longer imports `fetchSheetMarkdownWithBinding` / `fetchSheetTitleToGid` / `extractSourceAnchors`. *Catches:* the export not actually deleted; anchors not read.
6. **Finalize empty/corrupt anchors → publish still succeeds:** `source_anchors = '{}'` and (separately) a corrupt scalar → finalize applies with `{}` (no throw), show is created, publish completes. *Catches:* a bad anchors column wedging publish.
7. **Existing finalize endpoint tests:** update the doubles that inject `fetchOnboardingSourceAnchors` (that dep is deleted). *Catches:* stale test scaffolding.

## 12. Self-consistency / numeric sweep

- Column name `source_anchors` (snake_case, matches `shows.source_anchors`); TS field `sourceAnchors` (camelCase) — used consistently in §3, §5, §6, §7.
- Cost figures: ~20.8s/export (`fetch.ts:45`), ~145s for 7 shows, ~7s residual — used consistently in §1, §2.
- Default literal `'{}'` and fallback `#gid=0` — used consistently in §4, §6, §8.
- Migration filename `20260701000001_pending_syncs_source_anchors.sql` — §4.2, §11.1.
- "Sequential loop kept; parallelization out of scope" — §2, §9 (no lock/error change), §10.

## 13. Out of scope

- Parallelizing the finalize per-row loop (deferred; separate change with its own error-semantics/pool analysis).
- Persisting `source_anchors` on cron/push/manual-sync staged rows (they don't feed wizard finalize; default `'{}'`).
- Backfilling anchors for rows staged before this ships (a rescan repopulates; `#gid=0` in the interim, per the ratified fallback decision).
- Any change to how `shows.source_anchors` is written by the apply core or cron path.

## 14. Resolved decisions (do-not-relitigate)

These were decided with the maintainer during brainstorming; they are settled contracts, not open questions:

1. **Null/empty anchors → `#gid=0`, never lazy-recompute.** Finalize does NO Drive export under any code path, including for pre-ship in-flight sessions and best-effort failures. A rescan repopulates exact anchors; `#gid=0` is the accepted interim (it is already today's best-effort fallback). Ratified over the "lazy-compute-on-null" alternative precisely to delete the slow path entirely.
2. **`NOT NULL DEFAULT '{}'`, not nullable.** The empty-object default is the single degradation signal; there is intentionally no null case. Do not propose a nullable column + null-guards.
3. **Anchors computed only on the onboarding-scan path; other staging paths default-safe to `'{}'`.** Cron/manual rows are not wizard-finalized; wiring them is YAGNI (§13). Not an oversight.
4. **Finalize coerces anchors best-effort (never throws on a corrupt column).** Deliberately different from `parse_result`, which must be valid. Anchors must never wedge a publish.
5. **The finalize per-row loop stays sequential.** Parallelization is a separate, deferred change (§2, §13). This spec's win is entirely from removing the export, not from concurrency; lock/checkpoint/error behavior is byte-identical.
6. **The extra per-sheet gid fetch at scan is intended.** It moves ~20s/sheet off finalize onto the parallelized scan prepare phase; a marginal metadata call on top of the XLSX export scan already performs. Not a scan regression to "optimize away."
