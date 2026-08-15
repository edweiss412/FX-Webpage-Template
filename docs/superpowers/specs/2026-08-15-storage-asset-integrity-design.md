# Storage asset integrity: recovery deletion authority + `_pending` orphan reclamation

**Date:** 2026-08-15
**Ledger entries:** `BL-RECOVERY-CLEANUP-DELETES-LIVE-BYTES` (HIGH / CORRECTNESS), `BL-SNAPSHOT-UPLOAD-THROW-ORPHANS-OBJECTS` (medium / STORAGE HYGIENE) — both filed from cross-model review of PR #761, both pre-existing and widened by that PR (variants ride `uploadedPaths`).
**Branch:** `fix/storage-asset-integrity`
**Probe:** `docs/superpowers/specs/probes/2026-08-15-storage-asset-integrity-probe.ts` (runs the shipped `assetRecovery` / `snapshotAssets` / `runDiagramGc` bodies against in-memory ports; transcript in §0).

---

## §0 Evidence (executable, not prose)

Probe transcript, 2026-08-15, against `origin/main` @ `1e503d714`:

```
PROBE P1 loser outcome: no_op
PROBE P1 winner committed manifest paths: [
  'diagram-snapshots/shows/1111…/2222…/embedded-obj1.png'
]
PROBE P1 storage keys after loser cleanup: []
PROBE P1 manifestTargetExists: false

PROBE P2 threw: drive 500 mid-run
PROBE P2 tx calls (ALL rolled back with the aborting apply tx): [ 'insertPendingSnapshotUpload', 'markPendingSnapshotDeleteStarted' ]
PROBE P2 orphaned _pending objects: [ 'diagram-snapshots/shows/1111…/_pending/<runUuid>/embedded-ok.png' ]
PROBE P2 gc result: { orphanBlobsDeleted: 0, pendingPrefixesDeleted: 0, promotedRowsDeleted: 0 }
PROBE P2 _pending objects SURVIVING gc: [ same object ]
```

P1 drives the real `assetRecovery` through the filed interleaving: the loser passes the pre-upload gate, the winner commits `snapshot_status: 'complete'` between the loser's gate and its commit attempt, the loser's locked read returns `no_op`, and its cleanup removes the byte-identical canonical paths the winner's committed manifest references. P2 drives the real `snapshotAssets` through a mid-run drive throw, then runs the real `runDiagramGc` against the post-rollback world (no ledger row) with `cutoffDays: 0` — even a zero-day cutoff reclaims nothing, because the object sweep explicitly skips the `_pending` segment.

