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
- No advisory-lock change. No new §12.4 code. No new component. Four existing UI files get argument-threading edits only (`ScheduleSection.tsx`, `TodaySection.tsx`, `buildRightNowContext.ts`, `_CrewShell.tsx`, §3.4) — invariant 8 applies (§8).

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
  // kind === "none" (new parser, §4) OR "unknown_asterisk" (LEGACY rows the
  // current parser already persisted before the §4 guard shipped). In BOTH
  // cases an explicit stage_restriction is the authoritative signal, so it wins
  // — the stale unknown_asterisk is overridden here at projection time. This is
  // what makes the fix land WITHOUT a DB backfill or forced resync (§4.1).
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

### 3.3 Downstream consumer inventory

Verified against the blast-radius sweep. **Five `dateRestriction` consumers ride the chokepoint with NO edit** (they read the projected/narrowed `dateRestriction` — directly or via the same crew row — and already handle `kind: "explicit"` with an arbitrary ISO day set). **One helper (`resolveKeyTimes`) needs the explicit stage edit in §3.4** because its Set/Strike anchors are day-list-independent.

| Site | edit? | file:line | Behavior |
|---|---|---|---|
| `visibleShowDays` | none | `agendaDisplay.ts:102-113` | `explicit` → `showDays.filter(d ∈ days)`. Calvin's `days` include only the worked show day (the compound final day), so pure show days drop. |
| `ScheduleSection` explicit branch | none | `ScheduleSection.tsx:185-191` | `allDays.filter(d => allowedShowDays.has(d) || days.includes(d))` — already admits **non-show** dates in `days` (travel/set), so it renders exactly the worked aggregate days. |
| runOfShow gate | none | `getShowForViewer.ts:677-693` | Re-derives from the same projected row → sees the narrowed restriction; drops off-day runOfShow keys. |
| `selectRightNowState` | none | `lib/time/rightNow.ts:227-295` | `viewerDays = explicit ? days : null`, sorted min/max + `[travelIn, travelOut]` span checks — does **not** assume `days ⊆ showDays`. Hidden show day → `viewer_off_day` (`nextAssignedDay` = next worked day); worked day → normal show-wide state. |
| `TodaySection` inline `eligible` | none | `TodaySection.tsx:212-214` | `eligible = kind==='explicit' && days.has(todayIso)` → false on hidden show days → Mode B, correct. |
| `resolveKeyTimes` | **§3.4** | `resolveKeyTimes.ts:97,107-118,129` | Show anchors ride `visibleShowDays` (narrowed), no edit. **Set/Strike anchors are day-list-independent → need the explicit stage param.** |

`components/right-now/buildRightNowContext.ts:72-113`, `RightNowHero.tsx:359`, `_CrewShell.tsx`, `CrewSection.tsx` are pure conduits (no `kind` branching). `partialAttendanceLabel` — see §6.

### 3.4 One consumer edit — `resolveKeyTimes` set/strike anchors (not day-list-gated)

The chokepoint does NOT cover `resolveKeyTimes`'s **Set** and **Strike** anchors: they are emitted day-list-**independently** (Set from `dates.loadIn`/room `set_time` at `resolveKeyTimes.ts:107-113`; Strike from room `strike_time` at `:116-118`), consulting neither `dateRestriction` nor `visibleShowDays`. For Calvin (works every phase but Show) this is correct — he wants both. But for the other stage patterns it mis-shows an off-stage call time: a `Load In / Set ONLY` crew would still see the Strike time; a `Load Out / Strike ONLY` crew would still see the Set time.

Fix: give `resolveKeyTimes` an OPTIONAL `stageRestriction` param (default `{ kind: "none" }` → fully backward-compatible; existing date-only-restricted crew and all 4-arg callers/tests are unaffected):

```ts
export function resolveKeyTimes(
  show: Pick<ShowRow, "dates">,
  rooms: ProjectedRoomRow[] | null,
  runOfShow: RunOfShow | null,
  dateRestriction: DateRestriction,
  stageRestriction: StageRestriction = { kind: "none" },   // NEW
): KeyTimeAnchors {
  // ...
  const worksFrontEnd =
    stageRestriction.kind === "none" ||
    stageRestriction.stages.some((s) => s === "Load In" || s === "Set");
  const worksBackEnd =
    stageRestriction.kind === "none" ||
    stageRestriction.stages.some((s) => s === "Strike" || s === "Load Out");
  // gate: assign anchors.set only when worksFrontEnd; anchors.strike only when worksBackEnd.
}
```

