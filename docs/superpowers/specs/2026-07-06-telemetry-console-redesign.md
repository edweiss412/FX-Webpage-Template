# Spec — Telemetry Console Redesign (`/admin/dev/telemetry`)

**Date:** 2026-07-06
**Slug:** `telemetry-console-redesign`
**Register:** product (admin dashboard; design SERVES the task)
**Design mock:** `docs/superpowers/specs/2026-07-06-telemetry-console-redesign-mock/TelemetryConsole.dc.html` (Claude Design project `a056d616`, file `TelemetryConsole.dc.html`). Re-fetchable via DesignSync.
**Owner:** Opus / Claude Code (UI → invariant-8 dual-gate applies).

---

## 1. Goal

Rework `/admin/dev/telemetry` from a flat vertical stack into a real telemetry console:

1. A **live page header** — the existing `AutoRefreshControl` restyled into the mock's pill card (pulse dot + on/off switch + "Updated Ns ago" + manual refresh icon-button).
2. A NEW **at-a-glance overview strip** — 4 stat cards: System health, Open alerts (degraded/notice split), Cron jobs (healthy / total + stale/idle breakdown), Events · 24h (count + hourly sparkline + error/warn counts).
3. A **two-column body** — the event log is the hero on the left (a single divided, dense, log-style list with an inline-expandable row and the cron-run-summary card); **System health** and **Cron health** move into a fixed 340px right sidebar (cron health becomes a compact divided list, not the current 3-col grid).
4. A **filter toolbar** with removable **active-filter chips**.

Both dark and light are first-class (already true of the token system; no theme-mechanism change).

### 1.1 Non-goals

- No change to what events/alerts/cron data mean or how they are ingested. Read surfaces only.
- No change to the auth gate (`requireDeveloperIdentity`), the route path, or `parseAppEventFilters` semantics.
- No new user-facing error codes (§12.4 catalog untouched). Forensic `log.*` `code:` fields on the new read follow the existing `loadAppEvents` pattern (`APP_EVENTS_READ_*`), which are NOT catalog codes.
- No global `AlertBanner` / `#alerts` anchor (retired; `app/admin/layout.tsx:192`). The `#health` anchor stays (nav deep-links scroll to it).
- No `admin_alerts` / `crew_members` / `shows` mutation. No advisory-lock surface (invariant 2 N/A — see §12).

---

## 2. Resolved decisions

| # | Decision | Source |
|---|---|---|
| D1 | Build a **real 24h aggregate** for the Events card (count + per-hour buckets + level breakdown), not a JS approximation over the paginated page. | User answer. |
| D2 | The aggregate is a **read-only SQL function** `public.admin_event_stats_24h(_now timestamptz)` (single round-trip, indexed on `occurred_at`), called via `supabase.rpc(...)`. Not an unbounded row-fetch. | Efficiency; §5. |
| D3 | Ship **autonomously** to a merged PR (full AGENTS.md pipeline). | User answer. |
| D4 | **Zero new color tokens.** Every mock palette var maps 1:1 to an existing `@theme` token with matching hex (dark + light) — see §6. `app/globals.css` `@theme`/runtime blocks are NOT edited. | Verified against `app/globals.css:265-389`. |
| D5 | All numbers in the mock ("2 open alerts", "5/6 healthy", "42 events", "1,284") are **illustrative placeholders**. Real data drives every value. `CRON_JOBS` has **9** entries (`lib/cron/runSummary.ts:31-89`), so the cron card reads `X / 9`, computed from `jobs.length`. | Numeric sweep; §11. |
| D6 | The Open-alerts / System-health cards read from a new **`loadAlertSummary()`** (exact head counts, degraded/notice split) — NOT `fetchHealthRollup()`, whose `HealthStatus` exposes worst-kind + total but not the split. The detailed sidebar list keeps `HealthAlertsPanel`. | `lib/admin/healthRollup.ts:14-22`. |

---

## 3. Architecture

Server-rendered page (`export const dynamic = "force-dynamic"`), unchanged auth + filter parsing. New shape:

```
TelemetryPage (server)
├─ AdminPageHeader  title="Telemetry" sub="App event log & cron health"
│    rightSlot={<AutoRefreshControl/>}          ← restyled live control
├─ <TelemetryOverviewStrip … />                 ← NEW overview strip (4 stat cards)
└─ <div grid: minmax(0,1fr) / 340px>            ← two-column body (≥ lg); stacks below
     ├─ LEFT  (min-w-0)
     │    ├─ <EventFilters filters/>            ← toolbar + active-filter chips
     │    ├─ activity sub-header ("Activity" · "N events match · newest first")
     │    └─ <EventTimeline result now currentQuery/>   ← divided dense log
     └─ RIGHT (w-[340px] sidebar)
          ├─ <HealthAlertsPanel searchParams/>  ← "System health" (unchanged internals)
          └─ <CronHealthList jobs now/>         ← NEW compact divided cron list
```

### 3.1 Data loaded in the page (one `Promise.all`)

| Value | Source (existing unless NEW) | Feeds |
|---|---|---|
| `filters` | `parseAppEventFilters(sp)` (`lib/admin/telemetryTypes.ts:73`) | filters + log |
| `now` | `nowDate()` (`lib/time/now`) | relative times, sparkline window |
| `health` (cron) | `loadCronHealth()` (`lib/admin/loadCronHealth.ts:35`) → `LoadCronHealthResult` | cron card + `CronHealthList` |
| `events` | `loadAppEvents(filters)` (`lib/admin/loadAppEvents.ts:33`) → `LoadAppEventsResult` | activity log + "N match" |
| `alertSummary` | **NEW** `loadAlertSummary()` → `AlertSummary` | System-health + Open-alerts cards |
| `stats` | **NEW** `loadTelemetryStats(now)` → `LoadTelemetryStatsResult` | Events·24h card + sparkline |

`HealthAlertsPanel` continues to self-load its detail rows from `searchParams` (`dpage`/`npage`); it is not refactored. The one duplicated read (summary counts vs panel rows) is accepted — both are bounded exact/paged `admin_alerts` reads, and refactoring the panel is out of scope.

---

## 4. New read: `loadAlertSummary()`

