# Observability Timeline (Phase 2) — Design Spec

**Status:** Draft for adversarial review (autonomous-ship; user spec/plan gates waived per AGENTS.md autonomous-ship gate)
**Date:** 2026-06-29
**Phase:** 2 of the 4-phase observability arc. Phase 1 (`lib/log` chokepoint + `app_events` table) shipped as PR #187 (`origin/main` @ `b18fbd78`).
**Predecessor spec:** `docs/superpowers/specs/2026-06-29-centralized-logging-foundation-design.md`
**Implementer/reviewer:** Opus / Claude Code (UI-owned milestone, per ROUTING hard rule). Adversarial reviewer: Codex.

---

## 0. Summary

Phase 2 turns the durable `app_events` store that Phase 1 created into an **operator-facing diagnostics surface** and adds a **per-run cron run-summary** so an operator can answer "is the app healthy, are my crons firing, and what just failed?" at a glance.

Two deliverables, deliberately collapsed onto **one read surface**:

1. **Operator timeline UI** — a new admin page `/admin/observability` ("Activity") that reads `app_events` via a service-role server component (admin-gated), with filtering, request correlation, expandable detail, and **auto-refresh polling**.
2. **Per-run cron run-summary** — a generic wrapper that instruments **all 9 cron jobs**, emitting one `app_events` row per run (`code = CRON_RUN_SUMMARY`). These rows appear inline in the timeline and feed a **cron-health header** at the top of the page.

**No database migration.** `app_events` already has every column required (`occurred_at, level, source, message, code, request_id, show_id, drive_file_id, actor_hash, context`). The run-summary is just a well-known `code` + `context` convention — so Phase 2 re-pays **zero** of Phase 1's table-lockdown / validation-parity / drive-keyed-audit / prune-cron / writer-meta-test cost.

### 0.1 Audience decision (binds the whole design)

The timeline is a **technical diagnostics surface** for the developer/operator who debugs the app — full fidelity: raw `source`, free-form `code`, technical `message`. This was an explicit product decision during brainstorming. Consequence: **PRODUCT.md's plain-language mandate ("error codes belong in the network tab, never the UI", PRODUCT.md §Design-Principle-5) does NOT govern this page.** That mandate governs Doug's *operational* workflow (dashboard, alerts, show pages). Plan-wide **invariant 5** ("no raw error codes in user-visible UI") is a UI-*rendering* contract for the catalog-driven operator copy; `app_events.code` is, by Phase 1's design, "a free-form forensic string that is NEVER rendered to a user and is deliberately NOT §12.4-gated" (`lib/messages/__internal__/stripLogEmissionCalls.ts:8-11`). Rendering it verbatim on an admin-gated diagnostics page is in-contract, not a violation. See §11 (Disagreement-loop preempts).

---

## 1. Goals / Non-goals