Gating is by **stage** (not by the narrowed day list) precisely so a genuinely date-restricted-but-not-stage-restricted crew is untouched — `kind === "none"` makes both booleans true, preserving today's behavior. The Show anchors (`shows[]`) remain gated via `visibleShowDays(dateRestriction)` (already narrowed by the chokepoint), so all three anchor types are now consistent.

**`resolveKeyTimes` has THREE callers — all must pass the stage restriction, or the default `{ kind: "none" }` re-opens the leak.** `resolveViewerContext` returns `stageRestriction: StageRestriction` on its result (`viewerContext.ts:79,133-135`); each call site reads it per its OWN binding style (verified live):

1. `ScheduleSection.tsx:95,108` — this file **destructures**: `const { dateRestriction, isAdmin } = resolveViewerContext(...)` (`:95`). Add `stageRestriction` to the destructure → `const { dateRestriction, isAdmin, stageRestriction } = resolveViewerContext(...)`, then pass `stageRestriction` as the 5th arg to `resolveKeyTimes` (`:108`).
2. `TodaySection.tsx:170,249-254` — this file **binds `ctx`**: `const ctx = resolveViewerContext(...)` (`:170`). Pass `ctx.stageRestriction` as the 5th arg to `resolveKeyTimes` (`:249-254`).
3. `components/right-now/buildRightNowContext.ts:85` — **indirect** (feeds the Right Now hero's `loadInTime`/`strikeTime` at `:86,91`). `buildRightNowContext` takes no `stageRestriction` today, so it gains an OPTIONAL `stageRestriction: StageRestriction` field on its `opts` object (default `{ kind: "none" }`) and forwards it to `resolveKeyTimes` (`:85`). **Its two callers** both bind `ctx`: `TodaySection.tsx:237-243` and `app/show/[slug]/[shareToken]/_CrewShell.tsx:222` (`ctx` bound at `:170` / `:183` respectively) — each adds `stageRestriction: ctx.stageRestriction` to the opts.

All four affected render files (`ScheduleSection.tsx`, `TodaySection.tsx`, `_CrewShell.tsx`, `buildRightNowContext.ts`) are UI surfaces (`components/**` / `app/show/**`, not `app/api/**`), so invariant 8 applies (§8). The edits are pure argument-threading (no markup/style change).

### 3.5 Agenda area — intentionally NOT day-filtered (scoping, F3)

The Agenda area (`ScheduleSection.tsx:117-152`) renders `AgendaEmbed` + per-link `AgendaScheduleBlock` from `link.extracted`. It is a **whole-show artifact**: `AgendaScheduleBlock` receives **no** date/stage restriction and renders the show's full agenda for **every** viewer today. The ONLY branch that suppresses it is the `unknown_asterisk` early-return (`:157-168`); every `explicit`- and `none`-restricted crew already sees the unfiltered agenda (`:170-172`). This feature therefore does **not** change the agenda's filtering contract — it only moves a stage-restricted crew (Calvin) from the `unknown_asterisk` branch (agenda suppressed) into the normal branch (agenda shown), joining every other on-show crew. Calvin legitimately works the show week (he strikes the final show day), and the agenda helps him time his strike. **Decision: the agenda area is out of scope for day/stage filtering** — filtering per-day agenda content for restricted crew would be a separate change affecting ALL date-restricted crew (a pre-existing behavior), filed to BACKLOG (`BL-AGENDA-PERDAY-VIEWER-FILTER`), not introduced or regressed here.

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

### 4.1 Legacy persisted data — no backfill required

The current parser has **already persisted** Calvin's rows with `date_restriction = unknown_asterisk` and `stage_restriction = explicit`. The §4 guard only affects **future** parses. The fix still lands immediately on live pages because the projection override in §3.1 treats an explicit `stage_restriction` as authoritative and computes worked days **regardless** of whether the stored `date_restriction` is `none` (post-guard) or `unknown_asterisk` (legacy). So **no DB backfill, migration, or forced resync is needed** — the very next page render is correct. The parser change and the projection override are complementary, not redundant: the projection fixes the **schedule** for existing+future data; the parser change kills the recurring **operator warning** (Doug's actual report, §1(b)) and stores the cleaner `none` on the next natural resync. A test asserts the legacy `unknown_asterisk` + explicit-stage row projects to the worked-day `explicit` restriction (not the `unknown_asterisk` blank branch).

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
- **`schedule_phases` availability at the chokepoint** (`getShowForViewer.ts:343-349`): `const schedulePhases = persistedPhases && typeof persistedPhases === "object" ? persistedPhases : deriveSchedulePhases(datesValue)`. So the **common case — no persisted `event_details.schedule_phases`** (undefined) — **derives** the map inline via `deriveSchedulePhases`, giving the correct compound Show+Strike last day. The compound-day handling therefore holds for every normal show. **Only** a persisted `event_details.schedule_phases` that is literally an empty object `{}` (truthy + `typeof === "object"`) short-circuits derivation and yields `{}`; in that unusual case `stageWorksDay` falls back to `PHASE_TAG_WORKPHASES` alone (Travel In→{LoadIn,Set}, Set→{Set,LoadIn}, Show→{Show}, Travel Out→{Load Out}), so Calvin sees Travel In ✓, Set ✓, **all** show days ✗ (no Strike signal), Travel Out ✓ — the compound final day degrades to hidden. This is strictly-safe (hides a day rather than leaking); documented, and the plan's unit tests cover both the derived path (compound day shown) and the persisted-`{}` degradation.
- **`partialAttendanceLabel` (`lib/crew/partialAttendance.ts:11-19`, rendered per roster member at `CrewSection.tsx:186`):** now receives an `explicit` restriction for stage-restricted crew, so it renders the humanized worked-day list (e.g. "May 2, 3, 6 & 7") instead of the prior `unknown_asterisk` → "Partial (dates TBD)". This is an **improvement** (real days > "TBD") and requires **no code change**. Because narrowing is per-projected-row, every roster member's chip reflects their own effective days; the admin sync-review modal (`Step3SheetCard.tsx:420`) reads the raw `m.date_restriction` from a separate query and is unaffected.

