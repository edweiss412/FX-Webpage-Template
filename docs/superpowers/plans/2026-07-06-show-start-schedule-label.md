# "Show Start" Schedule Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a bare-`showStart` schedule day's time as a `{start, title:"Show Start"}` run-of-show grid entry (aligned "8:00 AM  Show Start") instead of a label-less meta line, on both the crew page and the admin wizard.

**Architecture:** One shared, renderer-only helper `showStartDisplayEntry` in `lib/crew/agendaDisplay.ts` synthesizes the display entry from a `ScheduleDay` (gated on RAW `entries.length===0`, `window==null`, non-sentinel `showStart`). The parser is NOT touched — `ScheduleDay.showStart` stays intact so `resolveKeyTimes` (KeyTimesStrip anchor) and all persistence/report consumers are unchanged. Both surfaces call the same helper.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest + @testing-library/react (jsdom), Tailwind v4.

## Global Constraints

- **TDD per task:** failing test → minimal impl → green → commit. One task per commit, conventional-commits (`feat(crew-page):` / `feat(admin):` / `test(...)`).
- **Renderer-only:** never mutate parser output or `lib/parser/**`. The helper lives in `lib/crew/agendaDisplay.ts` and is invoked from components only.
- **Raw-entries gate (Codex R1):** synthesis gates on raw `ScheduleDay.entries.length===0`, NOT the per-viewer `dayEntries` count. The existing `tests/components/crew/sections/ScheduleSection.loadoutMeta.test.tsx:45-66` (#169) MUST stay green unchanged.
- **Label text:** exactly `"Show Start"`, defined once in the helper.
- **Sentinel guard:** route `showStart` through `resolveOptionalField` (`agendaDisplay.ts:26-31`) — hides `''`/`TBD`/`N/A`/`TBA`, strips URLs.
- **No new §12.4 codes, no DB, no advisory lock, no Supabase boundary** touched → those meta-tests are N/A.
- **UI quality gate (invariant 8):** `/impeccable critique` + `/impeccable audit` on the diff at close-out, before adversarial review.
- **Before push:** `pnpm test` (full), `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all green.

---

### Task 1: `showStartDisplayEntry` helper

**Files:**
- Modify: `lib/crew/agendaDisplay.ts` (add export after `displayableEntries`, ~line 50)
- Test: `tests/crew/agendaDisplay.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: `resolveOptionalField` (already in this file, `:26`), types `AgendaEntry` / `ScheduleDay` (`@/lib/parser/types`, already imported `:11`).
- Produces: `export function showStartDisplayEntry(day: Pick<ScheduleDay, "showStart" | "window" | "entries">): AgendaEntry | null` — consumed by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test** — append to `tests/crew/agendaDisplay.test.ts`:

```ts
import { showStartDisplayEntry } from "@/lib/crew/agendaDisplay";

describe("showStartDisplayEntry (bare-showStart → 'Show Start' grid entry)", () => {
  test("bare showStart, no entries, no window → Show Start entry", () => {
    expect(showStartDisplayEntry({ showStart: "8:00 AM", window: null, entries: [] })).toEqual({
      start: "8:00 AM",
      title: "Show Start",
    });
  });

  test("window day → null (meta path owns it)", () => {
    expect(
      showStartDisplayEntry({ showStart: null, window: { start: "9:00 AM", end: "5:00 PM" }, entries: [] }),
    ).toBeNull();
  });

  test("sentinel showStart 'TBD' → null (guarded)", () => {
    expect(showStartDisplayEntry({ showStart: "TBD", window: null, entries: [] })).toBeNull();
  });

  test("null showStart → null", () => {
    expect(showStartDisplayEntry({ showStart: null, window: null, entries: [] })).toBeNull();
  });

  test("raw entry present (viewer-hidden load-out) → null (#169 raw-entries gate)", () => {
    expect(
      showStartDisplayEntry({
        showStart: "8:00 AM",
        window: null,
        entries: [{ start: "6:00 PM", title: "Load Out", kind: "loadout" }],
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/fxav-worktrees/show-start-label && pnpm vitest run tests/crew/agendaDisplay.test.ts -t "showStartDisplayEntry"`
Expected: FAIL — `showStartDisplayEntry is not a function` / import error.

- [ ] **Step 3: Write minimal implementation** — add to `lib/crew/agendaDisplay.ts` right after `displayableEntries` (after `:50`):

```ts
/**
 * Renderer-only synthesis of the display "Show Start" run-of-show entry for a
 * bare-showStart day: zero RAW parsed entries, no window, a real (non-sentinel)
 * showStart. The parser's ScheduleDay.showStart is NEVER mutated (resolveKeyTimes
 * anchor depends on it). Returns null for every other day shape — any raw entry
 * (incl. a viewer-hidden load-out, preserving the #169 contract), a window day,
 * an end-only day, or a sentinel/URL showStart.
 */
export function showStartDisplayEntry(
  day: Pick<ScheduleDay, "showStart" | "window" | "entries">,
): AgendaEntry | null {
  if (day.entries.length > 0) return null; // any RAW entry → not a bare day
  if (day.window != null) return null; // window day → meta path
  const start = resolveOptionalField(day.showStart ?? undefined); // sentinel/URL guard
  return start == null ? null : { start, title: "Show Start" };
}
```

Add `ScheduleDay` to the existing `@/lib/parser/types` import on line 11 if not already present (it imports `AgendaEntry`; add `ScheduleDay`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/crew/agendaDisplay.test.ts -t "showStartDisplayEntry"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crew/agendaDisplay.ts tests/crew/agendaDisplay.test.ts
git commit --no-verify -m "feat(crew-page): showStartDisplayEntry helper for bare-showStart days"
```

---

### Task 2: Crew `ScheduleSection` integration

**Files:**
- Modify: `components/crew/sections/ScheduleSection.tsx` (meta if-chain `:282-309`, RunOfShowList render `:338-339`)
- Test (new): `tests/components/crew/sections/ScheduleSection.showStart.test.tsx`
- Test (update): `tests/components/crew/sections/ScheduleSection.test.tsx:280-292`
- Test (must stay green, DO NOT edit): `tests/components/crew/sections/ScheduleSection.loadoutMeta.test.tsx`

**Interfaces:**
- Consumes: `showStartDisplayEntry` (Task 1), `RunOfShowList` (already imported `:51`).
- Produces: for a bare-showStart crew day, a `run-of-show-<iso>` container with one `agenda-entry` (`8:00 AM` + `Show Start`), no `day-card-meta`.

- [ ] **Step 1: Write the failing test** — create `tests/components/crew/sections/ScheduleSection.showStart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ScheduleDay } from "@/lib/parser/types";

afterEach(cleanup);

const TODAY = new Date("2026-06-01T15:00:00Z");
const D = "2025-05-13";
const DATES = { travelIn: null, set: null, showDays: [D], travelOut: null };

function renderWith(day: ScheduleDay) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow: { [D]: day }, transportation: null })}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId="show-showstart"
    />,
  ).container;
}

