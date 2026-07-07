# Telemetry Console Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/admin/dev/telemetry` into a telemetry console (live header, at-a-glance overview strip, two-column body: hero event log + sidebar system/cron health) per the committed design mock, wired to real data including a new read-only 24h event-stats aggregate.

**Architecture:** Server-rendered page composing mostly existing components, restyled. Two new read-only `stable` SQL functions (`admin_event_stats_24h`, `admin_alert_summary`) called via `supabase.rpc(...)` from two new `lib/admin` loaders. Four new small components (overview strip, stat sparkline, active-filter chips, compact cron list) plus restyles of the event log, filters, and auto-refresh control. Zero new color tokens (mock palette maps 1:1 to existing `@theme` tokens); one `@keyframes` added to `globals.css`.

**Tech Stack:** Next.js 16 (App Router, RSC), Supabase (supabase-js service-role client + PostgREST RPC), Tailwind v4 (`@theme` tokens), framer-motion (existing event-row disclosure), Vitest + Testing Library (unit/jsdom), Playwright (real-browser layout), postgres.js (DB integration tests).

## Global Constraints (verbatim from spec + AGENTS.md)

- **TDD per task:** failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task**, conventional commits: `feat(db):` / `feat(admin):` / `test(admin):` / `feat(telemetry):`. One task per commit.
- **Invariant 5:** no raw error codes in UI. `infra_error` branches render human copy; forensic `code:` on logs only (outside §12.4 catalog).
- **Invariant 9:** every new Supabase reader destructures `{ data, error }`, returns typed `{ kind:"infra_error" }`, and is registered in `tests/admin/_metaInfraContract.test.ts` `infraRegistry`.
- **Invariant 8 (UI dual-gate):** `/impeccable critique` + `/impeccable audit` on the UI diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Zero new color tokens.** Use existing utilities per spec §6 mapping table. One `@keyframes tping` added to `globals.css` (not an `@theme` change).
- **Read-only:** no mutation, no advisory lock, no PostgREST DML lockdown, no §12.4 catalog change. Invariants 2, 3, 4, 10 = N/A (spec §12).
- **Migration→validation:** apply locally; `pnpm gen:schema-manifest` (no function delta expected); apply surgically to validation (`supabase db query --linked` + `notify pgrst,'reload schema'`). Deployment proof = the §14 DB test (spec §15 SETTLED contract), NOT `validation-schema-parity`.
- **All mock numbers are illustrative.** `CRON_JOBS.length` = 9. Every value is live-data-driven.

## Meta-test inventory (declared)

