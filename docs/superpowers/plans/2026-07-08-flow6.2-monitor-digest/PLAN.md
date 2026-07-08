# Flow 6.2 Monitor Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing daily review digest email with an "Applied automatically since your last digest" section reporting auto-applied roster/field changes, autocorrects, and sub-threshold drift for the pull-only band — so a Doug who never opens the dashboard learns about silent changes within a day.

**Architecture:** Read-only additive section on the existing digest (cron `job=digest`, `daily_review_digest` toggle, `deliverDigest`). A global `app_settings.last_monitor_digest_sent_at` watermark defines the "since last digest" window. Three sources: `show_change_log` (auto-apply, reuse Flow-4 filters); `sync_log ⋈ shows ON drive_file_id WHERE status='applied'` for autocorrects (`summarizeAutoFixes`) and drift (`summarizeDataGaps` + `isQualityRegression`). One prerequisite sync-core fix: the cron `sync_log` sink (`makePostgresSyncLogSink`) currently drops the threaded `parseWarnings` — append them so signals 2 & 3 have data. No `sync_log.show_id` write (FK/visibility race); the monitor joins on `drive_file_id`.

**Tech Stack:** Next.js 16, Supabase (Postgres), postgres.js (`sql`) for digest builders, supabase-js service-role client for app_settings, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-flow6.2-monitor-digest.md` (APPROVED, 7 adversarial rounds). Cite section numbers below; the spec carries the full rationale and every guard condition.

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. One task per commit, conventional-commits `feat(notify)`/`fix(sync)`/`test(...)`.
- **Invariant 5:** email copy uses `AUTO_FIX_CLASSES`/`GAP_CLASSES` `.label`, NEVER `.code`.
- **Invariant 8 does NOT apply:** the only rendered surface is an email template under `lib/notify/templates/` (not `app/`/`components/`) — no impeccable gate (spec §10).
- **Invariant 9:** every Supabase/postgres DB boundary destructures `{data,error}` (or try/catch on `sql`), returns a typed `infra_error`; both new `lib/notify/*.ts` DB files are added to `tests/notify/_metaInfraContract.test.ts` `REGISTERED` **in the same commit** (spec §10/§11).
- **Invariant 2 (advisory lock): N/A** — no per-show-locked table is mutated; the watermark writes `app_settings` (singleton) lock-free; the sink runs outside the apply tx.
- **Migration→validation parity:** the watermark migration is applied locally + `pnpm gen:schema-manifest` committed + applied surgically to the validation project (`supabase db query --linked`), all in the same PR (`validation-schema-parity` gate).
- **Full suite before push:** `pnpm test` (scoped gates miss regressions), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` (RSC/action wiring).
- **Deferred:** new-gaps as a first-class line (until `ambiguity-warnings-v1` lands); Resend key (6.1). Neither is in this plan.

## Meta-test inventory (spec §11)

- **EXTENDS** `tests/notify/_metaInfraContract.test.ts` — add `lib/notify/monitorWatermark.ts` + `lib/notify/monitorDigest.ts` to `REGISTERED` (mandatory; fails-by-default `lib/notify` walk).
- **UNCHANGED** registries: `lib/sync/syncLog.ts` (edited by §3.2) is already REGISTERED in `tests/sync/_metaInfraContract.test.ts:81`. No advisory-lock topology change. No new admin-alert code, RPC-gated table, tile, or inline-email boundary.

## Test strategy — two tiers (anti-tautology, plan R1 F1)

A fake `sql` tag that returns canned rows CANNOT prove the query's `WHERE` filters (`status='applied'`, `s.published`, `acknowledged_at is null`, `occurred_at > windowStart`, orphan-show exclusion) — an implementation that omits a filter still passes. So every signal is tested at **two tiers**:

- **Pure-helper unit tests** (fast, no DB): `monitorDigest.ts` exports its pure aggregation helpers (`groupAutoApplied`, `accumulateAutoFixes`, `computeDrift`) and they are unit-tested directly with injected row arrays — proving grouping/summarizeAutoFixes accumulation/drift comparison logic. Window computation is proven via a **recording `sql`** that captures the bind params (asserts `windowStart` = watermark, or `now-24h` when NULL).
- **DB-integration filter tests** (`*.db.test.ts`, real local Postgres, skip if down — pattern per `tests/sync/ignoredWarningsOrphanGc.db.test.ts:16-38`): seed BOTH eligible AND excluded rows (non-`applied` status, unpublished show, orphan `drive_file_id`, acked/pre-window rows), run `buildMonitorDigestModel` with the REAL `sql`, and assert only the eligible rows contribute. These prove the SQL `WHERE` clauses. Each seeds inside a transaction it `ROLLBACK`s (or deletes its seed rows in `afterAll`) so the shared DB stays clean.

## Advisory-lock holder topology

Not touched. The feature reads `show_change_log`/`sync_log`/`shows` and writes only `app_settings` (singleton, lock-free, mirroring `writeSyncCronHeartbeat`). The §3.2 sink runs on its own post-apply connection outside the apply tx. `tests/auth/advisoryLockRpcDeadlock.test.ts` unaffected.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260708000000_flow6_2_monitor_digest_watermark.sql` | add nullable `app_settings.last_monitor_digest_sent_at` (public + dev shadow) |
| `lib/sync/syncLog.ts` (modify) | §3.2 fix: `warningsFor` appends `entry.parseWarnings` |
| `lib/admin/loadRecentAutoApplied.ts` (modify) | export `STRIP_KINDS` for filter-parity (currently private) |
| `lib/notify/monitorWatermark.ts` (new) | `getMonitorDigestWatermark` / `writeMonitorDigestWatermark` (supabase-client) |
| `lib/notify/monitorDigest.ts` (new) | `buildMonitorDigestModel` + 3 queries + `MONITOR_FIRST_RUN_LOOKBACK_MS` (postgres.js `sql`) |
| `lib/notify/templates/digest.ts` (modify) | `renderDigest` monitor section |
| `lib/notify/deliver.ts` (modify) | `deliverDigest` accepts `monitor`, threads to `renderDigest`, records `monitor_totals` |
| `lib/notify/runNotify.ts` (modify) | `runDigestNotify`: compute monitor once, send-condition, accumulate `{sent,failed,skipped,retryLater}`, advance watermark |
| `tests/notify/_metaInfraContract.test.ts` (modify) | 2 new `REGISTERED` rows |
| `supabase/__generated__/schema-manifest.json` (regen) | reflects the new column |

---

## Task 1: Watermark migration + schema manifest

**Files:**
- Create: `supabase/migrations/20260708000000_flow6_2_monitor_digest_watermark.sql`
- Modify (regen): `supabase/__generated__/schema-manifest.json`

**Interfaces:**
- Produces: column `public.app_settings.last_monitor_digest_sent_at timestamptz` (nullable), read/written by Task 4.

- [ ] **Step 1: Write the migration**

```sql
-- Flow 6.2 monitor digest: watermark for the "since last digest" window (spec §4.1).
alter table public.app_settings
  add column if not exists last_monitor_digest_sent_at timestamptz;

-- dev.* shadow (local-seed parity), mirroring the notify-columns migration.
alter table if exists dev.app_settings
  add column if not exists last_monitor_digest_sent_at timestamptz;
```

- [ ] **Step 2: Apply locally + verify**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260708000000_flow6_2_monitor_digest_watermark.sql && psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "notify pgrst, 'reload schema';"`
Expected: `ALTER TABLE` ×2, no error. Re-run once → still succeeds (idempotent via `if not exists`).

- [ ] **Step 3: Regenerate + commit the schema manifest**

Run: `pnpm gen:schema-manifest`
Expected: `supabase/__generated__/schema-manifest.json` gains `last_monitor_digest_sent_at` under `app_settings`. Confirm with `git diff --stat`.

- [ ] **Step 4: Apply to validation project (parity gate)**

Run: `supabase db query --linked "alter table public.app_settings add column if not exists last_monitor_digest_sent_at timestamptz; notify pgrst, 'reload schema';"`
Expected: success. (If `--linked` is unavailable in this environment, note it and apply via `psql "$TEST_DATABASE_URL" -f <file>` — `TEST_DATABASE_URL` is the validation DB per the worktree env link.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260708000000_flow6_2_monitor_digest_watermark.sql supabase/__generated__/schema-manifest.json
git commit --no-verify -m "feat(db): add app_settings.last_monitor_digest_sent_at watermark (flow 6.2)"
```

---

## Task 2: §3.2 sink fix — persist applied-outcome parse warnings

The cron sink drops `entry.parseWarnings` (spec §3.2). Fix `warningsFor` to append them, matching `insertSyncLog` (`runScheduledCronSync.ts:1174-1178`). One function; no `show_id`, no `logSync`/`SyncLogEntry` change.

**Files:**
- Modify: `lib/sync/syncLog.ts` (`warningsFor`, `:25-28`)
- Test: `tests/sync/syncLogSink.persistence.test.ts` (new); update existing `tests/sync/syncLog.test.ts` only if its `skipped`-case assertion changes (it must NOT — no `parseWarnings` there).

**Interfaces:**
- Consumes: `SyncLogEntry` (`runScheduledCronSync.ts:421-429`) — already has `parseWarnings?: ParseResult["warnings"]`.
- Produces: cron `sync_log.parse_warnings` = `[payloadRow?, ...parseWarnings]` for applied entries (Task 5-7 read this).

- [ ] **Step 1: Write the failing test** (`tests/sync/syncLogSink.persistence.test.ts`)

```typescript
import { describe, expect, test, vi } from "vitest";
import { makePostgresSyncLogSink } from "@/lib/sync/syncLog";

describe("sync_log sink — parse-warnings persistence (flow 6.2 §3.2)", () => {
  test("applied entry appends parseWarnings after the payload row", async () => {
    const unsafe = vi.fn(async () => []);
    const sink = makePostgresSyncLogSink({ unsafe });
    const parseWarnings = [
      { code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: "x" },
      { code: "FIELD_UNREADABLE", severity: "warn", message: "y" },
    ];
    await sink({
      driveFileId: "file-1",
      outcome: "applied",
      payload: { kind: "delta" },
      parseWarnings,
    } as never);
    const params = unsafe.mock.calls[0][1] as unknown[];
    // parse_warnings is the LAST positional param (jsonb array).
    expect(params[params.length - 1]).toEqual([
      { kind: "delta", outcome: "applied", code: null },
      ...parseWarnings,
    ]);
  });

  test("entry with no parseWarnings is byte-identical to today (payload row only)", async () => {
    const unsafe = vi.fn(async () => []);
    const sink = makePostgresSyncLogSink({ unsafe });
    await sink({
      driveFileId: "file-2",
      outcome: "skipped",
      code: "WEBHOOK_NOOP_ALREADY_SYNCED",
      payload: { kind: "watermark" },
    } as never);
    const params = unsafe.mock.calls[0][1] as unknown[];
    expect(params[params.length - 1]).toEqual([
      { kind: "watermark", outcome: "skipped", code: "WEBHOOK_NOOP_ALREADY_SYNCED" },
    ]);
  });

  test("applied entry with parseWarnings and no payload has no leading payload row", async () => {
    const unsafe = vi.fn(async () => []);
    const sink = makePostgresSyncLogSink({ unsafe });
    const parseWarnings = [{ code: "ROLE_TOKEN_AUTOCORRECTED", severity: "warn", message: "z" }];
    await sink({ driveFileId: "file-3", outcome: "applied", parseWarnings } as never);
    const params = unsafe.mock.calls[0][1] as unknown[];
    expect(params[params.length - 1]).toEqual([...parseWarnings]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/sync/syncLogSink.persistence.test.ts`
Expected: FAIL — case 1 and 3 fail (`parseWarnings` dropped by current `warningsFor`).

- [ ] **Step 3: Implement the fix** — replace `warningsFor` in `lib/sync/syncLog.ts`:

```typescript
function warningsFor(entry: SyncLogEntry): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  if (entry.payload) {
    rows.push({ ...entry.payload, outcome: entry.outcome, code: entry.code ?? null });
  }
  if (entry.parseWarnings) {
    rows.push(...(entry.parseWarnings as Array<Record<string, unknown>>));
  }
  return rows;
}
```

(The insert statement and positional params in `makePostgresSyncLogSink` are unchanged — `warningsFor(entry)` is still bound to the same `$4` param.)

- [ ] **Step 4: Run the new test + the existing sink test**

Run: `pnpm vitest run tests/sync/syncLogSink.persistence.test.ts tests/sync/syncLog.test.ts`
Expected: PASS — including the existing `syncLog.test.ts` `skipped`-case (its expected array is unchanged; it has no `parseWarnings`).

- [ ] **Step 5: Run the sync_log reader + channel regression tests**

Run: `pnpm vitest run tests/sync/readShowPriorWarningsRaw.test.ts tests/sync/runOfShowSyncLogChannel.test.ts tests/api/cron-sync.test.ts tests/sync/_metaInfraContract.test.ts`
Expected: PASS (no reader regresses on the enriched `parse_warnings`; §14 sweep note).

- [ ] **Step 6: Commit**

```bash
git add lib/sync/syncLog.ts tests/sync/syncLogSink.persistence.test.ts
git commit --no-verify -m "fix(sync): cron sync_log sink persists applied-outcome parse warnings (flow 6.2 §3.2)"
```

---

## Task 3: Export `STRIP_KINDS` for filter parity

The monitor's auto-apply query must use the SAME `source`/`status`/`acknowledged_at`/`change_kind` filters as `loadRecentAutoApplied` (spec §3, §13.3). `STRIP_KINDS` is currently private. Export it so the parity test compares one source of truth.

**Files:**
- Modify: `lib/admin/loadRecentAutoApplied.ts:55` (add `export`)
- Test: `tests/admin/loadRecentAutoApplied` existing tests must still pass (no behavior change).

**Interfaces:**
- Produces: `export const STRIP_KINDS` (readonly tuple of 5 change kinds), consumed by Task 5 + Task 8 parity test.

- [ ] **Step 1: Add the export**

In `lib/admin/loadRecentAutoApplied.ts`, change `const STRIP_KINDS = [` (`:55`) to `export const STRIP_KINDS = [`.

- [ ] **Step 2: Verify no regression**

Run: `pnpm vitest run tests/admin/loadRecentAutoApplied.test.ts` (and any test importing the module)
Expected: PASS (export is additive).

- [ ] **Step 3: Commit**

```bash
git add lib/admin/loadRecentAutoApplied.ts
git commit --no-verify -m "refactor(admin): export STRIP_KINDS for monitor-digest filter parity (flow 6.2)"
```

---

## Task 4: Watermark read/write helpers + meta registration

**Files:**
- Create: `lib/notify/monitorWatermark.ts`
- Modify: `tests/notify/_metaInfraContract.test.ts` (add `REGISTERED` row — SAME commit)
- Test: `tests/notify/monitorWatermark.infra.test.ts` (new)

**Interfaces:**
- Produces:
  - `getMonitorDigestWatermark(client?: Client): Promise<{ kind: "value"; watermark: Date | null } | { kind: "infra_error" }>`
  - `writeMonitorDigestWatermark(when: Date, client?: Client): Promise<{ kind: "ok" } | { kind: "infra_error" }>`
  consumed by Task 8 (read) and Task 11 (write).

- [ ] **Step 1: Write the failing infra test** (`tests/notify/monitorWatermark.infra.test.ts`)

```typescript
import { describe, expect, test, vi } from "vitest";
import { getMonitorDigestWatermark, writeMonitorDigestWatermark } from "@/lib/notify/monitorWatermark";

function clientReturningError() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }),
      update: () => ({ eq: () => ({ select: async () => ({ data: null, error: { message: "boom" } }) }) }),
    }),
  } as never;
}
function clientThrowing() {
  return { from: () => { throw new Error("thrown"); } } as never;
}

describe("monitorWatermark infra contract (invariant 9)", () => {
  test("read: returned error → infra_error", async () => {
    expect(await getMonitorDigestWatermark(clientReturningError())).toEqual({ kind: "infra_error" });
  });
  test("read: thrown → infra_error", async () => {
    expect(await getMonitorDigestWatermark(clientThrowing())).toEqual({ kind: "infra_error" });
  });
  test("read: value maps to Date | null", async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { last_monitor_digest_sent_at: "2026-07-08T00:00:00Z" }, error: null }) }) }) }),
    } as never;
    const r = await getMonitorDigestWatermark(client);
    expect(r).toEqual({ kind: "value", watermark: new Date("2026-07-08T00:00:00Z") });
  });
  test("read: null column → value null", async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { last_monitor_digest_sent_at: null }, error: null }) }) }) }),
    } as never;
    expect(await getMonitorDigestWatermark(client)).toEqual({ kind: "value", watermark: null });
  });
  test("write: empty update data → infra_error", async () => {
    const client = {
      from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }),
    } as never;
    expect(await writeMonitorDigestWatermark(new Date(), client)).toEqual({ kind: "infra_error" });
  });
  test("write: success", async () => {
    const client = {
      from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: [{ id: "default" }], error: null }) }) }) }),
    } as never;
    expect(await writeMonitorDigestWatermark(new Date(), client)).toEqual({ kind: "ok" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/notify/monitorWatermark.infra.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/notify/monitorWatermark.ts`** (mirrors `getDailyReviewDigest.ts` / `writeSyncCronHeartbeat.ts`)

```typescript
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type WatermarkReadResult =
  | { kind: "value"; watermark: Date | null }
  | { kind: "infra_error" };
export type WatermarkWriteResult = { kind: "ok" } | { kind: "infra_error" };

export async function getMonitorDigestWatermark(client?: Client): Promise<WatermarkReadResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("last_monitor_digest_sent_at")
      .eq("id", "default")
      .maybeSingle();
    if (error) return { kind: "infra_error" };
    const raw = (data as { last_monitor_digest_sent_at?: string | null } | null)
      ?.last_monitor_digest_sent_at;
    return { kind: "value", watermark: raw ? new Date(raw) : null };
  } catch {
    return { kind: "infra_error" };
  }
}

export async function writeMonitorDigestWatermark(
  when: Date,
  client?: Client,
): Promise<WatermarkWriteResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("app_settings")
      .update({ last_monitor_digest_sent_at: when.toISOString() })
      .eq("id", "default")
      .select("id");
    if (error) return { kind: "infra_error" };
    if (!data || data.length === 0) return { kind: "infra_error" };
    return { kind: "ok" };
  } catch {
    return { kind: "infra_error" };
  }
}
```

- [ ] **Step 4: Register in the notify infra meta-test** — add to `REGISTERED` in `tests/notify/_metaInfraContract.test.ts` (after `lib/notify/runNotify.ts`):

```typescript
  { path: "lib/notify/monitorWatermark.ts" },
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/notify/monitorWatermark.infra.test.ts tests/notify/_metaInfraContract.test.ts`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add lib/notify/monitorWatermark.ts tests/notify/monitorWatermark.infra.test.ts tests/notify/_metaInfraContract.test.ts
git commit --no-verify -m "feat(notify): monitor-digest watermark read/write helpers (flow 6.2 §4.2)"
```

---

## Task 5: `buildMonitorDigestModel` — auto-applied query + window

Build the module skeleton + the window computation + the auto-applied roster/field query (signal 1). Autofix + drift queries land in Tasks 6-7; final assembly/empty in Task 8. This task delivers a `buildMonitorDigestModel` that returns `{ autoApplied, autofix:{total:0,...}, drift:[] }` (later tasks fill the other two).

**Files:**
- Create: `lib/notify/monitorDigest.ts`
- Modify: `tests/notify/_metaInfraContract.test.ts` (add `REGISTERED` row — SAME commit)
- Test (unit): `tests/notify/monitorDigest.window.test.ts`, `tests/notify/monitorDigest.autoApplied.test.ts`, `tests/notify/monitorDigest.filterParity.test.ts`
- Test (DB-integration filter proof): `tests/notify/monitorDigest.autoApplied.db.test.ts`

**Interfaces:**
- Consumes: `getMonitorDigestWatermark` (Task 4), `STRIP_KINDS` (Task 3), `DigestBuilderSql` (`lib/notify/digest.ts:11`).
- Produces (this task's partial surface; final shape in Task 8):
  - `MONITOR_FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000`
  - `type MonitorShowGroup = { showTitle: string | null; slug: string | null; items: string[] }`
  - `export function groupAutoApplied(rows): MonitorShowGroup[]` (pure helper, unit-tested directly)
  - `buildMonitorDigestModel(now: Date, deps?: { sql?: DigestBuilderSql; getWatermark?: typeof getMonitorDigestWatermark }): Promise<MonitorDigestResult>`

- [ ] **Step 1: Write the failing window test** (`tests/notify/monitorDigest.window.test.ts`)

```typescript
import { describe, expect, test } from "vitest";
import { buildMonitorDigestModel, MONITOR_FIRST_RUN_LOOKBACK_MS } from "@/lib/notify/monitorDigest";

// Recording sql: captures the bind params of each query so we can prove windowStart.
function recordingSql(rowsByCall: unknown[][] = []) {
  const calls: { params: unknown[] }[] = [];
  let i = 0;
  const fn = (async (_strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ params });
    return rowsByCall[i++] ?? [];
  }) as never;
  return { fn, calls };
}

function watermark(value: Date | null) {
  return async () => ({ kind: "value" as const, watermark: value });
}

describe("buildMonitorDigestModel — window (spec §4.3)", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  test("NULL watermark → windowStart bound as now - 24h in the first query", async () => {
    const { fn, calls } = recordingSql();
    await buildMonitorDigestModel(now, { sql: fn, getWatermark: watermark(null) });
    const expected = new Date(now.getTime() - MONITOR_FIRST_RUN_LOOKBACK_MS).toISOString();
    // Every query binds windowStart; assert the FIRST (auto-applied) carries now-24h, not `now`/epoch.
    expect(calls[0].params).toContain(expected);
    expect(MONITOR_FIRST_RUN_LOOKBACK_MS).toBe(24 * 60 * 60 * 1000);
  });
  test("non-NULL watermark → windowStart bound as the watermark", async () => {
    const wmDate = new Date("2026-07-08T06:00:00Z");
    const { fn, calls } = recordingSql();
    await buildMonitorDigestModel(now, { sql: fn, getWatermark: watermark(wmDate) });
    expect(calls[0].params).toContain(wmDate.toISOString());
  });
  test("watermark read infra_error → infra_error, no fabricated window (no query issued)", async () => {
    const { fn, calls } = recordingSql();
    const r = await buildMonitorDigestModel(now, {
      sql: fn,
      getWatermark: async () => ({ kind: "infra_error" as const }),
    });
    expect(r).toEqual({ kind: "infra_error" });
    expect(calls).toHaveLength(0); // fail-closed: no query on watermark fault
  });
});
```

- [ ] **Step 2: Write the failing auto-applied test** (`tests/notify/monitorDigest.autoApplied.test.ts`)

This is the **query-shape** unit test (NOT an exclusion test — the fake `sql` bypasses filtering, so asserting excluded rows drop here would tautologically fail a correct impl). It asserts (a) the QUERY TEXT contains each required predicate (`source`, `auto_apply`, `status`, `acknowledged_at is null`, `change_kind`, `occurred_at >`), (b) the `windowStart` bind param is present, and (c) the returned rows are grouped/mapped correctly. **Row-level exclusion (acked/pre-window/manual/off-list/non-applied) is proven ONLY by the `.db.test.ts` in Step 7**, never by the fake sql.

```typescript
import { describe, expect, test } from "vitest";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";

function recordingSql(rowsByCall: unknown[][]) {
  const calls: { text: string; params: unknown[] }[] = [];
  let i = 0;
  const fn = (async (strings: TemplateStringsArray, ...params: unknown[]) => {
    calls.push({ text: strings.join("?"), params });
    return rowsByCall[i++] ?? [];
  }) as never;
  return { fn, calls };
}

describe("buildMonitorDigestModel — auto-applied (spec §3)", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  test("query carries the Flow-4 security predicates + windowStart; rows group by show", async () => {
    const rows = [
      { show_id: "s1", slug: "east", title: "East Coast", summary: "Added Jane Doe", occurred_at: "2026-07-08T10:00:00Z" },
      { show_id: "s1", slug: "east", title: "East Coast", summary: "Renamed Bob", occurred_at: "2026-07-08T09:00:00Z" },
    ];
    const { fn, calls } = recordingSql([rows, [], []]); // autoApplied, (autofix), (drift)
    const wm = async () => ({ kind: "value" as const, watermark: new Date("2026-07-08T00:00:00Z") });
    const r = await buildMonitorDigestModel(now, { sql: fn, getWatermark: wm });
    const q = calls[0].text.toLowerCase();
    expect(q).toContain("show_change_log");
    expect(q).toContain("source");
    expect(q).toContain("auto_apply");
    expect(q).toContain("acknowledged_at is null");
    expect(q).toContain("status");
    expect(calls[0].params).toContain(new Date("2026-07-08T00:00:00Z").toISOString());
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.model.autoApplied).toEqual([
      { showTitle: "East Coast", slug: "east", items: ["Added Jane Doe", "Renamed Bob"] },
    ]);
  });
});
```

- [ ] **Step 3: Write the failing filter-parity test** (`tests/notify/monitorDigest.filterParity.test.ts`)

```typescript
import { describe, expect, test } from "vitest";
import { STRIP_KINDS } from "@/lib/admin/loadRecentAutoApplied";
import { MONITOR_AUTO_APPLY_KINDS } from "@/lib/notify/monitorDigest";

describe("monitor auto-apply filter parity (spec §13.3)", () => {
  test("monitor uses the SAME change-kind allow-list as the in-app strip", () => {
    expect([...MONITOR_AUTO_APPLY_KINDS]).toEqual([...STRIP_KINDS]);
  });
});
```

- [ ] **Step 4: Run to verify all three fail**

Run: `pnpm vitest run tests/notify/monitorDigest.window.test.ts tests/notify/monitorDigest.autoApplied.test.ts tests/notify/monitorDigest.filterParity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `lib/notify/monitorDigest.ts`** (partial — auto-applied only; autofix/drift stubbed to empty, filled in Tasks 6-7)

```typescript
import postgres from "postgres";
import { STRIP_KINDS } from "@/lib/admin/loadRecentAutoApplied";
import type { AutoFixSummary } from "@/lib/parser/dataGaps";
import { getMonitorDigestWatermark } from "@/lib/notify/monitorWatermark";
import type { DigestBuilderSql } from "@/lib/notify/digest";

export const MONITOR_FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const MONITOR_AUTO_APPLY_KINDS = STRIP_KINDS;

export type MonitorShowGroup = { showTitle: string | null; slug: string | null; items: string[] };
export type MonitorDriftEntry = { showTitle: string | null; slug: string | null; classes: { label: string; prior: number; curr: number }[] };
export type MonitorDigestModel = {
  windowStart: string;
  autoApplied: MonitorShowGroup[];
  autofix: AutoFixSummary;
  drift: MonitorDriftEntry[];
};
export type MonitorDigestResult =
  | { kind: "ok"; model: MonitorDigestModel }
  | { kind: "empty" }
  | { kind: "infra_error" };

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("monitor digest requires DATABASE_URL");
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

type AutoApplyRow = { show_id: string; slug: string | null; title: string | null; summary: string; occurred_at: string };

export async function buildMonitorDigestModel(
  now: Date,
  deps: { sql?: DigestBuilderSql; getWatermark?: typeof getMonitorDigestWatermark } = {},
): Promise<MonitorDigestResult> {
  const getWatermark = deps.getWatermark ?? getMonitorDigestWatermark;
  const wm = await getWatermark();
  if (wm.kind === "infra_error") return { kind: "infra_error" };
  const windowStart = wm.watermark ?? new Date(now.getTime() - MONITOR_FIRST_RUN_LOOKBACK_MS);
  const windowIso = windowStart.toISOString();

  const sql =
    deps.sql ??
    (postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false }) as DigestBuilderSql);
  const ownsConnection = !deps.sql;

  try {
    const autoRows = await sql<AutoApplyRow>`
      select scl.show_id, s.slug, s.title, scl.summary, scl.occurred_at
        from public.show_change_log scl
        join public.shows s on s.id = scl.show_id
       where scl.source = 'auto_apply'
         and scl.status = 'applied'
         and scl.acknowledged_at is null
         and scl.change_kind = any(${[...MONITOR_AUTO_APPLY_KINDS]}::text[])
         and scl.occurred_at > ${windowIso}
       order by scl.occurred_at desc
    `;
    const autoApplied = groupAutoApplied(autoRows);

    // Autofix + drift filled in Tasks 6-7.
    const autofix: AutoFixSummary = { total: 0, classes: {} as AutoFixSummary["classes"] };
    const drift: MonitorDriftEntry[] = [];

    if (autoApplied.length === 0 && autofix.total === 0 && drift.length === 0) {
      return { kind: "empty" };
    }
    return { kind: "ok", model: { windowStart: windowIso, autoApplied, autofix, drift } };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (ownsConnection) await sql.end?.({ timeout: 5 });
  }
}

export function groupAutoApplied(rows: AutoApplyRow[]): MonitorShowGroup[] {
  const groups = new Map<string, MonitorShowGroup>();
  for (const r of rows) {
    const g = groups.get(r.show_id) ?? { showTitle: r.title, slug: r.slug, items: [] };
    g.items.push(r.summary);
    groups.set(r.show_id, g);
  }
  return [...groups.values()];
}
```

- [ ] **Step 5b: Add a DIRECT pure-helper unit test** to `tests/notify/monitorDigest.autoApplied.test.ts` (proves grouping independent of SQL):

```typescript
import { groupAutoApplied } from "@/lib/notify/monitorDigest";

test("groupAutoApplied groups by show_id, preserves row order within a show", () => {
  const groups = groupAutoApplied([
    { show_id: "s1", slug: "east", title: "East", summary: "Added Jane", occurred_at: "t2" },
    { show_id: "s1", slug: "east", title: "East", summary: "Renamed Bob", occurred_at: "t1" },
    { show_id: "s2", slug: "west", title: "West", summary: "Removed Al", occurred_at: "t3" },
  ] as never);
  expect(groups).toEqual([
    { showTitle: "East", slug: "east", items: ["Added Jane", "Renamed Bob"] },
    { showTitle: "West", slug: "west", items: ["Removed Al"] },
  ]);
});
```

> Note (implementer): `AutoFixSummary["classes"]` is `Record<AutoFixCode, number>`; the `{}` cast is a placeholder replaced by a real zero-record in Task 6. If typecheck complains before Task 6, import `summarizeAutoFixes` and seed `summarizeAutoFixes([]).classes`.

- [ ] **Step 6: Register in the notify infra meta-test** — add to `REGISTERED`:

```typescript
  { path: "lib/notify/monitorDigest.ts" },
```

- [ ] **Step 7: Write the DB-integration filter proof** (`tests/notify/monitorDigest.autoApplied.db.test.ts`) — real local Postgres, skip if down (pattern per `tests/sync/ignoredWarningsOrphanGc.db.test.ts:16-38`). Seed one published show + `show_change_log` rows: ONE eligible (`source='auto_apply', status='applied', acknowledged_at NULL, change_kind='crew_added', occurred_at > windowStart`) and FIVE excluded — (i) `acknowledged_at` set, (ii) `occurred_at < windowStart`, (iii) `source='undo'` (a valid non-`auto_apply` source — the CHECK allows `auto_apply|mi11_approve|mi11_reject|undo`, `20260608000001_show_change_log.sql:26`), (iv) `change_kind='some_other_kind'`, (v) **`status='undone'`** (a valid non-`applied` status — the CHECK allows `applied|pending|rejected|undone|superseded`, `:29`; proves the `status='applied'` predicate, which the other four rows do NOT). Run `buildMonitorDigestModel(now, { getWatermark: () => watermark })` with the REAL default `sql` (point it at the seeded DB via `TEST_DATABASE_URL`/local). Assert `model.autoApplied` contains ONLY the eligible row's summary. Delete the seeded rows in `afterAll` (or wrap in a rolled-back tx). This proves the `WHERE` filters that the unit test's canned rows cannot.

- [ ] **Step 8: Run tests**

Run: `pnpm vitest run tests/notify/monitorDigest.window.test.ts tests/notify/monitorDigest.autoApplied.test.ts tests/notify/monitorDigest.filterParity.test.ts tests/notify/monitorDigest.autoApplied.db.test.ts tests/notify/_metaInfraContract.test.ts`
Expected: PASS (the `.db.test.ts` runs against local Postgres — confirm it does NOT skip; if it skips, the local DB is down — start it before proceeding).

- [ ] **Step 9: Commit**

```bash
git add lib/notify/monitorDigest.ts tests/notify/monitorDigest.window.test.ts tests/notify/monitorDigest.autoApplied.test.ts tests/notify/monitorDigest.filterParity.test.ts tests/notify/monitorDigest.autoApplied.db.test.ts tests/notify/_metaInfraContract.test.ts
git commit --no-verify -m "feat(notify): monitor-digest builder — window + auto-applied query (flow 6.2 §3,§4.3)"
```

---

## Task 6: Autocorrect roll-up (signal 2)

Add the autocorrect query to `buildMonitorDigestModel`: `sync_log ⋈ shows ON drive_file_id WHERE shows.published AND status='applied' AND occurred_at > windowStart`, summing `summarizeAutoFixes` over each row's `parse_warnings`.

**Files:**
- Modify: `lib/notify/monitorDigest.ts` (add `export function accumulateAutoFixes` + the autofix query)
- Test (unit): `tests/notify/monitorDigest.autofix.test.ts` (pure `accumulateAutoFixes` + assembled-model)
- Test (DB filter proof): `tests/notify/monitorDigest.autofix.db.test.ts`

**Interfaces:**
- Consumes: `summarizeAutoFixes` (`lib/parser/dataGaps.ts:119`), `AutoFixSummary`, `AUTO_FIX_CLASSES`, `AutoFixCode`.
- Produces: `export function accumulateAutoFixes(rows): AutoFixSummary`; `model.autofix: AutoFixSummary`.

- [ ] **Step 1: Write the failing test** (`tests/notify/monitorDigest.autofix.test.ts`) — spec §13.4

```typescript
import { describe, expect, test } from "vitest";
import { accumulateAutoFixes } from "@/lib/notify/monitorDigest";

describe("accumulateAutoFixes (spec §3, §13.4)", () => {
  test("counts only autocorrect classes across rows; skips leading payload object", () => {
    const rows = [
      {
        parse_warnings: [
          { kind: "delta", outcome: "applied", code: null }, // payload object — skipped (no severity)
          { code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: "a" },
          { code: "FIELD_UNREADABLE", severity: "warn", message: "gap" }, // not an autofix
        ],
      },
      {
        parse_warnings: [
          { code: "STAGE_WORD_AUTOCORRECTED", severity: "warn", message: "b" },
          { code: "ROLE_TOKEN_AUTOCORRECTED", severity: "warn", message: "c" },
        ],
      },
    ];
    const s = accumulateAutoFixes(rows);
    expect(s.total).toBe(3);
    expect(s.classes.STAGE_WORD_AUTOCORRECTED).toBe(2);
    expect(s.classes.ROLE_TOKEN_AUTOCORRECTED).toBe(1);
    expect(s.classes.FIELD_LABEL_AUTOCORRECTED).toBe(0);
  });
  test("empty rows → total 0", () => {
    expect(accumulateAutoFixes([]).total).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/notify/monitorDigest.autofix.test.ts`
Expected: FAIL — `accumulateAutoFixes` not exported yet.

- [ ] **Step 3: Implement** — in `monitorDigest.ts`, add the query + aggregation. Import `summarizeAutoFixes`. Replace the autofix stub:

```typescript
type WarningsRow = { drive_file_id: string; parse_warnings: unknown[]; occurred_at: string };

const autofixRows = await sql<WarningsRow>`
  select sl.drive_file_id, sl.parse_warnings, sl.occurred_at
    from public.sync_log sl
    join public.shows s on s.drive_file_id = sl.drive_file_id
   where s.published = true
     and sl.status = 'applied'
     and sl.occurred_at > ${windowIso}
`;
const autofix = accumulateAutoFixes(autofixRows);
```

with the helper (import `summarizeAutoFixes`, `AUTO_FIX_CLASSES`, `type AutoFixCode` from `@/lib/parser/dataGaps`):

```typescript
export function accumulateAutoFixes(rows: { parse_warnings: unknown[] }[]): AutoFixSummary {
  const classes = Object.fromEntries(AUTO_FIX_CLASSES.map((c) => [c.code, 0])) as AutoFixSummary["classes"];
  let total = 0;
  for (const row of rows) {
    const s = summarizeAutoFixes(row.parse_warnings as never);
    total += s.total;
    for (const c of AUTO_FIX_CLASSES) classes[c.code] += s.classes[c.code];
  }
  return { total, classes };
}
```

The Task-6 unit test (`tests/notify/monitorDigest.autofix.test.ts`, Step 1) tests `accumulateAutoFixes` **directly** (import it), injecting rows whose `parse_warnings` include a leading payload object + mixed autocorrect/gap warnings, asserting the payload is skipped and only autocorrect classes are summed — rather than routing through `buildMonitorDigestModel`. (The `.db.test.ts`, Step 4, covers the SQL filter separately.)

Update the initial `autofix` stub line to `let autofix: AutoFixSummary = accumulateAutoFixes([]);` before the query, then reassign; and replace the Task-5 placeholder `const autofix = { total: 0, classes: {} ... }` accordingly.

- [ ] **Step 4: Write the DB filter proof** (`tests/notify/monitorDigest.autofix.db.test.ts`) — seed a PUBLISHED show with an applied `sync_log` row whose `parse_warnings` contains 2× `STAGE_WORD_AUTOCORRECTED`; plus excluded rows: (i) same show, `status='drive_error'` (non-applied) with an autocorrect warning, (ii) an applied row for an UNPUBLISHED show, (iii) an applied row whose `drive_file_id` matches NO `shows` row. Run `buildMonitorDigestModel` with real `sql`; assert `model.autofix.total === 2` (only the eligible row counted). Clean up in `afterAll`. Proves `status='applied' AND s.published AND join`.

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/notify/monitorDigest.autofix.test.ts tests/notify/monitorDigest.autofix.db.test.ts tests/notify/monitorDigest.autoApplied.test.ts`
Expected: PASS (autoApplied unaffected; `.db.test.ts` must not skip).

- [ ] **Step 6: Commit**

```bash
git add lib/notify/monitorDigest.ts tests/notify/monitorDigest.autofix.test.ts tests/notify/monitorDigest.autofix.db.test.ts
git commit --no-verify -m "feat(notify): monitor-digest autocorrect roll-up (flow 6.2 §3 signal 2)"
```

---

## Task 7: Sub-threshold drift (signal 3)

Add the drift computation (spec §3.1): per published show, baseline (latest applied row `occurred_at <= windowStart`) vs current (latest applied row `occurred_at > windowStart`); report iff summaries differ on a non-`gateExempt` `GapCode` AND `isQualityRegression===false`. Skip shows with no baseline or no in-window row.

**Files:**
- Modify: `lib/notify/monitorDigest.ts` (add `export function computeDrift` + the drift query)
- Test (unit): `tests/notify/monitorDigest.drift.test.ts` (pure `computeDrift` + assembled-model)
- Test (DB filter proof): `tests/notify/monitorDigest.drift.db.test.ts`

**Interfaces:**
- Consumes: `summarizeDataGaps`, `isQualityRegression`, `GAP_CLASSES`, `type DataGapsSummary` (`lib/parser/dataGaps.ts`), `REGRESSION_ABS_JUMP`/`REGRESSION_REL_FACTOR`/`REGRESSION_REL_ABS_FLOOR`.
- Produces: `export function computeDrift(rows): MonitorDriftEntry[]`; `model.drift: MonitorDriftEntry[]`.

- [ ] **Step 1: Write the failing test** (`tests/notify/monitorDigest.drift.test.ts`) — spec §13.5

Construct fixtures where the drift query returns, per show, a baseline row and a current row (the implementation issues ONE query ordered so it can pair them; the test seeds the query result). Cases derived from `regressionKind` (`dataGaps.ts:196-202`):
- (a) sub-threshold `FIELD_UNREADABLE 10→11` (`regressionKind===null`) → REPORTED (assert `regressionKind(10,11)===null` too).
- (b) `0→3` (new) → EXCLUDED.
- (c) `4→6` (worsened) → EXCLUDED.
- (d) no change → EXCLUDED.
- (e) `VENUE_GEOCODE_UNRESOLVED 0→2`, others flat → EXCLUDED (gateExempt).
- (f) no baseline row → SKIP.
- (g) non-applied / unpublished rows never enter the query (assert the query text filters `s.published` and `sl.status = 'applied'`).

```typescript
import { describe, expect, test } from "vitest";
import { regressionKind } from "@/lib/parser/dataGaps";
import { computeDrift } from "@/lib/notify/monitorDigest";

// Build a paired sync_log-shaped drift row (the query returns one baseline + one current per show).
function driftRow(driveFileId: string, slug: string, title: string, phase: "baseline" | "current", warnings: { code: string }[]) {
  return {
    drive_file_id: driveFileId, slug, title, phase,
    parse_warnings: warnings.map((w) => ({ ...w, severity: "warn", message: "x" })),
  };
}
const fillGap = (code: string, n: number) => Array(n).fill({ code });

describe("computeDrift (spec §3.1, §13.5)", () => {
  test("boundary derived from regressionKind", () => {
    expect(regressionKind(10, 11)).toBeNull();      // sub-threshold
    expect(regressionKind(0, 3)).toBe("new");        // regression
    expect(regressionKind(4, 6)).toBe("worsened");   // regression
  });

  test("reports genuine sub-threshold; excludes regression/gateExempt/no-baseline", () => {
    const rows = [
      // (a) sub-threshold 10→11 → REPORTED
      driftRow("f1", "east", "East", "baseline", fillGap("FIELD_UNREADABLE", 10)),
      driftRow("f1", "east", "East", "current", fillGap("FIELD_UNREADABLE", 11)),
      // (b) new 0→3 → EXCLUDED (regression)
      driftRow("f2", "west", "West", "baseline", []),
      driftRow("f2", "west", "West", "current", fillGap("FIELD_UNREADABLE", 3)),
      // (c) worsened 4→6 → EXCLUDED (regression)
      driftRow("f3", "north", "North", "baseline", fillGap("FIELD_UNREADABLE", 4)),
      driftRow("f3", "north", "North", "current", fillGap("FIELD_UNREADABLE", 6)),
      // (d) no change → EXCLUDED
      driftRow("f4", "south", "South", "baseline", fillGap("FIELD_UNREADABLE", 2)),
      driftRow("f4", "south", "South", "current", fillGap("FIELD_UNREADABLE", 2)),
      // (e) gateExempt-only movement → EXCLUDED
      driftRow("f5", "gx", "GX", "baseline", []),
      driftRow("f5", "gx", "GX", "current", fillGap("VENUE_GEOCODE_UNRESOLVED", 2)),
      // (f) no baseline (only current) → SKIP
      driftRow("f6", "nb", "NB", "current", fillGap("FIELD_UNREADABLE", 11)),
    ];
    const drift = computeDrift(rows as never);
    expect(drift.map((d) => d.slug)).toEqual(["east"]);
    expect(drift[0].classes).toEqual([{ label: "unreadable field", prior: 10, curr: 11 }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/notify/monitorDigest.drift.test.ts`
Expected: FAIL — `computeDrift` not exported yet.

- [ ] **Step 3: Implement** — drift query + pairing + comparison. The query selects, per published show with applied rows, the latest baseline and latest current (`distinct on` or window functions). Simplest robust form:

```sql
with applied as (
  select sl.drive_file_id, s.slug, s.title, sl.parse_warnings, sl.occurred_at,
         case when sl.occurred_at <= ${windowIso} then 'baseline' else 'current' end as phase
    from public.sync_log sl
    join public.shows s on s.drive_file_id = sl.drive_file_id
   where s.published = true and sl.status = 'applied'
),
ranked as (
  select *, row_number() over (partition by drive_file_id, phase order by occurred_at desc) as rn
    from applied
)
select drive_file_id, slug, title, phase, parse_warnings from ranked where rn = 1
```

Then in JS: group by `drive_file_id`, take `baseline`/`current` rows, `summarizeDataGaps` each, and apply the §3.1 report rule using `GAP_CLASSES` (skip `gateExempt`) and `isQualityRegression`. Produce `MonitorDriftEntry` with per-`GapCode` `{label, prior, curr}` for changed non-gateExempt classes. Skip shows missing a baseline or current row.

```typescript
import { summarizeDataGaps, isQualityRegression, GAP_CLASSES, type DataGapsSummary } from "@/lib/parser/dataGaps";

type DriftRow = { drive_file_id: string; slug: string | null; title: string | null; phase: "baseline" | "current"; parse_warnings: unknown[] };

export function computeDrift(rows: DriftRow[]): MonitorDriftEntry[] {
  const byShow = new Map<string, { slug: string | null; title: string | null; baseline?: DataGapsSummary; current?: DataGapsSummary }>();
  for (const r of rows) {
    const e = byShow.get(r.drive_file_id) ?? { slug: r.slug, title: r.title };
    const summary = summarizeDataGaps(r.parse_warnings as never);
    if (r.phase === "baseline") e.baseline = summary; else e.current = summary;
    byShow.set(r.drive_file_id, e);
  }
  const out: MonitorDriftEntry[] = [];
  for (const e of byShow.values()) {
    if (!e.baseline || !e.current) continue;               // §3.1 no-baseline/no-current guard
    if (isQualityRegression(e.baseline, e.current)) continue; // already RESYNC_QUALITY_REGRESSED
    const classes: MonitorDriftEntry["classes"] = [];
    for (const g of GAP_CLASSES) {
      if ((g as { gateExempt?: boolean }).gateExempt) continue; // §3.1 gateExempt exclusion
      const prior = e.baseline.classes[g.code];
      const curr = e.current.classes[g.code];
      if (prior !== curr) classes.push({ label: g.label, prior, curr });
    }
    if (classes.length > 0) out.push({ showTitle: e.title, slug: e.slug, classes });
  }
  return out;
}
```

Wire: `const drift = computeDrift(await sql<DriftRow>`...`);` replacing the Task-5 `drift` stub, and update the `empty`/`ok` gate to use the computed `drift`.

- [ ] **Step 4: Write the DB filter proof** (`tests/notify/monitorDigest.drift.db.test.ts`) — seed a PUBLISHED show with TWO applied `sync_log` rows (baseline `occurred_at <= windowStart` with 10× `FIELD_UNREADABLE`; current `occurred_at > windowStart` with 11×) → REPORTED. Plus THREE exclusion rows: (i) a NON-applied row (`status='drive_error'`) for the same show at the LATEST `occurred_at` — assert it does NOT become the current row (would zero the summary and fabricate drift); (ii) an UNPUBLISHED show with baseline+current drift → excluded (proves `s.published`); (iii) an **applied orphan** row whose `drive_file_id` matches NO `shows` row (`sync_log.drive_file_id` is NOT an FK — `20260501001000_internal_and_admin.sql:221` — so orphans are possible) with baseline+current gaps → excluded (proves the `JOIN shows ON drive_file_id` inner-join drops orphans). Run `buildMonitorDigestModel` with real `sql`; assert `model.drift` reports only the published show's `10→11`. Clean up in `afterAll`. Proves `status='applied' AND s.published AND the inner join` in the drift CTE (the round-3/4 contamination guard).

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/notify/monitorDigest.drift.test.ts tests/notify/monitorDigest.drift.db.test.ts tests/notify/monitorDigest.autofix.test.ts tests/notify/monitorDigest.autoApplied.test.ts tests/notify/monitorDigest.window.test.ts`
Expected: PASS (all; `.db.test.ts` must not skip).

- [ ] **Step 6: Commit**

```bash
git add lib/notify/monitorDigest.ts tests/notify/monitorDigest.drift.test.ts tests/notify/monitorDigest.drift.db.test.ts
git commit --no-verify -m "feat(notify): monitor-digest sub-threshold drift (flow 6.2 §3.1 signal 3)"
```

---

## Task 8: `buildMonitorDigestModel` infra behavioral + empty semantics

Pin the postgres.js `sql` fault → `infra_error` mapping (spec §13.8) and the `empty` return when all three signals are empty.

**Files:**
- Test: `tests/notify/monitorDigest.infra.test.ts`
- Modify: `lib/notify/monitorDigest.ts` only if a fault path is missed.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "vitest";
import { buildMonitorDigestModel } from "@/lib/notify/monitorDigest";

describe("buildMonitorDigestModel — infra + empty (spec §13.8)", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  const wm = async () => ({ kind: "value" as const, watermark: new Date("2026-07-08T00:00:00Z") });
  test("a throwing sql query → infra_error", async () => {
    const sql = (async () => { throw new Error("db down"); }) as never;
    expect(await buildMonitorDigestModel(now, { sql, getWatermark: wm })).toEqual({ kind: "infra_error" });
  });
  test("all three signals empty → empty", async () => {
    const sql = (async () => []) as never;
    expect(await buildMonitorDigestModel(now, { sql, getWatermark: wm })).toEqual({ kind: "empty" });
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/notify/monitorDigest.infra.test.ts`
Expected: PASS if Tasks 5-7 already return `infra_error` on `catch` and `empty` on all-empty (they do). If FAIL, fix `monitorDigest.ts` to satisfy.

- [ ] **Step 3: Commit**

```bash
git add tests/notify/monitorDigest.infra.test.ts lib/notify/monitorDigest.ts
git commit --no-verify -m "test(notify): monitor-digest builder infra + empty semantics (flow 6.2 §13.8)"
```

---

## Task 9: `renderDigest` monitor section

Add the "Applied automatically since your last digest" section to `renderDigest` (spec §8). Absent when `monitor` is null/absent → output byte-identical to today.

**Files:**
- Modify: `lib/notify/templates/digest.ts`
- Test: `tests/notify/renderDigest.monitor.test.ts`

**Interfaces:**
- Consumes: `MonitorDigestModel` (Task 5), `AUTO_FIX_CLASSES`/`GAP_CLASSES` labels.
- Produces: `DigestInput` gains optional `monitor?: MonitorDigestModel`; subject switches when needs-attention empty + monitor present.

- [ ] **Step 1: Write the failing test** (`tests/notify/renderDigest.monitor.test.ts`) — spec §13.6

Cases: (a) `monitor` absent → identical to a pre-6.2 snapshot; (b) monitor present + needs-attention empty (`shows:[]`) → renders the monitor section + monitor subject; (c) no raw code token (`*_AUTOCORRECTED`/`GapCode`) in output — clone tree, assert only labels; (d) caps 13 shows/6 rows → `+1 more`/`+1 more shows`; (e) escape `<script>` in a show title.

```typescript
import { describe, expect, test } from "vitest";
import { renderDigest } from "@/lib/notify/templates/digest";

const origin = "https://x.test";
const monitor = {
  windowStart: "2026-07-08T00:00:00Z",
  autoApplied: [{ showTitle: "East Coast", slug: "east", items: ["Added Jane Doe"] }],
  autofix: { total: 2, classes: { STAGE_WORD_AUTOCORRECTED: 2, ROLE_TOKEN_AUTOCORRECTED: 0, COLUMN_HEADER_AUTOCORRECTED: 0, SECTION_HEADER_AUTOCORRECTED: 0, FIELD_LABEL_AUTOCORRECTED: 0 } },
  drift: [{ showTitle: "West", slug: "west", classes: [{ label: "unreadable field", prior: 10, curr: 11 }] }],
} as never;

describe("renderDigest — monitor section (spec §8, §13.6)", () => {
  test("absent monitor → no section, subject unchanged", () => {
    const r = renderDigest({ origin, shows: [{ showTitle: "S", slug: "s", items: ["needs review"] }] });
    expect(r.html).not.toContain("Applied automatically");
    expect(r.subject).toContain("shows need attention");
  });
  test("monitor present, needs-attention empty → section + monitor subject", () => {
    const r = renderDigest({ origin, shows: [], monitor });
    expect(r.html).toContain("Applied automatically since your last digest");
    expect(r.text).toContain("Applied automatically since your last digest");
    expect(r.subject).toContain("automatic changes to review");
  });
  test("no raw code token appears (invariant 5)", () => {
    const r = renderDigest({ origin, shows: [], monitor });
    expect(r.html).not.toMatch(/AUTOCORRECTED|FIELD_UNREADABLE/);
    expect(r.html).toContain("corrected stage word"); // AUTO_FIX_CLASSES label
  });
  test("escapes HTML in show titles", () => {
    const evil = { ...monitor, autoApplied: [{ showTitle: "<script>x</script>", slug: "s", items: ["a"] }] };
    const r = renderDigest({ origin, shows: [], monitor: evil });
    expect(r.html).not.toContain("<script>x</script>");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/notify/renderDigest.monitor.test.ts`
Expected: FAIL — monitor section not rendered.

- [ ] **Step 3: Implement** — extend `DigestInput` with `monitor?: MonitorDigestModel`; after the needs-attention block, append the section (per spec §8: header, 3 sub-blocks each omitted when empty, caps via `DIGEST_MAX_SHOWS`/`DIGEST_MAX_ITEMS_PER_SHOW`, labels not codes, `escapeHtml` on every dynamic value). Switch subject when `input.shows.length === 0 && monitor present`. Autofix roll-up line uses `AUTO_FIX_CLASSES` labels for nonzero classes; drift lines use each entry's `classes[].label`. (Full copy per spec §8.)

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/notify/renderDigest.monitor.test.ts` + the existing digest template test.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notify/templates/digest.ts tests/notify/renderDigest.monitor.test.ts
git commit --no-verify -m "feat(notify): renderDigest 'applied automatically' section (flow 6.2 §8)"
```

---

## Task 10: `deliverDigest` threads the monitor model

`deliverDigest` accepts an optional `monitor`, passes it to `renderDigest`, and records `monitor_totals` (counts only, no PII) in the delivery `context`. Dedup key unchanged (`digest:${dateET}`).

**Files:**
- Modify: `lib/notify/deliver.ts` (`deliverDigest`, `:459-...`)
- Test: `tests/notify/deliver.digest.monitor.test.ts` (or extend existing deliver test)

**Interfaces:**
- Consumes: `MonitorDigestModel`.
- Produces: `deliverDigest(input: { model: DigestModel; origin: string; monitor?: MonitorDigestModel | null }, deps?)`.

- [ ] **Step 1: Write the failing test** — three cases:
  - (a) monitor present → `renderDigest` receives it (email contains the section) AND recorded `context` = `{ date_et, source_totals, monitor_totals: { autoAppliedShows, autoAppliedRows, autofixTotal, driftShows } }` with no crew PII.
  - (b) **monitor absent/null → context is BYTE-IDENTICAL to today** (`{ date_et, source_totals }`, NO `monitor_totals` key). This guards the existing exact-context assertion (`tests/notify/deliver.test.ts:570-573`) which does an exact `context: { date_et, source_totals }` match — an unconditional `monitor_totals` add would break it.
  - (c) `dedupKey` still `digest:${dateET}` in both cases.

- [ ] **Step 2: Run → FAIL** (`deliverDigest` doesn't accept `monitor` yet).

- [ ] **Step 3: Implement** — add optional `monitor?: MonitorDigestModel | null` to `input`; pass `renderDigest({ origin, shows: model.shows, monitor: input.monitor ?? undefined })`; extend `context` **conditionally** so the null-monitor path is unchanged:

```typescript
context: {
  date_et: input.model.dateET,
  source_totals: input.model.sourceTotals,
  ...(input.monitor
    ? {
        monitor_totals: {
          autoAppliedShows: input.monitor.autoApplied.length,
          autoAppliedRows: input.monitor.autoApplied.reduce((n, g) => n + g.items.length, 0),
          autofixTotal: input.monitor.autofix.total,
          driftShows: input.monitor.drift.length,
        },
      }
    : {}),
},
```

- [ ] **Step 4: Run the new test + the existing deliver suite** — `pnpm vitest run tests/notify/deliver.test.ts <new test>`. Expected: PASS (the existing `:570` exact-context test stays green because null-monitor omits `monitor_totals`).

- [ ] **Step 5: Commit** — `feat(notify): deliverDigest threads monitor section + records monitor_totals (flow 6.2 §5,§8)`

---

## Task 11: `runDigestNotify` wiring — compute once, send-condition, watermark advance

Wire the monitor into the digest run (spec §4.4, §5): compute `buildMonitorDigestModel(now)` ONCE before the recipient loop; change the send condition; accumulate `{sent,failed,skipped,retryLater}`; advance the watermark iff `monitor.kind==='ok' && sent>0 && failed===0 && retryLater===0`.

**Files:**
- Modify: `lib/notify/runNotify.ts` (`runDigestNotify`, `:398-457`; add `buildMonitorDigestModel` + `writeMonitorDigestWatermark` to `NotifyDeps`)
- Modify (regression): `tests/notify/run-notify.test.ts` — its `baseDeps` (`:11`) injects `buildDigestModel`/`deliverDigest` but NO monitor deps; add default stubs there and update the digest event-order assertion (`:552`), or the existing `runDigestNotify` tests fall through to the REAL `buildMonitorDigestModel` (hits the DB) and the event sequence changes. **This is a required part of Task 11, not optional.**
- Test (new): `tests/notify/runDigestNotify.monitor.test.ts`

- [ ] **Step 0: Update `baseDeps` in `tests/notify/run-notify.test.ts`** — add to the returned `NotifyDeps`:

```typescript
    buildMonitorDigestModel: async () => {
      events.push("build-monitor");
      return { kind: "empty" as const };
    },
    writeMonitorDigestWatermark: async () => {
      events.push("write-watermark");
      return { kind: "ok" as const };
    },
```

Then update the existing digest event-order assertion (`:552`) to include `"build-monitor"` in the correct position (after `recipients`, before/around `build-digest` per the implemented order). Run `pnpm vitest run tests/notify/run-notify.test.ts` and adjust the expected event array to match the new order. (Do this FIRST so the existing suite stays green as you wire the implementation.)

- [ ] **Step 1: Write the failing test** (`tests/notify/runDigestNotify.monitor.test.ts`) — spec §13.7 cases (a)-(h):
  - (a) needs-attention `no_send` + monitor `ok` → one email sent, watermark advanced once.
  - (b) two recipients → `buildMonitorDigestModel` invoked ONCE, watermark advanced ONCE to `now`.
  - (c) delivery `failed>0` OR `retryLater>0` → watermark NOT advanced.
  - (d) monitor empty + needs-attention empty → no send, watermark unchanged.
  - (e) watermark write `infra_error` after send → delivery `infra_error`.
  - (f) recipient A `sent`, B `skipped` → watermark ADVANCED (skipped non-blocking).
  - (g) all recipients `skipped`, `sent===0` → watermark NOT advanced.
  - (h) monitor `infra_error` → needs-attention still sent, watermark untouched, run is delivery `infra_error`.

  Inject deps: `buildMonitorDigestModel`, `buildDigestModel`, `deliverDigest`, `writeMonitorDigestWatermark`, `activeRecipients`, `getDailyReviewDigest`, `configValid`. Use `now` inside the 7-10am ET digest window. Spy on `buildMonitorDigestModel` call count (assert === 1 for case b).

- [ ] **Step 2: Run → FAIL** (monitor not wired).

- [ ] **Step 3: Implement** in `runDigestNotify` (add `buildMonitorDigestModel`/`writeMonitorDigestWatermark` to `NotifyDeps`):
  - After the toggle/recipients checks, before the loop: `const monitor = await (deps.buildMonitorDigestModel ?? buildMonitorDigestModel)(now);`
  - If `monitor.kind === 'infra_error'` → set a flag `monitorInfra = true` (still run the loop with `monitor = null`, deliver needs-attention only), and at the end return delivery `infra_error` source `buildMonitorDigestModel`.
  - Loop: `const model = await buildDigestModel(recipient, now);` send iff `model.kind==='ok' || monitorOk`. When `model.kind==='no_send' && !monitorOk` → continue. When monitor-only, pass `{ recipient, dateET: dateET(now), shows: [], sourceTotals: {ingestions:0,syncs:0,shows:0} }` as the needs-attention model (synthesize empty).
  - `const delivered = await deliverDigest({ model: theModel, origin, monitor: monitorOk ? monitor.model : null });` accumulate `sent/failed/skipped/retryLater`.
  - After loop: if `monitorOk && totals.sent>0 && totals.failed===0 && totals.retryLater===0` → `const w = await writeMonitorDigestWatermark(now); if (w.kind==='infra_error') return delivery infra_error source 'writeMonitorDigestWatermark'`.
  - If `monitorInfra` → return delivery `infra_error` source `buildMonitorDigestModel` (unless already returned).

  > Note: `dateET` is currently computed inside `buildDigestModel`; expose a small `dateET(now)` helper (already in `lib/notify/digest.ts:64` as a private fn) or replicate the ET formatting for the synthesized empty model. Simplest: export `dateET` from `digest.ts` and reuse.

- [ ] **Step 4: Run → PASS** (all 8 cases).

- [ ] **Step 5: Full suite + build**

Run: `pnpm vitest run tests/notify/ tests/sync/syncLogSink.persistence.test.ts tests/sync/_metaInfraContract.test.ts tests/notify/_metaInfraContract.test.ts` then `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit** — `feat(notify): wire monitor section into runDigestNotify + watermark advance (flow 6.2 §4.4,§5)`

---

## Task 12: Full verification gate

- [ ] **Step 1:** `pnpm test` (full suite — scoped gates miss regressions). Expected: PASS.
- [ ] **Step 2:** `pnpm typecheck`. Expected: no errors.
- [ ] **Step 3:** `pnpm lint`. Expected: clean (canonical Tailwind / eslint).
- [ ] **Step 4:** `pnpm format:check`. Expected: clean (`--no-verify` bypassed the prettier hook).
- [ ] **Step 5:** `pnpm build`. Expected: succeeds (RSC/action wiring).
- [ ] **Step 6:** Re-run the §14 companion sweep: `grep -rIn "insert into public.sync_log" lib` returns exactly the 7 writers; only `syncLog.ts` changed. Confirm.
- [ ] **Step 7:** Commit any fixes; if none, proceed to Stage 4 (whole-diff Codex review).

---

## Self-review checklist (author, before Codex plan review)

1. **Spec coverage:** §3 signal 1 → Task 5; §3 signal 2 → Task 6; §3.1 drift → Task 7; §3.2 sink fix → Task 2; §4 watermark → Tasks 1,4,11; §5 wiring → Tasks 9-11; §8 render → Task 9; §10/§11 meta → Tasks 4,5; §13 tests → Tasks 2,4-11. All covered.
2. **Placeholder scan:** every code step carries real code or a precise spec-cited derivation; no TBD/TODO.
3. **Type consistency:** `MonitorDigestModel`/`MonitorDigestResult`/`MonitorShowGroup`/`MonitorDriftEntry`/`AutoFixSummary` names consistent across Tasks 5-11; `buildMonitorDigestModel` signature stable.
4. **Anti-tautology:** autofix/drift tests assert against the builder's result model (data source), not the rendered email; drift thresholds derived from `regressionKind`, never hardcoded; render test clones tree to assert label-not-code.
