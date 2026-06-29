# Observability Timeline (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-gated `/admin/observability` diagnostics page that reads `app_events` (service-role) for a filterable, auto-refreshing event timeline + a cron-health header, fed by a generic wrapper that emits one `CRON_RUN_SUMMARY` event per cron run across all 9 jobs.

**Architecture:** No DB migration — `app_events` (Phase 1) is reused; the cron run-summary is a `code=CRON_RUN_SUMMARY` + `context` convention emitted via `lib/log` (never a raw insert). Write path = `lib/cron/{runSummary,withCronRunSummary,summarizeSync}` + thin edits to 8 cron routes. Read path = two service-role loaders in `lib/admin`. UI = one server page + client/server components under `components/admin/observability/`, with Activity as a `desktopOnly` nav item + Settings mobile link.

**Tech Stack:** Next.js 16 App Router (server components, `force-dynamic`, `router.refresh()`), Supabase service-role client, Vitest + Testing Library, Playwright (layout assertion), Tailwind v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-29-observability-timeline-phase2-design.md` (APPROVED, 5 adversarial rounds). Section references below (§N) point into it.

## Global Constraints

- **TDD per task:** failing test → run-it-fails → minimal impl → run-it-passes → commit. Never impl before the test (AGENTS.md invariant 1).
- **Commit per task**, conventional-commits: `feat(observability):` / `test(observability):` etc. (invariant 6). Use `--no-verify` (hooks run lint-staged; CI is the gate).
- **No DB migration / no `app_events` schema change** (spec N4). No new pg-cron job. No catalog/§12.4 edit.
- **`CRON_RUN_SUMMARY` is emitted ONLY inside literal `log.info(`/`log.warn(`/`log.error(` calls**, with `code: CRON_RUN_SUMMARY` as a **constant reference** (never the string literal as a `code:` property), so the §12.4 scanners strip it. NEVER `log[level](...)` computed dispatch (the stripper only matches literal method names — spec §4.2).
- **Constant module `lib/cron/runSummary.ts` MUST stay keyword-clean:** it must NOT contain the substrings `admin_alert`, `upsertAdminAlert`, `upsert_admin_alert`, `last_error_code`, `hardErrors`, `pending_ingestions`, `still_failed`, `staged_parse` (else `scripts/extract-internal-code-enums.ts` would extract the const — spec §4.1).
- **Supabase call-boundary (invariant 9):** loaders destructure `{ data, error }`; client construction + every builder + every await wrapped in ONE `try { } catch`; returned-`{error}` AND thrown both → `{ kind:"infra_error", message }`; thrown message contains the table + `"threw"` (e.g. `"app_events read threw"`). Register both loaders in `tests/admin/_metaInfraContract.test.ts`.
- **UI quality gate (invariant 8):** after UI tasks, run `/impeccable critique` AND `/impeccable audit` on the diff; fix HIGH/CRITICAL or `DEFERRED.md` them. Before the whole-diff Codex review.
- **Tailwind v4 has NO default `align-items: stretch`** — equal-height health cards use `grid auto-rows-fr` (spec §8); verified by a real-browser layout assertion (Task 18), jsdom is insufficient.
- **No advisory locks touched** (spec §9.4); no auth-helper infra-contract row (the wrapper touches no Supabase client).
- **Constants (single-sourced):** `PAGE_SIZE = 100`, `AUTO_REFRESH_MS = 20_000`, `AUTO_REFRESH_TOP_PX = 200`, default window 24h, per-job `staleAfterMs` in `CRON_JOBS`.

---

## File structure

**Write path (`lib/cron/`)**
- `lib/cron/runSummary.ts` (NEW) — `CRON_RUN_SUMMARY` const, `CronRunOutcome`/`CronRunSummary` types, `CronJobSpec` + `CRON_JOBS` (9 entries, `staleAfterMs`). Keyword-clean.
- `lib/cron/withCronRunSummary.ts` (NEW) — `runCronRoute(jobName, request, handler)` wrapper.
- `lib/cron/summarizeSync.ts` (NEW) — `summarizeSync(result)`.
- 8 cron route edits: `app/api/cron/{sync,keepalive,notify,refresh-watch,gc-watch,asset-recovery,diagram-gc,report-reaper}/route.ts` + small per-route summarizers (inline or colocated).

**Read path (`lib/admin/`)**
- `lib/admin/observabilityTypes.ts` (NEW) — shared `AppEventRow`, `AppEventFilters`, `CronHealthRow`, result unions, `parseAppEventFilters(searchParams)`.
- `lib/admin/loadAppEvents.ts` (NEW) — `loadAppEvents(filters)`.
- `lib/admin/loadCronHealth.ts` (NEW) — `loadCronHealth()`.

**UI (`app/admin/observability/`, `components/admin/observability/`)**
- `app/admin/observability/page.tsx` (NEW).
- `components/admin/observability/{EventLevelBadge,CronHealthHeader,cronHealthStatus,EventTimeline,EventRow,CronRunSummaryCard,ContextDetail,EventFilters,AutoRefreshControl}.{ts,tsx}` (NEW).

**Registries / nav**
- `components/admin/nav/navConfig.ts` (EDIT) — `desktopOnly` flag + `observability` entry + `isNavItemActive`.
- `components/admin/nav/AdminNav.tsx` (EDIT) — mobile `desktopOnly` filter + mobile-visible overflow count.
- `app/admin/settings/page.tsx` (EDIT) — mobile entry link to `/admin/observability`.
- `lib/audit/trustDomains.ts` (EDIT) — `PROTECTED_ROUTES` row.

**Structural tests**
- `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` (NEW).
- `tests/cron/cronJobsParity.test.ts` (NEW).
- `tests/admin/_metaInfraContract.test.ts` (EXTEND).

---

## Verified reference signatures (from the spec's live-code pass — use verbatim)

```ts
// lib/log — logger.ts:88-93, types.ts:4-14, requestContext.ts:4-21
export const log = { error, warn, info, debug }; // each (message: string, fields: LogFields) => Promise<void>
interface LogFields { source: string; code?: string; showId?: string|null; driveFileId?: string|null;
  requestId?: string|null; actorHash?: string|null; error?: unknown; persist?: boolean; [k: string]: unknown }
function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T;
function getRequestContext(): RequestContext | undefined;
function deriveRequestId(headers: Headers): string; // x-vercel-id ?? randomUUID
interface RequestContext { requestId: string|null; showId?: string|null }
function setLogSink(sink: Sink): void; function resetLogSink(): void;

// lib/supabase/server.ts:79-93
function createSupabaseServiceRoleClient(): SupabaseClient; // SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY

// lib/auth/requireAdmin — requireAdminIdentity(opts?: {layer?:"layout"|"page"}): Promise<{email:string}>
// lib/time/now.ts — nowDate(): Promise<Date>
// lib/admin/showDisplay.ts:68-79 — formatRelative(iso: string|null, now: Date): string
// app/api/cron/_auth.ts — rejectUnauthorizedCron(request: NextRequest): Response | null  (401)

// lib/sync/runScheduledCronSync.ts:334-343
type RunScheduledCronSyncResult = {
  processed: Array<{ driveFileId: string; result: ProcessOneFileResult }>;
  summary?: { outcome:"skipped"; skipReason:"no_folder_configured" } | { outcome:"parse_error"; code: typeof SYNC_INFRA_ERROR };
  maintenanceFaults?: { syncCronHeartbeat?: "infra_error" };
};
// ProcessOneFileResult.outcome ∈ skipped|asset_recovery|stage|hard_fail|applied|stale|revision_race|revision_race_cooldown|source_gone|parse_error|<ConcurrentSyncSkipped>

// lib/sync/assetRecovery.ts:102-118 — AssetRecoveryResult.outcome ∈
//   recovered|restage_required|partial_failure|skipped|revision_drift|drift_cooldown|bytes_exceeded|infra_error|no_op
//   AssetRecoveryCronResult = { processed: Array<{ showId; result: AssetRecoveryResult }> }
// lib/notify/runNotify.ts:46-55 — NotifyRunResult = { kind:"ok"; maintenance: MaintenanceStepResult[]; delivery: DeliverySummary }
//   DeliverySummary = {kind:"skipped";reason;toggleFaults?} | {kind:"ok";sent;toggleFaults?} | {kind:"infra_error";source;toggleFaults?}
//   MaintenanceStepResult.result.kind ∈ "ok"|"infra_error"(+toggleFaults?)
// lib/sync/diagramGc.ts:44-47 — DiagramGcResult = { orphanBlobsDeleted; pendingPrefixesDeleted; promotedRowsDeleted } (all number)
// lib/drive/watch.ts — refreshWatchSubscriptions(): Promise<{refreshed:string[]}>; gcWatchChannels(): Promise<{stopped:string[]}>
// app/api/cron/report-reaper/route.ts:15,120-127 — ReportReaperInfraError; runReaperGet has its own try/catch (returns 500)

// components reused: StatusIndicator { status:"live"|"positive"|"review"|"warn"|"idle"; label:string }
//   ChangeFeedBadge pattern (dot+label, literal class strings); AdminPageHeader { title; sub?; ... }
//   EmptyState { label?; children? }; KeyValue { label; value; linkAs?; tabular?; emptyLabel? }
//   formatRelative; navConfig NavItem { id; label; short; href; Icon; mobileOnly? }; OVERFLOW_THRESHOLD=5
```

---

## Task 1: `lib/cron/runSummary.ts` — constants, types, CRON_JOBS

**Files:**
- Create: `lib/cron/runSummary.ts`
- Test: `tests/cron/runSummary.test.ts`

**Interfaces:**
- Produces: `CRON_RUN_SUMMARY: "CRON_RUN_SUMMARY"`; `type CronRunOutcome = "ok"|"partial"|"infra"`; `type CronRunSummary = { outcome: CronRunOutcome; counts?: Record<string,number>; detail?: Record<string,unknown> }`; `type CronJobSpec = { jobName: string; label: string; cadence: string; staleAfterMs: number }`; `CRON_JOBS: readonly CronJobSpec[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cron/runSummary.test.ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CRON_RUN_SUMMARY, CRON_JOBS } from "@/lib/cron/runSummary";

describe("runSummary constants", () => {
  test("CRON_RUN_SUMMARY is the literal code", () => {
    expect(CRON_RUN_SUMMARY).toBe("CRON_RUN_SUMMARY");
  });

  test("CRON_JOBS has 9 logical jobs with unique jobNames and >=2x-cadence staleAfterMs", () => {
    expect(CRON_JOBS).toHaveLength(9);
    const names = CRON_JOBS.map((j) => j.jobName);
    expect(new Set(names).size).toBe(9);
    // every staleAfterMs is a positive finite number
    for (const j of CRON_JOBS) {
      expect(Number.isFinite(j.staleAfterMs)).toBe(true);
      expect(j.staleAfterMs).toBeGreaterThan(0);
    }
    // the 9 logical jobs we expect
    expect(new Set(names)).toEqual(
      new Set([
        "sync", "notify.realtime", "notify.digest", "refresh-watch",
        "gc-watch", "asset-recovery", "diagram-gc", "report-reaper", "keepalive",
      ]),
    );
  });

  test("module stays keyword-clean (scanner safety, spec §4.1)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "lib/cron/runSummary.ts"), "utf8");
    for (const kw of ["admin_alert", "upsertAdminAlert", "upsert_admin_alert",
      "last_error_code", "hardErrors", "pending_ingestions", "still_failed", "staged_parse"]) {
      expect(src.toLowerCase()).not.toContain(kw.toLowerCase());
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/fxav-observability-timeline && pnpm vitest run tests/cron/runSummary.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cron/runSummary'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cron/runSummary.ts
// Run-summary constants + the cron display registry. This module is deliberately
// kept free of message-catalog keywords so scripts/extract-internal-code-enums.ts
// never extracts CRON_RUN_SUMMARY (see tests/cross-cutting/cron-run-summary-scanner-safety).
export const CRON_RUN_SUMMARY = "CRON_RUN_SUMMARY";

export type CronRunOutcome = "ok" | "partial" | "infra";
export type CronRunSummary = {
  outcome: CronRunOutcome;
  counts?: Record<string, number>;
  detail?: Record<string, unknown>;
};

export type CronJobSpec = { jobName: string; label: string; cadence: string; staleAfterMs: number };

export const CRON_JOBS: readonly CronJobSpec[] = [
  { jobName: "sync", label: "Sync", cadence: "every 5 min", staleAfterMs: 20 * 60_000 },
  { jobName: "notify.realtime", label: "Notify · realtime", cadence: "every 5 min", staleAfterMs: 20 * 60_000 },
  { jobName: "notify.digest", label: "Notify · digest", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  { jobName: "refresh-watch", label: "Refresh watch", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  { jobName: "gc-watch", label: "GC watch", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  { jobName: "asset-recovery", label: "Asset recovery", cadence: "every 15 min", staleAfterMs: 45 * 60_000 },
  { jobName: "diagram-gc", label: "Diagram GC", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  { jobName: "report-reaper", label: "Report reaper", cadence: "daily", staleAfterMs: 48 * 3_600_000 },
  { jobName: "keepalive", label: "Keepalive", cadence: "daily", staleAfterMs: 48 * 3_600_000 },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cron/runSummary.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cron/runSummary.ts tests/cron/runSummary.test.ts
git commit --no-verify -m "feat(observability): cron run-summary constants + CRON_JOBS registry"
```

---

## Task 2: `tests/cron/cronJobsParity.test.ts` — CRON_JOBS ↔ pg-cron parity

**Files:**
- Create: `tests/cron/cronJobsParity.test.ts`

**Interfaces:**
- Consumes: `CRON_JOBS` (Task 1); the canonical registry `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json`.

- [ ] **Step 1: Write the failing test** (this guards drift between the display registry and the real cron set, spec §9.1)

```ts
// tests/cron/cronJobsParity.test.ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CRON_JOBS } from "@/lib/cron/runSummary";

// Explicit jobName ↔ fxav_cron_<name> pairing (bridges hyphen↔underscore and the
// notify route's realtime/digest split). NOT a naive transform.
const PAIRING: Record<string, string> = {
  "sync": "fxav_cron_sync",
  "notify.realtime": "fxav_cron_notify_realtime",
  "notify.digest": "fxav_cron_notify_digest",
  "refresh-watch": "fxav_cron_refresh_watch",
  "gc-watch": "fxav_cron_gc_watch",
  "asset-recovery": "fxav_cron_asset_recovery",
  "diagram-gc": "fxav_cron_diagram_gc",
  "report-reaper": "fxav_cron_report_reaper",
  "keepalive": "fxav_cron_keepalive",
};

const PG_CRON_JSON = join(
  __dirname, "..", "..",
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json",
);

describe("CRON_JOBS parity with pg-cron registry", () => {
  test("CRON_JOBS maps 1:1 onto the 9 fxav_cron_% jobs", () => {
    const raw = JSON.parse(readFileSync(PG_CRON_JSON, "utf8")) as { jobs: Array<{ name: string }> };
    const pgNames = new Set(raw.jobs.map((j) => j.name).filter((n) => n.startsWith("fxav_cron_")));
    expect(pgNames.size).toBe(9);
    const mapped = new Set(CRON_JOBS.map((j) => PAIRING[j.jobName]));
    expect(mapped).toEqual(pgNames);
    // every CRON_JOBS entry has a pairing (no unmapped display job)
    for (const j of CRON_JOBS) expect(PAIRING[j.jobName]).toBeTruthy();
  });
});
```

- [ ] **Step 2: Verify the pg-cron-jobs.json shape** — Read the file first; if the top-level key is not `jobs` or names live elsewhere, adjust the parse (`raw.jobs` vs an array) to match. Run: `pnpm vitest run tests/cron/cronJobsParity.test.ts` — expect FAIL first (parse mismatch or assertion), then adjust the parse to the real shape until it PASSES. Do NOT change `PAIRING` to make it pass; fix only the JSON read.

- [ ] **Step 3: Run test to verify it passes, then PROVE it catches drift (negative-control, invariant 1)**

Run: `pnpm vitest run tests/cron/cronJobsParity.test.ts`
Expected: PASS. Then demonstrate the guard bites: temporarily delete one entry from `CRON_JOBS` in `lib/cron/runSummary.ts`, re-run → FAIL (count/mapping mismatch); revert. (Negative-control satisfies the fail-first discipline for this structural guard test.)

- [ ] **Step 4: Commit**

```bash
git add tests/cron/cronJobsParity.test.ts
git commit --no-verify -m "test(observability): CRON_JOBS ↔ pg-cron registry parity"
```

---

## Task 3: `summarizeSync` — exhaustive sync-run classification

**Files:**
- Create: `lib/cron/summarizeSync.ts`
- Test: `tests/cron/summarizeSync.test.ts`

**Interfaces:**
- Consumes: `RunScheduledCronSyncResult` (`lib/sync/runScheduledCronSync.ts`), `CronRunSummary` (Task 1).
- Produces: `summarizeSync(result: RunScheduledCronSyncResult): CronRunSummary`.

- [ ] **Step 1: Write the failing test** (failure modes: infra arm, item-failure → partial, heartbeat fault → partial, empty → ok; spec §4.4)

```ts
// tests/cron/summarizeSync.test.ts
import { describe, expect, test } from "vitest";
import { summarizeSync } from "@/lib/cron/summarizeSync";

const p = (outcome: string) => ({ driveFileId: "df", result: { outcome } as never });

describe("summarizeSync", () => {
  test("clean run with applied files → ok", () => {
    const s = summarizeSync({ processed: [p("applied"), p("applied"), p("skipped")] } as never);
    expect(s.outcome).toBe("ok");
    expect(s.counts).toMatchObject({ processed: 3, applied: 2, skipped: 1, failed: 0, staged: 0 });
  });
  test("any hard_fail/parse_error/source_gone/stale/revision_race → partial", () => {
    for (const bad of ["hard_fail", "parse_error", "source_gone", "stale", "revision_race", "revision_race_cooldown"]) {
      expect(summarizeSync({ processed: [p("applied"), p(bad)] } as never).outcome).toBe("partial");
    }
  });
  test("summary.outcome=parse_error (SYNC_INFRA_ERROR arm) → infra", () => {
    const s = summarizeSync({ processed: [], summary: { outcome: "parse_error", code: "SYNC_INFRA_ERROR" } } as never);
    expect(s.outcome).toBe("infra");
  });
  test("maintenance heartbeat fault → partial with detail", () => {
    const s = summarizeSync({ processed: [p("applied")], maintenanceFaults: { syncCronHeartbeat: "infra_error" } } as never);
    expect(s.outcome).toBe("partial");
    expect(s.detail).toMatchObject({ maintenanceFaults: { syncCronHeartbeat: "infra_error" } });
  });
  test("empty processed, no folder configured → ok with skipReason", () => {
    const s = summarizeSync({ processed: [], summary: { outcome: "skipped", skipReason: "no_folder_configured" } } as never);
    expect(s.outcome).toBe("ok");
    expect(s.counts).toMatchObject({ processed: 0 });
    expect(s.detail).toMatchObject({ skipReason: "no_folder_configured" });
  });
  test("stage outcome counts as staged, not failed → ok", () => {
    const s = summarizeSync({ processed: [p("stage"), p("asset_recovery")] } as never);
    expect(s.outcome).toBe("ok");
    expect(s.counts).toMatchObject({ staged: 1, skipped: 1, failed: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cron/summarizeSync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cron/summarizeSync.ts
import type { RunScheduledCronSyncResult } from "@/lib/sync/runScheduledCronSync";
import type { CronRunSummary } from "@/lib/cron/runSummary";

const FAILED = new Set([
  "hard_fail", "parse_error", "source_gone", "stale", "revision_race", "revision_race_cooldown",
]);

export function summarizeSync(result: RunScheduledCronSyncResult): CronRunSummary {
  let applied = 0, staged = 0, skipped = 0, failed = 0;
  for (const { result: r } of result.processed) {
    const outcome = (r as { outcome?: string }).outcome;
    if (outcome === "applied") applied++;
    else if (outcome === "stage") staged++;
    else if (outcome === "skipped" || outcome === "asset_recovery") skipped++;
    else if (outcome && FAILED.has(outcome)) failed++;
    else skipped++; // ConcurrentSyncSkipped + any unforeseen → treat as skipped (never silently "applied")
  }
  const counts = { processed: result.processed.length, applied, staged, skipped, failed };

  if (result.summary?.outcome === "parse_error") {
    return { outcome: "infra", counts, detail: { summary: result.summary } };
  }
  const heartbeatFault = result.maintenanceFaults?.syncCronHeartbeat === "infra_error";
  if (failed > 0 || heartbeatFault) {
    return { outcome: "partial", counts, detail: result.maintenanceFaults ? { maintenanceFaults: result.maintenanceFaults } : undefined };
  }
  const detail = result.summary?.outcome === "skipped" ? { skipReason: result.summary.skipReason } : undefined;
  return { outcome: "ok", counts, detail };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cron/summarizeSync.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cron/summarizeSync.ts tests/cron/summarizeSync.test.ts
git commit --no-verify -m "feat(observability): summarizeSync exhaustive sync-run classification"
```

---

## Task 4: `runCronRoute` wrapper — timing, ALS, literal emit, HTTP passthrough

**Files:**
- Create: `lib/cron/withCronRunSummary.ts`
- Test: `tests/cron/withCronRunSummary.test.ts`

**Interfaces:**
- Consumes: `CRON_RUN_SUMMARY`, `CronRunSummary` (Task 1); `log` (`lib/log`), `getRequestContext`/`runWithRequestContext`/`deriveRequestId` (`lib/log/requestContext`); `setLogSink`/`resetLogSink` (`lib/log`).
- Produces: `runCronRoute(jobName: string, request: NextRequest, handler: () => Promise<{ response: Response; summary: CronRunSummary }>): Promise<Response>`.

- [ ] **Step 1: Write the failing test** (failure modes: severity mapping, HTTP passthrough, throw → error-summary + re-throw, awaited emit, ALS idempotency, literal dispatch)

```ts
// tests/cron/withCronRunSummary.test.ts
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogRecord } from "@/lib/log/types";

// The sink is a BARE FUNCTION (record, persist) => void. The wrapper's extra fields
// (jobName/outcome/durationMs/counts/detail) land in record.context; source/code/
// requestId are top-level record fields (see lib/log/logger.ts buildRecord).
async function withCapture(fn: (sink: LogRecord[]) => Promise<void>) {
  vi.resetModules();
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log"); // dynamic import AFTER resetModules → same instance the wrapper imports
  log.setLogSink((record) => { sink.push(record); });
  try { await fn(sink); } finally { log.resetLogSink(); }
}

function req() {
  return { headers: new Headers({ "x-vercel-id": "vercel-abc" }) } as unknown as import("next/server").NextRequest;
}

describe("runCronRoute", () => {
  test("ok summary → log.info; record carries source/code columns + context.{jobName,outcome,durationMs,counts}", async () => {
    await withCapture(async (sink) => {
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      const resp = new Response("ok", { status: 200 });
      const out = await runCronRoute("sync", req(), async () => ({
        response: resp, summary: { outcome: "ok", counts: { processed: 2 } },
      }));
      expect(out).toBe(resp); // exact response passthrough
      expect(sink).toHaveLength(1);
      expect(sink[0].level).toBe("info");
      expect(sink[0].source).toBe("cron.sync");
      expect(sink[0].code).toBe("CRON_RUN_SUMMARY");
      expect(sink[0].requestId).toBe("vercel-abc"); // ALS established from header
      expect(sink[0].context).toMatchObject({ jobName: "sync", outcome: "ok", counts: { processed: 2 } });
      expect(typeof sink[0].context.durationMs).toBe("number");
    });
  });

  test("partial → log.warn; infra → log.error", async () => {
    await withCapture(async (sink) => {
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      await runCronRoute("a", req(), async () => ({ response: new Response(null), summary: { outcome: "partial" } }));
      await runCronRoute("b", req(), async () => ({ response: new Response(null), summary: { outcome: "infra" } }));
      expect(sink.map((s) => s.level)).toEqual(["warn", "error"]);
    });
  });

  test("handler throws → one error summary (context.outcome=threw) then re-throws (HTTP semantics preserved)", async () => {
    await withCapture(async (sink) => {
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      const boom = new Error("boom");
      await expect(
        runCronRoute("sync", req(), async () => { throw boom; }),
      ).rejects.toBe(boom);
      expect(sink).toHaveLength(1);
      expect(sink[0].level).toBe("error");
      expect(sink[0].source).toBe("cron.sync");
      expect(sink[0].code).toBe("CRON_RUN_SUMMARY");
      expect(sink[0].context).toMatchObject({ outcome: "threw" });
    });
  });

  test("reuses an existing request context (idempotent ALS, single holder)", async () => {
    await withCapture(async (sink) => {
      const { runWithRequestContext } = await import("@/lib/log/requestContext");
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      await runWithRequestContext({ requestId: "outer-id" }, async () => {
        await runCronRoute("sync", req(), async () => ({ response: new Response(null), summary: { outcome: "ok" } }));
      });
      expect(sink[0].requestId).toBe("outer-id"); // did NOT derive a new id
    });
  });

  test("AWAITS the emit before returning (serverless-freeze guarantee, §4.2.1 / AC6)", async () => {
    // A synchronous sink can't catch a missing `await`; use a PENDING sink and assert
    // runCronRoute does not resolve until the emit promise resolves.
    vi.resetModules();
    let released = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = () => { released = true; r(); }; });
    const log = await import("@/lib/log");
    log.setLogSink(() => gate); // sink returns a pending promise (real Sink may return Promise<void>)
    const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
    let settled = false;
    const p = runCronRoute("sync", req(), async () => ({ response: new Response(null), summary: { outcome: "ok" } }));
    void p.then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 0)); // flush microtasks (real timers in this test)
    expect(settled).toBe(false); // has NOT returned — awaiting the emit
    release();
    await p;
    expect(released).toBe(true);
    log.resetLogSink();
  });

  test("source code uses literal log methods, never computed log[level] dispatch", () => {
    const src = readFileSync(join(__dirname, "..", "..", "lib/cron/withCronRunSummary.ts"), "utf8");
    expect(src).not.toMatch(/log\s*\[/); // no log[...] computed access
    expect(src).toMatch(/log\.error\s*\(/);
    expect(src).toMatch(/log\.warn\s*\(/);
    expect(src).toMatch(/log\.info\s*\(/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/cron/withCronRunSummary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cron/withCronRunSummary.ts
import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import { deriveRequestId, getRequestContext, runWithRequestContext } from "@/lib/log/requestContext";
import { CRON_RUN_SUMMARY, type CronRunSummary } from "@/lib/cron/runSummary";

export async function runCronRoute(
  jobName: string,
  request: NextRequest,
  handler: () => Promise<{ response: Response; summary: CronRunSummary }>,
): Promise<Response> {
  const run = async (): Promise<Response> => {
    const startedAt = Date.now();
    const source = `cron.${jobName}`;
    let outcome: { response: Response; summary: CronRunSummary };
    try {
      outcome = await handler();
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      // best-effort; never let a logging fault mask the cron error
      try {
        await log.error(`cron ${jobName} run`, {
          source, code: CRON_RUN_SUMMARY, jobName, outcome: "threw", durationMs, error: err,
        });
      } catch { /* swallow logging fault */ }
      throw err; // preserve HTTP/error semantics
    }
    const durationMs = Date.now() - startedAt;
    const fields = {
      source, code: CRON_RUN_SUMMARY, jobName,
      outcome: outcome.summary.outcome, durationMs,
      counts: outcome.summary.counts, detail: outcome.summary.detail,
    };
    try {
      // LITERAL dispatch (never computed member access) so stripLogEmissionCalls strips it.
      if (outcome.summary.outcome === "infra") await log.error(`cron ${jobName} run`, fields);
      else if (outcome.summary.outcome === "partial") await log.warn(`cron ${jobName} run`, fields);
      else await log.info(`cron ${jobName} run`, fields);
    } catch { /* observability must never break the cron */ }
    return outcome.response;
  };

  // Single-holder ALS: reuse an existing context, else establish one.
  return getRequestContext() ? run() : runWithRequestContext({ requestId: deriveRequestId(request.headers) }, run);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/cron/withCronRunSummary.test.ts`
Expected: PASS (6 tests). The sink is the bare-function `Sink` from `lib/log/types.ts`; the record's `source`/`code`/`requestId` are top-level and `jobName/outcome/durationMs/counts` are in `record.context` (per `logger.ts buildRecord` — `RESERVED` keys become columns, the rest go to context).

- [ ] **Step 5: Commit**

```bash
git add lib/cron/withCronRunSummary.ts tests/cron/withCronRunSummary.test.ts
git commit --no-verify -m "feat(observability): runCronRoute wrapper (timing, ALS, literal emit, HTTP passthrough)"
```

---

## Task 5: Wire `sync` route + per-route summarizers for the other 7 routes

**Files:**
- Modify: `app/api/cron/sync/route.ts`
- Modify: `app/api/cron/{keepalive,notify,refresh-watch,gc-watch,asset-recovery,diagram-gc,report-reaper}/route.ts`
- Test: `tests/cron/cronRouteSummaries.test.ts`

**Interfaces:**
- Consumes: `runCronRoute` (Task 4), `summarizeSync` (Task 3), `CronRunSummary` (Task 1), each route's existing orchestrator + `rejectUnauthorizedCron`.

**Per-route classification (spec §4.3 — derive from the real result type):**
- `sync` → `summarizeSync(result)`.
- `keepalive` → `{ outcome: "ok" }`.
- `notify.realtime`/`notify.digest` → `infra` if `delivery.kind==="infra_error"` OR any `maintenance[].result.kind==="infra_error"` OR any `toggleFaults?.length` (delivery or maintenance); else `ok`. counts `{ sent: delivery.kind==="ok" ? delivery.sent : 0, maintenanceSteps: maintenance.length }`. (No `partial` for notify.) jobName from `?job=` → `notify.realtime`/`notify.digest`; keep the unknown-`job`→400 branch OUTSIDE the wrapper.
- `refresh-watch` → `{ outcome:"ok", counts:{ refreshed: result.refreshed.length } }`.
- `gc-watch` → `{ outcome:"ok", counts:{ stopped: result.stopped.length } }`.
- `asset-recovery` → iterate `processed[].result.outcome`: `infra` if any `infra_error`; else `partial` if any `partial_failure`/`bytes_exceeded`; else `ok`. counts `{ processed, recovered, skipped, failed }` per the §4.3 map.
- `diagram-gc` → `{ outcome:"ok", counts:{ orphanBlobsDeleted, pendingPrefixesDeleted, promotedRowsDeleted } }`.
- `report-reaper` → `{ outcome:"ok", counts:{ deleted } }`; its existing `ReportReaperInfraError` catch maps to `{ outcome:"infra" }` and keeps returning its 500.

- [ ] **Step 1: Write the failing integration-ish test** (proves each route, on a successful run, emits exactly one `CRON_RUN_SUMMARY` with the right source/severity; and a 401 emits none)

```ts
// tests/cron/cronRouteSummaries.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

beforeEach(() => { process.env.CRON_SECRET = "secret"; });
afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

// Bare-function sink; CRON_RUN_SUMMARY rows have code at top level, outcome in context.
async function setSink(): Promise<LogRecord[]> {
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => { sink.push(record); });
  return sink;
}
const authed = () => ({ headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }), url: "https://x/api/cron/sync" }) as never;
const unauthed = () => ({ headers: new Headers(), url: "https://x/api/cron/sync" }) as never;

describe("cron routes emit one CRON_RUN_SUMMARY per authorized run", () => {
  test("sync: authorized → one info summary; unauthorized → none", async () => {
    vi.resetModules();
    vi.doMock("@/lib/sync/runScheduledCronSync", () => ({
      runScheduledCronSync: async () => ({ processed: [{ driveFileId: "d", result: { outcome: "applied" } }] }),
    }));
    vi.doMock("@/lib/sync/syncLog", () => ({ writeSyncLog: async () => {} }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/sync/route");
    const r = await GET(authed());
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0].source).toBe("cron.sync");
    expect(summaries[0].context).toMatchObject({ outcome: "ok" });

    const sink2 = await setSink(); // same cached @/lib/log instance → same activeSink the route uses
    const r2 = await GET(unauthed());
    expect(r2.status).toBe(401);
    expect(sink2.filter((s) => s.code === "CRON_RUN_SUMMARY")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/cron/cronRouteSummaries.test.ts`
Expected: FAIL — `sync/route.ts` does not yet emit a `CRON_RUN_SUMMARY` (zero summaries).

- [ ] **Step 3: Edit `app/api/cron/sync/route.ts`** (auth stays outside the wrapper; drop the inline `runWithRequestContext` — the wrapper owns it)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { rejectUnauthorizedCron } from "@/app/api/cron/_auth";
import { runScheduledCronSync } from "@/lib/sync/runScheduledCronSync";
import { writeSyncLog } from "@/lib/sync/syncLog";
import { runCronRoute } from "@/lib/cron/withCronRunSummary";
import { summarizeSync } from "@/lib/cron/summarizeSync";

export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("sync", request, async () => {
    const result = await runScheduledCronSync({ logSync: writeSyncLog });
    return {
      response: NextResponse.json({ ok: true, processed: result.processed }),
      summary: summarizeSync(result),
    };
  });
}
```

- [ ] **Step 4: Edit the other 7 routes.** For each, keep `rejectUnauthorizedCron` (and notify's unknown-`job`→400) BEFORE `runCronRoute`, then wrap the orchestrator call and return `{ response, summary }` per the classification table above. Read each route file first to preserve its exact orchestrator call + success body. Example (`refresh-watch`):

```ts
export async function GET(request: NextRequest): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  return runCronRoute("refresh-watch", request, async () => {
    const result = await refreshWatchSubscriptions();
    return {
      response: NextResponse.json({ ok: true, refreshed: result.refreshed }),
      summary: { outcome: "ok", counts: { refreshed: result.refreshed.length } },
    };
  });
}
```

For `notify`, branch the jobName on `?job=` (read `app/api/cron/notify/route.ts:40`); classify per the notify rule; keep the existing `statusFor`-based status code on the response. For `report-reaper`, keep its internal try/catch returning 500 and have its catch produce `{ outcome:"infra" }` to the wrapper. For `asset-recovery`/`diagram-gc`, build counts from the real result fields.

- [ ] **Step 5: Add per-route assertions to the test** — extend `cronRouteSummaries.test.ts` with one `describe` block per remaining route (mock its orchestrator to a representative result, assert exactly one summary with the expected `source` + `outcome`: notify infra-on-fault, asset-recovery partial-on-`partial_failure`, report-reaper infra-on-`ReportReaperInfraError`, the count-only routes → ok). **Also pin notify's unknown-`?job=`→400-no-summary branch** (AC6: both 401 AND 400 emit no summary):

```ts
  test("notify: unknown ?job= → 400 and NO summary (branch outside the wrapper)", async () => {
    vi.resetModules();
    // notify's orchestrator need not run for an unknown job; mock it as a no-op for safety.
    vi.doMock("@/lib/notify/runNotify", () => ({ runNotify: async () => ({ kind: "ok", maintenance: [], delivery: { kind: "ok", sent: 0 } }) }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/notify/route");
    const r = await GET({ headers: new Headers({ authorization: "Bearer secret" }), url: "https://x/api/cron/notify?job=bogus" } as never);
    expect(r.status).toBe(400);
    expect(sink.filter((s) => s.code === "CRON_RUN_SUMMARY")).toHaveLength(0);
  });
```

Run until all PASS. (Read `app/api/cron/notify/route.ts` for the real import name of its orchestrator and adjust the `vi.doMock` target accordingly.)

Run: `pnpm vitest run tests/cron/cronRouteSummaries.test.ts`
Expected: PASS (all routes).

- [ ] **Step 6: Commit**

```bash
git add app/api/cron tests/cron/cronRouteSummaries.test.ts
git commit --no-verify -m "feat(observability): emit CRON_RUN_SUMMARY across all 9 cron jobs via runCronRoute"
```

---

## Task 6: Scanner-safety regression test

**Files:**
- Create: `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts`

**Interfaces:**
- Consumes: `extractInternalCodeEnums`, `renderInternalCodeEnums` (`scripts/extract-internal-code-enums.ts`).

- [ ] **Step 1: Write the test** (spec §9.1 — assert `CRON_RUN_SUMMARY` appears NOWHERE in the generated artifact)

```ts
// tests/cross-cutting/cron-run-summary-scanner-safety.test.ts
import { describe, expect, test } from "vitest";
import { extractInternalCodeEnums, renderInternalCodeEnums } from "@/scripts/extract-internal-code-enums";

describe("CRON_RUN_SUMMARY never leaks into the §12.4 internal-code-enum manifest", () => {
  test("not present in the extracted object (keys or values) nor the rendered source", () => {
    const enums = extractInternalCodeEnums();
    expect(JSON.stringify(enums)).not.toContain("CRON_RUN_SUMMARY");
    expect(renderInternalCodeEnums(enums)).not.toContain("CRON_RUN_SUMMARY");
  });
});
```

- [ ] **Step 2: Run to verify it passes NOW, then PROVE it catches a leak (negative-control, invariant 1)**

Run: `pnpm vitest run tests/cross-cutting/cron-run-summary-scanner-safety.test.ts`
Expected: PASS (the wrapper emits inside literal `log.*()` and the const module is keyword-clean). **If it FAILS now**, the wrapper/route used a non-literal `log` dispatch or `runSummary.ts` gained a forbidden keyword — fix the source (Task 1/4/5), do not weaken the test. Then demonstrate the guard bites: temporarily add the comment `// admin_alert` to `lib/cron/runSummary.ts` (which makes `extract-internal-code-enums.ts`'s admin-alerts pass extract `CRON_RUN_SUMMARY` from the `export const`), re-run → FAIL; revert.

- [ ] **Step 3: Prove the generators are byte-stable**

Run: `pnpm gen:internal-code-enums && git diff --exit-code lib/messages/__generated__/internal-code-enums.ts`
Expected: exit 0 (no diff). Then run the §12.4 catalog gates to confirm no collision:
Run: `pnpm vitest run tests/messages/catalog.test.ts tests/cross-cutting/codes.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/cross-cutting/cron-run-summary-scanner-safety.test.ts
git commit --no-verify -m "test(observability): pin CRON_RUN_SUMMARY out of the §12.4 internal-code-enum manifest"
```

---

## Task 7: Read-path types + `parseAppEventFilters`

**Files:**
- Create: `lib/admin/observabilityTypes.ts`
- Test: `tests/admin/parseAppEventFilters.test.ts`

**Interfaces:**
- Produces: `AppEventRow`, `AppEventFilters`, `LoadAppEventsResult`, `CronHealthRow`, `LoadCronHealthResult`; `parseAppEventFilters(sp: URLSearchParams | Record<string,string|string[]|undefined>): AppEventFilters`; `escapeIlike(q: string): string`; `PAGE_SIZE = 100`.

- [ ] **Step 1: Write the failing test** (failure modes from spec §5.1 guards: bad UUIDs dropped, `since` token, ILIKE escaping, level filtering, max-length, cursor validity)

```ts
// tests/admin/parseAppEventFilters.test.ts
import { describe, expect, test } from "vitest";
import { parseAppEventFilters, escapeIlike } from "@/lib/admin/observabilityTypes";

const sp = (o: Record<string, string>) => new URLSearchParams(o);
const UUID = "00000000-0000-0000-0000-000000000001";

describe("parseAppEventFilters", () => {
  test("defaults: empty → sinceHours 24, no other filters", () => {
    const f = parseAppEventFilters(sp({}));
    expect(f.sinceHours).toBe(24);
    expect(f.levels).toBeUndefined();
    expect(f.cursor == null).toBe(true);
  });
  test("since token mapping: 1h/24h/7d/all → 1/24/168/null; junk → 24", () => {
    expect(parseAppEventFilters(sp({ since: "1h" })).sinceHours).toBe(1);
    expect(parseAppEventFilters(sp({ since: "7d" })).sinceHours).toBe(168);
    expect(parseAppEventFilters(sp({ since: "all" })).sinceHours).toBeNull();
    expect(parseAppEventFilters(sp({ since: "bogus" })).sinceHours).toBe(24);
  });
  test("levels: only valid members kept", () => {
    expect(parseAppEventFilters(sp({ level: "warn,bogus,error" })).levels).toEqual(["warn", "error"]);
    expect(parseAppEventFilters(sp({ level: "nope" })).levels).toBeUndefined();
  });
  test("showId/cursor.id must be UUID else dropped", () => {
    expect(parseAppEventFilters(sp({ showId: "not-a-uuid" })).showId).toBeUndefined();
    expect(parseAppEventFilters(sp({ showId: UUID })).showId).toBe(UUID);
  });
  test("string filters capped at 200 chars; whitespace q ignored", () => {
    const long = "x".repeat(201);
    expect(parseAppEventFilters(sp({ source: long })).source).toBeUndefined();
    expect(parseAppEventFilters(sp({ q: "   " })).q).toBeUndefined();
    expect(parseAppEventFilters(sp({ q: "  hello  " })).q).toBe("hello");
  });
  test("source/code/requestId pass through (requestId must survive parse for AC3 correlation)", () => {
    const f = parseAppEventFilters(sp({ source: "cron.sync", code: "CRON_RUN_SUMMARY", requestId: "req-9" }));
    expect(f.source).toBe("cron.sync");
    expect(f.code).toBe("CRON_RUN_SUMMARY");
    expect(f.requestId).toBe("req-9");
  });
  test("cursor accepted only with ISO-shaped occurredAt + UUID id", () => {
    const good = parseAppEventFilters(sp({ cursorAt: "2026-06-29T00:00:00.000Z", cursorId: UUID }));
    expect(good.cursor).toEqual({ occurredAt: "2026-06-29T00:00:00.000Z", id: UUID });
    // accepts PostgREST-style microseconds + +00:00 offset (the DB's own format)
    expect(parseAppEventFilters(sp({ cursorAt: "2026-06-29T00:00:00.123456+00:00", cursorId: UUID })).cursor).toBeTruthy();
    // rejects Date.parse-able-but-not-a-timestamp junk
    for (const bad of ["nope", "2026", "now", "June 29 2026"]) {
      expect(parseAppEventFilters(sp({ cursorAt: bad, cursorId: UUID })).cursor == null).toBe(true);
    }
  });
  test("escapeIlike escapes %, _ and backslash", () => {
    expect(escapeIlike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/admin/parseAppEventFilters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types + parser**

```ts
// lib/admin/observabilityTypes.ts
export const PAGE_SIZE = 100;

export type AppEventLevel = "info" | "warn" | "error";
export type AppEventRow = {
  id: string; occurredAt: string; level: AppEventLevel;
  source: string; message: string; code: string | null;
  requestId: string | null; showId: string | null;
  driveFileId: string | null; actorHash: string | null;
  context: Record<string, unknown>; showTitle: string | null;
};
export type AppEventCursor = { occurredAt: string; id: string };
export type AppEventFilters = {
  levels?: AppEventLevel[]; source?: string; code?: string;
  showId?: string; requestId?: string;
  sinceHours?: 1 | 24 | 168 | null; q?: string; cursor?: AppEventCursor | null;
};
export type LoadAppEventsResult =
  | { kind: "ok"; events: AppEventRow[]; hasMore: boolean; nextCursor: AppEventCursor | null }
  | { kind: "infra_error"; message: string };

export type CronRunOutcomeRead = "ok" | "partial" | "infra" | "threw";
export type CronHealthRow = {
  jobName: string; label: string; cadence: string; staleAfterMs: number;
  lastRunAt: string | null; outcome: CronRunOutcomeRead | null;
  level: AppEventLevel | null; counts: Record<string, number> | null;
};
export type LoadCronHealthResult =
  | { kind: "ok"; jobs: CronHealthRow[] }
  | { kind: "infra_error"; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO-8601 timestamp shape — rejects Date.parse-able junk ("2026", "now", "June 29 2026")
// while accepting BOTH canonical JS (…Z) and PostgREST (…+00:00, microseconds) forms,
// so we must NOT use a strict toISOString() round-trip (it would reject the DB's own format).
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const LEVELS: AppEventLevel[] = ["info", "warn", "error"];

export function escapeIlike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => "\\" + c);
}

type SP = URLSearchParams | Record<string, string | string[] | undefined>;
function get(sp: SP, key: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined;
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}
function capped(v: string | undefined): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return t.length === 0 || t.length > 200 ? undefined : t;
}

export function parseAppEventFilters(sp: SP): AppEventFilters {
  const f: AppEventFilters = {};

  const level = get(sp, "level");
  if (level) {
    const kept = level.split(",").map((s) => s.trim()).filter((s): s is AppEventLevel => (LEVELS as string[]).includes(s));
    if (kept.length) f.levels = kept;
  }
  f.source = capped(get(sp, "source"));
  f.code = capped(get(sp, "code"));
  f.requestId = capped(get(sp, "requestId"));
  const showId = get(sp, "showId");
  if (showId && UUID_RE.test(showId)) f.showId = showId;
  const q = capped(get(sp, "q"));
  if (q) f.q = q;

  const since = get(sp, "since");
  f.sinceHours = since === "1h" ? 1 : since === "7d" ? 168 : since === "all" ? null : since === "24h" ? 24 : 24;

  const cAt = get(sp, "cursorAt"); const cId = get(sp, "cursorId");
  if (cAt && cId && UUID_RE.test(cId) && ISO_TS_RE.test(cAt) && !Number.isNaN(Date.parse(cAt))) {
    f.cursor = { occurredAt: cAt, id: cId };
  }
  return f;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/admin/parseAppEventFilters.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/observabilityTypes.ts tests/admin/parseAppEventFilters.test.ts
git commit --no-verify -m "feat(observability): read-path types + hardened parseAppEventFilters"
```

---

## Task 8: `loadAppEvents` — service-role timeline query + keyset pagination

**Files:**
- Create: `lib/admin/loadAppEvents.ts`
- Test: `tests/admin/loadAppEvents.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServiceRoleClient` (`lib/supabase/server`), types + `escapeIlike` + `PAGE_SIZE` (Task 7), `log` (`lib/log`).
- Produces: `loadAppEvents(filters: AppEventFilters): Promise<LoadAppEventsResult>`.

- [ ] **Step 1: Write the failing test** (failure modes: filter→builder translation, N+1 → hasMore + trim, returned-error → infra, embed maps showTitle). Use a chainable mock Supabase client.

```ts
// tests/admin/loadAppEvents.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;
function mockClient(rows: Row[], opts: { error?: unknown } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  const rec = (m: string) => (...a: unknown[]) => { calls.push({ method: m, args: a }); return builder; };
  for (const m of ["select", "in", "eq", "gte", "ilike", "order", "or"]) builder[m] = rec(m);
  builder.limit = (...a: unknown[]) => { calls.push({ method: "limit", args: a }); return Promise.resolve({ data: rows, error: opts.error ?? null }); };
  return { from: (t: string) => { calls.push({ method: "from", args: [t] }); return builder; }, __calls: calls };
}
function mk(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`, occurred_at: `2026-06-29T00:00:${String(i).padStart(2, "0")}.000Z`,
    level: "error", source: "auth", message: "m", code: null, request_id: null,
    show_id: null, drive_file_id: null, actor_hash: null, context: {}, shows: null,
  }));
}
afterEach(() => vi.restoreAllMocks());

async function withClient(client: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: () => client }));
  return (await import("@/lib/admin/loadAppEvents")).loadAppEvents;
}

describe("loadAppEvents", () => {
  test("returns kind:ok, trims to PAGE_SIZE, hasMore when N+1 rows", async () => {
    const client = mockClient(mk(101));
    const loadAppEvents = await withClient(client);
    const r = await loadAppEvents({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.events).toHaveLength(100);
    expect(r.hasMore).toBe(true);
    expect(r.nextCursor).toEqual({ occurredAt: r.events[99].occurredAt, id: r.events[99].id });
    expect((client.__calls).some((c) => c.method === "limit" && c.args[0] === 101)).toBe(true);
  });

  test("EMPTY filters {} default to a 24h occurred_at lower bound; since=all omits it", async () => {
    const c1 = mockClient(mk(1)); const load1 = await withClient(c1);
    await load1({}); // empty → 24h default (spec §5.1), applied INSIDE the loader (not only the parser)
    expect(c1.__calls.some((c) => c.method === "gte" && c.args[0] === "occurred_at")).toBe(true);
    const c2 = mockClient(mk(1)); const load2 = await withClient(c2);
    await load2({ sinceHours: null });
    expect(c2.__calls.some((c) => c.method === "gte")).toBe(false);
  });

  test("levels/source/code/showId/requestId/q produce the matching builder calls", async () => {
    const c = mockClient(mk(0)); const load = await withClient(c);
    await load({ levels: ["warn", "error"], source: "cron.sync", code: "CRON_RUN_SUMMARY",
      showId: "00000000-0000-0000-0000-000000000001", requestId: "req-9", q: "5%x" });
    expect(c.__calls.some((x) => x.method === "in" && x.args[0] === "level")).toBe(true);
    expect(c.__calls.some((x) => x.method === "eq" && x.args[0] === "source")).toBe(true);
    expect(c.__calls.some((x) => x.method === "eq" && x.args[0] === "code")).toBe(true);
    expect(c.__calls.some((x) => x.method === "eq" && x.args[0] === "show_id" && x.args[1] === "00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(c.__calls.some((x) => x.method === "eq" && x.args[0] === "request_id" && x.args[1] === "req-9")).toBe(true);
    // q is escaped + wrapped
    expect(c.__calls.some((x) => x.method === "ilike" && String(x.args[1]).includes("5\\%x"))).toBe(true);
  });

  test("cursor → exactly one .or(...) keyset predicate with occurred_at AND id tie-breaker", async () => {
    const c = mockClient(mk(0)); const load = await withClient(c);
    await load({ cursor: { occurredAt: "2026-06-29T00:00:00.000Z", id: "id-9" } });
    const ors = c.__calls.filter((x) => x.method === "or");
    expect(ors).toHaveLength(1);
    expect(String(ors[0].args[0])).toContain("occurred_at.lt.2026-06-29T00:00:00.000Z");
    expect(String(ors[0].args[0])).toContain("id.lt.id-9");
  });

  test("returned {error} → infra_error (no throw, message names app_events)", async () => {
    const c = mockClient([], { error: { message: "boom" } }); const load = await withClient(c);
    const r = await load({});
    expect(r).toMatchObject({ kind: "infra_error" });
    expect((r as { message: string }).message).toMatch(/app_events/);
  });

  test("thrown from builder → infra_error with /app_events.*threw/", async () => {
    const throwing = { from: () => { throw new Error("net reset"); } };
    const load = await withClient(throwing);
    const r = await load({});
    expect(r).toMatchObject({ kind: "infra_error" });
    expect((r as { message: string }).message).toMatch(/app_events.*threw/);
  });

  test("shows embed maps to showTitle", async () => {
    const rows = mk(1).map((row) => ({ ...row, show_id: "s1", shows: { title: "RPAS" } }));
    const c = mockClient(rows); const load = await withClient(c);
    const r = await load({});
    if (r.kind !== "ok") throw new Error("ok");
    expect(r.events[0].showTitle).toBe("RPAS");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/admin/loadAppEvents.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the loader** (one try/catch; returned-error AND thrown → infra; keyset; embed)

```ts
// lib/admin/loadAppEvents.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import {
  PAGE_SIZE, escapeIlike,
  type AppEventFilters, type AppEventRow, type LoadAppEventsResult,
} from "@/lib/admin/observabilityTypes";

export async function loadAppEvents(filters: AppEventFilters): Promise<LoadAppEventsResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase
      .from("app_events")
      .select(
        "id, occurred_at, level, source, message, code, request_id, show_id, drive_file_id, actor_hash, context, shows(title)",
      )
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false });

    if (filters.levels?.length) query = query.in("level", filters.levels);
    if (filters.source) query = query.eq("source", filters.source);
    if (filters.code) query = query.eq("code", filters.code);
    if (filters.showId) query = query.eq("show_id", filters.showId);
    if (filters.requestId) query = query.eq("request_id", filters.requestId);
    // Empty filters default to last 24h (spec §5.1): undefined → 24h; null → all (no bound).
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
      query = query.gte("occurred_at", since);
    }
    if (filters.q) query = query.ilike("message", `%${escapeIlike(filters.q)}%`);
    if (filters.cursor) {
      const { occurredAt, id } = filters.cursor;
      query = query.or(`occurred_at.lt.${occurredAt},and(occurred_at.eq.${occurredAt},id.lt.${id})`);
    }

    const { data, error } = await query.limit(PAGE_SIZE + 1);
    if (error) {
      void log.error("app_events read returned error", { source: "admin.loadAppEvents", error });
      return { kind: "infra_error", message: "app_events read failed" };
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const hasMore = rows.length > PAGE_SIZE;
    const kept = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const events: AppEventRow[] = kept.map((r) => ({
      id: r.id as string,
      occurredAt: r.occurred_at as string,
      level: r.level as AppEventRow["level"],
      source: r.source as string,
      message: r.message as string,
      code: (r.code as string | null) ?? null,
      requestId: (r.request_id as string | null) ?? null,
      showId: (r.show_id as string | null) ?? null,
      driveFileId: (r.drive_file_id as string | null) ?? null,
      actorHash: (r.actor_hash as string | null) ?? null,
      context: (r.context as Record<string, unknown>) ?? {},
      showTitle: ((r.shows as { title?: string } | null)?.title) ?? null,
    }));
    const last = events[events.length - 1];
    return { kind: "ok", events, hasMore, nextCursor: hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null };
  } catch (err) {
    void log.error("app_events read threw", { source: "admin.loadAppEvents", error: err });
    return { kind: "infra_error", message: "app_events read threw" };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/admin/loadAppEvents.test.ts`
Expected: PASS (7 tests). If the real PostgREST embed key differs (e.g. `shows` vs aliased), align `select(...)` + the `shows` extraction; keep behavior identical.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/loadAppEvents.ts tests/admin/loadAppEvents.test.ts
git commit --no-verify -m "feat(observability): loadAppEvents service-role timeline query + keyset pagination"
```

---

## Task 9: `loadCronHealth` — per-job latest summary

**Files:**
- Create: `lib/admin/loadCronHealth.ts`
- Test: `tests/admin/loadCronHealth.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServiceRoleClient`, `CRON_RUN_SUMMARY` + `CRON_JOBS` (Task 1), types (Task 7), `log`.
- Produces: `loadCronHealth(): Promise<LoadCronHealthResult>`.

- [ ] **Step 1: Write the failing test** (per-job limit(1) Promise.all; no-row → nulls; malformed context → outcome null but lastRunAt set; thrown → infra `/app_events.*threw/`)

```ts
// tests/admin/loadCronHealth.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";

// Per-source latest-row mock: returns the seeded row for the source in the eq("source", X) call.
function mockClient(bySource: Record<string, Record<string, unknown> | null>, opts: { error?: unknown; throwOnFrom?: boolean } = {}) {
  return {
    from() {
      if (opts.throwOnFrom) throw new Error("net reset");
      let source = "";
      const b: Record<string, unknown> = {};
      const passthrough = () => b;
      b.select = passthrough; b.order = passthrough;
      b.eq = (col: string, val: string) => { if (col === "source") source = val; return b; };
      b.limit = () => Promise.resolve({ data: opts.error ? null : (bySource[source] ? [bySource[source]] : []), error: opts.error ?? null });
      return b;
    },
  };
}
afterEach(() => vi.restoreAllMocks());
async function withClient(client: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: () => client }));
  return (await import("@/lib/admin/loadCronHealth")).loadCronHealth;
}
const row = (over: Record<string, unknown>) => ({ occurred_at: "2026-06-29T00:00:00.000Z", level: "info", context: { outcome: "ok", counts: { processed: 3 } }, ...over });

describe("loadCronHealth", () => {
  test("ok: one CronHealthRow per CRON_JOBS entry (9), latest per source", async () => {
    const load = await withClient(mockClient({ "cron.sync": row({}) }));
    const r = await load();
    if (r.kind !== "ok") throw new Error("ok");
    expect(r.jobs).toHaveLength(9);
    const sync = r.jobs.find((j) => j.jobName === "sync")!;
    expect(sync.lastRunAt).toBe("2026-06-29T00:00:00.000Z");
    expect(sync.outcome).toBe("ok");
    expect(sync.counts).toMatchObject({ processed: 3 });
    expect(sync.staleAfterMs).toBeGreaterThan(0);
  });
  test("no row → lastRunAt null, outcome null", async () => {
    const load = await withClient(mockClient({}));
    const r = await load();
    if (r.kind !== "ok") throw new Error("ok");
    const keepalive = r.jobs.find((j) => j.jobName === "keepalive")!;
    expect(keepalive.lastRunAt).toBeNull();
    expect(keepalive.outcome).toBeNull();
  });
  test("malformed context.outcome → outcome null but lastRunAt set (distinct from no-row)", async () => {
    const load = await withClient(mockClient({ "cron.sync": row({ level: "warn", context: { outcome: "weird" } }) }));
    const r = await load();
    if (r.kind !== "ok") throw new Error("ok");
    const sync = r.jobs.find((j) => j.jobName === "sync")!;
    expect(sync.lastRunAt).toBe("2026-06-29T00:00:00.000Z");
    expect(sync.outcome).toBeNull();
    expect(sync.level).toBe("warn");
  });
  test("returned {error} on a read → infra_error 'returned error' (distinct from threw)", async () => {
    const load = await withClient(mockClient({}, { error: { message: "boom" } }));
    const r = await load();
    expect(r).toMatchObject({ kind: "infra_error" });
    expect((r as { message: string }).message).toMatch(/returned error/);
  });
  test("thrown → infra_error /app_events.*threw/", async () => {
    const load = await withClient(mockClient({}, { throwOnFrom: true }));
    const r = await load();
    expect(r).toMatchObject({ kind: "infra_error" });
    expect((r as { message: string }).message).toMatch(/app_events.*threw/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/admin/loadCronHealth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the loader** (9 `limit(1)` queries in one try/catch via `Promise.all`)

```ts
// lib/admin/loadCronHealth.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { CRON_RUN_SUMMARY, CRON_JOBS } from "@/lib/cron/runSummary";
import type { AppEventLevel, CronHealthRow, CronRunOutcomeRead, LoadCronHealthResult } from "@/lib/admin/observabilityTypes";

const OUTCOMES: CronRunOutcomeRead[] = ["ok", "partial", "infra", "threw"];

export async function loadCronHealth(): Promise<LoadCronHealthResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const results = await Promise.all(
      CRON_JOBS.map((job) =>
        supabase
          .from("app_events")
          .select("occurred_at, level, context")
          .eq("code", CRON_RUN_SUMMARY)
          .eq("source", `cron.${job.jobName}`)
          .order("occurred_at", { ascending: false })
          .limit(1),
      ),
    );
    // Supabase call-boundary (invariant 9): destructure { data, error } per result.
    // A RETURNED {error} on any of the 9 reads → distinct infra_error("…returned error");
    // a genuine THROW (network reset, construction fault) funnels to the catch → "…threw".
    for (const { error } of results) {
      if (error) {
        void log.error("app_events read returned error", { source: "admin.loadCronHealth", error });
        return { kind: "infra_error", message: "app_events read returned error" };
      }
    }
    const jobs: CronHealthRow[] = CRON_JOBS.map((job, i) => {
      const { data } = results[i];
      const r = (data as Array<Record<string, unknown>> | null)?.[0];
      if (!r) {
        return { ...job, lastRunAt: null, outcome: null, level: null, counts: null };
      }
      const ctx = (r.context ?? {}) as Record<string, unknown>;
      const rawOutcome = ctx.outcome;
      const outcome = typeof rawOutcome === "string" && (OUTCOMES as string[]).includes(rawOutcome)
        ? (rawOutcome as CronRunOutcomeRead) : null;
      const counts = ctx.counts && typeof ctx.counts === "object" && !Array.isArray(ctx.counts)
        ? (ctx.counts as Record<string, number>) : null;
      return {
        ...job,
        lastRunAt: r.occurred_at as string,
        outcome,
        level: (r.level as AppEventLevel | null) ?? null,
        counts,
      };
    });
    return { kind: "ok", jobs };
  } catch (err) {
    void log.error("app_events read threw", { source: "admin.loadCronHealth", error: err });
    return { kind: "infra_error", message: "app_events read threw" };
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/admin/loadCronHealth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/loadCronHealth.ts tests/admin/loadCronHealth.test.ts
git commit --no-verify -m "feat(observability): loadCronHealth per-job latest summary"
```

---

## Task 10: Extend `tests/admin/_metaInfraContract.test.ts` for both loaders

**Files:**
- Modify: `tests/admin/_metaInfraContract.test.ts`

**Interfaces:**
- Consumes: `loadAppEvents` (Task 8), `loadCronHealth` (Task 9). The meta-test mocks `createSupabaseServiceRoleClient` already (`:138-143`).

- [ ] **Step 1: Add two `infraRegistry` rows** (after the existing rows, `:295`):

```ts
  {
    helper: "loadAppEvents",
    path: "lib/admin/loadAppEvents.ts",
    contract:
      "app_events timeline read (service-role; revoke-all-from-authenticated table). client construction + single query (incl. shows(title) embed) in one try/catch; returned-error → infra_error('app_events read failed'); thrown → infra_error('app_events read threw'); keyset paginated.",
  },
  {
    helper: "loadCronHealth",
    path: "lib/admin/loadCronHealth.ts",
    contract:
      "cron health: Promise.all of 9 per-job app_events limit(1) reads (service-role) in one try/catch; a per-result RETURNED {error} → infra_error('app_events read returned error') (distinct path, behaviorally tested in tests/admin/loadCronHealth.test.ts); a genuine THROW (network/construction) → infra_error('app_events read threw'); construction throw → infra_error.",
  },
```

- [ ] **Step 2: Add behavioral describe blocks** (mirror the existing `loadHeldShows` style; the meta-test's mock service-role client supports `throwOnConstruct`/`throwOnFromTable`):

```ts
  describe("loadAppEvents", () => {
    test("service-role construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { loadAppEvents } = await import("@/lib/admin/loadAppEvents");
      expect(await loadAppEvents({})).toMatchObject({ kind: "infra_error" });
    });
    test("from('app_events') throw → infra_error /app_events.*threw/", async () => {
      infraMock.throwOnFromTable = "app_events";
      const { loadAppEvents } = await import("@/lib/admin/loadAppEvents");
      const r = await loadAppEvents({});
      expect(r).toMatchObject({ kind: "infra_error" });
      expect((r as { message: string }).message).toMatch(/app_events.*threw/);
    });
  });

  describe("loadCronHealth", () => {
    test("service-role construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { loadCronHealth } = await import("@/lib/admin/loadCronHealth");
      expect(await loadCronHealth()).toMatchObject({ kind: "infra_error" });
    });
    test("from('app_events') throw → infra_error /app_events.*threw/", async () => {
      infraMock.throwOnFromTable = "app_events";
      const { loadCronHealth } = await import("@/lib/admin/loadCronHealth");
      const r = await loadCronHealth();
      expect(r).toMatchObject({ kind: "infra_error" });
      expect((r as { message: string }).message).toMatch(/app_events.*threw/);
    });
  });
```

- [ ] **Step 3: Run the meta-test**

Run: `pnpm vitest run tests/admin/_metaInfraContract.test.ts`
Expected: PASS — including the grep-shape test (every supabase await + the builder assignment in both loaders is inside the single try/catch) and the new behavioral blocks. **If the grep-shape test fails**, the loader has a builder/await outside its `try` — move it inside (do NOT add a `not-subject-to-meta` waiver; these are exactly the helpers the contract governs). The mock's `limit` resolves to `{data,error}`; if `loadCronHealth`'s `Promise.all` form isn't recognized by the await-detection, confirm it matches the `await Promise.all([...])` heuristic (`:437-442`).

- [ ] **Step 4: Commit**

```bash
git add tests/admin/_metaInfraContract.test.ts
git commit --no-verify -m "test(observability): register loadAppEvents + loadCronHealth in admin infra-contract"
```

---

## Task 11: `EventLevelBadge` + `cronHealthStatus` (presentational primitives)

**Files:**
- Create: `components/admin/observability/EventLevelBadge.tsx`
- Create: `components/admin/observability/cronHealthStatus.ts`
- Test: `tests/components/observability/eventLevelBadge.test.tsx`
- Test: `tests/components/observability/cronHealthStatus.test.ts`

**Interfaces:**
- Produces: `EventLevelBadge({ level })`; `effectiveCronStatus(row: CronHealthRow, now: Date): { status: "live"|"positive"|"review"|"warn"|"idle"; label: string }`.

- [ ] **Step 1: Write the failing tests** (derive expectations from inputs, not hardcoded; spec §6.2)

```ts
// tests/components/observability/cronHealthStatus.test.ts
import { describe, expect, test } from "vitest";
import { effectiveCronStatus } from "@/components/admin/observability/cronHealthStatus";
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";

const base: CronHealthRow = { jobName: "sync", label: "Sync", cadence: "5m", staleAfterMs: 20 * 60_000, lastRunAt: null, outcome: null, level: null, counts: null };
const now = new Date("2026-06-29T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("effectiveCronStatus", () => {
  test("no row → idle 'No run seen'", () => {
    expect(effectiveCronStatus(base, now)).toMatchObject({ status: "idle", label: expect.stringContaining("No run seen") });
  });
  test("stale overrides a stale 'ok' → warn 'Stale'", () => {
    const row = { ...base, lastRunAt: ago(base.staleAfterMs + 60_000), outcome: "ok" as const, level: "info" as const };
    expect(effectiveCronStatus(row, now)).toMatchObject({ status: "warn", label: expect.stringContaining("Stale") });
  });
  test("fresh ok → positive 'OK'", () => {
    const row = { ...base, lastRunAt: ago(60_000), outcome: "ok" as const, level: "info" as const };
    expect(effectiveCronStatus(row, now)).toMatchObject({ status: "positive", label: expect.stringContaining("OK") });
  });
  test("fresh partial → review 'Issues'; fresh infra/threw → warn 'Failed'", () => {
    const partial = { ...base, lastRunAt: ago(60_000), outcome: "partial" as const, level: "warn" as const };
    expect(effectiveCronStatus(partial, now).status).toBe("review");
    const infra = { ...base, lastRunAt: ago(60_000), outcome: "infra" as const, level: "error" as const };
    expect(effectiveCronStatus(infra, now)).toMatchObject({ status: "warn", label: expect.stringContaining("Failed") });
  });
  test("malformed (row present, outcome null) → fall back to level, label 'Ran'", () => {
    const row = { ...base, lastRunAt: ago(60_000), outcome: null, level: "error" as const };
    expect(effectiveCronStatus(row, now)).toMatchObject({ status: "warn", label: expect.stringContaining("Ran") });
  });
});
```

```tsx
// tests/components/observability/eventLevelBadge.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventLevelBadge } from "@/components/admin/observability/EventLevelBadge";

describe("EventLevelBadge", () => {
  test.each([["info", "Info"], ["warn", "Warn"], ["error", "Error"]] as const)(
    "%s renders a text label (never color-only)", (level, label) => {
      render(<EventLevelBadge level={level} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/components/observability/cronHealthStatus.test.ts tests/components/observability/eventLevelBadge.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement** (literal class strings for Tailwind v4 content scan; dot+label always)

```ts
// components/admin/observability/cronHealthStatus.ts
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";
import { formatRelative } from "@/lib/admin/showDisplay";

export type CronStatusVisual = { status: "live" | "positive" | "review" | "warn" | "idle"; label: string };

export function effectiveCronStatus(row: CronHealthRow, now: Date): CronStatusVisual {
  if (row.lastRunAt == null) return { status: "idle", label: "No run seen" };
  const rel = formatRelative(row.lastRunAt, now);
  const ageMs = now.getTime() - new Date(row.lastRunAt).getTime();
  if (ageMs > row.staleAfterMs) return { status: "warn", label: `Stale · last run ${rel}` };
  switch (row.outcome) {
    case "ok": return { status: "positive", label: `OK · ${rel}` };
    case "partial": return { status: "review", label: `Issues · ${rel}` };
    case "infra":
    case "threw": return { status: "warn", label: `Failed · ${rel}` };
    default: { // malformed: row present but no parseable outcome → fall back to level
      const status = row.level === "error" ? "warn" : row.level === "warn" ? "review" : "idle";
      return { status, label: `Ran · ${rel}` };
    }
  }
}
```

```tsx
// components/admin/observability/EventLevelBadge.tsx
import type { AppEventLevel } from "@/lib/admin/observabilityTypes";

const BADGE: Record<AppEventLevel, { label: string; className: string }> = {
  info: { label: "Info", className: "bg-surface-sunken text-text-subtle" },
  warn: { label: "Warn", className: "bg-warning-bg text-warning-text" },
  error: { label: "Error", className: "bg-warning-bg text-warning-text font-semibold" },
};

export function EventLevelBadge({ level }: { level: AppEventLevel }) {
  const b = BADGE[level] ?? BADGE.info; // defensive fallback (never crashes)
  return (
    <span
      data-testid={`event-level-${level}`}
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs ${b.className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {b.label}
    </span>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/components/observability/cronHealthStatus.test.ts tests/components/observability/eventLevelBadge.test.tsx`
Expected: PASS. Confirm token class names (`bg-warning-bg`, `text-warning-text`, `text-text-subtle`, `bg-surface-sunken`) exist in `app/globals.css` `@theme`; if a token name differs, use the real one (read DESIGN.md / globals.css).

- [ ] **Step 5: Commit**

```bash
git add components/admin/observability/EventLevelBadge.tsx components/admin/observability/cronHealthStatus.ts tests/components/observability
git commit --no-verify -m "feat(observability): EventLevelBadge + effectiveCronStatus"
```

---

## Task 12: `CronHealthHeader` + `CronRunSummaryCard`

**Files:**
- Create: `components/admin/observability/CronHealthHeader.tsx`
- Create: `components/admin/observability/CronRunSummaryCard.tsx`
- Test: `tests/components/observability/cronHealthHeader.test.tsx`
- Test: `tests/components/observability/cronRunSummaryCard.test.tsx`

**Interfaces:**
- Consumes: `CronHealthRow`, `AppEventRow` (Task 7); `effectiveCronStatus` (Task 11); `StatusIndicator`, `KeyValue`, `CRON_JOBS`, `CRON_RUN_SUMMARY`, `formatRelative`.
- Produces: `CronHealthHeader({ jobs, now })`; `CronRunSummaryCard({ event })`.

- [ ] **Step 1: Write the failing tests** (header: equal-height grid testids + status labels; card: malformed-context guards — non-object counts, non-numeric duration, unknown source)

```tsx
// tests/components/observability/cronRunSummaryCard.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { CronRunSummaryCard } from "@/components/admin/observability/CronRunSummaryCard";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

const ev = (context: Record<string, unknown>, source = "cron.sync"): AppEventRow => ({
  id: "1", occurredAt: "2026-06-29T00:00:00.000Z", level: "info", source, message: "cron sync run",
  code: "CRON_RUN_SUMMARY", requestId: null, showId: null, driveFileId: null, actorHash: null, context, showTitle: null,
});

describe("CronRunSummaryCard guards malformed context", () => {
  test("renders counts grid for a well-formed row", () => {
    render(<CronRunSummaryCard event={ev({ jobName: "sync", outcome: "ok", durationMs: 1200, counts: { processed: 3, applied: 2 } })} />);
    expect(screen.getByText(/processed/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
  test("non-object counts → no counts grid, no crash", () => {
    const { container } = render(<CronRunSummaryCard event={ev({ jobName: "sync", outcome: "ok", counts: "oops" })} />);
    expect(container).toBeTruthy();
    expect(screen.queryByTestId("cron-summary-counts")).toBeNull();
  });
  test("non-numeric durationMs → duration omitted", () => {
    render(<CronRunSummaryCard event={ev({ jobName: "sync", outcome: "ok", durationMs: "later" })} />);
    expect(screen.queryByTestId("cron-summary-duration")).toBeNull();
  });
  test("unknown source (not cron.*) → shows source verbatim", () => {
    render(<CronRunSummaryCard event={ev({ outcome: "ok" }, "weird.source")} />);
    expect(screen.getByText(/weird\.source/)).toBeInTheDocument();
  });
});
```

```tsx
// tests/components/observability/cronHealthHeader.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { CronHealthHeader } from "@/components/admin/observability/CronHealthHeader";
import { CRON_JOBS } from "@/lib/cron/runSummary";
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";

const now = new Date("2026-06-29T12:00:00.000Z");
const rows: CronHealthRow[] = CRON_JOBS.map((j) => ({ ...j, lastRunAt: null, outcome: null, level: null, counts: null }));

describe("CronHealthHeader", () => {
  test("renders one card per job with grid auto-rows-fr and 'No run seen' when no data", () => {
    render(<CronHealthHeader jobs={rows} now={now} />);
    expect(screen.getAllByTestId("cron-health-card")).toHaveLength(CRON_JOBS.length);
    expect(screen.getByTestId("cron-health-grid").className).toContain("auto-rows-fr");
    expect(screen.getAllByText("No run seen").length).toBeGreaterThan(0);
  });
  test("stale job shows 'Stale' label", () => {
    const stale = rows.map((r) => r.jobName === "sync"
      ? { ...r, lastRunAt: new Date(now.getTime() - r.staleAfterMs - 60_000).toISOString(), outcome: "ok" as const, level: "info" as const }
      : r);
    render(<CronHealthHeader jobs={stale} now={now} />);
    expect(screen.getByText(/Stale/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/components/observability/cronHealthHeader.test.tsx tests/components/observability/cronRunSummaryCard.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```tsx
// components/admin/observability/CronHealthHeader.tsx
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";
import { effectiveCronStatus } from "./cronHealthStatus";

export function CronHealthHeader({ jobs, now }: { jobs: CronHealthRow[]; now: Date }) {
  return (
    <section aria-labelledby="cron-health-heading" className="mb-section-gap">
      <h2 id="cron-health-heading" className="mb-3 text-sm font-semibold text-text-subtle">Cron health</h2>
      <div data-testid="cron-health-grid" className="grid auto-rows-fr grid-cols-2 gap-tile-gap sm:grid-cols-3 lg:grid-cols-3">
        {jobs.map((job) => {
          const v = effectiveCronStatus(job, now);
          return (
            <div key={job.jobName} data-testid="cron-health-card" className="flex h-full flex-col gap-1 rounded-md border border-border bg-surface p-tile-pad">
              <div className="text-sm font-medium text-text">{job.label}</div>
              <StatusIndicator status={v.status} label={v.label} />
              {job.counts && (
                <div className="mt-1 text-xs text-text-subtle">
                  {Object.entries(job.counts).map(([k, n]) => `${k}: ${n}`).join(" · ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

```tsx
// components/admin/observability/CronRunSummaryCard.tsx
import { KeyValue } from "@/components/atoms/KeyValue";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

function jobLabel(ev: AppEventRow): string {
  const jn = ev.context?.jobName;
  if (typeof jn === "string" && jn.length) return jn;
  return ev.source; // verbatim, even if not a known cron.* source
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function CronRunSummaryCard({ event }: { event: AppEventRow }) {
  const ctx = event.context ?? {};
  const outcome = typeof ctx.outcome === "string" ? ctx.outcome : "unknown";
  const durationMs = typeof ctx.durationMs === "number" && Number.isFinite(ctx.durationMs) ? ctx.durationMs : null;
  const counts = isPlainObject(ctx.counts)
    ? Object.entries(ctx.counts).filter(([, n]) => typeof n === "number")
    : [];
  return (
    <div className="rounded-md border border-border bg-surface-sunken p-tile-pad">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-text">{jobLabel(event)}</span>
        <span className="rounded-pill bg-surface px-2 py-0.5 text-xs text-text-subtle">{outcome}</span>
        {durationMs != null && <span data-testid="cron-summary-duration" className="text-xs text-text-faint font-tabular">{durationMs} ms</span>}
      </div>
      {counts.length > 0 && (
        <dl data-testid="cron-summary-counts" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {counts.map(([k, n]) => <KeyValue key={k} label={k} value={String(n)} tabular />)}
        </dl>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run tests/components/observability/cronHealthHeader.test.tsx tests/components/observability/cronRunSummaryCard.test.tsx`
Expected: PASS. Confirm `StatusIndicator`'s exact prop names (`status`, `label`) and `KeyValue`'s (`label`, `value`, `tabular`) against the real components; adjust if needed.

- [ ] **Step 5: Commit**

```bash
git add components/admin/observability/CronHealthHeader.tsx components/admin/observability/CronRunSummaryCard.tsx tests/components/observability/cronHealthHeader.test.tsx tests/components/observability/cronRunSummaryCard.test.tsx
git commit --no-verify -m "feat(observability): CronHealthHeader (auto-rows-fr) + guarded CronRunSummaryCard"
```

---

## Task 13: `ContextDetail` + `EventRow`

**Files:**
- Create: `components/admin/observability/ContextDetail.tsx`
- Create: `components/admin/observability/EventRow.tsx`
- Test: `tests/components/observability/eventRow.test.tsx`

**Interfaces:**
- Consumes: `AppEventRow` (Task 7); `EventLevelBadge` (Task 11); `CronRunSummaryCard` (Task 12); `KeyValue`, `formatRelative`, `CRON_RUN_SUMMARY`.
- Produces: `EventRow({ event, now })` (client); `ContextDetail({ event })`.

- [ ] **Step 1: Write the failing test** (collapsed truncates message; expand reveals FULL message + context; request chip href = `?requestId=<id>&since=all`; summary code → CronRunSummaryCard)

```tsx
// tests/components/observability/eventRow.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventRow } from "@/components/admin/observability/EventRow";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

const now = new Date("2026-06-29T12:00:00.000Z");
const longMsg = "BEGIN " + "x".repeat(400) + " END";
const base: AppEventRow = {
  id: "e1", occurredAt: "2026-06-29T11:59:00.000Z", level: "error", source: "auth.validateGoogleSession",
  message: longMsg, code: "ADMIN_EMAILS_INFRA", requestId: "req-9", showId: null, driveFileId: "df-1",
  actorHash: "ah-1", context: { foo: "bar" }, showTitle: null,
};

describe("EventRow", () => {
  test("collapsed: ContextDetail not mounted; expand mounts it with FULL message + drive id", () => {
    // Non-tautological: the collapsed toggle button holds the (CSS-truncated) full text too,
    // so assert the ContextDetail element MOUNTS on expand, not mere text presence.
    render(<EventRow event={base} now={now} />);
    expect(screen.queryByTestId("event-full-message")).toBeNull();
    fireEvent.click(screen.getByTestId("event-row-toggle-e1"));
    expect(screen.getByTestId("event-full-message")).toHaveTextContent(longMsg);
    expect(screen.getByText(/df-1/)).toBeInTheDocument();
  });
  test("show/request links are NOT nested inside the toggle button (valid interactive nesting)", () => {
    render(<EventRow event={{ ...base, showId: "00000000-0000-0000-0000-0000000000ab", showTitle: "RPAS" }} now={now} />);
    const toggle = screen.getByTestId("event-row-toggle-e1");
    expect(toggle.querySelector("a")).toBeNull(); // no <a> inside the <button>
  });
  test("request chip links to ?requestId=<id>&since=all", () => {
    render(<EventRow event={base} now={now} />);
    const chip = screen.getByTestId("event-row-request-e1");
    expect(chip.getAttribute("href")).toBe("/admin/observability?requestId=req-9&since=all");
  });
  test("CRON_RUN_SUMMARY row renders the summary card instead of the generic body", () => {
    const ev = { ...base, code: "CRON_RUN_SUMMARY", source: "cron.sync", context: { jobName: "sync", outcome: "ok", counts: { processed: 1 } } };
    render(<EventRow event={ev} now={now} />);
    expect(screen.getByText(/processed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/observability/eventRow.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```tsx
// components/admin/observability/ContextDetail.tsx
import { KeyValue } from "@/components/atoms/KeyValue";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

export function ContextDetail({ event }: { event: AppEventRow }) {
  const ctx = event.context ?? {};
  const hasContext = Object.keys(ctx).length > 0;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2 text-sm">
      <div data-testid="event-full-message" className="whitespace-pre-wrap break-words text-text">{event.message}</div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <KeyValue label="Occurred at" value={event.occurredAt} tabular />
        <KeyValue label="Request" value={event.requestId} />
        <KeyValue label="Drive file" value={event.driveFileId} />
        <KeyValue label="Actor" value={event.actorHash} />
      </dl>
      <pre className="overflow-x-auto rounded bg-surface-sunken p-2 text-xs text-text-subtle">
        {hasContext ? JSON.stringify(ctx, null, 2) : "no additional context"}
      </pre>
    </div>
  );
}
```

```tsx
// components/admin/observability/EventRow.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { formatRelative } from "@/lib/admin/showDisplay";
import { CRON_RUN_SUMMARY } from "@/lib/cron/runSummary";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";
import { EventLevelBadge } from "./EventLevelBadge";
import { ContextDetail } from "./ContextDetail";
import { CronRunSummaryCard } from "./CronRunSummaryCard";

export function EventRow({ event, now }: { event: AppEventRow; now: Date }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const isSummary = event.code === CRON_RUN_SUMMARY;
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-surface p-tile-pad">
      <div className="flex items-start gap-3">
        <EventLevelBadge level={event.level} />
        <div className="min-w-0 flex-1">
          {isSummary ? (
            <CronRunSummaryCard event={event} />
          ) : (
            <>
              {/* The toggle button contains ONLY the message — no nested interactive elements. */}
              <button
                type="button"
                data-testid={`event-row-toggle-${event.id}`}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="block w-full truncate text-left text-sm text-text"
              >
                {event.message}
              </button>
              {/* Metadata row — SIBLING of the button (links must not nest inside a button). */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                <span className="font-medium">{event.source}</span>
                {event.code && <span className="rounded-pill bg-surface-sunken px-1.5">{event.code}</span>}
                {event.showId && (
                  <Link href={`/admin/show/${event.showId}`} className="underline">{event.showTitle ?? event.showId}</Link>
                )}
              </div>
            </>
          )}
        </div>
        <span className="shrink-0 text-xs text-text-faint">{formatRelative(event.occurredAt, now)}</span>
        {event.requestId && (
          <Link
            data-testid={`event-row-request-${event.id}`}
            href={`/admin/observability?requestId=${encodeURIComponent(event.requestId)}&since=all`}
            className="shrink-0 rounded-pill bg-surface-sunken px-2 py-0.5 text-xs text-accent-on-bg"
          >
            {event.requestId.slice(0, 8)}
          </Link>
        )}
      </div>
      {/* The ONE animated transition in this surface (spec §7): height disclosure,
          220ms ease-out-quart, instant under prefers-reduced-motion (useReducedMotion → 0). */}
      <AnimatePresence initial={false}>
        {open && !isSummary && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.25, 1, 0.5, 1] }}
            style={{ overflow: "hidden" }}
          >
            <ContextDetail event={event} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/observability/eventRow.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/observability/ContextDetail.tsx components/admin/observability/EventRow.tsx tests/components/observability/eventRow.test.tsx
git commit --no-verify -m "feat(observability): EventRow + ContextDetail (full message on expand, request correlation chip)"
```

---

## Task 14: `EventFilters` (URL-driven, cursor-reset on every change)

**Files:**
- Create: `components/admin/observability/EventFilters.tsx`
- Test: `tests/components/observability/eventFilters.test.tsx`

**Interfaces:**
- Consumes: `AppEventFilters` (Task 7), `useRouter`/`useSearchParams` (next/navigation).
- Produces: `EventFilters({ filters })` (client). Helper `buildFilterHref(current: URLSearchParams, patch: Record<string,string|null>): string` — exported + unit-tested — always strips `cursorAt`/`cursorId`.

- [ ] **Step 1: Write the failing test** (every mutation drops cursor; level toggle; since preset; clear; request chip)

```tsx
// tests/components/observability/eventFilters.test.tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("level=error&cursorAt=2026-06-29T00:00:00.000Z&cursorId=00000000-0000-0000-0000-000000000001"),
}));

import { EventFilters, buildFilterHref } from "@/components/admin/observability/EventFilters";

describe("buildFilterHref drops cursor on every mutation", () => {
  test("changing a filter removes cursorAt/cursorId", () => {
    const cur = new URLSearchParams("level=error&cursorAt=2026-06-29T00:00:00.000Z&cursorId=00000000-0000-0000-0000-000000000001");
    const href = buildFilterHref(cur, { source: "cron.sync" });
    const out = new URLSearchParams(href.split("?")[1]);
    expect(out.get("cursorAt")).toBeNull();
    expect(out.get("cursorId")).toBeNull();
    expect(out.get("source")).toBe("cron.sync");
    expect(out.get("level")).toBe("error");
  });
  test("patch value null removes the key", () => {
    const cur = new URLSearchParams("source=x&since=7d");
    const out = new URLSearchParams(buildFilterHref(cur, { source: null }).split("?")[1]);
    expect(out.get("source")).toBeNull();
    expect(out.get("since")).toBe("7d");
  });
});

describe("EventFilters surface (spec §6.2 / AC2)", () => {
  beforeEach(() => push.mockClear());
  test("renders level + since + source/code/show/request + message inputs", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    for (const id of ["filter-source", "filter-code", "filter-showId", "filter-requestId", "filter-q"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });
  test("changing the source filter navigates and DROPS the cursor", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    const input = screen.getByTestId("filter-source") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "cron.sync" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledTimes(1);
    const href = push.mock.calls[0][0] as string;
    expect(href).toContain("source=cron.sync");
    expect(href).not.toContain("cursorAt");
    expect(href).not.toContain("cursorId");
  });
  test("level toggle drops the cursor (every mutation resets pagination)", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    fireEvent.click(screen.getByRole("button", { name: "error" }));
    const href = push.mock.calls[0][0] as string;
    expect(href).toContain("level=error");
    expect(href).not.toContain("cursorAt");
    expect(href).not.toContain("cursorId");
  });
  test("since preset drops the cursor", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7d" } });
    const href = push.mock.calls[0][0] as string;
    expect(href).toContain("since=7d");
    expect(href).not.toContain("cursorAt");
  });
  test("typed-but-uncommitted text survives an auto-refresh re-render with SAME filters (§7 compound)", () => {
    const { rerender } = render(<EventFilters filters={{ sinceHours: 24 }} />);
    const input = screen.getByTestId("filter-source") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "cron.partial-typing" } });
    rerender(<EventFilters filters={{ sinceHours: 24 }} />); // simulates router.refresh() — same committed filters
    expect((screen.getByTestId("filter-source") as HTMLInputElement).value).toBe("cron.partial-typing");
  });
  test("an external committed-filter change re-syncs the displayed value (no stale default)", () => {
    const { rerender } = render(<EventFilters filters={{ sinceHours: 24 }} />);
    rerender(<EventFilters filters={{ source: "cron.sync", sinceHours: 24 }} />);
    expect((screen.getByTestId("filter-source") as HTMLInputElement).value).toBe("cron.sync");
  });
  test("requestId mode shows the 'Showing one request' chip", () => {
    render(<EventFilters filters={{ requestId: "req-9", sinceHours: null }} />);
    expect(screen.getByText(/Showing one request/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/observability/eventFilters.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (URL-driven; `buildFilterHref` always strips cursor; the component renders level toggles, `since` preset select, source/code/show/request inputs, q search, Clear, and the "Showing one request" chip when `requestId` present)

```tsx
// components/admin/observability/EventFilters.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppEventFilters } from "@/lib/admin/observabilityTypes";

const BASE = "/admin/observability";

// Controlled text filter: local state mirrors the committed filter value but is NOT reset
// by an auto-refresh re-render (the `committed` dep is unchanged), so focus + in-progress
// keystrokes survive (spec §7 compound). An external change (Clear / another filter) changes
// `committed` → the effect re-syncs the displayed value (no stale defaults).
function FilterTextInput({ name, committed, placeholder, onCommit }: {
  name: string; committed: string; placeholder: string; onCommit: (v: string | null) => void;
}) {
  const [value, setValue] = useState(committed);
  useEffect(() => { setValue(committed); }, [committed]);
  return (
    <input
      type="text" data-testid={`filter-${name}`} placeholder={placeholder} value={value}
      className="rounded border border-border bg-surface px-2 py-1"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") onCommit(value || null); }}
    />
  );
}

export function buildFilterHref(current: URLSearchParams, patch: Record<string, string | null>): string {
  const next = new URLSearchParams(current);
  next.delete("cursorAt"); // every filter change returns to page 1
  next.delete("cursorId");
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function EventFilters({ filters }: { filters: AppEventFilters }) {
  const router = useRouter();
  const sp = useSearchParams();
  const go = (patch: Record<string, string | null>) => router.push(buildFilterHref(new URLSearchParams(sp.toString()), patch));

  if (filters.requestId) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-pill bg-surface-sunken px-2 py-0.5">Showing one request</span>
        <button type="button" className="underline" onClick={() => router.push(BASE)}>Clear</button>
      </div>
    );
  }
  const levels = new Set(filters.levels ?? []);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {(["info", "warn", "error"] as const).map((lvl) => (
        <button
          key={lvl} type="button"
          aria-pressed={levels.has(lvl)}
          className={`rounded-pill px-2 py-0.5 ${levels.has(lvl) ? "bg-accent text-accent-text" : "bg-surface-sunken text-text-subtle"}`}
          onClick={() => {
            const next = new Set(levels); next.has(lvl) ? next.delete(lvl) : next.add(lvl);
            go({ level: next.size ? [...next].join(",") : null });
          }}
        >{lvl}</button>
      ))}
      <select
        className="rounded border border-border bg-surface px-2 py-1"
        value={filters.sinceHours === 1 ? "1h" : filters.sinceHours === 168 ? "7d" : filters.sinceHours === null ? "all" : "24h"}
        onChange={(e) => go({ since: e.target.value })}
      >
        <option value="1h">Last hour</option>
        <option value="24h">Last 24h</option>
        <option value="7d">Last 7 days</option>
        <option value="all">All</option>
      </select>
      {(["source", "code", "showId", "requestId"] as const).map((key) => (
        <FilterTextInput
          key={key} name={key}
          committed={(filters[key] as string | undefined) ?? ""}
          placeholder={key === "showId" ? "show id…" : key === "requestId" ? "request id…" : `${key}…`}
          onCommit={(v) => go({ [key]: v })}
        />
      ))}
      <FilterTextInput name="q" committed={filters.q ?? ""} placeholder="Search message…" onCommit={(v) => go({ q: v })} />
      <button type="button" className="underline" onClick={() => router.push(BASE)}>Clear filters</button>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/observability/eventFilters.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/observability/EventFilters.tsx tests/components/observability/eventFilters.test.tsx
git commit --no-verify -m "feat(observability): EventFilters URL-driven; every mutation drops the keyset cursor"
```

---

## Task 15: `AutoRefreshControl` (interval, scroll-gate, visibility-gated, localStorage)

**Files:**
- Create: `components/admin/observability/AutoRefreshControl.tsx`
- Test: `tests/components/observability/autoRefreshControl.test.tsx`

**Interfaces:**
- Consumes: `useRouter` (next/navigation). Constants `AUTO_REFRESH_MS = 20_000`, `AUTO_REFRESH_TOP_PX = 200`, storage key `fxav.observability.autorefresh`.
- Produces: `AutoRefreshControl()` (client) — renders the toggle + "updated Ns ago" + manual Refresh; arms/disarms the interval.

- [ ] **Step 1: Write the failing test** (fake timers; default ON ticks router.refresh only when scrollY<=200; OFF never ticks; visibility resume only when ON; cleanup on unmount)

```tsx
// tests/components/observability/autoRefreshControl.test.tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AutoRefreshControl } from "@/components/admin/observability/AutoRefreshControl";

beforeEach(() => {
  vi.useFakeTimers(); refresh.mockClear(); localStorage.clear();
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); // reset per test
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("AutoRefreshControl", () => {
  test("default ON: a tick at scrollY<=200 calls router.refresh", () => {
    render(<AutoRefreshControl />);
    vi.advanceTimersByTime(20_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("scrolled past 200px: tick is skipped (no refresh)", () => {
    (window as unknown as { scrollY: number }).scrollY = 500;
    render(<AutoRefreshControl />);
    vi.advanceTimersByTime(20_000);
    expect(refresh).not.toHaveBeenCalled();
  });
  test("toggling OFF stops ticks; manual Refresh still works", () => {
    render(<AutoRefreshControl />);
    fireEvent.click(screen.getByTestId("autorefresh-toggle")); // → OFF
    vi.advanceTimersByTime(40_000);
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("autorefresh-manual"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("OFF + becoming visible does NOT refresh", () => {
    render(<AutoRefreshControl />);
    fireEvent.click(screen.getByTestId("autorefresh-toggle")); // OFF
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
  });
  test("toggling OFF then ON fires an immediate refresh on the ON transition (§6.3)", () => {
    render(<AutoRefreshControl />);
    fireEvent.click(screen.getByTestId("autorefresh-toggle")); // ON→OFF (no refresh)
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("autorefresh-toggle")); // OFF→ON → immediate refresh
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("manual refresh shows the 'Updated …s ago' indicator", () => {
    render(<AutoRefreshControl />);
    expect(screen.queryByTestId("autorefresh-updated")).toBeNull();
    fireEvent.click(screen.getByTestId("autorefresh-manual"));
    expect(screen.getByTestId("autorefresh-updated")).toBeInTheDocument();
  });
  test("persisted OFF: initial localStorage=off → no tick, toggle shows off", () => {
    localStorage.setItem("fxav.observability.autorefresh", "off");
    render(<AutoRefreshControl />);
    vi.advanceTimersByTime(40_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("autorefresh-toggle").getAttribute("aria-pressed")).toBe("false");
  });
  test("hidden tab: tick is SKIPPED even when ON", () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    render(<AutoRefreshControl />);
    vi.advanceTimersByTime(20_000);
    expect(refresh).not.toHaveBeenCalled();
  });
  test("hidden→visible fires one immediate refresh when ON", () => {
    render(<AutoRefreshControl />); // ON
    document.dispatchEvent(new Event("visibilitychange")); // visibilityState is 'visible' (beforeEach)
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("unmount clears the interval + visibility listener (no refresh after unmount)", () => {
    const { unmount } = render(<AutoRefreshControl />);
    unmount();
    vi.advanceTimersByTime(60_000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/observability/autoRefreshControl.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/admin/observability/AutoRefreshControl.tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export const AUTO_REFRESH_MS = 20_000;
export const AUTO_REFRESH_TOP_PX = 200;
const KEY = "fxav.observability.autorefresh";

export function AutoRefreshControl() {
  const router = useRouter();
  const [on, setOn] = useState(true); // SSR + first paint = ON
  const onRef = useRef(on);
  onRef.current = on;
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [, force] = useState(0); // re-render the relative "Updated …s ago" label

  const doRefresh = useCallback(() => {
    setLastRefreshedAt(Date.now());
    router.refresh();
  }, [router]);

  // Reconcile from localStorage after mount (avoid hydration mismatch).
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "off") setOn(false); } catch { /* ignore */ }
  }, []);

  // Interval — scroll-gated, only fires when ON, visible, and near the top.
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      if (onRef.current && document.visibilityState !== "hidden" && window.scrollY <= AUTO_REFRESH_TOP_PX) doRefresh();
    };
    const id = window.setInterval(tick, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [on, doRefresh]);

  // Visibility resume — only when ON.
  useEffect(() => {
    const onVis = () => { if (onRef.current && document.visibilityState === "visible") doRefresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [doRefresh]);

  // Tick the relative label once per second while a timestamp exists.
  useEffect(() => {
    if (lastRefreshedAt == null) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [lastRefreshedAt]);

  const toggle = () => {
    const next = !onRef.current;
    try { localStorage.setItem(KEY, next ? "on" : "off"); } catch { /* ignore */ }
    setOn(next);
    if (next) doRefresh(); // OFF→ON fires an immediate refresh (spec §6.3)
  };

  return (
    <div className="flex items-center gap-2 text-xs text-text-subtle">
      <button type="button" data-testid="autorefresh-toggle" aria-pressed={on} onClick={toggle}
        className={`rounded-pill px-2 py-0.5 ${on ? "bg-accent text-accent-text" : "bg-surface-sunken"}`}>
        Auto-refresh {on ? "on" : "off"}
      </button>
      <button type="button" data-testid="autorefresh-manual" onClick={doRefresh} className="underline">Refresh</button>
      {lastRefreshedAt != null && (
        <span data-testid="autorefresh-updated">
          Updated {Math.max(0, Math.round((Date.now() - lastRefreshedAt) / 1000))}s ago
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/observability/autoRefreshControl.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/observability/AutoRefreshControl.tsx tests/components/observability/autoRefreshControl.test.tsx
git commit --no-verify -m "feat(observability): AutoRefreshControl (scroll-gated, visibility-gated, localStorage)"
```

---

## Task 16: `EventTimeline` + the page `app/admin/observability/page.tsx`

**Files:**
- Create: `components/admin/observability/EventTimeline.tsx`
- Create: `app/admin/observability/page.tsx`
- Test: `tests/components/observability/eventTimeline.test.tsx`
- Test: `tests/app/admin/observabilityPage.test.tsx`

**Interfaces:**
- Consumes: `LoadAppEventsResult`/`LoadCronHealthResult`, `parseAppEventFilters` (Task 7); `loadAppEvents` (Task 8); `loadCronHealth` (Task 9); `EventRow` (13); `CronHealthHeader` (12); `EventFilters` (14); `AutoRefreshControl` (15); `EmptyState`, `AdminPageHeader`, `requireAdminIdentity`, `nowDate`, `PAGE_SIZE`.
- Produces: `EventTimeline({ result, now })`; the page (server component).

- [ ] **Step 1: Write the failing tests** (timeline: empty state, cap disclosure on hasMore, infra panel, load-older href; page renders header + degrades each section independently)

```tsx
// tests/components/observability/eventTimeline.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { EventTimeline } from "@/components/admin/observability/EventTimeline";
import type { AppEventRow, LoadAppEventsResult } from "@/lib/admin/observabilityTypes";

const now = new Date("2026-06-29T12:00:00.000Z");
const row = (id: string): AppEventRow => ({ id, occurredAt: "2026-06-29T11:00:00.000Z", level: "info", source: "s", message: "m", code: null, requestId: null, showId: null, driveFileId: null, actorHash: null, context: {}, showTitle: null });

describe("EventTimeline", () => {
  test("empty → EmptyState", () => {
    render(<EventTimeline result={{ kind: "ok", events: [], hasMore: false, nextCursor: null }} now={now} />);
    expect(screen.getByText(/no/i)).toBeInTheDocument();
  });
  test("hasMore → cap disclosure + Load older link with cursor", () => {
    const result: LoadAppEventsResult = { kind: "ok", events: [row("a")], hasMore: true, nextCursor: { occurredAt: "2026-06-29T11:00:00.000Z", id: "a" } };
    render(<EventTimeline result={result} now={now} />);
    const link = screen.getByTestId("event-timeline-load-older");
    expect(link.getAttribute("href")).toContain("cursorAt=2026-06-29T11%3A00%3A00.000Z");
    expect(link.getAttribute("href")).toContain("cursorId=a");
  });
  test("infra_error → degraded panel", () => {
    render(<EventTimeline result={{ kind: "infra_error", message: "x" }} now={now} />);
    expect(screen.getByTestId("event-timeline-degraded")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/observability/eventTimeline.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the timeline + page**

```tsx
// components/admin/observability/EventTimeline.tsx
import { EmptyState } from "@/components/atoms/EmptyState";
import type { LoadAppEventsResult } from "@/lib/admin/observabilityTypes";
import { EventRow } from "./EventRow";

export function EventTimeline({ result, now, currentQuery = "" }: { result: LoadAppEventsResult; now: Date; currentQuery?: string }) {
  if (result.kind === "infra_error") {
    return <div data-testid="event-timeline-degraded" className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm">Couldn’t load activity right now.</div>;
  }
  if (result.events.length === 0) {
    return <EmptyState label="No events match these filters." />;
  }
  const olderHref = (() => {
    if (!result.hasMore || !result.nextCursor) return null;
    const sp = new URLSearchParams(currentQuery);
    sp.set("cursorAt", result.nextCursor.occurredAt);
    sp.set("cursorId", result.nextCursor.id);
    return `/admin/observability?${sp.toString()}`;
  })();
  return (
    <div className="flex flex-col gap-3" style={{ overflowAnchor: "auto" }}>
      <ul className="flex flex-col gap-2">
        {result.events.map((e) => <EventRow key={e.id} event={e} now={now} />)}
      </ul>
      {result.hasMore && (
        <p className="text-xs text-text-subtle">Showing the {result.events.length} most recent matching events. Refine filters or load older.</p>
      )}
      {olderHref && <a data-testid="event-timeline-load-older" href={olderHref} className="text-sm underline">Load older</a>}
    </div>
  );
}
```

```tsx
// app/admin/observability/page.tsx
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { nowDate } from "@/lib/time/now";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { parseAppEventFilters } from "@/lib/admin/observabilityTypes";
import { loadAppEvents } from "@/lib/admin/loadAppEvents";
import { loadCronHealth } from "@/lib/admin/loadCronHealth";
import { CronHealthHeader } from "@/components/admin/observability/CronHealthHeader";
import { EventFilters } from "@/components/admin/observability/EventFilters";
import { EventTimeline } from "@/components/admin/observability/EventTimeline";
import { AutoRefreshControl } from "@/components/admin/observability/AutoRefreshControl";

export const dynamic = "force-dynamic";

export default async function ObservabilityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminIdentity();
  const sp = await searchParams;
  const filters = parseAppEventFilters(sp);
  const now = await nowDate();
  const [health, events] = await Promise.all([loadCronHealth(), loadAppEvents(filters)]);
  const currentQuery = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (v == null ? [] : [[k, Array.isArray(v) ? v[0] : v]] as [string, string][])),
  ).toString();

  return (
    <div className="flex flex-col gap-section-gap">
      <AdminPageHeader title="Activity" sub="App event log & cron health" rightSlot={<AutoRefreshControl />} />
      {health.kind === "ok"
        ? <CronHealthHeader jobs={health.jobs} now={now} />
        : <div data-testid="cron-health-degraded" className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm">Couldn’t load cron health right now.</div>}
      <EventFilters filters={filters} />
      <EventTimeline result={events} now={now} currentQuery={currentQuery} />
    </div>
  );
}
```

- [ ] **Step 4: Write + run the page test** (mock both loaders; assert header + timeline render; one loader infra → only its section degrades)

```tsx
// tests/app/admin/observabilityPage.test.tsx
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdminIdentity: async () => ({ email: "a@b.c" }) }));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-29T12:00:00.000Z") }));

describe("ObservabilityPage", () => {
  beforeEach(() => vi.resetModules());

  test("renders header + timeline; cron-health infra degrades only that section", async () => {
    vi.doMock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth: async () => ({ kind: "infra_error", message: "x" }) }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({ loadAppEvents: async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }) }));
    const { default: Page } = await import("@/app/admin/observability/page");
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByTestId("cron-health-degraded")).toBeInTheDocument();
    expect(screen.getByText(/No events/i)).toBeInTheDocument(); // timeline still rendered
  });

  test("passes parsed request-correlation filters into loadAppEvents (AC3: requestId + sinceHours null)", async () => {
    const loadAppEvents = vi.fn(async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }));
    vi.doMock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth: async () => ({ kind: "ok", jobs: [] }) }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({ loadAppEvents }));
    const { default: Page } = await import("@/app/admin/observability/page");
    render(await Page({ searchParams: Promise.resolve({ requestId: "req-9", since: "all" }) }));
    expect(loadAppEvents).toHaveBeenCalledWith(expect.objectContaining({ requestId: "req-9", sinceHours: null }));
  });
});
```

Run: `pnpm vitest run tests/components/observability/eventTimeline.test.tsx tests/app/admin/observabilityPage.test.tsx`
Expected: PASS. Confirm `AdminPageHeader` accepts `rightSlot` (it does — `:5-24`) and the Next 16 `searchParams` is a Promise (await it).

- [ ] **Step 5: Commit**

```bash
git add components/admin/observability/EventTimeline.tsx app/admin/observability/page.tsx tests/components/observability/eventTimeline.test.tsx tests/app/admin/observabilityPage.test.tsx
git commit --no-verify -m "feat(observability): EventTimeline + /admin/observability page (independent section degrade)"
```

---

## Task 17: Nav (`desktopOnly`) + Settings link + trust-domains registry

**Files:**
- Modify: `components/admin/nav/navConfig.ts`
- Modify: `components/admin/nav/AdminNav.tsx`
- Modify: `app/admin/settings/page.tsx`
- Modify: `lib/audit/trustDomains.ts`
- Test: `tests/components/admin/navConfig.test.ts` (extend or create)
- Test: `tests/admin/observabilityRouteAudit.test.ts`

**Interfaces:**
- Consumes/extends: `NavItem`, `NAV`, `isNavItemActive`, `OVERFLOW_THRESHOLD`, `shouldRenderOverflow`; `PROTECTED_ROUTES`.

- [ ] **Step 1: Write the failing tests** (Activity is on desktop, NOT a mobile tab; mobile count stays 5 so no overflow; route registered)

```ts
// tests/components/admin/navConfig.test.ts (create if absent; else extend)
import { describe, expect, test } from "vitest";
import { NAV, isNavItemActive, shouldRenderOverflow } from "@/components/admin/nav/navConfig";

describe("navConfig with Activity (desktopOnly)", () => {
  test("observability is present, desktopOnly, not mobileOnly", () => {
    const obs = NAV.find((n) => n.id === "observability");
    expect(obs).toBeTruthy();
    expect(obs!.href).toBe("/admin/observability");
    expect((obs as { desktopOnly?: true }).desktopOnly).toBe(true);
    expect((obs as { mobileOnly?: true }).mobileOnly).toBeUndefined();
  });
  test("mobile-visible items (non-desktopOnly) stay <= OVERFLOW_THRESHOLD so no overflow More", () => {
    const mobile = NAV.filter((n) => !(n as { desktopOnly?: true }).desktopOnly);
    expect(shouldRenderOverflow(mobile.length)).toBe(false);
  });
  test("isNavItemActive: observability owns /admin/observability; dashboard no longer matches it", () => {
    expect(isNavItemActive("observability", "/admin/observability")).toBe(true);
    expect(isNavItemActive("dashboard", "/admin/observability")).toBe(false);
  });
});
```

```ts
// tests/admin/observabilityRouteAudit.test.ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROTECTED_ROUTES } from "@/lib/audit/trustDomains";

describe("observability route is auth-chain registered", () => {
  test("PROTECTED_ROUTES has the page with requireAdmin chain", () => {
    const row = PROTECTED_ROUTES.find((r) => r.path === "app/admin/observability/page.tsx");
    expect(row).toBeTruthy();
    expect(row!.chain).toContain("requireAdmin");
  });
  test("settings page links to /admin/observability (the ONLY mobile route into desktopOnly Activity)", () => {
    // Activity is desktopOnly (absent from mobile bottom tabs), so the Settings link is the
    // mobile reachability path — guard against it being omitted or mislinked.
    const src = readFileSync(join(__dirname, "..", "..", "app/admin/settings/page.tsx"), "utf8");
    expect(src).toContain("/admin/observability");
    expect(src).toMatch(/Activity/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/components/admin/navConfig.test.ts tests/admin/observabilityRouteAudit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Edit `navConfig.ts`** — add `desktopOnly?: true` to `NavItem`; extend the `id` union with `"observability"`; import `Activity` from `lucide-react`; add the entry; add the `isNavItemActive` branch.

```ts
import { Activity, EyeOff, FileX, Inbox, LayoutGrid, Settings } from "lucide-react";
// ...
export type NavItem = {
  id: "dashboard" | "attention" | "unpublished" | "ignored-sheets" | "settings" | "observability";
  label: string; short: string; href: string;
  Icon: ComponentType<{ className?: string }>;
  mobileOnly?: true;
  /** Excluded from the mobile bottom tab bar (desktop-nav destination). */
  desktopOnly?: true;
};
// append to NAV:
  { id: "observability", label: "Activity", short: "Activity", href: "/admin/observability", Icon: Activity, desktopOnly: true },
// in isNavItemActive, add:
  const inObservability = pathname === "/admin/observability" || pathname.startsWith("/admin/observability/");
  if (id === "observability") return inObservability;
// and add `&& !inObservability` to the dashboard fall-through return.
```

- [ ] **Step 4: Edit `AdminNav.tsx`** — mobile `.map` filters out `desktopOnly`; compute `overflow` from the mobile-visible count.

```tsx
// near the top where `overflow` is derived (:43):
const mobileItems = NAV.filter((item) => !item.desktopOnly);
const overflow = shouldRenderOverflow(mobileItems.length);
// in the mobile bottom bar map (:112), iterate mobileItems instead of NAV:
{mobileItems.map((item) => { /* ...unchanged... */ })}
```

- [ ] **Step 5: Edit `app/admin/settings/page.tsx`** — add a mobile-reachable link to `/admin/observability`. Read the page first; add a row/link consistent with the existing settings layout, e.g.:

```tsx
<Link href="/admin/observability" className="text-sm underline text-accent-on-bg">Activity — app event log &amp; cron health</Link>
```

- [ ] **Step 6: Edit `lib/audit/trustDomains.ts`** — add to `PROTECTED_ROUTES`:

```ts
  { path: "app/admin/observability/page.tsx", chain: ["requireAdmin"] },
```

- [ ] **Step 7: Run nav + audit + auth-chain tests**

Run: `pnpm vitest run tests/components/admin/navConfig.test.ts tests/admin/observabilityRouteAudit.test.ts lib/audit`
Run also the existing auth-chain audit if separate: `pnpm vitest run tests/audit` (find the suite that consumes `authChain`/`trustDomains`).
Expected: PASS. If an existing AdminNav snapshot/test asserts `NAV.map` over all items, update it to the `mobileItems` expectation (Activity absent from mobile tabs by design).

- [ ] **Step 8: Commit**

```bash
git add components/admin/nav/navConfig.ts components/admin/nav/AdminNav.tsx app/admin/settings/page.tsx lib/audit/trustDomains.ts tests/components/admin/navConfig.test.ts tests/admin/observabilityRouteAudit.test.ts
git commit --no-verify -m "feat(observability): Activity desktop-nav (desktopOnly) + Settings mobile link + trust-domains route"
```

---

## Task 18: Layout-dimensions assertion (real browser)

**Files:**
- Create: `tests/e2e/observability-layout.spec.ts` (Playwright) — or a chrome-devtools MCP `evaluate_script` harness per the project's standalone real-browser layout pattern.
- Test fixtures: a static render of `CronHealthHeader` (9 cards) + a few `EventRow`s, or the seeded `/admin/observability` route.

**Interfaces:**
- Consumes: rendered DOM with `data-testid` = `cron-health-grid`, `cron-health-card`, `event-level-*`, and an `EventRow`.

**Dimensional Invariants to assert (spec §8 — verbatim):**
1. Each `cron-health-card` in a wrap row has equal `height` (`auto-rows-fr`), within 0.5px.
2. `EventRow` no-overflow geometry: content column right edge ≤ row inner (padding-box) right edge; `badgeWidth + rowGap + contentWidth ≤ rowInnerWidth` (the `flex gap-3` MUST be in the sum).
3. The content column does not overflow horizontally: `scrollWidth ≤ clientWidth`.

- [ ] **Step 1: Write the failing real-browser assertion**

```ts
// tests/e2e/observability-layout.spec.ts
import { test, expect } from "@playwright/test";

// Renders the seeded admin route (auth via the test-auth bypass the repo uses for e2e;
// follow tests/e2e/admin-layout.spec.ts for the sign-in/seed harness).
test("cron health cards are equal height; event rows do not overflow", async ({ page }) => {
  await page.goto("/admin/observability"); // adjust to the e2e auth/seed flow used by admin-layout.spec.ts
  const cards = page.locator("[data-testid=cron-health-card]");
  const boxes = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  // group by row (same top within 1px), assert equal height per row
  const rows = new Map<number, number[]>();
  for (const b of boxes) {
    const key = [...rows.keys()].find((k) => Math.abs(k - b.top) < 1) ?? b.top;
    rows.set(key, [...(rows.get(key) ?? []), b.height]);
  }
  for (const heights of rows.values()) {
    const max = Math.max(...heights), min = Math.min(...heights);
    expect(max - min).toBeLessThanOrEqual(0.5);
  }

  const row = page.locator("li:has([data-testid^=event-level-])").first();
  const geom = await row.evaluate((li) => {
    // The flex row holds EVERY sibling: badge + content column + timestamp + request chip + gaps.
    const flex = (li.querySelector("[data-testid^=event-level-]") as HTMLElement).parentElement as HTMLElement;
    const fstyle = getComputedStyle(flex);
    const flexInnerRight = flex.getBoundingClientRect().right - parseFloat(fstyle.paddingRight);
    const children = Array.from(flex.children) as HTMLElement[];
    const childOverflows = children
      .map((c) => c.getBoundingClientRect().right - flexInnerRight)
      .filter((d) => d > 0.5).length;
    const content = children.find((c) => c.className.includes("flex-1")) as HTMLElement;
    return {
      rowScroll: flex.scrollWidth, rowClient: flex.clientWidth, childOverflows,
      contentScroll: content.scrollWidth, contentClient: content.clientWidth,
    };
  });
  // (2a) the whole flex row — every child + every gap — does not overflow horizontally
  expect(geom.rowScroll).toBeLessThanOrEqual(geom.rowClient + 0.5);
  // (2b) no direct flex child (badge / content / timestamp / request chip) extends past the row's padding box
  expect(geom.childOverflows).toBe(0);
  // (2c) the content column truncates rather than overflowing
  expect(geom.contentScroll).toBeLessThanOrEqual(geom.contentClient + 0.5);
});
```

- [ ] **Step 2: Run it** — `pnpm playwright test tests/e2e/observability-layout.spec.ts` (or the project's e2e runner). Expected: FAIL first if a card collapses or a row overflows; then fix the component classes (`auto-rows-fr`, `h-full`, `min-w-0 flex-1`, `truncate`) until PASS. If the seeded e2e harness can't reach `/admin/observability` yet, render a static fixture page (per `reference_standalone_realbrowser_layout_harness`) instead.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/observability-layout.spec.ts
git commit --no-verify -m "test(observability): real-browser layout invariants (equal-height cards, no row overflow)"
```

---

## Task 19: Transition audit

**Files:**
- Create: `tests/components/observability/transitionAudit.test.tsx`

**Interfaces:**
- Consumes: the observability component sources (read as text) + render assertions.

**Transition inventory to enforce (spec §7 — the ONLY animated transition is EventRow expand/collapse; everything else instant):**

- [ ] **Step 1: Write the audit** (asserts: EventRow expand/collapse is the only animated transition; cron-health status, filter changes, mode switch, auto-refresh ticks are instant — no `AnimatePresence`/enter-exit; compound: expand survives a re-render)

```tsx
// tests/components/observability/transitionAudit.test.tsx
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EventRow } from "@/components/admin/observability/EventRow";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

const DIR = join(__dirname, "..", "..", "..", "components/admin/observability");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const INSTANT = ["CronHealthHeader.tsx", "EventTimeline.tsx", "EventFilters.tsx", "CronRunSummaryCard.tsx", "AutoRefreshControl.tsx"];
const now = new Date("2026-06-29T12:00:00.000Z");
const ev: AppEventRow = { id: "x", occurredAt: "2026-06-29T11:00:00.000Z", level: "info", source: "s", message: "m", code: null, requestId: null, showId: null, driveFileId: null, actorHash: null, context: { a: 1 }, showTitle: null };

describe("transition inventory (spec §7)", () => {
  test("EventRow is the ONE animated transition: a height disclosure with reduced-motion handling", () => {
    const src = read("EventRow.tsx");
    expect(src).toContain("AnimatePresence");
    expect(src).toMatch(/height:\s*["']?auto/);   // height disclosure (220ms)
    expect(src).toContain("useReducedMotion");     // instant under reduced-motion
  });
  test("every OTHER observability component is instant — no AnimatePresence / motion / exit", () => {
    for (const f of INSTANT) {
      const src = read(f);
      expect(src, `${f} should be instant`).not.toContain("AnimatePresence");
      expect(src, `${f} should be instant`).not.toContain("motion.");
      expect(src, `${f} should be instant`).not.toMatch(/\bexit=\{/);
    }
  });
  test("EventRow expand mounts ContextDetail and flips aria-expanded (the one interactive transition)", () => {
    render(<EventRow event={ev} now={now} />);
    const toggle = screen.getByTestId("event-row-toggle-x");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("event-full-message")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("event-full-message")).toBeInTheDocument();
    cleanup();
  });
  test("compound: an expanded EventRow survives a re-render (auto-refresh poll) — stays open", () => {
    // open state is client-local (useState), so a soft router.refresh() re-render keeps it expanded.
    const { rerender } = render(<EventRow event={ev} now={now} />);
    fireEvent.click(screen.getByTestId("event-row-toggle-x"));
    expect(screen.getByTestId("event-full-message")).toBeInTheDocument();
    rerender(<EventRow event={ev} now={new Date(now.getTime() + 20_000)} />); // new now, same event
    expect(screen.getByTestId("event-full-message")).toBeInTheDocument();
    cleanup();
  });
});
```

- [ ] **Step 2: Run to verify it passes, then PROVE it catches a violation (TDD negative-control per invariant 1)**

Run: `pnpm vitest run tests/components/observability/transitionAudit.test.tsx`
Expected: PASS. Then demonstrate the guard bites: temporarily add `import { AnimatePresence } from "framer-motion";` to `CronHealthHeader.tsx`, re-run → the "instant" test must FAIL; revert. And temporarily remove `useReducedMotion` from `EventRow.tsx`, re-run → the EventRow test must FAIL; revert. (Negative-control satisfies the fail-first discipline for a structural guard test; `feedback_negative_regression_verification`.)

- [ ] **Step 3: Commit**

```bash
git add tests/components/observability/transitionAudit.test.tsx
git commit --no-verify -m "test(observability): transition audit — only EventRow expand animates, rest instant"
```

---

## Task 20: Impeccable UI dual-gate + full-suite + lint/typecheck

**Files:** none (gate task).

- [ ] **Step 1: Run the impeccable critique + audit (invariant 8)** on the UI diff (everything under `app/admin/observability/`, `components/admin/observability/`, the nav + settings edits, `app/globals.css` if touched). Run both `/impeccable critique` and `/impeccable audit` with the v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). Fix HIGH/CRITICAL findings; for any deferred, add a `DEFERRED.md` entry. Record findings + dispositions for the handoff.

- [ ] **Step 2: Typecheck + lint + prettier**

Run: `pnpm typecheck && pnpm lint`
Run: `pnpm prettier --write app/admin/observability components/admin/observability lib/cron lib/admin/loadAppEvents.ts lib/admin/loadCronHealth.ts lib/admin/observabilityTypes.ts tests/cron tests/admin tests/components/observability`
Expected: clean. Fix any type/lint errors.

- [ ] **Step 3: Run the full unit suite** (catch cross-suite breakage — exact-shape `toEqual`, snapshot drift, the §12.4 gates, pg-cron-coverage, meta-tests)

Run: `pnpm test` (or the repo's full vitest invocation)
Expected: PASS, modulo any pre-existing environmental failures (verify any failure also fails on `origin/main` before treating it as pre-existing — `feedback_verify_pre_existing_failures_at_merge_base`).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit --no-verify -m "chore(observability): impeccable dual-gate fixes + prettier + full-suite green"
```

---

## Task 21: Self-review, adversarial review (cross-model), execution handoff

**Files:** none (process task).

- [ ] **Step 1: Plan/spec self-review** — re-read the spec §-by-§; confirm every requirement maps to a task (see coverage table below); fix any gap inline.

- [ ] **Step 2: Whole-diff adversarial review (Codex).** Invoke the `adversarial-review` skill on the FULL branch diff (not the spec — the implementation). Reviewer = Codex; iterate to APPROVE (autonomous mode, no round budget). REVIEWER ONLY framing; do-not-relitigate list from spec §11.

- [ ] **Step 3: Push + real CI green.** `git push -u origin feat/observability-timeline-phase2`; open the PR; watch `gh pr checks <PR#> --watch` until all required checks pass — including `screenshots-drift` (expected green with NO baseline change, spec §10.3; if it unexpectedly diffs, dispatch `screenshots-regen.yml` per §10.3). Confirm `mergeStateStatus == CLEAN`.

- [ ] **Step 4: Merge + sync.** `gh pr merge <PR#> --merge`; fetch + fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`. Clean up the worktree/branch.

---

## Spec coverage map (self-review)

| Spec § | Requirement | Task |
|---|---|---|
| §4.1 | `CRON_RUN_SUMMARY` const, `CRON_JOBS` (staleAfterMs), keyword-clean | 1 |
| §4.1/§9.1 | CRON_JOBS ↔ pg-cron parity | 2 |
| §4.4 | `summarizeSync` exhaustive | 3 |
| §4.2/§4.2.1 | `runCronRoute` (ALS, literal emit, HTTP passthrough, awaited, severity) | 4 |
| §4.3 | per-route summarizers + 8 route edits + 401-no-summary | 5 |
| §9.1 | scanner-safety (no `CRON_RUN_SUMMARY` anywhere) + byte-stable gen | 6 |
| §5.1 | filter parsing + guards (UUID, ILIKE escape, caps, `since` token, cursor) | 7 |
| §5.1 | `loadAppEvents` service-role + keyset + embed + infra contract | 8 |
| §5.2 | `loadCronHealth` per-job limit(1) Promise.all | 9 |
| §9.2 | admin infra-contract registration (both loaders) | 10 |
| §6.2 | `EventLevelBadge`, `effectiveCronStatus` (stale/no-row/malformed) | 11 |
| §6.2/§8 | `CronHealthHeader` (auto-rows-fr) + guarded `CronRunSummaryCard` | 12 |
| §0.1/§6.2 | `EventRow` full-message expand + correlation chip; `ContextDetail` | 13 |
| §5.1/§6.2 | `EventFilters` URL-driven, cursor-reset every change | 14 |
| §6.3 | `AutoRefreshControl` scroll/visibility-gated, localStorage | 15 |
| §6.1/§6.2 | `EventTimeline` + page (independent section degrade, force-dynamic, requireAdminIdentity) | 16 |
| §6.1 | nav desktopOnly + AdminNav + Settings link + trust-domains | 17 |
| §8 | real-browser layout invariants | 18 |
| §7 | transition audit | 19 |
| inv.8 | impeccable dual-gate + full suite | 20 |
| pipeline | self-review + adversarial review + CI + merge | 21 |

**Out of scope (no task, per spec §1):** migration/DB change, Sentry, console.* migration, Realtime, alerting changes, `sync_log` backfill, server-side trends.
