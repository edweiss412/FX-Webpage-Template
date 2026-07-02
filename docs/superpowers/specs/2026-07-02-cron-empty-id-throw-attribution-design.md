# cron.sync empty-ID Drive guard + throw-path attribution hoist — design

**Date:** 2026-07-02
**Branch:** `fix/cron-empty-id-throw-attribution` (worktree off `origin/main` @ 80805c0d)
**Origin:** Observability audit #4 of validation `public.app_events`. PR-1 of two sequenced PRs (PR-2 = the remaining MED/LOW coverage gaps).

## Problem

Two coupled defects, both confirmed against live data (deployed SHA `0ff1ab7f`, verified current via `/api/health` — **no deploy-lag**):

1. **Recurring unhandled empty-ID Drive 404.** `cron.sync` threw `Error: File not found: .` — Google Drive's 404 for `files.get` with an **empty `fileId`** (the trailing period is the empty id) — **12 times in an 18:05–19:00 burst on 2026-07-02**; 48 all-time `threw` rows share this shape. It ends only when an admin `finalize` (SHOW_FINALIZED, 19:01) replaces the offending record — i.e. it is **latent**, not healed.

2. **#227 S1 throw-attribution never fires for this class.** Of 700 `cron.sync CRON_RUN_SUMMARY` rows, **0 carry `context.detail.phase`**; all 48 `threw` rows carry only `{error, jobName, outcome, durationMs}` — no `detail`, no `drive_file_id`. Verified in code why: `withCronRunSummary`'s `threw` catch emits `detail` **only** when `err.syncRunContext` is present (`lib/cron/withCronRunSummary.ts:44-59`), and `runScheduledCronSync`'s outer catch sets `syncRunContext` **only** for throws synchronous within its instrumented `try` (`lib/sync/runScheduledCronSync.ts:2862-3001`). The empty-ID throw provably does **not** traverse that `try` — see the Caller Inventory — so `runCronRoute` logs it with an empty `err` context and no fallback source.

## Root-cause analysis (why the throw is a *detached* rejection, and where an empty id can reach Drive)

Every Drive-facing surface on the `cron.sync` path is accounted for:

- **Folder-listing file ids** (`listFolder(folderId)` → `file.driveFileId`, `runScheduledCronSync.ts:2899/2950`) are real Drive ids returned by Drive; never empty.
- **Shows-table `drive_file_id`** (`listPostgresLiveShows:1733`) feeds the **missing-shows** path only: `missingShows` → `lockMissingShow(show.driveFileId, …)` → `markMissingShow_unlocked` → `recoveryTx.markShowSheetUnavailable(…)` (`:2096-2110`), a **DB update — no Drive `files.get`**. So a shows-table empty id never reaches the Drive client (a read-boundary filter there would guard a non-Drive path — see Out of scope).
- **Per-file processing** (`processOneFile` inside the per-file `try`, `:2952-2968`) — including the opening-reel `getFile` (`enrichWithDrivePins.ts:262` → `fetchDriveFileMetadata`) and agenda metadata (`enrichAgenda.ts:157`) — is **awaited inside a `try` that converts any throw to a `parse_error` result** (never a route-level `threw`). Agenda byte-download (`agendaDrive.ts:114`) is additionally guarded upstream (`enrichAgenda.ts:137 if (!link.fileId) continue;`) and returns a discriminated union.
- **The S1 body** (`:2862-2990`, incl. `listFolder`, `finishCompletedRun`) attributes any synchronous throw via the `syncRunContext` attach → would carry `detail`.

Since **every awaited Drive call is try-wrapped** (→ `parse_error`) **or attributed** (→ `detail`), the observed bare route-level `threw` **without** `syncRunContext` can only be a promise that rejects **after** the S1 `try` exits — a detached/unawaited Drive promise surfaced into the in-flight request by the Next app-route runtime (the minified `async eO` frame). The exact detached call site is a bundled/minified frame, **not line-pinnable from the logs** (static `void`/`.then`/`after(` grep of `lib/sync` finds no Drive-returning detached call, consistent with a bundled frame).

## Goal

Two precise, independent mechanisms (I do **not** claim a single change universally "stops" a detached throw):

