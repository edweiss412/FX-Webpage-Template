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
| R6 | The deletion-authority model in §2 is THE ratified concurrency model for recovery. The alternative ("never delete anything, leave all reclamation to GC") was considered and rejected because GC's partial-failure suppression would retain drift orphans indefinitely for a show stuck in `partial_failure` (up to the §7 per-attempt upload bound per drifted attempt). |
| R7 | `snapshotAssets` stays log-free (its module contract: the "Telemetry ownership" header comment at the top of `lib/sync/diagramVariants.ts`, and the invariant-10 comments in `lib/sync/snapshotAssets.ts`). The best-effort catch cleanup (§3) swallows its own failure silently; the orphan it leaves is reclaimed by §4. No new in-lock logging. |
| R8 | Both ledger entries are settled in ONE spec because they share the deletion-authority question: fix 1 removes deletions that lack proof; fix 2 adds reclamation where proof is structural (run-private prefix, no ledger row, aged out). |
| R9 | Canonical-prefix objects of deleted/ghost shows stay unswept (§7 L4). Pre-existing before this arc; automating their reclamation is a separate decision with its own retention questions, filed only if it clears the ledger filing bar (AGENTS.md). This arc widens reclamation ONLY for `_pending` prefixes. |

Threat model fence: this spec defends against accidental faults — exceptions mid-run, process crashes, transaction rollback, overlapping cron firings. An adversary with storage credentials or SQL access is out of scope and files to documented limits.

Consequence bound: after this spec ships, (a) no recovery code path removes a storage object that any committed manifest references; (b) every storage object the pipeline writes is either referenced by a committed manifest, owned by a visible ledger row, or reclaimable by a bounded GC rule; (c) a group the GC stage declines to reclaim for a reason that could indicate a PROBLEM is counted and surfaced in the run summary — the age-retention class is deliberately excluded from this and its reasoning is fenced in §4. Residual unreclaimable classes are enumerated in §7 with their bound. "Conservative keep plus a later reclamation route" is a documented limit, not a finding.

## §2 Fix 1 — deletion authority: proof-gated recovery cleanup

### §2.1 The model

Recovery is **concurrent-idempotent**:

- Any number of overlapping runs MAY upload. Paths are deterministic per `(showId, snapshot_revision_id, asset id)` (`assetPath`/`canonicalPrefix`, `lib/sync/assetRecovery.ts`), content is fingerprint-verified before upload (`collectVerifiedAssets` sha256/md5 gates), and uploads are `upsert: true` — so concurrent writers converge on identical bytes at identical paths.
- Commit is CAS-gated under the show advisory lock: `readLockedShow` takes `FOR UPDATE` (`AssetRecoveryPostgresTx.readLockedShow`) inside `withShowLock(..., { tryOnly: true })` (the tryOnly branch of `lockSql`, `lib/sync/lockedShowTx.ts:59`, emitting `pg_try_advisory_xact_lock(hashtext('show:' || $1))`), and `updateRecoveredDiagrams` re-checks `snapshot_revision_id` in its `WHERE` clause.
- **A run may DELETE a canonical-path object only with proof, observed inside the locked transaction, that no committed manifest references it.** The proof is: the current `snapshot_revision_id` differs from the revision the run uploaded under, observed while the show row is held `FOR UPDATE`. That observation takes exactly two forms, and both qualify: (a) a DIRECT locked read (`readLockedShow`) returning a different revision — the pre-check and commit-branch drift sites; (b) the CAS UPDATE matching zero rows (`updateRecoveredDiagrams` returns `false`): its `WHERE` clause evaluates the same `coalesce(diagrams->'current'->>'snapshot_revision_id', diagrams->>'snapshot_revision_id')` against the expected revision, on the same row, in the same transaction, under the same row lock — a `false` return IS an observation of inequality at that instant, not an inference. Revision ids are fresh UUIDs minted per snapshot run (`snapshotAssets`, `lib/sync/snapshotAssets.ts` `uuid()` calls) and every commit path CAS-gates on the expected revision, so a superseded revision can never become current again — observed drift is permanent in both forms, and deletion under drift is safe forever. (In practice form (b) is a belt: after an EQUAL locked read in the same transaction, no concurrent writer can change the row before the UPDATE — it sits behind the same `FOR UPDATE` row lock — so a reachable CAS-false implies the locked read itself already differed. It keeps deletion authority either way because its proof is self-contained.)

### §2.2 Behavior change per outcome branch

Current cleanup (`lib/sync/assetRecovery.ts`, the two `Promise.all(uploadedPaths.map(...))` sites after the commit `withShowLock`):