- **CREATES:** `tests/db/telemetryConsoleReads.test.ts` (new DB deployment-proof + behavioral test for both functions).
- **EXTENDS:** `tests/admin/_metaInfraContract.test.ts` — 2 new `infraRegistry` rows (`loadTelemetryStats`, `loadAlertSummary`), both `skipGrepShape: true` (rpc-based; construction-throw pinned by harness, rpc-throw covered behaviorally per the `loadBellFeed` precedent).
- **UNTOUCHED (declared):** `tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*`), `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutation surface), `tests/messages/_metaAdminAlertCatalog.test.ts` (no catalog change), `tests/db/validation-schema-parity.test.ts` (no table/column change — function-only migration produces no delta).

## Advisory-lock holder topology

N/A — this plan touches no `pg_advisory*` code path. Declared explicitly.

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `supabase/migrations/20260706120000_telemetry_console_reads.sql` | Create | Two `stable` read-only functions + revoke/grant. |
| `tests/db/telemetryConsoleReads.test.ts` | Create | DB behavioral (rollback-tx) + existence/privilege (local, unit-suite). |
| `tests/db/telemetryConsoleReads.rpc.test.ts` | Create | Real service_role rpc() smoke, gated by `RUN_VALIDATION_RPC_SMOKE` (x-audits only). |
| `.github/workflows/x-audits.yml` | Modify | New validation-scoped `telemetry-rpc-smoke` job (sets the gate var + secrets). |
| `lib/admin/telemetryTypes.ts` | Modify | Add `TelemetryStats`, `LoadTelemetryStatsResult`, `AlertSummary`. |
| `lib/admin/loadTelemetryStats.ts` | Create | `loadTelemetryStats(now)` via `rpc("admin_event_stats_24h")`. |
| `lib/admin/loadAlertSummary.ts` | Create | `loadAlertSummary()` via `rpc("admin_alert_summary")`. |
| `tests/admin/loadTelemetryStats.test.ts` / `loadAlertSummary.test.ts` | Create | Behavioral unit tests (ok / rpc-error / throw / coercion / malformed). |
| `tests/admin/_metaInfraContract.test.ts` | Modify | Register both loaders. |
| `components/admin/telemetry/cronHealthSummary.ts` | Create | `summarizeCronHealth(jobs, now)` pure helper. |
| `components/admin/telemetry/EventVolumeSparkline.tsx` | Create | Sparkline bars. |
| `components/admin/telemetry/TelemetryOverviewStrip.tsx` | Create | 4 stat cards. |
| `components/admin/telemetry/ActiveFilterChips.tsx` | Create | Removable filter chips. |
| `components/admin/telemetry/CronHealthList.tsx` | Create | Compact divided cron list (sidebar). |
| `components/admin/telemetry/EventFilters.tsx` | Modify | Toolbar restyle + chips row. |
| `components/admin/telemetry/AutoRefreshControl.tsx` | Modify | Pulse + switch + card restyle. |
| `components/admin/telemetry/EventTimeline.tsx` + `EventRow.tsx` | Modify | Divided-log restyle; error-row `bg-danger-bg`. |
| `app/globals.css` | Modify | Add `@keyframes tping`. |
| `app/admin/dev/telemetry/page.tsx` | Modify | Relayout: header → strip → two-column body. |
| `tests/components/telemetry/*.test.tsx` | Create/Modify | Component unit tests. |
| `tests/e2e/telemetry-layout.spec.ts` | Modify | Dimensional-invariant Playwright assertions. |
| `tests/components/telemetry/transitionAudit.test.tsx` | Modify | Add new components to the audit + compound test. |

---

### Task 1: Migration — two read-only SQL functions + DB deployment-proof test

**Files:**
- Create: `supabase/migrations/20260706120000_telemetry_console_reads.sql`
- Test: `tests/db/telemetryConsoleReads.test.ts`

**Interfaces:**
- Produces: DB functions `public.admin_event_stats_24h(_now timestamptz) → table(total bigint, error_count bigint, warn_count bigint, info_count bigint, buckets int[])` and `public.admin_alert_summary(_health_codes text[], _degraded_codes text[]) → table(total bigint, degraded bigint)`.

- [ ] **Step 1: Write the failing DB test** (`tests/db/telemetryConsoleReads.test.ts`). Follow the existing DB-test harness pattern — look at an existing `tests/db/*.test.ts` for the postgres.js connection helper (uses `TEST_DATABASE_URL`; `describe.skipIf(!process.env.TEST_DATABASE_URL)` guard for local-without-DB). Structure:

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { HEALTH_CODES, DEGRADED_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// Convention (tests/db/*): default to local supabase; CI sets TEST_DATABASE_URL=validation.
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
describe("telemetry console reads", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(DB, { prepare: false, max: 2 }); });
  afterAll(async () => { await sql.end(); });

  // ---- existence + privilege (outside any seeding tx) ----
  it("both functions exist and are service_role-executable, not public", async () => {
    for (const sig of [
      "public.admin_event_stats_24h(timestamptz)",
      "public.admin_alert_summary(text[],text[])",
    ]) {
      const [{ oid }] = await sql`select to_regprocedure(${sig}) as oid`;
      expect(oid, `${sig} must exist`).not.toBeNull();
      const [{ svc }] = await sql`select has_function_privilege('service_role', ${sig}, 'EXECUTE') as svc`;
      expect(svc, `${sig} EXECUTE granted to service_role`).toBe(true);
      for (const role of ["anon", "authenticated"]) {
        const [{ ok }] = await sql`select has_function_privilege(${role}, ${sig}, 'EXECUTE') as ok`;
        expect(ok, `${sig} not executable by ${role}`).toBe(false);
      }
    }
  });

  // ---- admin_event_stats_24h behavior: rollback-tx, pinned 2020 window ----
  it("admin_event_stats_24h buckets/levels are correct in an isolated window", async () => {
    const NOW = "2020-01-02T05:30:00Z"; // pinned historical
    await sql.begin(async (tx) => {
      const [{ n }] = await tx`select count(*)::int as n from app_events
        where occurred_at >= (date_trunc('hour', ${NOW}::timestamptz) - interval '23 hours')
          and occurred_at <  (date_trunc('hour', ${NOW}::timestamptz) + interval '1 hour')`;
      expect(n, "pinned 2020 window must be empty before seeding").toBe(0);
      // seed: 2 errors + 1 warn in the current hour (bucket 23), 1 info 5h ago (bucket 18), 1 out-of-window
      const cur = "2020-01-02T05:10:00Z";
      const older = "2020-01-02T00:15:00Z"; // 5h before cur hour → bucket 18
      const outside = "2019-12-30T00:00:00Z";
      for (const [ts, lvl] of [[cur,"error"],[cur,"error"],[cur,"warn"],[older,"info"],[outside,"error"]] as const)
        await tx`insert into app_events (occurred_at, level, source, message, context)
                 values (${ts}::timestamptz, ${lvl}, 'test.stats', 'x', '{}'::jsonb)`;
      const [row] = await tx`select * from admin_event_stats_24h(${NOW}::timestamptz)`;
      expect(Number(row.total)).toBe(4);
      expect(Number(row.error_count)).toBe(2);
      expect(Number(row.warn_count)).toBe(1);
      expect(Number(row.info_count)).toBe(1);
      const buckets = (row.buckets as number[]).map(Number);
      expect(buckets.length).toBe(24);
      expect(buckets.reduce((a,b)=>a+b,0)).toBe(4);
      expect(buckets[23]).toBe(3); // current hour: 2 errors + 1 warn
      expect(buckets[18]).toBe(1); // 5h ago: 1 info
      await tx`select 1 where false`; // no-op; tx rolls back below
      throw new ROLLBACK();
    }).catch((e) => { if (!(e instanceof ROLLBACK)) throw e; });
  });

  // ---- admin_alert_summary behavior: rollback-tx, SYNTHETIC codes (namespace isolation) ----
  it("admin_alert_summary counts only fixtures via synthetic codes", async () => {
    const H = ["__ts_h1__","__ts_h2__","__ts_deg__"], D = ["__ts_deg__"];
    await sql.begin(async (tx) => {
      // 2 unresolved health (h1,h2), 1 unresolved degraded (deg), 1 RESOLVED health, 1 non-listed code
      await tx`insert into admin_alerts (code, context) values ('__ts_h1__','{}'::jsonb)`;
      await tx`insert into admin_alerts (code, context) values ('__ts_h2__','{}'::jsonb)`;
      await tx`insert into admin_alerts (code, context) values ('__ts_deg__','{}'::jsonb)`;
      await tx`insert into admin_alerts (code, context, resolved_at) values ('__ts_h1__','{}'::jsonb, now())`;
      await tx`insert into admin_alerts (code, context) values ('__ts_unlisted__','{}'::jsonb)`;
      const [row] = await tx`select * from admin_alert_summary(${H}::text[], ${D}::text[])`;
      expect(Number(row.total)).toBe(3);    // h1,h2,deg unresolved; resolved h1 + unlisted excluded
      expect(Number(row.degraded)).toBe(1); // deg only
      expect(Number(row.total) - Number(row.degraded)).toBeGreaterThanOrEqual(0);
      throw new ROLLBACK();
    }).catch((e) => { if (!(e instanceof ROLLBACK)) throw e; });
  });
  // NOTE: the real service_role rpc() smoke is NOT here — it needs validation
  // REST creds that unit-suite lacks. It lives in Task 1B's
  // tests/db/telemetryConsoleReads.rpc.test.ts (excluded from unit-suite, run
  // in an x-audits validation-scoped job). This file (behavioral + existence +
  // privilege) uses ONLY postgres.js and runs in unit-suite against local.
});
class ROLLBACK extends Error {}
```

  (Uses the repo's `tests/db` convention: `postgres(url, { max: 2, prepare: false })` + `sql.begin` sentinel-throw ROLLBACK — see `tests/db/auto-publish-toggle-rls.test.ts`.)

- [ ] **Step 2: Run it, verify FAIL** — `pnpm vitest run tests/db/telemetryConsoleReads.test.ts`. Expected: FAIL (functions do not exist → `to_regprocedure` null / rpc error).

- [ ] **Step 3: Write the migration** exactly per spec §5.1 (both functions, revoke/grant). Use timestamp prefix `20260706120000`.

- [ ] **Step 4: Apply locally + reload schema** — apply via the repo's local-apply path (grep an existing migration test / `AGENTS.md` for the exact command; typically `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260706120000_telemetry_console_reads.sql` then `psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"`). Confirm the DB the tests hit is the same one.

- [ ] **Step 5: Run test, verify PASS** — `pnpm vitest run tests/db/telemetryConsoleReads.test.ts`. Expected: PASS (behavioral + existence + privilege).

- [ ] **Step 6: Regenerate manifest (expect no delta)** — `pnpm gen:schema-manifest`; `git status` should show NO change to `supabase/**/schema-manifest.json` (functions aren't introspected). If a delta appears, investigate an unintended table change.

- [ ] **Step 7: Commit** — `git add supabase/migrations/20260706120000_telemetry_console_reads.sql tests/db/telemetryConsoleReads.test.ts && git commit --no-verify -m "feat(db): admin_event_stats_24h + admin_alert_summary read-only aggregates"`

- [ ] **Step 8: Apply to validation surgically (deploy discipline; separate from commit)** — `supabase db query --linked -f supabase/migrations/20260706120000_telemetry_console_reads.sql` then `supabase db query --linked "notify pgrst, 'reload schema';"`. (If `TEST_DATABASE_URL` already IS the validation project — it is: `vzakgrxqwcalbmagufjh` — Step 4 already applied it there; this step confirms + reloads.) This apply MUST happen before push, else Task 1B's x-audits smoke fails against validation (that's the guard working).

---

### Task 1B: Wire the validation-scoped RPC smoke into CI

**Files:**
- Create: `tests/db/telemetryConsoleReads.rpc.test.ts`
- Modify: `.github/workflows/x-audits.yml` (new validation-scoped job)

**Why:** unit-suite boots LOCAL supabase and has no validation Supabase REST creds; and local `pnpm test` (Task 16) may lack them too. So the fail-closed real-`rpc()` test is **gated behind an explicit `RUN_VALIDATION_RPC_SMOKE` env var that ONLY the x-audits job sets** (Codex plan-R3). It SKIPS under local `pnpm test` and under unit-suite (var unset), and runs fail-closed only in the x-audits validation job. This needs no `ENV_BOUND_EXCLUDES`/topology change (the `skipIf` handles all non-x-audits runs).

- [ ] **Step 1: Write the RPC smoke** (`tests/db/telemetryConsoleReads.rpc.test.ts`), gated so it only runs in the x-audits job:

```ts
import { describe, expect, it } from "vitest";
import { HEALTH_CODES, DEGRADED_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
// Validation-only: the x-audits telemetry-rpc-smoke job sets RUN_VALIDATION_RPC_SMOKE=1
// plus the validation secrets. Skips under local `pnpm test` and unit-suite (var unset),
// so it never breaks the full-suite gate; fail-closed on missing env only when it DOES run.
describe.skipIf(!process.env.RUN_VALIDATION_RPC_SMOKE)("telemetry console reads — real rpc() smoke (validation-scoped)", () => {
  it("service_role rpc() reaches the same project's PostgREST with runtime param names", async () => {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
    expect(url && key, "SUPABASE_URL + SUPABASE_SECRET_KEY required (fail-closed)").toBeTruthy();
    const isLoopback = (s: string) => /127\.0\.0\.1|localhost/.test(s);
    if (isLoopback(DB) || isLoopback(url!)) {
      expect(isLoopback(DB) && isLoopback(url!), "local DB and local SUPABASE_URL must agree").toBe(true);
    } else {
      const dbRef = /postgres\.([a-z0-9]+)@/.exec(DB)?.[1];
      const urlRef = new URL(url!).host.split(".")[0];
      expect(urlRef, "SUPABASE_URL project ref must match TEST_DATABASE_URL project").toBe(dbRef);
    }
    const supabase = createSupabaseServiceRoleClient();
    const a = await supabase.rpc("admin_event_stats_24h", { _now: new Date("2020-01-02T05:30:00Z").toISOString() });
    expect(a.error, JSON.stringify(a.error)).toBeNull();
    expect(a.data?.[0]).toHaveProperty("buckets");
    const b = await supabase.rpc("admin_alert_summary", { _health_codes: HEALTH_CODES, _degraded_codes: DEGRADED_HEALTH_CODES });
    expect(b.error, JSON.stringify(b.error)).toBeNull();
    expect(b.data?.[0]).toHaveProperty("total");
  });
});
```

- [ ] **Step 2: Verify it skips without the gate var** — `pnpm vitest run tests/db/telemetryConsoleReads.rpc.test.ts` → the describe is SKIPPED (0 tests run, no failure). `RUN_VALIDATION_RPC_SMOKE=1 SUPABASE_URL=… SUPABASE_SECRET_KEY=… TEST_DATABASE_URL=… pnpm vitest run tests/db/telemetryConsoleReads.rpc.test.ts` → runs and passes (against validation; requires the migration applied there). No `vitest.projects.ts`/topology change needed (skipIf covers unit-suite + local).

- [ ] **Step 3: Add the x-audits job.** In `.github/workflows/x-audits.yml`, add a job mirroring `validation-schema-parity`'s shape (note `RUN_VALIDATION_RPC_SMOKE: "1"`):

```yaml
  telemetry-rpc-smoke:
    # Validation-deployment proof for the function-only migration 20260706120000
    # (admin_event_stats_24h / admin_alert_summary). validation-schema-parity
    # can't see functions; this hits the real PostgREST rpc() path on the
    # validation project. Fails if the migration never reached validation.
    if: github.event_name != 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10.33.2 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: Run telemetry rpc smoke against validation
        shell: bash
        env:
          RUN_VALIDATION_RPC_SMOKE: "1"
          TEST_DATABASE_URL: ${{ secrets.SUPABASE_TEST_DATABASE_URL }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
        run: |
          set -o pipefail
          pnpm vitest run tests/db/telemetryConsoleReads.rpc.test.ts 2>&1 | tee telemetry-rpc-smoke.log
      - name: Upload artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: telemetry-rpc-smoke-${{ github.run_id }}-${{ github.run_attempt }}
          if-no-files-found: warn
          path: telemetry-rpc-smoke.log
```

  Confirm the `secrets.SUPABASE_URL` / `secrets.SUPABASE_SECRET_KEY` names exist (used by the `verify-branch-protection` job in the same file) and `secrets.SUPABASE_TEST_DATABASE_URL` (used by `validation-schema-parity`). Confirm x-audits already triggers on `pull_request` (so the job runs on the PR); if it has `workflow_dispatch:`, note it for Stage-4 manual triggering.

- [ ] **Step 4: Commit** — `git commit --no-verify -m "test(db): CI-wire validation-scoped telemetry rpc smoke (x-audits)"`. (The job proves green at Stage 4 once the migration is applied to validation — Task 1 Step 8.)

---

### Task 2: `loadTelemetryStats` + types + unit tests + registry

**Files:**
- Modify: `lib/admin/telemetryTypes.ts` (add types)
- Create: `lib/admin/loadTelemetryStats.ts`
- Create: `tests/admin/loadTelemetryStats.test.ts`
- Modify: `tests/admin/_metaInfraContract.test.ts` (registry row)

**Interfaces:**
- Produces: `type TelemetryStats = { total:number; errorCount:number; warnCount:number; infoCount:number; buckets:number[] }`; `type LoadTelemetryStatsResult = { kind:"ok"; stats:TelemetryStats } | { kind:"infra_error"; message:string }`; `async function loadTelemetryStats(now: Date): Promise<LoadTelemetryStatsResult>`.

- [ ] **Step 1: Write the failing unit test** (`tests/admin/loadTelemetryStats.test.ts`) with a mocked `@/lib/supabase/server` whose `createSupabaseServiceRoleClient().rpc` is fn-configurable:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ rpc }),
}));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
import { loadTelemetryStats } from "@/lib/admin/loadTelemetryStats";

beforeEach(() => rpc.mockReset());
const NOW = new Date("2026-07-06T12:00:00Z");

it("ok: coerces bigint strings + returns stats", async () => {
  rpc.mockResolvedValue({ data: [{ total: "4", error_count: "2", warn_count: "1", info_count: "1", buckets: Array(24).fill(0).map((_,i)=>i===23?3:0) }], error: null });
  const r = await loadTelemetryStats(NOW);
  expect(r).toEqual({ kind: "ok", stats: { total:4, errorCount:2, warnCount:1, infoCount:1, buckets: expect.any(Array) }});
  expect(rpc).toHaveBeenCalledWith("admin_event_stats_24h", { _now: NOW.toISOString() });
});
it("rpc returned error → infra_error", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
  expect((await loadTelemetryStats(NOW)).kind).toBe("infra_error");
});
it("rpc throws → infra_error", async () => {
  rpc.mockRejectedValue(new Error("network"));
  expect((await loadTelemetryStats(NOW)).kind).toBe("infra_error");
});
it("malformed/empty data → infra_error", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  expect((await loadTelemetryStats(NOW)).kind).toBe("infra_error");
});
// Strict validation (Codex plan-R1 F1): drifted/partial shapes must degrade, not render NaN.
it.each([
  ["missing field", { total:"4", error_count:"2", warn_count:"1", /* info_count missing */ buckets: Array(24).fill(0) }],
  ["non-numeric",   { total:"x", error_count:"2", warn_count:"1", info_count:"1", buckets: Array(24).fill(0) }],
  ["non-array buckets", { total:"4", error_count:"2", warn_count:"1", info_count:"1", buckets: "nope" }],
  ["wrong bucket length", { total:"4", error_count:"2", warn_count:"1", info_count:"1", buckets: Array(12).fill(0) }],
  ["NaN/Infinity",  { total:"4", error_count:"Infinity", warn_count:"1", info_count:"1", buckets: Array(24).fill(0) }],
  ["negative",      { total:"-1", error_count:"2", warn_count:"1", info_count:"1", buckets: Array(24).fill(0) }],
])("malformed row (%s) → infra_error", async (_label, row) => {
  rpc.mockResolvedValue({ data: [row], error: null });
  expect((await loadTelemetryStats(NOW)).kind).toBe("infra_error");
});
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm vitest run tests/admin/loadTelemetryStats.test.ts` → FAIL (module missing).

- [ ] **Step 3: Add types to `telemetryTypes.ts`** (the three types above, after the existing cron types).

- [ ] **Step 4: Write `loadTelemetryStats.ts`** — mirrors `loadAppEvents` error discipline; forensic codes `TELEMETRY_STATS_READ_RETURNED_ERROR` / `_THREW`:

```ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import type { LoadTelemetryStatsResult } from "./telemetryTypes";

const isNonNegInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0;

const FAIL = { kind: "infra_error", message: "telemetry stats read failed" } as const;

export async function loadTelemetryStats(now: Date): Promise<LoadTelemetryStatsResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase.rpc("admin_event_stats_24h", { _now: now.toISOString() });
    if (error) {
      void log.error("admin_event_stats_24h returned error", {
        source: "admin.telemetry.stats", code: "TELEMETRY_STATS_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    const row = Array.isArray(data) ? data[0] : undefined;
    if (!row) {
      void log.error("admin_event_stats_24h malformed row", {
        source: "admin.telemetry.stats", code: "TELEMETRY_STATS_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    const total = Number(row.total), errorCount = Number(row.error_count);
    const warnCount = Number(row.warn_count), infoCount = Number(row.info_count);
    const buckets = Array.isArray(row.buckets) ? row.buckets.map(Number) : null;
    if (
      !isNonNegInt(total) || !isNonNegInt(errorCount) || !isNonNegInt(warnCount) ||
      !isNonNegInt(infoCount) || buckets === null || buckets.length !== 24 ||
      !buckets.every(isNonNegInt)
    ) {
      void log.error("admin_event_stats_24h malformed row", {
        source: "admin.telemetry.stats", code: "TELEMETRY_STATS_READ_RETURNED_ERROR",
      });
      return FAIL;
    }
    return { kind: "ok", stats: { total, errorCount, warnCount, infoCount, buckets } };
  } catch {
    void log.error("admin_event_stats_24h threw", {
      source: "admin.telemetry.stats", code: "TELEMETRY_STATS_READ_THREW",
    });
    return FAIL;
  }
}
```

  (Match the `log` import path + `void log.error(msg, { source, code })` shape to `loadAppEvents.ts:53-73` exactly.)

- [ ] **Step 5: Run, verify PASS.**

- [ ] **Step 6: Register in `_metaInfraContract.test.ts`** — add to `infraRegistry`:

```ts
{
  helper: "loadTelemetryStats",
  path: "lib/admin/loadTelemetryStats.ts",
  contract: "admin_event_stats_24h RPC; { data, error } destructure; construction throw + rpc returned {error} + rpc throw + empty/malformed row → { kind:'infra_error' }. Shared mock rpc() is not fn-keyed (loadBellFeed precedent) — rpc-throw/error covered in tests/admin/loadTelemetryStats.test.ts.",
  skipGrepShape: true as const,
},
```

  Run `pnpm vitest run tests/admin/_metaInfraContract.test.ts` → PASS (the harness drives construction-throw).

- [ ] **Step 7: Commit** — `git commit --no-verify -m "feat(admin): loadTelemetryStats 24h aggregate loader + infra registry row"`

---

### Task 3: `loadAlertSummary` + type + unit tests + registry

**Files:**
- Modify: `lib/admin/telemetryTypes.ts` (add `AlertSummary`)
- Create: `lib/admin/loadAlertSummary.ts`
- Create: `tests/admin/loadAlertSummary.test.ts`
- Modify: `tests/admin/_metaInfraContract.test.ts` (registry row)

**Interfaces:**
- Produces: `type AlertSummary = { kind:"ok"; degraded:0; notice:0; total:0 } | { kind:"degraded"|"notice"; degraded:number; notice:number; total:number } | { kind:"infra_error" }`; `async function loadAlertSummary(): Promise<AlertSummary>`.

- [ ] **Step 1: Write failing unit test** (`tests/admin/loadAlertSummary.test.ts`) — mock `@/lib/supabase/server` `rpc`, and `@/lib/adminAlerts/audience` is real:

```ts
// ok degraded>0 → kind degraded, notice = total - degraded
rpc.mockResolvedValue({ data: [{ total: "3", degraded: "1" }], error: null });
const r = await loadAlertSummary();
expect(r).toMatchObject({ kind: "degraded", total: 3, degraded: 1, notice: 2 });
expect(rpc).toHaveBeenCalledWith("admin_alert_summary", { _health_codes: HEALTH_CODES, _degraded_codes: DEGRADED_HEALTH_CODES });
// total 0 → ok
rpc.mockResolvedValue({ data: [{ total: "0", degraded: "0" }], error: null });
expect((await loadAlertSummary()).kind).toBe("ok");
// degraded 0, total>0 → notice
rpc.mockResolvedValue({ data: [{ total: "2", degraded: "0" }], error: null });
expect((await loadAlertSummary())).toMatchObject({ kind: "notice", notice: 2 });
// error / throw → infra_error (2 cases)
// Strict validation (Codex plan-R2 F2), mirror loadTelemetryStats:
it.each([
  ["missing degraded", { total: "3" }],
  ["non-numeric", { total: "x", degraded: "1" }],
  ["NaN/Infinity", { total: "Infinity", degraded: "1" }],
  ["negative", { total: "-1", degraded: "0" }],
  ["degraded > total", { total: "1", degraded: "3" }],
  ["empty data", null],
])("malformed (%s) → infra_error", async (_l, row) => {
  rpc.mockResolvedValue({ data: row === null ? [] : [row], error: null });
  expect((await loadAlertSummary()).kind).toBe("infra_error");
});
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Add `AlertSummary` type.**
- [ ] **Step 4: Write `loadAlertSummary.ts`** per spec §4 (rpc `admin_alert_summary`, import `HEALTH_CODES`/`DEGRADED_HEALTH_CODES` from `@/lib/adminAlerts/audience`, forensic codes `ALERT_SUMMARY_READ_RETURNED_ERROR`/`_THREW`). **Strict validation before ok:** reuse the same `isNonNegInt` guard (extract it to a shared `lib/admin/telemetryNum.ts` in Task 2 and import in both loaders, OR duplicate the 1-line helper); require `total`/`degraded` finite non-neg ints AND `degraded <= total`, else `infra_error`. Then `total===0`→ok; else `notice = total - degraded`, `kind = degraded>0?"degraded":"notice"`.
- [ ] **Step 5: Run, verify PASS.**
- [ ] **Step 6: Register in `_metaInfraContract.test.ts`** (`skipGrepShape: true`, contract mentions rpc + loadBellFeed precedent). Run the meta-test → PASS.
- [ ] **Step 7: Commit** — `feat(admin): loadAlertSummary single-snapshot alert counts + infra registry row`

---

### Task 4: `summarizeCronHealth` pure helper

**Files:**
- Create: `components/admin/telemetry/cronHealthSummary.ts`
- Create: `tests/components/telemetry/cronHealthSummary.test.ts`

**Interfaces:**
- Consumes: `CronHealthRow` (`lib/admin/telemetryTypes.ts`), `effectiveCronStatus` (`components/admin/telemetry/cronHealthStatus.ts`).
- Produces: `function summarizeCronHealth(jobs: CronHealthRow[], now: Date): { healthy:number; stale:number; idle:number; review:number; total:number }`.

- [ ] **Step 1: Write failing test** — build fixture `CronHealthRow[]` yielding each status via `effectiveCronStatus` (read `cronHealthStatus.ts` for how status is derived: `lastRunAt=null`→idle; age>staleAfterMs→warn; outcome ok→positive; partial→review). Assert counts + `total === jobs.length`. Derive expectations from the fixture, not hardcoded.

```ts
// 3 healthy (ok, recent), 1 stale (old lastRunAt), 1 idle (null lastRunAt), 1 review (partial)
const s = summarizeCronHealth(fixture, NOW);
expect(s).toEqual({ healthy: 3, stale: 1, idle: 1, review: 1, total: 6 });
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — map each job via `effectiveCronStatus(job, now).status`; `healthy = live|positive`, `stale = warn`, `idle = idle`, `review = review`; `total = jobs.length`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(telemetry): summarizeCronHealth counts helper`

---

### Task 5: `EventVolumeSparkline`

**Files:**
- Create: `components/admin/telemetry/EventVolumeSparkline.tsx`
- Create: `tests/components/telemetry/eventVolumeSparkline.test.tsx`

**Interfaces:**
- Produces: `function EventVolumeSparkline({ buckets }: { buckets: number[] }): JSX.Element` (server component).

- [ ] **Step 1: Write failing test** (anti-tautology: assert against the `buckets` prop, computing expected heights):

```ts
render(<EventVolumeSparkline buckets={[0,2,4,0,8]} />);
const bars = screen.getByTestId("event-sparkline").querySelectorAll("span[data-bar]");
expect(bars).toHaveLength(5);
// max=8 → linear [3,22]: height(v) = 3 + (v/8)*(22-3)
expect((bars[4] as HTMLElement).style.height).toBe("22px");   // max → 22
expect((bars[0] as HTMLElement).style.height).toBe("3px");    // 0 → baseline
// last bar accented
expect((bars[4] as HTMLElement).className).toContain("bg-accent");
// empty / all-zero → all baseline, still renders
render(<EventVolumeSparkline buckets={[0,0,0]} />);
// ... every bar 3px
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** per spec §7.3 — `role="img"`, `aria-label`, `flex items-end gap-[2px] h-[22px]`, each bar `data-bar` with `style={{height}}` scaled to `[3,22]` against `Math.max(...buckets, 1)`, last bar `bg-accent` else `bg-border-strong`. Guard empty/all-zero → all 3px.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(telemetry): EventVolumeSparkline`

---

### Task 6: `TelemetryOverviewStrip` (4 stat cards)

**Files:**
- Create: `components/admin/telemetry/TelemetryOverviewStrip.tsx`
- Create: `tests/components/telemetry/telemetryOverviewStrip.test.tsx`

**Interfaces:**
- Consumes: `AlertSummary`, `LoadCronHealthResult`, `LoadTelemetryStatsResult`, `summarizeCronHealth`, `EventVolumeSparkline`.
- Produces: `function TelemetryOverviewStrip({ alertSummary, cron, stats, now }): JSX.Element` (server).

- [ ] **Step 1: Write failing guard-matrix test** — cover each card's ok/zero/infra states, deriving expected copy from inputs (not siblings):

```ts
// System health degraded
render(<TelemetryOverviewStrip alertSummary={{kind:"degraded",total:2,degraded:1,notice:1}} cron={okCron} stats={okStats} now={NOW}/>);
expect(within(screen.getByTestId("stat-system-health")).getByText("Degraded")).toBeInTheDocument();
expect(within(screen.getByTestId("stat-open-alerts")).getByText("2")).toBeInTheDocument();
// cron total uses jobs.length (e.g. 9), not a literal 6
expect(within(screen.getByTestId("stat-cron")).getByText(/\/\s*9/)).toBeInTheDocument();
// events infra_error → "—"
render(<TelemetryOverviewStrip alertSummary={okSummary} cron={okCron} stats={{kind:"infra_error",message:"x"}} now={NOW}/>);
expect(within(screen.getByTestId("stat-events")).getByText("—")).toBeInTheDocument();
// alertSummary infra_error → system-health "Unavailable"
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** per spec §7.2 — a `StatCard` shell (`flex flex-col gap-2 rounded-md border border-border bg-surface p-4 shadow-tile h-full`), grid `grid-cols-1 gap-tile-gap sm:grid-cols-2 xl:grid-cols-4`, the four cards with their `data-testid`s + guard branches. Cron card uses `summarizeCronHealth`; events card uses `EventVolumeSparkline`. Omit zero breakdown segments per spec.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(telemetry): TelemetryOverviewStrip stat cards`

---

### Task 7: `ActiveFilterChips`

**Files:**
- Create: `components/admin/telemetry/ActiveFilterChips.tsx`
- Create: `tests/components/telemetry/activeFilterChips.test.tsx`

**Interfaces:**
- Consumes: `AppEventFilters`, `buildFilterHref` logic (replicate the `EventFilters` BASE + URLSearchParams patch, or extract a shared `lib/admin/telemetryFilterHref.ts` — see note).
- Produces: `function ActiveFilterChips({ filters }: { filters: AppEventFilters }): JSX.Element | null` (`"use client"`).

> **Refactor note:** `buildFilterHref` currently lives inside `EventFilters.tsx`. Extract it to `lib/admin/telemetryFilterHref.ts` (pure: `buildFilterHref(current: URLSearchParams, patch: Record<string,string|null>): string`) so both `EventFilters` and `ActiveFilterChips` share ONE implementation (DRY). Do this extraction as Step 0 here with its own micro-test, then both components import it.

- [ ] **Step 0: Extract + test `buildFilterHref`** into `lib/admin/telemetryFilterHref.ts`; unit-test it (patch adds/removes keys, deletes `cursorAt`/`cursorId`, empty value deletes key). Update `EventFilters.tsx` to import it (behavior unchanged; existing EventFilters tests must stay green). Commit: `refactor(telemetry): extract buildFilterHref for reuse`.
- [ ] **Step 1: Write failing test** — one chip per active filter; remove pushes correct href; empty filters → renders nothing:

```ts
const push = vi.fn(); vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams("level=warn,error&source=cron.x") }));
render(<ActiveFilterChips filters={{ levels:["warn","error"], source:"cron.x" }} />);
expect(screen.getByTestId("chip-remove-level-warn")).toBeInTheDocument();
expect(screen.getByTestId("chip-remove-source")).toBeInTheDocument();
fireEvent.click(screen.getByTestId("chip-remove-source"));
expect(push).toHaveBeenCalledWith(expect.not.stringContaining("source=cron.x"));
// empty → null
const { container } = render(<ActiveFilterChips filters={{}} />);
expect(container.firstChild).toBeNull();
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** per spec §7.5 — chip per active level (removing one level patches the remaining `level` csv), source/code/showId/requestId/q, non-default `since`; each chip an X icon-button with `data-testid="chip-remove-{key}"`, `min-h-tap-min`; "Clear filters" (`data-testid="clear-filters"`) → `router.push(BASE)`. Return `null` if nothing active.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(telemetry): ActiveFilterChips`

---

### Task 8: `EventFilters` restyle + chips row

**Files:**
- Modify: `components/admin/telemetry/EventFilters.tsx`
- Modify/Create: `tests/components/telemetry/eventFilters*.test.tsx`

- [ ] **Step 1: Extend/adjust tests** — keep all existing behavior tests green (level toggles, since select, Enter-commit, `router.push`). Add: renders the toolbar card wrapper; renders `<ActiveFilterChips>` row when a filter is active; hides it when none.
- [ ] **Step 2: Run, verify current tests + new fail appropriately.**
- [ ] **Step 3: Implement** per spec §7.4 — wrap controls in the toolbar card; segmented level control; render `<ActiveFilterChips filters={filters}/>` below (replace the old inline "Showing one request" pill). Preserve all `data-testid`s + `spKey` remount.
- [ ] **Step 4: Run, verify PASS** (full `tests/components/telemetry/eventFilters*`).
- [ ] **Step 5: Commit** — `feat(telemetry): filter toolbar + active-filter chips`

---

### Task 9: `CronHealthList` (compact sidebar list)

**Files:**
- Create: `components/admin/telemetry/CronHealthList.tsx`
- Create: `tests/components/telemetry/cronHealthList.test.tsx`

**Interfaces:**
- Consumes: `CronHealthRow`, `effectiveCronStatus`.
- Produces: `function CronHealthList({ jobs, now }: { jobs: CronHealthRow[]; now: Date }): JSX.Element` (server).

- [ ] **Step 1: Write failing test** — one `data-testid="cron-health-row"` per job; stale job row has `bg-warning-bg`; idle job shows "No run seen"; counts line when present. (`CronHealthHeader` + its tests untouched — assert nothing about them.)
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** per spec §7.6 — `<section aria-labelledby="cron-health-heading">`, `<h2>` "Cron health", one bordered card with `border-t` divided rows; each row label/cadence + `effectiveCronStatus` dot+label + optional counts; warn row `bg-warning-bg`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(telemetry): CronHealthList compact sidebar`