### Goals
- G1. Admin-gated page that lists `app_events` newest-first, filterable by level, source, code, show, request_id, time window, and free-text message search.
- G2. Request correlation: click a `request_id` to see that request's events (newest-first, 100/page with load-older), with no time-window omission (`since=all`).
- G3. Expandable per-event detail (full `context` JSON, `drive_file_id`, `actor_hash`, absolute timestamp).
- G4. Cron-health header: latest run status + relative time + headline counts for each of the 9 jobs; a job with no recent run reads "no run seen."
- G5. Per-run cron run-summary emitted by a generic wrapper across all 9 jobs, with run-health-derived severity (clean→info, item-failures→warn, threw/infra→error).
- G6. Auto-refresh: client polls on an interval (default 20s, default ON, user-toggleable), pausing when the tab is hidden; manual Refresh for an immediate poll.
- G7. Mobile-first (Doug's venue-floor phone context, PRODUCT.md §Users): rows stack, header wraps, no hover-only affordances, 44px tap targets.

### Non-goals (explicitly out of scope)
- N1. Sentry / client-error capture (**Phase 3**).
- N2. `console.*` migration + `no-console` lint (**Phase 4**).
- N3. Realtime push / websockets. Auto-refresh is **poll-only** (`router.refresh()` on an interval). No Supabase Realtime subscription.
- N4. Any new DB table, migration, CHECK, enum, RLS policy, or grant change. `app_events` is reused as-is.
- N5. Any change to `admin_alerts`, the §12.4 catalog, or alerting/notification preferences. The diagnostics page is read-only over `app_events`; it does not resolve, mute, or create alerts.
- N6. Backfilling `request_id` onto `sync_log`, or populating `sync_log.duration_ms`. The run-summary lives in `app_events`, not `sync_log`.
- N7. Server-side aggregation/trends/charts. The header shows latest-per-job; the timeline is a flat list. (Trend views are a future phase.)
- N8. A help-docs screenshot for `/admin/observability` (no `help-screenshots.manifest.ts` entry). See §10.3 for the *separate* baseline-regen obligation caused by the nav change.

---

## 2. Global constraints (copied verbatim from project rules; apply to every task)

- TDD per task: failing test → minimal impl → passing test → commit (AGENTS.md invariant 1).
- Commit per task, conventional-commits (`feat(observability):`, `test(observability):`, etc.) (invariant 6).
- **No raw error codes in catalog-driven operator UI** (invariant 5) — does NOT apply to `app_events.code` on this diagnostics page (see §0.1, §11).
- **Supabase call-boundary discipline** (invariant 9): every Supabase call destructures `{ data, error }`; infra faults surface as a discriminated `{ kind: "infra_error" }`, never a silent `continue`. Both new loaders comply; see §5.
- **UI quality gate** (invariant 8): every UI surface ships only after `/impeccable critique` AND `/impeccable audit` pass on the diff, with HIGH/CRITICAL fixed or `DEFERRED.md`'d, run with the v3 preflight gates, before adversarial review.
- **Per-show advisory lock** (invariant 2): **N/A** — Phase 2 touches no code path that mutates `shows/crew_members/crew_member_auth/pending_syncs/pending_ingestions`, and uses no `pg_advisory*`. The cron wrapper wraps route handlers for observability only; it never enters the lock topology. See §9.4.
- Tailwind v4 has **no** default `align-items: stretch` on `.flex` — every parent→child dimension relationship is stated in §8 (Dimensional Invariants) and verified with a real-browser assertion in the plan.

---

## 3. Data surface (verified, Phase 1)

`app_events` (`supabase/migrations/20260629000002_app_events.sql:3-21`), service-role only (`revoke all ... from public, anon, authenticated; grant all ... to service_role`, lines 28-30). 60-day retention via `app_events_prune` cron. Columns the UI renders:

| Column | Type | Null | UI use |
|---|---|---|---|
| `id` | uuid | no | React key; expand target |
| `occurred_at` | timestamptz | no | relative + absolute timestamp; sort key |
| `level` | text (`info`/`warn`/`error` CHECK) | no | level badge; filter |
| `source` | text | no | row subtitle; filter; `cron.<job>` drives the health header |
| `message` | text (email-redacted at write) | no | row primary line |
| `code` | text | **yes** | code chip; `CRON_RUN_SUMMARY` → rich card; filter |
| `request_id` | text | **yes** | correlation chip → request drill-in; filter |
| `show_id` | uuid → `shows(id)` ON DELETE SET NULL | **yes** | show link (null → no link) |
| `drive_file_id` | text | **yes** | expand detail |
| `actor_hash` | text | **yes** | expand detail |
| `context` | jsonb (email-redacted, default `'{}'`) | no | expand detail (KeyValue grid + raw JSON); run-summary counts |

Indexes (all verified, `:17-21`): `occurred_at desc`; `request_id where not null`; `(show_id, occurred_at desc)`; `(level, occurred_at desc)`; `(code, occurred_at desc) where not null`. **There is NO index on `source` or `message`.** Index coverage by query:
- The default and common filters — recent-by-time, by `level`, by `code`, by `show_id`, by `request_id` — ride a Phase-1 index; the keyset ordering is always `occurred_at desc` (the leading index).
- The `source` exact-match filter and the `message` ILIKE (`q`) are **un-indexed post-filters applied within the `occurred_at`-ordered, time-bounded slice**. This is acceptable because `app_events` is a **low-volume infra-event table** by design — Phase 1 persists only `error`/`warn` (always) + `info` with a `code`/`persist`; `debug` and bare `info` never persist — under a hard **60-day retention cap** (`app_events_prune`). Even the widest query (`sinceHours = null` = all retained) scans at most 60 days of a sparse table, ordered+limited by the `occurred_at` index. No unbounded growth is possible. If volume ever grows materially, adding a `source`/trigram index is a follow-up (no migration this phase, N4).

**PII posture:** the UI displays already-sanitized stored data (Phase 1 redacts emails in message/context/error.stack at write, `lib/log/sanitize.ts`). Phase 2 performs no new join that re-introduces PII beyond what admin pages already show (show title via `show_id`). The expandable `context` may contain whatever a log call put there (already redacted of emails); this is acceptable on an admin-gated diagnostics tool and is not a new exposure relative to Phase 1's persisted data. The page does not surface raw emails.

---

## 4. Write path — generic cron run-summary

### 4.1 The well-known code + constants module

`lib/cron/runSummary.ts` (NEW) — the single definition site. **Must stay keyword-clean** (no substring `admin_alert`, `upsertAdminAlert`, `upsert_admin_alert`, `last_error_code`, `hardErrors`, `pending_ingestions`, `still_failed`, `staged_parse`), because `scripts/extract-internal-code-enums.ts:107-112` runs `CONST_CODE_RE` over `lib/**`+`app/api/**` **only for files matching `/admin_alerts?|upsertAdminAlert|upsert_admin_alert/i`** (verified). A clean module is never scanned for `const X = "..."`.

```ts
export const CRON_RUN_SUMMARY = "CRON_RUN_SUMMARY";

export type CronRunOutcome = "ok" | "partial" | "infra"; // route-reported; "threw" is wrapper-only
export type CronRunSummary = {
  outcome: CronRunOutcome;
  counts?: Record<string, number>; // e.g. { processed, applied, staged, skipped, failed }
  detail?: Record<string, unknown>; // extra context (faults, skipReason, ...)
};

// Display registry for the health header. One row per LOGICAL job (notify splits in two).
// `jobName` is the source-suffix: app_events.source === `cron.${jobName}`.
// `staleAfterMs` flags a job that has missed ≥2 consecutive runs (≈3× cadence for
// ≤hourly jobs; daily jobs use 2× = 48h so a single late run isn't flagged, two
// missed are) → the "is this job actually firing?" signal (§6.2 effectiveCronStatus).
// Every value below is ≥ 2× its cadence (the ≥2-missed-runs floor); none is < 2×.
export type CronJobSpec = { jobName: string; label: string; cadence: string; staleAfterMs: number };
export const CRON_JOBS: readonly CronJobSpec[] = [
  { jobName: "sync", label: "Sync", cadence: "every 5 min", staleAfterMs: 20 * 60_000 },        // 4× (15m=3×)
  { jobName: "notify.realtime", label: "Notify · realtime", cadence: "every 5 min", staleAfterMs: 20 * 60_000 },
  { jobName: "notify.digest", label: "Notify · digest", cadence: "hourly", staleAfterMs: 3 * 3_600_000 }, // 3×
  { jobName: "refresh-watch", label: "Refresh watch", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  { jobName: "gc-watch", label: "GC watch", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  { jobName: "asset-recovery", label: "Asset recovery", cadence: "every 15 min", staleAfterMs: 45 * 60_000 }, // 3×
  { jobName: "diagram-gc", label: "Diagram GC", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  { jobName: "report-reaper", label: "Report reaper", cadence: "daily", staleAfterMs: 48 * 3_600_000 }, // 2× (2 missed)
  { jobName: "keepalive", label: "Keepalive", cadence: "daily", staleAfterMs: 48 * 3_600_000 },
];
```

A parity test (§9.1) asserts `CRON_JOBS` covers exactly the 9 `fxav_cron_%` jobs in the canonical registry `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json` (there is no root `pg-cron-jobs.json`) via an **explicit `jobName ↔ fxav_cron_<name>` pairing table** (not a naive transform — it bridges hyphen↔underscore and the `notify` route's `realtime`/`digest` split), so the display list cannot silently drift from the real cron set.

### 4.2 The wrapper — `lib/cron/withCronRunSummary.ts` (NEW)

```ts
export async function runCronRoute(
  jobName: string,
  request: NextRequest,
  handler: () => Promise<{ response: Response; summary: CronRunSummary }>,
): Promise<Response>;
```

Behavior:
- **ALS composition is idempotent.** If `getRequestContext()` returns a context, reuse it; else `runWithRequestContext({ requestId: deriveRequestId(request.headers) }, …)` (verified exports, `lib/log/requestContext.ts:4-21`). So a route that already established context (today only `sync`, `app/api/cron/sync/route.ts:8`) is not double-wrapped, and the other 7 gain a `request_id` uniformly.
- **Timing:** capture `started` (`Date.now()`), compute `durationMs` on both success and throw paths.
- **HTTP semantics preserved exactly.** On success, return the handler's own `response` unchanged. On throw, emit an error summary and **re-throw** (never convert a route's deliberate 200-on-internal-fault into a 500; `report-reaper` keeps its own try/catch at `app/api/cron/report-reaper/route.ts:120-127`).
- **Severity from run health:**
  - `summary.outcome === "ok"` → `log.info`
  - `summary.outcome === "partial"` → `log.warn`
  - `summary.outcome === "infra"` → `log.error`
  - handler threw → `log.error`, `context.outcome = "threw"`
- **Emit shape (literal dispatch — REQUIRED).** `stripLogEmissionCalls` only strips literal `log.error(`/`log.warn(`/`log.info(`/`log.debug(` (sticky regex `lib/messages/__internal__/stripLogEmissionCalls.ts:20-21`); it does **not** recognize computed `log[level](...)`). The wrapper therefore dispatches via an explicit `if/else` over the three literal methods, passing exactly the §4.2.1 fields with `code: CRON_RUN_SUMMARY` (constant reference, never the string literal). Because the emission is inside a literal `log.*(...)` call, all three §12.4 scanners strip it regardless.

### 4.2.1 Persisted run-summary row — exact schema (single source of truth)

The wrapper calls (literal method per severity):

```ts
log.info("cron <jobName> run", {
  source: `cron.${jobName}`,   // → app_events.source column
  code: CRON_RUN_SUMMARY,       // → app_events.code column (constant ref)
  // every remaining key lands in app_events.context (jsonb), per Phase 1
  // logger semantics (named LogFields → columns; the rest → context):
  jobName,                      // e.g. "sync", "notify.realtime"
  outcome,                      // "ok" | "partial" | "infra" | "threw"
  durationMs,                   // integer
  counts,                       // Record<string, number> | undefined
  detail,                       // Record<string, unknown> | undefined
});
```