## 7. Catalog / §12.4

**No copy change is required.** `UNKNOWN_DAY_RESTRICTION` stays in `MESSAGE_CATALOG` (`catalog.ts:1026-1038`), `SPEC_CODES` (spec §12.4 `:2881,:3171`), `OPERATOR_ACTIONABLE_ANCHORED` (`dataGaps.ts:126`), and the internal enum registry (`__generated__/internal-code-enums.ts:284`). Bare `LEAD***` still emits it, so the row remains valid as-is. The x1-catalog-parity gate (`tests/cross-cutting/codes.test.ts:73-87`) stays green because none of the four parity fields (`dougFacing`/`crewFacing`/`followUp`/`helpfulContext`) change. The `` `***` `` literal in `dougFacing` is preserved (guarded by `tests/messages/lookup-unknown-code.test.ts:106-113`). No `pnpm gen:spec-codes` run needed.

## 8. UI-surface determination (invariant 8 APPLIES)

The §3.4 `resolveKeyTimes` fix threads `ctx.stageRestriction` into **four UI-surface files**: `components/crew/sections/ScheduleSection.tsx:108`, `components/crew/sections/TodaySection.tsx:237,249-254`, `components/right-now/buildRightNowContext.ts:72-85`, and `app/show/[slug]/[shareToken]/_CrewShell.tsx:222` (all under `components/**` or `app/show/**`, none under `app/api/**`). So **invariant 8 applies**: the plan's close-out runs `/impeccable critique` AND `/impeccable audit` on the affected diff, HIGH/CRITICAL findings fixed or `DEFERRED.md`-deferred, before the Codex whole-diff review. The edits themselves are pure argument-threading (no markup/style change), but the *rendered output* changes materially for stage-restricted crew (Calvin's schedule goes blank → populated), which is exactly what the impeccable pass should evaluate. The lib-only files (`lib/parser/blocks/crew.ts`, new `lib/crew/stageSchedule.ts`, `lib/crew/resolveKeyTimes.ts`, `lib/data/getShowForViewer.ts`) are not UI surfaces themselves. In addition, the plan MUST include a **real-browser (Playwright) behavior + layout verification** that (a) a stage-restricted viewer's worked day cards render and pure show days are absent, and (b) the existing `DayCard` fixed-dimension invariant still holds (the `self-stretch` vline fills the row height — `DayCard.tsx:14-17,87`; Tailwind v4 has no default `align-items: stretch`).

## 9. Dimensional invariants

