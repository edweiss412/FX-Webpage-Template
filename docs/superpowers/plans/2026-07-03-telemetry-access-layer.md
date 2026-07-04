# Telemetry Access Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only telemetry access layer — a canonical `lib/observe/query` read-core plus a `pnpm observe` CLI — so devs and agents can query `app_events`, `admin_alerts`, cron health, and `show_change_log` without hand-rolling SQL.

**Architecture:** Four fresh, **non-logging** read functions in `lib/observe/query/` are the single schema-aware surface; a thin `scripts/observe.ts` CLI (arg-parse → core → format) is the only adapter in v1. Read-only is a hard structural guarantee pinned by a meta-test that bans writes AND `lib/log` imports in the core. MCP/remote surface is deferred.

**Tech Stack:** TypeScript, Next.js 16, `@supabase/supabase-js` (service-role client), Node `parseArgs` (`node:util`), Vitest, `tsx`.

**Spec:** `docs/superpowers/specs/2026-07-03-telemetry-access-layer-design.md` (Codex-APPROVED, 5 rounds).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task**, conventional-commits: `<type>(observe): <summary>` (`feat`/`test`/`docs`/`chore`). One task per commit. Use `git commit --no-verify` (shared lint-staged hook belongs to the main checkout).
- **Read-only, hard guarantee:** every `lib/observe/query/**` file issues only `.select(...)`; NO `.insert/.update/.delete/.upsert/.rpc`, and NO import of `lib/log`/`persistAppEvent` (invariant: reading telemetry must never write it).
- **Supabase call-boundary discipline** (invariant 9): each query fn constructs `createSupabaseServiceRoleClient()` internally inside one `try`, destructures `{ data, error }`, maps returned-`{error}` → `{ kind:"infra_error", message }` and thrown → `{ kind:"infra_error", message }`. Every fn gets a row in `tests/admin/_metaInfraContract.test.ts`.
- **No new env-var names.** The read-core uses `createSupabaseServiceRoleClient` (reads `SUPABASE_URL` default `http://127.0.0.1:54321`, `SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY`). `--env` is a guardrail assertion over the ambient `SUPABASE_URL`.
- **PII exclusions:** `queryAlerts` never selects `admin_alerts.context`; `queryChangeLog` never selects `before_image`/`after_image`.
- **No global sync cursor** (invariant 4): `tail`'s cursor is process-local, ephemeral, never persisted.
- **Non-UI:** nothing under `app/`/`components/`; impeccable dual-gate (invariant 8) is N/A.
- **`node:util` `parseArgs`** for CLI arg-parsing — no external CLI lib.
- Verify before push: `pnpm typecheck` (vitest strips types), `pnpm test`, `pnpm format:check`.

## Meta-test inventory (declared per writing-plans additions)

- **CREATE** `tests/observe/_metaReadOnlyQueryCore.test.ts` — walks `lib/observe/query/**`, asserts no write builders + no `lib/log` import.
- **EXTEND** `tests/admin/_metaInfraContract.test.ts` — 4 registry rows + behavioral blocks (`queryEvents`, `getCronHealth`, `queryAlerts`, `queryChangeLog`).
- **EXTEND** `tests/admin/_metaBoundedReads.test.ts` — add the 4 modules to `READ_MODULES`, add `app_events`/`admin_alerts`/`show_change_log` to `UNBOUNDED_TABLES`.
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched (read-only).

## File structure

**Read-core (`lib/observe/query/`):**
- `types.ts` — shared filter/result types for the NEW reads (`AlertFilters`, `AlertRow`, `QueryAlertsResult`, `ChangeLogFilters`, `ChangeRow`, `QueryChangeLogResult`), plus `UUID_RE` + `isUuid` + `clampLimit`. (`QueryEventsResult` and `QueryCronHealthResult` are defined and exported from `events.ts`/`cronHealth.ts` respectively, and re-exported by the barrel.)
- `events.ts` — `queryEvents(filters)` (fresh no-log copy of `loadAppEvents`).
- `cronHealth.ts` — `getCronHealth()` (fresh no-log copy of `loadCronHealth`).
- `alerts.ts` — `queryAlerts(filters)` (new `admin_alerts` list read).
- `changeLog.ts` — `queryChangeLog(filters)` (new `show_change_log` read).
- `index.ts` — public surface, re-exports the four fns + types.

**CLI (`scripts/observe/` + `scripts/observe.ts`):**
- `scripts/observe/env.ts` — `resolveTarget(env)` guardrail (pure).
- `scripts/observe/args.ts` — `parseObserveArgs(argv)` (pure).
- `scripts/observe/collect.ts` — `collectEvents(queryFn, base, limit)` pagination (pure over an injected `queryFn`).
- `scripts/observe/format.ts` — table + json/ndjson renderers (pure).
- `scripts/observe.ts` — entry: dispatch → core → format → exit; direct-run guard.

**Docs / tests / config:**
- `AGENTS.md` — new "Telemetry access (observe CLI)" section (TRACKED).
- `.claude/skills/observe/SKILL.md` — per-machine convenience (UNtracked; `.gitignore:54` ignores `.claude/`).
- `package.json` — add `"observe": "tsx scripts/observe.ts"`.
- `tests/observe/*.test.ts` — unit + meta + db tests.

---

### Task 1: `queryEvents` — fresh no-log read of `app_events`

**Files:**
- Create: `lib/observe/query/types.ts`, `lib/observe/query/events.ts`
- Test: `tests/observe/queryEvents.test.ts`

**Interfaces:**
- Produces: `queryEvents(filters: AppEventFilters): Promise<QueryEventsResult>` where
  `QueryEventsResult = { kind:"ok"; events: AppEventRow[]; hasMore: boolean; nextCursor: AppEventCursor|null } | { kind:"infra_error"; message: string }`.
  Also `clampLimit(n: number|undefined, def: number): number`, `isUuid(s: string): boolean` from `types.ts`.
- Consumes: `AppEventFilters`, `AppEventRow`, `AppEventCursor`, `PAGE_SIZE`, `escapeIlike` from `@/lib/admin/observabilityTypes` (all exported); `createSupabaseServiceRoleClient` from `@/lib/supabase/server`.

- [ ] **Step 1: Write the failing test.** `tests/observe/queryEvents.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from "vitest";

// Hoisted controllable mock of the service-role client.
const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  throwOnFrom: false,
  captured: { table: "", filters: [] as Array<[string, unknown]> },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (state.throwOnFrom) {
      return {
        from() {
          throw new Error("boom");
        },
      };
    }
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.from = (table: string) => {
      state.captured.table = table;
      return builder;
    };
    builder.select = chain;
    builder.in = (col: string, v: unknown) => {
      state.captured.filters.push([`in:${col}`, v]);
      return builder;
    };
    builder.eq = (col: string, v: unknown) => {
      state.captured.filters.push([`eq:${col}`, v]);
      return builder;
    };
    builder.gte = (col: string, v: unknown) => {
      state.captured.filters.push([`gte:${col}`, v]);
      return builder;
    };
    builder.ilike = (col: string, v: unknown) => {
      state.captured.filters.push([`ilike:${col}`, v]);
      return builder;
    };
    builder.or = (v: unknown) => {
      state.captured.filters.push([`or`, v]);
      return builder;
    };
    builder.order = chain;
    builder.limit = () => Promise.resolve({ data: state.rows, error: state.error });
    return builder as never;
  },
}));

afterEach(() => {
  state.rows = [];
  state.error = null;
  state.throwOnFrom = false;
  state.captured = { table: "", filters: [] };
  vi.resetModules();
});

function seedRow(over: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    occurred_at: "2026-07-03T00:00:00.000Z",
    level: "error",
    source: "cron.sync",
    message: "boom happened",
    code: "SOME_CODE",
    request_id: "req-1",
    show_id: null,
    drive_file_id: null,
    actor_hash: null,
    context: {},
    shows: null,
    ...over,
  };
}

describe("queryEvents", () => {
  test("maps rows and applies filters", async () => {
    state.rows = [seedRow()];
    const { queryEvents } = await import("@/lib/observe/query/events");
    // queryEvents mirrors loadAppEvents: it TRUSTS pre-validated AppEventFilters (the CLI's
    // parseObserveArgs / the UI's parseAppEventFilters UUID-guard showId upstream). Unlike
    // queryChangeLog, queryEvents does NOT self-guard showId. So a truthy showId is applied.
    const r = await queryEvents({ levels: ["error"], showId: "11111111-1111-1111-1111-111111111111", code: "SOME_CODE" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") throw new Error("unreachable");
    expect(state.captured.table).toBe("app_events");
    expect(r.events[0]).toMatchObject({ id: seedRow().id, level: "error", message: "boom happened" });
    const keys = state.captured.filters.map((f) => f[0]);
    expect(keys).toContain("in:level");
    expect(keys).toContain("eq:code");
    expect(keys).toContain("eq:show_id");
  });

  test("hasMore + nextCursor when a full page + 1 returns", async () => {
    state.rows = Array.from({ length: 101 }, (_, i) =>
      seedRow({ id: `1111111${String(i).padStart(11, "0")}`.slice(0, 36), occurred_at: `2026-07-0${(i % 9) + 1}T00:00:00.000Z` }),
    );
    const { queryEvents } = await import("@/lib/observe/query/events");
    const r = await queryEvents({});
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.length).toBe(100);
    expect(r.hasMore).toBe(true);
    expect(r.nextCursor).not.toBeNull();
  });

  test("returned {error} → infra_error (no throw)", async () => {
    state.error = { message: "db down" };
    const { queryEvents } = await import("@/lib/observe/query/events");
    expect(await queryEvents({})).toMatchObject({ kind: "infra_error" });
  });

  test("thrown → infra_error", async () => {
    state.throwOnFrom = true;
    const { queryEvents } = await import("@/lib/observe/query/events");
    const r = await queryEvents({});
    expect(r.kind).toBe("infra_error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `cd /Users/ericweiss/fxav-worktrees/telemetry-access-layer && pnpm vitest run tests/observe/queryEvents.test.ts` — Expected: FAIL (cannot import `@/lib/observe/query/events`).

- [ ] **Step 3: Create `lib/observe/query/types.ts`:**

```ts
// lib/observe/query/types.ts
// Module-private UUID guard (observabilityTypes' UUID_RE is NOT exported).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// Clamp a limit to [1, 500] with a command-specific default.
export function clampLimit(n: number | undefined, def: number): number {
  if (n === undefined || Number.isNaN(n)) return def;
  return Math.max(1, Math.min(500, Math.trunc(n)));
}

