# Spec — "Show Start" label for bare-showStart schedule days

**Date:** 2026-07-06
**Slug:** `show-start-schedule-label`
**Type:** UI enhancement (crew page + admin wizard, parity)
**Routing:** Opus / Claude Code (UI surface — `components/**`), invariant-8 impeccable dual-gate applies.

---

## 1. Summary

A schedule day whose only parsed content is a bare `showStart` clock (no titled
run-of-show entries, no window, no end-only anchor) currently renders the time as
a **label-less meta line** — e.g. May 13 under "Show Day 1" reads just `8:00 AM`,
a floating time with no descriptor while every other row carries one.

This spec renders that bare `showStart` as a **real run-of-show grid entry**
`{ start: showStart, title: "Show Start" }`, so it aligns time-first with the
other rows — `8:00 AM  Show Start` — instead of the bare meta line. Applied to
**both** the crew page and the admin wizard for parity.

---

## 2. Motivation (worked example)

Live sheet **RFI & PC Chicago** (fixture
`fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md:207`) row:

```
| SHOW DAY 1 | Tuesday | 5/13/25 | GS: 8:00 AM - |
```

`parseScheduleTimes` (`lib/parser/blocks/scheduleTimes.ts:200-205`) reads the cell
`GS: 8:00 AM -`: one clock token, lead `GS: ` matches the leading-start prefix, the
title after the clock is empty (`-` strips to `""`). Result:
`{ entries: [], showStart: "8:00 AM", showEnd: null, window: null }`.

Both render surfaces take a "bare-showStart → meta" branch and print `8:00 AM`
with no descriptor. Users read it as ambiguous. Contrast May 14, which shows
titled entries (`5:00 PM Strike — all rooms`, `6:00 PM Load Out`).

---

## 3. Scope — affected vs NOT affected day shapes

The change targets **exactly one** `ScheduleDay` shape. All other shapes are
untouched. `ScheduleDay` = `{ entries, showStart, showEnd, window }`
(`lib/parser/types.ts:361-366`).

The gate is **raw parser output** (`ScheduleDay.entries.length`), NOT the
per-viewer displayable count. This distinction is load-bearing (see the
load-out-only row): a day with a raw parsed entry is NOT bare even if that entry
is filtered out for the current viewer.

Synthesis is additionally hard-gated on **`phase === "Show"`** (§4.2) — a non-Show
day is never relabeled "Show Start", keeping the "Set day unchanged" promise
structural rather than incidental.