So the persisted **`context` is exactly** `{ jobName, outcome, durationMs, counts?, detail? }` (`counts` nested under the `counts` key — NOT spread to context top level). Every reader uses this exact shape: `loadCronHealth` reads `context.outcome`/`context.counts`/`context.durationMs` (§5.2); `CronRunSummaryCard` reads `context.counts` + `context.durationMs` (§6.2). `message` is always the human string `"cron <jobName> run"`. This block is the single source of truth for the run-summary row; §4.3/§4.4/§5.2/§6.2 reference it rather than restating it.
- **`await` the emit.** `log.*` returns a Promise (async persist; `lib/log/logger.ts:88-93`). The wrapper awaits it before returning the response so the row lands before the serverless function can freeze.
- **Observability never breaks the cron.** `log.*` is already best-effort (Phase 1 persist degrades to console, never throws). The wrapper additionally guards the emit so a logging fault cannot alter the cron's response or its re-throw.

### 4.3 Route edits (8 files, 9 jobs)

Each route keeps its auth check **outside** the wrapper so a 401 produces no summary noise:

```ts
export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request); // app/api/cron/_auth.ts
  if (rejected) return rejected;
  return runCronRoute("sync", request, async () => {
    const result = await runScheduledCronSync({ logSync: writeSyncLog });
    return { response: NextResponse.json({ ok: true, processed: result.processed }),
             summary: summarizeSync(result) };
  });
}
```

`sync` additionally drops its existing inline `runWithRequestContext` wrapper (the wrapper now owns context; idempotent either way). The notify route reads `?job=` (`app/api/cron/notify/route.ts:40`), passes `notify.realtime`/`notify.digest` to the wrapper, and keeps its unknown-`job`→400 branch (`:46`) **outside** the wrapper (like the 401 — no summary for a 400).

**Classification rule (binds every summarizer):** map the route's REAL result/failure signals to `outcome` — `infra` (→`log.error`) if the route surfaces an infra-class signal; `partial` (→`log.warn`) if it surfaces a per-item or degraded failure; `ok` (→`log.info`) otherwise. Each summarizer is derived from the cited result type; an outcome literal not in the type is impossible (TS-exhaustive). Where a result type exposes no failure channel, that is stated, not assumed.

| jobName | result type (cited) | `infra` when | `partial` when | else `ok`; `counts` |
|---|---|---|---|---|
| `sync` | `RunScheduledCronSyncResult` (`lib/sync/runScheduledCronSync.ts:334-343`) | `summary?.outcome === "parse_error"` (`SYNC_INFRA_ERROR`) | `failed > 0` OR `maintenanceFaults?.syncCronHeartbeat === "infra_error"` | `{ processed, applied, staged, skipped, failed }` — see §4.4 |
| `notify.realtime`/`notify.digest` | `NotifyRunResult` (`lib/notify/runNotify.ts:52-55`; `DeliverySummary` `:46-50`) | `delivery.kind === "infra_error"` OR any `maintenance[].result.kind === "infra_error"` OR any `toggleFaults?.length` (delivery or maintenance) | — (none; see note) | `{ sent: delivery.kind==="ok" ? delivery.sent : 0, maintenanceSteps: maintenance.length }` |
| `asset-recovery` | `AssetRecoveryCronResult.processed[].result: AssetRecoveryResult` (full union `lib/sync/assetRecovery.ts:102-115`) | any `outcome === "infra_error"` | any `outcome === "partial_failure"` or `"bytes_exceeded"` | exhaustive map below |
| `report-reaper` | route returns `{ deleted }` or its own catch (`app/api/cron/report-reaper/route.ts:120-127`, `ReportReaperInfraError :15`) | `ReportReaperInfraError` caught → route returns its existing 500 AND reports `outcome:"infra"` to the wrapper | — | `{ deleted }` |
| `refresh-watch` | `{ refreshed: string[] }` (`lib/drive/watch.ts:413-429`) | — (result exposes no failure channel; internal failures are not surfaced — noted, not assumed) | — | `{ refreshed: refreshed.length }` |
| `gc-watch` | `{ stopped: string[] }` (`lib/drive/watch.ts:432-438`) | — (no failure channel) | — | `{ stopped: stopped.length }` |
| `diagram-gc` | `DiagramGcResult` (`lib/sync/diagramGc.ts:44-47`) | — (no failure channel) | — | `{ orphanBlobsDeleted, pendingPrefixesDeleted, promotedRowsDeleted }` |
| `keepalive` | `{ ok: true }` | — | — | none |

**notify — `toggleFaults` are `infra`, not `partial`.** A `toggleFault` means a notify toggle getter could not be read (an infra read failure, fail-closed) and the route's `statusFor` already returns a **500-class** scheduler fault for it (`app/api/cron/notify/route.ts:27-34`). To stay consistent with that HTTP semantics, the summarizer classifies any `toggleFaults` as `infra` (→`log.error`). notify therefore has only `infra`/`ok` — no `partial` state.

**asset-recovery — exhaustive `AssetRecoveryResult` → severity/count map** (all 9 literals, `lib/sync/assetRecovery.ts:102-115`; TS-exhaustive `switch`):

| outcome literal | severity contribution | count bucket |
|---|---|---|
| `recovered` | ok | `recovered` |
| `restage_required` | ok | `recovered` (progress; will finish next pass) |
| `no_op` | ok | `recovered` (nothing to do) |
| `skipped` (`CONCURRENT_SYNC_SKIPPED`) | ok | `skipped` |
| `revision_drift` (`ASSET_RECOVERY_REVISION_DRIFT`) | ok | `skipped` (benign race; retried later) |
| `drift_cooldown` (`ASSET_RECOVERY_DRIFT_COOLDOWN`) | ok | `skipped` (benign backoff) |
| `partial_failure` | **partial** | `failed` |
| `bytes_exceeded` (`ASSET_RECOVERY_BYTES_EXCEEDED`) | **partial** | `failed` |
| `infra_error` (`SYNC_INFRA_ERROR`) | **infra** | `failed` |

Run `outcome`: `infra` if any item `infra_error`; else `partial` if any `partial_failure`/`bytes_exceeded`; else `ok`. `counts = { processed: processed.length, recovered, skipped, failed }`.

### 4.4 `summarizeSync` — `lib/cron/summarizeSync.ts` (NEW)

`summarizeSync(result: RunScheduledCronSyncResult): CronRunSummary`. Verified result type (`lib/sync/runScheduledCronSync.ts:334-343`) and outcome literals (`:183-224`). Classification of `result.processed[].result.outcome`:

- `applied` → applied
- `stage` → staged
- `skipped` / `asset_recovery` → skipped
- `hard_fail` / `parse_error` / `source_gone` / `stale` / `revision_race` / `revision_race_cooldown` → failed
- `ConcurrentSyncSkipped` → skipped

`counts = { processed: processed.length, applied, staged, skipped, failed }`. Outcome:
- `result.summary?.outcome === "parse_error"` (the `SYNC_INFRA_ERROR` arm) → **`infra`**.
- else `failed > 0` OR `result.maintenanceFaults?.syncCronHeartbeat === "infra_error"` → **`partial`** (with `detail.maintenanceFaults`).
- else → **`ok`**.

Guard conditions: empty `processed` (no files) with no summary/faults → `ok`, `counts.processed = 0`. `result.summary?.outcome === "skipped"` (`no_folder_configured`) → `ok` with `detail.skipReason`.

---

## 5. Read path

Both loaders are server-only, use `createSupabaseServiceRoleClient()` (`lib/supabase/server.ts:79-93`; reads `SUPABASE_SECRET_KEY` ?? `SUPABASE_SERVICE_ROLE_KEY`), destructure `{ data, error }`, and return a discriminated union matching the established loader convention (`{ kind: "ok"; … } | { kind: "infra_error"; message: string }`, cf. `lib/admin/loadIgnoredSheets.ts:27-29`). Per the admin infra-contract (§9.2): the **client construction + every query builder + every await are inside one `try { … } catch`**; a returned `{ error }` OR a thrown error both yield `{ kind:"infra_error", message }`, and the thrown-path message names the table + `"threw"` (e.g. `"app_events read threw"`). The raw error is `log.error`'d via `lib/log` (not returned to the UI).