export type AlertFilters = { openOnly?: boolean; code?: string; limit?: number };
export type AlertRow = {
  id: string;
  showId: string | null;
  code: string;
  raisedAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  showTitle: string | null;
  showSlug: string | null;
};
export type QueryAlertsResult =
  | { kind: "ok"; alerts: AlertRow[] }
  | { kind: "infra_error"; message: string };

export type ChangeLogFilters = { showId?: string; sinceHours?: number | null; limit?: number };
export type ChangeRow = {
  id: string;
  showId: string;
  driveFileId: string;
  occurredAt: string;
  source: string;
  changeKind: string;
  entityRef: string | null;
  summary: string;
  status: string;
};
export type QueryChangeLogResult =
  | { kind: "ok"; changes: ChangeRow[] }
  | { kind: "infra_error"; message: string };
```

- [ ] **Step 4: Create `lib/observe/query/events.ts` by copying `loadAppEvents` verbatim, minus logging.**

Open `lib/admin/loadAppEvents.ts`. Copy the `SELECT` constant, `applyCursor` helper, the row-mapping, and the function body into `queryEvents`, with these changes ONLY: (a) rename the return type to `QueryEventsResult` (defined below); (b) **delete the two `log.error(...)` calls** (`:52`, `:70`) and any `import` of `@/lib/log`; (c) keep the returned-`{error}` branch returning `{ kind:"infra_error", message:"app_events read failed" }` and the `catch` returning `{ kind:"infra_error", message:"app_events read threw" }`. The result must be:

```ts
// lib/observe/query/events.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  PAGE_SIZE,
  escapeIlike,
  type AppEventFilters,
  type AppEventRow,
  type AppEventCursor,
} from "@/lib/admin/observabilityTypes";

export type QueryEventsResult =
  | { kind: "ok"; events: AppEventRow[]; hasMore: boolean; nextCursor: AppEventCursor | null }
  | { kind: "infra_error"; message: string };

// EXACT copy of the SELECT string in lib/admin/loadAppEvents.ts (:11-12).
const SELECT =
  "id, occurred_at, level, source, message, code, request_id, show_id, drive_file_id, actor_hash, context, shows(title, slug)";

type RawRow = {
  id: string;
  occurred_at: string;
  level: AppEventRow["level"];
  source: string;
  message: string;
  code: string | null;
  request_id: string | null;
  show_id: string | null;
  drive_file_id: string | null;
  actor_hash: string | null;
  context: Record<string, unknown>;
  shows: { title: string | null; slug: string | null } | { title: string | null; slug: string | null }[] | null;
};

function mapRow(r: RawRow): AppEventRow {
  const show = Array.isArray(r.shows) ? r.shows[0] : r.shows;
  return {
    id: r.id,
    occurredAt: r.occurred_at,
    level: r.level,
    source: r.source,
    message: r.message,
    code: r.code,
    requestId: r.request_id,
    showId: r.show_id,
    driveFileId: r.drive_file_id,
    actorHash: r.actor_hash,
    context: r.context ?? {},
    showTitle: show?.title ?? null,
    showSlug: show?.slug ?? null,
  };
}

export async function queryEvents(filters: AppEventFilters): Promise<QueryEventsResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase.from("app_events").select(SELECT);
    if (filters.levels?.length) query = query.in("level", filters.levels);
    if (filters.source) query = query.eq("source", filters.source);
    if (filters.code) query = query.eq("code", filters.code);
    if (filters.showId) query = query.eq("show_id", filters.showId);
    if (filters.requestId) query = query.eq("request_id", filters.requestId);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
      query = query.gte("occurred_at", since);
    }
    if (filters.q) query = query.ilike("message", `%${escapeIlike(filters.q)}%`);
    if (filters.cursor) {
      const { occurredAt: c, id } = filters.cursor;
      query = query.or(`occurred_at.lt.${c},and(occurred_at.eq.${c},id.lt.${id})`);
    }
    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (error) return { kind: "infra_error", message: "app_events read failed" };
    const rows = (data ?? []) as RawRow[];
    const hasMore = rows.length > PAGE_SIZE;
    const events = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map(mapRow);
    const last = events[events.length - 1];
    const nextCursor: AppEventCursor | null =
      hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null;
    return { kind: "ok", events, hasMore, nextCursor };
  } catch {
    return { kind: "infra_error", message: "app_events read threw" };
  }
}
```

> **Fidelity check:** after writing, run `git diff --no-index lib/admin/loadAppEvents.ts lib/observe/query/events.ts` mentally — the filter/order/limit/mapping logic must match `loadAppEvents` exactly (esp. the `since` cutoff computation: if `loadAppEvents.ts` uses `nowDate()`/`lib/time/now` instead of `Date.now()`, mirror THAT). If `loadAppEvents` computes the cutoff differently, copy its exact expression.

- [ ] **Step 5: Run tests to verify pass.** Run: `pnpm vitest run tests/observe/queryEvents.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 6: Commit.**

```bash
git add lib/observe/query/types.ts lib/observe/query/events.ts tests/observe/queryEvents.test.ts
git commit --no-verify -m "feat(observe): queryEvents — fresh no-log read-core over app_events"
```

---

### Task 2: `getCronHealth` — fresh no-log cron read

**Files:**
- Create: `lib/observe/query/cronHealth.ts`
- Test: `tests/observe/getCronHealth.test.ts`

**Interfaces:**
- Produces: `getCronHealth(): Promise<QueryCronHealthResult>` where
  `QueryCronHealthResult = { kind:"ok"; jobs: CronHealthRow[] } | { kind:"infra_error"; message: string }`.
- Consumes: `CRON_JOBS`, `CRON_RUN_SUMMARY`, `CronJobSpec` from `@/lib/cron/runSummary`; `CronHealthRow`, `CronRunOutcomeRead`, `AppEventLevel` from `@/lib/admin/observabilityTypes`.

- [ ] **Step 1: Write the failing test.** `tests/observe/getCronHealth.test.ts` — mirror the mock harness from Task 1's test, but `builder.limit` resolves per-call. Assert: ok result has one `jobs` entry per `CRON_JOBS` element; a returned `{error}` on any read → `infra_error`; a throw → `infra_error`. (Copy the `vi.mock` block; make `.eq().eq().order().limit(1)` resolve `{ data: state.rows, error: state.error }`.)

```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { CRON_JOBS } from "@/lib/cron/runSummary";

const state = vi.hoisted(() => ({ error: null as { message: string } | null, throwOnFrom: false }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (state.throwOnFrom) return { from() { throw new Error("boom"); } };
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.from = chain; b.select = chain; b.eq = chain; b.order = chain;
    b.limit = () => Promise.resolve({ data: [{ occurred_at: "2026-07-03T00:00:00.000Z", level: "info", context: { outcome: "ok", counts: { processed: 1 } } }], error: state.error });
    return b as never;
  },
}));
afterEach(() => { state.error = null; state.throwOnFrom = false; vi.resetModules(); });

describe("getCronHealth", () => {
  test("one job row per CRON_JOBS entry", async () => {
    const { getCronHealth } = await import("@/lib/observe/query/cronHealth");
    const r = await getCronHealth();
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.jobs.length).toBe(CRON_JOBS.length);
    expect(r.jobs[0]).toMatchObject({ jobName: CRON_JOBS[0].jobName, outcome: "ok" });
  });
  test("returned {error} → infra_error", async () => {
    state.error = { message: "down" };
    const { getCronHealth } = await import("@/lib/observe/query/cronHealth");
    expect(await getCronHealth()).toMatchObject({ kind: "infra_error" });
  });
  test("thrown → infra_error", async () => {
    state.throwOnFrom = true;
    const { getCronHealth } = await import("@/lib/observe/query/cronHealth");
    expect(await getCronHealth()).toMatchObject({ kind: "infra_error" });
  });
});
```

- [ ] **Step 2: Run to verify fail.** `pnpm vitest run tests/observe/getCronHealth.test.ts` — FAIL (no module).

- [ ] **Step 3: Create `lib/observe/query/cronHealth.ts` by copying `loadCronHealth` verbatim, minus logging.** Open `lib/admin/loadCronHealth.ts`. Copy the `Promise.all` over `CRON_JOBS`, the per-row `outcome`/`counts` extraction (`:16-32`), and the return, into `getCronHealth`, changing ONLY: (a) return type → `QueryCronHealthResult`; (b) delete the `log.error` on fault (`:52`, `:63`) and any `@/lib/log` import; (c) keep the returned-`{error}` → `{ kind:"infra_error", message:"app_events read returned error" }` and throw → `{ kind:"infra_error", message:"app_events read threw" }`. The per-job read is `.from("app_events").select("occurred_at, level, context").eq("code", CRON_RUN_SUMMARY).eq("source", "cron." + job.jobName).order("occurred_at", { ascending:false }).limit(1)`.

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/observe/getCronHealth.test.ts` — PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/observe/query/cronHealth.ts tests/observe/getCronHealth.test.ts
git commit --no-verify -m "feat(observe): getCronHealth — fresh no-log cron health read"
```