describe("ScheduleSection — bare showStart renders a 'Show Start' run-of-show entry", () => {
  test("bare showStart → grid entry with time + 'Show Start', no bare meta", () => {
    const c = renderWith({ entries: [], showStart: "8:00 AM", showEnd: null, window: null });
    const wrapper = c.querySelector(`[data-day="${D}"]`)!;
    // No label-less meta line.
    expect(wrapper.querySelector('[data-slot="day-card-meta"]')).toBeNull();
    // A run-of-show entry carrying BOTH the time and the label.
    const container = c.querySelector(`[data-testid="run-of-show-${D}"]`);
    expect(container).not.toBeNull();
    const entry = container!.querySelector('[data-testid="agenda-entry"]')!;
    expect(entry.textContent).toContain("8:00 AM");
    expect(entry.textContent).toContain("Show Start");
  });

  test("sentinel showStart 'TBD' → no entry, no meta (guarded)", () => {
    const c = renderWith({ entries: [], showStart: "TBD", showEnd: null, window: null });
    const wrapper = c.querySelector(`[data-day="${D}"]`)!;
    expect(wrapper.querySelector('[data-slot="day-card-meta"]')).toBeNull();
    expect(c.querySelector(`[data-testid="run-of-show-${D}"]`)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/crew/sections/ScheduleSection.showStart.test.tsx`
Expected: FAIL — first test finds `day-card-meta` "8:00 AM" and no `run-of-show-2025-05-13`.

- [ ] **Step 3: Write minimal implementation** in `components/crew/sections/ScheduleSection.tsx`.

(a) After `const dayEntries = scheduleEntriesForViewer(...)` (ends `:281`), add:

```tsx
                      // Bare-showStart day (raw entries.length===0, no window, real
                      // showStart) → render the call time as a "Show Start" run-of-show
                      // entry instead of a label-less meta line. Renderer-only; gates on
                      // RAW sd.entries (NOT dayEntries) so a viewer-hidden load-out day
                      // keeps its #169 call-time meta. See showStartDisplayEntry.
                      const showStartRow = sd != null ? showStartDisplayEntry(sd) : null;
```

(b) Change the existing bare-showStart meta branch (`:294`) to also require `showStartRow == null`, so a truly-bare day does NOT double-render meta + grid:

```tsx
                      } else if (
                        sd != null &&
                        sd.showStart != null &&
                        dayEntries.length === 0 &&
                        showStartRow == null
                      ) {
```

(c) Change the RunOfShowList render (`:338-339`) to also render the synthesized row:

```tsx
                          {dayEntries.length > 0 ? (
                            <RunOfShowList entries={dayEntries} isoDate={day.date} />
                          ) : showStartRow != null ? (
                            <RunOfShowList entries={[showStartRow]} isoDate={day.date} />
                          ) : null}
```

(d) Add `showStartDisplayEntry` to the existing `@/lib/crew/agendaDisplay` import (`:57`).

- [ ] **Step 4: Update the pre-existing behavior test** in `tests/components/crew/sections/ScheduleSection.test.tsx:280-292`. The "real clock → meta renders" half asserted the OLD bare-meta behavior. Replace the second render block (lines ~280-292) so bare `showStart:"8:00am"` now asserts the grid entry, not meta:

```tsx
  // Real clock → renders as a "Show Start" run-of-show entry (not a bare meta line).
  const data2 = makeShowForViewer({
    show: { dates: { showDays: ["2026-10-08"], set: null, travelIn: null, travelOut: null } },
    runOfShow: { "2026-10-08": { entries: [], showStart: "8:00am", showEnd: null, window: null } },
  });
  const r2 = render(
    <ScheduleSection data={data2} viewer={adminViewer} today={at("2026-10-08")} showId="s1" />,
  );
  const today2 = r2.container.querySelector('[data-testid="schedule-day-today"]')!;
  expect(today2.querySelector('[data-slot="day-card-meta"]')).toBeNull();
  const entry2 = today2
    .closest('[data-day="2026-10-08"]')
    ?.querySelector('[data-testid="agenda-entry"]') ??
    r2.container.querySelector('[data-testid="agenda-entry"]');
  expect(entry2!.textContent).toContain("8:00am");
  expect(entry2!.textContent).toContain("Show Start");
  cleanup();
```

(The `data-testid="schedule-day-today"` wrapper carries `data-day` too, per `ScheduleSection.tsx:322-324`; the RunOfShowList renders as a sibling under the same day `<div>`, so scope the entry lookup to that day wrapper.)

- [ ] **Step 5: Run tests to verify they pass (incl. #169 stays green)**

Run:
```bash
pnpm vitest run \
  tests/components/crew/sections/ScheduleSection.showStart.test.tsx \
  tests/components/crew/sections/ScheduleSection.test.tsx \
  tests/components/crew/sections/ScheduleSection.loadoutMeta.test.tsx
```
Expected: PASS (all three files). `loadoutMeta` (#169) green **unchanged** — this proves the raw-entries gate.

- [ ] **Step 6: Commit**

```bash
git add components/crew/sections/ScheduleSection.tsx tests/components/crew/sections/ScheduleSection.showStart.test.tsx tests/components/crew/sections/ScheduleSection.test.tsx
git commit --no-verify -m "feat(crew-page): render bare showStart as 'Show Start' run-of-show entry"
```

---

### Task 3: Admin wizard `ScheduleDayRow` integration

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`ScheduleDayRow`, `:910-932`)
- Test (update): `tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx:21-25`

**Interfaces:**
- Consumes: `showStartDisplayEntry` (Task 1), the existing 2-track grid render (`:965-992`).
- Produces: for a bare-showStart wizard day, a `sched-time`="8:00 AM" + `sched-title`="Show Start" grid row and no `sched-meta` node.

- [ ] **Step 1: Write the failing test** — replace the `showStart-only day → start meta` test in `tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx` (`:21-25`):

```tsx
  test("showStart-only day → 'Show Start' grid entry, no meta", () => {
    const { container } = render(
      <ScheduleBreakdown dfid="d" ros={{ "2025-05-13": day({ showStart: "8:00 AM" }) }} />,
    );
    expect(metaText(container)).toBeNull();
    const times = [...container.querySelectorAll('[data-testid="wizard-step3-card-d-sched-time"]')];
    const titles = [...container.querySelectorAll('[data-testid="wizard-step3-card-d-sched-title"]')];
    expect(times.map((n) => n.textContent)).toContain("8:00 AM");
    expect(titles.map((n) => n.textContent)).toContain("Show Start");
  });
```

(`metaText` at `:18` returns `?? null`; `day(...)` at `:11` seeds `showStart:null`. The `ScheduleBreakdown` wrapper feeds days into `ScheduleDayRow` — confirm the fixture provides `dates`/`showDays` so `2025-05-13` renders; if `ScheduleBreakdown` needs `dates`, pass `dates={{ travelIn:null, set:null, showDays:["2025-05-13"], travelOut:null }}` as it does for other tests in this file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx -t "showStart-only"`
Expected: FAIL — a `sched-meta` "8:00 AM" node still exists, no `sched-title` "Show Start".

- [ ] **Step 3: Write minimal implementation** in `components/admin/wizard/step3ReviewSections.tsx` `ScheduleDayRow`.

(a) Add the import: append `showStartDisplayEntry` to the `@/lib/crew/agendaDisplay` import (grep for the existing `aggregateDays` import in this file; add there).

(b) After the `rows` computation (`:921`), replace it and the `timeMeta` block (`:921-932`) with:

```tsx
  const showStartRow = showStartDisplayEntry({ showStart, window: dayWindow, entries });
  // Synthetic strike/loadout always follow the (capped) agenda rows in the SAME grid.
  const rows = showStartRow != null ? [showStartRow] : [...visibleAgenda, ...synthetic];

  // Fragment-day meta (#307): a day with no titled entries AND no synthesized
  // Show-Start row surfaces its window / end-only anchor. A bare real showStart is
  // now the showStartRow above, so it is intentionally dropped from timeMeta.
  let timeMeta: string | null = null;
  if (entries.length === 0 && showStartRow == null) {
    const win = dayWindow != null ? formatScheduleWindow(dayWindow) : null;
    const end = resolveOptionalField(showEnd ?? undefined) ?? null;
    timeMeta = win ?? (end != null ? `Ends ${end}` : null);
  }
```

(Leave `agenda`/`synthetic`/`visibleAgenda`/`hidden` above unchanged; when `showStartRow!=null`, `entries` is `[]` so `agenda`=`[]` and the "Show all" button never appears.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx`
Expected: PASS (whole file — the window/end-only/titled cases in this file must remain green, proving only the bare-showStart case changed).

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx
git commit --no-verify -m "feat(admin): render bare showStart as 'Show Start' entry in wizard schedule"
```

---

### Task 4: resolveKeyTimes non-regression pin

**Files:**
- Test (add): `tests/crew/resolveKeyTimes.test.ts` (append one case)

**Interfaces:**
- Consumes: `resolveKeyTimes` (already tested in this file).
- Produces: a pinned assertion that a bare-showStart day still yields the `shows` anchor from `showStart` — proving the renderer-only synthesis never reached the parser/anchor.

- [ ] **Step 1: Write the test** — append to `tests/crew/resolveKeyTimes.test.ts` a case asserting a `ScheduleDay` `{ entries: [], showStart: "8:00 AM", showEnd: null, window: null }` on a show day yields `anchors.shows` containing `8:00 AM` (mirror the existing showStart-anchor test in this file for exact call shape — `resolveKeyTimes(show, rooms, runOfShow, dateRestriction)`).

- [ ] **Step 2: Run to verify it passes immediately** (no production change — this is a characterization pin):

Run: `pnpm vitest run tests/crew/resolveKeyTimes.test.ts`
Expected: PASS. If the exact anchor shape differs, adjust the assertion to the file's existing convention (do not change production code).

- [ ] **Step 3: Commit**

```bash
git add tests/crew/resolveKeyTimes.test.ts
git commit --no-verify -m "test(crew-page): pin showStart key-time anchor unaffected by Show Start render"
```

---

### Task 5: Layout / render verification (real browser)

The synthesized entry flows through the EXISTING run-of-show grids (crew `RunOfShowList`, wizard `grid-cols-[auto_1fr]`), both already covered by real-browser layout e2e (`tests/e2e/step3-review-*.layout.spec.ts`). No new fixed-dimension parent is introduced, so no new Playwright layout gate is required. This task VERIFIES the entry actually renders in a real browser (the jsdom tests above assert DOM structure, not computed layout).

**Files:**
- Verify only (no new test file unless the existing e2e fixtures don't exercise a bare-showStart day).

- [ ] **Step 1:** Grep the existing step3 e2e fixtures for a bare-showStart day. If one exists, confirm it now shows "Show Start". If none exists, this is acceptable — the jsdom render tests (Tasks 2, 3) + the existing layout e2e on the grid structure cover it; note "no bare-showStart day in e2e fixtures; covered by jsdom render tests" in the close-out handoff.

- [ ] **Step 2:** Manual real-browser confirm via the validation deploy or `pnpm dev` — load the RFI & PC Chicago wizard step-3 card (the fixture `2025-05-redefining-fixed-income-private-credit.md`, May 13) and confirm it reads "8:00 AM  Show Start". Capture the outcome in the handoff. (No commit — verification step.)

---

### Task 6: Close-out — quality gates, impeccable dual-gate, adversarial review, PR

- [ ] **Step 1: Full local gates**

```bash
pnpm test 2>&1 | tail -20
pnpm typecheck
pnpm lint
pnpm format:check
```
Expected: all green. Fix any failure before proceeding. (Full `pnpm test`, not scoped — a shared chokepoint change can break distant tests.)

- [ ] **Step 2: Invariant-8 impeccable dual-gate** (UI diff: `components/crew/sections/ScheduleSection.tsx`, `components/admin/wizard/step3ReviewSections.tsx`).

Run `/impeccable critique` AND `/impeccable audit` on the diff. Any HIGH/CRITICAL finding: fix, or defer via a `DEFERRED.md` entry with rationale. Record findings + dispositions for the handoff.

- [ ] **Step 3: Cross-model adversarial review (Codex), whole diff, fresh-eyes, REVIEWER ONLY.** Iterate to APPROVE (no round budget). Triage findings via deferral discipline (land-now / `DEFERRED.md` / `BACKLOG.md`).

- [ ] **Step 4: Push + PR + real CI green.**

```bash
git push -u origin feat/show-start-schedule-label
gh pr create --title "feat: 'Show Start' label for bare-showStart schedule days" --body "<summary + test evidence>"
gh pr checks <PR#> --watch
```
Confirm `mergeStateStatus == CLEAN` and every required check green on the real Actions run (local-green is necessary, not sufficient).

- [ ] **Step 5: Merge + sync local main.**

```bash
gh pr merge <PR#> --merge
git -C /Users/ericweiss/FX-Webpage-Template fetch origin && git -C /Users/ericweiss/FX-Webpage-Template checkout main && git -C /Users/ericweiss/FX-Webpage-Template merge --ff-only origin/main
git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main   # expect: 0  0
```

- [ ] **Step 6:** Remove the worktree (`git worktree remove /Users/ericweiss/fxav-worktrees/show-start-label`) after merge.

---

## Self-Review

**Spec coverage:**
- §4.2 helper → Task 1. §4.3 crew → Task 2. §4.4 wizard → Task 3. §4.1 parser-untouched / resolveKeyTimes → Task 4 pin. §3 #169 raw-entries gate → Task 2 Step 5 (loadoutMeta stays green) + Task 1 raw-entry test. §7 dimensional (reuse existing grid) → Task 5. §8 transitions (none) → no task needed (static render). §9 meta-test inventory (none created) → consistent, no meta-test task. §10 test plan items 1-6 → Tasks 1-4 + loadoutMeta. §11 numeric sweep / §12 out-of-scope → no code. Invariant 8 → Task 6 Step 2.
- No spec requirement left without a task.

**Placeholder scan:** No TBD/TODO/"handle edge cases". Task 4 Step 1 and Task 3 Step 1 note "mirror the file's existing convention" for exact call/fixture shape — these are real files whose shape the implementer reads; the assertion content is fully specified.

**Type consistency:** `showStartDisplayEntry(day: Pick<ScheduleDay,"showStart"|"window"|"entries">): AgendaEntry | null` used identically in Tasks 1, 2 (passes full `sd`, structurally compatible), 3 (`{showStart, window: dayWindow, entries}`). Label literal `"Show Start"` consistent. `RunOfShowList` prop `entries: AgendaEntry[]` matches `[showStartRow]`.

**Anti-tautology:** Task 2 asserts the entry inside the `run-of-show-<iso>` container (the thing under test), and separately asserts NO `day-card-meta` — a broken impl that kept the meta line fails. Task 1 raw-entries test derives `null` from a load-out fixture, not a hardcoded pass. Expected values (`8:00 AM`) come from the input `showStart`, not unrelated literals.