> **Deliberate departure (preempt, §11):** existing loaders use the cookie-bound `createSupabaseServerClient()`. `app_events` is `revoke all ... from authenticated`, so a cookie-bound (anon/authenticated) client **cannot read it** — the service-role client is **required**, not a shortcut. It runs only server-side inside an admin-gated RSC (page + layout both call `requireAdminIdentity`), mirroring the service-role read posture the Phase 1 spec prescribed ("Phase 2's admin UI reads via a service-role server component (admin-gated at the route)"). This bypasses RLS by design; it is never reachable by a non-admin or by the browser.

### 5.1 `lib/admin/loadAppEvents.ts` — the timeline query

```ts
export type AppEventRow = {
  id: string; occurredAt: string; level: "info"|"warn"|"error";
  source: string; message: string; code: string | null;
  requestId: string | null; showId: string | null;
  driveFileId: string | null; actorHash: string | null;
  context: Record<string, unknown>;
  showTitle: string | null; // joined from shows when showId present
};
export type AppEventFilters = {
  levels?: Array<"info"|"warn"|"error">; source?: string; code?: string;
  showId?: string; requestId?: string;
  sinceHours?: 1 | 24 | 168 | null; // parsed from URL `since` ∈ {1h,24h,7d,all}; absent→24; "all"→null (all within retention)
  q?: string; // message ILIKE
  cursor?: { occurredAt: string; id: string } | null; // keyset
};
export type LoadAppEventsResult =
  | { kind: "ok"; events: AppEventRow[]; hasMore: boolean; nextCursor: { occurredAt: string; id: string } | null }
  | { kind: "infra_error"; message: string };
export async function loadAppEvents(filters: AppEventFilters): Promise<LoadAppEventsResult>;
```

- **Ordering + pagination:** `order("occurred_at", desc).order("id", desc)`, `limit(PAGE_SIZE + 1)` where `PAGE_SIZE = 100`. Keyset cursor on `(occurred_at, id)`: `.or("occurred_at.lt.<c>,and(occurred_at.eq.<c>,id.lt.<id>)")`. Fetch N+1; `hasMore = rows.length > PAGE_SIZE`; trim to `PAGE_SIZE`; `nextCursor` = last kept row's `(occurredAt, id)`.
- **Filters → PostgREST:** `levels` → `.in("level", …)`; `source` → `.eq`; `code` → `.eq("code", code)` (constant `CRON_RUN_SUMMARY` may be passed by ref — never a `code:` property literal, so no scanner match); `showId`/`requestId` → `.eq`; `sinceHours` → `.gte("occurred_at", isoSince)`; `q` → `.ilike("message", \`%${escaped}%\`)`.
- **Show title join — single FK embed (committed, not a second query):** `select("…, shows(title)")` — the `app_events.show_id → shows(id)` FK makes the embed resolvable; `shows.title` is `text not null` (`supabase/migrations/20260501000000_initial_public_schema.sql:7`). `showTitle` is `null` when `show_id` is null or the show was deleted. Because this is ONE PostgREST query (not a separate `from("shows")` call), an embed failure surfaces through the `app_events` query and is covered by the meta-test's `/app_events.*threw/` branch — there is **no** separate `from("shows")` throw path, so §9.2 does **not** require a `/shows.*threw/` test.
- **Guards (all URL params are untrusted; validate before building the query):**
  - empty filters → last 24h, newest 100.
  - `levels` — drop members not in {info,warn,error}; empty after filtering → no level filter.
  - time window — the URL carries an explicit `since` token (NOT a raw hour count) so "all" is representable and distinct from the default: `since=1h|24h|7d|all` → `sinceHours = 1|24|168|null`; **`since` absent → 24h** (default); any other value → 24h. `since=all` (`sinceHours=null`) applies no `occurred_at` lower bound. This is what lets the request-correlation URL (`?requestId=<id>&since=all`) mean "all retained," unambiguously different from the bare default.
  - `showId` — must match the UUID regex; otherwise drop the filter (an invalid UUID would make PostgREST 400 → an avoidable `infra_error`). Same for `cursor.id`.
  - `requestId`, `source`, `code` — trim; drop if empty; **cap at 200 chars** (drop if longer; an oversized exact-match filter is meaningless and a waste).
  - `q` — trim; ignore if empty/whitespace; cap at 200 chars; **escape ILIKE metacharacters** so user input is matched literally: backslash-escape `\`, `%`, and `_` before wrapping in `%…%` (`q.replace(/[\\%_]/g, (c) => "\\" + c)`), and rely on PostgREST/`.ilike` parameterization (no string interpolation into SQL).
  - `cursor` — accept only when `cursor.occurredAt` parses as an ISO timestamp AND `cursor.id` matches the UUID regex; any other shape/value → treated as no cursor (page 1).
- **Infra contract:** any `{ error }` from Supabase → `{ kind: "infra_error", message }` (message is a short non-PII string; the raw error is `log.error`'d via `lib/log`, not returned).

### 5.2 `lib/admin/loadCronHealth.ts` — header query

```ts
export type CronHealthRow = {
  jobName: string; label: string; cadence: string; staleAfterMs: number; // from CRON_JOBS
  lastRunAt: string | null; outcome: "ok"|"partial"|"infra"|"threw"|null;
  level: "info"|"warn"|"error"|null; counts: Record<string, number> | null;
};
export type LoadCronHealthResult =
  | { kind: "ok"; jobs: CronHealthRow[] }
  | { kind: "infra_error"; message: string };