- **GUARD the Drive metadata chokepoint (change 1)** — reject an empty/blank `fileId` at the metadata `drive.files.get` chokepoint (`driveFilesGet`, through which every metadata/sheet fetch AND `driveClient.getFile` routes) with a typed `InvalidDriveFileIdError`. This (a) ensures an empty id **never reaches Google** on the metadata path (no opaque `File not found: .`), and (b) gives the rejection a stack pointing at the **actual caller frame**, so the next occurrence — including a detached one — **self-identifies** its call site. It does not prevent a detached rejection from still surfacing as a `threw`; it makes that `threw` diagnosable instead of anonymous. (The second `files.get` — the agenda byte-download — needs no guard: an empty-id there is already benign, see the Caller Inventory.)
- **ATTRIBUTE any residual route-level throw (change 2)** — an ALS fallback in `runCronRoute` so a detached/route-tail throw still carries the last in-flight `phase`/`driveFileId`, regardless of origin.

## Caller inventory — every cron.sync Drive `files.get` (citation-backed)

Exactly **two** `drive.files.get` chokepoints are reachable from `cron.sync`; change 1 guards **both**. Nothing else reaches the Drive client with a caller-supplied id.

| Call site | Reached from cron.sync via | Awaited inside a try? | Coverage |
|---|---|---|---|
| `driveFilesGet` (`lib/drive/fetch.ts:275-291`) — metadata `files.get` (`:289`) | `fetchDriveFileMetadata:343` (direct: `runScheduledCronSync.ts:1630` binding capture on a folder-listing id; `driveClient.getFile:1674-1676`→`fetchDriveFileMetadata` for reel `enrichWithDrivePins.ts:262` + agenda `enrichAgenda.ts:157`); `fetchSheetAsMarkdownAtRevision:374`/`fetchSheetMarkdownAndBytesAtRevision:389` (`:2440`); `fetchFileForExport:320`; `fetchSheetMarkdownWithBinding:450` | Yes — all under `processOneFile` per-file try (`:2952-2968` → `parse_error`) or the S1 body (`syncRunContext`) | change 1 (`assertNonEmptyDriveFileId`) |
| `agendaDrive.ts:115` — byte download `files.get({alt:'media'})` | `enrichAgenda.ts` after `enrichAgenda.ts:137 if (!link.fileId) continue;` | Yes — per-file loop; returns a discriminated union | **No guard needed — already benign:** guarded upstream (`enrichAgenda.ts:137`) AND an empty-id 404 is already caught → `{kind:'unavailable'}` (`agendaDrive.ts:142`), never a throw |

Shows-table rows are **not** in this table: they reach only `markMissingShow` (DB-only, `:2096-2110`). So the metadata chokepoint (`driveFilesGet`) is the **sole** surface that can raise an empty-id `File not found: .` — it is the only site that needs the guard.

## Design

Two runtime-only changes: no migration, no §12.4 catalog code, no UI, no advisory-lock topology change.

### 1. Empty-ID guard at the Drive metadata `files.get` chokepoint — `lib/drive/fetch.ts`

- Add `export class InvalidDriveFileIdError extends DriveFetchError` (extends the base at `lib/drive/fetch.ts:101`, so existing `instanceof DriveFetchError` handlers still classify it as a Drive fault; it is a **distinct named subtype** — `name = "InvalidDriveFileIdError"` — so callers/tests discriminate it). Captures the received raw value (JSON-stringified, capped ~80 chars) for forensics.
- Add `export function assertNonEmptyDriveFileId(fileId: unknown): asserts fileId is string` — throws `InvalidDriveFileIdError` unless `fileId` is a non-empty, non-whitespace string.
- Call `assertNonEmptyDriveFileId((params as { fileId?: unknown }).fileId)` at the **top of `driveFilesGet`** (`fetch.ts:275`, before the retry thunk). Runs before any retry budget is spent.

Guard conditions: `fileId` may be `undefined`, `null`, `""`, or whitespace (`"   "`) — all throw. Any non-blank string is unchanged (guard no-op).

`driveFilesGet` is the sole metadata boundary between a caller-supplied id and Google — guarding it means an empty id **cannot reach the Drive client** on the metadata path from any source (reel, agenda metadata, folder binding, direct, or a future/detached caller). The agenda **byte-download** `files.get` (`agendaDrive.ts:115`) is intentionally NOT guarded: it is guarded upstream (`enrichAgenda.ts:137`) and, per its no-throw discriminated-union contract, an empty-id 404 is already caught → `{kind:'unavailable'}` (`agendaDrive.ts:142`) — adding a throwing guard there would violate that contract for zero incident value.

### 1a. Per-operation snapshot at the Drive chokepoint (whole-diff R1)