---

### Task 3: `queryAlerts` — new `admin_alerts` list read (context excluded)

**Files:**
- Create: `lib/observe/query/alerts.ts`
- Test: `tests/observe/queryAlerts.test.ts`

**Interfaces:**
- Produces: `queryAlerts(filters: AlertFilters): Promise<QueryAlertsResult>` (types from `types.ts`).

- [ ] **Step 1: Write the failing test.** Mirror the Task-1 mock harness. Assert: table is `admin_alerts`; the SELECT string does **NOT** contain `context`; `openOnly:true` adds `.is("resolved_at", null)`; `code` adds `.eq("code", …)`; empty `code` is dropped; `limit` clamps to [1,500] default 100; returned-`{error}`→infra_error; throw→infra_error; rows map to camelCase `AlertRow`.

```ts
// key assertions (harness like Task 1; builder.is/eq/order/limit tracked)
test("selects admin_alerts WITHOUT context, applies openOnly + code", async () => {
  state.rows = [{ id: "a", show_id: null, code: "WATCH_CHANNEL_ORPHANED", raised_at: "t", last_seen_at: "t", occurrence_count: 2, resolved_at: null, resolved_by: null, shows: null }];
  const { queryAlerts } = await import("@/lib/observe/query/alerts");
  const r = await queryAlerts({ openOnly: true, code: "WATCH_CHANNEL_ORPHANED", limit: 10 });
  if (r.kind !== "ok") throw new Error("infra");
  expect(state.captured.selectArg).not.toContain("context");
  expect(state.captured.filters.map((f) => f[0])).toEqual(expect.arrayContaining(["is:resolved_at", "eq:code", "limit:10"]));
  expect(r.alerts[0]).toMatchObject({ id: "a", code: "WATCH_CHANNEL_ORPHANED", occurrenceCount: 2, resolvedAt: null });
});
test("limit clamps: 0→1, 999→500, undefined→100", async () => { /* three calls; assert captured limit */ });
test("empty code is dropped (no eq:code)", async () => { /* … */ });
```