export async function loadCronHealth(): Promise<LoadCronHealthResult>;
```

- **Per-job latest query (NOT a single capped scan).** A single `order occurred_at desc limit N` across all jobs is unsafe — `sync` + `notify.realtime` alone emit ~576 rows/day, so a healthy daily job's last run can fall outside any fixed N and render as "no run seen." Instead, issue **one `limit(1)` query per `CRON_JOBS` entry** (9 total): `eq("code", CRON_RUN_SUMMARY).eq("source", \`cron.${jobName}\`).order("occurred_at", desc).limit(1)`, run with `await Promise.all([...])` **inside the loader's single try/catch** (the admin meta-test recognizes the `await Promise.all([...])` builder form). Each returns that job's genuine latest run within retention, regardless of other jobs' volume. No time-window cap — a job whose latest run is days old shows that (a real staleness signal), not "no run seen."
- Each query rides the `(code, occurred_at desc) where code is not null` partial index; the `source` equality is a cheap post-filter on the already-narrow `CRON_RUN_SUMMARY` slice (low-volume; §3).
- `outcome` is read from `context.outcome` (validated against the literal set; anything else → `null`); `level` from the row's `level` column; `counts` from `context.counts` (validated as an object → else `null`). `staleAfterMs` is copied from the matching `CRON_JOBS` entry.
- The loader returns RAW fields only. The **effective health status** (which folds in staleness) is computed in the component (§6.2 `effectiveCronStatus`) because it needs `now` (`await nowDate()`), passed from the page — keeping the loader pure/time-free and testable.
- Guards: a job with zero `CRON_RUN_SUMMARY` rows → `{ lastRunAt: null, outcome: null }`. A row present but with malformed/missing `context.outcome` → `{ lastRunAt: <its occurred_at>, outcome: null }` (distinct from no-row; the component renders these differently — §6.2).

---

## 6. UI — `/admin/observability`

### 6.1 Route + registries

- `app/admin/observability/page.tsx` (NEW) — server component, `export const dynamic = "force-dynamic"`, first line `await requireAdminIdentity()` (defense-in-depth; layout also gates at `layer:"layout"`, `app/admin/layout.tsx:57`). Parses `searchParams` into `AppEventFilters`, calls `loadCronHealth()` and `loadAppEvents(filters)` **independently** (one failing degrades only its section), renders header + filters + timeline inside the auto-refresh client wrapper. Mounts automatically inside the layout's `<PageTransition>`.
- `components/admin/nav/navConfig.ts` (EDIT) — **Activity is a desktop-nav destination + a mobile entry from Settings (NOT a 6th mobile bottom tab).** Why: the mobile bottom bar currently renders all 5 `NAV` items, and `NAV.length > OVERFLOW_THRESHOLD (=5)` would flip on an inert `<span>More</span>` placeholder (`AdminNav.tsx:155-162`) that does not actually overflow anything — a 6th item would yield 6 cramped tabs + a dead More. Finishing the overflow menu is out of scope; instead:
  - Add `desktopOnly?: true` to `NavItem` (the exact mirror of the existing `mobileOnly?: true`, `navConfig.ts:10-11`): "Excluded from the mobile bottom tab bar."
  - Extend `NavItem["id"]` union with `"observability"`; add `{ id:"observability", label:"Activity", short:"Activity", href:"/admin/observability", Icon: Activity, desktopOnly: true }` (lucide `Activity`, verified present).
  - Add an `inObservability` branch to `isNavItemActive` and include it in the dashboard fall-through exclusion (`:57-69`).
- `components/admin/nav/AdminNav.tsx` (EDIT) — the mobile `.map` filters out `desktopOnly` (mirror of the desktop bar's `!item.mobileOnly` filter, `:77`), and `overflow` is computed from the **mobile-visible** count (`NAV.filter((i) => !i.desktopOnly).length`, not raw `NAV.length`) so the inert More never renders. Result: the mobile bottom bar is byte-for-byte the existing 5 tabs (zero change); the desktop top bar gains "Activity" (5 inline items: Dashboard / Unpublished / Ignored / Settings / Activity — `attention` is `mobileOnly`).
- `app/admin/settings/page.tsx` (EDIT) — add a labeled link/row to `/admin/observability` ("Activity — app event log & cron health") so the desktop-only nav item stays reachable on mobile (Settings IS a mobile bottom tab). Settings is not a captured screenshot route, so no baseline impact.
- `lib/audit/trustDomains.ts` (EDIT) — add `{ path: "app/admin/observability/page.tsx", chain: ["requireAdmin"] }` to `PROTECTED_ROUTES` (the auth-chain audit requires every admin page route to be registered, `:29-51`).

### 6.2 Components (all NEW, under `components/admin/observability/`)

- `CronHealthHeader.tsx` — renders `CronHealthRow[]` (plus `now: Date` from the page) as a responsive card strip (grid; wraps on mobile). Each card: `label`, a `StatusIndicator` (dot + label; reuse `components/admin/StatusIndicator.tsx`, `status: live|positive|review|warn|idle`), relative `lastRunAt` (`formatRelative`, `lib/admin/showDisplay.ts:68-79`), and headline counts. The status is the **`effectiveCronStatus(row, now)`** below — it answers "is this job firing AND healthy?", so staleness outranks a stale "ok":
  - `lastRunAt == null` → **idle**, label **"No run seen"** (no card-level counts). *(no-row)*
  - `now − lastRunAt > staleAfterMs` → **warn**, label **"Stale · last run {rel}"** — takes precedence over the last run's outcome (a 5-min job that "succeeded" 3 days ago is NOT firing). *(stale)*
  - else by `outcome`: `ok→positive "OK · {rel}"`; `partial→review "Issues · {rel}"`; `infra`/`threw→warn "Failed · {rel}"`.
  - else (`outcome == null` but a row exists — malformed summary) → fall back to the row's `level`: `error→warn "Ran · {rel}"`, `warn→review "Ran · {rel}"`, `info`/`null→idle "Ran · {rel}"`. *(malformed, distinct from no-row)*

  No red token exists (app avoids red/green per DESIGN.md color-blind floor); the dot is always paired with a text label that disambiguates same-color states (e.g. "Stale" vs "Failed" both use `warn`). `effectiveCronStatus` is a pure function unit-tested for every branch (incl. stale-over-ok, no-row, malformed).
- `EventLevelBadge.tsx` — dot+label badge for a row's `level`, mirroring `ChangeFeedBadge.tsx` structure (literal class strings for the Tailwind v4 content scan; defensive fallback for out-of-set). `info→idle/subtle "Info"`, `warn→review/amber "Warn"`, `error→warn/strong-amber "Error"`. Never color-only.
- `EventTimeline.tsx` — server-rendered `<ul>` of rows; cap disclosure when `hasMore` ("Showing the 100 most recent matching events. Refine filters or load older."); `EmptyState` (`components/atoms/EmptyState.tsx`) when empty; degraded panel when the loader returned `infra_error`. A "Load older" affordance advances the keyset cursor via a `searchParams` `cursor` (link/button, not infinite scroll).
- `EventRow.tsx` (client — owns expand state) — collapsed: relative timestamp (`ChangeFeedTime`-style), `EventLevelBadge`, `source`, `message` (truncated to one line, display-only), a `code` chip, a show link when `showTitle`/`showId` set, a `request_id` chip. **The request chip enters correlation mode**: it navigates to `?requestId=<id>&since=all` ONLY — dropping `cursor` and every other filter (`levels`/`source`/`code`/`showId`/`q`). `since=all` removes the time bound so older events are not omitted. The correlation view uses the **same newest-first ordering and 100/page keyset pagination** as the default timeline (just filtered to the one `request_id`, riding the `request_id` index); a request with >100 persisted events shows the cap disclosure + "Load older" (rare — only error/warn/coded-info persist). Expanded: `ContextDetail`. A `CRON_RUN_SUMMARY` row renders `CronRunSummaryCard` instead of the generic body.
- `CronRunSummaryCard.tsx` — rich inline render of a run-summary, **fully guarded against malformed/free-form `context`** (old or hand-written `CRON_RUN_SUMMARY` rows may have any shape): job label from `context.jobName` if a string else the raw `source` (and if `source` isn't a known `cron.*` job, show it verbatim); outcome badge from `context.outcome` if in the literal set else "unknown"; duration only when `context.durationMs` is a finite number; counts grid only when `context.counts` is a plain object with numeric values (non-object/empty → omit the grid, never crash). Uses `KeyValue` (`components/atoms/KeyValue.tsx`).
- `ContextDetail.tsx` — renders the **full untruncated `message`** first (the collapsed row truncates for layout only; full fidelity is the audience contract, §0.1), then a `KeyValue` grid for `drive_file_id`, `actor_hash`, absolute `occurred_at`, `request_id`; plus a `<pre>` of pretty-printed `context` (empty `{}` → "no additional context"). Email-redaction already applied at write.
- `EventFilters.tsx` (client — URL-driven) — level toggles, source/code/show/request inputs, time-window preset (1h/24h/7d/all), text search. Writes to `searchParams` (shareable/bookmarkable); `force-dynamic` re-queries. **Every filter mutation drops `cursor`** (a retained keyset cursor from a prior filter set would skip the newest matches — so any change to `levels`/`source`/`code`/`showId`/`requestId`/`sinceHours`/`q` rewrites `searchParams` WITHOUT `cursor`, returning to page 1). A "Clear filters" reset. When `requestId` is set, a "Showing one request" chip with a one-click clear (returns to the default timeline).
- `AutoRefreshControl.tsx` (client) — see §6.3.

> **Why new components, not `ChangesFeed`/`ChangeFeedEntry`:** those are bound to the change-feed domain (`FeedEntry.status: ChangeStatus = applied|pending|rejected|undone|superseded`, threaded undo/approve/reject server actions). Phase 2 mirrors their *visual language* (card rows, relative time, dot+label badges, cap disclosure) but the data model and the absence of row mutations make reuse a poor fit. The new components copy the styling idiom, not the code.

### 6.3 Auto-refresh (`AutoRefreshControl.tsx`)

A client component wrapping the page body. Behavior:
- `setInterval(() => router.refresh(), 20_000)` (constant `AUTO_REFRESH_MS = 20_000`). `router.refresh()` re-runs the `force-dynamic` server component → both loaders re-query. No separate polling endpoint.
- **Default ON.** Toggle persisted in `localStorage["fxav.observability.autorefresh"]` ("on"/"off"). SSR renders ON; on mount, reconcile from localStorage (guard against hydration mismatch by reading localStorage in `useEffect`, not during render).
- **Pause when hidden (toggle-gated):** `document.visibilityState === "hidden"` (Page Visibility API) suspends the interval. On `visible`, it resumes **and fires one immediate refresh ONLY IF auto-refresh is currently ON** — when the toggle is OFF, becoming visible does nothing (OFF stays OFF; no refresh). The manual Refresh button is the only update path while OFF.
- **"Updated Ns ago"** indicator next to the toggle, derived from the last refresh time (client clock; this is a freshness hint, not persisted data).
- **Manual Refresh** button → immediate `router.refresh()`, independent of the toggle.
- **Reading-stability:** `router.refresh()` is a soft refresh — client state (expanded rows, filter focus) and scroll position survive. Definitions, so the behavior is testable: the **scroll container is the window** (the page scrolls; the timeline is not an internal-scroll region), and "near the top" means **`window.scrollY <= AUTO_REFRESH_TOP_PX` (= 200)**. An auto-tick only calls `router.refresh()` when ON **and** `scrollY <= 200`; when the user has scrolled past 200px (reading history), the tick is **skipped** (not queued) so prepended rows never yank their position — the next eligible tick fires once they scroll back near the top or use manual Refresh. The list also sets CSS `overflow-anchor: auto`. Honors `prefers-reduced-motion` (no pulse animation on update under reduce).
- **Cleanup:** clears the interval and removes the `visibilitychange` listener on unmount.

### 6.4 Mode boundaries
- **Auto-refresh ON vs OFF** — only difference is whether the interval is armed; identical layout.
- **Default timeline vs request-correlation view** — entering correlation mode (clicking a request chip) navigates to `?requestId=<id>&since=all` ONLY, clearing every other filter + `cursor`; the filter bar shows a "Showing one request" chip; the timeline shows that request's events newest-first, paginated 100/page (no time-window omission). Clearing returns to the default 24h timeline.
- **Generic row vs run-summary row** — a row renders `CronRunSummaryCard` iff `event.code === CRON_RUN_SUMMARY` (constant ref); otherwise the generic body. Mutually exclusive.
- **Loaded vs empty vs infra-error** (timeline) and **loaded vs infra-error** (header) — independent per section.

---

## 7. Transition inventory

States and pairs (each gets an explicit treatment; this is a diagnostics list UI, so most are instant by design):

| From → To | Treatment |
|---|---|
| Row collapsed → expanded | Disclosure: height auto-grow, `--duration-normal` (220ms), `--ease-out-quart`; instant under `prefers-reduced-motion` |
| Row expanded → collapsed | Reverse disclosure; instant under reduced-motion |
| Auto-refresh ON → OFF | Instant — interval cleared; toggle state change only |
| Auto-refresh OFF → ON | Instant — interval armed + one immediate refresh |
| Tab visible → hidden | Instant — interval suspended (no visual change) |
| Tab hidden → visible | Instant — one immediate refresh |
| Filter change (any) | Instant — `searchParams` navigation re-renders the list; no crossfade (avoids flicker on rapid filter edits) |
| Timeline empty → populated (after a poll surfaces new rows) | New rows appear at top; `overflow-anchor` keeps the reading position; no entrance animation (avoids motion churn on every 20s poll) |
| Timeline populated → empty | Instant swap to `EmptyState` |
| Loaded → infra-error (either section) | Instant swap to degraded panel |
| Compound: auto-refresh fires while a row is expanded | Soft refresh preserves expand state (client-held); the expanded row stays open; if that row is still in the result set its content updates in place; if it dropped out of the window, it's simply gone (no error) |
| Compound: auto-refresh fires while a filter input is focused | Focus is preserved (filters are URL-driven; the input is a controlled client field that does not remount on `router.refresh()`); no lost keystrokes |
| Cron-health card status change across polls — any pair among {`no run seen`, `stale`, `ok`, `partial`, `failed`, malformed} (6 states → all 15 pairs) | **Instant — no animation.** A 20s-polling diagnostics surface must not animate status dots on every tick; the dot/label swap in place. |
| Header / timeline section: loaded ↔ infra-error (either section) | Instant swap to/from the degraded panel — no animation |
| Request-correlation mode ↔ default timeline | Instant — a `searchParams` navigation re-renders the list; no crossfade |

**Completeness declaration:** the ONLY animated transition in this surface is the per-row expand/collapse disclosure (220ms, reduced-motion-instant). Every other state change — cron-health status swaps, level/code/show/level filter changes, mode switches, empty/populated/infra swaps, auto-refresh ticks — is **instant by design** (no `AnimatePresence`, no enter/exit), because a frequently-polling diagnostics list that animated on each update would be distracting and harm scannability.

---

## 8. Dimensional invariants (Tailwind v4 — no default `items-stretch`)

| Parent | Child | Invariant | Guarantee |
|---|---|---|---|
| `CronHealthHeader` card grid (`data-testid=cron-health-grid`, per wrap row) | each health card (`data-testid=cron-health-card`) | equal height within a row | the grid uses `grid auto-rows-fr` (the single chosen mechanism — NOT a flex+`items-stretch` alternative); cards carry no fixed height. Stated explicitly because `.grid` rows do not equalize by default |
| Health card | `StatusIndicator` dot | dot vertically centered against the label baseline row | `inline-flex items-center gap-2` on the dot+label pair (matches `StatusIndicator.tsx:32-48`) |
| `EventRow` (flex) | `EventLevelBadge` + content column | badge top-aligned with the first text line, content column fills remaining width | row `flex items-start gap-3`; content `min-w-0 flex-1` (truncation needs `min-w-0`) |
| `EventRow` content | truncated `message` | single-line truncate without overflowing the row | `truncate` on a `min-w-0` flex child |
| `CronRunSummaryCard` counts grid | each `KeyValue` | columns align across counts | fixed grid template (`grid-cols-2 sm:grid-cols-3`), not flex-wrap |

The plan adds a **layout-dimensions** task: a real-browser (Playwright / chrome-devtools) assertion that, in a fixed viewport, reads `getBoundingClientRect()` and asserts (within 0.5px tolerance): (a) every `data-testid` health card in a wrap row has equal `height`; (b) **no-overflow geometry** for `EventRow` — the content column's right edge is ≤ the row's inner (padding-box) right edge, and `badgeWidth + rowGap + contentWidth ≤ rowInnerWidth` (the `flex gap-3` between badge and content MUST be in the sum — asserting `badge + content == rowWidth` would be wrong and fail in a real browser); (c) the content column does not overflow its row horizontally (`scrollWidth ≤ clientWidth`). jsdom is insufficient (no real layout).

---

## 9. Meta-tests & registries (inventory)

### 9.1 CREATES
- `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` — asserts the string `"CRON_RUN_SUMMARY"` appears **nowhere** in the generated internal-code-enum artifact, checked at two levels so a future extractor-shape change can't sneak it in as a value or rendered text rather than an object key: (a) `JSON.stringify(extractInternalCodeEnums())` does not contain `"CRON_RUN_SUMMARY"` (covers keys AND values/provenance), and (b) `renderInternalCodeEnums(extractInternalCodeEnums())` (the rendered TS source) does not contain `"CRON_RUN_SUMMARY"`. Also asserts `pnpm gen:internal-code-enums` leaves `lib/messages/__generated__/internal-code-enums.ts` byte-identical (the Phase 1 proof technique).
- `tests/cron/cronJobsParity.test.ts` — asserts `CRON_JOBS` (display registry) maps 1:1 onto the 9 `fxav_cron_%` jobs in `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json` (read that exact path) via the explicit pairing table (guards header/cron drift).
- Unit tests: `summarizeSync` (outcome mapping incl. infra/partial/ok + empty + heartbeat fault), `runCronRoute` (ALS idempotent reuse vs establish; HTTP passthrough on success; emit-then-rethrow on throw; literal-method dispatch; level mapping; awaited emit), `loadAppEvents` (filter→PostgREST translation, keyset pagination `hasMore`/`nextCursor`, guards for bad cursor/levels/q, `infra_error` path), `loadCronHealth` (latest-per-source reduction, "no run seen", malformed context guard).
- Unit: `effectiveCronStatus(row, now)` — every branch (no-row→idle, stale-overrides-ok, ok/partial/failed, malformed-row→level-fallback, distinct from no-row).
- Component tests: `EventLevelBadge`, `CronHealthHeader` effective-status rendering, `EventRow` expand (incl. **full untruncated message** in `ContextDetail`) + run-summary-card branch + **request chip clears all filters/cursor & sets `sinceHours=null`**, `EventFilters` URL writes + **every mutation drops `cursor`**, `CronRunSummaryCard` malformed-context guards (non-object counts, non-numeric duration, unknown source), `AutoRefreshControl` (interval arm/disarm, **scroll-gate at `scrollY<=200`**, **visibility-resume only when ON**, localStorage default-ON, cleanup), `EventTimeline` empty/cap/infra states.
- **Transition-audit** task (per the writing-plans transition rule): enumerate every `AnimatePresence`/ternary/conditional in the new components and assert each has the §7 treatment, incl. the two compound cases.

### 9.2 EXTENDS / TOUCHES
- **`tests/admin/_metaInfraContract.test.ts` (EXTEND — mandatory).** `loadAppEvents` and `loadCronHealth` are new `lib/admin` Supabase-touching loaders → each gets an `infraRegistry` row (`helper`, `path`, `contract`) AND a behavioral `describe` block. Per the existing contract (`tests/admin/_metaInfraContract.test.ts:23-37, 164-305`): (a) the **grep-shape** test requires every supabase-derived await AND every `supabase.from(...)` builder-assignment line to sit inside a `try { … } catch`; (b) behavioral tests assert **service-role construction throw → `{ kind:"infra_error" }`** and **`from("app_events")` throw → `{ kind:"infra_error", message }` with a message matching `/app_events.*threw/`**. (The `shows(title)` FK embed is part of the single `app_events` query, NOT a separate `from("shows")` call, so there is no `/shows.*threw/` branch to cover — §5.1.) `loadCronHealth`'s `Promise.all` of 9 `app_events` `limit(1)` queries is likewise covered by the `from("app_events")` throw test. So both loaders MUST: wrap construction+builder+await(s) in one try/catch, return `{ kind:"infra_error", message }` on both the returned-`{error}` and thrown paths, and put `app_events` + "threw" in the thrown message. This is the §9.3 sibling for the *admin* contract — distinct from the *auth* one.
- `components/admin/nav/navConfig.ts`, `lib/audit/trustDomains.ts` — registry edits (§6.1). The auth-chain audit (`lib/audit/authChain.ts`) re-validates after the `PROTECTED_ROUTES` edit.

### 9.3 Verified clear (no row needed)
- `tests/log/_metaAppEventsWriter.test.ts` — guards **writes** (`from("app_events").insert|update|delete|upsert`); the UI only `.select()`s (read) and the wrapper writes via `lib/log` → `lib/log/persist.ts` (still the sole writer). **Safe.**
- `tests/auth/_metaInfraContract.test.ts` — registers **auth helpers** only; the cron wrapper is not an auth helper and changes no Supabase call-boundary semantics. **No row.** (The *admin* infra-contract meta-test IS extended for the two loaders — §9.2.)
- The cron wrapper itself touches **no** Supabase client (it only calls `log.*`, whose persist path is already the registered sole writer). **No infra-contract row for the wrapper.**
- `tests/cross-cutting/pg-cron-coverage.test.ts` + `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json` — Phase 2 adds **no** pg-cron job; the run-summary is a log emission. **Unchanged.**
- `tests/messages/_metaAdminAlertCatalog.test.ts`, `catalog.test.ts`, `codes.test.ts` — `CRON_RUN_SUMMARY` is an `app_events` code, never an `admin_alerts` code, emitted only inside literal `log.*()` (stripped). **No catalog entry; no §12.4 touch.**
- `tests/db/postgrest-dml-lockdown.test.ts`, `validation-schema-parity` — **no new/changed migration**; `app_events` row already registered in Phase 1. **Unchanged.** (No validation-project apply needed this milestone.)

### 9.4 Advisory-lock holder topology
**N/A.** Phase 2 introduces no `pg_advisory*` call and mutates none of the lock-governed tables. The cron wrapper wraps route handlers around already-locking bodies (e.g. `runScheduledCronSync`'s per-show locks are untouched and remain the single holder). No change to `tests/auth/advisoryLockRpcDeadlock.test.ts`.

---

## 10. CI surfaces & "real CI green"

### 10.1 Unchanged
Unit suite (sharded), `x1`-catalog-parity, `x2` internal-code-enums (proven byte-identical by §9.1), postgrest-dml-lockdown, validation-schema-parity, pg-cron-coverage — all unaffected (no migration, no catalog/code edit, no new cron job).

### 10.2 Runs and must pass
- The full unit/component suite (new tests).
- `screenshots-drift.yml` — **fires on this PR** (path filter includes `app/**`, `components/**`, `lib/audit/**`, `lib/admin/**`, `lib/messages/**`). It must stay **green** — see §10.3.

### 10.3 Screenshot baselines — expected NO regen (verify, don't predeclare)
The capture script screenshots the manifest entry's `captureSelector` **element**, not the page/nav shell (`scripts/help-screenshots.ts:168` → `page.locator(entry.captureSelector).first().screenshot(...)`). Every manifest selector clips **page-content** elements — `[data-testid=admin-dashboard]`, `[data-testid=dashboard-inbox-col]`, `[data-testid=admin-needs-attention-page]`, `[data-testid=admin-preview-banner]`, `[data-testid=crew-shell]` (`scripts/help-screenshots.manifest.ts:51-117`). The admin **top nav** and **mobile bottom tab bar** are *siblings* of those captured elements, never inside the clip. Therefore:
- Adding "Activity" to the **desktop** nav changes no captured pixels (the nav is outside every clip).
- The **mobile bottom bar is unchanged anyway** (§6.1 — Activity is `desktopOnly`).
- `/admin/observability` is **not** added to the manifest (N8), so it is never captured.

**Expectation: no baseline changes; `screenshots-drift` stays green with zero regen.** Rather than predeclaring drift, the plan's close-out runs the drift capture and, only IF an unexpected diff appears in `public/help/screenshots/`, regenerates via `screenshots-regen.yml` (`workflow_dispatch`, native-amd64 runner, pinned Playwright image — never a local arm64 capture) and commits the result. The default path commits nothing.

### 10.4 New route is NOT added to the help-screenshots manifest
`/admin/observability` gets no `help-screenshots.manifest.ts` entry (N8) — the manifest is an explicit allow-list, so the new route is simply never captured. This avoids creating a new byte-comparison baseline surface for the diagnostics page itself.

---

## 11. Disagreement-loop preempts (for the reviewer; cite, do not relitigate)

- **Service-role client in `loadAppEvents`/`loadCronHealth` is required, not a security hole.** `app_events` is `revoke all ... from authenticated` (`20260629000002_app_events.sql:28`); a cookie-bound client cannot read it. The loaders run only server-side in an RSC gated by `requireAdminIdentity` at both `layer:"layout"` (`app/admin/layout.tsx:57`) and the page's first line; never browser-reachable. This is the read posture the Phase 1 spec explicitly prescribed for Phase 2.
- **Rendering raw `code`/`source`/`message` is in-contract** for this surface (§0.1). Invariant 5 governs catalog-driven operator copy; `app_events.code` is forensic and "deliberately NOT §12.4-gated" (`stripLogEmissionCalls.ts:8-11`). The audience decision (technical diagnostics page) was ratified during brainstorming.
- **`CRON_RUN_SUMMARY` is intentionally free-form and uncataloged** — emitted only inside literal `log.*()` (stripped), constant defined in a keyword-clean module; pinned by §9.1. Not an admin_alerts code; `_metaAdminAlertCatalog` does not apply.
- **No migration is intentional** — `app_events` is reused; the run-summary is a `code`+`context` convention. Not an oversight.
- **Auto-refresh is poll-only by design** (`router.refresh()` on an interval), not Realtime — Realtime/push is a later phase (N3).
- **The cron wrapper preserves HTTP semantics and does not enter advisory-lock topology** (§4.2, §9.4) — it adds observability around handlers, never altering control flow or locking.

---

## 12. Acceptance criteria

- AC1. `/admin/observability` renders for an admin (gated at layout + page), 404/redirect for non-admin (existing layout behavior).
- AC2. Timeline lists `app_events` newest-first, 100/page, with working level/source/code/show/request/time/text filters reflected in `searchParams`; cap disclosure when `hasMore`; `EmptyState` when none; degraded panel on `infra_error`.
- AC3. Clicking a `request_id` chip navigates to `?requestId=<id>&since=all` (prior filters + cursor cleared; no time-window omission), showing that request's events newest-first, paginated 100/page (load older for >100), with a "Showing one request" chip and one-click clear. Changing any filter resets pagination (`cursor` dropped).
- AC4. A row expands to show the **full untruncated `message`** + `context` JSON + `drive_file_id` + `actor_hash` + absolute time; `CRON_RUN_SUMMARY` rows render the rich counts card, guarding malformed `counts`/`durationMs`/`jobName`.
- AC5. Cron-health header shows all 9 jobs; each shows its effective status (dot+label) + relative time + counts: `ok`/`partial`/`failed` from the latest run, **`stale` when `now − lastRunAt > staleAfterMs` (overriding a stale "ok")**, `no run seen` when there is no row, and a malformed-summary row (row present, no parseable outcome) renders distinctly from no-row.
- AC6. Every authorized cron run makes **exactly one** `CRON_RUN_SUMMARY` emit attempt with the correct `source`, severity, duration, and counts — which persists exactly one `app_events` row **when persistence succeeds**. Logging is best-effort: a persistence fault degrades to console and **never** alters the cron's response or re-throw (non-interference is chosen over durability, §4.2.1). A 401/400 emits none; a handler throw emits one error-summary attempt and re-throws.
- AC7. Auto-refresh polls every 20s by default, is toggleable (persisted), pauses when the tab is hidden, and a soft refresh preserves expanded rows, focus, and scroll position; manual Refresh works regardless of the toggle.
- AC8. `extractInternalCodeEnums()` output contains no `CRON_RUN_SUMMARY`; `gen:internal-code-enums` stays byte-identical; `CRON_JOBS` parity test passes.
- AC9. `screenshots-drift` is green on the PR with **no baseline change** — the nav is outside every captured selector, and the mobile bar is unchanged (Activity is `desktopOnly`). Regen only if an unexpected diff appears (§10.3).
- AC10. Impeccable v3 critique + audit pass on the UI diff (HIGH/CRITICAL fixed or `DEFERRED.md`'d).

---

## 13. File structure (decomposition)

**Write path:** `lib/cron/runSummary.ts` (const + types + `CRON_JOBS`), `lib/cron/withCronRunSummary.ts` (`runCronRoute`), `lib/cron/summarizeSync.ts`; edits to the 8 cron `route.ts` files.
**Read path:** `lib/admin/loadAppEvents.ts`, `lib/admin/loadCronHealth.ts` (+ shared `AppEventRow`/`AppEventFilters` types, colocated or in `lib/admin/observabilityTypes.ts`).
**UI:** `app/admin/observability/page.tsx`; `components/admin/observability/{CronHealthHeader,EventLevelBadge,EventTimeline,EventRow,CronRunSummaryCard,ContextDetail,EventFilters,AutoRefreshControl}.tsx`.
**Registries / nav:** `components/admin/nav/navConfig.ts` (`desktopOnly` flag + `observability` entry), `components/admin/nav/AdminNav.tsx` (mobile `desktopOnly` filter + mobile-visible overflow count), `app/admin/settings/page.tsx` (mobile entry link), `lib/audit/trustDomains.ts` (`PROTECTED_ROUTES` row).
**Tests:** as enumerated in §9.1.
**Close-out:** impeccable dual-gate; run `screenshots-drift` and dispatch `screenshots-regen` **only if** an unexpected baseline diff appears (expected: none — §10.3); whole-diff Codex review.

---

## 14. Self-review checklist (per AGENTS.md spec additions)

- Guard conditions for every prop/input — §4.4, §5.1, §5.2, §6.3 (null `code`/`show_id`/`request_id`, empty `processed`/`context`/`q`, bad cursor/levels/window, localStorage absent, hydration).
- Mode boundaries — §6.4.
- Cap/truncation — 100/page + disclosure (§5.1, §6.2); health list = 9 (§4.1).
- Rendered vs conceptual — §6.2 names each component, placement, content.
- Dimensional invariants — §8 + plan layout-dimensions task.
- Transition inventory — §7 incl. 2 compound cases + plan transition-audit task.
- Existing-code citations — every claim carries `file:line` (verified pre-draft).
- Numeric sweep — single-sourced constants: `PAGE_SIZE=100`, `AUTO_REFRESH_MS=20_000`, `AUTO_REFRESH_TOP_PX=200`, default window 24h, per-job `staleAfterMs` (CRON_JOBS, ≈3× cadence), 9 jobs; cross-referenced, not restated as bare literals.
- Tier×domain matrix — **N/A** (no DB-tier/surcharge-domain change; no migration).
- CHECK/enum migration matrix — **N/A** (no migration/CHECK/enum change).
- Flag lifecycle — auto-refresh toggle: **storage** `localStorage["fxav.observability.autorefresh"]` | **write** toggle onClick | **read** `AutoRefreshControl` mount effect | **effect** arms/disarms the 20s `router.refresh()` interval. No zombie flag.
- Self-consistency sweep — "no migration", "service-role required", "poll-only", "9 jobs" stated consistently across §0/§1/§5/§11.
- Disagreement-loop preempts — §11.
- Build-vs-runtime gate — **N/A** (no env-gated build artifact; `force-dynamic` runtime render only).
- Meta-test inventory + advisory-lock topology — §9.