No new fixed-dimension parent is introduced. The only invariant in scope is the **pre-existing** `DayCard` row: the `w-px self-stretch bg-border` divider (`DayCard.tsx:87`) must continue to fill the `flex items-center` row height (`DayCard.tsx:68`), and the `w-12.5 shrink-0` date badge (`:72`) keeps its 50px width. The Playwright layout task (plan) asserts `getBoundingClientRect()` on `day-card-date` and the divider inside `day-card` for a stage-restricted viewer render, within 0.5px.

## 10. Meta-test inventory

- **CREATE:** `tests/crew/stageSchedule.test.ts` — unit tests for `stageWorksDay` + `effectiveViewerDateRestriction` across every stage pattern, every guard condition (§5, §6), AND the legacy `unknown_asterisk` + explicit-stage override (§4.1).
- **EXTEND:** `tests/parser/blocks/crew.test.ts` — Calvin assertions flip `unknown_asterisk` → `none` (`:112-116,265-269,381-393,395-402`) + a new negative assertion that Calvin emits **no** `UNKNOWN_DAY_RESTRICTION` (via the `agg.warnings.filter` pattern at `:686-695`); Amy Lane bare-`LEAD***` unchanged.
- **EXTEND:** `tests/crew/resolveKeyTimes.test.ts` — new cases: `Load In / Set` stage → Strike anchor SUPPRESSED; `Load Out / Strike` stage → Set anchor SUPPRESSED; Calvin (all-but-Show) → both present; `kind: "none"` (all existing 4-arg callers) → unchanged (backward-compat).
- **EXTEND:** `tests/components/buildRightNowContext.test.ts` — a `Load In / Set` stage viewer → `strikeTime` null; a `Load Out / Strike` viewer → `loadInTime` null; `kind: "none"` → unchanged (proves the 3rd `resolveKeyTimes` caller is threaded, R3 finding).
- **EXTEND:** `tests/data/getShowForViewer*.test.ts` — a stage-restricted crew row (both `none` and legacy `unknown_asterisk` stored `date_restriction`) projects to the worked-day `explicit` restriction.
- **No new structural registry.** The blast-radius sweep confirmed the day-derivation sites do not share a single helper today; this feature centralizes narrowing at the projection (plus the one explicit `resolveKeyTimes` stage param), so there is no new render-time drift surface to pin. The existing `tests/crew/agendaDisplay-single-source.test.ts` stays green (agendaDisplay exports/imports unchanged); `tests/components/tiles/_metaSentinelHidingContract.test.ts` stays green (the `resolveKeyTimes` ShowAnchor.time sentinel-guard source is unchanged — only a new param is added). Declared explicitly per the meta-test-inventory rule.

## 11. Resolved decisions

