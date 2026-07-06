# Schedule "Show Day x" labels — bug #316 item 2

**Date:** 2026-07-05
**Bug:** #316 item 2 (reported by Doug Larson from admin wizard step-3, show "II - Fixed Income Trading Summit 2025", drive_file_id `1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4`)
**Scope:** UI display-label change only. No DB, no parser, no advisory lock, no new §12.4 code, no new mutation surface.

## Problem

Doug's note, item 2 verbatim:

> In crew schedule If possible/available each date should be labeled with its title like 'Travel In' 'Show Day x' 'Travel Out' 'Dark' etc

Today every show day renders the flat label **"Show"**. There is no numbering, so a three-day show reads "Show / Show / Show" with no way to tell which day is which. The label text is produced by `aggregateDays` (`lib/crew/agendaDisplay.ts:80-93`), whose `SchedulePhase` union (`agendaDisplay.ts:66`) is `"Travel In" | "Set" | "Show" | "Travel Out"`, and that same phase string is rendered directly as display text on both surfaces:

- **Crew page** — `ScheduleSection` (`components/crew/sections/ScheduleSection.tsx:326`) passes `phase={day.phase}` to `DayCard`, which renders `{phase}` as the phase line (`components/crew/primitives/DayCard.tsx:102`).
- **Wizard step-3 preview** — `ScheduleBreakdown` (`step3ReviewSections.tsx:961-1019`) passes `phase={d.phase}` to `ScheduleDayRow`, which renders `{phase}` in the eyebrow slot (`step3ReviewSections.tsx:896-908`). (Bug #316 item 1, PR #320, made the wizard preview show all aggregate days incl. travel bookends, so it is now label-consistent with the crew page.)

## Resolved decisions (do not relitigate)

1. **"Show Day x" numbering only.** Show days get labeled "Show Day 1", "Show Day 2", … — 1-indexed, chronological (earliest show day = "Show Day 1"). Travel In / Set / Travel Out are unchanged.
2. **No "Dark" synthesis.** (User decision, 2026-07-05.) Doug's note lists 'Dark' as a possible label, but dark days (interior calendar gaps with no Travel/Set/Show/Travel-Out phase) do **not** exist in the data model — they are neither in `ShowRow["dates"]` (`lib/parser/types.ts:113-124`) nor, in the general case, in `RunOfShow`. Synthesizing them would mean inventing calendar days that aren't in the sheet. Out of scope. The label enumeration this spec implements is: Travel In, Set, **Show Day N**, Travel Out. ('Dark' and 'etc' are explicitly deferred — see §Deferred.)
3. **Both surfaces, via the shared aggregate.** (User decision, 2026-07-05.) The numbering is computed once in `aggregateDays` and threaded to both the crew `DayCard` and the wizard `ScheduleDayRow`, keeping the wizard preview faithful to the live crew page (the item-1 consistency contract).
4. **Structural `phase` is unchanged; a new `label` field carries display text.** `DayCard`'s tone dot (`DayCard.tsx:50-55`, the `TONE` map) and the wizard cap-exemption (`step3ReviewSections.tsx:992-993`, `d.phase !== "Show"`) both key off the structural `SchedulePhase`. Numbering must NOT alter `phase` — it adds a parallel `label` field. This keeps every structural consumer (`stageWorksDay` at `lib/crew/stageSchedule.ts:24-38`, `getShowForViewer.ts:690`, `TodaySection.tsx:211`) untouched.

## Fix

### A. `aggregateDays` gains a `label` field (`lib/crew/agendaDisplay.ts`)

Extend `AggregateDay` (currently `{ date: string; phase: SchedulePhase }`, `agendaDisplay.ts:68-73`):

```ts
export type AggregateDay = {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  /** Structural phase tag — drives tone + cap-exemption. Unchanged. */
  phase: SchedulePhase;
  /** Display text. Equals `phase` except show days, which read "Show Day N"
   *  (1-indexed by chronological order among the aggregate's Show days). */
  label: string;
};
```

`aggregateDays` (`agendaDisplay.ts:80-93`) — after the existing dedup + ASC sort, walk the sorted rows and assign `label`. `phase === "Show"` → `"Show Day ${n}"` where `n` increments per Show row in ASC order; every other phase → `label = phase`:

```ts
export function aggregateDays(dates: ShowRow["dates"]): AggregateDay[] {
  const seen = new Map<string, SchedulePhase>();
  const push = (date: string | null, phase: SchedulePhase): void => {
    if (!date) return;
    if (!seen.has(date)) seen.set(date, phase);
  };
  push(dates.travelIn, "Travel In");
  push(dates.set, "Set");
  for (const d of dates.showDays ?? []) push(d, "Show");
  push(dates.travelOut, "Travel Out");
  let showN = 0;
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, phase]) => ({
      date,
      phase,
      label: phase === "Show" ? `Show Day ${(showN += 1)}` : phase,
    }));
}
```

**Numbering is by the FINAL sorted order**, not `showDays` array order — so "Show Day 1" is always the chronologically-earliest day that ended up phase `"Show"`. A `showDays` entry whose date collides with `travelIn`/`set` is deduped to the earlier phase (first-wins) and is therefore NOT counted as a Show day (correct: it renders "Travel In"/"Set", not "Show Day k").

### B. `DayCard` renders `label` (`components/crew/primitives/DayCard.tsx`)

Add an **optional** `label?: string` prop. The phase line renders `label ?? phase` (so a caller that omits `label` gets today's behavior — the phase name). The tone dot still keys off `phase` (required, unchanged). `ScheduleSection.tsx:326` passes `label={day.label}`.

```ts
type DayCardProps = {
  day: string;
  phase: SchedulePhase;       // tone key — required, unchanged
  today: boolean;
  meta?: ReactNode;
  label?: string;             // display text; falls back to phase
};
// render: {label ?? phase}   (was: {phase})
```

### C. Wizard `ScheduleDayRow` renders `label` (`components/admin/wizard/step3ReviewSections.tsx`)

`ScheduleDayRow`'s display prop changes from `phase?: SchedulePhase | null` to `label?: string | null`; it renders `{label}` in the eyebrow (`step3ReviewSections.tsx:896-908`), unchanged styling (`EYEBROW_CLASS`/`EYEBROW_STYLE`), unchanged testid `wizard-step3-card-${dfid}-sched-phase-${iso}` (the slot is still "the day's phase/label"; renaming the testid would ripple into unrelated tests for no benefit). `ScheduleBreakdown` (`step3ReviewSections.tsx:977-1019`):

- `aggregate` is `aggregateDays(dates)` — now `AggregateDay[]` (carries `label`).
- `rosOnly` days (off-schedule strike/load-out/agenda days the parser placed in `ros`, `step3ReviewSections.tsx:979-981`) get `label: null` (they have no aggregate phase → no eyebrow, exactly today's behavior).
- The merged-day working type becomes `{ date: string; phase: SchedulePhase | null; label: string | null }`.
- Cap-exemption (`step3ReviewSections.tsx:992-993`) is UNCHANGED — it keys off `phase`, not `label`.
- Pass `label={d.label}` to `ScheduleDayRow` (was `phase={d.phase}`).

## Guard conditions

| Input | Behavior |
|---|---|
| `dates.showDays` empty/absent | No Show rows → no numbering. Travel/Set/Travel-Out labels unchanged. |
| Single show day | Labeled "Show Day 1" (numbering is consistent even for one day — the user asked for numbered labels; "Show Day 1" reads correctly). |
| `showDays` out of chronological order | Numbered by FINAL ASC sort, so "Show Day 1" = earliest date regardless of array order. |
| A `showDays` date == `travelIn` or `set` | Deduped first-wins → that date is "Travel In"/"Set", NOT counted as a Show day; remaining Show days number 1..k contiguously. |
| Duplicate dates within `showDays` | `Map` dedup already collapses them to one Show row (pre-existing behavior); numbered once. |
| Wizard ros-only day (no aggregate phase) | `label: null` → no eyebrow rendered (unchanged). |
| `DayCard` caller omits `label` | Renders `phase` (backward-compatible; the pure-primitive tests exercise this path). |

## Dimensional invariants

No layout/dimension change. The label string grows from "Show" (4 chars) to "Show Day N" (~10 chars), rendered in the SAME element with the SAME classes:
- Crew `DayCard`: the phase line is `inline-flex items-center gap-2 … min-w-0 flex-1` (`DayCard.tsx:89-103`) inside a `min-w-0 flex-1 flex-col` column — it already wraps long strings; "Show Day 12" is shorter than existing meta strings like "7:30am–5:50pm".
- Wizard eyebrow: `EYEBROW_CLASS` on a block `<span>` in a `flex flex-col` list item (`step3ReviewSections.tsx:892-908`) — wraps freely.

No fixed-dimension parent constrains the label, so **no Playwright layout-dimensions assertion is required** for this change (there is no child-fills-parent invariant at play; the existing crew layout-dimensions e2e `tests/e2e/crew-layout-dimensions.spec.ts` continues to pin the DayCard row geometry and must stay green).

## Transition inventory

`DayCard` and `ScheduleDayRow` are synchronous Server Components (no `'use client'`, no `AnimatePresence`, no state) — `DayCard.tsx` header states "Server Component (no `'use client'`) — props in, markup out." The only conditional is the `today` pill and `meta` presence, both pre-existing and unaffected. **No animated transitions; nothing to enumerate.** The label change is a pure text swap on every render.

## Testing (anti-tautology)

1. **`aggregateDays` numbering (unit, `lib/crew/agendaDisplay`)** — a fixture with 3 show days (deliberately out of ASC order in the array) + travelIn + travelOut. Assert the returned rows carry `label` "Travel In", "Show Day 1", "Show Day 2", "Show Day 3", "Travel Out" **in ASC date order**, with `phase` still "Travel In"/"Show"/"Show"/"Show"/"Travel Out". Expected labels derived from the fixture's sorted show-day count, not a hardcoded max. Concrete failure caught: numbering by array order instead of chronological; label leaking into `phase`; off-by-one.
2. **Single show day → "Show Day 1"** — guard-condition test.
3. **`showDays` date collides with `set`** — assert that date is "Set" (not a Show day) and the other show days number 1..k contiguously. Catches the dedup-vs-count bug.
4. **Crew `DayCard` renders `label` when provided; falls back to `phase` when omitted** (`tests/components/crew/primitives.test.tsx`) — new assertions; the existing tone-dot tests (which omit `label`) must still pass via the fallback.
5. **Crew `ScheduleSection` numbers show days** — render a multi-show-day fixture; assert the DayCard phase lines read "Show Day 1"/"Show Day 2"/… Derive the expected labels from `aggregateDays(fixture.dates)` (the data source), NOT hardcoded, per the anti-tautology rule.
6. **Wizard `ScheduleBreakdown` numbers show days** — update the existing `scheduleBreakdown.bookendDays.test.tsx` phase-label assertion (`tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx:45-51`), which today asserts the rendered eyebrow equals `d.phase`; after this change it must assert against `d.label` (the data source `aggregateDays(fx)[i].label`). Add a numbering-specific assertion: two show days → eyebrows "Show Day 1"/"Show Day 2".
7. **Non-tautology scoping** — the numbering assertions extract from `aggregateDays(dates)`, not from the rendered container, so a broken renderer cannot pass by echoing a sibling.

## Plan-wide invariant disposition

- **Inv. 1 (TDD per task):** honored — failing test → impl → green → commit, per task.
- **Inv. 2 (advisory lock):** N/A — no mutation of `shows`/`crew_members`/etc.
- **Inv. 3 (email canonicalization):** N/A — no email boundary.
- **Inv. 4 (no global sync cursor):** N/A.
- **Inv. 5 (no raw error codes in UI):** N/A — no error copy touched.
- **Inv. 6 (commit per task):** honored — conventional commits `feat(crew)` / `feat(admin)` / `test(...)`.
- **Inv. 7 (spec canonical):** honored — no spec amendment.
- **Inv. 8 (UI quality gate):** **REQUIRED** — touches `components/crew/**` and `components/admin/wizard/**`. `/impeccable critique` + `/impeccable audit` on the diff before cross-model review; HIGH/CRITICAL fixed or deferred via `DEFERRED.md`.
- **Inv. 9 (Supabase call-boundary):** N/A — no Supabase call added.
- **Inv. 10 (mutation surface telemetry):** N/A — no mutation surface added.

## Meta-test inventory

- **Extends:** none structurally. The existing `tests/crew/agendaDisplay-single-source.test.ts` (single-source guard for `aggregateDays`) continues to pass unchanged (it text-matches the export, `agendaDisplay-single-source.test.ts:16`; it does not assert output shape).
- **Creates:** none. This is a display-label change with behavioral unit + component tests; no new registry/structural meta-test is warranted. Declared explicitly per the meta-test-inventory rule.

## Disagreement-loop preempts (for the reviewer)

- **"Show Day 1" for a single show day is intentional** (Resolved §Guard). Doug asked for numbered labels; consistent numbering beats a special-cased "Show".
- **No "Dark" days is a ratified user decision** (Resolved §2, 2026-07-05). Do not flag the absence of dark-day synthesis as a gap — it is out of scope by explicit user choice; dark days do not exist in the data model.
- **`phase` is deliberately unchanged; `label` is the display field** (Resolved §4). Do not propose folding numbering into the `SchedulePhase` union — that would break the tone map (`DayCard.tsx:50-55`) and cap-exemption (`step3ReviewSections.tsx:992-993`), both of which switch on the finite phase set.
- **`DayCard.label` is optional with a `phase` fallback by design** — keeps `primitives.test.tsx` tone tests (which pass no `label`) green without edits. Not an incomplete API.
- **Testid `sched-phase-${iso}` is retained despite the prop rename to `label`** — the slot's meaning ("the day's phase/label") is unchanged; renaming the testid would churn unrelated tests for zero behavioral gain.

## Deferred

- **'Dark' days and 'etc' labels** (Doug's item 2, trailing enumeration). Requires synthesizing calendar days absent from the sheet — a larger product decision deferred by user choice (2026-07-05). If pursued later it is its own spec: define the dark-day rule (interior gap fill, span bounds), DateRestriction interaction on the crew page, and the wizard-preview parity.