(Extend the harness: capture `select`'s arg into `state.captured.selectArg`, and `limit(n)` into a `limit:${n}` filter key.)

- [ ] **Step 2: Run to verify fail.** `pnpm vitest run tests/observe/queryAlerts.test.ts` — FAIL.

- [ ] **Step 3: Create `lib/observe/query/alerts.ts`:**

```ts
// lib/observe/query/alerts.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { clampLimit, type AlertFilters, type AlertRow, type QueryAlertsResult } from "./types";

// NOTE: admin_alerts.context is intentionally NOT selected — it is not
// redaction-guaranteed (unlike app_events.context). Spec §3.3 / §5.
const SELECT =
  "id, show_id, code, raised_at, last_seen_at, occurrence_count, resolved_at, resolved_by, shows(title, slug)";

type RawAlert = {
  id: string;
  show_id: string | null;
  code: string;
  raised_at: string;
  last_seen_at: string;
  occurrence_count: number;
  resolved_at: string | null;
  resolved_by: string | null;
  shows: { title: string | null; slug: string | null } | { title: string | null; slug: string | null }[] | null;
};

function mapAlert(r: RawAlert): AlertRow {
  const show = Array.isArray(r.shows) ? r.shows[0] : r.shows;
  return {
    id: r.id,
    showId: r.show_id,
    code: r.code,
    raisedAt: r.raised_at,
    lastSeenAt: r.last_seen_at,
    occurrenceCount: r.occurrence_count,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    showTitle: show?.title ?? null,
    showSlug: show?.slug ?? null,
  };
}

export async function queryAlerts(filters: AlertFilters): Promise<QueryAlertsResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase.from("admin_alerts").select(SELECT);
    if (filters.openOnly) query = query.is("resolved_at", null);
    const code = filters.code?.trim();
    if (code) query = query.eq("code", code);
    const { data, error } = await query
      .order("raised_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "admin_alerts read failed" };
    return { kind: "ok", alerts: ((data ?? []) as RawAlert[]).map(mapAlert) };
  } catch {
    return { kind: "infra_error", message: "admin_alerts read threw" };
  }
}
```

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/observe/queryAlerts.test.ts` — PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/observe/query/alerts.ts tests/observe/queryAlerts.test.ts
git commit --no-verify -m "feat(observe): queryAlerts — admin_alerts list read (context excluded)"
```

---

### Task 4: `queryChangeLog` — new `show_change_log` read (images excluded)

**Files:**
- Create: `lib/observe/query/changeLog.ts`
- Test: `tests/observe/queryChangeLog.test.ts`

**Interfaces:**
- Produces: `queryChangeLog(filters: ChangeLogFilters): Promise<QueryChangeLogResult>`.

- [ ] **Step 1: Write the failing test.** Mirror harness. Assert: table `show_change_log`; SELECT contains NEITHER `before_image` NOR `after_image`; non-UUID `showId` dropped (no `eq:show_id`); UUID `showId` applied; `sinceHours` non-null adds `gte:occurred_at`, `null` adds none, `undefined` defaults to 24 (adds `gte`); `limit` clamps; three infra states.

```ts
test("selects show_change_log without images; UUID showId applied, non-UUID dropped", async () => {
  state.rows = [{ id: "c", show_id: "s", drive_file_id: "d", occurred_at: "t", source: "auto_apply", change_kind: "email", entity_ref: null, summary: "changed X", status: "applied" }];
  const { queryChangeLog } = await import("@/lib/observe/query/changeLog");
  const bad = await queryChangeLog({ showId: "not-a-uuid" });
  expect(state.captured.selectArg).not.toMatch(/before_image|after_image/);
  expect(state.captured.filters.map((f) => f[0])).not.toContain("eq:show_id");
  const good = await queryChangeLog({ showId: "11111111-1111-1111-1111-111111111111", sinceHours: null });
  expect(state.captured.filters.map((f) => f[0])).toContain("eq:show_id");
  expect(state.captured.filters.map((f) => f[0])).not.toContain("gte:occurred_at"); // null → no bound
});
```

- [ ] **Step 2: Run to verify fail.** `pnpm vitest run tests/observe/queryChangeLog.test.ts` — FAIL.

- [ ] **Step 3: Create `lib/observe/query/changeLog.ts`:**

```ts
// lib/observe/query/changeLog.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { clampLimit, isUuid, type ChangeLogFilters, type ChangeRow, type QueryChangeLogResult } from "./types";

// before_image / after_image intentionally excluded (raw row snapshots). Spec §5.
const SELECT =
  "id, show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, status";

type RawChange = {
  id: string;
  show_id: string;
  drive_file_id: string;
  occurred_at: string;
  source: string;
  change_kind: string;
  entity_ref: string | null;
  summary: string;
  status: string;
};

function mapChange(r: RawChange): ChangeRow {
  return {
    id: r.id,
    showId: r.show_id,
    driveFileId: r.drive_file_id,
    occurredAt: r.occurred_at,
    source: r.source,
    changeKind: r.change_kind,
    entityRef: r.entity_ref,
    summary: r.summary,
    status: r.status,
  };
}

export async function queryChangeLog(filters: ChangeLogFilters): Promise<QueryChangeLogResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase.from("show_change_log").select(SELECT);
    if (filters.showId && isUuid(filters.showId)) query = query.eq("show_id", filters.showId);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null && !Number.isNaN(sinceHours) && sinceHours > 0) {
      const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
      query = query.gte("occurred_at", since);
    }
    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "show_change_log read failed" };
    return { kind: "ok", changes: ((data ?? []) as RawChange[]).map(mapChange) };
  } catch {
    return { kind: "infra_error", message: "show_change_log read threw" };
  }
}
```

> Match the `since` cutoff expression to whatever `queryEvents` used in Task 1 (Date.now vs nowDate).

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/observe/queryChangeLog.test.ts` — PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/observe/query/changeLog.ts tests/observe/queryChangeLog.test.ts
git commit --no-verify -m "feat(observe): queryChangeLog — show_change_log read (images excluded)"
```

---

### Task 5: public surface + read-only structural meta-test

**Files:**
- Create: `lib/observe/query/index.ts`, `tests/observe/_metaReadOnlyQueryCore.test.ts`

**Interfaces:**
- Produces: barrel exports of `queryEvents`, `getCronHealth`, `queryAlerts`, `queryChangeLog`, and all types.

- [ ] **Step 1: Write the failing meta-test.** `tests/observe/_metaReadOnlyQueryCore.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const DIR = join(process.cwd(), "lib/observe/query");
const WRITE = /\.(insert|update|delete|upsert|rpc)\s*\(/;
// Matches @/lib/log AND any subpath (@/lib/log/persist) — the char class after
// requires a `/` or the closing quote, so it can't false-match @/lib/logger.
const LOG_IMPORT = /from\s+["']@\/lib\/log(\/|["'])/;

// RECURSIVE walk so a future subdirectory under lib/observe/query is not missed.
function tsFiles(dir = DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("read-only query core", () => {
  test("has files", () => {
    expect(tsFiles().length).toBeGreaterThanOrEqual(5);
  });
  test("no write builders anywhere under lib/observe/query/**", () => {
    for (const f of tsFiles()) {
      expect(readFileSync(f, "utf8"), `${f} contains a write builder`).not.toMatch(WRITE);
    }
  });
  test("no lib/log import anywhere under lib/observe/query/** (blocks transitive app_events write on fault)", () => {
    for (const f of tsFiles()) {
      expect(readFileSync(f, "utf8"), `${f} imports lib/log`).not.toMatch(LOG_IMPORT);
    }
  });
});
```

- [ ] **Step 2: Run the meta-test.** `pnpm vitest run tests/observe/_metaReadOnlyQueryCore.test.ts`. NOTE: after Tasks 1–4 the core already has 5 files (types/events/cronHealth/alerts/changeLog), so "has files" and the write/log checks likely **PASS** even before `index.ts` exists — that's expected, this meta-test guards a property, not a missing file. The deliverable of this task is `index.ts` (the public surface) plus a green read-only guard. Just confirm the suite runs clean.

- [ ] **Step 3: Create `lib/observe/query/index.ts`:**

```ts
// lib/observe/query/index.ts — the ONLY sanctioned read entry point.
export { queryEvents, type QueryEventsResult } from "./events";
export { getCronHealth, type QueryCronHealthResult } from "./cronHealth";
export { queryAlerts } from "./alerts";
export { queryChangeLog } from "./changeLog";
export { isUuid, clampLimit } from "./types";
export type {
  AlertFilters,
  AlertRow,
  QueryAlertsResult,
  ChangeLogFilters,
  ChangeRow,
  QueryChangeLogResult,
} from "./types";
```

Add `export type QueryCronHealthResult` to `cronHealth.ts` if not already exported there (Task 2).

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/observe/_metaReadOnlyQueryCore.test.ts` — PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add lib/observe/query/index.ts tests/observe/_metaReadOnlyQueryCore.test.ts
git commit --no-verify -m "feat(observe): read-core barrel + read-only structural meta-test"
```

---

### Task 6: register the 4 fns in the infra + bounded-read meta-tests

**Files:**
- Modify: `tests/admin/_metaInfraContract.test.ts`, `tests/admin/_metaBoundedReads.test.ts`

- [ ] **Step 1: Add 4 registry rows** to the `infraRegistry` array in `tests/admin/_metaInfraContract.test.ts` (before the closing `];`):

```ts
  {
    helper: "queryEvents",
    path: "lib/observe/query/events.ts",
    contract:
      "app_events timeline read (service-role); fresh NON-LOGGING copy of loadAppEvents — one try/catch; returned-error → infra_error('app_events read failed'); thrown → infra_error('app_events read threw'); NO lib/log import.",
  },
  {
    helper: "getCronHealth",
    path: "lib/observe/query/cronHealth.ts",
    contract:
      "cron health: Promise.all of per-job app_events limit(1) reads (service-role) in one try/catch; returned {error} → infra_error('app_events read returned error'); thrown → infra_error('app_events read threw'); fresh NON-LOGGING copy of loadCronHealth.",
  },
  {
    helper: "queryAlerts",
    path: "lib/observe/query/alerts.ts",
    contract:
      "admin_alerts list read (service-role, context EXCLUDED); one try/catch; returned {error} → infra_error('admin_alerts read failed'); thrown → infra_error('admin_alerts read threw'); .limit-bounded.",
  },
  {
    helper: "queryChangeLog",
    path: "lib/observe/query/changeLog.ts",
    contract:
      "show_change_log read (service-role, images EXCLUDED); one try/catch; returned {error} → infra_error('show_change_log read failed'); thrown → infra_error('show_change_log read threw'); .limit-bounded.",
  },
```

- [ ] **Step 2: Add behavioral blocks.** In the same file, add `describe(...)` blocks mirroring the existing `loadAppEvents` block (`:689-717`) — one per new fn — using `infraMock.throwOnConstruct` and `infraMock.throwOnFromTable = "<table>"`:

```ts
describe("queryEvents", () => {
  test("construction throw → infra_error", async () => {
    infraMock.throwOnConstruct = true;
    const { queryEvents } = await import("@/lib/observe/query/events");
    expect(await queryEvents({})).toMatchObject({ kind: "infra_error" });
  });
  test("from('app_events') throw → infra_error", async () => {
    infraMock.throwOnFromTable = "app_events";
    const { queryEvents } = await import("@/lib/observe/query/events");
    expect(await queryEvents({})).toMatchObject({ kind: "infra_error" });
  });
});
// …analogous blocks for getCronHealth (table "app_events"),
// queryAlerts (table "admin_alerts"), queryChangeLog (table "show_change_log").
```

> The structural test requires the client construction inside `try` within 20 lines and `} catch` within 45 lines — the Task-1..4 implementations already satisfy this (compact bodies). If a body is too long, tighten it, don't widen the window.

- [ ] **Step 3: Extend `tests/admin/_metaBoundedReads.test.ts`.** Add the 4 read modules to `READ_MODULES` and the 3 tables to `UNBOUNDED_TABLES`:

```ts
const READ_MODULES = [
  "components/admin/Dashboard.tsx",
  "lib/admin/loadNeedsAttention.ts",
  "lib/observe/query/events.ts",
  "lib/observe/query/cronHealth.ts",
  "lib/observe/query/alerts.ts",
  "lib/observe/query/changeLog.ts",
];
const UNBOUNDED_TABLES = ["shows", "crew_members", "pending_ingestions", "pending_syncs", "app_events", "admin_alerts", "show_change_log"];
```

- [ ] **Step 4: Run both meta-tests.** Run: `pnpm vitest run tests/admin/_metaInfraContract.test.ts tests/admin/_metaBoundedReads.test.ts` — Expected: PASS. If `_metaBoundedReads` flags an existing module's read of a newly-listed table as unbounded, that read already has `head:true`/`.limit` (it must, to be live code) — if a genuine failure appears, it's a pre-existing unbounded read; note it and bound it, don't remove the table.

- [ ] **Step 5: Commit.**

```bash
git add tests/admin/_metaInfraContract.test.ts tests/admin/_metaBoundedReads.test.ts
git commit --no-verify -m "test(observe): register read-core in infra + bounded-read meta-tests"
```

---

### Task 7: `resolveTarget` — the `--env` guardrail

**Files:**
- Create: `scripts/observe/env.ts`
- Test: `tests/observe/env.test.ts`

**Interfaces:**
- Produces: `resolveTarget(env: string | undefined, ambient?: NodeJS.ProcessEnv): { kind:"ok"; envName:"local"|"validation"|"prod" } | { kind:"error"; message: string }`. Pure; takes an injected env object (defaults to `process.env`).

- [ ] **Step 1: Write the failing test.** `tests/observe/env.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { resolveTarget } from "@/scripts/observe/env";

const local = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "k" };
const prod = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SECRET_KEY: "k" };

describe("resolveTarget", () => {
  test("default local when env undefined + loopback/unset URL", () => {
    expect(resolveTarget(undefined, {})).toMatchObject({ kind: "ok", envName: "local" });
    expect(resolveTarget(undefined, local)).toMatchObject({ kind: "ok", envName: "local" });
  });
  test("refuses non-loopback ambient URL without explicit --env", () => {
    expect(resolveTarget(undefined, prod)).toMatchObject({ kind: "error" });
  });
  test("--env prod requires non-loopback URL + key", () => {
    expect(resolveTarget("prod", prod)).toMatchObject({ kind: "ok", envName: "prod" });
    expect(resolveTarget("prod", local)).toMatchObject({ kind: "error" }); // loopback
    expect(resolveTarget("prod", { SUPABASE_URL: "https://abc.supabase.co" })).toMatchObject({ kind: "error" }); // no key
  });
  test("unknown env value → error", () => {
    expect(resolveTarget("staging", prod)).toMatchObject({ kind: "error" });
  });
});
```

- [ ] **Step 2: Run to verify fail.** `pnpm vitest run tests/observe/env.test.ts` — FAIL.

- [ ] **Step 3: Create `scripts/observe/env.ts`:**

```ts
// scripts/observe/env.ts
function isLoopback(url: string | undefined): boolean {
  if (!url) return true; // unset → local default
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(url);
}

export type TargetResult =
  | { kind: "ok"; envName: "local" | "validation" | "prod" }
  | { kind: "error"; message: string };

export function resolveTarget(
  env: string | undefined,
  ambient: NodeJS.ProcessEnv = process.env,
): TargetResult {
  const name = env ?? "local";
  const url = ambient.SUPABASE_URL;
  const hasKey = Boolean(ambient.SUPABASE_SECRET_KEY ?? ambient.SUPABASE_SERVICE_ROLE_KEY);
  if (name === "local") {
    if (!isLoopback(url)) {
      return {
        kind: "error",
        message: "refusing non-local SUPABASE_URL; pass --env validation|prod to confirm a remote target",
      };
    }
    return { kind: "ok", envName: "local" };
  }
  if (name === "validation" || name === "prod") {
    if (isLoopback(url)) {
      return { kind: "error", message: `--env ${name} requires a non-local SUPABASE_URL` };
    }
    if (!hasKey) {
      return { kind: "error", message: `--env ${name} requires SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)` };
    }
    return { kind: "ok", envName: name };
  }
  return { kind: "error", message: `unknown --env "${name}"; expected local|validation|prod` };
}
```

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/observe/env.test.ts` — PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/observe/env.ts tests/observe/env.test.ts
git commit --no-verify -m "feat(observe): resolveTarget --env guardrail (default local, refuse ambient prod)"
```

---

### Task 8: `parseObserveArgs` — CLI arg parsing

**Files:**
- Create: `scripts/observe/args.ts`
- Test: `tests/observe/args.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type ObserveCommand = "events" | "alerts" | "cron" | "changes" | "codes" | "tail" | "help";
  type ParsedArgs =
    | { kind: "ok"; command: ObserveCommand; codeArg?: string; json: boolean; env?: string;
        follow: boolean; interval: number; limit?: number;
        eventFilters: import("@/lib/admin/observabilityTypes").AppEventFilters;
        alertFilters: import("@/lib/observe/query").AlertFilters;
        changeFilters: import("@/lib/observe/query").ChangeLogFilters; }
    | { kind: "error"; message: string };
  export function parseObserveArgs(argv: string[]): ParsedArgs;
  ```