| Day shape                                                           | Current render                    | After this change                          |
| ------------------------------------------------------------------- | --------------------------------- | ------------------------------------------ |
| **Bare showStart on a Show day**: `phase==="Show"`, `entries.length===0`, `window==null`, `showStart` real | meta line `8:00 AM`               | **grid entry `8:00 AM  Show Start`** ← ONLY change |
| Non-Show day (Set/Travel) with a collision-edge bare `showStart`    | crew: Set→`Setup …`, Travel→`8:00 AM` meta; wizard→`8:00 AM` meta | **unchanged** (phase gate → no synthesis) |
| Bare showStart but `showStart` is a sentinel (`TBD`/`N/A`/`TBA`)     | no meta (guarded)                 | no entry, no meta (guarded — unchanged)    |
| **Load-out-only, hidden for viewer** (`entries=[{kind:"loadout"}]`, `showStart` real, viewer without transport → `dayEntries=[]`) | meta line `8:00 AM` (#169 contract) | **unchanged** — raw `entries.length>0` ⇒ no synthesis; existing meta branch still fires |
| Window day (`window!=null`)                                         | meta `9:00 AM – 5:00 PM`          | unchanged (meta)                           |
| End-only day (`showEnd!=null`, `showStart==null`)                   | meta `Ends 6:00 PM`               | unchanged (meta)                           |
| Set day (`phase==="Set"`)                                          | meta `Setup 7:00 AM` (or entries) | unchanged                                  |
| Titled day (≥1 entry)                                              | run-of-show grid                  | unchanged (already grid; `showStart` never was meta here) |

**Mutual exclusivity is guaranteed by the parser:** the window branch returns
early (`scheduleTimes.ts:173-184`), so `window!=null` ⇒ `showStart==null`.
`showEnd` is set only when `showStart===null` (`scheduleTimes.ts:210-218`). So a
day cannot simultaneously be "bare showStart" and "window" or "end-only".

**Why the raw-entries gate (Codex R1 HIGH — do-not-relitigate):** the crew branch
that currently renders `showStart` meta gates on the per-viewer, load-out-filtered
`dayEntries` (`ScheduleSection.tsx:294`), NOT raw `sd.entries`. A day whose only
raw entry is a load-out hidden from the current viewer has `dayEntries.length===0`
but is NOT a bare parser day. The `#169` regression contract
(`ScheduleSection.tsx:295-301`) requires it to keep rendering the call-time meta
with **no** run-of-show container. Gating synthesis on raw `entries.length===0`
(not `dayEntries`) preserves that contract exactly.

---

## 4. Design — Approach A, renderer-level synthesis

### 4.1 Why renderer-level (NOT parser-level) — do-not-relitigate

The synthesized `Show Start` entry is created **in the render path**, NOT by
mutating parser output. `ScheduleDay.showStart` stays exactly as the parser emits
it. Reason: `resolveKeyTimes` (`lib/crew/resolveKeyTimes.ts:164`) reads
`day.showStart` as the **row-1 show anchor candidate** for the KeyTimesStrip, and
its show-anchor loop (`resolveKeyTimes.ts:167`) also scans `entries` filtering
`kind !== strike/loadout && !TERMINAL_RE`. If a `{ title: "Show Start" }` entry
were pushed into `entries` at parse time it would:

1. leak into `resolveKeyTimes`'s entry scan (it is non-terminal) — a double/shifted
   anchor, corrupting the KeyTimesStrip; and
2. change every downstream consumer of `ScheduleDay.entries`
   (`applyParseResult`, `decodeRunOfShow`, ReportModal, right-now context).

Keeping the synthesis renderer-only means `resolveKeyTimes` and all persistence /
report paths see the unchanged `{ entries: [], showStart }` shape. Zero parser
diff. This is a deliberate contract; reviewers should not relitigate it.

### 4.2 Single source of truth — shared helper

Add one helper to `lib/crew/agendaDisplay.ts` (the existing single-source module
for run-of-show display predicates, per its header comment lines 1-10):

```ts
/**
 * Synthesize the display-only "Show Start" run-of-show entry for a bare-showStart
 * SHOW day: phase === "Show", zero RAW parsed entries, no window, a real
 * (non-sentinel) showStart. Renderer-only: the parser's ScheduleDay.showStart is
 * NEVER mutated (resolveKeyTimes anchor depends on it). Returns null for every
 * other case (non-Show phase / any raw entry incl. a viewer-hidden load-out /
 * window / end-only / sentinel).
 */
export function showStartDisplayEntry(
  day: Pick<ScheduleDay, "showStart" | "window" | "entries">,
  phase: SchedulePhase | null,
): AgendaEntry | null {
  if (phase !== "Show") return null;           // only Show days get a "Show Start" (Codex plan R1)
  if (day.entries.length > 0) return null;     // any RAW entry (even viewer-hidden) → not bare
  if (day.window != null) return null;         // window day → meta
  const start = resolveOptionalField(day.showStart ?? undefined); // sentinel/URL guard
  return start == null ? null : { start, title: "Show Start" };
}
```

- **Phase gate (Codex plan R1 — do-not-relitigate):** `showStart` is nominally a
  show-day property (`readShowDayTimeCells` reads only `SHOW DAY` rows,
  `scheduleTimes.ts:127`), but the aggregate can place a bare `showStart` on a
  non-Show phase day when a Set/travel date collides with a show date. The spec
  table promises "Set day unchanged", so the helper hard-gates on `phase === "Show"`.
  `SchedulePhase` (`"Travel In" | "Set" | "Show" | "Travel Out"`) is already
  exported from this module (`agendaDisplay.ts:66`). Putting the gate IN the helper
  (not the callers) makes it unit-testable at a single chokepoint.
- The entries gate is **raw `day.entries.length`**, NOT a per-viewer displayable
  count. This preserves the `#169` hidden-load-out contract (§3, Codex spec R1).
  Since raw-empty ⇒ nothing is displayable either, a separate
  `hasDisplayableEntries` parameter would be redundant and is intentionally omitted.
- Returns `AgendaEntry` with **`kind` absent** ⇒ counts as `"agenda"`
  (`types.ts:358`), so it renders in the normal (strong-tone) group, NOT the muted
  synthetic (strike/loadout) group.
- `showEnd` is intentionally NOT a parameter: when `showStart` is null (the only
  case `showEnd` is set) the `resolveOptionalField(null)` guard already returns
  null, so the helper yields null and the caller's existing `Ends …` branch runs.
- `resolveOptionalField` (`agendaDisplay.ts:26-31`) strips URLs and hides
  `''`/`TBD`/`N/A`/`TBA` — the sentinel guard is preserved verbatim.

### 4.3 Crew integration — `components/crew/sections/ScheduleSection.tsx`

Current bare-showStart branch (`ScheduleSection.tsx:294-302`) sets
`meta = guardMeta(sd.showStart)` and `DayCard` renders it; `RunOfShowList` renders
only when `dayEntries.length > 0` (`ScheduleSection.tsx:338`).

Change: compute `const showStartRow = sd != null ? showStartDisplayEntry(sd, day.phase) : null`
(`day.phase` is the aggregate `SchedulePhase`; `isSetDay = day.phase === "Set"`
already reads it at `ScheduleSection.tsx:265`).
- When `showStartRow != null`: **skip** the `meta = guardMeta(sd.showStart)`
  branch (leave `meta` undefined) and render `<RunOfShowList entries={[showStartRow]} isoDate={day.date} />` for that day.
- When `showStartRow == null`: **all existing branches run unchanged**, including
  the `meta = guardMeta(sd.showStart)` branch (`ScheduleSection.tsx:294-302`). A
  load-out-only day hidden from the viewer (raw `entries.length>0`) yields
  `showStartRow==null`, falls through to that meta branch, and renders `8:00 AM` as
  today — the `#169` contract is untouched.
- The `window` branch (line 292-293) and `showEnd` branch (line 303-308) are
  unchanged — they still produce `meta`. Only the truly-bare subset of the
  `showStart` branch is diverted to the grid entry.
- `RunOfShowList` re-runs `displayableEntries` on `[showStartRow]`; title
  `"Show Start"` is real ⇒ it survives and renders via `RunOfShowEntry` as
  `8:00 AM` (time track) + `Show Start` (title track), `data-testid="agenda-entry"`.

### 4.4 Wizard integration — `components/admin/wizard/step3ReviewSections.tsx`

Current `ScheduleDayRow` (`step3ReviewSections.tsx:926-932`): when
`entries.length === 0`, `timeMeta = win ?? start ?? (end ? `Ends ${end}` : null)`
where `start = resolveOptionalField(showStart)`.

`ScheduleDayRow` currently receives no `phase` prop (only `label`,
`step3ReviewSections.tsx:1073`). Add a `phase?: SchedulePhase | null` prop, passed
from `ScheduleBreakdown`'s `shownDays.map` (`step3ReviewSections.tsx:1064-1074`)
as `phase={d.phase}` (`d.phase` already exists on the merged-day object,
`:1027-1033`). Then compute
`const showStartRow = showStartDisplayEntry({ showStart, window: dayWindow, entries }, phase ?? null)`
(the wizard's `entries` prop IS the raw `ScheduleDay.entries` — admin sees all, no
viewer filtering — so raw and displayable coincide here).

The `timeMeta` expression keeps its original `win ?? start ?? (end ? …)` form
(including the `start` term) but is only computed when `showStartRow == null`, so:
a Show-phase bare-showStart day → grid entry (timeMeta skipped); a non-Show day
with a (collision-edge) bare `showStart` → `start` meta as today (byte-identical);
sentinel/window/end-only → unchanged. Only the Show-phase bare-showStart case
changes.
- When `showStartRow != null` (Show-phase bare-showStart day): render it as the
  sole grid row (`rows = [showStartRow]`) and do **not** set `timeMeta`.
- When `showStartRow == null`: `timeMeta` keeps its **full original**
  `win ?? start ?? (end ? `Ends ${end}` : null)` expression — including the `start`
  term. This is REQUIRED after the phase gate: a non-Show / phase-null day with a
  real `showStart` deliberately returns `null` from the helper and MUST still show
  its `start` meta (`8:00 AM`) exactly as today — do NOT drop the `start` term. A
  sentinel `showStart` yields null on both paths (no meta, no row — identical to
  today). Window / end-only unchanged.
- The synthesized row flows through the existing `grid-cols-[auto_1fr]` two-track
  grid (`step3ReviewSections.tsx:965-992`). `kind` absent ⇒ `isSynthetic` false ⇒
  normal `text-text` tone, no hairline rule. It is in the `agenda` partition
  (`step3ReviewSections.tsx:915`), count 1, well under `SCHEDULE_ENTRIES_CAP`.

---

## 5. Guard conditions (every input state)

| `phase`   | `showStart`      | `window` | raw `entries.length` | Result                                        |
| --------- | ---------------- | -------- | -------------------- | --------------------------------------------- |
| `"Show"`  | `null`           | `null`   | 0                    | helper → null; existing `showEnd`/nothing path |
| `"Show"`  | `"8:00 AM"`      | `null`   | 0                    | **entry `{start:"8:00 AM",title:"Show Start"}`** |
| `"Show"`  | `"TBD"`/`"N/A"`  | `null`   | 0                    | helper → null (sentinel guard); no entry, no meta |
| `"Show"`  | `"8:00 AM"`      | `null`   | ≥1 (incl. viewer-hidden load-out) | helper → null (raw-entries guard); existing meta branch renders `8:00 AM` (#169 preserved) |
| `"Show"`  | `"8:00 AM"`      | `{…}`    | 0                    | impossible per parser; helper still → null (window guard) |
| `"Set"`/`"Travel In"`/`"Travel Out"`/`null` | `"8:00 AM"` | `null` | 0 | helper → null (**phase gate**); existing meta path renders as today |
| `"Show"`  | any              | any      | ≥1                   | helper → null; titled grid renders as today   |
| `"Show"`  | URL-only         | `null`   | 0                    | `resolveOptionalField` strips → null; no entry |

`showStart` is a `string | null` (`types.ts:363`); no NaN/number path exists.

---

## 6. Rendered vs conceptual / label / layout

- **Rendered element:** a run-of-show entry, not a description. Crew: a
  `RunOfShowEntry` (`data-testid="agenda-entry"`). Wizard: a row in the
  `sched-time` / `sched-title` two-track grid.
- **Label text:** exactly `Show Start` (user-approved). Not routed through
  `lib/messages/lookup.ts` — it is a static display noun, not an error code
  (invariant 5 governs error codes only).
- **Layout:** time-first, reusing the **existing** grids. No new fixed-dimension
  parent is introduced.

## 7. Dimensional invariants

No new fixed-dimension parent. Both target grids already have real-browser layout
coverage (crew `RunOfShowList` two-track; wizard `grid-cols-[auto_1fr]` with the
dimensional-invariant comment at `step3ReviewSections.tsx:876-883`). The
synthesized entry is one more row in an already-verified grid. The plan adds a
render assertion that the entry appears in the grid (time + title cells), not a
new layout-collapse gate.

## 8. Transition inventory

`ScheduleDayRow` / `ScheduleSection` day rows have no mode toggles or
`AnimatePresence` in the schedule grid — days render statically from data. State
changes come only from re-render on new data (server-driven), which swaps content
without an animated transition (instant — no animation needed). The wizard's only
local state is the per-day "Show all M times" disclosure (`step3ReviewSections.tsx:910`),
untouched here (a 1-entry day never reaches the cap, so no disclosure button). No
new transitions introduced.

## 9. Meta-test inventory

- **CREATES:** none.
- **EXTENDS:** none required. `tests/crew/agendaDisplay-single-source.test.ts`
  already pins the single-source module; the new helper lives there and is covered
  by its own unit test. No advisory-lock, Supabase-boundary, admin-alert, or §12.4
  surface is touched → those registries are N/A.

## 10. Test plan (anti-tautology, failure modes)

1. **Helper unit** (`tests/crew/agendaDisplay.test.ts` or a new
   `showStartDisplayEntry.test.ts`): all cases pass `phase` as the 2nd arg. Assert
   `{start,title:"Show Start"}` for `({showStart:"8:00 AM",window:null,entries:[]}, "Show")`;
   `null` for a window day; `null` for sentinel `"TBD"`; `null` for `showStart:null`;
   **`null` when `entries=[{start:"6:00 PM",title:"Load Out",kind:"loadout"}]`** even
   with a real `showStart` (raw-entries guard — Codex spec R1); and **`null` for
   `(…"8:00 AM"…, "Set")` and `(…, null)`** (phase gate — Codex plan R1). **Failure
   mode caught:** helper firing on a non-bare day (window/end-only/titled/hidden-
   load-out), a non-Show phase day, or leaking a sentinel.
2. **Crew render** (extend `ScheduleSection.showEnd.test.tsx` style): bare
   `showStart:"8:00am"` day renders a `run-of-show-<iso>` container with an
   `agenda-entry` whose text includes `8:00am` AND `Show Start`; assert **no**
   `day-card-meta` node for that day. **Assert against the entry, not the day
   container** (anti-tautology). **Failure mode:** regressing to the meta line, or
   rendering the entry in the muted synthetic tone.
3. **Crew sentinel regression** (update `ScheduleSection.test.tsx:280-292`): bare
   `showStart:"8:00am"` no longer produces `day-card-meta` — flip the assertion to
   the `agenda-entry`. Keep the `TBD` half asserting **neither** meta nor entry.
4. **Wizard render** (update `ScheduleDayRow.meta.test.tsx:21-25`): `showStart:"8:00 AM"`
   day renders a `sched-time`=`8:00 AM` + `sched-title`=`Show Start`, and **no**
   `sched-meta` node. **Failure mode:** regressing to `timeMeta`.
5. **resolveKeyTimes non-regression** (`tests/crew/resolveKeyTimes.test.ts`): a
   bare-showStart day still yields the `shows` anchor from `showStart` unchanged —
   proves the renderer-only synthesis did not touch the anchor. **Failure mode:**
   accidental parser-level change double-anchoring the KeyTimesStrip.
6a. **Non-Show phase regression** (crew + wizard): a **Set** day carrying a bare
   `showStart` (`dates.set === D`, `runOfShow[D]={entries:[],showStart:"8:00 AM",…}`,
   `showDays` excludes D) renders **no** `agenda-entry`/`sched-title` with text
   `Show Start`; crew keeps its `Setup …`/Set rendering, wizard keeps its prior meta.
   **Failure mode caught:** the phase-blind leak Codex flagged — a Set/travel date
   colliding with a show date mislabeling setup time as a show start.

6. **Hidden-load-out #169 regression** — the existing
   `ScheduleSection.loadoutMeta.test.tsx:45-66` already pins the contract (raw
   `entries=[{kind:"loadout"}]` + real `showStart`, no transport → `day-card-meta`
   renders, **no** `run-of-show-` container). It MUST stay **green unchanged** after
   this change; the implementation task treats a red here as a gate failure, not a
   test to update. This existing test IS the regression guard for the Codex R1
   raw-entries decision — no new test needed, but the plan pins it as a
   must-not-break checkpoint.

Every expected value derives from the fixture/props (`8:00 AM` from the input
`showStart`), not a hardcoded unrelated literal.

## 11. Numeric sweep

Literals in this spec: `8:00 AM` (fixture line 207, May 13), `5:00 PM`/`6:00 PM`
(May 14 contrast), `SCHEDULE_ENTRIES_CAP` (existing, not redefined),
`RUN_OF_SHOW_DISPLAY_CAP=20` (existing). No new numeric constant introduced. One
new string literal: `"Show Start"`, defined once in the helper and referenced by
all tests.

## 12. Out of scope

- Parser changes (deliberately none — §4.1).
- Window / end-only / Set / titled day rendering (unchanged — §3).
- The `GS:` prefix source semantics (the label is a fixed noun, not derived from
  the sheet's `GS:` token).
- TodaySection: on a bare-showStart today, `todays = scheduleEntriesForViewer(...)`
  is `[]` (`TodaySection.tsx:224-227`), so its `RunOfShowList`
  (`TodaySection.tsx:662`) renders nothing; the start instead surfaces as an
  already-**labeled** KeyTimesStrip `shows` anchor via `resolveKeyTimes`
  (`TodaySection.tsx:250` → `KeyTimesStrip.tsx`). There is no unlabeled bare time
  on Today, so no change is needed or made there.
