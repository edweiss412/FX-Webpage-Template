# Stage-filtered crew schedule — design spec

**Date:** 2026-07-03
**Slug:** `2026-07-03-stage-filtered-schedule`
**Origin:** Bug report #248 (admin) — Doug flagged `UNKNOWN_DAY_RESTRICTION` on Calvin Saller's role cell `- Load In / Set / Strike / Load Out ONLY***` as a false positive; disposition ratified by the user as the **full fix** (stage-filtered schedule), autonomous ship.

---

## 1. Problem

A crew member whose role cell is a **stage restriction** — `- Load In / Set / Strike / Load Out ONLY***` (Calvin Saller, recurring across `2026-03-rpas`, `2026-04-waldorf`, `2026-05-fintech`, and the live "II - Retirement Plan Advisor Institute - Central 2026") — is currently mis-modeled two ways, both stemming from `lib/parser/blocks/crew.ts:341`:

```js
let dateRestriction = dayResult.restriction;            // = { kind: "none" } for Calvin
if (hasTripleAsterisk(params.roleRaw) && dateRestriction.kind === "none") {
  dateRestriction = { kind: "unknown_asterisk", days: null };   // (a) schedule side-effect
  // + push UNKNOWN_DAY_RESTRICTION warning                     // (b) the operator nag
}
```

1. **(b) A non-actionable operator warning.** `UNKNOWN_DAY_RESTRICTION` (`lib/messages/catalog.ts:1026-1038`) tells Doug to *"Add a parenthetical to their name like `(6/24 and 6/26 ONLY)`."* But this cell carries no dates to recover — the `***` is emphasis on a **phase** restriction (Calvin works the Load In / Set / Strike / Load Out phases, not the show). The restriction is already fully parsed into `stage_restriction = { kind: "explicit", stages: ["Load In","Set","Strike","Load Out"] }` (`lib/parser/personalization.ts:53-54,159-160`). Adding date qualifiers is, per Doug, inappropriate.

2. **(a) The whole schedule is suppressed.** Because the same line sets `date_restriction = unknown_asterisk`, and **`date_restriction` (not `stage_restriction`) is what gates the schedule**, Calvin's crew page shows only *"Your days haven't been confirmed yet."* (`components/crew/sections/ScheduleSection.tsx:164`): `resolveKeyTimes` short-circuits to `{}` (`lib/crew/resolveKeyTimes.ts:97`) and `visibleShowDays` returns `[]` (`lib/crew/agendaDisplay.ts:107`). He cannot see even his **Set** and **Strike** days, which are perfectly knowable. `stage_restriction` today only gates pack-list/gear visibility (`lib/visibility/packList.ts:122-140` via `components/crew/sections/GearSection.tsx:190-197`); it never touches the day list.

The historical corpus note that seeded the current behavior — `fixtures/shows/_schema-diff.md:249` / §8 #1, which called the 2026 `***` form "a regression — the sheets lost the data on which days Calvin works" — is the interpretation Doug is correcting. It is **not** lost date data; it is a phase restriction. This spec updates that note.

## 2. Goal

A crew member with a stage restriction sees a schedule filtered to **the days on which they work a phase they're assigned to**: Calvin sees Travel In, Set, the compound final Show+Strike day, and Travel Out; he does **not** see the pure Show days. The operator nag disappears. No genuinely-unknown `***` case (a bare `LEAD***` with no stage list) loses its warning.

### Non-goals

- Not touching the `unknown_asterisk` mechanism itself. It survives verbatim for the bare-`***` case (defensive path).
- Not removing the `UNKNOWN_DAY_RESTRICTION` code, catalog row, spec §12.4 row, or its membership in `OPERATOR_ACTIONABLE_ANCHORED`. Bare `LEAD***` still emits it.
- No DB/schema change (`crew_members.stage_restriction jsonb` already exists and is parsed, persisted, projected — `supabase/migrations/20260501000000_initial_public_schema.sql:40`; `lib/parser/blocks/crew.ts:363`; `lib/sync/runScheduledCronSync.ts:1305-1336`).
- No advisory-lock change. No new §12.4 code. No new component and (targeted) no component-file edit.

