# Wizard step-3 Crew Schedule shows all schedule days (bug #316 item 1)

**Status:** approved-design (user-confirmed 2026-07-05; autonomous ship authorized)
**Bug:** #316 item 1 — "Crew schedule is missing the travel in day."
**Surface:** admin onboarding wizard, step-3 review (`/admin?step=3`)
**Reporting show:** II - Fixed Income Trading Summit 2025 (`1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4`)

## Problem

The wizard step-3 "Crew Schedule" breakdown (`ScheduleBreakdown`, `components/admin/wizard/step3ReviewSections.tsx:937`) iterates `Object.keys(ros)`, where `ros` is `pr.runOfShow` (`RunOfShow = Record<ISO, ScheduleDay>`, `lib/parser/types.ts:367`). `runOfShow` is keyed **only by days that carry run-of-show content** — set-day Load In/Setup, show-day agenda/window/showStart entries, and off-schedule strike/load-out days. **Travel-in and travel-out days have no `ScheduleDay` entry**, so they are silently omitted from the wizard preview.

Verified for the reporting show (validation DB `shows.dates`):

```
travelIn:  2025-10-18   ← parsed correctly, but absent from the wizard schedule
set:       2025-10-19
showDays:  2025-10-20, 2025-10-21
travelOut: 2025-10-22   ← also absent
```

`dates.travelIn` **is** parsed and stored — this is a **wizard-preview rendering divergence, not a parse gap**. The crew page `ScheduleSection` (`components/crew/sections/ScheduleSection.tsx:186`) iterates `aggregateDays(data.show.dates)` (`lib/crew/agendaDisplay.ts:80`), which pushes `travelIn`→"Travel In", `set`→"Set", each `showDays[]`→"Show", `travelOut`→"Travel Out"; so travel-in **already renders on the crew page** with a phase label via `DayCard` (`components/crew/primitives/DayCard.tsx:57`, `phase` text + tone dot). The wizard is the only surface that drops it.

## Fix

Render, in `ScheduleBreakdown`, the **chronological union** of:

1. **`aggregateDays(s.pr.show.dates)`** — every schedule day (`travelIn` / `set` / `showDays[]` / `travelOut`), each carrying its `SchedulePhase` label. This is what surfaces the missing travel-in/travel-out days.
2. **Any `ros` key NOT already in that aggregate set** — rendered unchanged (no phase label). See "Regression guard" below.

Merge run-of-show content (`entries` / `showStart` / `window` / `showEnd`) by date from `ros[iso]`. Sort the merged day list ASC by ISO. Each aggregate day shows its phase ("Travel In" / "Set" / "Show" / "Travel Out"), mirroring the crew `DayCard`.

### Regression guard — why UNION, not aggregate-only

`ros` keys **can** fall outside the aggregate day domain, and those days currently render in the wizard. The parser adds:

- **Off-schedule strike days:** `deriveScheduleBookends` appends a strike entry to `ros[g.iso]` even when `g.iso ∉ {travelIn, set, showDays, travelOut}`, emitting a `strikeDateOffSchedule(g.iso)` warning (`lib/parser/blocks/scheduleBookends.ts:172-173`).
- **Load-out day:** appended to `ros[puv.date]` from the transport Pick Up Venue row (`scheduleBookends.ts:180`), which may be any date.
- **Off-schedule agenda-grid dates:** `runOfShow[resolved.iso]` from the agenda grid (`lib/parser/blocks/agenda.ts:384`).

Iterating `aggregateDays` alone would **drop** these currently-shown days — a real regression for a parse-review tool where the admin audits everything parsed. The union preserves every `ros` day AND adds the bookend days.

### Phase labels

| Day source | Phase label |
| --- | --- |
| Aggregate day (`travelIn`/`set`/`showDays`/`travelOut`) | its `SchedulePhase` ("Travel In" / "Set" / "Show" / "Travel Out") |
| `ros`-only day (off-schedule strike / load-out / agenda) | **none** (no natural phase; row unchanged from today) |