- [ ] **Step 1: Write the failing test.** `tests/observe/args.test.ts` — assert:
  - `["events","--level","warn,error","--show","<uuid>","--since","7d","--limit","250"]` → command `events`, `eventFilters.levels === ["warn","error"]`, `showId` set, `sinceHours === 168`, `limit === 250`.
  - `--since all` → `sinceHours === null`; `--since 1h` → 1; default (absent) → `sinceHours` undefined (core defaults to 24).
  - `--level foo,warn` → only `warn` kept.
  - non-UUID `--show` → `showId` undefined.
  - `["alerts","--open","--code","X"]` → `alertFilters.openOnly === true`, `code === "X"`.
  - `["codes","WATCH_CHANNEL_ORPHANED"]` → command `codes`, `codeArg === "WATCH_CHANNEL_ORPHANED"`.
  - `["tail","--follow","--interval","10"]` → command `tail`, `follow === true`, `interval === 10`; tail default `limit` (when absent) resolved to 20 by the CLI (assert `limit` is undefined here — the 20 default is applied at dispatch, Task 11).
  - `["bogus"]` → `{ kind:"error" }`; `["events","--nope"]` → `{ kind:"error" }` (unknown flag).
  - `["events","--q","boom","--source","cron.sync","--request","r1"]` → those three filters set.

```ts
import { describe, expect, test } from "vitest";
import { parseObserveArgs } from "@/scripts/observe/args";
const UUID = "11111111-1111-1111-1111-111111111111";

describe("parseObserveArgs", () => {
  test("events filters map correctly", () => {
    const r = parseObserveArgs(["events", "--level", "warn,error", "--show", UUID, "--since", "7d", "--limit", "250"]);
    if (r.kind !== "ok") throw new Error(r.message);
    expect(r.command).toBe("events");
    expect(r.eventFilters.levels).toEqual(["warn", "error"]);
    expect(r.eventFilters.showId).toBe(UUID);
    expect(r.eventFilters.sinceHours).toBe(168);
    expect(r.limit).toBe(250);
  });
  test("--since all → null, 1h → 1", () => {
    expect((parseObserveArgs(["events", "--since", "all"]) as { eventFilters: { sinceHours: unknown } }).eventFilters.sinceHours).toBeNull();
    expect((parseObserveArgs(["events", "--since", "1h"]) as { eventFilters: { sinceHours: unknown } }).eventFilters.sinceHours).toBe(1);
  });
  test("invalid level tokens dropped; non-uuid show dropped", () => {
    const r = parseObserveArgs(["events", "--level", "foo,warn", "--show", "nope"]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r.eventFilters.levels).toEqual(["warn"]);
    expect(r.eventFilters.showId).toBeUndefined();
  });
  test("alerts --open --code", () => {
    const r = parseObserveArgs(["alerts", "--open", "--code", "X"]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r.alertFilters).toMatchObject({ openOnly: true, code: "X" });
  });
  test("codes positional", () => {
    const r = parseObserveArgs(["codes", "WATCH_CHANNEL_ORPHANED"]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r).toMatchObject({ command: "codes", codeArg: "WATCH_CHANNEL_ORPHANED" });
  });
  test("tail follow + interval", () => {
    const r = parseObserveArgs(["tail", "--follow", "--interval", "10"]);
    if (r.kind !== "ok") throw new Error("err");
    expect(r).toMatchObject({ command: "tail", follow: true, interval: 10 });
  });
  test("unknown command and unknown flag → error", () => {
    expect(parseObserveArgs(["bogus"]).kind).toBe("error");
    expect(parseObserveArgs(["events", "--nope"]).kind).toBe("error");
  });
});
```

- [ ] **Step 2: Run to verify fail.** `pnpm vitest run tests/observe/args.test.ts` — FAIL.

- [ ] **Step 3: Create `scripts/observe/args.ts`:**

```ts
// scripts/observe/args.ts
import { parseArgs } from "node:util";
import { escapeIlike as _escape } from "@/lib/admin/observabilityTypes"; // not used; ensures type import path valid — REMOVE if lint flags unused
import type { AppEventFilters, AppEventLevel } from "@/lib/admin/observabilityTypes";
import { isUuid, type AlertFilters, type ChangeLogFilters } from "@/lib/observe/query";

export type ObserveCommand = "events" | "alerts" | "cron" | "changes" | "codes" | "tail" | "help";
const COMMANDS: ObserveCommand[] = ["events", "alerts", "cron", "changes", "codes", "tail", "help"];
const LEVELS: AppEventLevel[] = ["info", "warn", "error"];

export type ParsedArgs =
  | {
      kind: "ok";
      command: ObserveCommand;
      codeArg?: string;
      json: boolean;
      env?: string;
      follow: boolean;
      interval: number;
      limit?: number;
      eventFilters: AppEventFilters;
      alertFilters: AlertFilters;
      changeFilters: ChangeLogFilters;
    }
  | { kind: "error"; message: string };

function cap(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t.length === 0 || t.length > 200 ? undefined : t;
}
function sinceToHours(v: string | undefined): 1 | 24 | 168 | null | undefined {
  if (v === undefined) return undefined;
  if (v === "1h") return 1;
  if (v === "7d") return 168;
  if (v === "all") return null;
  return 24; // "24h" and anything else
}

export function parseObserveArgs(argv: string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        level: { type: "string" },
        source: { type: "string" },
        code: { type: "string" },
        request: { type: "string" },
        q: { type: "string" },
        show: { type: "string" },
        since: { type: "string" },
        limit: { type: "string" },
        interval: { type: "string" },
        env: { type: "string" },
        open: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        follow: { type: "boolean", default: false },
      },
    });
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "bad arguments" };
  }
  const { values, positionals } = parsed;
  const command = (positionals[0] ?? "help") as string;
  if (!COMMANDS.includes(command as ObserveCommand)) {
    return { kind: "error", message: `unknown command "${command}" (expected ${COMMANDS.join("|")})` };
  }
  const levels = values.level
    ? values.level.split(",").map((s) => s.trim()).filter((s): s is AppEventLevel => (LEVELS as string[]).includes(s))
    : undefined;
  const show = cap(values.show);
  const showId = show && isUuid(show) ? show : undefined;
  const limitRaw = values.limit ? Number(values.limit) : undefined;
  const limit = limitRaw !== undefined && !Number.isNaN(limitRaw) ? limitRaw : undefined;
  const intervalRaw = values.interval ? Number(values.interval) : NaN;
  const interval = Number.isNaN(intervalRaw) ? 5 : Math.max(1, Math.min(60, Math.trunc(intervalRaw)));

  const eventFilters: AppEventFilters = {
    ...(levels && levels.length ? { levels } : {}),
    ...(cap(values.source) ? { source: cap(values.source) } : {}),
    ...(cap(values.code) ? { code: cap(values.code) } : {}),
    ...(cap(values.request) ? { requestId: cap(values.request) } : {}),
    ...(cap(values.q) ? { q: cap(values.q) } : {}),
    ...(showId ? { showId } : {}),
    ...(sinceToHours(values.since) !== undefined ? { sinceHours: sinceToHours(values.since) } : {}),
  };
  const alertFilters: AlertFilters = {
    ...(values.open ? { openOnly: true } : {}),
    ...(cap(values.code) ? { code: cap(values.code) } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
  const changeFilters: ChangeLogFilters = {
    ...(showId ? { showId } : {}),
    ...(sinceToHours(values.since) !== undefined ? { sinceHours: sinceToHours(values.since) } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };

  return {
    kind: "ok",
    command: command as ObserveCommand,
    ...(positionals[1] ? { codeArg: positionals[1] } : {}),
    json: values.json ?? false,
    ...(values.env ? { env: values.env } : {}),
    follow: values.follow ?? false,
    interval,
    ...(limit !== undefined ? { limit } : {}),
    eventFilters,
    alertFilters,
    changeFilters,
  };
}
```

> Remove the unused `escapeIlike` import line — it's a placeholder to confirm the import path; `pnpm typecheck` with `noUnusedLocals` will flag it. Keep only the type import.

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/observe/args.test.ts` — PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/observe/args.ts tests/observe/args.test.ts
git commit --no-verify -m "feat(observe): parseObserveArgs (parseArgs; filters mirror parseAppEventFilters)"
```

---

### Task 9: `collectEvents` — CLI cursor pagination

**Files:**
- Create: `scripts/observe/collect.ts`
- Test: `tests/observe/collect.test.ts`

**Interfaces:**
- Produces: `collectEvents(queryFn, base, limit): Promise<QueryEventsResult>` where `queryFn: (f: AppEventFilters) => Promise<QueryEventsResult>`. Injected `queryFn` so tests stub pages without a DB.

- [ ] **Step 1: Write the failing test.** `tests/observe/collect.test.ts` — cover all termination conditions from spec §3.1:

```ts
import { describe, expect, test } from "vitest";
import { collectEvents } from "@/scripts/observe/collect";
import type { QueryEventsResult } from "@/lib/observe/query";

function ev(id: string) {
  return { id, occurredAt: "2026-07-03T00:00:00.000Z", level: "info" as const, source: "s", message: "m", code: null, requestId: null, showId: null, driveFileId: null, actorHash: null, context: {}, showTitle: null, showSlug: null };
}
function pages(...defs: QueryEventsResult[]) {
  let i = 0;
  return async () => defs[Math.min(i++, defs.length - 1)];
}

describe("collectEvents", () => {
  test("accumulates across two pages up to limit (b: !hasMore)", async () => {
    const q = pages(
      { kind: "ok", events: [ev("a"), ev("b")], hasMore: true, nextCursor: { occurredAt: "t", id: "b" } },
      { kind: "ok", events: [ev("c")], hasMore: false, nextCursor: null },
    );
    const r = await collectEvents(q, {}, 100);
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
  test("(a) truncates at limit AND nextCursor points at last RETURNED row (not past dropped rows)", async () => {
    const q = pages({ kind: "ok", events: [ev("a"), ev("b"), ev("c")], hasMore: true, nextCursor: { occurredAt: "t", id: "c" } });
    const r = await collectEvents(q, {}, 2);
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.map((e) => e.id)).toEqual(["a", "b"]);
    // must resume from "b" (the last returned), NOT "c" (which we never emitted)
    expect(r.nextCursor).toEqual({ occurredAt: "2026-07-03T00:00:00.000Z", id: "b" });
  });
  test("(d) non-advancing cursor stops (no infinite loop)", async () => {
    // Every page claims hasMore + returns the SAME cursor it was called with.
    let calls = 0;
    const q = async (f: import("@/lib/admin/observabilityTypes").AppEventFilters) => {
      calls++;
      return { kind: "ok" as const, events: [ev(`x${calls}`)], hasMore: true, nextCursor: { occurredAt: "t", id: "same" } };
    };
    // seed base cursor so the 2nd request's cursor equals returned nextCursor
    const r = await collectEvents(q, { cursor: { occurredAt: "t", id: "same" } }, 500);
    expect(r.kind).toBe("ok");
    expect(calls).toBeLessThanOrEqual(2); // stops on non-advance, does not spin
  });
  test("(c) null nextCursor stops", async () => {
    const q = pages({ kind: "ok", events: [ev("a")], hasMore: true, nextCursor: null });
    const r = await collectEvents(q, {}, 500);
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.length).toBe(1);
  });
  test("(e) empty page stops", async () => {
    const q = pages({ kind: "ok", events: [], hasMore: true, nextCursor: { occurredAt: "t", id: "z" } });
    const r = await collectEvents(q, {}, 500);
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.length).toBe(0);
  });
  test("(f) page cap: never more than 6 calls", async () => {
    let calls = 0;
    const q = async () => {
      calls++;
      return { kind: "ok" as const, events: [ev(`p${calls}`)], hasMore: true, nextCursor: { occurredAt: "t", id: `c${calls}` } };
    };
    await collectEvents(q, {}, 500);
    expect(calls).toBeLessThanOrEqual(6);
  });
  test("mid-loop infra_error surfaces", async () => {
    const q = pages(
      { kind: "ok", events: [ev("a")], hasMore: true, nextCursor: { occurredAt: "t", id: "a" } },
      { kind: "infra_error", message: "down" },
    );
    expect((await collectEvents(q, {}, 500)).kind).toBe("infra_error");
  });
});
```

- [ ] **Step 2: Run to verify fail.** `pnpm vitest run tests/observe/collect.test.ts` — FAIL.

- [ ] **Step 3: Create `scripts/observe/collect.ts`** (implements the §3.1 algorithm exactly):

```ts
// scripts/observe/collect.ts
import type { AppEventFilters, AppEventCursor, AppEventRow } from "@/lib/admin/observabilityTypes";
import type { QueryEventsResult } from "@/lib/observe/query";

function sameCursor(a: AppEventCursor, b: AppEventCursor): boolean {
  return a.occurredAt === b.occurredAt && a.id === b.id;
}
function cursorOf(rows: AppEventRow[]): AppEventCursor | null {
  const last = rows[rows.length - 1];
  return last ? { occurredAt: last.occurredAt, id: last.id } : null;
}

export async function collectEvents(
  queryFn: (f: AppEventFilters) => Promise<QueryEventsResult>,
  base: AppEventFilters,
  limit: number,
): Promise<QueryEventsResult> {
  const acc: AppEventRow[] = [];
  let cursor: AppEventCursor | null = base.cursor ?? null;
  let pages = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    pages += 1;
    const r = await queryFn({ ...base, ...(cursor ? { cursor } : {}) });
    if (r.kind !== "ok") return r; // (fault) surface it
    acc.push(...r.events);
    if (acc.length >= limit) {
      const trimmed = acc.slice(0, limit); // (a) reached limit
      // nextCursor must point after the LAST RETURNED row, not r.nextCursor
      // (r.nextCursor points past rows we dropped → would skip data on resume).
      return { kind: "ok", events: trimmed, hasMore: true, nextCursor: cursorOf(trimmed) };
    }
    if (!r.hasMore) return { kind: "ok", events: acc, hasMore: false, nextCursor: null }; // (b)
    if (r.nextCursor == null) return { kind: "ok", events: acc, hasMore: false, nextCursor: null }; // (c)
    if (r.events.length === 0) return { kind: "ok", events: acc, hasMore: false, nextCursor: null }; // (e)
    if (cursor != null && sameCursor(r.nextCursor, cursor)) return { kind: "ok", events: acc, hasMore: false, nextCursor: null }; // (d) non-advancing
    if (pages >= 6) return { kind: "ok", events: acc, hasMore: true, nextCursor: r.nextCursor }; // (f) page cap
    cursor = r.nextCursor;
  }
}
```

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/observe/collect.test.ts` — PASS (7 tests).

- [ ] **Step 5: Commit.**

```bash
git add scripts/observe/collect.ts tests/observe/collect.test.ts
git commit --no-verify -m "feat(observe): collectEvents cursor pagination with explicit termination"
```

---

### Task 10: `format` — table / json / ndjson renderers

**Files:**
- Create: `scripts/observe/format.ts`
- Test: `tests/observe/format.test.ts`

**Interfaces:**
- Produces: `formatEvents(rows, json): string`, `formatAlerts`, `formatCron`, `formatChanges`, and `formatEventLineNdjson(row): string`. Each table renderer prints `(no rows)` for empty; `json` variant returns `JSON.stringify(rows)`.

- [ ] **Step 1: Write the failing test.** Assert: empty rows → `(no rows)`; `json:true` → parseable `JSON.parse` round-trips the array; a table row contains the level/code/message; NDJSON line is a single parseable object with a trailing behavior of one object per call. (Derive expectations from the input array, not hardcoded strings — anti-tautology.)

```ts
import { describe, expect, test } from "vitest";
import { formatEvents, formatEventLineNdjson } from "@/scripts/observe/format";
const row = { id: "a", occurredAt: "2026-07-03T00:00:00.000Z", level: "error" as const, source: "cron.sync", message: "boom", code: "C", requestId: null, showId: null, driveFileId: null, actorHash: null, context: {}, showTitle: null, showSlug: null };

describe("format", () => {
  test("empty table → (no rows)", () => {
    expect(formatEvents([], false)).toContain("(no rows)");
  });
  test("json → parseable, round-trips input", () => {
    const out = formatEvents([row], true);
    expect(JSON.parse(out)).toEqual([row]);
  });
  test("table contains level+code+message from the input", () => {
    const out = formatEvents([row], false);
    expect(out).toContain(row.level);
    expect(out).toContain(row.code);
    expect(out).toContain(row.message);
  });
  test("ndjson line is one parseable object", () => {
    const line = formatEventLineNdjson(row);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual(row);
  });
});
```

- [ ] **Step 2: Run to verify fail.** `pnpm vitest run tests/observe/format.test.ts` — FAIL.

- [ ] **Step 3: Create `scripts/observe/format.ts`** — implement the five renderers (truncate `message`/`summary` to ~80 chars in table mode; align columns with `padEnd`). Full code for `formatEvents` + `formatEventLineNdjson`; `formatAlerts`/`formatCron`/`formatChanges` follow the same shape (column set per spec §4.3).

```ts
// scripts/observe/format.ts
import type { AppEventRow } from "@/lib/admin/observabilityTypes";
import type { AlertRow, ChangeRow } from "@/lib/observe/query";
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";

const trunc = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function formatEvents(rows: AppEventRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map((r) => `${r.occurredAt}  ${r.level.padEnd(5)}  ${(r.code ?? "-").padEnd(24)}  ${r.source.padEnd(18)}  ${trunc(r.message)}`)
    .join("\n");
}
export function formatEventLineNdjson(row: AppEventRow): string {
  return JSON.stringify(row) + "\n";
}
export function formatAlerts(rows: AlertRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map((r) => `${r.raisedAt}  ${r.code.padEnd(28)}  ${(r.showTitle ?? r.showId ?? "-").padEnd(20)}  x${r.occurrenceCount}  ${r.resolvedAt ? "resolved" : "OPEN"}`)
    .join("\n");
}
export function formatCron(rows: CronHealthRow[], json: boolean, nowMs: number): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map((r) => {
      const stale = r.lastRunAt ? nowMs - Date.parse(r.lastRunAt) > r.staleAfterMs : true;
      return `${r.jobName.padEnd(16)}  ${(r.outcome ?? "-").padEnd(8)}  ${(r.lastRunAt ?? "never").padEnd(26)}  ${stale ? "STALE" : "ok"}`;
    })
    .join("\n");
}
export function formatChanges(rows: ChangeRow[], json: boolean): string {
  if (json) return JSON.stringify(rows);
  if (rows.length === 0) return "(no rows)";
  return rows
    .map((r) => `${r.occurredAt}  ${r.status.padEnd(10)}  ${r.changeKind.padEnd(16)}  ${r.showId.padEnd(20)}  ${trunc(r.summary)}`)
    .join("\n");
}
```

- [ ] **Step 4: Run to verify pass.** `pnpm vitest run tests/observe/format.test.ts` — PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/observe/format.ts tests/observe/format.test.ts
git commit --no-verify -m "feat(observe): table/json/ndjson formatters"
```

---

### Task 11: `scripts/observe.ts` entry + `observe codes` + package.json script

**Files:**
- Create: `scripts/observe.ts`
- Modify: `package.json`
- Test: `tests/observe/codes.test.ts`, `tests/observe/dispatch.test.ts`