| Branch | Today | After | Why |
|--------|-------|-------|-----|
| `skipped` (commit-lock contention) | deletes `uploadedPaths` | **never deletes** | No lock was held; no proof. The contending holder may be committing this very revision. |
| `no_op`, locked revision EQUAL to the uploaded revision (winner completed it) | deletes `uploadedPaths` | **never deletes** | The committed manifest references exactly these paths. This is the P1 live-byte deletion. |
| `no_op`, locked revision DIFFERENT (drift + status left partial_failure) | deletes | deletes | Proof held: drift observed under lock. |
| `no_op`, locked show/diagrams missing (`readLockedShow` null or unwrapped null) | deletes | **never deletes** | No revision proof. Show-deletion cleanup is GC's domain (§7 L4). |
| `revision_drift` (pre-check mismatch or CAS `updated === false`) | deletes | deletes | Both sites hold §2.1 proof: the pre-check via a direct locked read, the CAS site via the zero-row `WHERE` evaluation under the same row lock (§2.1 form (b)). |
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

### §2.3 Refuted interleavings (triage record — kept so later rounds do not re-derive them)

- **"A reads R equal under the lock, then receives CAS-false"** — unreachable. `readLockedShow` takes the show row `FOR UPDATE`; the CAS UPDATE runs on the same row in the same transaction. No concurrent writer can commit a revision change between the two statements, because any competing commit path both takes the show advisory lock and updates the same row (blocking on the row lock until this transaction ends). A CAS-false therefore co-occurs only with a locked read that already differed.
- **"After A observes drift away from R, B commits a manifest for R, and the cleanup deletes committed bytes"** — unreachable. Every commit path CAS-gates on its expected revision: B's `updateRecoveredDiagrams(showId, ..., R)` requires the current revision to STILL be R; once the current revision has moved off R (which is what A observed, and revisions never revert — fresh UUID per snapshot), B's commit of R can never succeed. Post-drift deletion of R-prefixed uploads can therefore never race a future commit of R.

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

New stage in `runDiagramGc` (`lib/sync/diagramGc.ts`), after the existing claim loop, counted in TWO new `DiagramGcResult` fields — `pendingOrphanPrefixesDeleted` (reclaimed) and `pendingOrphanPrefixesRetainedNoCreatedAt` (groups held back ONLY because an object lacked a usable `createdAt`; §7 L6) — both surfaced in the diagram-gc route's summary counts (`app/api/cron/diagram-gc/route.ts` inline `summary.counts`), so the retained class is visible on every run rather than silent. Young groups (age gate not yet met) are NOT counted: they self-resolve on a later run once aged, or leave the set when their row commits; counting them would make every healthy in-flight upload look like a finding.

**The two retention classes are deliberately asymmetric, and the asymmetry is the decision — fenced in both directions so neither side is relitigated.** A group held back for a MISSING `createdAt` is counted, because storage supplies `created_at` for objects, so the expected steady state is zero and any nonzero value is an operator signal (§7 L6). A group held back for AGE — young, mixed-age, or exactly at the cutoff — is not counted, because it is the healthy in-flight state whose steady-state value is "however many uploads are running right now", and a counter that is routinely nonzero during normal operation trains its reader to ignore it. **The accepted consequence, stated so it is a documented limit rather than an oversight:** a run summary cannot distinguish "no row-less `_pending` candidates existed" from "candidates existed and every one was too young". That is accepted because both are healthy, neither loses data, and the age-retained group is re-evaluated on the very next GC cycle — an unhealthy version of this state is unreachable without either the missing-`createdAt` counter or the row-backed claim path's own stuck-alert firing first. Adding an age-retained counter later is a product decision about run-summary noise, not a correctness repair, and needs a demonstrated case where the absence hid something.

Algorithm, per GC run. Candidate discovery is STORAGE-driven, not DB-driven — deliberately. A DB-driven `select id from shows` cannot see two ghost classes: (a) a rolled-back FIRST-SEEN apply — `runPhase2` inserts the show via `applyShowSnapshot` and runs `snapshotAssets` inside the SAME transaction and show lock (`lib/sync/phase2.ts`, the `snapshotAssetsForApply` call preceding `tx.applyShowSnapshot`), so a crash mid-upload rolls back the show row itself while the `_pending` uploads persist under a showId that never existed in the DB; (b) a show row deleted after orphans formed. Storage enumeration sees both.