`lib/admin/loadAlertSummary.ts`. **Snapshot-consistent (Codex R2 F2):** `total` and `degraded` are computed in ONE database statement via conditional aggregates over a single scan (the SQL function `admin_alert_summary`, §5.1), so `notice = total - degraded` is derived from one snapshot and is provably ≥ 0 (`DEGRADED_HEALTH_CODES ⊆ HEALTH_CODES`, both counted from the same `resolved_at is null` scan). Two separate head-count requests (the earlier design) could interleave with concurrent cron/admin alert writes and yield a negative/stale split — rejected.

```ts
export type AlertSummary =
  | { kind: "ok"; degraded: 0; notice: 0; total: 0 }
  | { kind: "degraded" | "notice"; degraded: number; notice: number; total: number }
  | { kind: "infra_error" };
export async function loadAlertSummary(): Promise<AlertSummary>;
```

- Calls `supabase.rpc("admin_alert_summary", { _health_codes, _degraded_codes })` on `createSupabaseServiceRoleClient()` (service_role reads `admin_alerts`). Codes passed as `text[]` params from `@/lib/adminAlerts/audience` (`HEALTH_CODES`, `DEGRADED_HEALTH_CODES`) — the code lists stay single-sourced in TS, never duplicated in SQL.
- Invariant 9: `const { data, error } = await supabase.rpc(...)`. PostgREST returns a one-row array; read `data?.[0]` → `{ total, degraded }` (bigints coerced via `Number`).
- `total === 0` → `{ kind:"ok", degraded:0, notice:0, total:0 }`.
- else `notice = total - degraded`; `kind = degraded > 0 ? "degraded" : "notice"`.
- `error` / thrown client / missing-malformed row → `{ kind:"infra_error" }`, logged `code:"ALERT_SUMMARY_READ_RETURNED_ERROR"` / `_THREW` (forensic, not catalog).

**Guard conditions:** `infra_error` → System-health card renders "Unavailable" (neutral, not alarming) + Open-alerts card renders "—"; never throws, never shows a raw error string (invariant 5).

---

## 5. New reads: two read-only SQL functions + wrappers

One migration adds **two** `stable` functions: `admin_event_stats_24h` (Events card) and `admin_alert_summary` (System-health + Open-alerts cards, single-snapshot). Both read-only; no table mutation, no CHECK/enum change.

### 5.1 SQL functions (one migration)

`supabase/migrations/<ts>_telemetry_console_reads.sql`:

```sql
create or replace function public.admin_event_stats_24h(_now timestamptz default now())
returns table (total bigint, error_count bigint, warn_count bigint,
               info_count bigint, buckets int[])
language sql stable
as $$
  with win as (
    select date_trunc('hour', _now) as cur_hour
  ),
  -- MATERIALIZED: one indexed scan of the 24h window, reused below (Codex plan-R1 F2).
  ev as materialized (
    select occurred_at, level
    from public.app_events, win
    where occurred_at >= win.cur_hour - interval '23 hours'
      and occurred_at <  win.cur_hour + interval '1 hour'
  ),
  totals as (                                       -- ONE scan of ev, filtered aggregates
    select count(*)::bigint                                as total,
           count(*) filter (where level = 'error')::bigint as error_count,
           count(*) filter (where level = 'warn')::bigint  as warn_count,
           count(*) filter (where level = 'info')::bigint  as info_count
    from ev
  ),
  per_hour as (                                     -- group events into hour buckets ONCE
    select date_trunc('hour', occurred_at) as h, count(*)::int as c
    from ev group by 1
  ),
  hours as (                                        -- the 24 target hours (0 oldest, 23 current)
    select gs.h_idx,
           (select cur_hour from win) - make_interval(hours => 23 - gs.h_idx) as h_ts
    from generate_series(0, 23) as gs(h_idx)
  ),
  bucketed as (                                     -- 24 rows LEFT JOIN <=24 grouped rows (no cross join)
    select hours.h_idx, coalesce(per_hour.c, 0) as c
    from hours left join per_hour on per_hour.h = hours.h_ts
  )
  select totals.total, totals.error_count, totals.warn_count, totals.info_count,
         (select array_agg(c order by h_idx)::int[] from bucketed)
  from totals;
$$;

revoke all on function public.admin_event_stats_24h(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_event_stats_24h(timestamptz) to service_role;

-- Single-snapshot alert summary (Codex R2 F2): total + degraded from ONE scan.
create or replace function public.admin_alert_summary(_health_codes text[], _degraded_codes text[])
returns table (total bigint, degraded bigint)
language sql stable
as $$
  select
    count(*)::bigint,
    count(*) filter (where code = any(_degraded_codes))::bigint
  from public.admin_alerts
  where resolved_at is null and code = any(_health_codes);
$$;

revoke all on function public.admin_alert_summary(text[], text[]) from public, anon, authenticated;
grant execute on function public.admin_alert_summary(text[], text[]) to service_role;
```

- Both **read-only** (`stable`, no writes) → NOT subject to PostgREST DML lockdown (that governs table mutation). `service_role` already reads `app_events` + `admin_alerts`; `SECURITY INVOKER` (default) suffices.
- `admin_event_stats_24h` window = the 24 clock-hours ending with the current partial hour; `buckets[24]` chronological (index 0 oldest, 23 current); `total` counts the same window (sum of buckets == total, test-asserted). Indexed by `app_events_occurred_at_idx (occurred_at desc)` (`supabase/migrations/20260629000002_app_events.sql:17`) and `app_events_level_idx`.
- `admin_alert_summary` counts unresolved rows in `_health_codes` (`total`) and the `_degraded_codes` subset (`degraded`) in ONE scan → snapshot-consistent; `notice = total - degraded ≥ 0` guaranteed (`DEGRADED_HEALTH_CODES ⊆ HEALTH_CODES`).
- **Migration lifecycle — the parity gate does NOT cover functions (Codex R2 F1).** `pnpm gen:schema-manifest` introspects only **base-table columns**; `tests/db/validation-schema-parity.test.ts` compares columns/tables. A function-only migration produces **no manifest delta**, so the parity gate CANNOT prove these functions reached validation. Therefore: (1) apply the migration locally + run the function tests; (2) apply surgically to the validation project via `supabase db query --linked` + `notify pgrst, 'reload schema'`; (3) the **deployment proof is the DB integration test** (§14) that RPC-calls both functions against `TEST_DATABASE_URL` and FAILS if either function is absent or lacks the `service_role` grant — this is the real gate, run in the db-touching CI job (same job as `validation-schema-parity`, which has `TEST_DATABASE_URL`). `gen:schema-manifest` is still run (no delta expected; a delta would signal an unintended table change). `create or replace` + `revoke`/`grant` are idempotent (apply-twice safe). No CHECK/enum change (§12 matrix N/A).