**Interfaces:**
- Produces: `runObserve(argv, deps): Promise<{ stdout: string; stderr: string; exitCode: number }>` — a pure-ish dispatcher taking injected core fns (`queryEvents`, `getCronHealth`, `queryAlerts`, `queryChangeLog`) and a catalog lookup, so it's testable without a DB or `process.exit`. `resolveCodeText(code, deps)` for the offline `codes` command.

- [ ] **Step 1: Write the failing tests.**

`tests/observe/codes.test.ts` — assert against `MESSAGE_CATALOG` directly (anti-tautology):

```ts
import { describe, expect, test } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { resolveCodeText } from "@/scripts/observe";

describe("observe codes", () => {
  test("known code → catalog copy (asserted against MESSAGE_CATALOG)", () => {
    const code = Object.keys(MESSAGE_CATALOG)[0];
    const out = resolveCodeText(code);
    const entry = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG];
    // out must include the entry's title or dougFacing text if present
    const expected = entry.title ?? entry.dougFacing ?? entry.crewFacing ?? "";
    if (expected) expect(out).toContain(expected);
    expect(out).toContain(code);
  });
  test("forensic / unknown code → benign not-in-catalog message, no throw", () => {
    const out = resolveCodeText("DEFINITELY_NOT_A_CATALOG_CODE_XYZ");
    expect(out.toLowerCase()).toContain("not in the message catalog");
  });
  test("no arg → lists all catalog codes", () => {
    const out = resolveCodeText(undefined);
    for (const c of Object.keys(MESSAGE_CATALOG).slice(0, 3)) expect(out).toContain(c);
  });
});
```

`tests/observe/dispatch.test.ts` — inject stub core fns; assert command routing, `--json`, infra_error → exit 1, `codes` never calls the DB, and the `--env` guardrail refusal path:

```ts
import { describe, expect, test } from "vitest";
import { runObserve } from "@/scripts/observe";

const okEvents = async () => ({ kind: "ok" as const, events: [], hasMore: false, nextCursor: null });
const deps = {
  queryEvents: okEvents,
  getCronHealth: async () => ({ kind: "ok" as const, jobs: [] }),
  queryAlerts: async () => ({ kind: "ok" as const, alerts: [] }),
  queryChangeLog: async () => ({ kind: "ok" as const, changes: [] }),
  env: { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "k" },
  nowMs: 0,
};

describe("runObserve", () => {
  test("events ok → exit 0, table", async () => {
    const r = await runObserve(["events"], deps);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("(no rows)");
  });
  test("infra_error → exit 1", async () => {
    const r = await runObserve(["events"], { ...deps, queryEvents: async () => ({ kind: "infra_error" as const, message: "down" }) });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("down");
  });
  test("codes never touches DB and ignores --env", async () => {
    let called = false;
    const r = await runObserve(["codes", "--env", "prod"], { ...deps, queryEvents: async () => { called = true; return okEvents(); } });
    expect(called).toBe(false);
    expect(r.exitCode).toBe(0);
  });
  test("ambient prod URL without --env → refuse (exit 1)", async () => {
    const r = await runObserve(["events"], { ...deps, env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "k" } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toLowerCase()).toContain("refusing non-local");
  });
});
```

- [ ] **Step 2: Run to verify fail.** `pnpm vitest run tests/observe/codes.test.ts tests/observe/dispatch.test.ts` — FAIL.

- [ ] **Step 3: Create `scripts/observe.ts`:**

```ts
// scripts/observe.ts
import { pathToFileURL } from "node:url";
import { parseArgs as _pa } from "node:util"; // (parseObserveArgs already wraps parseArgs)
import { MESSAGE_CATALOG, isMessageCode } from "@/lib/messages/lookup";
import { parseObserveArgs } from "./observe/args";
import { resolveTarget } from "./observe/env";
import { collectEvents } from "./observe/collect";
import { formatEvents, formatEventLineNdjson, formatAlerts, formatCron, formatChanges } from "./observe/format";
import { queryEvents as realQueryEvents } from "@/lib/observe/query/events";
import { getCronHealth as realGetCronHealth } from "@/lib/observe/query/cronHealth";
import { queryAlerts as realQueryAlerts } from "@/lib/observe/query/alerts";
import { queryChangeLog as realQueryChangeLog } from "@/lib/observe/query/changeLog";

export function resolveCodeText(code: string | undefined): string {
  if (code === undefined) {
    return Object.keys(MESSAGE_CATALOG)
      .map((c) => {
        const e = MESSAGE_CATALOG[c as keyof typeof MESSAGE_CATALOG];
        return `${c}  ${e.title ?? e.dougFacing ?? ""}`.trimEnd();
      })
      .join("\n");
  }
  if (!isMessageCode(code)) {
    return `Code "${code}" is not in the message catalog (may be a forensic log-only code).`;
  }
  const e = MESSAGE_CATALOG[code];
  const lines = [
    code,
    e.title ? `title: ${e.title}` : "",
    e.severity ? `severity: ${e.severity}` : "",
    e.dougFacing ? `admin: ${e.dougFacing}` : "",
    e.crewFacing ? `crew: ${e.crewFacing}` : "",
    e.helpfulContext ? `context: ${e.helpfulContext}` : "",
    e.helpHref ? `help: ${e.helpHref}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

type ObserveDeps = {
  queryEvents: typeof realQueryEvents;
  getCronHealth: typeof realGetCronHealth;
  queryAlerts: typeof realQueryAlerts;
  queryChangeLog: typeof realQueryChangeLog;
  env: NodeJS.ProcessEnv;
  nowMs: number;
};

export async function runObserve(
  argv: string[],
  deps: ObserveDeps,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const parsed = parseObserveArgs(argv);
  if (parsed.kind === "error") return { stdout: "", stderr: parsed.message, exitCode: 1 };
  const { command } = parsed;

  if (command === "help") {
    return { stdout: USAGE, stderr: "", exitCode: 0 };
  }
  if (command === "codes") {
    return { stdout: resolveCodeText(parsed.codeArg), stderr: "", exitCode: 0 };
  }

  // All DB commands go through the --env guardrail first.
  const target = resolveTarget(parsed.env, deps.env);
  if (target.kind === "error") return { stdout: "", stderr: target.message, exitCode: 1 };

  if (command === "cron") {
    const r = await deps.getCronHealth();
    if (r.kind === "infra_error") return { stdout: "", stderr: r.message, exitCode: 1 };
    return { stdout: formatCron(r.jobs, parsed.json, deps.nowMs), stderr: "", exitCode: 0 };
  }
  if (command === "alerts") {
    const r = await deps.queryAlerts(parsed.alertFilters);
    if (r.kind === "infra_error") return { stdout: "", stderr: r.message, exitCode: 1 };
    return { stdout: formatAlerts(r.alerts, parsed.json), stderr: "", exitCode: 0 };
  }
  if (command === "changes") {
    const r = await deps.queryChangeLog(parsed.changeFilters);
    if (r.kind === "infra_error") return { stdout: "", stderr: r.message, exitCode: 1 };
    return { stdout: formatChanges(r.changes, parsed.json), stderr: "", exitCode: 0 };
  }
  if (command === "events" || command === "tail") {
    const limit = parsed.limit ?? (command === "tail" ? 20 : 100);
    // tail --follow is handled by the entry runner (loop); here we do one poll.
    const r = await collectEvents(deps.queryEvents, parsed.eventFilters, limit);
    if (r.kind === "infra_error") return { stdout: "", stderr: r.message, exitCode: 1 };
    if (command === "tail" && parsed.json) {
      return { stdout: r.events.map(formatEventLineNdjson).join(""), stderr: "", exitCode: 0 };
    }
    return { stdout: formatEvents(r.events, parsed.json), stderr: "", exitCode: 0 };
  }
  return { stdout: "", stderr: `unhandled command ${command}`, exitCode: 1 };
}

const USAGE = `pnpm observe <events|alerts|cron|changes|codes|tail> [flags]
  events   [--show <uuid>] [--level info,warn,error] [--code C] [--source S] [--request R] [--q text] [--since 1h|24h|7d|all] [--limit N] [--json] [--env local|validation|prod]
  alerts   [--open] [--code C] [--limit N] [--json] [--env …]
  cron     [--json] [--env …]
  changes  [--show <uuid>] [--since …] [--limit N] [--json] [--env …]
  codes    [CODE]                (offline; --env ignored)
  tail     [--follow] [--interval S] [events filters…] [--json] [--env …]`;

// ---- Direct-run entry (not exercised by unit tests) ----
const isEntry = (() => {
  const a = process.argv[1];
  if (!a) return false;
  try {
    return import.meta.url === pathToFileURL(a).href;
  } catch {
    return false;
  }
})();

if (isEntry) {
  const deps: ObserveDeps = {
    queryEvents: realQueryEvents,
    getCronHealth: realGetCronHealth,
    queryAlerts: realQueryAlerts,
    queryChangeLog: realQueryChangeLog,
    env: process.env,
    nowMs: Date.now(),
  };
  const argv = process.argv.slice(2);
  const parsed = parseObserveArgs(argv);
  const follow = parsed.kind === "ok" && parsed.command === "tail" && parsed.follow;
  if (follow) {
    void runTailFollow(argv, deps);
  } else {
    void runObserve(argv, deps).then((r) => {
      if (r.stdout) process.stdout.write(r.stdout + "\n");
      if (r.stderr) process.stderr.write(r.stderr + "\n");
      process.exit(r.exitCode);
    });
  }
}