## 3. Architecture — effective-restriction chokepoint

**Chosen approach: narrow the viewer's projected `dateRestriction` ONCE, at the single projection chokepoint, by folding the stage restriction into an effective day-explicit restriction.** Every downstream day-derivation site already reads the projected `dateRestriction`; none needs to become stage-aware.

### 3.1 New pure module `lib/crew/stageSchedule.ts`

```ts
import type { DateRestriction, StageRestriction, ShowRow, WorkPhase } from "@/lib/parser/types";
import { aggregateDays, type SchedulePhase } from "@/lib/crew/agendaDisplay";

// Each aggregate-day phase tag maps to the WorkPhases that day represents. Unioned
// with the show's per-date schedule_phases so a compound Show+Strike day (the last
// show day, per deriveSchedulePhases) is correctly "worked" by a Strike crew.
const PHASE_TAG_WORKPHASES: Record<SchedulePhase, WorkPhase[]> = {
  "Travel In": ["Load In", "Set"], // front-end presence (travelIn has no schedule_phases entry)
  Set: ["Set", "Load In"],
  Show: ["Show"],
  "Travel Out": ["Load Out"], // Strike lives on the compound last-show-day via schedule_phases, not here
};

/** True iff the crew works at least one phase occurring on this aggregate day. */
export function stageWorksDay(
  aggregateDay: { date: string; phase: SchedulePhase },
  schedulePhases: Record<string, WorkPhase[]>,
  stageRestriction: StageRestriction,
): boolean {
  if (stageRestriction.kind === "none") return true;
  const phases = new Set<WorkPhase>([
    ...(schedulePhases[aggregateDay.date] ?? []),
    ...PHASE_TAG_WORKPHASES[aggregateDay.phase],
  ]);
  const stages = new Set(stageRestriction.stages);
  for (const p of phases) if (stages.has(p)) return true;
  return false;
}

/**
 * Fold a stage restriction into an effective viewer-facing date restriction.
 * Returns the input dateRestriction unchanged when there is no stage restriction.
 */
export function effectiveViewerDateRestriction(
  dates: ShowRow["dates"],
  schedulePhases: Record<string, WorkPhase[]>,
  dateRestriction: DateRestriction,
  stageRestriction: StageRestriction,
): DateRestriction {
  if (stageRestriction.kind === "none") return dateRestriction;

  const workedDays = aggregateDays(dates)
    .filter((d) => stageWorksDay(d, schedulePhases, stageRestriction))
    .map((d) => d.date);

  if (dateRestriction.kind === "explicit") {
    // Rare defensive combo (parsed dates AND a stage restriction): intersect.
    const worked = new Set(workedDays);
    return { kind: "explicit", days: dateRestriction.days.filter((d) => worked.has(d)) };
  }
  if (dateRestriction.kind === "unknown_asterisk") {
    // Post-parser-fix (§4) this combo cannot arise (unknown_asterisk is only set
    // when stage kind is none). Preserve the zero-leak posture if it ever does.
    return dateRestriction;
  }
  // kind === "none" — the common stage-only case (Calvin).
  return { kind: "explicit", days: workedDays };
}
```

`SchedulePhase` (`"Travel In" | "Set" | "Show" | "Travel Out"`) and `aggregateDays` are exported from `lib/crew/agendaDisplay.ts:66,80`. `WorkPhase` (`"Load In" | "Set" | "Show" | "Strike" | "Load Out"`) is `lib/parser/types.ts:141`.

### 3.2 Chokepoint call site

`lib/data/getShowForViewer.ts` `readCrewMembers` (currently `:400-424`) sets each projected crew row's `dateRestriction`. `show` (built at `:350`, carrying `schedule_phases` at `:357`) is in scope; `stage_restriction` is decoded on the same row. Wrap the existing `normalizeDateRestriction(...)` result:

```ts
dateRestriction: effectiveViewerDateRestriction(
  show.dates,
  show.schedule_phases,
  normalizeDateRestriction(
    decodeJsonbColumn<DateRestriction>(row.date_restriction) ?? { kind: "none" },
    show.dates,
  ),
  decodeJsonbColumn<StageRestriction>(row.stage_restriction) ?? { kind: "none" },
),
```

`crewMembers[].dateRestriction` is already a **view-model** (it passes through `normalizeDateRestriction`), so computing an effective value here is consistent with its existing role. The raw `stage_restriction` remains separately projected at `:421-423` (unchanged) for `GearSection`.

### 3.3 Why every downstream consumer is unchanged

Verified against the blast-radius sweep. All five independent day-derivation sites read the projected `dateRestriction` (directly or via the same crew row) and already handle `kind: "explicit"` with an arbitrary ISO day set:

| Site | file:line | Rides narrowed restriction because… |
|---|---|---|
| `visibleShowDays` | `agendaDisplay.ts:102-113` | `explicit` → `showDays.filter(d ∈ days)`. Calvin's `days` include only the worked show day (the compound final day), so pure show days drop. |
| `resolveKeyTimes` | `resolveKeyTimes.ts:97,129` | Iterates `visibleShowDays`; Set anchor from `dates.set` and Strike from room `strike_time` are day-list-independent and still render. |
| `ScheduleSection` explicit branch | `ScheduleSection.tsx:185-191` | `allDays.filter(d => allowedShowDays.has(d) || days.includes(d))` — the branch is already built to admit **non-show** dates in `days` (travel/set), so the effective day set renders exactly the worked aggregate days. |
| runOfShow gate | `getShowForViewer.ts:677-693` | Re-derives from the same projected row → sees the narrowed restriction; drops off-day runOfShow keys. |
| `selectRightNowState` | `rightNow.ts:227-295` | `viewerDays = explicit ? days : null`, using sorted min/max + `[travelIn, travelOut]` span checks — does **not** assume `days ⊆ showDays`. On a hidden show day → `viewer_off_day` (`nextAssignedDay` = next worked day); on a worked day → normal show-wide state. |
| `TodaySection` inline `eligible` | `TodaySection.tsx:212-214` | `eligible = kind==='explicit' && days.has(todayIso)` → false on hidden show days → Mode B, correct. |

`buildRightNowContext.ts:72-113`, `RightNowHero.tsx:359`, `_CrewShell.tsx`, `CrewSection.tsx` are pure conduits (no `kind` branching). `partialAttendanceLabel` — see §6.

## 4. Parser change (Part 1)

`lib/parser/blocks/crew.ts:341` — add the stage guard. `stageRestriction` is already computed at `:324` and in scope:

```js
let dateRestriction = dayResult.restriction;
if (
  hasTripleAsterisk(params.roleRaw) &&
  dateRestriction.kind === "none" &&
  stageRestriction.kind === "none"          // NEW: a *** absorbed by a stage-ONLY marker is emphasis, not a day flag
) {
  dateRestriction = { kind: "unknown_asterisk", days: null };
  // + UNKNOWN_DAY_RESTRICTION warning (unchanged)
}
```

**Discriminator (verified against the full corpus):** every `***` in the real show fixtures is the full-stage `Load In / Set / Strike / Load Out ONLY***` form (`fixtures/shows/exporter-xlsx/{fintech,rpas}.md`, and 2026-04-waldorf). The only bare-`***` case is the synthetic unit fixture `- LEAD***` (Amy Lane, `tests/parser/crewRoleWarningBlockRef.test.ts:23`), which has **no** stage marker → `stageRestriction.kind === "none"` → still emits `unknown_asterisk` + `UNKNOWN_DAY_RESTRICTION`. So the guard fixes Calvin without stranding the defensive path.

**Interaction note:** `LOAD_IN_SET_ONLY_PATTERN` / `LOAD_OUT_STRIKE_ONLY_PATTERN` (`personalization.ts:55-56`) are fully anchored and do **not** absorb a trailing `***`. If a future cell were `- Load In / Set ONLY***`, `extractStageRestriction` returns `none` and the `***` would (correctly) still be treated as an unknown day restriction. Only the full-stage form absorbs `***` (`FULL_STAGE_ONLY_PATTERN` `\*{0,3}`), which is exactly the case we want to reclassify. This is consistent and intentional.

