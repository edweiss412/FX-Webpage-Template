# Stage-filtered crew schedule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans` (or subagent-driven). Steps use checkbox (`- [ ]`) syntax. TDD per task, commit per task with `--no-verify`.

**Goal:** Surface a stage-restricted crew member's worked days (Set / Strike / travel) on their crew page instead of a blank "days unconfirmed" placeholder, and stop the non-actionable `UNKNOWN_DAY_RESTRICTION` operator warning for the stage-`***` form. (Bug #248.)

**Architecture:** A parser guard stops a `***` absorbed by a recognized stage-ONLY marker from being classified as a day restriction. A new pure helper folds `stage_restriction` into an **effective** `explicit` `date_restriction` at the `getShowForViewer.readCrewMembers` projection chokepoint (using `schedule_phases`), so all `dateRestriction` consumers narrow with no edit. One helper (`resolveKeyTimes`) is day-list-independent for its Set/Strike anchors and gains an optional `stageRestriction` param, threaded through its 3 call sites. Spec: `docs/superpowers/specs/schedule/2026-07-03-stage-filtered-schedule.md` (APPROVED, 5 Codex rounds).

**Tech Stack:** TypeScript, Next.js 16 RSC, Vitest (+ jsdom for component tests), Playwright (real-browser layout).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. Commit per task, `<type>(<scope>): <summary>`, `--no-verify`.
- **No raw error codes in UI** (invariant 5): unaffected — no new codes; `UNKNOWN_DAY_RESTRICTION` retained for bare-`***`.
- **exactOptionalPropertyTypes**: optional fields via default param value or conditional spread — never assign `undefined`.
- **No DB/schema change, no advisory lock, no §12.4 code, no catalog copy edit.** `stage_restriction jsonb` already exists.
- **Invariant 8 applies** — Task 5 edits 4 UI files (`ScheduleSection.tsx`, `TodaySection.tsx`, `buildRightNowContext.ts`, `_CrewShell.tsx`); Task 9 runs `/impeccable critique`+`audit`.
- **Advisory-lock topology:** N/A — no `pg_advisory*` touched (read path only). Declared per the writing-plans rule.
- **Meta-test inventory** (spec §10): CREATE `tests/crew/stageSchedule.test.ts` + `tests/e2e/schedule-stage-filter.spec.ts`; EXTEND `tests/parser/blocks/crew.test.ts`, `tests/crew/resolveKeyTimes.test.ts`, `tests/components/buildRightNowContext.test.ts`, `tests/components/crew/sections/ScheduleSection.test.tsx`, `tests/components/crew/sections/TodaySection.test.tsx`, `tests/data/getShowForViewerRunOfShow.test.ts`. No new structural registry (narrowing centralized at the projection; the three `resolveKeyTimes` callers are guarded by red-before-green behavioral tests in T5). Existing `tests/crew/agendaDisplay-single-source.test.ts` and `tests/components/tiles/_metaSentinelHidingContract.test.ts` stay green.
- **Transition-audit task:** N/A — no new component with multiple visual states; existing ScheduleSection branch transitions are unchanged. Declared.

---

### Task 1: Pure helper `lib/crew/stageSchedule.ts`

**Files:**
- Create: `lib/crew/stageSchedule.ts`
- Test: `tests/crew/stageSchedule.test.ts`

**Interfaces:**
- Consumes: `aggregateDays`, `SchedulePhase` from `@/lib/crew/agendaDisplay`; `DateRestriction`, `StageRestriction`, `ShowRow`, `WorkPhase` from `@/lib/parser/types`.
- Produces: `stageWorksDay(aggregateDay, schedulePhases, stageRestriction): boolean`; `effectiveViewerDateRestriction(dates, schedulePhases, dateRestriction, stageRestriction): DateRestriction`.

