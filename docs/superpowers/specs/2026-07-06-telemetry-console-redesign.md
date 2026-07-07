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

`lib/admin/loadAlertSummary.ts`. Mirrors `fetchHealthRollup`'s probe discipline (`lib/admin/healthRollup.ts`): construct client in try/catch, each probe is `count:"exact", head:true`, validated solely on `typeof count === "number"` (head probe returns `data:null` by design — normal). Invariant 9: destructure `{ data, error }` (here `{ count, error }` with `void data`).

```ts
export type AlertSummary =
  | { kind: "ok"; degraded: 0; notice: 0; total: 0 }
  | { kind: "degraded" | "notice"; degraded: number; notice: number; total: number }
  | { kind: "infra_error" };
export async function loadAlertSummary(): Promise<AlertSummary>;
```

- `total` = exact head count over `HEALTH_CODES`, `resolved_at is null`. If 0 → `{ kind:"ok", degraded:0, notice:0, total:0 }` (short-circuit, one query).
- `degraded` = exact head count over `DEGRADED_HEALTH_CODES`, `resolved_at is null`.
- `notice` = `total - degraded` (never negative; both drawn from the same `resolved_at is null` predicate and `DEGRADED_HEALTH_CODES ⊆ HEALTH_CODES`).
- `kind` = `degraded > 0 ? "degraded" : "notice"`.
- Any `error` / non-number count / thrown client → `{ kind:"infra_error" }`.

Codes imported from `@/lib/adminAlerts/audience` (`HEALTH_CODES`, `DEGRADED_HEALTH_CODES`) — same as `healthRollup`.

**Guard conditions:** `infra_error` → System-health card renders "Unavailable" (neutral, not alarming) + Open-alerts card renders "—"; never throws, never shows a raw error string (invariant 5).

---

## 5. New read: `loadTelemetryStats(now)` + `admin_event_stats_24h`

### 5.1 SQL function (migration)

`supabase/migrations/<ts>_admin_event_stats_24h.sql`:

```sql
create or replace function public.admin_event_stats_24h(_now timestamptz default now())
returns table (total bigint, error_count bigint, warn_count bigint,
               info_count bigint, buckets int[])
language sql stable
as $$
  with hours as (
    select generate_series(0, 23) as h                       -- 0 = oldest, 23 = current hour
  ),
  win as (
    select date_trunc('hour', _now) as cur_hour
  ),
  ev as (
    select occurred_at, level
    from public.app_events, win
    where occurred_at >= win.cur_hour - interval '23 hours'
      and occurred_at <  win.cur_hour + interval '1 hour'
  ),
  bucketed as (
    select h,
           count(ev.*) filter (
             where date_trunc('hour', ev.occurred_at)
                 = (select cur_hour from win) - make_interval(hours => 23 - h)
           ) as c
    from hours left join ev on true
    group by h order by h
  )
  select
    (select count(*)::bigint from ev),
    (select count(*)::bigint from ev where level = 'error'),
    (select count(*)::bigint from ev where level = 'warn'),
    (select count(*)::bigint from ev where level = 'info'),
    (select array_agg(c order by h)::int[] from bucketed);
$$;

revoke all on function public.admin_event_stats_24h(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_event_stats_24h(timestamptz) to service_role;
```

- **Read-only** (`stable`, no writes) → NOT subject to PostgREST DML lockdown (that governs table mutation). `service_role` already reads `app_events`; `SECURITY INVOKER` (default) suffices.
- Window = the 24 clock-hours ending with the current partial hour; `buckets[24]` chronological (index 0 oldest, 23 current). `total` counts the same window (sum of buckets == total, invariant asserted in tests).
- Indexed by `app_events_occurred_at_idx (occurred_at desc)` (`supabase/migrations/20260629000002_app_events.sql:17`) and `app_events_level_idx`.
- **Migration lifecycle (invariant, cross-cutting §"Every migration must reach validation"):** apply locally + test; `pnpm gen:schema-manifest` + commit the manifest; apply surgically to the validation project via `supabase db query --linked` + `notify pgrst, 'reload schema'`. `create or replace` is idempotent (apply-twice safe); the `revoke`/`grant` are idempotent. No CHECK/enum change (§12 matrix N/A).

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
- Coerces bigint-as-string/number → `Number(...)`; `buckets` defaults to `[]` only on infra_error (on ok it is always length-24 from the function; a defensive `?? []` guards a null array from an all-empty window — `array_agg` over 24 rows always yields 24 elements, so this is belt-and-suspenders).

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
| 9 Supabase call-boundary | YES | `loadAlertSummary` + `loadTelemetryStats` destructure `{ data/count, error }`; infra faults → typed `{ kind:"infra_error" }`; never silent. **Meta-test:** see §13. |
| 10 Mutation-surface observability | **N/A** | No new mutating route/action. Page + new loaders are read-only. Declared N/A. |
| Cross: PostgREST DML lockdown | N/A | New function is read-only; no RPC-gated table introduced. |
| Cross: migration→validation parity | YES | §5.1 lifecycle: local apply + `gen:schema-manifest` + validation surgical apply. `validation-schema-parity` gate. |
| Cross: §12.4 catalog | N/A | No new user-facing code. Forensic log codes are outside the catalog namespace (parity with `APP_EVENTS_READ_*`). |