1. `storage.listChildren('diagram-snapshots/shows/')` — new optional `DiagramGcStorage` method: a SHALLOW (non-recursive) listing returning immediate children; folder-shaped entries (Supabase list entries without an `id`) are the per-show directories, including ghost-show directories. File-shaped entries at this level are ignored.
2. `listPendingTempPrefixes()` — new optional `DiagramGcTx` method: `select temp_prefix from public.pending_snapshot_uploads` with NO state filter. Any visible row, whatever its lifecycle state, keeps its prefix off-limits to this stage (claim path and stuck-alert path own row-backed prefixes, R5).
3. For each show directory: `storage.listChildren('diagram-snapshots/shows/<dir>/_pending/')` (cheap when empty — the common case) to get run-prefix directories, then `storage.list(...)` on each candidate run prefix for its objects and their `createdAt`. Group by run prefix.
4. A group is **reclaimable** iff (a) its full prefix is not in the visible-row set from step 2, and (b) EVERY object in the group has a `createdAt` and every `createdAt` is older than `PENDING_ORPHAN_MIN_AGE_MS` (named module constant, 24 hours). A missing `createdAt` anywhere in the group, or any object younger than the cutoff, skips the whole group (conservative keep; the next GC run re-evaluates).
5. Reclaim with `storage.removePrefix(prefix)`; increment `pendingOrphanPrefixesDeleted` per prefix. A group skipped at step 4 for a missing/unparseable `createdAt` increments `pendingOrphanPrefixesRetainedNoCreatedAt` instead.

Why the age gate is load-bearing and why 24 hours: an IN-FLIGHT run's `insertPendingSnapshotUpload` is uncommitted and therefore INVISIBLE to step 2 (read-committed), so a fresh prefix with no visible row can be a live upload in progress. The age gate is what makes "no visible row" safe to act on, and its safety therefore rests on ONE property: **a live run cannot outlive the gate.**

That property does NOT follow from the guards inside the run, and saying otherwise was the error in this section's first draft (raised as the round-1 BLOCKING finding on the diff, and correct on its mechanics). The drive stall guard (`DRIVE_ASSET_STALL_TIMEOUT_MS` = 30_000, `lib/drive/stallGuard.ts:75`) is an IDLE timer — `reset()` on every chunk (`:49`) — so it bounds the gap between chunks, never the total. A single 50 MiB asset (`MAX_SINGLE_ASSET_BYTES`, `lib/sync/defaultSnapshotAssetsForApply.ts`) delivering 16 KiB every 29s stays inside the idle limit for ~25.8 hours, and `snapshotAssets` uploads an asset only after its download completes — so a run could hold one aged object in its prefix while still live. The per-attempt entry/byte caps bound VOLUME, not TIME, and the "an actively-uploading run keeps creating objects" argument fails for exactly this single-slow-asset shape.

**The bound that actually holds is the execution context's.** Every production site that hands `snapshotAssets` a real storage adapter runs inside the Next.js app server — a route handler (`app/api/cron/sync/route.ts:15` and the onboarding finalize/extract routes declare `maxDuration = 300`; routes declaring nothing take the platform default, likewise minutes) or a server action invoked from one, which the platform bounds the same way. The invocation is killed long before the gate, so a live run's own objects are at most single-digit minutes old against a 24h gate — a margin of ~288×. This is what makes the deletion safe, and because it is a property of the DEPLOYMENT rather than of this module, it is pinned executably by `tests/sync/pendingOrphanAgeGatePremise.test.ts` in two halves — containment of the real-adapter wiring to the app trees, and a headroom check on every declared `maxDuration` — and recorded as a standing dependency in §7 L8.

The claim path's shorter `uploaded_at` grace window (`claimPendingRows`) is not reused because that clock starts at a COMMITTED `uploaded_at`; this stage has no row and must be strictly more conservative.

Concurrency: two overlapping GC runs racing on the same reclaimable prefix are benign — `removePrefix` lists first and no-ops on empty (`defaultStorage.removePrefix` returns early when the listing is empty). A runUuid can never be re-used by a future run (fresh UUID per run), so a reclaimed prefix never collides with new work.

## §5 Invariant compliance