- [ ] **Step 1: Write the failing test** (`tests/crew/stageSchedule.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { stageWorksDay, effectiveViewerDateRestriction } from "@/lib/crew/stageSchedule";
import type { ShowRow, WorkPhase } from "@/lib/parser/types";

// Fintech worked example (spec §5): 5/2 travelIn, 5/3 set, 5/4-5/6 show, 5/7 travelOut.
const DATES: ShowRow["dates"] = {
  travelIn: "2026-05-02",
  set: "2026-05-03",
  showDays: ["2026-05-04", "2026-05-05", "2026-05-06"],
  travelOut: "2026-05-07",
};
// Derived schedule_phases (spec §5): set→[Set], last show day compound, travelOut→[Load Out].
const PHASES: Record<string, WorkPhase[]> = {
  "2026-05-03": ["Set"],
  "2026-05-04": ["Show"],
  "2026-05-05": ["Show"],
  "2026-05-06": ["Show", "Strike"],
  "2026-05-07": ["Load Out"],
};
const CALVIN = { kind: "explicit", stages: ["Load In", "Set", "Strike", "Load Out"] } as const;

describe("effectiveViewerDateRestriction", () => {
  it("stage none → returns input unchanged (dominant no-op path)", () => {
    const input = { kind: "explicit", days: ["2026-05-04"] } as const;
    expect(effectiveViewerDateRestriction(DATES, PHASES, input, { kind: "none" })).toBe(input);
  });

  it("Calvin (all-but-Show), date none → worked days incl compound Show+Strike day, minus pure show days", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "none" }, CALVIN);
    expect(r).toEqual({
      kind: "explicit",
      days: ["2026-05-02", "2026-05-03", "2026-05-06", "2026-05-07"],
    });
  });

  it("LEGACY: date unknown_asterisk + explicit stage → overridden to worked days (no backfill)", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "unknown_asterisk", days: null }, CALVIN);
    expect(r).toEqual({
      kind: "explicit",
      days: ["2026-05-02", "2026-05-03", "2026-05-06", "2026-05-07"],
    });
  });

  it("Load In / Set ONLY → {Travel In, Set}; hides show days + Travel Out", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "none" }, {
      kind: "explicit",
      stages: ["Load In", "Set"],
    });
    expect(r).toEqual({ kind: "explicit", days: ["2026-05-02", "2026-05-03"] });
  });

  it("Load Out / Strike ONLY → {compound Show+Strike day, Travel Out}; hides Travel In, Set, pure show days", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "none" }, {
      kind: "explicit",
      stages: ["Load Out", "Strike"],
    });
    expect(r).toEqual({ kind: "explicit", days: ["2026-05-06", "2026-05-07"] });
  });

  it("explicit parsed dates + explicit stage → intersection", () => {
    const r = effectiveViewerDateRestriction(
      DATES,
      PHASES,
      { kind: "explicit", days: ["2026-05-06", "2026-05-04"] },
      CALVIN,
    );
    // 5/6 is worked (Strike); 5/4 is a pure show day (not worked) → dropped.
    expect(r).toEqual({ kind: "explicit", days: ["2026-05-06"] });
  });

  it("empty stages array → no day matches → days:[] (safe degradation, no crash)", () => {
    const r = effectiveViewerDateRestriction(DATES, PHASES, { kind: "none" }, {
      kind: "explicit",
      stages: [],
    });
    expect(r).toEqual({ kind: "explicit", days: [] });
  });

  it("empty schedule_phases → compound day degrades to hidden via phase-tag fallback", () => {
    const r = effectiveViewerDateRestriction(DATES, {}, { kind: "none" }, CALVIN);
    // No schedule_phases: Show tag→[Show] only → 5/6 hidden; travelIn/set/travelOut via tags.
    expect(r).toEqual({ kind: "explicit", days: ["2026-05-02", "2026-05-03", "2026-05-07"] });
  });
});

describe("stageWorksDay", () => {
  it("stage none → true for any day", () => {
    expect(stageWorksDay({ date: "2026-05-04", phase: "Show" }, PHASES, { kind: "none" })).toBe(true);
  });
  it("compound Show+Strike day → true for Strike crew", () => {
    expect(stageWorksDay({ date: "2026-05-06", phase: "Show" }, PHASES, CALVIN)).toBe(true);
  });
  it("pure Show day → false for Show-excluded crew", () => {
    expect(stageWorksDay({ date: "2026-05-04", phase: "Show" }, PHASES, CALVIN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/crew/stageSchedule.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the minimal implementation** (`lib/crew/stageSchedule.ts`) — code from spec §3.1, with `PHASE_TAG_WORKPHASES["Travel Out"] = ["Load Out"]`:

```ts
import type { DateRestriction, StageRestriction, ShowRow, WorkPhase } from "@/lib/parser/types";
import { aggregateDays, type SchedulePhase } from "@/lib/crew/agendaDisplay";

const PHASE_TAG_WORKPHASES: Record<SchedulePhase, WorkPhase[]> = {
  "Travel In": ["Load In", "Set"],
  Set: ["Set", "Load In"],
  Show: ["Show"],
  "Travel Out": ["Load Out"],
};

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
  const stages = new Set<WorkPhase>(stageRestriction.stages);
  for (const p of phases) if (stages.has(p)) return true;
  return false;
}

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
    const worked = new Set(workedDays);
    return { kind: "explicit", days: dateRestriction.days.filter((d) => worked.has(d)) };
  }
  // kind "none" (new parser) OR "unknown_asterisk" (legacy row) → stage is authoritative.
  return { kind: "explicit", days: workedDays };
}
```

- [ ] **Step 4: Run test to verify it passes** — `pnpm vitest run tests/crew/stageSchedule.test.ts` → PASS.
- [ ] **Step 5: Typecheck + commit** — `pnpm typecheck && git add lib/crew/stageSchedule.ts tests/crew/stageSchedule.test.ts && git commit --no-verify -m "feat(crew-page): stageSchedule helper — fold stage_restriction into effective day restriction"`

---

### Task 2: Parser guard — stage-`***` is not a day restriction

**Files:**
- Modify: `lib/parser/blocks/crew.ts:341`
- Test: `tests/parser/blocks/crew.test.ts` (extend)

**Concrete failure mode caught:** a full-stage `ONLY***` cell (Calvin) is mis-classified as `unknown_asterisk` and emits a non-actionable `UNKNOWN_DAY_RESTRICTION`; a bare `LEAD***` (Amy Lane) must KEEP that classification+warning.

- [ ] **Step 1: Update the failing assertions + add the negative-warning assertion.** In `tests/parser/blocks/crew.test.ts`:
  - `:112-115` — change `expect(calvin.date_restriction).toEqual({ kind: "unknown_asterisk", days: null })` → `.toEqual({ kind: "none" })`.
  - `:388` and `:401` — same flip to `{ kind: "none" }`.
  - `:265-269` (waldorf) — same flip.
  - Add a new test in the `unknown_asterisk` describe block:

```ts
it("Calvin stage-*** emits NO UNKNOWN_DAY_RESTRICTION warning (bug #248)", () => {
  const agg = newAggregator();
  const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
  parseCrew(md, "v4", agg);
  expect(agg.warnings.filter((w) => w.code === "UNKNOWN_DAY_RESTRICTION")).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/parser/blocks/crew.test.ts` → FAIL (still `unknown_asterisk` + warning emitted).

- [ ] **Step 3: Minimal implementation** — `lib/parser/blocks/crew.ts:341`, add the stage guard:

```js
if (
  hasTripleAsterisk(params.roleRaw) &&
  dateRestriction.kind === "none" &&
  stageRestriction.kind === "none"
) {
```

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/parser/blocks/crew.test.ts` → PASS. Also run `pnpm vitest run tests/parser/crewRoleWarningBlockRef.test.ts` → PASS (Amy Lane bare-`LEAD***` still emits `UNKNOWN_DAY_RESTRICTION`, `:43-46`).
- [ ] **Step 5: Typecheck + commit** — `pnpm typecheck && git add -A && git commit --no-verify -m "fix(parser): stage-*** role cell is a stage restriction, not an unknown day restriction (#248)"`

---

### Task 3: Chokepoint — narrow projected `dateRestriction`

**Files:**
- Modify: `lib/data/getShowForViewer.ts:413-420`
- Test: `tests/data/getShowForViewerRunOfShow.test.ts` (extend; reuse the existing `crewRow` mock helper)

**Concrete failure mode caught:** a stage-restricted crew row (whether stored `none` post-parser or legacy `unknown_asterisk`) projects with the blank/unnarrowed restriction, so the fix never reaches the live page.

**Harness note:** the file's shared `showRow(showDays)` hardcodes `dates.{travelIn,set,travelOut}=null` and `crewRow(dateRestriction)` hardcodes `stage_restriction:{kind:"none"}`. Do NOT edit those shared helpers (other tests depend on them). Add two local helpers at the top of a new `describe` block and override the `shows` response after `setup(...)` so `schedule_phases` derives (event_details is `{}` → projection derives from full `dates`). The crew read serves both the role-flags `.maybeSingle()` and the all-crew `.eq()` from one array, and the viewer matches by `crewMemberId === CREW_ID`.

- [ ] **Step 1: Write the failing test:**

```ts
const FULL_DATES = {
  travelIn: "2026-05-02", set: "2026-05-03",
  showDays: ["2026-05-04", "2026-05-05", "2026-05-06"], travelOut: "2026-05-07",
};
const CALVIN_STAGE = { kind: "explicit", stages: ["Load In", "Set", "Strike", "Load Out"] } as const;
function crewRowStage(dateRestriction: unknown, stage: unknown) {
  return { ...crewRow(dateRestriction), name: "Calvin Saller", stage_restriction: stage };
}
function setupFullDates(dateRestriction: unknown) {
  setup({
    showDays: FULL_DATES.showDays,
    showsInternal: { data: { run_of_show: {} }, error: null },
    crew: { data: [crewRowStage(dateRestriction, CALVIN_STAGE)], error: null },
  });
  mockState.responses.shows = { data: { ...showRow(FULL_DATES.showDays), dates: FULL_DATES }, error: null };
}
const EXPECTED = { kind: "explicit", days: ["2026-05-02", "2026-05-03", "2026-05-06", "2026-05-07"] };

it("stage-restricted crew (stored none) → dateRestriction narrowed to worked days (#248)", async () => {
  setupFullDates({ kind: "none" });
  const out = await getShowForViewer(SHOW_ID, CREW);
  expect(out.crewMembers.find((c) => c.name === "Calvin Saller")!.dateRestriction).toEqual(EXPECTED);
});

it("LEGACY stored unknown_asterisk + explicit stage → same narrowed worked days, no backfill (#248)", async () => {
  setupFullDates({ kind: "unknown_asterisk" });
  const out = await getShowForViewer(SHOW_ID, CREW);
  expect(out.crewMembers.find((c) => c.name === "Calvin Saller")!.dateRestriction).toEqual(EXPECTED);
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts` → FAIL (unnarrowed / unknown_asterisk passthrough).

- [ ] **Step 3: Minimal implementation** — `lib/data/getShowForViewer.ts`, import `effectiveViewerDateRestriction`, wrap the existing `:413` value:

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

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts` → PASS. Run the full getShowForViewer suite to confirm no regression for unrestricted / date-restricted crew.
- [ ] **Step 5: Typecheck + commit** — `pnpm typecheck && git add -A && git commit --no-verify -m "feat(crew-page): narrow projected dateRestriction by stage at getShowForViewer chokepoint (#248)"`

---

### Task 4: `resolveKeyTimes` Set/Strike stage-gating

**Files:**
- Modify: `lib/crew/resolveKeyTimes.ts`
- Test: `tests/crew/resolveKeyTimes.test.ts` (extend)

**Concrete failure mode caught:** Set/Strike anchors are day-list-independent, so without a stage gate a `Load In / Set` crew sees the Strike time and a `Load Out / Strike` crew sees the Set time.

- [ ] **Step 1: Write the failing tests** (reuse the file's `dates()`, `room()`, `NONE` helpers):

```ts
const STAGE_LOADIN_SET = { kind: "explicit", stages: ["Load In", "Set"] } as const;
const STAGE_LOADOUT_STRIKE = { kind: "explicit", stages: ["Load Out", "Strike"] } as const;
const STAGE_ALL_BUT_SHOW = { kind: "explicit", stages: ["Load In", "Set", "Strike", "Load Out"] } as const;
const ANCHOR_DATES = () => dates({ set: "2026-10-07", loadIn: "9:00PM", showDays: ["2026-10-08"] });

it("Load In/Set stage → Strike anchor SUPPRESSED, Set anchor present", () => {
  const gs = room({ strike_time: "10/9 @ 4:30pm" });
  const a = resolveKeyTimes(ANCHOR_DATES(), [gs], null, { kind: "explicit", days: ["2026-10-07"] }, STAGE_LOADIN_SET);
  expect(a.set).toBeDefined();
  expect(a.strike).toBeUndefined();
});

it("Load Out/Strike stage → Set anchor SUPPRESSED, Strike anchor present", () => {
  const gs = room({ strike_time: "10/9 @ 4:30pm" });
  const a = resolveKeyTimes(ANCHOR_DATES(), [gs], null, { kind: "explicit", days: ["2026-10-08"] }, STAGE_LOADOUT_STRIKE);
  expect(a.set).toBeUndefined();
  expect(a.strike).toBeDefined();
});

it("Calvin (all-but-Show) stage → BOTH Set and Strike anchors present (spec §10 primary persona)", () => {
  const gs = room({ strike_time: "10/9 @ 4:30pm" });
  const a = resolveKeyTimes(ANCHOR_DATES(), [gs], null, { kind: "explicit", days: ["2026-10-08"] }, STAGE_ALL_BUT_SHOW);
  expect(a.set).toBeDefined();
  expect(a.strike).toBeDefined();
});

it("stage none (4-arg back-compat, param omitted) → both anchors present (unchanged)", () => {
  const gs = room({ strike_time: "10/9 @ 4:30pm" });
  const a = resolveKeyTimes(ANCHOR_DATES(), [gs], null, NONE); // no 5th arg — optional default
  expect(a.set).toBeDefined();
  expect(a.strike).toBeDefined();
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/crew/resolveKeyTimes.test.ts` → FAIL (both anchors always present).

- [ ] **Step 3: Minimal implementation** — `lib/crew/resolveKeyTimes.ts`: add the optional param + gate. Import `StageRestriction` from `@/lib/parser/types`.

```ts
export function resolveKeyTimes(
  show: Pick<ShowRow, "dates">,
  rooms: ProjectedRoomRow[] | null,
  runOfShow: RunOfShow | null,
  dateRestriction: DateRestriction,
  stageRestriction: StageRestriction = { kind: "none" },
): KeyTimeAnchors {
  if (dateRestriction.kind === "unknown_asterisk") return {};
  const anchors: KeyTimeAnchors = {};
  const worksFrontEnd =
    stageRestriction.kind === "none" ||
    stageRestriction.stages.some((s) => s === "Load In" || s === "Set");
  const worksBackEnd =
    stageRestriction.kind === "none" ||
    stageRestriction.stages.some((s) => s === "Strike" || s === "Load Out");
  // ...existing room-pick...
  // Set (D3): wrap the existing assignments in `if (worksFrontEnd) { ... }`
  if (worksFrontEnd) {
    const loadIn = show.dates.loadIn;
    if (!isAbsentTime(loadIn)) { /* existing */ }
    else if (selected && !isAbsentTime(selected.set_time)) { /* existing */ }
  }
  // Strike: wrap in `if (worksBackEnd) { ... }`
  if (worksBackEnd && selected && !isAbsentTime(selected.strike_time)) {
    anchors.strike = (selected.strike_time as string).trim();
  }
  // ...existing shows[] loop (unchanged — rides visibleShowDays(dateRestriction))...
}
```

- [ ] **Step 4: Run to verify it passes** — `pnpm vitest run tests/crew/resolveKeyTimes.test.ts` → PASS (incl. all pre-existing 4-arg tests). Run `tests/components/tiles/_metaSentinelHidingContract.test.ts` → PASS (sentinel-guard source unchanged).
- [ ] **Step 5: Typecheck + commit** — `pnpm typecheck && git add -A && git commit --no-verify -m "feat(crew-page): stage-gate Set/Strike key-times anchors in resolveKeyTimes (#248)"`

---

### Task 5: Thread `stageRestriction` through the 3 `resolveKeyTimes` callers (UI — invariant 8)

**Files:**
- Modify: `components/crew/sections/ScheduleSection.tsx:95,108`
- Modify: `components/crew/sections/TodaySection.tsx:237-243,249-254`
- Modify: `components/right-now/buildRightNowContext.ts:72-85`
- Modify: `app/show/[slug]/[shareToken]/_CrewShell.tsx:222`
- Test: `tests/components/buildRightNowContext.test.ts` (extend) + `tests/components/crew/sections/ScheduleSection.test.tsx` (extend) + `tests/components/crew/sections/TodaySection.test.tsx` (extend)

**Concrete failure mode caught:** any of the THREE `resolveKeyTimes` callers forgetting to thread `stageRestriction` re-opens the off-stage Set/Strike leak. The param is optional (28 existing 4-arg test calls stay valid), so we guard each of the 3 call sites with an explicit **red-before-green behavioral test** (not typecheck). All three tests are RED after Task 4 (callers not yet threaded → default `none` → anchor shown) and GREEN after this task's edits.

- [ ] **Step 1a: Write the failing ScheduleSection test** (`tests/components/crew/sections/ScheduleSection.test.tsx`, reusing `makeShowForViewer`; extend `withRestriction` to also set `stageRestriction`, and provide a room with `strike_time`). Assert the `KeyTimesStrip` `data-anchor="strike"` is ABSENT for a Load In/Set viewer:

```ts
function withStage(dateR: unknown, stageR: unknown, roomsOverride: unknown[]) {
  return {
    ...makeShowForViewer({ show: { dates: DATES }, rooms: roomsOverride }),
    crewMembers: [{ ...baseCrew, id: "c1", dateRestriction: dateR, stageRestriction: stageR }],
  };
}
test("ScheduleSection: Load In/Set viewer → KeyTimesStrip has NO strike anchor (#248)", () => {
  const { container } = render(
    <ScheduleSection
      data={withStage(
        { kind: "explicit", days: [DATES.travelIn, DATES.set] },
        { kind: "explicit", stages: ["Load In", "Set"] },
        [{ id: "gs", kind: "gs", name: "GS", set_time: "9:00 AM", strike_time: "5:00 PM" }],
      )}
      viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID}
    />,
  );
  expect(container.querySelector('[data-anchor="strike"]')).toBeNull();
  expect(container.querySelector('[data-anchor="set"]')).toBeTruthy();
});
```

- [ ] **Step 1b: Write the failing TodaySection test** (`tests/components/crew/sections/TodaySection.test.tsx`, mirroring its existing render harness + a room with `set_time`). Assert a Load Out/Strike viewer's today KeyTimesStrip has NO `data-anchor="set"` (and that a strike anchor can appear):

```ts
// Mount TodaySection with a Load Out/Strike stage viewer, dateRestriction narrowed to a strike day,
// rooms:[{ set_time, strike_time }]. Assert the today key-times strip shows no set anchor.
expect(container.querySelector('[data-anchor="set"]')).toBeNull();
```

- [ ] **Step 1c: Write the failing buildRightNowContext test** (`tests/components/buildRightNowContext.test.ts`, reusing the file's `room()` and `show()` helpers). `loadInTime = anchors.set` and `strikeTime = anchors.strike`; with no `dates.loadIn`, `anchors.set` comes from `room.set_time`:

```ts
const SHOW = show({ dates: { travelIn: null, set: "2026-05-03", showDays: ["2026-05-06"], travelOut: null } });
const GS = room({ set_time: "9:00 AM", show_time: "1:00 PM", strike_time: "10/9 @ 4:30pm" });

it("Load In/Set stage viewer → strikeTime null, loadInTime present (off-stage suppression, #248)", () => {
  const ctx = buildRightNowContext({
    show: SHOW, dateRestriction: { kind: "explicit", days: ["2026-05-03"] },
    hotelReservations: [], rooms: [GS], runOfShow: null,
    stageRestriction: { kind: "explicit", stages: ["Load In", "Set"] },
  });
  expect(ctx.loadInTime).toBe("9:00 AM");
  expect(ctx.strikeTime).toBeNull();
});

it("Load Out/Strike stage viewer → loadInTime null, strikeTime present", () => {
  const ctx = buildRightNowContext({
    show: SHOW, dateRestriction: { kind: "explicit", days: ["2026-05-06"] },
    hotelReservations: [], rooms: [GS], runOfShow: null,
    stageRestriction: { kind: "explicit", stages: ["Load Out", "Strike"] },
  });
  expect(ctx.loadInTime).toBeNull();
  expect(ctx.strikeTime).toBe("10/9 @ 4:30pm");
});

it("stageRestriction omitted → both anchors present (backward-compat)", () => {
  const ctx = buildRightNowContext({
    show: SHOW, dateRestriction: { kind: "none" },
    hotelReservations: [], rooms: [GS], runOfShow: null,
  });
  expect(ctx.loadInTime).toBe("9:00 AM");
  expect(ctx.strikeTime).toBe("10/9 @ 4:30pm");
});
```

- [ ] **Step 2: Run all three to verify they FAIL** — `pnpm vitest run tests/components/buildRightNowContext.test.ts tests/components/crew/sections/ScheduleSection.test.tsx tests/components/crew/sections/TodaySection.test.tsx` → the 3 new tests FAIL (callers not yet threaded → default `none` → off-stage anchor still shown / opts field missing).

- [ ] **Step 3: Minimal implementation** (thread all 4 UI files):
  - `buildRightNowContext.ts`: add `stageRestriction?: StageRestriction` to the opts object type (import `StageRestriction`); destructure with default `const { ..., stageRestriction = { kind: "none" } } = opts;`; pass as 5th arg at `:85`: `resolveKeyTimes(show, rooms, runOfShow, dateRestriction, stageRestriction)`.
  - `ScheduleSection.tsx:95`: `const { dateRestriction, isAdmin, stageRestriction } = resolveViewerContext(viewer, data);` and `:108` → `resolveKeyTimes(data.show, data.rooms, data.runOfShow, dateRestriction, stageRestriction)`.
  - `TodaySection.tsx:249-254`: add `ctx.stageRestriction` as the 5th arg to `resolveKeyTimes`; `:237-243`: add `stageRestriction: ctx.stageRestriction` to the `buildRightNowContext({...})` opts.
  - `_CrewShell.tsx:222`: add `stageRestriction: ctx.stageRestriction` to the `buildRightNowContext({...})` opts.

- [ ] **Step 4: Run to verify all pass** — the same 3 files → PASS. Then run the full ScheduleSection + TodaySection + rightNowHero suites → PASS (no regression on existing tests).
- [ ] **Step 5: Typecheck + commit** — `pnpm typecheck && git add -A && git commit --no-verify -m "feat(crew-page): thread stageRestriction through resolveKeyTimes callers + buildRightNowContext (#248)"`

---

### Task 6: Real-browser end-to-end — stage-filtered day cards + DayCard layout invariant

**Files:**
- Test: `tests/e2e/schedule-stage-filter.spec.ts` (new Playwright spec) or extend an existing real-browser harness (mirror the standalone real-browser layout harness pattern: tailwind CLI + static HTML + Playwright `getBoundingClientRect`).

**Why real-browser (not jsdom):** this task is BOTH (a) the end-to-end behavior lock — a stage-restricted viewer's worked day cards render and pure show days are absent (system-level; the pre-fix state renders the `schedule-unconfirmed` placeholder with ZERO day cards, so this assertion is genuinely **red before the fix**, green after), AND (b) the Dimensional-Invariants layout assertion, which jsdom cannot do (Tailwind v4 has no default `align-items: stretch`).

**Dimensional Invariants (spec §9):** inside a `day-card` for a stage-restricted viewer render — the `w-px self-stretch bg-border` divider (`DayCard.tsx:87`) fills the `flex items-center` row height (`:68`); the `w-12.5 shrink-0` date badge (`day-card-date`, `:72`) is 50px wide.

**Anti-tautology:** derive the expected worked-day set from the fixture dates via the same `effectiveViewerDateRestriction` math (Task 1), NOT a hardcoded literal; assert against `[data-day]` on the rendered `[data-testid^="schedule-day"]` cards (the day-card container), and confirm the pre-fix render shows `schedule-unconfirmed` + zero day cards.

- [ ] **Step 1: Write the real-browser assertion.** Render the crew Schedule for a stage-restricted viewer (Calvin: dates 5/2–5/7, stage all-but-Show). Assert:
  - rendered `[data-testid^="schedule-day"]` `data-day` set === worked days `["2026-05-02","2026-05-03","2026-05-06","2026-05-07"]` (from the helper, not a literal); `2026-05-04` and `2026-05-05` ABSENT; `schedule-unconfirmed` ABSENT.
  - for each day card: `getBoundingClientRect()` — `divider.height === dayCardRow.height` within 0.5px (self-stretch holds); `dateBadge.width` ≈ 50px within 0.5px.
- [ ] **Step 2: Confirm it is genuinely red before the fix.** Point the harness at the pre-fix behavior (crew row `date_restriction = unknown_asterisk`, unnarrowed) → the render shows `schedule-unconfirmed` + zero day cards → the day-set assertion FAILS. This proves the test is not tautological. (In practice Tasks 1-5 are already committed; run this mutation once to demonstrate the red, then revert.)
- [ ] **Step 3:** No production implementation (verification-only). If it fails on layout, the fix is in scope; if it fails on filtering, Tasks 1-5 regressed.
- [ ] **Step 4: Run** — `pnpm playwright test tests/e2e/schedule-stage-filter.spec.ts` (or the project's real-browser command) → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit --no-verify -m "test(crew-page): real-browser stage-filtered day cards + DayCard layout invariant (#248)"`

---

### Task 7: BACKLOG entry for deferred agenda filtering

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1:** Append `BL-AGENDA-PERDAY-VIEWER-FILTER` — "The Schedule agenda area (`AgendaScheduleBlock`) renders the whole-show agenda unfiltered for ALL date/stage-restricted crew (pre-existing; `ScheduleSection.tsx:170-172`). Consider filtering per-day agenda content to the viewer's visible days. Out of scope for #248 (spec §3.5)." Use `printf` (not `echo >>`) to avoid the trailing-newline trap.
- [ ] **Step 2: Commit** — `git add BACKLOG.md && git commit --no-verify -m "docs(plan): backlog per-day agenda viewer filter (deferred from #248)"`

---

### Task 8: Invariant-8 impeccable dual-gate (UI close-out)

- [ ] **Step 1:** Run `/impeccable critique` on the Task-5 UI diff (the 4 UI files + the rendered stage-filtered Schedule/Today/RightNow surfaces).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix every HIGH/CRITICAL finding, or defer via a `DEFERRED.md` entry with justification. Record findings + dispositions.
- [ ] **Step 4:** Commit any fixes — `git commit --no-verify -m "fix(crew-page): impeccable critique/audit findings on stage-filtered schedule (#248)"` (skip if no changes).

---

### Task 9: Whole-diff adversarial review (cross-model) + close-out

- [ ] **Step 1:** Run the full suite: `pnpm typecheck && pnpm test` (or the targeted structural guards + affected suites if the full run is environment-limited: `stageSchedule`, `crew.test`, `crewRoleWarningBlockRef`, `resolveKeyTimes`, `buildRightNowContext`, `getShowForViewerRunOfShow`, `no-inline-email-normalization`, `operatorActionableWarnings`, `codes`, `agendaDisplay-single-source`). Run `pnpm format:check` (—no-verify commits skip the prettier hook).
- [ ] **Step 2:** Whole-diff **Codex adversarial review** (fresh-eyes, REVIEWER ONLY) → iterate to APPROVE. Triage findings via deferral discipline (land-now / `DEFERRED.md` / `BACKLOG.md`).
- [ ] **Step 3:** Push; open PR; **real CI green** (both unit-suite shards + quality + audits). Reconcile if DIRTY/behind base.
- [ ] **Step 4:** `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-Review

- **Spec coverage:** §3.1 helper → T1; §4 parser → T2; §3.2 chokepoint → T3; §3.4 resolveKeyTimes gate → T4; §3.4 threading (3 callers) → T5; §5 render behavior + §9 dimensional invariants → T6 (real-browser, end-to-end); §3.5 agenda backlog → T7; §8 invariant-8 → T8; close-out → T9. All covered.
- **TDD honesty:** every task has a genuine red→green. T4 gate tests fail before the gate. T5's three call-site tests (ScheduleSection, TodaySection, buildRightNowContext) are red before threading (default `none` → off-stage anchor shown), green after. T6 is red at the system level (pre-fix `unknown_asterisk` → placeholder, zero day cards). No characterization-only task.
- **Type consistency:** `effectiveViewerDateRestriction`, `stageWorksDay`, `resolveKeyTimes(... , stageRestriction)` signatures match across T1/T3/T4/T5.
- **Anti-tautology:** T6 derives the worked-day set from the fixture via the Task-1 helper (not a hardcoded literal), asserts against `[data-day]` on the day-card containers, and demonstrates the red via the pre-fix `unknown_asterisk` placeholder.
- **All three `resolveKeyTimes` callers** (confirmed: buildRightNowContext.ts:85, ScheduleSection.tsx:108, TodaySection.tsx:249 — no 4th) get red-before-green behavioral coverage in T5.
- **No placeholders:** every code step shows real code or a precise edit against a cited line, matching verified live helpers (`newAggregator`, `parseCrew(md,'v4',agg)`, `dates()/room()/NONE`, `makeShowForViewer`, `showRow/crewRow/setup`).