**Tier × domain matrix (surcharge):** N/A — this feature touches no user/client/booking/shift tier and no surcharge domain. Declared explicitly.
**CHECK/enum migration matrix:** N/A — the migration adds a `stable` function only; no CHECK/enum/column change.
**Flag lifecycle:** the only toggle is the existing auto-refresh (`fxav.telemetry.autorefresh` localStorage → `on` state → gates the 20s interval). No new flag. Not a zombie (stored, read, and it gates the interval effect). Unchanged.

---

## 13. Meta-test inventory

- **Supabase call-boundary (invariant 9):** `loadAlertSummary` + `loadTelemetryStats` are new Supabase-reading helpers under `lib/admin/`. **Resolved:** `tests/auth/_metaInfraContract.test.ts` scans ONLY `AUTH_DOMAIN_ROOTS = ["lib/auth","app/auth","app/api/auth","app/api/show"]` (`:336`) — it does NOT cover `lib/admin/` (its own comment notes sibling domains are owned elsewhere). The precedent reads `loadAppEvents`/`loadCronHealth`/`healthRollup` are likewise not in that registry. So no registry row is added; instead each new helper gets **behavioral unit tests** asserting `{ kind:"infra_error" }` on BOTH the returned-`error` path and the thrown-client path, and the `{data,error}` destructure shape mirrors the precedent helpers exactly (invariant 9 satisfied by construction + test).
- **`validation-schema-parity`** (`tests/db/validation-schema-parity.test.ts`): the new function must land in the manifest (via `gen:schema-manifest`) AND on the validation project. Both layers of that gate apply.
- No new advisory-lock surface → `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched (declared).
- No new admin-mutation surface → `tests/log/_metaMutationSurfaceObservability.test.ts` untouched (read-only page; declared).
- No `admin_alerts.upsert` catalog change → `_metaAdminAlertCatalog.test.ts` untouched.

---

## 14. Testing strategy

- **`admin_event_stats_24h` (DB):** integration test against the linked DB (`TEST_DATABASE_URL`) — seed app_events across hour boundaries + levels, assert `total`, per-level counts, `buckets.length===24`, `sum(buckets)===total`, current-hour bucket is index 23, out-of-window rows excluded, empty window → all-zero buckets + total 0. Derive expectations from seeded fixtures (anti-tautology; never hardcode).
- **`loadTelemetryStats` / `loadAlertSummary`:** unit tests with a stubbed supabase client — ok path, `error` path → infra_error, thrown client → infra_error, bigint coercion, malformed/missing row → infra_error.
- **`summarizeCronHealth`:** unit test over fixture `CronHealthRow[]` covering each status bucket + `total===jobs.length`.
- **Components (jsdom / RTL):** `TelemetryOverviewStrip` guard matrix (ok/zero/infra per card); `EventVolumeSparkline` (empty/all-zero → 3px flat; scaling; last bar accent); `ActiveFilterChips` (one chip per active filter, remove pushes correct href, empty → nothing); `CronHealthList` (row per job, stale tint, "No run seen"); `AutoRefreshControl` (existing behavior tests still green after restyle; switch `aria-pressed`, pulse present only when on); `EventTimeline`/`EventRow` divided-log structure + error-row `bg-danger-bg`.
- **Layout (Playwright, real browser):** §8 dimensional invariants — stat cards equal height; sidebar 340px at ≥1200 + no horizontal overflow; single-column stack < xl; sparkline bar heights ∈ [3,22] & bottom-aligned; switch thumb travel. Extend/replace `tests/e2e/telemetry-layout.spec.ts`.
- **Transition audit:** enumerate `AnimatePresence` / ternary / `&&` blocks in touched components; assert each has exit/initial/animate or is deliberately instant; compound test (toggle auto-refresh while a row is mid-expand).
- **Anti-tautology:** sparkline test asserts against the `buckets` prop, not the rendered card; stat-card copy tests derive expected strings from the input summary/stats objects, not from a sibling.

---

## 15. Watchpoints (disagreement-loop preempts for cross-model review)

- **New SQL function vs JS bucketing:** the aggregate is intentionally a `stable` SQL function (D2) for a single indexed round-trip, not an unbounded row fetch. Do not relitigate as "unnecessary migration" — it is the efficiency-correct choice the user selected (D1).
- **Duplicated alert read** (summary counts + panel rows): intentional (D6, §3.1). Refactoring `HealthAlertsPanel` to accept preloaded data is out of scope; both reads are bounded.
- **Cron total = 9, not 6:** mock is illustrative (D5). Not a bug.
- **`w-[340px]` arbitrary + one `@keyframes tping` in globals.css:** intentional (§6, §9); no matching token exists, and RSC can't scope the keyframe. Not a token-system violation (invariant-8 `@theme` block is untouched).
- **Notice weight uses `surface-sunken` (no `status-notice` token):** matches existing `HealthAlertsPanel` (D4/§6). Not an omission.
- **`CronHealthHeader` retained (not deleted):** the dimension harness `app/admin/dev/telemetry-dim/page.tsx` is a second consumer; only the telemetry page swaps to `CronHealthList`. Not dead code.
- **Read-only ⇒ invariants 2 & 10 N/A:** §12 declares this explicitly with rationale.
```