1. **Chokepoint over per-site.** Narrowing once in `getShowForViewer.readCrewMembers` covers the day-card list, show anchors, runOfShow gate, `selectRightNowState`, and TodaySection-eligible with **no** edits to those consumers — a single well-tested pure function reusing the existing `explicit`-restriction path. Only ONE consumer (`resolveKeyTimes` set/strike anchors, §3.4) needs an explicit stage param because it is day-list-independent. (Rejected: full per-site stage-awareness across all 5 day-derivation sites — needs a new drift meta-test, much higher review surface.)
2. **`schedule_phases` union with aggregate-phase tags** as the filter primitive — handles the compound Show+Strike final day correctly (Calvin sees it because he strikes) and the travel-in day (no `schedule_phases` entry) via its phase tag. (Rejected: aggregate phase tags alone — would hide Calvin's strike day; `schedule_phases` alone — would hide travel-in.)
3. **Compound final Show+Strike day is SHOWN** to a Strike-working, Show-excluded crew. Rationale: they physically strike that day; the day's timeline tells them when the show wraps. Not a leak (they are on-site). This refines the ratified preview (which simplified to "hide all show days").
4. **`partialAttendanceLabel` shows the derived worked days** (no code change) — an improvement over "Partial (dates TBD)".
5. **Legacy persisted `unknown_asterisk` is overridden at projection time by an explicit stage restriction** (§3.1, §4.1) — the fix lands with no DB backfill/resync.
6. **Set/Strike key-times anchors are stage-gated** (§3.4) so off-stage call times don't show for `Load In/Set`-only or `Load Out/Strike`-only crew. **Agenda area stays whole-show / unfiltered** (§3.5) — consistent with existing date-restricted-crew behavior; per-day agenda filtering deferred to BACKLOG.
7. **Invariant-8 dual-gate APPLIES** — four UI files get argument-threading edits (`ScheduleSection.tsx`, `TodaySection.tsx`, `buildRightNowContext.ts`, `_CrewShell.tsx`, §8); the impeccable critique+audit runs on the diff at close-out.

## 12. Numeric sweep

- 4 Calvin parser assertions flip (`crew.test.ts:115,268,388,401`).
- 5 `dateRestriction` consumers ride the chokepoint with NO edit (visibleShowDays, ScheduleSection day-cards, runOfShow gate, `selectRightNowState`, TodaySection-eligible; §3.3 table).
- 1 helper (`resolveKeyTimes`) gains a stage param, threaded through **3 call sites**: `ScheduleSection.tsx:108`, `TodaySection.tsx:249-254`, and `buildRightNowContext.ts:85` — the last also gaining a param passed by **its** 2 callers (`TodaySection.tsx:237`, `_CrewShell.tsx:222`).
- 3 stage patterns handled (`Load In/Set/Strike/Load Out`, `Load In/Set`, `Load Out/Strike`).
- Worked example: 6 aggregate days → 4 visible, 2 hidden (§5 table).
- Code touch points: 4 lib files (`crew.ts`, new `stageSchedule.ts`, `resolveKeyTimes.ts`, `getShowForViewer.ts`) + **4 UI files** (`ScheduleSection.tsx`, `TodaySection.tsx`, `buildRightNowContext.ts`, `_CrewShell.tsx`, arg-threading only). 0 new §12.4 codes; 0 DB migrations; 0 catalog copy edits; 1 BACKLOG entry (`BL-AGENDA-PERDAY-VIEWER-FILTER`).

## 13. Watchpoints (Codex disagreement-loop preempts)

1. **`unknown_asterisk` mechanism is NOT removed** — it survives for bare-`LEAD***` (`crew.test.ts:43-46` proves it). Do not relitigate as "dead code."
2. **Agenda area stays whole-show / unfiltered** (§3.5) — this is a deliberate scoping decision, consistent with existing date-restricted-crew behavior (`ScheduleSection.tsx:170-172`, `AgendaScheduleBlock` receives no restriction). Per-day agenda filtering is a pre-existing separate concern, deferred to `BL-AGENDA-PERDAY-VIEWER-FILTER`. Do not re-raise as a new leak introduced by this feature.
3. **Folding stage → effective `explicit` dateRestriction** is a deliberate view-model computation, not a semantic corruption of the parsed `date_restriction` field (the projection already normalizes at `getShowForViewer.ts:413-420`; §3.2).
4. **Legacy `unknown_asterisk` override** (§3.1/§4.1) is intentional and is what makes the fix land without a backfill — an explicit stage restriction is the authoritative signal.
5. **Catalog row retained, no §12.4 lockstep needed** (§7) — the code persists; only Calvin stops emitting it.
6. **Compound-day visibility** (§11.3) is a ratified refinement, not a bug.
7. **Set/Strike anchor stage-gating** (§3.4) intentionally keys off `stage_restriction` (not the day list) so date-restricted-only crew are unaffected.

## 14. Existing-code citations (verified 2026-07-03)

`crew.ts:324` (stageRestriction in scope), `:340-352` (guard); `personalization.ts:53-56` (stage patterns), `:159-169` (extractStageRestriction), `:375-377` (hasTripleAsterisk); `types.ts:24-30` (DateRestriction/StageRestriction), `:113-130` (ShowRow.dates + schedule_phases), `:141` (WorkPhase); `index.ts:333-368` (deriveSchedulePhases), `:543` (call); `getShowForViewer.ts:350,357` (show + schedule_phases), `:400-424` (readCrewMembers chokepoint), `:677-693` (runOfShow gate); `agendaDisplay.ts:66,80-93,102-113` (SchedulePhase/aggregateDays/visibleShowDays); `lib/crew/resolveKeyTimes.ts:97,107-118,129` (set/strike anchors + calls at `ScheduleSection.tsx:108`, `TodaySection.tsx:249-254`, `components/right-now/buildRightNowContext.ts:72-85` w/ callers `TodaySection.tsx:237`, `_CrewShell.tsx:222`); `lib/time/rightNow.ts:227-295`; `components/crew/sections/ScheduleSection.tsx:117-152,157-191,253` (agenda area + branches); `TodaySection.tsx:212-214`; `partialAttendance.ts:11-19`; `CrewSection.tsx:186`; `DayCard.tsx:68,72,87`; `catalog.ts:1026-1038`; `dataGaps.ts:126`; `packList.ts:83-90,122-140`; `crewRoleWarningBlockRef.test.ts:23,43-46`.