## 5. Worked example (Calvin, `2026-05-fintech` DATES detail grid — dates 5/2–5/7)

`dates`: travelIn `2026-05-02`, set `2026-05-03`, showDays `[05-04, 05-05, 05-06]`, travelOut `2026-05-07`. `schedule_phases` (via `deriveSchedulePhases`, `lib/parser/index.ts:333-368`): `{05-03:["Set"], 05-04:["Show"], 05-05:["Show"], 05-06:["Show","Strike"], 05-07:["Load Out"]}` (travelIn has **no** entry; last show day is compound; `Load In` on set day only if travelIn absent/same-day — here travelIn is separate, so set = `["Set"]`).

`stageRestriction.stages = ["Load In","Set","Strike","Load Out"]` (Show excluded). `stageWorksDay` per aggregate day:

| Aggregate day | phase tag | `schedule_phases[date]` | union WorkPhases | ∩ stages? | Visible |
|---|---|---|---|---|---|
| 05-02 | Travel In | — | Load In, Set | Set ✓ | **yes** |
| 05-03 | Set | Set | Set, Load In | Set ✓ | **yes** |
| 05-04 | Show | Show | Show | ✗ | no |
| 05-05 | Show | Show | Show | ✗ | no |
| 05-06 | Show | Show, Strike | Show, Strike | Strike ✓ | **yes** |
| 05-07 | Travel Out | Load Out | Load Out | Load Out ✓ | **yes** |

→ effective `dateRestriction = { kind:"explicit", days:["2026-05-02","2026-05-03","2026-05-06","2026-05-07"] }`.

Calvin's schedule renders day cards for 5/2, 5/3, 5/6, 5/7; hides pure show days 5/4, 5/5. The compound final show day (5/6) **is shown** — he strikes it, and seeing the day's timeline tells him when the show wraps so he can start strike. Right Now on 5/4 → `viewer_off_day`, next = 5/6. Roster chip → his worked days (was "Partial (dates TBD)").

Other stage patterns (fixtures exist — `lib/validation/fixtures.ts:365,381` = `Load In / Set`):
- **Load In / Set ONLY** → visible {Travel In, Set}; hides all show days + Travel Out.
- **Load Out / Strike ONLY** → visible {compound final Show+Strike day, Travel Out}; hides Travel In, Set, pure show days.

## 6. Guard conditions & copy

- **`stageRestriction.kind === "none"`** (every unrestricted crew, the vast majority): `effectiveViewerDateRestriction` returns the input unchanged → identical behavior to today. This is the dominant path and must be a no-op.
- **Empty `stages` array** (`{ kind:"explicit", stages: [] }` — not produced by the parser, but defensively possible): `stageWorksDay` → no phase matches → **every** aggregate day filtered out → effective `days: []`. `visibleShowDays` → `[]`; ScheduleSection explicit branch → 0 cards → the existing **"Show dates haven't been confirmed yet."** `EmptyState` (`ScheduleSection.tsx:253`). No crash, no leak. Acceptable degradation; documented.
- **`dates.showDays` empty / all-null dates**: `aggregateDays` yields only the present phase days; `workedDays` is a subset; downstream unchanged. `selectRightNowState` still hits its `dateless`/`unknown` fallbacks first (`rightNow.ts:210-216`).
- **`schedule_phases` empty** (older persisted shows before the projection existed — fallback `{}` at `getShowForViewer.ts:346`): `stageWorksDay` relies on `PHASE_TAG_WORKPHASES` alone. Travel In→{LoadIn,Set}, Set→{Set,LoadIn}, Show→{Show}, Travel Out→{Strike,LoadOut}. Calvin: Travel In ✓, Set ✓, **all** show days ✗ (no Strike signal without schedule_phases), Travel Out ✓. The compound final day degrades to hidden. This is a strictly-safe degradation (hides one day rather than leaking); documented as a known limitation for pre-projection shows.
- **`partialAttendanceLabel` (`lib/crew/partialAttendance.ts:11-19`, rendered per roster member at `CrewSection.tsx:186`):** now receives an `explicit` restriction for stage-restricted crew, so it renders the humanized worked-day list (e.g. "May 2, 3, 6 & 7") instead of the prior `unknown_asterisk` → "Partial (dates TBD)". This is an **improvement** (real days > "TBD") and requires **no code change**. Because narrowing is per-projected-row, every roster member's chip reflects their own effective days; the admin sync-review modal (`Step3SheetCard.tsx:420`) reads the raw `m.date_restriction` from a separate query and is unaffected.