---

### Task 10: `AutoRefreshControl` restyle (pulse + switch + card) + keyframe

**Files:**
- Modify: `components/admin/telemetry/AutoRefreshControl.tsx`
- Modify: `app/globals.css` (add `@keyframes tping`)
- Modify: `tests/components/telemetry/autoRefreshControl*.test.tsx`

- [ ] **Step 1: Keep existing behavior tests green + add** — pulse ping present only when `on`; switch has `aria-pressed` + `data-testid="autorefresh-toggle"`; manual `data-testid="autorefresh-manual"` with `aria-label="Refresh now"`; `autorefresh-updated` present when `agoLabel`. (Read the existing test file; do not regress the interval/scroll/localStorage tests.)
- [ ] **Step 2: Run, verify new assertions FAIL (old pass).**
- [ ] **Step 3: Add `@keyframes tping`** to `app/globals.css` (near the other keyframes; a comment noting it's for the telemetry pulse, NOT an `@theme` token). Implement the restyle per spec §7.1 — pill card, pulse dot (ping ring only when `on`, static faint dot when off), 34×20 switch (thumb translateX, `min-h-tap-min` tap target), divider, updated label, icon refresh button. Reduced-motion suppresses the ping.
- [ ] **Step 4: Run, verify PASS** (full autoRefresh test file).
- [ ] **Step 5: Commit** — `feat(telemetry): live auto-refresh control (pulse + switch)`

---

### Task 11: `EventTimeline` + `EventRow` divided-log restyle

**Files:**
- Modify: `components/admin/telemetry/EventTimeline.tsx`, `EventRow.tsx`
- Modify: `tests/components/telemetry/eventTimeline*.test.tsx`, `eventRow*.test.tsx`

- [ ] **Step 1: Adjust/add tests** — timeline renders ONE bordered `data-testid="event-log"` container with divided rows (`border-t`), not gapped cards; error row has `bg-danger-bg`; keep expand/`event-row-toggle-{id}`/`CronRunSummaryCard`/`ContextDetail`/`event-timeline-load-older`/`event-timeline-degraded`/empty-state tests green.
- [ ] **Step 2: Run, verify FAIL on the new structural assertions.**
- [ ] **Step 3: Implement** per spec §7.7 — timeline `<ul data-testid="event-log" class="… rounded-md border border-border bg-surface shadow-tile overflow-hidden">`; `EventRow` `<li>` flush divided (`border-t`, `px-4 py-3.5`), error row `bg-danger-bg`, chevron rotate-on-open. Preserve framer-motion disclosure.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(telemetry): divided dense event log`

---

### Task 12: `page.tsx` relayout

**Files:**
- Modify: `app/admin/dev/telemetry/page.tsx`
- Modify: `tests/admin/telemetryRouteAudit.test.ts` (keep green; add strip/sidebar presence if it asserts structure)

**Interfaces:**
- Consumes: everything above + `loadAppEvents`, `loadCronHealth`, `nowDate`, `parseAppEventFilters`, `AdminPageHeader`, `HealthAlertsPanel`, `AutoRefreshControl`.

- [ ] **Step 1: Adjust tests** — route still auth-gated (`requireDeveloperIdentity`); page renders `telemetry-overview-strip`, the two-column body, `event-log`, `cron-health` sidebar list, `health-alerts-panel`. Keep the existing route-audit assertions (developer gate, settings link, build-gate) green.
- [ ] **Step 2: Run, verify FAIL on new structure.**
- [ ] **Step 3: Implement** per spec §7.8 — extend `Promise.all` with `loadAlertSummary()` + `loadTelemetryStats(now)`; render header → `TelemetryOverviewStrip` → `grid xl:grid-cols-[minmax(0,1fr)_340px]` (left: `EventFilters` in Suspense + activity sub-header + `EventTimeline`; right: `HealthAlertsPanel` + `CronHealthList` or the `cron-health-degraded` fallback when `health.kind!=="ok"`). Activity sub-header copy per spec §11 (`hasMore` → "Showing recent events").
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(telemetry): relayout telemetry page into console (overview + two-column)`

---

### Task 13: Layout-dimensions (real-browser Playwright)

**Files:**
- Modify: `tests/e2e/telemetry-layout.spec.ts`

- [ ] **Step 1: Write failing Playwright assertions** for spec §8 dimensional invariants (jsdom insufficient). Read the existing spec file for the auth/seed harness. Assertions (`getBoundingClientRect`, ±0.5px):
  - 4 stat cards equal height in their row.
  - Sidebar width == 340 at viewport ≥1200; body has no horizontal overflow (`document.documentElement.scrollWidth <= clientWidth`).
  - Single-column stack < xl (sidebar below log): assert order.
  - Sparkline bars each `height ∈ [3,22]` and bottom-aligned with the container.
  - Auto-refresh switch thumb within track bounds in both on/off states.
- [ ] **Step 2: Run, verify FAIL** where layout not yet correct (or PASS if implementation already satisfies — then it's a regression guard).
- [ ] **Step 3: Fix any layout gaps** (e.g. `items-stretch`, `h-full`, `w-[340px]`, `min-w-0`) surfaced by the assertions.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `test(telemetry): real-browser dimensional-invariant assertions`

---

### Task 14: Transition audit

**Files:**
- Modify: `tests/components/telemetry/transitionAudit.test.tsx`

- [ ] **Step 1: Extend the audit** — add the new components (`TelemetryOverviewStrip`, `EventVolumeSparkline`, `ActiveFilterChips`, `CronHealthList`, restyled `AutoRefreshControl`) to the enumerated list; assert per spec §9: overview strip/chips/sparkline are deliberately instant (no `AnimatePresence`/exit); auto-refresh pulse is CSS-keyframe gated by `on` + reduced-motion; event-row disclosure unchanged. Add the compound test: toggling auto-refresh while an event row is mid-expand — independent subtrees, both proceed (assert both DOM states reachable together).
- [ ] **Step 2: Run, verify FAIL** (new components not yet listed → the audit's fail-by-default catches them).
- [ ] **Step 3: Make assertions pass** (they should, if §9 is honored; fix any stray animation).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `test(telemetry): transition audit for console components`

---

### Task 15: Impeccable dual-gate (invariant 8)

**Files:** UI diff (no code file unless findings require).

- [ ] **Step 1:** Run `/impeccable critique` on the telemetry UI diff. Record findings.
- [ ] **Step 2:** Run `/impeccable audit` (a11y/perf/responsive) on the diff. Record findings.
- [ ] **Step 3:** Fix all HIGH/CRITICAL, or defer each with a `DEFERRED.md` entry (rationale + follow-up). Commit fixes as `fix(telemetry): impeccable <finding>` (one per finding or a grouped `polish` commit).
- [ ] **Step 4:** Record findings + dispositions for the handoff/PR body.

---

### Task 16: Full verification (pre-push gate)

**Files:** none (verification only).

- [ ] **Step 1:** `pnpm typecheck` → clean (vitest strips types; `next build`/quality-tsc catch TS).
- [ ] **Step 2:** `pnpm test` (FULL suite — scoped gates miss cross-file regressions). The validation rpc smoke (`telemetryConsoleReads.rpc.test.ts`) SKIPS here (gate var `RUN_VALIDATION_RPC_SMOKE` unset), so the full suite passes without validation REST secrets.
- [ ] **Step 3:** `pnpm lint` (eslint canonical-Tailwind), `pnpm format:check` (prettier; `--no-verify` bypassed the hook).
- [ ] **Step 4:** `pnpm build` (Next build).
- [ ] **Step 5:** Re-run the admin meta-tests (`tests/admin/_metaInfraContract.test.ts`) — comment/format fragility guard.
- [ ] **Step 6:** Fix anything red; commit fixes. This gate must be fully green before Stage 4 (whole-diff Codex review → push → CI → merge).

---

## Self-review (against spec)

- **§1-3 layout / data sources:** Tasks 6, 8, 9, 11, 12 (components) + Task 12 (page wiring). ✓
- **§4 loadAlertSummary:** Task 3. ✓ **§5 functions + wrappers:** Tasks 1, 2, 3. ✓
- **§6 token mapping (zero new tokens):** enforced across component tasks; only `@keyframes` added (Task 10). ✓
- **§7 component specs:** Tasks 5-12 each cite their §7.x. ✓
- **§8 dimensional invariants:** Task 13 (Playwright). ✓ **§9 transitions:** Task 14. ✓
- **§10 responsive / §11 numeric:** Tasks 6, 12 (grid breakpoints, `jobs.length`, activity copy). ✓
- **§12 invariants / §13 meta-tests:** registry rows (Tasks 2, 3); N/A declarations in Global Constraints. ✓
- **§14 testing / §15 SETTLED DB contract:** Task 1 (behavioral + existence + privilege, local) + Task 1B (real rpc smoke, excluded from unit-suite, x-audits validation job — the CI-enforced deployment proof). ✓
- **Strict loader validation (plan-R1 F1 / R2 F2):** `loadTelemetryStats` (Task 2) + `loadAlertSummary` (Task 3) both `isNonNegInt`-validate + degrade to infra_error, with table-driven malformed tests. ✓
- **Type consistency:** `TelemetryStats`/`LoadTelemetryStatsResult`/`AlertSummary` defined Task 2-3, consumed Task 6; `summarizeCronHealth` signature Task 4 → consumed Task 6, 9; `buildFilterHref` extracted Task 7 Step 0 → consumed Task 7, 8. ✓
- No placeholders; test code shown; exact paths + commit messages per task.