### 5.2 Wrapper

`lib/admin/loadTelemetryStats.ts`:

```ts
export type TelemetryStats = {
  total: number; errorCount: number; warnCount: number; infoCount: number;
  buckets: number[]; // length 24, chronological, oldest→current
};
export type LoadTelemetryStatsResult =
  | { kind: "ok"; stats: TelemetryStats }
  | { kind: "infra_error"; message: string };
export async function loadTelemetryStats(now: Date): Promise<LoadTelemetryStatsResult>;
```

- Uses `createSupabaseServiceRoleClient()` (`@/lib/supabase/server`) — same client as `loadAppEvents`.
- `const { data, error } = await supabase.rpc("admin_event_stats_24h", { _now: now.toISOString() })` (invariant 9). PostgREST returns a one-row array; read `data?.[0]`.
- `error` or missing/malformed row → `{ kind:"infra_error", message:"telemetry stats read failed" }`, logged with forensic `code: "TELEMETRY_STATS_READ_RETURNED_ERROR"` / `_THREW` (parity with `loadAppEvents`'s `APP_EVENTS_READ_*`). Never a catalog code.
- **Strict row validation before returning `ok` (Codex plan-R1 F1) — a drifted/partial function shape must degrade, not render NaN.** Coerce each of `total`/`error_count`/`warn_count`/`info_count` via `Number(...)` and require every one to be a **finite non-negative integer**; require `buckets` to be an **array of exactly 24** finite non-negative integers (each coerced). If ANY check fails (non-numeric, `NaN`/`Infinity`, negative, wrong length, non-array), return `infra_error` (logged `TELEMETRY_STATS_READ_RETURNED_ERROR`) — NOT `ok` with `[]`/NaN. A shared `isNonNegInt(n)` guard is used. Tests cover: partial row (missing a field), non-numeric value, non-array buckets, wrong bucket length (≠24), and `NaN`/`Infinity`.

**Guard conditions:** `infra_error` → Events·24h card renders count "—", sparkline shows a flat baseline, breakdown line "Unavailable". `total === 0` → count "0", sparkline flat baseline (all bars min-height), breakdown "No events in 24h".

---

## 6. Token mapping (D4 — zero new tokens)

Every mock CSS var → existing `@theme` token. Verified dark (`app/globals.css:352-389`) and light (`:265-302`) hex match exactly.

| Mock var | `@theme` token / Tailwind util | Dark hex | Light hex |
|---|---|---|---|
| `--bg` | `bg-bg` | `#0F1014` | `#FAFAF9` |
| `--surface` | `bg-surface` | `#16171C` | `#FFFFFF` |
| `--raised` | `bg-surface-raised` | `#1C1D23` | `#FFFFFF` |
| `--sunken` | `bg-surface-sunken` | `#0B0C10` | `#F4F3F1` |
| `--text` / `--strong` / `--subtle` / `--faint` | `text-text` / `-text-strong` / `-text-subtle` / `-text-faint` | matches | matches |
| `--border` / `--bstrong` | `border-border` / `border-border-strong` | `#2A2B30` / `#3A3B40` | `#E5E4E0` / `#CFCDC7` |
| `--accent` / `--accent-text` / `--accent-on-bg` / `--accent-tint` | `accent` / `accent-text` / `accent-on-bg` / `accent-tint` | matches | matches |
| `--warnbg` / `--warntext` | `warning-bg` / `warning-text` | `#3A2E14` / `#FFD68A` | `#FFF3D6` / `#5C3F00` |
| `--dangerbg` | `danger-bg` | `#3A1E1C` | `#FBEAE8` |
| `--pos` / `--pos-text` | `status-positive` / `status-positive-text` | `#5FB0A8` / `#74C3BB` | `#3F8A83` / `#2C655F` |
| `--review` / `--review-text` | `status-review` / `status-review-text` | `#E0B84E` / `#F0C860` | `#A87716` / `#6E4E00` |
| `--warn` / `--warns-text` | `status-warn` / `status-warn-text` | `#E9A23A` / `#F0B454` | `#B26A16` / `#7A3D00` |
| `--degraded` / `--degraded-text` | `status-degraded` / `status-degraded-text` | `#E5534B` / `#1A1A1A` | `#B3261E` / `#FFFFFF` |
| `--idle` / `--idle-text` | `status-idle` (=`text-faint`) / `status-idle-text` (=`text-subtle`) | matches | matches |
| `--shadow` / `--pop` | `shadow-tile` / `shadow-popover` | matches | matches |

Notice weight has **no** dedicated token; the mock styles it with `--sunken` → `bg-surface-sunken` (already how `HealthAlertsPanel` styles notice). Consistent.

Spacing/radius: use existing tokens — `p-tile-pad` (20px), `gap-tile-gap` (16px), `gap-section-gap` (32px), `rounded-md` (12px), `rounded-sm` (6px), `rounded-pill`. Card internal padding in the mock is 14-16px; use `p-4` (16px) where `tile-pad` (20px) is too roomy for the dense stat cards — this is an intentional density choice, stated per-component in §7. The 340px sidebar uses arbitrary `w-[340px]` (no `--spacing-panel-*` token matches 340; `panel-max` is 480). No token added — one arbitrary width literal, cited here.

---

## 7. Component specs

Every interactive element declares default/hover/focus/active/disabled where it exists (product-register requirement). Focus rings use `focus-ring` token / existing `:focus-visible` conventions.

### 7.1 `AutoRefreshControl` (restyle; `components/admin/telemetry/AutoRefreshControl.tsx`, stays `"use client"`)

Keeps ALL existing behavior (20s interval, scroll+visibility gates, localStorage `fxav.telemetry.autorefresh`, `router.refresh()`, "Updated Ns ago" 1s ticker, `data-testid` `autorefresh-toggle` / `-manual` / `-updated`). Restyle only:

- Outer becomes the mock pill card: `inline-flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-1.5 shadow-tile` (was a bare `flex … text-xs`).
- **Pulse dot** (new, leading): an 8px accent dot with a `tping` ping ring. Motion via a keyframe (see §9). `aria-hidden`. Rendered ONLY when `on` (a live indicator means "actively refreshing"); when `off`, the dot is a static faint dot (no ping) so the control still reads as present.
- **"Auto-refresh"** label (`text-sm text-text`).
- **Switch:** the toggle button becomes a 34×20 track switch (thumb `translateX` on/off) instead of a text pill. Retains `role`/`aria-pressed`/`data-testid="autorefresh-toggle"`, `min-h-tap-min` hit area preserved via padding/tap target wrapper (WCAG 2.5.5 — the visible switch is 20px but the button's tap target stays ≥44px via `min-h-tap-min` + padding). Label for SR: "Auto-refresh on/off" (unchanged).
- Vertical divider (`w-px h-[18px] bg-border`), then **"Updated Ns ago"** (`text-xs text-text-faint tabular-nums`, `data-testid="autorefresh-updated"`).
- **Manual refresh** becomes a 30px icon-button (rotate-cw lucide icon) `rounded-sm border border-border`, `data-testid="autorefresh-manual"`, `aria-label="Refresh now"`, `min-h-tap-min` tap target. Hover: `bg-surface-sunken`.

Guard: `agoLabel === null` (pre-first-refresh) → the "Updated" span is omitted (existing behavior). Reduced-motion → ping animation suppressed (§9).

### 7.2 `TelemetryOverviewStrip` (NEW server component)

`components/admin/telemetry/TelemetryOverviewStrip.tsx`.
Props:
```ts
{
  alertSummary: AlertSummary;
  cron: LoadCronHealthResult;
  stats: LoadTelemetryStatsResult;
  now: Date;
}
```
Renders `<div data-testid="telemetry-overview-strip" className="grid grid-cols-1 gap-tile-gap sm:grid-cols-2 xl:grid-cols-4">` of 4 `StatCard`s. Each card: `flex flex-col gap-2 rounded-md border border-border bg-surface p-4 shadow-tile`; an uppercase micro-label (`text-[10px] font-semibold uppercase tracking-[0.12em] text-text-subtle`), a value row, a sub-line.

Card content + guards:

1. **System health** — from `alertSummary.kind`: `ok`→status-positive dot + "Healthy" + "All clear"; `notice`→status-review dot + "Notice" + "N to review"; `degraded`→status-degraded dot + "Degraded" + "N issue(s) need action"; `infra_error`→status-idle dot + "Unavailable" + "Health check failed". `data-testid="stat-system-health"`.
2. **Open alerts** — `alertSummary`: big `total` (tabular) + split "N degraded · N notice" (degraded dot status-degraded, notice dot status-idle). `ok`→"0" + "No open alerts". `infra_error`→"—" + "Unavailable". `data-testid="stat-open-alerts"`.
3. **Cron jobs** — `cron.kind==="ok"`: compute via `summarizeCronHealth(cron.jobs, now)` (§7.6) → `healthy / total` (total = `jobs.length` = 9) + breakdown "N stale · N idle" (+ "N issues" when review>0; omit any zero segment). `infra_error`→"—" + "Cron health unavailable". `data-testid="stat-cron"`.
4. **Events · 24h** — `stats.kind==="ok"`: big `total` (tabular) + `<EventVolumeSparkline buckets={stats.stats.buckets}/>` + "N errors · N warns" (omit a segment when its count is 0; if both 0 → "No errors or warnings"). `total===0`→"0" + flat sparkline + "No events in 24h". `infra_error`→"—" + flat sparkline + "Unavailable". `data-testid="stat-events"`.

All four cards are the SAME shell (consistent affordance) but deliberately NOT identical grids — content differs (dot+word, big number, ratio+breakdown, number+sparkline). This satisfies the "no identical card grid" ban: same container, distinct internal composition.

### 7.3 `EventVolumeSparkline` (NEW server component)

`components/admin/telemetry/EventVolumeSparkline.tsx`. Props `{ buckets: number[] }`.
- Renders `<span data-testid="event-sparkline" className="flex items-end gap-[2px] h-[22px]" role="img" aria-label="…">` of N bars (one per bucket).
- Bar height: linear-scaled to `[3px, 22px]` against `max(...buckets, 1)`. The **last** bar (current hour) uses `bg-accent`; the rest `bg-border-strong`.
- `aria-label` = human summary e.g. "Event volume over the last 24 hours" (no per-bar labels; decorative granularity).
- Guard: `buckets` empty or all-zero → all bars at 3px baseline (flat), still renders (never collapses to 0-height). `buckets.length` may be <24 defensively; scales to whatever length given.

### 7.4 `EventFilters` (restyle + chips; `components/admin/telemetry/EventFilters.tsx`, stays `"use client"`)

Keeps ALL behavior: level toggles (`filter-level-{lvl}`), `filter-since` select, source/code/showId/requestId + `q` text inputs (Enter-only commit), `buildFilterHref` + `router.push`, remount-on-`spKey`. Restyle into the mock toolbar + add chips:

- Wrap controls in a card: `rounded-md border border-border bg-surface p-3 shadow-tile flex flex-col gap-2.5`.
- Row 1: search input grows (`flex-1`), the three level toggles become a **segmented control** (single bordered group, dividers between; active = `bg-accent text-accent-text`, inactive = `text-text-subtle`), the `since` select styled as a bordered pill.
- Row 2 (NEW): **active-filter chips** via `<ActiveFilterChips filters={filters}/>` — one removable chip per ACTIVE filter (each active level; source; code; showId; requestId; q; non-default since). "Active:" prefix label; "Clear filters" link at the end. Rendered only when ≥1 filter is active; otherwise Row 2 is omitted. Existing "Showing one request" inline pill (requestId branch) is replaced by the chip.

### 7.5 `ActiveFilterChips` (NEW client component)

`components/admin/telemetry/ActiveFilterChips.tsx`, `"use client"`. Props `{ filters: AppEventFilters }`.
- For each active filter, a chip: `inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken pl-2.5 pr-1.5 py-0.5 text-xs text-text` with an X icon-button (`data-testid="chip-remove-{key}"`, `aria-label="Remove {label} filter"`, `min-h-tap-min` tap target). Removing pushes `buildFilterHref` with that key patched out (level chips remove one level; `since` chip resets to default 24h by deleting `since`).
- "Clear filters" (`data-testid="clear-filters"`) → `router.push(BASE)` (all filter keys removed).
- Chip label copy: `warn` / `error` / `info` (level); `source: {v}` / `code: {v}` (mono); `show: {v}` (truncated 8-char for UUID); `request: {v}` (8-char); `"{q}"` (search); `Last hour` / `Last 7 days` / `All time` (since ≠ 24h). Guard: empty filter set → renders nothing (parent omits the row).

### 7.6 `CronHealthList` (NEW server component) + `summarizeCronHealth`

`components/admin/telemetry/CronHealthList.tsx`. Props `{ jobs: CronHealthRow[]; now: Date }`.
- `<section aria-labelledby="cron-health-heading">` + `<h2>` "Cron health" (`text-[15px] font-semibold text-text-strong`).
- A single card `rounded-md border border-border bg-surface shadow-tile overflow-hidden` containing one divided row per job (`border-t border-border` between rows). Each row (`data-testid="cron-health-row"`): left = `job.label` (`text-[13px] font-semibold text-text-strong`) over cadence (`text-[11px] text-text-faint`); right = `effectiveCronStatus(job, now)` (`cronHealthStatus.ts`) → colored dot + `status.label` (e.g. "OK · 2m", "Stale · 41m", "No run seen") + optional counts line (`·`-joined tabular). A stale/failed (warn) row tints its background `bg-warning-bg`.
- Replaces `CronHealthHeader` **on the telemetry page only**. `CronHealthHeader.tsx` is **RETAINED** (verified second consumer: the dimension harness `app/admin/dev/telemetry-dim/page.tsx:40,108`, plus `tests/components/telemetry/cronHealthHeader.test.tsx` and the transition-audit fixture list). The telemetry page swaps its import to `CronHealthList`; `CronHealthHeader` + its tests are untouched.
- `summarizeCronHealth(jobs, now)` (colocated helper, exported for the strip + tests): returns `{ healthy, stale, idle, review, total }` where `healthy = count(status ∈ {live, positive})`, `stale = count(status==="warn")`, `idle = count(status==="idle")`, `review = count(status==="review")`, `total = jobs.length`. Pure; unit-tested against fixture rows.

### 7.7 `EventTimeline` + `EventRow` (restyle to divided log)

`EventTimeline.tsx` (server) — the list container becomes ONE bordered card with internal dividers instead of gapped separate cards:
- `<ul data-testid="event-log" className="… rounded-md border border-border bg-surface shadow-tile overflow-hidden">`; each `EventRow` `<li>` gets `border-t border-border` (first row none). Keeps `overflow-anchor` wrapper, the "Showing N most recent" note, and `event-timeline-load-older`. infra_error / empty branches unchanged (`event-timeline-degraded`, `EmptyState`).

`EventRow.tsx` (stays `"use client"`) — restyle only, behavior (expand, `useReducedMotion`, `AnimatePresence` height disclosure, `event-row-toggle-{id}`) preserved:
- `<li>` loses its own `rounded-md border … p-tile-pad` card chrome; becomes a flush divided row `px-4 py-3.5` (the divider comes from the parent `border-t`).
- An **error** row tints `bg-danger-bg` (mock row 1). Level badge, message, source+code, relative time, requestId pill, chevron layout matches the mock (chevron rotates 180° when open).
- The inline-expanded detail (`ContextDetail`) and `CronRunSummaryCard` render unchanged inside the expanded region.

### 7.8 `page.tsx` (relayout)

`app/admin/dev/telemetry/page.tsx` — the `Promise.all` gains `loadAlertSummary()` + `loadTelemetryStats(now)`; JSX becomes header → `TelemetryOverviewStrip` → two-column grid (left: `EventFilters` (Suspense) + activity sub-header + `EventTimeline`; right: `HealthAlertsPanel` + `CronHealthList`). The `cron-health-degraded` fallback (when `health.kind !== "ok"`) moves into the sidebar. Activity sub-header shows the live match count from `events` (`events.kind==="ok" ? events.events.length : 0` with "N events match · newest first"; when `hasMore`, "N+ events" is avoided — use "Showing recent events" copy, see §11).

---

## 8. Dimensional invariants

Tailwind v4 here does NOT default `.flex` to `align-items: stretch` (`memory/feedback_tailwind_v4_flex_items_stretch`). Every fixed-dimension parent→child relationship is explicit and Playwright-asserted (jsdom insufficient).

| Parent (fixed dim) | Child | Invariant | Guaranteeing class/style |
|---|---|---|---|
| Overview strip grid rows | 4 `StatCard`s | equal-height cards in a row | `grid` + `items-stretch` (grid default) + card `h-full`; assert each card height == row height |
| Sparkline container `h-[22px]` | bars | every bar ≤ 22px, ≥ 3px, `items-end` bottom-aligned | container `flex items-end h-[22px]`; bar inline `style={{height}}`; assert `bar.height ∈ [3,22]` and `bar.bottom == container.bottom` |
| Two-column body grid | left col / right sidebar | sidebar exactly 340px at ≥xl; left fills remainder (`minmax(0,1fr)`) | `grid xl:grid-cols-[minmax(0,1fr)_340px]`; assert sidebar width == 340 (±0.5) at ≥1200px, and body doesn't horizontally overflow |
| Segmented level control | 3 segments | equal height, no baseline shift | `inline-flex` + segments `min-h-tap-min`; assert equal heights |
| Auto-refresh switch track 34×20 | thumb 16×16 | thumb vertically centered, travels 14px | absolute thumb `top-0.5`, `translateX(14px)` on; assert thumb within track bounds both states |

Below `xl` the body is single-column (`grid-cols-1`) — the sidebar drops below the log; assert stack order (overview → filters → log → health → cron) and no 340px constraint applies.

---

## 9. Transition inventory

Motion is minimal (product register: motion conveys state, not decoration). Reduced-motion collapses all.

| Element | States | Treatment |
|---|---|---|
| Auto-refresh pulse dot | on (ping) / off (static) | `tping` keyframe (scale 1→2.6, opacity .55→0, 2.4s, `cubic-bezier(.16,1,.3,1)` infinite) on the ping ring ONLY when `on`; toggling on↔off swaps ping↔static instantly (no cross-fade). Reduced-motion: no ping (static dot both states). |
| Auto-refresh switch thumb | on / off | `transform: translateX` transition `duration-fast` (120ms) `ease-out-quart`. transform only (not layout). Reduced-motion: instant. |
| Event row disclosure | collapsed / expanded | EXISTING `AnimatePresence` height+opacity, `0.22s` ease `[0.25,1,0.5,1]`, reduce→0. Chevron rotate 180° instant. Unchanged. |
| Chevron (row) | closed / open | `rotate(180deg)`, instant (matches existing). |
| Overview strip / stat cards | mount | none (product: no orchestrated page-load). Instant render. |
| Sparkline bars | data change (auto-refresh re-render) | none — server-rendered new heights on refresh; no bar animation (avoid animating on every 20s poll). |
| Active-filter chips | add / remove | none — navigation re-render (router.push reloads server component). Instant. |
| Two-column ↔ single-column | breakpoint cross | none (CSS grid reflow; not animated). |

Compound: toggling auto-refresh (pulse swap) while an event row is mid-expand — independent DOM subtrees, no shared animation state; both proceed without interference (asserted in transition-audit task). The `tping` keyframe is defined once in `app/globals.css` (component-scoped `<style>` is not available in RSC without a client boundary; the keyframe already appears in the mock — add it to `globals.css` under a comment, or scope it in the client `AutoRefreshControl` via a module-level `<style jsx>`-free approach: define `@keyframes tping` in `globals.css`). Decision: add `@keyframes tping` to `globals.css` (one keyframe block, not a token) — the only `globals.css` edit in this feature; it is NOT an `@theme` token change.

---

## 10. Responsive behavior

- Overview strip: `grid-cols-1` (mobile) → `sm:grid-cols-2` → `xl:grid-cols-4`.
- Body: `grid-cols-1` (mobile/tablet) → `xl:grid-cols-[minmax(0,1fr)_340px]`. Sidebar stacks BELOW the log when single-column (System health then Cron health).
- Filter toolbar Row 1 wraps (`flex-wrap`); search keeps `min-w-[200px]`. Chips row wraps.
- The page inherits the admin shell max width `max-w-[1600px]` (`app/admin/layout.tsx:182`); at 1600px the log gets ~1220px, matching the mock's 1200px shell.
- Mobile (390px, crew-floor context is admin-desk here but still): everything single-column; all tap targets ≥44px (`min-h-tap-min`); the log rows stay readable (message truncates, meta wraps).

---

## 11. Numeric sweep / self-consistency

- Cron total is `jobs.length` (**9**), never a literal. Mock "6" is illustrative (D5).
- Sparkline bucket count = **24** (hourly, 24h window). `total === sum(buckets)` — test-asserted.
- Stat-card values are all live; no hardcoded "2"/"1,284"/"42" reach the DOM.
- Activity match-count copy: `events.kind==="ok"` → if `hasMore` render "Showing recent events · newest first" (avoids implying an exact total when the page is capped at `PAGE_SIZE=100`); else "{events.length} events · newest first". Never "42".
- `PAGE_SIZE = 100` (`telemetryTypes.ts:1`) unchanged; "Showing the N most recent" note stays in `EventTimeline`.
- Auto-refresh interval 20s, scroll gate 200px, updated-ticker 1s — all unchanged constants (`AutoRefreshControl.tsx`).

---

## 12. Invariant applicability (self-review matrix)

| Invariant | Applies? | Disposition |
|---|---|---|
| 1 TDD per task | YES | Every task: failing test → impl → green → commit. |
| 2 Per-show advisory lock | **N/A** | No mutation of `shows`/`crew_members`/`crew_member_auth`/`pending_*`. All new reads are `SELECT`/`count`/`stable` function. Declared N/A. |
| 3 Email canonicalization | N/A | No email handling. |
| 4 No global sync cursor | N/A | No sync path touched. |
| 5 No raw error codes in UI | YES | `infra_error` branches render human copy ("Unavailable", "Cron health unavailable"); no code strings in DOM. Forensic `code:` on logs only. |
| 6 Commit per task | YES | Conventional commits, `feat(admin):` / `test(admin):` / `feat(db):` for the migration. |
| 7 Spec canonical | YES | This spec governs. |
| 8 UI dual-gate (impeccable) | YES | `/impeccable critique` + `/impeccable audit` on the UI diff before cross-model review; HIGH/CRITICAL fixed or `DEFERRED.md`. |
| 9 Supabase call-boundary | YES | `loadAlertSummary` + `loadTelemetryStats` destructure `{ data/count, error }`; infra faults → typed `{ kind:"infra_error" }`; never silent. **Both registered in `tests/admin/_metaInfraContract.test.ts` `infraRegistry`** (structural fail-by-default guard) — see §13 for per-helper coverage shape. |
| 10 Mutation-surface observability | **N/A** | No new mutating route/action. Page + new loaders are read-only. Declared N/A. |
| Cross: PostgREST DML lockdown | N/A | New function is read-only; no RPC-gated table introduced. |
| Cross: migration→validation parity | YES (with caveat) | §5.1: local apply + validation surgical apply. **`validation-schema-parity` does NOT cover functions** (columns only) — the deployment proof is the `tests/db/telemetryConsoleReads.test.ts` RPC-existence test against `TEST_DATABASE_URL` (Codex R2 F1). `gen:schema-manifest` run (no delta expected). |
| Cross: §12.4 catalog | N/A | No new user-facing code. Forensic log codes are outside the catalog namespace (parity with `APP_EVENTS_READ_*`). |

**Tier × domain matrix (surcharge):** N/A — this feature touches no user/client/booking/shift tier and no surcharge domain. Declared explicitly.
**CHECK/enum migration matrix:** N/A — the migration adds a `stable` function only; no CHECK/enum/column change.
**Flag lifecycle:** the only toggle is the existing auto-refresh (`fxav.telemetry.autorefresh` localStorage → `on` state → gates the 20s interval). No new flag. Not a zombie (stored, read, and it gates the interval effect). Unchanged.

---

## 13. Meta-test inventory

- **Supabase call-boundary (invariant 9) — the structural guard is `tests/admin/_metaInfraContract.test.ts`, NOT the auth one.** `loadAlertSummary` + `loadTelemetryStats` are new Supabase readers under `lib/admin/`; the admin-domain call-boundary meta-test already carries an `infraRegistry` where the precedent readers `loadAppEvents` (`:328`), `loadCronHealth`, `fetchHealthRollup` (`:249`), `loadHealthAlerts` (`:255`), `loadBellFeed` (`:272`) are registered. **Both new loaders MUST be added as registry rows** (the invariant-9 "analogous registry-style meta-test for new surfaces" requirement; a bare behavioral test is NOT sufficient — a NEW admin Supabase reader must fail-by-registry until listed). Coverage shape per helper:
  Both new loaders now call `supabase.rpc(...)` (`admin_alert_summary` / `admin_event_stats_24h`), so both follow the `loadBellFeed` registry pattern: the shared mock's `rpc()` is NOT fn-keyed (returns `{data:null,error:null}`, cannot be driven to throw from the harness — noted at `:263-271`). Each registry row therefore sets `skipGrepShape: true` (like the named-client rows at `:315`/`:325`), pins the **construction-throw** path via the harness, and the **rpc-returned-`{error}`** + **rpc-throw** + **malformed/missing-row** paths are covered behaviorally in dedicated `tests/admin/loadAlertSummary.test.ts` + `tests/admin/loadTelemetryStats.test.ts` (each asserting `const { data, error } = await supabase.rpc(...)` discipline → `{ kind:"infra_error" }`). Both also get happy-path + bigint-coercion unit tests. §12 invariant-9 row and §4/§5.2 error-path claims reference this same registry.
- **Function deployment guard (Codex R2 F1 / R3 F2) — `validation-schema-parity` is insufficient for function-only migrations, and the guard must check the `service_role` grant explicitly.** The manifest/parity gate sees base-table columns only; **functions produce NO manifest delta** (no "must land in manifest" requirement — that would be impossible). The real deployment proof is `tests/db/telemetryConsoleReads.test.ts` (§14), which asserts for BOTH functions: (a) EXISTS (`to_regprocedure('public.admin_event_stats_24h(timestamptz)')` / `('public.admin_alert_summary(text[],text[])')` not null); (b) **`has_function_privilege('service_role', '<signature>', 'EXECUTE')` TRUE** (the app calls via `service_role`; a plain "connecting role can execute" check passes as owner even with the grant missing — R3 F2); (c) `has_function_privilege('anon'|'authenticated'|'public', …, 'EXECUTE')` FALSE; (d) deterministic behavior via rollback-tx direct SQL; and (e) **a real `createSupabaseServiceRoleClient().rpc(...)` smoke over the PostgREST path with exact runtime param names (R4 F1)** — the surface that catches a stale schema cache / param-name drift that (a)-(d) miss. Missing function, missing grant, or a broken RPC path → test FAILS → forces the correct validation apply + schema reload. Runs in the db-touching CI job.
- **`validation-schema-parity`** (`tests/db/validation-schema-parity.test.ts`): unchanged and UNAFFECTED — it compares base-table columns/tables only. This migration adds no table/column, so it produces no parity delta and is NOT the guard for the functions (see the bullet above). `gen:schema-manifest` is still run as a discipline check (a non-empty delta would signal an unintended table change).
- No new advisory-lock surface → `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched (declared).
- No new admin-mutation surface → `tests/log/_metaMutationSurfaceObservability.test.ts` untouched (read-only page; declared).
- No `admin_alerts.upsert` catalog change → `_metaAdminAlertCatalog.test.ts` untouched.

---

## 14. Testing strategy

- **Both SQL functions (DB) — `tests/db/telemetryConsoleReads.test.ts`, the deployment guard.** Integration test against `TEST_DATABASE_URL`.
  - **Isolation (Codex R3 F1) — MANDATORY rollback-transaction.** Each behavioral case opens a direct pg connection (postgres.js on `TEST_DATABASE_URL`), `BEGIN`, seeds fixture rows, calls the function IN THE SAME TRANSACTION via `select * from public.admin_event_stats_24h(:_now)` / `admin_alert_summary(:h,:d)` (same-tx visibility — NOT via PostgREST), asserts, then `ROLLBACK`. No committed writes touch the persistent DB; no reliance on the DB being empty; no destructive cleanup of real telemetry. To further isolate `admin_event_stats_24h` from any rows a concurrent session committed before our snapshot, seed at a **pinned historical window** (`_now` = a fixed past timestamp, e.g. `2020-01-02T00:00:00Z`) and assert the window `[_now-23h, _now+1h)` is EMPTY before seeding (guards against the astronomically-unlikely real 2020 row). Expectations derived from the seeded fixtures only (anti-tautology; the window is provably fixture-only).
  - `admin_event_stats_24h`: seed app_events across hour boundaries + levels (in-tx), assert `total`, per-level counts, `buckets.length===24`, `sum(buckets)===total`, current-hour bucket is index 23, out-of-window rows excluded, empty window → all-zero buckets + total 0.
  - `admin_alert_summary` — **namespace isolation (Codex R5 F2): pass SYNTHETIC test-only codes as the function params.** `admin_alert_summary` has no time window, so persistent unresolved alerts in the shared validation DB would pollute exact totals. The function filters on `_health_codes`/`_degraded_codes`, so the test passes codes NO real alert uses (e.g. `_health_codes = ['__ts_h1__','__ts_h2__','__ts_deg__']`, `_degraded_codes = ['__ts_deg__']`), seeds in-tx `admin_alerts` rows with exactly those codes (unresolved + one resolved + one non-listed code as negative controls), and asserts `total`/`degraded` against the fixtures ONLY — real alerts are excluded by the param filter regardless of DB state. `admin_alerts.code` is a free-text column (no CHECK enum restricting it — verified `supabase/migrations/20260501001000_internal_and_admin.sql`), so synthetic codes insert cleanly. Assert `total` = unresolved fixtures in the synthetic health set, `degraded` = synthetic degraded subset, `notice = total - degraded ≥ 0`, `degraded ≤ total`. (The REAL `HEALTH_CODES`/`DEGRADED_HEALTH_CODES` path is exercised shape-only by the RPC smoke below.)
  - **Existence + privilege (Codex R3 F2), run OUTSIDE the seeding tx:** `to_regprocedure('<sig>')` not null for both; `has_function_privilege('service_role','<sig>','EXECUTE')` TRUE; `has_function_privilege('anon'|'authenticated'|'public','<sig>','EXECUTE')` FALSE. A missing function or missing service_role grant fails the test → forces the validation apply.
  - **Runtime RPC smoke (Codex R4 F1 / R5 F1) — the real PostgREST path, the deployment proof, tied to the validation target.** The direct-SQL tests above prove BEHAVIOR but bypass PostgREST; they can pass while `supabase.rpc(...)` still fails (schema cache not reloaded after apply, exposed named-param drift, service-role RPC resolution). So a separate smoke uses the **real** `createSupabaseServiceRoleClient()` and calls `rpc("admin_event_stats_24h", { _now: <iso> })` AND `rpc("admin_alert_summary", { _health_codes: HEALTH_CODES, _degraded_codes: DEGRADED_HEALTH_CODES })` with the EXACT runtime param names the loaders use, asserting `error === null` and the row has the expected keys/types (SHAPE only, not exact counts — non-flaky against live data).
    - **Same-project guard + fail-closed (R5 F1).** A smoke that hits a DIFFERENT Supabase project than the one the migration was applied to proves nothing. The test derives the project ref from BOTH `TEST_DATABASE_URL` (the `postgres.<REF>@…pooler.supabase.com` username encodes it — here `vzakgrxqwcalbmagufjh`) and the service-role client's `SUPABASE_URL` (`https://<REF>.supabase.co`), and **asserts the two refs are equal** before treating the smoke as proof. If `SUPABASE_URL`/`SUPABASE_SECRET_KEY` is absent, or the refs mismatch, the test **FAILS CLOSED** (hard failure, never skip/pass) — a green smoke therefore requires the RPC to succeed on the SAME project as the migration target.
    - **CI wiring (plan-owned).** The plan MUST wire the db-touching job to pass **validation-scoped** `SUPABASE_URL` + `SUPABASE_SECRET_KEY` matching the `TEST_DATABASE_URL` project (the same project the surgical apply + `notify pgrst, 'reload schema'` targets). This test MUST run for real in CI — a skipped/mocked smoke is not the proof (per "mocked-only tests invite tautological approve" + "local-passes-CI-fails is its own bug class"). If loader param names drift from the SQL signatures, or the migration never reached that project's PostgREST, THIS test fails first.
- **`loadTelemetryStats` / `loadAlertSummary`:** unit tests with a stubbed supabase client whose `.rpc()` is fn-keyed — ok path, rpc-returned `{error}` → infra_error, rpc-throw → infra_error, construction-throw → infra_error, bigint coercion, malformed/missing row (`data:[]` / `data:null`) → infra_error. `loadAlertSummary`: assert `notice = total - degraded` and `notice ≥ 0` for a degraded-heavy row; passes `HEALTH_CODES`/`DEGRADED_HEALTH_CODES` as the rpc params.
- **`summarizeCronHealth`:** unit test over fixture `CronHealthRow[]` covering each status bucket + `total===jobs.length`.
- **Components (jsdom / RTL):** `TelemetryOverviewStrip` guard matrix (ok/zero/infra per card); `EventVolumeSparkline` (empty/all-zero → 3px flat; scaling; last bar accent); `ActiveFilterChips` (one chip per active filter, remove pushes correct href, empty → nothing); `CronHealthList` (row per job, stale tint, "No run seen"); `AutoRefreshControl` (existing behavior tests still green after restyle; switch `aria-pressed`, pulse present only when on); `EventTimeline`/`EventRow` divided-log structure + error-row `bg-danger-bg`.
- **Layout (Playwright, real browser):** §8 dimensional invariants — stat cards equal height; sidebar 340px at ≥1200 + no horizontal overflow; single-column stack < xl; sparkline bar heights ∈ [3,22] & bottom-aligned; switch thumb travel. Extend/replace `tests/e2e/telemetry-layout.spec.ts`.
- **Transition audit:** enumerate `AnimatePresence` / ternary / `&&` blocks in touched components; assert each has exit/initial/animate or is deliberately instant; compound test (toggle auto-refresh while a row is mid-expand).
- **Anti-tautology:** sparkline test asserts against the `buckets` prop, not the rendered card; stat-card copy tests derive expected strings from the input summary/stats objects, not from a sibling.

---

## 15. Watchpoints (disagreement-loop preempts for cross-model review)

- **Two `stable` SQL functions vs JS/PostgREST:** `admin_event_stats_24h` (single indexed round-trip, not an unbounded row fetch) and `admin_alert_summary` (single-snapshot conditional aggregates, fixing the R2-F2 count race). Both intentional; not "unnecessary migrations."
- **DB-test / deployment-proof contract (SETTLED after R2-R5 on this vector — comprehensive closure, do not relitigate per-instance).** The full contract for the two functions:
  1. `validation-schema-parity` does NOT cover functions (columns only); functions produce no manifest delta (R2-F1). Not the guard.
  2. Existence: `to_regprocedure('<sig>')` not null for both.
  3. Privilege: `has_function_privilege('service_role','<sig>','EXECUTE')` TRUE; anon/authenticated/public FALSE (R3-F2).
  4. Behavior (deterministic, isolated): `admin_event_stats_24h` via rollback-tx at a pinned 2020 window with assert-empty-before-seed (R3-F1); `admin_alert_summary` via rollback-tx with SYNTHETIC test-only codes passed as params so persistent alerts can't pollute (R5-F2).
  5. Runtime path: a real `createSupabaseServiceRoleClient().rpc(...)` smoke with exact param names, SHAPE-only asserts, **same-project guard** (TEST_DATABASE_URL ref == SUPABASE_URL ref) + **fail-closed** on absent/mismatched env (R4-F1, R5-F1). This is THE deployment proof; CI passes validation-scoped Supabase URL/key.
  Do not re-flag the parity gate, "connecting role can execute," "direct SQL is enough," an un-pinned window, or an un-guarded smoke target — each is addressed above.
- **Alert summary snapshot consistency:** `notice = total - degraded` is derived from ONE scan in `admin_alert_summary` (R2-F2). Not a race.
- **Duplicated alert read** (summary function + panel rows): intentional (D6, §3.1). Refactoring `HealthAlertsPanel` to accept preloaded data is out of scope; both reads are bounded.
- **Cron total = 9, not 6:** mock is illustrative (D5). Not a bug.
- **`w-[340px]` arbitrary + one `@keyframes tping` in globals.css:** intentional (§6, §9); no matching token exists, and RSC can't scope the keyframe. Not a token-system violation (invariant-8 `@theme` block is untouched).
- **Notice weight uses `surface-sunken` (no `status-notice` token):** matches existing `HealthAlertsPanel` (D4/§6). Not an omission.
- **`CronHealthHeader` retained (not deleted):** the dimension harness `app/admin/dev/telemetry-dim/page.tsx` is a second consumer; only the telemetry page swaps to `CronHealthList`. Not dead code.
- **Read-only ⇒ invariants 2 & 10 N/A:** §12 declares this explicitly with rationale.
```