## 7. Catalog / §12.4

**No copy change is required.** `UNKNOWN_DAY_RESTRICTION` stays in `MESSAGE_CATALOG` (`catalog.ts:1026-1038`), `SPEC_CODES` (spec §12.4 `:2881,:3171`), `OPERATOR_ACTIONABLE_ANCHORED` (`dataGaps.ts:126`), and the internal enum registry (`__generated__/internal-code-enums.ts:284`). Bare `LEAD***` still emits it, so the row remains valid as-is. The x1-catalog-parity gate (`tests/cross-cutting/codes.test.ts:73-87`) stays green because none of the four parity fields (`dougFacing`/`crewFacing`/`followUp`/`helpfulContext`) change. The `` `***` `` literal in `dougFacing` is preserved (guarded by `tests/messages/lookup-unknown-code.test.ts:106-113`). No `pnpm gen:spec-codes` run needed.

## 8. UI-surface determination (invariant 8)

The chokepoint architecture edits only `lib/` (parser, a new crew helper, the data projection). **No file under `app/` (except api), `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md` is edited.** Therefore the invariant-8 `/impeccable critique`+`audit` dual-gate is **N/A by no-UI-diff** — it is a UI-*code* contract. The *rendered output* changes materially (Calvin's schedule goes blank → populated), so the plan MUST include a **real-browser (Playwright) behavior + layout verification** that (a) Calvin's worked day cards render and pure show days are absent, and (b) the existing `DayCard` fixed-dimension invariant still holds (the `self-stretch` vline fills the row height — `DayCard.tsx:14-17,87`; Tailwind v4 has no default `align-items: stretch`). If any copy tweak turns out to be needed in a component file, that single file's diff re-triggers invariant 8 for that file.

**Watchpoint / do-not-relitigate (Codex):** the no-component-edit determination is deliberate and load-bearing, not an oversight. The feature is a data-narrowing change; all rendering is existing, battle-tested `explicit`-restriction machinery.

## 9. Dimensional invariants

No new fixed-dimension parent is introduced. The only invariant in scope is the **pre-existing** `DayCard` row: the `w-px self-stretch bg-border` divider (`DayCard.tsx:87`) must continue to fill the `flex items-center` row height (`DayCard.tsx:68`), and the `w-12.5 shrink-0` date badge (`:72`) keeps its 50px width. The Playwright layout task (plan) asserts `getBoundingClientRect()` on `day-card-date` and the divider inside `day-card` for a stage-restricted viewer render, within 0.5px.

## 10. Meta-test inventory

- **CREATE:** `tests/crew/stageSchedule.test.ts` — unit tests for `stageWorksDay` + `effectiveViewerDateRestriction` across every stage pattern and guard condition (§5, §6).
- **EXTEND:** `tests/parser/blocks/crew.test.ts` — Calvin assertions flip `unknown_asterisk` → `none` (`:112-116,265-269,381-393,395-402`) + a new negative assertion that Calvin emits **no** `UNKNOWN_DAY_RESTRICTION` (via the `agg.warnings.filter` pattern at `:686-695`); Amy Lane bare-`LEAD***` unchanged.
- **No new structural registry.** The blast-radius sweep confirmed the day-derivation sites do not share a single helper today; this feature does **not** add a shared render-time predicate (it centralizes at the projection), so there is no new drift surface to pin. The existing `tests/crew/agendaDisplay-single-source.test.ts` stays green (agendaDisplay exports/imports unchanged). Declared explicitly per the meta-test-inventory rule.

## 11. Resolved decisions

1. **Chokepoint over per-site.** Narrowing once in `getShowForViewer.readCrewMembers` beats editing the 5 independent day-derivation sites: single well-tested pure function, zero component/consumer edits, reuses the existing `explicit`-restriction path, no drift surface. (Rejected: per-site stage-awareness — 5 files, needs a new drift meta-test, higher review surface.)
2. **`schedule_phases` union with aggregate-phase tags** as the filter primitive — handles the compound Show+Strike final day correctly (Calvin sees it because he strikes) and the travel-in day (no `schedule_phases` entry) via its phase tag. (Rejected: aggregate phase tags alone — would hide Calvin's strike day; `schedule_phases` alone — would hide travel-in.)
3. **Compound final Show+Strike day is SHOWN** to a Strike-working, Show-excluded crew. Rationale: they physically strike that day; the day's timeline tells them when the show wraps. Not a leak (they are on-site). This refines the ratified preview (which simplified to "hide all show days").
4. **`partialAttendanceLabel` shows the derived worked days** (no code change) — an improvement over "Partial (dates TBD)".
5. **No component-file edits, so invariant-8 dual-gate is N/A**; a real-browser behavior+layout check substitutes.

## 12. Numeric sweep

- 4 Calvin parser assertions flip (`crew.test.ts:115,268,388,401`).
- 6 downstream consumers verified unchanged (§3.3 table); 5 are independent day-derivation sites, `resolveKeyTimes` delegates to `visibleShowDays`.
- 3 stage patterns handled (`Load In/Set/Strike/Load Out`, `Load In/Set`, `Load Out/Strike`).
- Worked example: 6 aggregate days → 4 visible, 2 hidden (§5 table).
- 0 new §12.4 codes; 0 DB migrations; 0 component-file edits (target); 0 catalog copy edits.

## 13. Watchpoints (Codex disagreement-loop preempts)

1. **`unknown_asterisk` mechanism is NOT removed** — it survives for bare-`LEAD***` (`crew.test.ts:43-46` proves it). Do not relitigate as "dead code."
2. **No-component-edit / invariant-8 N/A** is intentional (§8). Do not require `/impeccable` on a diff that touches no UI file.
3. **Folding stage → effective `explicit` dateRestriction** is a deliberate view-model computation, not a semantic corruption of the parsed `date_restriction` field (the projection already normalizes; §3.2). Cite `getShowForViewer.ts:407-420`.
4. **Catalog row retained, no §12.4 lockstep needed** (§7) — the code persists; only Calvin stops emitting it.
5. **Compound-day visibility** (§11.3) is a ratified refinement, not a bug.

## 14. Existing-code citations (verified 2026-07-03)

`crew.ts:324` (stageRestriction in scope), `:340-352` (guard); `personalization.ts:53-56` (stage patterns), `:159-169` (extractStageRestriction), `:375-377` (hasTripleAsterisk); `types.ts:24-30` (DateRestriction/StageRestriction), `:113-130` (ShowRow.dates + schedule_phases), `:141` (WorkPhase); `index.ts:333-368` (deriveSchedulePhases), `:543` (call); `getShowForViewer.ts:350,357` (show + schedule_phases), `:400-424` (readCrewMembers chokepoint), `:677-693` (runOfShow gate); `agendaDisplay.ts:66,80-93,102-113` (SchedulePhase/aggregateDays/visibleShowDays); `resolveKeyTimes.ts:97,129`; `rightNow.ts:227-295`; `ScheduleSection.tsx:157-191,253`; `TodaySection.tsx:212-214`; `partialAttendance.ts:11-19`; `CrewSection.tsx:186`; `DayCard.tsx:68,72,87`; `catalog.ts:1026-1038`; `dataGaps.ts:126`; `packList.ts:83-90,122-140`; `crewRoleWarningBlockRef.test.ts:23,43-46`.