Overlap reachability (the entry's "cheapest probe"): `runAssetRecoveryCron` has no job-level lock at any layer — the route body calls it directly (`app/api/cron/asset-recovery/route.ts`, `GET`), `runCronRoute` adds summary plumbing only (`lib/cron/withCronRunSummary.ts`), and the cron fires every 15 minutes via pg_cron HTTP dispatch (`fxav_cron_asset_recovery`, `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json:12`), which is fire-and-forget: a run whose drive downloads outlast the interval overlaps the next firing, and a manual route invocation overlaps any live run. The race window is the entire unlocked download+upload phase (minutes), not an instruction-level window.

## §1 Scope

Two repairs, no DB migration, no UI surface:

1. **Deletion authority for recovery cleanup** (`lib/sync/assetRecovery.ts`) — settle the recovery concurrency model at spec level and re-gate the loser's cleanup on proof.
2. **`_pending` orphan reclamation** (`lib/sync/snapshotAssets.ts`, `lib/sync/diagramGc.ts`, storage ports) — a removal capability on the snapshot storage port plus a GC stage that reaches row-less `_pending` prefixes.

### §1.1 Resolved scope — do not relitigate

| # | Decision | Ratification / basis |
|---|----------|----------------------|
| R1 | The release-upload-relock shape of recovery stays. Uploads run OUTSIDE the show advisory lock by design ("recovery uses a lock-free pre-pass because it repairs an already-live partial snapshot", `lib/sync/phase2.ts` comment above the `snapshotAssetsForApply` call site, ~:431). Holding the xact lock across multi-minute drive downloads would block every sync of the show. Re-proposing a hold-one-lock design is out of scope. |
| R2 | No job-level cron lock is added. With deletion re-gated on proof (§2), overlapping recovery runs are wasteful but harmless (uploads are `upsert: true` at deterministic paths — `lib/sync/assetRecovery.ts` `defaultRecover` storage adapter; `lib/sync/defaultSnapshotAssetsForApply.ts` upload adapter). A job-scope advisory xact lock would need a transaction held open for the whole run (rejected: long-open tx), and a session-level lock leaks on serverless crash under pooling (rejected). Considered and rejected here; do not re-derive. |
| R3 | Canonical-path objects left behind by an `assetRecovery` mid-loop upload throw are NOT deleted in the throw path. The throw path holds no lock and therefore no proof (§2 model); deletion there re-creates the live-byte-deletion hazard this spec removes. They are reclaimed as described in §7 L2. Documented limit, not a finding. |
| R4 | No DB migration. Fix 2b reads existing tables (`pending_snapshot_uploads`, `shows`) and storage listings only. The validation-schema-parity checklist is N/A. |
| R5 | GC's existing suppression rules stay: row-BACKED `_pending` prefixes remain owned by the claim path (`claimPendingRows`, `lib/sync/diagramGc.ts`), and the object sweep's per-show suppression while `snapshot_status` is a partial-failure state (`suppressOrphanDeletion`, `lib/sync/diagramGc.ts`) is unchanged. The new stage touches ONLY row-less prefixes (§4). |
| R6 | The deletion-authority model in §2 is THE ratified concurrency model for recovery. The alternative ("never delete anything, leave all reclamation to GC") was considered and rejected because GC's partial-failure suppression would retain drift orphans indefinitely for a show stuck in `partial_failure` (up to `MAX_RECOVERY_TOTAL_BYTES` per drifted attempt). |
| R7 | `snapshotAssets` stays log-free (its module contract: the "Telemetry ownership" header comment at the top of `lib/sync/diagramVariants.ts`, and the invariant-10 comments in `lib/sync/snapshotAssets.ts`). The best-effort catch cleanup (§3) swallows its own failure silently; the orphan it leaves is reclaimed by §4. No new in-lock logging. |
| R8 | Both ledger entries are settled in ONE spec because they share the deletion-authority question: fix 1 removes deletions that lack proof; fix 2 adds reclamation where proof is structural (run-private prefix, no ledger row, aged out). |

Threat model fence: this spec defends against accidental faults — exceptions mid-run, process crashes, transaction rollback, overlapping cron firings. An adversary with storage credentials or SQL access is out of scope and files to documented limits.

Consequence bound: after this spec ships, (a) no recovery code path removes a storage object that any committed manifest references; (b) every storage object the pipeline writes is either referenced by a committed manifest, owned by a visible ledger row, or reclaimable by a bounded GC rule; residual unreclaimable classes are enumerated in §7 with their bound. "Conservative keep plus a later reclamation route" is a documented limit, not a finding.

## §2 Fix 1 — deletion authority: proof-gated recovery cleanup

### §2.1 The model

Recovery is **concurrent-idempotent**:

- Any number of overlapping runs MAY upload. Paths are deterministic per `(showId, snapshot_revision_id, asset id)` (`assetPath`/`canonicalPrefix`, `lib/sync/assetRecovery.ts`), content is fingerprint-verified before upload (`collectVerifiedAssets` sha256/md5 gates), and uploads are `upsert: true` — so concurrent writers converge on identical bytes at identical paths.
- Commit is CAS-gated under the show advisory lock: `readLockedShow` takes `FOR UPDATE` (`AssetRecoveryPostgresTx.readLockedShow`) inside `withShowLock(..., { tryOnly: true })` (the tryOnly branch of `lockSql`, `lib/sync/lockedShowTx.ts:59`, emitting `pg_try_advisory_xact_lock(hashtext('show:' || $1))`), and `updateRecoveredDiagrams` re-checks `snapshot_revision_id` in its `WHERE` clause.
- **A run may DELETE a canonical-path object only with proof, read under the show lock, that no committed manifest references it.** The only such proof is: the locked current `snapshot_revision_id` differs from the revision the run uploaded under. Revision ids are fresh UUIDs minted per snapshot run (`snapshotAssets`, `lib/sync/snapshotAssets.ts` `uuid()` calls) and `updateRecoveredDiagrams`'s CAS means a superseded revision can never become current again — so observed drift is permanent, and deletion under drift is safe forever.

### §2.2 Behavior change per outcome branch

Current cleanup (`lib/sync/assetRecovery.ts`, the two `Promise.all(uploadedPaths.map(...))` sites after the commit `withShowLock`):

| Branch | Today | After | Why |
|--------|-------|-------|-----|
| `skipped` (commit-lock contention) | deletes `uploadedPaths` | **never deletes** | No lock was held; no proof. The contending holder may be committing this very revision. |
| `no_op`, locked revision EQUAL to the uploaded revision (winner completed it) | deletes `uploadedPaths` | **never deletes** | The committed manifest references exactly these paths. This is the P1 live-byte deletion. |
| `no_op`, locked revision DIFFERENT (drift + status left partial_failure) | deletes | deletes | Proof held: drift observed under lock. |
| `no_op`, locked show/diagrams missing (`readLockedShow` null or unwrapped null) | deletes | **never deletes** | No revision proof. Show-deletion cleanup is GC's domain (§7 L4). |
| `revision_drift` (pre-check mismatch or CAS `updated === false`) | deletes | deletes | Both sites observe the mismatch under the lock. |
| committed outcomes (`recovered` / `restage_required` / `partial_failure`) | no cleanup | no cleanup | Paths are now referenced. |

Mechanically: the commit-branch `no_op` return gains the locked revision when one was readable — `{ outcome: "no_op"; lockedSnapshotRevisionId?: string }` on `AssetRecoveryResult` — and the post-lock cleanup becomes:

```
delete iff outcome === "revision_drift"
     or (outcome === "no_op"
         and lockedSnapshotRevisionId is present
         and lockedSnapshotRevisionId !== previewDiagrams.snapshot_revision_id)
```

The pre-upload gate's `no_op`/`revision_drift` returns happen before any upload (`uploadedPaths` does not exist yet) and need no cleanup; the added field is harmless there and may be populated for symmetry. The top-level `assetRecovery` early `no_op` (preview read shows nothing to do) is unchanged. The optional-field shape keeps every existing consumer compiling (`runAssetRecoveryCron` switches on `outcome` only).

`remove` stays optional on `AssetRecoveryStorage` (`lib/sync/assetRecovery.ts:56`); the branches that retain deletion keep the existing `deps.storage.remove?.(path)` call shape.

## §3 Fix 2a — snapshot upload throw: best-effort port-level cleanup

`snapshotAssets` uploads to the run-private prefix `diagram-snapshots/shows/<showId>/_pending/<runUuid>/` (`tempPrefix`, `lib/sync/snapshotAssets.ts`), where `runUuid` is freshly minted per run — no other actor ever writes or references that prefix, so removing it is race-free by construction.

Changes:

- `SnapshotAssetsStorage` (`lib/sync/snapshotAssets.ts:31`) gains an optional removal capability: `removePrefix?(prefix: string): Promise<void>`.
- The existing catch (`snapshotAssets` tail: `markPendingSnapshotDeleteStarted` then rethrow) additionally attempts `await args.storage.removePrefix?.(temp)` BEFORE rethrowing, wrapped so a cleanup failure never masks the original error (swallow, per R7 — no in-lock logging). `markPendingSnapshotDeleteStarted` stays: it is the correct signal in the shapes where the enclosing tx COMMITS despite the throw being handled upstream, and it costs nothing when the tx rolls back (P2 shows both calls discarded together).
- Adapters gain the implementation, following the GC storage adapter's list-then-remove pattern (`defaultStorage.removePrefix`, `lib/sync/diagramGc.ts`) with invariant-9 `{ data, error }` destructuring:
  - `lib/sync/defaultSnapshotAssetsForApply.ts` (the apply-path adapter — today upload-only),
  - the `runScheduledCronSync` / `runManualStageForFirstSeen` wiring that reaches the same adapter (enumerated precisely in the plan's holder survey).

Why keep 2b if 2a exists: 2a cannot run when the process dies mid-upload, when the throw happens outside the catch's reach, or when its own storage call fails. 2a is the fast path; §4 is the guarantee.

## §4 Fix 2b — GC reclaims row-less `_pending` prefixes

New stage in `runDiagramGc` (`lib/sync/diagramGc.ts`), after the existing claim loop, counted in a new `DiagramGcResult` field `pendingOrphanPrefixesDeleted` and surfaced in the diagram-gc route's summary counts (`app/api/cron/diagram-gc/route.ts` inline `summary.counts`).

Algorithm, per GC run:

1. `listShowIdsForPendingSweep()` — new optional `DiagramGcTx` method: `select id::text from public.shows`. Deliberately ALL shows, including `diagrams is null` (an aborted first apply can orphan `_pending` bytes on a show whose `diagrams` never committed; the existing `listShows` filters `s.diagrams is not null` and would never visit them).
2. `listPendingTempPrefixes()` — new optional `DiagramGcTx` method: `select temp_prefix from public.pending_snapshot_uploads` with NO state filter. Any visible row, whatever its lifecycle state, keeps its prefix off-limits to this stage (claim path and stuck-alert path own row-backed prefixes, R5).
3. For each show id: `storage.list('diagram-snapshots/shows/<id>/_pending/')` (cheap when empty — the common case). Group listed objects by their `<runUuid>` segment (first path segment under `_pending/`).
4. A group is **reclaimable** iff (a) its full prefix is not in the visible-row set from step 2, and (b) EVERY object in the group has a `createdAt` and every `createdAt` is older than `PENDING_ORPHAN_MIN_AGE_MS` (named module constant, 24 hours). A missing `createdAt` anywhere in the group, or any object younger than the cutoff, skips the whole group (conservative keep; the next GC run re-evaluates).
5. Reclaim with `storage.removePrefix(prefix)`; increment `pendingOrphanPrefixesDeleted` per prefix.

Why the age gate is load-bearing and why 24 hours: an IN-FLIGHT run's `insertPendingSnapshotUpload` is uncommitted and therefore INVISIBLE to step 2 (read-committed), so a fresh prefix with no visible row can be a live upload in progress. The age gate is what makes "no visible row" safe to act on. 24h dominates every legitimate upload-phase duration by a wide margin: per-asset idle is bounded by the drive stall guard (`DRIVE_ASSET_STALL_TIMEOUT_MS`, `lib/drive/stallGuard.ts`), the run is capped at `MAX_RECOVERY_ENTRIES` (60) entries and `MAX_RECOVERY_TOTAL_BYTES` (3 GiB) total (`lib/sync/assetRecovery.ts:52-54`), and the newest-object rule means an actively-uploading run (which keeps creating objects) can never age out mid-run. The claim path's shorter `uploaded_at` grace window (`claimPendingRows`) is not reused because that clock starts at a COMMITTED `uploaded_at`; this stage has no row and must be strictly more conservative.

Concurrency: two overlapping GC runs racing on the same reclaimable prefix are benign — `removePrefix` lists first and no-ops on empty (`defaultStorage.removePrefix` returns early when the listing is empty). A runUuid can never be re-used by a future run (fresh UUID per run), so a reclaimed prefix never collides with new work.

## §5 Invariant compliance

- **Invariant 2 (advisory locks, single-holder):** no new lock surface. Fix 1 consumes data read under the EXISTING recovery lock holders (the two `withShowLock` calls inside `assetRecovery`; JS-side wrapper layer, unchanged topology — `tests/auth/advisoryLockRpcDeadlock.test.ts` template untouched). Fix 2b's GC stage holds no show lock, safe because its targets are row-less, run-private, aged-out prefixes no live actor can reference.
- **Invariant 9 (call-boundary):** every new Supabase storage call (`removePrefix` adapters) destructures `{ data, error }` and throws on `error`, matching the existing adapters in the same files. These sync-layer adapters are outside the auth registry's scope (`tests/auth/_metaInfraContract.test.ts` covers auth helpers); each new call site carries `// not-subject-to-meta: sync storage adapter — throws on destructured error; consumed by <caller>'s typed infra outcome` per invariant 9's escape hatch.
- **Invariant 10 (observability):** no new HTTP mutation surface. Both affected crons already emit `runCronRoute` summaries; the diagram-gc summary gains `pendingOrphanPrefixesDeleted`; the asset-recovery route's `infra_error` outcome (which is what an `assetRecovery` upload throw becomes via `runAssetRecoveryCron`'s catch) is unchanged and remains the signal for §7 L2. `snapshotAssets` remains log-free (R7).
- **§12.4 error catalog:** no new or edited user-visible codes; no catalog/regen work.
- **Invariant 8 (impeccable):** no UI surface. `impeccable-gate: N/A — no UI surface` goes in the plan closeout marker.

## §6 Test strategy (plan details the tasks; this fixes the shapes)

All tests run against the REAL exported functions with injected in-memory ports (the probe's construction), asserting on port-state contents — storage map keys — not call counts (anti-tautology: a test that only counts `remove` invocations can pass with the wrong paths removed).

1. **P1 regression (fix 1):** the probe's interleaving as a vitest case — winner commits between loser's gate and commit; assert the winner's manifest paths SURVIVE in the storage map and the loser returns `no_op`. Companion cases: `skipped` keeps paths; drift (pre-check and CAS-false separately) DELETES the loser's paths (the proof branch must keep working — deleting the deletion entirely would pass a keep-only test suite, premise-guard both directions); locked-show-null `no_op` keeps paths.
2. **Fix 2a:** `snapshotAssets` with a mid-run throwing drive port and a recording storage port: assert `removePrefix` was invoked with exactly the run's temp prefix AND the storage map holds no `_pending` object afterward; assert the ORIGINAL error propagates when `removePrefix` itself rejects; assert a port WITHOUT `removePrefix` (undefined) still rethrows cleanly (optional-capability guard).
3. **Fix 2b:** GC stage matrix — row-less + aged → reclaimed (map emptied under that prefix, count incremented); row-backed (any lifecycle state) → untouched; row-less + one young object in group → whole group untouched; row-less + missing `createdAt` on one object → untouched; show with `diagrams` null but orphaned `_pending` → reclaimed (the `listShowIdsForPendingSweep` reach); existing sweep/claim/promote stages unaffected (result fields unchanged for them).
4. **Structural:** the probe file stays committed and runnable as the executable citation for review rounds.

Fixture premises stated executably per `docs/agents/writing-plans.md` anti-tautology rules (e.g. the aged fixture is older than the cutoff BY CONSTRUCTION from the constant, not a hardcoded date that silently drifts).

## §7 Documented limits

| # | Limit | Bound / reclamation route |
|---|-------|---------------------------|
| L1 | A `skipped` loser's uploads are never deleted by that run. | They are byte-identical upserts at canonical paths: either a later run commits the same revision (objects become live) or the revision drifts (objects become GC-sweepable under the stale-revision rule once the show leaves partial-failure states — `suppressOrphanDeletion`). Bounded per attempt by `MAX_RECOVERY_TOTAL_BYTES`; attempt cadence bounded by the drift cooldown (`cooldownActive`, exponential to 600s cap). |
| L2 | An `assetRecovery` mid-loop upload throw leaves already-uploaded canonical objects (R3). | Same routes as L1; surfaced as the cron's `infra_error` outcome in the run summary. Objects are re-upserted (no growth) on every retry. |
| L3 | While a show REMAINS in a partial-failure state, the object sweep is suppressed for it, so stale-revision orphans from L1/L2 wait until the show heals or is restaged. | Pre-existing GC design (R5); per-show cap as L1. |
| L4 | Storage prefixes of DELETED show rows are never swept (GC iterates shows from the DB). | Pre-existing, unchanged, out of scope; noted for completeness. |
| L5 | `pending_snapshot_uploads` rows that COMMIT with `delete_started_at` set rely on the existing `PENDING_SNAPSHOT_DELETE_STUCK` alert path (`emitStuckAlerts`) rather than automated reclamation. | Pre-existing, unchanged. |
| L6 | Fix 2b trusts storage `createdAt`; a group containing an object without it is never reclaimed. | Conservative keep; Supabase storage list supplies `created_at` for objects, so the expected steady-state exposure is nil. |
| L7 | Fix 2a's cleanup failure is silent by contract (R7). | The orphan it leaves is exactly a §4 target; reclaimed within one GC cycle after aging. |

## §8 Out of scope

- Job-level cron mutual exclusion (R2).
- Any change to promote/claim lifecycle for row-backed pending uploads (R5, L5).
- Deleted-show prefix sweeping (L4).
- The `BL-PRIVATE-IMAGE-POSTMERGE-PROBE` validation-evidence entry (separate verification debt, not touched by this arc).