Richer labels Doug also asked for in #316 item 2 ("Show Day 1/2" numbering, "Dark" days) are **out of scope for this branch** — this branch delivers the base `SchedulePhase` already provided by `aggregateDays`, identical to the crew `DayCard`. Item 2 enriches both surfaces later.

## Data flow

- `ScheduleBreakdown({ dfid, ros })` → `ScheduleBreakdown({ dfid, ros, dates })`, where `dates: ShowRow["dates"]`.
- Call site `step3ReviewSections.tsx:2438`: `<ScheduleBreakdown dfid={s.dfid} ros={s.ros} dates={s.pr.show.dates} />` (`s.pr.show.dates` is `ShowRow["dates"]` — `SectionData.pr: ParseResult`, `step3ReviewSections.tsx:1962`).
- `ScheduleDayRow` gains an optional `phase?: SchedulePhase | null` prop. When non-null it renders a subtle phase label (`data-testid="wizard-step3-card-${dfid}-sched-phase"`) adjacent to the existing date header (`step3ReviewSections.tsx:884`). Absent/`null` → no phase node (exactOptionalPropertyTypes: present-or-absent, never `phase: undefined` assigned).
- Import `aggregateDays` and `type SchedulePhase` from `@/lib/crew/agendaDisplay` (already the single source of the aggregate + phase union; `humanizeDate` is already imported at `step3ReviewSections.tsx:86`).

### Merge algorithm (single source)

```
aggregate = aggregateDays(dates)                    // {date, phase}[], ASC, deduped first-phase-wins
aggregateDates = new Set(aggregate.map(d => d.date))
rosOnly = Object.keys(ros)
  .filter(iso => !aggregateDates.has(iso))
  .map(iso => ({ date: iso, phase: null }))
mergedDays = [...aggregate, ...rosOnly].sort((a, b) => a.date.localeCompare(b.date))
```

`count` on the `BreakdownSection` becomes `mergedDays.length` (was `dayKeys.length`).

## Guard conditions

- **All dates null + empty ros** (`aggregateDays` = `[]`, no ros keys → `mergedDays` = `[]`): render the existing `"No run-of-show parsed."` empty state (`step3ReviewSections.tsx:958`). Copy unchanged.
- **Dates present, `ros` empty:** bookend/show rows render from the aggregate with no run-of-show entries and no time-meta (the existing fragment-day meta logic in `ScheduleDayRow` already yields `null` when `entries.length === 0` and no showStart/window/showEnd → just date + phase).
- **Same date in both aggregate and ros:** the date is in `aggregateDates`, so it is NOT added again from `rosOnly` (deduped). The aggregate provides the phase; `ros[iso]` provides entries/meta.
- **`ros`-only date (off-schedule):** `phase: null` → no phase label; entries/meta render exactly as today.
- **Unparseable ISO in date header:** `humanizeDate(iso) ?? iso` fallback is unchanged (`step3ReviewSections.tsx:885`).

## Cap / truncation behavior

`SCHEDULE_DAYS_CAP = 14` (`step3ReviewSections.tsx:115`) continues to operate on the merged day list: `shownDays = (first 14 merged days) ∪ (every synthetic-bearing day)`; the "…and N more days" note counts only dropped non-synthetic days. Realistic shows have ≤ ~7 schedule days (well under 14), so bookend days are never dropped in practice. Bookend days are ordinary (non-synthetic) days for cap purposes; a synthetic strike/load-out day remains always-shown (`isSyntheticDay`, `step3ReviewSections.tsx:944`). The per-day entry cap (`SCHEDULE_ENTRIES_CAP = 6`) is unchanged.

## Dimensional invariants