The ALS is a **single mutable object** shared across a request's async tree; reading it at *throw* time (change 2's `runCronRoute` fallback) is stale for a **detached** rejection — a Drive promise created under `driveFileId=A` that rejects only after the file loop advanced to `B`/`finish`/`null` would attribute to whatever the ALS mutated to by then, not to `A`. To make attribution accurate for exactly the incident's detached case, `driveFilesGet` captures an **immutable** `snapshotCronInFlight()` **synchronously at call time** (the correct operation) and attaches it to any resulting error as `err.syncRunContext` via `attachCronContext(err, snap)` — **without clobbering** an already-present `syncRunContext` (the richer runScheduledCronSync S1 attach wins if the error later traverses the S1 catch). The snapshot is captured once (stable across `withDriveRetry` attempts) and attached to both the empty-id guard throw and the underlying `files.get` rejection. Because the error self-carries its creation-time context, `runCronRoute` (which already reads `err.syncRunContext`) attributes it correctly no matter when it surfaces. `snapshotCronInFlight()` lives in `lib/log/requestContext.ts` (the ALS owner) and returns the `SyncRunContext`-compatible shape `{ phase, inFlightDriveFileId, processedBeforeThrow? }` (or `undefined` when no cron phase is active; `Number.isFinite` excludes NaN). **Scope note:** this snapshots errors at the Drive chokepoint (the incident surface); a detached rejection from a non-Drive source would still fall through to the best-effort ALS read (documented limitation, not the incident).

### 2. Throw-path attribution hoist (ATTRIBUTION) — ALS fallback in `runCronRoute`

- **Extend `RequestContext`** (`lib/log/requestContext.ts:4-7`) with optional cron in-flight fields: `cronPhase?: string`, `cronInFlightDriveFileId?: string | null`, `cronProcessedCount?: number`. Add `setCronInFlight(patch: { phase?: string; driveFileId?: string | null; processedCount?: number }): void` that mutates the current store in place iff a store exists (mirrors `setRequestShowId:23-26`; no-op outside an ALS scope). This does not break existing consumers — every current `RequestContext` construction passes `{ requestId }` (optional fields omitted, valid under exactOptional).
  - **exactOptionalPropertyTypes:** clears use `= null` for `cronInFlightDriveFileId` (typed `?: string | null`, so `null` is valid = "no in-flight id"); `cronPhase`/`cronProcessedCount` are only ever reassigned to concrete values. No `delete`, no `= undefined`.
- **`runScheduledCronSync`**: define two setter closures at the top — `const setPhase = (p) => { inFlightPhase = p; setCronInFlight({ phase: p }); }` and `const setInFlightId = (id) => { inFlightDriveFileId = id; setCronInFlight({ driveFileId: id, processedCount: processed.length }); }` — and replace the existing bare assignments (`:2857 init`, phase at `:2898/:2901/:2912/:2949/:2987`, id at `:2914/:2951`, clears at `:2929/:2946/:2984`) with calls to them. The local `let`s and the S1 `syncRunContext` attach stay **exactly as-is** (the S1 path is richer — carries `failures` — and remains primary for synchronous body throws). The ALS is a strictly-additive shadow used only when the S1 attach did not fire. `setInFlightId(null)` on benign completion writes `cronInFlightDriveFileId = null`, so no stale id leaks into a later detached throw.
- **`runCronRoute` catch** (`lib/cron/withCronRunSummary.ts:22-64`): **inside** the existing `try { await log.error(...) } catch { /* swallow */ }` block (`:36-63`), select the attribution context robustly:
  ```
  const rawSync: unknown = (err as { syncRunContext?: unknown } | null)?.syncRunContext;
  const syncCtx =                                   // reject malformed: must be an object with a string phase
    rawSync !== null && typeof rawSync === "object" &&
    typeof (rawSync as { phase?: unknown }).phase === "string" ? (rawSync as SyncRunContext) : undefined;
  const alsCtx = syncCtx ? undefined : cronCtxFromALS(getRequestContext());
  const ctx = syncCtx ?? alsCtx;
  const attributionSource = syncCtx ? "sync-body" : alsCtx ? "als-fallback" : undefined;
  ```
  `cronCtxFromALS` is a **total, no-throw** mapper: given a possibly-undefined store it returns `undefined` unless `store.cronPhase` is a string; otherwise it builds `{ phase, inFlightDriveFileId: cronInFlightDriveFileId ?? null, ...(Number.isFinite(cronProcessedCount) ? { processedBeforeThrow: cronProcessedCount } : {}) }` (conditional spread — no optional ever `undefined`; `Number.isFinite` excludes both `undefined` AND `NaN`; no `failures`/`folderId`). Gate the `detail` branch on **`attributionSource ||` the existing field conditions** (`ctx?.phase || ctx?.failures?.length || ctx?.folderId || Number.isFinite(ctx?.processedBeforeThrow)`), and add `source` **into the detail object** via conditional spread `...(attributionSource ? { source: attributionSource } : {})`. Because a chosen `ctx` (either source) always has a string `phase`, `attributionSource` is present ⟺ `ctx` exists ⟺ the detail branch fires — so `source` is emitted for every attributed throw, names its true origin, and is never spurious. **A present-but-malformed `err.syncRunContext` (non-object, or an object without a string `phase`) is REJECTED**, and the ALS fallback is used instead — a valid ALS attribution is never suppressed by a junk `syncRunContext`. The whole computation is inside the swallowed block, so a buggy mapper or malformed store can never mask the cron error; `throw err` at `:64` and all HTTP/error semantics are unchanged. `getRequestContext()` is in-scope (the catch runs inside `run()` under the ALS established at `:88-90`).

