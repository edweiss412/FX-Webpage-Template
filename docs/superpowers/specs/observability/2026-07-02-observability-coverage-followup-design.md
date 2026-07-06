# Observability Coverage Follow-up — Design Spec

**Date:** 2026-07-02
**Branch/worktree:** `feat/observability-coverage-followup` (off `origin/main` @ `b0af2742`)
**Status:** DRAFT → self-review → Codex adversarial-review
**Provenance:** third observability audit of validation `public.app_events` (follows #218/#220/#221). Addresses the four actionable findings that survived live verification. Two audit findings were **closed by verification and need no code**: (a) the `app_events_prune` reaper IS scheduled in validation (`cron.job` confirms `17 4 * * *`, active); (b) the "deploy-lag" finding was **refuted** — validation git-auto-deploys from `main` (the `…-git-main-…` alias + a live in-flight production build), and every `code=NULL` row predates the merge of the code that stamps it (`client.realtime` NULL @ 15:41Z < #221 merge 17:32Z; `enrichAgenda` NULL rows < #220 merge 15:31Z). Item S4 (`/api/health`) makes that verification permanently self-serve.

## Goal
Close the one genuine observability **code gap** (top-level `cron.sync` throws are un-attributable) and add three supporting improvements (stable-failure signal, notify skip-reason, build-SHA health endpoint), so the validation logs answer "which show broke, and is this new?" without guesswork.

## Non-goals / out of scope (deferral discipline)
- **No speculative empty-ID guard.** The `File not found: .` throw is not reproducible from any uncaught `files.get` in current `main` (file loop is caught+attributed `runScheduledCronSync.ts:2826-2859`; missing-shows is DB-only `2793-2824`; `listDriveFolder` is `files.list` not `files.get` `lib/drive/list.ts:102`; `getActiveWatchedFolderId` guards empty/blank folder → an empty-string `watched_folder_id` is falsy so `109` is skipped and it returns `no_folder_configured` at `lib/appSettings/getWatchedFolderId.ts:114`). Per the audit, origin-hunting from logs is impossible **by design today — that IS the gap**; S1 makes a recurrence self-identify. Adding a guard for an unreproducible path is YAGNI and could mask the real cause.
- **No notify alert-dedup consumer.** S3's `stateChanged` field is the *primitive*; wiring it into the realtime-problem email throttle is **deferred to notify-enablement** (Resend config is deferred by the user; there is no active email consumer to spam). Recorded in DEFERRED.md.
- **No level downgrade for stable partials.** The audit explicitly warns that downgrading an unchanged-partial run to `info` makes the health header go green while a show is still broken. S3 keeps every row at its true level; it only *annotates*.
- **No UI.** Zero files under `app/` except `app/api/**`; zero `components/`; no CSS/token/`DESIGN.md`. The admin health header consuming `stateChanged` (a future UX nicety) is out of scope.
- **No DB schema, advisory-lock, or §12.4 catalog change.** S1 reuses `CRON_RUN_SUMMARY`; S3 adds a JSON `detail` field; no new user-facing error codes.

---

## S1 — Attribute top-level `cron.sync` throws (HIGH, the real gap)

### Current behavior (cited)
- `app/api/cron/sync/route.ts:11-18` calls `runCronRoute("sync", …, async () => { const result = await runScheduledCronSync(...); return { response, summary: summarizeSync(result) }; })`. `summarizeSync` runs **only on the success path** — after `runScheduledCronSync` returns.
- On a throw, `runScheduledCronSync` rejects before returning, so `summarizeSync` never runs and the wrapper catch fires: `lib/cron/withCronRunSummary.ts:22-37` logs `{ source, code: CRON_RUN_SUMMARY, jobName, outcome: "threw", durationMs, error: err }` — **no `driveFileId`, no `detail`**. The `drive_file_id` app_events column and `detail.failures[]` are both null (confirmed live: 12 identical rows 18:05–19:00Z).
- Inside `runScheduledCronSync` (`lib/sync/runScheduledCronSync.ts:2731-2862`), the **uncaught** phases where a throw can escape are: folder resolve (`2748-2750`), `listFolder(folderId)` (`2780`), `listPostgresLiveShows()` (`2783-2787`), the missing-shows loop body (`2793-2824`, in-flight id = `show.driveFileId`), the file-loop's *own* infra (the `runOne` body is try/caught at `2827/2843` and IS attributed), and `finishCompletedRun`→heartbeat (`2734-2746`). `const processed` (`2781`) holds all successes + caught partials so far.
- The reducer that builds `failures[]` lives at `lib/cron/summarizeSync.ts:26-45` (`MAX_FAILURE_BREADCRUMBS = 25`, shape `{ driveFileId, outcome, code? }`).

### Proposed change
1. **Extract ONE shared classifier** from `summarizeSync.ts:27-45` into a new exported helper `classifyProcessed(processed): { counts: { processed: number; applied: number; staged: number; skipped: number; failed: number }; breadcrumbs: Array<{driveFileId; outcome; code?}>; failuresTruncated: boolean; fingerprintParts: string[] }` (new file `lib/cron/classifyProcessed.ts`). It does the classification **exactly once** — the `CONCURRENT_SYNC_SKIPPED` skip (`summarizeSync.ts:30`), the `applied`/`stage`/`SKIPPED`-set/conservative-unknown⇒`failed` rules (`:34-44`), the capped breadcrumb push (`MAX_FAILURE_BREADCRUMBS=25`) — and in the SAME pass appends `` `${driveFileId}|${code ?? outcome}` `` to `fingerprintParts` for **every** failed entry (uncapped, no cutoff) while pushing to `breadcrumbs` only up to the cap. `failuresTruncated = failed > breadcrumbs.length`. BOTH `summarizeSync` (counts + breadcrumbs + fingerprint) AND the S1 throw-attach (breadcrumbs) consume this single helper, so counts, capped breadcrumbs, and the uncapped fingerprint **cannot drift** (project treats such drift as a finding class). `summarizeSync` becomes a thin wrapper: call `classifyProcessed`, then apply the existing `parse_error`/`heartbeatFault`/`skipped`/`ok` outcome logic (`summarizeSync.ts:46-66`) unchanged, adding `detail.failuresFingerprint` on the `partial` path (see S3). The S1 throw-attach's `failures` = `classifyProcessed(processed).breadcrumbs`.
2. **In `runScheduledCronSync`** — **HOIST all state above the wrapped body.** Declare, at function top right after the `finishCompletedRun` definition (`2746`), BEFORE the first throwable phase: `let inFlightPhase: "resolve-folder" | "list-folder" | "list-live-shows" | "missing-shows" | "file-loop" | "finish" = "resolve-folder"`, `let inFlightDriveFileId: string | null = null`, `let resolvedFolderId: string | null = null`, **and move `const processed: RunScheduledCronSyncResult["processed"] = []` up here too** — it is currently declared at `2781`, *after* `listFolder` at `2780`, so a folder-resolve or list-folder throw would hit `processed.length` in the catch before `processed` exists (ReferenceError / TDZ). Hoisting is mandatory; the existing `2781` declaration is deleted. Update `inFlightPhase` at each phase boundary; set `resolvedFolderId = folderId` after folder resolve (`2776`).
   - **Clear on BENIGN completion only — NEVER in `finally`.** A `finally` clears on *every* exit including a throw, which would null the id *during stack-unwind, before the outer catch reads it* — destroying the attribution exactly when it matters. Instead: set `inFlightDriveFileId = show.driveFileId` (/`file.driveFileId`) at the TOP of the iteration, and set it back to `null` only on the paths where the iteration completed **without throwing** — i.e. immediately after each `processed.push(...)` AND immediately before the skip-branch `continue` (`2797-2808`). Then: (i) a throw from the missing-show `await lockMissingShow(...)` (`2794`) propagates with the id still set → outer catch attributes `show.driveFileId`; (ii) a throw from the file-loop inner catch's `await deps.logSync?.(...)` (`2848-2853`, `syncLog.ts` sink can throw) propagates with the id still set → outer catch attributes `file.driveFileId`; (iii) a benign skip/`continue` or normal completion clears the id so the NEXT iteration's early throw isn't mis-attributed to the prior file. Concretely the file loop keeps its existing inner `try/catch` (`2827-2858`) unchanged and adds `inFlightDriveFileId = null` as the last statement of the loop body (reached only if neither the try nor the catch re-threw). Tests MUST cover both throw sites (missing-show lock throw; file-loop logSync-sink throw) and assert the row's `drive_file_id` column equals the in-flight id.
   - **Wrap** the body from folder-resolve (`2748`) through `return finishCompletedRun(...)` (`2861`) in an OUTER `try { … } catch (err) { attach; throw err; }` where attach = `if (err && typeof err === "object") (err as { syncRunContext?: unknown }).syncRunContext = { phase: inFlightPhase, folderId: resolvedFolderId, inFlightDriveFileId, processedBeforeThrow: processed.length, failures: classifyProcessed(processed).breadcrumbs };`. **Rethrow unchanged** — HTTP/error semantics preserved (like `withCronRunSummary.ts:37`). Do NOT swallow and do NOT log here (the wrapper catch is the sole emitter — avoids double-log): a lock/DB/heartbeat fault is genuinely fatal and must still propagate.
3. **In `withCronRunSummary.ts` catch (`22-37`)**: read `const ctx = (err as { syncRunContext?: { phase?: string; folderId?: string | null; inFlightDriveFileId?: string | null; processedBeforeThrow?: number; failures?: Array<{driveFileId:string;outcome:string;code?:string}> } } | null)?.syncRunContext;` and spread into the existing `log.error` fields (keeping `code: CRON_RUN_SUMMARY` **literal**): `…(ctx?.inFlightDriveFileId ? { driveFileId: ctx.inFlightDriveFileId } : {}), …((ctx?.failures?.length || ctx?.phase) ? { detail: { …(ctx.phase ? { phase: ctx.phase } : {}), …(ctx.folderId ? { folderId: ctx.folderId } : {}), …(ctx.failures?.length ? { failures: ctx.failures } : {}), …(typeof ctx.processedBeforeThrow === "number" ? { processedBeforeThrow: ctx.processedBeforeThrow } : {}) } } : {})`. The read is defensive/optional so `runCronRoute` stays job-agnostic (only sync attaches `syncRunContext`; other crons' throws are unchanged).

### Guard conditions
- `err` is a non-object (string/number thrown): `attach` no-ops (guarded by `typeof err === "object"`); wrapper `ctx` is `undefined` → logs exactly as today. No crash.
- Throw before any phase identifier is set (e.g. in folder resolve): `inFlightDriveFileId` null, `folderId` null, `failures` empty → row carries `detail.phase: "resolve-folder"` only. Still strictly more than today.
- `processed` empty at throw: `failures: []` → the `detail.failures` key is omitted (length gate). `processedBeforeThrow: 0` still recorded.
- Reserved-field contract: `driveFileId` is a reserved log field → the spread populates the indexed `drive_file_id` **column** (queryable), which is the exact column the incident rows left null.

### Scanner-safety
`withCronRunSummary.ts` catch keeps `code: CRON_RUN_SUMMARY` as a literal (already is); `driveFileId`/`detail` are **runtime variables**, never `code:"LITERAL"`. `runScheduledCronSync` attaches a plain object property, emits no `code:` literal. The `cron-run-summary-scanner-safety` test (referenced `lib/cron/runSummary.ts:3`) stays green — verify in the plan.

---

## S2 — (folded into S1) shared reducer
Covered by S1.1; no separate surface. Listed so the plan has an explicit "reducer extracted + both callers use it + a drift test" task.

---

## S3 — Stable-failure `stateChanged` annotation (the cry-wolf primitive)

### Current behavior (cited)
- Level is chosen fresh each run from that run's outcome only (`withCronRunSummary.ts:51-53`): `infra→error`, `partial→warn`, `ok→info`. No cross-run memory. One stable failing show (`MI-3_NO_VALID_DATES` on `1Now2iJ…wyY0`) forces `partial→warn` every 5-min run → ~120–151 identical warn rows over ~10h (confirmed live), and pins the admin health header (which reads the latest row's level, `loadCronHealth.ts:38-47`) yellow the whole time. Repetition of a stable, already-attributed state = cry-wolf.

### Proposed change
- **Annotate, do not suppress or downgrade.** The **fingerprint is computed by `summarizeSync` from the shared `classifyProcessed` (S1.1)** — whose `fingerprintParts` accumulates over the FULL uncapped `processed` set — NOT in `annotate` from the capped `failures[]`. Computing from the capped 25-row list would miss a composition change *beyond the cap* whenever `counts.failed` is stable (e.g. 30 failures, #27 flips A→B). On the `partial` path, `summarizeSync` sets `detail.failuresFingerprint` = `classifyProcessed(processed).fingerprintParts.length ? [...fingerprintParts].sort().join(",") : "heartbeat"` — the sorted-joined uncapped list, or the sentinel `"heartbeat"` when there are no show failures (heartbeat-only partial: `detail.maintenanceFaults` present, `failed===0`), which is distinct from any show-failure fingerprint. Sharing `fingerprintParts` with the capped-breadcrumb pass means the fingerprint and `failures[]` use one identical classification — no drift. The fingerprint is sensitive to both count and composition at any depth.
- **Where:** fingerprint COMPUTATION is pure and lives in `summarizeSync` (above). The prior-run COMPARE needs one indexed DB read, so it lives in the **route** (which already does I/O). Add `lib/cron/annotateSyncStateChange.ts` exporting `async function annotateSyncStateChange(summary: CronRunSummary): Promise<CronRunSummary>`; the route becomes `summary: await annotateSyncStateChange(summarizeSync(result))`. It reads the latest prior `cron.sync` `CRON_RUN_SUMMARY` row's `context->detail->failuresFingerprint` (+ `unchangedSinceRuns`) via a `createSupabaseServiceRoleClient()` query mirroring `loadCronHealth.ts:38-47`, compares it to `summary.detail?.failuresFingerprint`, and attaches `stateChanged: boolean` + `unchangedSinceRuns?: number` (increment from the prior row when unchanged, else omit) to `detail`. It does NOT recompute the fingerprint — `summarizeSync` is the single source, so the stored value and the compared value cannot drift. The current run's fingerprint is already in `summary.detail` (from `summarizeSync`), so it persists with the row for the next run.
- Only annotates `outcome: "partial"` (the only outcome for which `summarizeSync` writes a fingerprint). `ok`/`infra` summaries pass through unchanged with **no DB read**.

### Flag lifecycle (`stateChanged` / `failuresFingerprint` / `unchangedSinceRuns`)
| field | storage | write path | read path | effect on output |
|---|---|---|---|---|
| `failuresFingerprint` | `app_events.context->detail` (jsonb) | `summarizeSync` (this run, over the uncapped failed set) | `annotateSyncStateChange` (next run's compare) | none directly; enables the compare |
| `stateChanged` | same | `annotateSyncStateChange` | future alert-dedup (deferred), dashboards, `rg` audits | distinguishes NEW failure from stable repeat |
| `unchangedSinceRuns` | same | `annotateSyncStateChange` | same | "this show has failed the same way for N runs" |
No zombie flags: every field is written and read (the consumer for `stateChanged` alert-gating is deferred but the field is immediately useful for queries/dashboards — its present value is making the 151 identical warns distinguishable from a genuinely new failure).

### Guard conditions / invariant-9 (Supabase call boundary)
- The prior-row read MUST follow invariant 9 (`loadCronHealth.ts` is the template): destructure `{ data, error }`; distinguish returned-error from thrown. **ONE canonical fail-open shape** covers BOTH a returned `{error}` and any thrown fault (the whole annotate body is wrapped in `try/catch`): `return { ...summary, detail: { ...(summary.detail ?? {}), stateChanged: true } };` — i.e. **preserve the input summary and its existing `detail` verbatim, INCLUDING the `failuresFingerprint` that `summarizeSync` already computed** (so the next run still has a baseline to compare against), and merely set `stateChanged: true` (conservative: treat unknown as changed so a real change is never silently suppressed). Fail-open only SKIPS the prior-row compare — it therefore adds no `unchangedSinceRuns` and does NOT touch/overwrite the fingerprint (the spread preserves it). It must NEVER re-throw and NEVER break the cron (mirrors `withCronRunSummary.ts:54-56`, "observability must never break the cron"). This is the single, exact behavior for every fault path — there is no other fail-open variant.
- First run ever (no prior row): `stateChanged: true`, `unchangedSinceRuns` omitted.
- Prior row was `ok`/`infra` (no fingerprint): `stateChanged: true`.
- Empty `failures` but `partial` (e.g. heartbeat-only fault): fingerprint = `""` sentinel `"heartbeat"` derived from `detail.maintenanceFaults` presence, so a heartbeat fault vs a show-failure are distinct fingerprints.

### Meta-test inventory
`annotateSyncStateChange` is a **new Supabase read boundary** → register it in the analogous call-boundary meta-test surface (invariant 9). If `tests/auth/_metaInfraContract.test.ts` is auth-scoped only, add an inline `// not-subject-to-meta: cron summary annotation, fail-open by contract (returns the canonical fail-open shape on any fault)` comment at the call site AND a dedicated unit test asserting the canonical fail-open shape on BOTH the returned-`{error}` path and the thrown path: the input `summary` and its `detail` are preserved (incl. the `failuresFingerprint` from `summarizeSync`), `detail.stateChanged === true`, no `unchangedSinceRuns`, and the cron does not throw. Declared here so the plan carries the task.

---

## S4 — `/api/health` build-SHA endpoint (makes deploy-liveness self-serve)

### Current behavior (cited)
- No health/SHA route exists (`find app/api` shows no `health`; `app/api/show/[slug]/version/route.ts` is per-show content-version, not build SHA). Deploy-liveness could only be inferred from log archaeology (which mis-led the audit into a false deploy-lag conclusion).

### Proposed change
- New `app/api/health/route.ts`: `export const dynamic = "force-dynamic"; export async function GET() { return NextResponse.json({ ok: true, sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null, ref: process.env.VERCEL_GIT_COMMIT_REF ?? null, builtEnv: process.env.VERCEL_ENV ?? null }); }`. No auth (build metadata is low-sensitivity; the crew/admin data stays gated elsewhere). No Supabase, no secrets, no logging.

### Guard conditions
- Env vars unset (local dev / non-Vercel): each field → `null`, still `{ ok: true }`. Never throws.
- `force-dynamic` so the SHA reflects the running deployment, not a cached build-time value baked into a static route.

### Test plan
Unit test: mock `process.env.VERCEL_GIT_COMMIT_SHA`, assert the JSON body carries it; unset → `sha: null`, status 200.

---

## S5 — Notify skip-reason in the cron summary (tiny)

### Current behavior (cited)
- `runRealtimeNotify`/`runDigestNotify` return `NotifyRunResult` whose `.delivery` union is `{ kind: "ok"; sent; … }` | `{ kind: "skipped"; reason: string }` | `{ kind: "infra_error"; … }` (`lib/notify/runNotify.ts:48-49`, `lib/notify/deliver.ts:22`). But `summarizeNotify` (`app/api/cron/notify/route.ts:40-51`) returns **only** `{ outcome, counts }` — **no `detail`** — recording `counts.sent = delivery.kind === "ok" ? delivery.sent : 0` and dropping the reason. Live rows show `{counts:{sent:0}, outcome:"ok"}` with no explanation of *why* `sent:0` (config-blocked vs no-recipients vs nothing-to-send).

### Proposed change
- In `summarizeNotify`, **add a new `detail`** to the returned summary (it has none today): `const detail = { deliveryKind: result.delivery.kind, ...(result.delivery.kind === "skipped" ? { deliverySkipReason: result.delivery.reason } : {}) };` then `return { outcome, counts, detail };`. `deliveryKind` is always present so `detail` is always present. Keeps `outcome` logic unchanged (still `infra` iff a delivery/maintenance fault; a config-skip stays `ok`). No behavior change beyond the added `detail` field. Applies to BOTH `notify.realtime` and `notify.digest` (same `summarizeNotify`).

### Guard conditions
- `delivery.kind === "ok"`: `deliveryKind:"ok"`, no skip-reason key (union has no `reason` there — a `kind`-narrowed access, type-safe). `delivery.kind === "infra_error"`: `deliveryKind:"infra_error"` and `outcome` already `infra` via the existing `deliveryFault` check (`route.ts:41-42`) — unchanged. No new user-facing code (`§12.4` untouched).

---

## Cross-cutting

### Files touched (all `lib/**` + `app/api/**` — no UI, no DB schema)
- `lib/cron/summarizeSync.ts` (refactor to consume the shared classifier + set `detail.failuresFingerprint` on partial) + new `lib/cron/classifyProcessed.ts` (the single shared `classifyProcessed` helper)
- `lib/sync/runScheduledCronSync.ts` (phase/id tracking + try/catch attach)
- `lib/cron/withCronRunSummary.ts` (catch reads `syncRunContext`)
- `lib/cron/annotateSyncStateChange.ts` (new) + `app/api/cron/sync/route.ts` (await annotate)
- `app/api/cron/notify/route.ts` (skip-reason in summary)
- `app/api/health/route.ts` (new)
- Tests co-located per task.

### Invariants honored
- Invariant 1 (TDD per task). Invariant 5 (no raw error codes in UI — N/A, no UI). Invariant 9 (Supabase call boundary — S3 read is fail-open + registered/annotated). Scanner-safety (S1 keeps `code` literal). Reducer single-source (S1/S2). No advisory-lock surface (S1 attaches to an already-propagating error; adds no lock; the missing-shows/ file loops already own their locks — unchanged).

### Test plan (concrete failure modes)
- **S1:** (a) a throw injected in the missing-shows loop yields an error row whose `drive_file_id` **column** equals the in-flight show AND `detail.failures` equals `classifyProcessed(processed).breadcrumbs` over the successes-so-far; (b) a throw in folder-resolve yields `detail.phase: "resolve-folder"`, no `driveFileId`, no crash; (c) a **non-object** throw (`throw "boom"`) still logs `outcome:"threw"` with no `syncRunContext` read error; (d) the shared `classifyProcessed` produces byte-identical `breadcrumbs`/`counts` for the `summarizeSync` and throw-attach paths on the same `processed` (anti-drift). Catches: the exact zero-attribution incident.
- **S3:** (a) two consecutive runs with the SAME failing show → 2nd row has `stateChanged:false`, `unchangedSinceRuns:1`; (b) a run where the failing show CHANGES (different driveFileId or code) → `stateChanged:true`; (c) prior-row read returns `{error}` → returns the canonical fail-open shape (input summary preserved, `detail.stateChanged:true`, no fingerprint overwrite in annotate), cron does not throw; (d) prior-row read **throws** → identical canonical fail-open shape; (e) **beyond-cap composition change with stable count**: 30 failures both runs but a show past the 25-breadcrumb cap flips code/id → `stateChanged:true` (proves the fingerprint is over the UNCAPPED `processed` set, not the capped `failures[]`); (f) `summarizeSync` unit test: `detail.failuresFingerprint` is present, sorted/order-independent, and differs between two 30-failure sets that differ only at index 27. Catches: silent suppression of a real change (incl. beyond the breadcrumb cap); annotation breaking the cron.
- **S4:** env SHA present → body carries it; unset → `sha:null`, 200.
- **S5:** delivery `kind:"skipped", reason:"config_invalid"` → summary `detail.deliverySkipReason:"config_invalid"`; `kind:"ok"` → no skip-reason key.

### Rollout / verification
- After merge, main auto-deploys to validation. Verify: `curl …/api/health` returns the merge SHA (proves S4 + resolves deploy-liveness permanently); the next `cron.sync` partial row carries `detail.stateChanged`/`failuresFingerprint`; a forced sync throw (or the next natural one) carries `drive_file_id` + `detail.failures`.