- **Invariant 2 (advisory locks, single-holder):** no new lock surface. Fix 1 consumes data read under the EXISTING recovery lock holders (the two `withShowLock` calls inside `assetRecovery`; JS-side wrapper layer, unchanged topology — `tests/auth/advisoryLockRpcDeadlock.test.ts` template untouched). Fix 2b's GC stage holds no show lock, safe because its targets are row-less, run-private, aged-out prefixes no live actor can reference.
- **Invariant 9 (call-boundary):** every new Supabase storage call (the `removePrefix` adapters and the `listChildren` shallow-list adapter) destructures `{ data, error }` and throws on `error`, matching the existing adapters in the same files. These sync-layer adapters are outside the auth registry's scope (`tests/auth/_metaInfraContract.test.ts` covers auth helpers); each new call site carries `// not-subject-to-meta: sync storage adapter — throws on destructured error; consumed by <caller>'s typed infra outcome` per invariant 9's escape hatch.
- **Invariant 10 (observability):** no new HTTP mutation surface. Both affected crons already emit `runCronRoute` summaries; the diagram-gc summary gains `pendingOrphanPrefixesDeleted`; the asset-recovery route's `infra_error` outcome (which is what an `assetRecovery` upload throw becomes via `runAssetRecoveryCron`'s catch) is unchanged and remains the signal for §7 L2. `snapshotAssets` remains log-free (R7).
- **§12.4 error catalog:** no new or edited user-visible codes; no catalog/regen work.
- **Invariant 8 (impeccable):** no UI surface. `impeccable-gate: N/A — no UI surface` goes in the plan closeout marker.

## §6 Test strategy (plan details the tasks; this fixes the shapes)

All tests run against the REAL exported functions with injected in-memory ports (the probe's construction), asserting on port-state contents — storage map keys — not call counts (anti-tautology: a test that only counts `remove` invocations can pass with the wrong paths removed).

1. **P1 regression (fix 1):** the probe's interleaving as a vitest case — winner commits between loser's gate and commit; assert the winner's manifest paths SURVIVE in the storage map and the loser returns `no_op`. Companion cases: `skipped` keeps paths; drift (pre-check and CAS-false separately) DELETES the loser's paths (the proof branch must keep working — deleting the deletion entirely would pass a keep-only test suite, premise-guard both directions); locked-show-null `no_op` keeps paths. The CAS-false case injects a tx whose `updateRecoveredDiagrams` returns `false` directly (the seam the port already exposes) — per §2.3 the shape is unreachable through concurrent commits alone, and the test documents that with a comment citing §2.1 form (b).
2. **Fix 2a:** `snapshotAssets` with a mid-run throwing drive port and a recording storage port: assert `removePrefix` was invoked with exactly the run's temp prefix AND the storage map holds no `_pending` object afterward; assert the ORIGINAL error propagates when `removePrefix` itself rejects; assert a port WITHOUT `removePrefix` (undefined) still rethrows cleanly (optional-capability guard).
3. **Fix 2b:** GC stage matrix — row-less + aged → reclaimed (map emptied under that prefix, `pendingOrphanPrefixesDeleted` incremented); row-backed (any lifecycle state) → untouched; row-less + one young object in group → whole group untouched and NOT counted in either field; row-less + missing `createdAt` on one object → untouched and `pendingOrphanPrefixesRetainedNoCreatedAt` incremented (the L6 signal — assert the count, not just the keep); GHOST show (storage holds a per-show `_pending` run prefix while `public.shows` has NO row for that id at all — the rolled-back first-seen shape) → reclaimed via the storage-driven discovery; file-shaped entry directly under `shows/` → ignored; existing sweep/claim/promote stages unaffected (their result fields unchanged).
4. **Structural:** the probe file stays committed and runnable as the executable citation for review rounds.

Fixture premises stated executably per `docs/agents/writing-plans.md` anti-tautology rules (e.g. the aged fixture is older than the cutoff BY CONSTRUCTION from the constant, not a hardcoded date that silently drifts).

## §7 Documented limits

**Per-attempt upload bound** (the single definition every row below references): one recovery attempt uploads at most `MAX_RECOVERY_ENTRIES` (60) originals totalling at most `MAX_RECOVERY_TOTAL_BYTES` (3 GiB) of SOURCE bytes (`lib/sync/assetRecovery.ts:52-54`; the byte accounting in `collectVerifiedAssets` charges source bytes only), plus at most three derived WebP variants per original (`DIAGRAM_VARIANT_WIDTHS`, widths capped at 1024/512/256, quality 75, `lib/sync/diagramVariants.ts:13`) whose bytes are downscale re-encodes NOT charged against the source cap. The bound on stored bytes per attempt is therefore "3 GiB of originals plus their bounded-count, bounded-width variant derivatives" — finite and small-multiple, but deliberately NOT stated as a flat 3 GiB.

| # | Limit | Bound / reclamation route |
|---|-------|---------------------------|
| L1 | A `skipped` loser's uploads are never deleted by that run. | They are byte-identical upserts at canonical paths: either a later run commits the same revision (objects become live) or the revision drifts (objects become GC-sweepable under the stale-revision rule once the show leaves partial-failure states — `suppressOrphanDeletion`). Bounded per attempt by the per-attempt upload bound (§7 preamble); attempt cadence bounded by the drift cooldown (`cooldownActive`, exponential to 600s cap). |
| L2 | An `assetRecovery` mid-loop upload throw leaves already-uploaded canonical objects (R3). | Same routes as L1; surfaced as the cron's `infra_error` outcome in the run summary. Objects are re-upserted (no growth) on every retry. |
| L3 | While a show REMAINS in a partial-failure state, the object sweep is suppressed for it, so stale-revision orphans from L1/L2 wait until the show heals or is restaged. | Pre-existing GC design (R5); per-attempt bound and cooldown-limited cadence as L1. |
| L4 | CANONICAL-prefix objects of DELETED (or rolled-back first-seen) show rows are never swept. The `_pending` portion of such ghost shows IS now reclaimed (§4's storage-driven discovery); only their canonical-revision objects remain. | Pre-existing before this arc and unchanged by it (fenced, §1.1 R9). Bounded per ghost show: the set is fixed once recovery runs in flight AT deletion time drain. A run already past its pre-upload gate when the row is deleted (the two reachable deletion sites are the wizard-session reapers `cleanupAbandonedFinalize` and `reapOneSession`, `lib/onboarding/sessionLifecycle.ts`, both of which take the show lock A has already released — release-upload-relock, R1) still uploads, then its commit pass reads no row (or loses the try-lock) and correctly RETAINS per §2.2; each such run adds at most one §7 per-attempt upload bound. After those drain, no writer remains: recovery enumeration reads `public.shows` (`defaultListRecoverableShows`, `lib/sync/assetRecovery.ts`), so a deleted show never re-enters the recovery set, and sync uploads likewise require a live row. |
| L5 | `pending_snapshot_uploads` rows that COMMIT with `delete_started_at` set rely on the existing `PENDING_SNAPSHOT_DELETE_STUCK` alert path (`emitStuckAlerts`) rather than automated reclamation. | Pre-existing, unchanged. |
| L6 | Fix 2b trusts storage `createdAt`; a group containing an object without a usable one is never reclaimed automatically. | SIGNALED, not silent: every GC run reports the retained-group count as `pendingOrphanPrefixesRetainedNoCreatedAt` in its run summary (§4), so a nonzero value is visible on every cycle and its growth is observable. Supabase storage list supplies `created_at` for objects, so the expected steady-state count is zero; a persistently nonzero count is an operator signal, and the ledger-filing bar applies to automating further. |
| L7 | Fix 2a's cleanup failure is silent by contract (R7). | The orphan it leaves is exactly a §4 target; reclaimed within one GC cycle after aging. |
| L8 | The §4 age gate is safe only while a live `snapshotAssets` run cannot outlive `PENDING_ORPHAN_MIN_AGE_MS`. That bound comes from the EXECUTION CONTEXT (the Next.js app server's per-invocation duration limit, minutes), not from any guard inside the run — the drive stall guard is idle-bounded, not total-bounded (§4). | PINNED, not assumed, in two halves by `tests/sync/pendingOrphanAgeGatePremise.test.ts`. **Containment:** every production site that WIRES the real Supabase-backed upload adapter (`makeSnapshotAssetsForApply` / `applySnapshotStorage`) must live under `app/`, `lib/`, or `components/` — so a queue consumer or `scripts/` worker that wired it reds the test. Containment is on the wiring rather than on the import because importing is not executing: the committed probe and the screenshot capture scripts both reach the module through in-memory ports and page imports respectively, and never touch storage. **Headroom:** any `maxDuration` declared by a module that reaches `snapshotAssets` must satisfy `declared × 24 ≤ PENDING_ORPHAN_MIN_AGE_MS`. Either half reddening is the signal to revisit the gate, not a reason to raise the constant. (Round 2 of the diff review is why containment is stated this way — the first version rooted only at `app/api/**/route.ts` and would have stayed green on exactly the worker it promised to catch, since server actions already reach `snapshotAssets` via `runManualSyncForShow`.) |

## §8 Out of scope

- Job-level cron mutual exclusion (R2).
- Any change to promote/claim lifecycle for row-backed pending uploads (R5, L5).
- Deleted-show prefix sweeping (L4).
- The `BL-PRIVATE-IMAGE-POSTMERGE-PROBE` validation-evidence entry (separate verification debt, not touched by this arc).