- `ScheduleDayRow`'s entry grid stays `grid grid-cols-[auto_1fr] items-baseline` (`step3ReviewSections.tsx:895`); the new phase label sits in the row's header stack (a flex-col `<li>`, `step3ReviewSections.tsx:883`), a sibling of the date/time-meta spans — no fixed-dimension parent, no new parent→child height/width relationship. Tailwind v4 flex non-stretch default is not engaged (the header is a vertical stack, not a stretch row).

## Rendered vs conceptual

The phase label is a **rendered element**: a `<span data-testid="wizard-step3-card-${dfid}-sched-phase">` containing the phase text (e.g. "Travel In"), placed after the date header span, styled as a subtle small label (final visual treatment set during the impeccable dual-gate; content and placement fixed here).

## Testing (anti-tautology)

Derive every expected value from fixture dimensions; never hardcode a date the fixture doesn't define.

1. **Travel-in surfaces (the bug):** a fixture with `dates.travelIn = <ISO>` and NO `ros[<ISO>]` entry → `ScheduleBreakdown` renders a row for `<ISO>` with phase label "Travel In". Assert the row exists and the phase text is "Travel In", deriving `<ISO>` from the fixture's `dates.travelIn` (not a literal).
2. **Travel-out surfaces:** analogous for `dates.travelOut` → phase "Travel Out".
3. **Regression — off-schedule ros day preserved:** a fixture where `ros` has a key `<X>` that is NOT in `{travelIn, set, showDays, travelOut}` (e.g. an off-schedule strike day) → the `<X>` row STILL renders with its strike entry (no phase label). This is the union guard; iterating aggregate-only would fail this.
4. **Phase correctness across the aggregate:** for a fixture with all four phases, assert each rendered day's phase label matches `aggregateDays(dates)` for that date (extract from the data source `aggregateDays(fixtureDates)`, NOT from the rendered container that also renders the date, per anti-tautology).
5. **Empty state:** all dates null + empty ros → `"No run-of-show parsed."` renders; zero day rows.
6. **`count` reflects merged days:** `BreakdownSection` count equals `mergedDays.length` for a mixed fixture (aggregate ∪ ros-only), derived from the fixture.

Concrete failure modes caught: (1)/(2) the reported bug; (3) the union-vs-aggregate regression (the single subtlest risk in this change); (4) a mis-mapped phase; (5) the degenerate empty path; (6) a stale count.

## Invariants

- **Invariant 8 (UI dual-gate):** touches `components/admin/wizard/step3ReviewSections.tsx` → UI surface → `/impeccable critique` + `/impeccable audit` required at close-out (this change adds a rendered phase-label element, so unlike #319 it is not behaviorally-invisible). HIGH/CRITICAL findings fixed or `DEFERRED.md`-deferred before cross-model review.
- **Invariant 10 (mutation observability):** N/A — no mutation surface (pure render/data-threading change).
- **Invariant 9 (Supabase call-boundary):** N/A — no new Supabase call.
- **Invariant 2 (advisory lock):** N/A.
- **No new §12.4 codes.** No DB/migration surface. No `app/api/**` change.
- **Companion surface:** the crew route `app/show/[slug]/[shareToken]/page.tsx` already renders the full aggregate via `ScheduleSection` — do NOT modify it; it is the reference behavior this fix aligns the wizard to.

## Disagreement-loop preempts (do NOT relitigate)

- **UNION, not aggregate-only** is deliberate and load-bearing: `scheduleBookends.ts:172-173` proves `ros` can hold off-schedule days; dropping them is a regression. Cited above.
- **Phase labels only on aggregate days** is intentional; ros-only off-schedule days have no natural `SchedulePhase` and keep today's label-less rendering.
- **"Show Day N" numbering + "Dark" days are OUT OF SCOPE** (bug #316 item 2, separate branch). This branch delivers only the base `SchedulePhase` from `aggregateDays`, matching the crew `DayCard`.
- **The card title link / other wizard links are untouched** (that was #316 item 3, shipped in PR #319).