### 3. Tests (TDD)

- **Chokepoint guard — the boundary test (unit, DB-free integration):** with a mocked `drive.files.get` (injected via `fetchDriveFileMetadata(id, { drive })`), call it with `""`, `"  "`, `undefined`, `null` → each rejects with `InvalidDriveFileIdError` **and** `instanceof DriveFetchError`, **not** a Google 404, and **`drive.files.get` is NEVER called** (assert the mock recorded zero calls — proving the empty id cannot reach the Drive client). With a valid id → `drive.files.get` **is** called (mock records the args) and no guard error. This is the "only a valid id reaches the Drive client" boundary test, at the actual metadata boundary. Concrete failure mode caught: an empty id silently reaching Google → opaque `File not found: .`.
- **ALS-fallback attribution (unit, load-bearing):** using the `withCapture` + `runWithRequestContext` harness (`tests/cron/withCronRunSummary.test.ts`), pre-seed the ALS with `{ requestId, cronPhase:"file-loop", cronInFlightDriveFileId:"df-x", cronProcessedCount:3 }`, run `runCronRoute` with a handler that throws an error **without** `syncRunContext` → assert the row carries top-level `driveFileId==="df-x"`, `detail.phase==="file-loop"`, `detail.processedBeforeThrow===3`, `detail.source==="als-fallback"`. Symmetric regression pin: a throw **with** `syncRunContext` → `detail.source==="sync-body"` and the richer `failures` breadcrumbs still flow (pins #227).
- **ALS mirror wiring (unit):** run `runScheduledCronSync` (dep-injected, per `tests/sync/cronSyncThrowAttribution.test.ts`) **inside** a `runWithRequestContext` store; force a throw in the missing-shows loop; assert the store's `cronPhase === "missing-shows"` and `cronInFlightDriveFileId` equals the in-flight id at throw time — proving `setCronInFlight` actually mirrors to the ALS (so the fallback isn't wired to a never-populated store).
- **Malformed-ALS rejected + no-throw (unit):** `runCronRoute` catch with a store whose cron fields are malformed (`cronPhase` a number, `cronProcessedCount` a string) → the original error still rethrows unchanged, exactly one summary row emits (fail-open: the mapper never throws out of the swallowed block), AND that row carries **no `detail.source`** and **no leaked `phase`** (the malformed store is rejected by the `typeof cronPhase === "string"` gate, not partially copied).
- **Malformed `syncRunContext` falls back to ALS (unit):** an `err` with a junk `syncRunContext` — both a non-`phase` object (`{}`) AND a **non-object** (`"not-an-object"`) — while the ALS has a valid `cronPhase`/`cronInFlightDriveFileId` → the row uses the **ALS** attribution (`detail.source === "als-fallback"`, the ALS `driveFileId`), proving a malformed `syncRunContext` (object or non-object) does not suppress a valid fallback.
- **`NaN` processedCount excluded (unit):** an ALS store with `cronProcessedCount: NaN` → the emitted `detail` carries `phase` + `source` but **no `processedBeforeThrow`** (the `Number.isFinite` gate excludes `NaN`, so it is never logged as `processedBeforeThrow: NaN`). Guard-condition coverage for `processedCount`: `undefined`/`NaN` → omitted; `0` (finite) → included (a legitimate "zero processed" value); any finite N → included.
- **Stale-id no-leak (unit):** ALS with `cronInFlightDriveFileId` set then cleared to `null` → a subsequent throw with no in-flight id emits a row whose `driveFileId` is `null`, not the stale id.