async function runTailFollow(argv: string[], deps: ObserveDeps): Promise<void> {
  const parsed = parseObserveArgs(argv);
  if (parsed.kind !== "ok") {
    process.stderr.write(parsed.message + "\n");
    process.exit(1);
  }
  const target = resolveTarget(parsed.env, deps.env);
  if (target.kind === "error") {
    process.stderr.write(target.message + "\n");
    process.exit(1);
  }
  const seen = new Set<string>();
  let high: { occurredAt: string; id: string } | null = null;
  const intervalMs = parsed.interval * 1000;
  let first = true;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await deps.queryEvents(parsed.eventFilters);
    if (r.kind === "infra_error") {
      process.stderr.write(`[tail] ${r.message}\n`);
    } else {
      const chrono = [...r.events].reverse();
      for (const e of chrono) {
        if (seen.has(e.id)) continue;
        const newer = !high || e.occurredAt > high.occurredAt || (e.occurredAt === high.occurredAt && e.id > high.id);
        if (first || newer) {
          process.stdout.write(parsed.json ? formatEventLineNdjson(e) : formatEvents([e], false) + "\n");
          seen.add(e.id);
          if (seen.size > 1000) seen.delete(seen.values().next().value as string);
          high = { occurredAt: e.occurredAt, id: e.id };
        }
      }
    }
    first = false;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}
```

> Remove the unused `_pa` import. `runTailFollow` is intentionally not unit-tested (infinite loop / timers); the pollable core (`runObserve`) IS tested. Keep `runTailFollow` minimal.

- [ ] **Step 4: Add the package.json script.** In `package.json` `"scripts"`, next to the other `tsx` runners, add:

```json
    "observe": "tsx scripts/observe.ts",
```

- [ ] **Step 5: Run to verify pass.** `pnpm vitest run tests/observe/codes.test.ts tests/observe/dispatch.test.ts` — PASS. Then smoke-run the real CLI against local Supabase: `pnpm observe cron` and `pnpm observe events --limit 5` — expect a table or `(no rows)`, exit 0.

- [ ] **Step 6: Commit.**

```bash
git add scripts/observe.ts package.json tests/observe/codes.test.ts tests/observe/dispatch.test.ts
git commit --no-verify -m "feat(observe): CLI entry, offline codes lookup, tail --follow, pnpm observe script"
```

---

### Task 12: DB-backed integration test (real local Supabase)

**Files:**
- Create: `tests/observe/queryCore.db.test.ts`

- [ ] **Step 1: Write the test** — connect-probe gate + seed via service-role client + read back. Derive expectations from the seeded fixture (never hardcoded).

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
let dbUp = false;
let admin: ReturnType<typeof createClient> | null = null;
const MARK = `observe-dbtest-${Math.trunc(Date.now())}`; // unique per run; Date.now allowed in test app code

beforeAll(async () => {
  try {
    admin = createClient(URL, KEY || "sb_secret_placeholder", { auth: { persistSession: false } });
    const { error } = await admin.from("app_events").select("id").limit(1);
    dbUp = !error;
  } catch {
    dbUp = false;
  }
  if (dbUp && admin) {
    await admin.from("app_events").insert({ level: "error", source: MARK, message: "db integration probe", code: "OBSERVE_DBTEST", context: {} });
  }
});
afterAll(async () => {
  if (dbUp && admin) await admin.from("app_events").delete().eq("source", MARK);
});

describe("read-core against local Supabase", () => {
  test.skipIf(!dbUp)("queryEvents reads the seeded row back by source filter", async () => {
    const { queryEvents } = await import("@/lib/observe/query/events");
    const r = await queryEvents({ source: MARK, sinceHours: 24 });
    if (r.kind !== "ok") throw new Error(r.message);
    expect(r.events.length).toBe(1);
    expect(r.events[0]).toMatchObject({ source: MARK, code: "OBSERVE_DBTEST", level: "error" });
  });
  test.skipIf(!dbUp)("queryAlerts returns ok (shape) and never surfaces context", async () => {
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const r = await queryAlerts({ limit: 5 });
    if (r.kind !== "ok") throw new Error(r.message);
    // AlertRow has no `context` field — structural guarantee
    for (const a of r.alerts) expect(a).not.toHaveProperty("context");
  });
  test.skipIf(!dbUp)("queryChangeLog returns ok (shape) without image fields", async () => {
    const { queryChangeLog } = await import("@/lib/observe/query/changeLog");
    const r = await queryChangeLog({ limit: 5 });
    if (r.kind !== "ok") throw new Error(r.message);
    for (const c of r.changes) {
      expect(c).not.toHaveProperty("beforeImage");
      expect(c).not.toHaveProperty("afterImage");
    }
  });
});
```

> The `app_events` insert here is test scaffolding (a `.db.test`), NOT read-core code — the read-only guarantee is about `lib/observe/query/**`, which this file is not. Cleanup deletes by the unique `MARK`.

- [ ] **Step 2: Run.** `pnpm vitest run tests/observe/queryCore.db.test.ts` — Expected: PASS (3 tests) against the running local Supabase, or SKIP if down. Confirm it does NOT error.

- [ ] **Step 3: Commit.**

```bash
git add tests/observe/queryCore.db.test.ts
git commit --no-verify -m "test(observe): DB-backed integration test against local Supabase"
```

---

### Task 13: docs — AGENTS.md section (tracked) + per-machine skill (untracked)

**Files:**
- Modify: `AGENTS.md`
- Create: `.claude/skills/observe/SKILL.md` (untracked — `.gitignore:54` ignores `.claude/`)

- [ ] **Step 1: Add the AGENTS.md section.** Append a new section (before "## Codex-specific notes" or after "## Routing convention" — pick a coherent spot) titled `## Telemetry access (observe CLI)` containing: the command table (from spec §4.1), the flag→filter mapping summary, the `--env` guardrail ("default local; a non-local `SUPABASE_URL` is refused unless you pass `--env validation|prod` with `SUPABASE_SECRET_KEY` set"), the read-only guarantee, and the per-source redaction posture (alerts.context and change-log images are not surfaced). Keep it ~30 lines.

- [ ] **Step 2: Create `.claude/skills/observe/SKILL.md`** with frontmatter `name: observe` + a description triggering on telemetry/log/debugging intent, and 4–5 canonical recipes pointing at `pnpm observe …`, deferring to the AGENTS.md section for the durable copy.

- [ ] **Step 3: Verify the skill is untracked.** Run: `git check-ignore -v .claude/skills/observe/SKILL.md` — Expected: prints a `.gitignore:54:.claude/` match (confirms untracked). `git status` must show ONLY `AGENTS.md` as modified, not the skill.

- [ ] **Step 4: Commit (AGENTS.md only).**

```bash
git add AGENTS.md
git commit --no-verify -m "docs(observe): AGENTS.md telemetry-access section (tracked cross-CLI source of truth)"
```

---

### Task 14: whole-feature verification gate

**Files:** none (verification only)

- [ ] **Step 1: Typecheck.** Run: `pnpm typecheck` — Expected: clean (vitest strips types; this catches TS errors the tests miss). Fix any `noUnusedLocals`/type issues (esp. the placeholder imports flagged in Tasks 8/11).
- [ ] **Step 2: Full observe suite.** Run: `pnpm vitest run tests/observe tests/admin/_metaInfraContract.test.ts tests/admin/_metaBoundedReads.test.ts` — Expected: all PASS.
- [ ] **Step 3: Full test suite.** Run: `pnpm test` — Expected: green (no regressions in the broader suite from the meta-test edits).
- [ ] **Step 4: Format.** Run: `pnpm format:check`. If it flags files, run `pnpm exec prettier --write <files>` and amend into the last commit or a `chore(observe): prettier` commit. (Never prettier the master spec.)
- [ ] **Step 5: Read-only guard sanity.** Run: `pnpm vitest run tests/observe/_metaReadOnlyQueryCore.test.ts` and `grep -rnE "\.(insert|update|delete|upsert|rpc)\(|@/lib/log" lib/observe/query` — Expected: meta-test PASS, grep returns nothing.

---

## Self-review

- **Spec coverage:** §2 architecture → Tasks 1–5; §3.1 queryEvents + pagination → Tasks 1, 9; §3.2 cron → Task 2; §3.3 alerts (context excluded) → Task 3; §3.4 changeLog (images excluded) → Task 4; §3.5 guards → Tasks 1/3/4/8; §4 CLI commands/flags/output → Tasks 8/10/11; §4.4 codes → Task 11; §4.5 tail → Task 11; §5 env guardrail → Task 7/11; §6 docs → Task 13; §7 testing/meta-tests → Tasks 5/6/12; §8 flag lifecycle → Task 8; §9 preempts → honored throughout. Covered.
- **Meta-test inventory** declared above; Tasks 5/6 create/extend.
- **Anti-tautology:** codes test asserts against `MESSAGE_CATALOG[code]` directly (Task 11); db test derives from the seeded `MARK` (Task 12); no hardcoded expected magic values.
- **Type consistency:** `QueryEventsResult`/`QueryAlertsResult`/`QueryChangeLogResult`/`QueryCronHealthResult`, `AlertRow`/`ChangeRow`, `collectEvents(queryFn,base,limit)`, `resolveTarget(env,ambient)`, `parseObserveArgs(argv)`, `runObserve(argv,deps)`, `resolveCodeText(code)` are consistent across tasks.
- **No advisory locks / no migration / no UI** — invariants 2 & 8 N/A; invariants 4, 9 honored.

## Adversarial review (cross-model)

- [ ] After self-review, invoke `adversarial-review` (Codex) on this plan. Iterate to APPROVE (no round budget). Class-sweep every finding; ship structural defenses in the same repair round if the same vector recurs 3×.

## Execution handoff

Autonomous-ship pipeline: after plan APPROVE, execute via **subagent-driven-development** (fresh subagent per task, two-stage review), honoring every Global Constraint. User plan-review gate is WAIVED.