## Guard conditions & invariants

- **Invariant 9 (Supabase call-boundary):** unchanged — no new Supabase call site; ALS reads are in-memory. `annotateSyncStateChange`/`summarizeSync` untouched.
- **Scanner-safety:** the `runCronRoute` catch keeps `code: CRON_RUN_SUMMARY` a **literal inside a `log.error(...)` span** (`withCronRunSummary.ts:39`); `detail.source` is a runtime string value, not a `code:"SHOUTY"` literal, so `stripLogEmissionCalls`+`PRODUCER_RE` are unaffected. No new §12.4 code, no catalog/enums lockstep, no `gen:*` regen. `InvalidDriveFileIdError` is a thrown JS error, not a user-facing message.
- **Advisory-lock topology:** unchanged — no `pg_advisory*` edits; `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- **Fail-open:** the ALS fallback is computed **inside** the existing swallow-logging-faults `try/catch`; it can never throw out of `runCronRoute` nor alter the rethrow/HTTP semantics.
- **exactOptionalPropertyTypes:** new optional fields cleared with `= null` / reassigned to concrete values only; `cronCtxFromALS` builds `processedBeforeThrow` via conditional spread — never `= undefined`, never `delete`.
- **No happy-path behavior change:** a successful cron run is byte-identical — the ALS mirror writes are read-only-on-throw, and the guard never fires for valid ids.

## Out of scope (deferred — explicit, do not relitigate)

- **A read-boundary filter on `listPostgresLiveShows`:** verified unnecessary for the Drive throw — shows-table rows feed `markMissingShow` (DB-only, `:2096-2110`), not a Drive `files.get`. An empty-id shows row causing a bogus `markShowSheetUnavailable('')`/advisory-lock is a **separate, minor, non-reproducible** DB-robustness concern (0 empty rows currently); filed for BACKLOG, not this incident.
- **DB CHECK constraints** (`shows`/`pending_ingestions`/`pending_syncs` `drive_file_id <> ''`): WRITE-side prevention; a CHECK migration triggers the `validation-schema-parity` gate + transitional-window discipline that should not gate the incident fix. PR-2/BACKLOG.
- **The write path that creates an empty `drive_file_id`:** not reproducible (0 empty rows; the incident record was transient, cleared by finalize). The guard makes any future occurrence non-fatal + self-identifying via its clean stack.
- **A process-level `unhandledRejection` hook:** broader detached-rejection net, larger blast radius; BACKLOG. The ALS fallback already attributes the in-request-surfaced rejection (the observed case).
- **All other audit-#4 gaps** (public unpublish telemetry, finalize per-row hard-fails, silent admin POSTs, OAuth session leg, `enrichAgenda:391` outer-catch code, agenda-extract 504, the ~45–50 null-code sweep, malformed-`agenda_links` data-quality): PR-2.

## Watchpoints (pre-load for adversarial review)

- The **exact throwing line is a minified bundled frame**, not line-pinnable (the Caller Inventory shows every awaited Drive call is try-wrapped and shows rows are DB-only, so the residual is provably a detached rejection). This PR is deliberately **defensive**: the chokepoint guard makes the next occurrence self-identify with a real caller stack (and blocks the empty id from Google); the ALS hoist attributes any residual throw. "You didn't pin the exact line" is expected and by design.
- The **S1 `syncRunContext` path is intentionally retained** (not replaced by the ALS); it is richer (carries `failures`); `detail.source` disambiguates the two layers.
- **The read-boundary was dropped on purpose** (round-1→2 correction): shows rows are DB-only, so filtering them would not touch the Drive throw. The chokepoint guard is the real Drive-facing boundary.
- **`detail.source` "sync-body" now means "error-carried context"** — from EITHER the runScheduledCronSync S1 attach OR the Drive-chokepoint per-operation snapshot (§1a); both are accurate to the operation. "als-fallback" remains the best-effort ALS-read-at-throw-time for a throw with no error-carried context. The chokepoint snapshot (§1a) is the whole-diff-R1 fix for detached-rejection staleness.
