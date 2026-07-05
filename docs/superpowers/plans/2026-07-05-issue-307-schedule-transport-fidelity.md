# Bug #307 Schedule & Transport Parse-Fidelity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix GitHub #307 — surface `showStart`/`window`/`showEnd` in the admin wizard schedule breakdown, stop the transport parser harvesting scratch-column names as passengers, and capture end-only show-day times (`GS: ... - 6:00 PM`) as a new `showEnd` field.

**Architecture:** Add `showEnd: string | null` to `ScheduleDay`; a new parser branch detects the placeholder-start-with-end pattern; every has-content predicate across parser/storage/decode/resync-gate learns the fourth field; crew + wizard render it as `Ends {time}`; `resolveKeyTimes` deliberately ignores it. Transport `extractAssignedNames` drops its no-header scan.

**Tech Stack:** TypeScript, Next.js 16, Vitest, React Testing Library, Supabase (JSONB `run_of_show`, no DDL).

**Spec:** `docs/superpowers/specs/2026-07-05-issue-307-schedule-transport-fidelity.md` (Codex-APPROVED, 7 rounds).

## Global Constraints

- TDD per task: failing test → minimal impl → green → commit. `--no-verify` on commits (worktree; shared hooks belong to the main checkout).
- Conventional commits: `<type>(<scope>): <summary>`. One task per commit.
- `showEnd` is a **required** `string | null` field (mirrors `showStart`) — every `ScheduleDay` constructor sets it.
- `resolveKeyTimes` MUST stay unchanged (end times never become start anchors — R2).
- Do NOT run prettier on the master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (R9).
- UI files (`components/crew/sections/ScheduleSection.tsx`, `components/admin/wizard/step3ReviewSections.tsx`) → invariant-8 impeccable dual-gate at close-out (Task 9).
- Run the FULL suite (`pnpm test`) before push, plus `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check` (Task 9).

---

### Task 1: Parser — `showEnd` field + end-only detection

**Files:**
- Modify: `lib/parser/types.ts:361-365` (add `showEnd`)
- Modify: `lib/parser/blocks/scheduleTimes.ts:164-215` (detection + literals + warn guard)
- Modify: `lib/parser/index.ts:635-639,643` (constructor `showEnd: null`)
- Modify: `lib/parser/blocks/scheduleBookends.ts:48` (constructor `showEnd: null`)
- Modify: `lib/parser/blocks/agendaWarnings.ts:45-51` (doc comment, R9)
- Test: `tests/parser/blocks/scheduleTimes.test.ts`

**Interfaces:**
- Produces: `ScheduleDay = { entries: AgendaEntry[]; showStart: string | null; showEnd: string | null; window: { start: string; end: string } | null }`.

- [ ] **Step 1: Reconcile the existing old-contract test + add cases** — `tests/parser/blocks/scheduleTimes.test.ts`. The file already has (`:50-57`) an old-contract case using the file's `run()` helper (`run(rows: Array<[label, day, date, time]>) → { dates, scheduleDays, warnings }`, `:10`):

```ts
  it("end-only fragment 'GS: ... - 6:00 PM' → NO ScheduleDay + SCHEDULE_TIME_UNPARSED", () => { ... });
```

**Replace that `it(...)` block** with the new-contract test + additive cases (do NOT add a duplicate `describe` — reconcile in place so Step 7's whole-file run is green):

```ts
  it("end-only 'GS: ... - 6:00 PM' → showEnd captured, NO warning (#307)", () => {
    const { dates, scheduleDays, warnings } = run([["SHOW DAY 1", "Wed", "5/14/25", "GS: ... - 6:00 PM"]]);
    const iso = dates.showDays[0]!;
    expect(scheduleDays[iso]).toEqual({ entries: [], showStart: null, showEnd: "6:00 PM", window: null });
    expect(warnings.map((w) => w.code)).not.toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("end-only 'TBD - 5:00 PM' → showEnd captured (#307)", () => {
    const { dates, scheduleDays } = run([["SHOW DAY 1", "Wed", "5/14/25", "TBD - 5:00 PM"]]);
    expect(scheduleDays[dates.showDays[0]!]?.showEnd).toBe("5:00 PM");
  });

  it("leading-start 'GS: 8:00 AM -' stays showStart, showEnd null (#307 regression guard)", () => {
    const { dates, scheduleDays } = run([["SHOW DAY 1", "Wed", "5/14/25", "GS: 8:00 AM -"]]);
    expect(scheduleDays[dates.showDays[0]!]).toEqual({ entries: [], showStart: "8:00 AM", showEnd: null, window: null });
  });

  it("clock-less contentful cell still warns (not swallowed by end-only branch) (#307)", () => {
    const { dates, scheduleDays, warnings } = run([["SHOW DAY 1", "Wed", "5/14/25", "General Session soon"]]);
    expect(scheduleDays[dates.showDays[0]!]).toBeUndefined();
    expect(warnings.map((w) => w.code)).toContain("SCHEDULE_TIME_UNPARSED");
  });
```

(The Step-5b fixture sweep also adds `showEnd: null` to any other `toEqual`-on-ScheduleDay assertion in this file.)

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/ericweiss/fxav-worktrees/issue-307 && npx vitest run tests/parser/blocks/scheduleTimes.test.ts -t "#307"`
Expected: FAIL — `showEnd` missing from type / not captured.

- [ ] **Step 3: Add the field** — `lib/parser/types.ts`, in `ScheduleDay` (after `showStart`):

```ts
  showStart: string | null; // per-day first-call anchor
  showEnd: string | null; // per-day end-only anchor ("GS: ... - 6:00 PM" → "6:00 PM"); NOT a start anchor
  window: { start: string; end: string } | null; // bare-window days only
```

- [ ] **Step 4: Implement detection** — `lib/parser/blocks/scheduleTimes.ts`. Add the regex near `PLACEHOLDER_RE` (top of file):

```ts
// End-only lead: an unknown-start placeholder immediately followed by a range dash
// (e.g. "GS: ... - 6:00 PM"). The single trailing clock is the day's END, not start.
const END_ONLY_LEAD_RE = /(?:\.\.\.|\bTBD\b|\bTBA\b|\bN\/A\b)\s*[-–]\s*$/i;
```

Replace the bare-window literal (currently `scheduleDays[iso] = { entries: [], showStart: null, window: {...} }`) to include `showEnd: null`:

```ts
        scheduleDays[iso] = {
          entries: [],
          showStart: null,
          showEnd: null,
          window: {
            start: cell.slice(toks[0]!.start, toks[0]!.end).trim(),
            end: cell.slice(toks[1]!.start, toks[1]!.end).trim(),
          },
        };
```

Then replace the main day construction + warn guard (currently at `const day: ScheduleDay = { entries, showStart, window: null };` through the warn block):

```ts
    // End-only day: placeholder start + a single trailing clock (e.g. "GS: ... - 6:00 PM").
    // The start is unknown; capture the END as showEnd — NEVER showStart (resolveKeyTimes
    // must not read it as a call-time anchor, R2).
    let showEnd: string | null = null;
    if (
      entries.length === 0 &&
      showStart === null &&
      toks.length === 1 &&
      END_ONLY_LEAD_RE.test(cell.slice(0, first.start))
    ) {
      showEnd = first.norm;
    }

    const day: ScheduleDay = { entries, showStart, showEnd, window: null };

    // Warn + drop ONLY when nothing usable was extracted (no entries, no showStart,
    // no showEnd, no window).
    if (
      day.entries.length === 0 &&
      day.showStart === null &&
      day.showEnd === null &&
      day.window === null
    ) {
      warnings.push(scheduleTimeUnparsed(index, iso));
      return;
    }

    scheduleDays[iso] = day;
```

- [ ] **Step 5: Fix remaining constructors so it compiles** — `lib/parser/index.ts`:

```ts
        merged[iso] = {
          entries: gridEntries,
          showStart: gridEntries[0]!.start,
          showEnd: null,
          window: null,
        };
```
and the fallback a few lines below:
```ts
        merged[iso] = { entries: [], showStart: null, showEnd: null, window: null };
```
`lib/parser/blocks/scheduleBookends.ts:48`:
```ts
  const day = ros[iso] ?? { entries: [], showStart: null, showEnd: null, window: null };
```

`lib/data/decodeRunOfShow.ts:181` — a **shorthand** production constructor the `showStart:` grep misses
(Codex plan-review R2). Minimal placeholder now (Task 2 wires the real sentinel-guarded read):
```ts
      result[key] = { entries, showStart, showEnd: null, window };
```
(Leave `:180`'s omit-empty predicate unchanged in Task 1 — `showEnd` is always null here until Task 2.)

- [ ] **Step 5b: Mechanical `ScheduleDay` fixture sweep (Codex plan-review R1) — REQUIRED before commit**

Because `showEnd` is a **required** field, every existing `ScheduleDay` literal AND every exact
`toEqual`/`toMatchObject` expected `ScheduleDay` object must gain `showEnd: null` (or a real value), or
the suite fails to typecheck / fails equality. Do NOT weaken `showEnd` to optional to get green. Find
every site:

Run: `rg -n "showStart:" tests components lib app scripts`

Add `showEnd: null` to each `ScheduleDay` literal/expected across the **26** test files that carry them,
namely: `tests/crew/resolveKeyTimes.test.ts`, `tests/parser/blocks/scheduleBookends.test.ts`,
`tests/components/buildRightNowContext.test.ts`, `tests/components/step3SheetCard.test.tsx`,
`tests/components/step3SheetCard.bookends.test.tsx`, `tests/components/admin/wizard/_step3ReviewFixture.ts`,
`tests/components/crew/sourceLinkCoverage.test.tsx`,
`tests/components/crew/sections/ScheduleSection.{agenda,caps,bookends,loadoutMeta,anchorFloor}.test.tsx`,
`tests/components/crew/sections/TodaySection.{bookends,modeA,}.test.tsx`,
`tests/components/crew/sections/ScheduleSection.test.tsx`,
`tests/components/tiles/CardinalityCapBoundary.test.tsx`,
`tests/sync/{enrichWithDrivePins.runOfShow,applyParseResultScheduleDay,runOfShowConfirmedReplace}.test.ts`,
`tests/e2e/{right-now-transitions,crew-layout-dimensions}.spec.ts`,
`tests/data/{decodeRunOfShow,downgradeRunOfShow,getShowForViewerRunOfShow,verifyResyncExpectedMap}.test.ts`.
(Tasks 2/3/4/7 further edit their own fixtures with real `showEnd` values; this sweep just keeps every
intermediate commit type-clean.)

Then run: `pnpm typecheck`
Expected: clean (no `Property 'showEnd' is missing` errors). This step gates the Task 1 commit.

- [ ] **Step 6: Update the warning doc comment (R9)** — `lib/parser/blocks/agendaWarnings.ts:45-51`, remove the end-only example:

```ts
 * Emitted by §04 parseScheduleTimes when a SHOW DAY TIME cell is non-empty AND
 * non-sentinel yet yields zero usable fields (no showStart, no showEnd, no window,
 * no entries) — the no-clock-contentful case ("General Session TBD"). An end-only
 * cell ("GS: ... - 6:00 PM") is now captured as showEnd and does NOT warn. Defined
 * here so its code: literal lives in lib/parser for the internal-code-enums extractor.
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npx vitest run tests/parser/blocks/scheduleTimes.test.ts`
Expected: PASS (incl. the `#307` block).

- [ ] **Step 8: Commit**

```bash
# includes the Step-5b fixture sweep across all 26 ScheduleDay-literal test files
git add -A
git commit --no-verify -m "feat(parser): capture end-only show-day times as showEnd + ScheduleDay.showEnd field (#307)"
```

---

### Task 2: `decodeRunOfShow` / `downgradeRunOfShow` — `showEnd` round-trip

**Files:**
- Modify: `lib/data/decodeRunOfShow.ts:80-95,123-181` (decode + omit-empty + doc)
- Modify: `lib/data/downgradeRunOfShow.ts:11-15` (doc comment)
- Test: `tests/data/decodeRunOfShow.test.ts`

**Interfaces:**
- Consumes: `ScheduleDay.showEnd` (Task 1).

- [ ] **Step 1: Write the failing tests** — append to `tests/data/decodeRunOfShow.test.ts`:

```ts
describe("#307 showEnd decode", () => {
  it("round-trips a showEnd-only day", () => {
    const { value, corrupt } = decodeRunOfShow({
      "2025-05-14": { entries: [], showStart: null, showEnd: "6:00 PM", window: null },
    });
    expect(corrupt).toBe(false);
    expect(value?.["2025-05-14"]).toEqual({
      entries: [], showStart: null, showEnd: "6:00 PM", window: null,
    });
  });
  it("sentinel showEnd 'TBD' → null, not corrupt", () => {
    const { value, corrupt } = decodeRunOfShow({
      "2025-05-14": { entries: [], showStart: null, showEnd: "TBD", window: null },
    });
    expect(corrupt).toBe(false);
    expect(value).toBeNull(); // fully-empty after showEnd nulled → day omitted
  });
  it("non-string showEnd → corrupt", () => {
    const { corrupt } = decodeRunOfShow({
      "2025-05-14": { entries: [], showStart: null, showEnd: 5, window: null },
    });
    expect(corrupt).toBe(true);
  });
  it("legacy array day decodes with showEnd null", () => {
    const { value } = decodeRunOfShow({ "2025-05-14": [{ start: "8am", title: "Reg" }] });
    expect(value?.["2025-05-14"]?.showEnd).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/data/decodeRunOfShow.test.ts -t "#307"`
Expected: FAIL.

- [ ] **Step 3: Implement** — `lib/data/decodeRunOfShow.ts`. Add local declaration beside `let showStart` (~:123):

```ts
    let showStart: string | null = null;
    let showEnd: string | null = null;
```

In the object-day branch, after the `showStart` block (~:149), add the mirror:

```ts
      // showEnd: string | null, sentinel-guarded (mirrors showStart).
      const se = day["showEnd"];
      if (se === null || se === undefined) {
        showEnd = null;
      } else if (typeof se === "string") {
        showEnd = shouldHideGenericOptional(se) ? null : se;
      } else {
        corruptRef[0] = true;
        continue;
      }
```

Update omit-empty (~:180) and the result literal (~:181):

```ts
    if (entries.length > 0 || showStart !== null || showEnd !== null || window !== null) {
      result[key] = { entries, showStart, showEnd, window };
    }
```

Update the contract doc block (~:80-95) to name `showEnd` alongside `showStart` (legacy-array wrap → `showEnd: null`; object day → validated; fully-empty now includes `showEnd:null`).

- [ ] **Step 4: Update `downgradeRunOfShow` doc** — `lib/data/downgradeRunOfShow.ts:11-15`, add `showEnd` to the "LOSSY by design: `showStart` and `window` … are dropped" line → "`showStart`, `showEnd`, and `window` … are dropped" (no code change — it already maps `entries` only).

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/data/decodeRunOfShow.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/data/decodeRunOfShow.ts lib/data/downgradeRunOfShow.ts tests/data/decodeRunOfShow.test.ts
git commit --no-verify -m "feat(data): decode/round-trip ScheduleDay.showEnd (#307)"
```

---

### Task 3: `applyParseResult` — has-content predicate class (R7)

**Files:**
- Modify: `lib/sync/applyParseResult.ts:156,165-168`
- Test: `tests/sync/applyParseResultScheduleDay.test.ts`

- [ ] **Step 1: Write the failing tests** — in `tests/sync/applyParseResultScheduleDay.test.ts`, using the file's REAL harness (`makeTx()` → `{ tx, captured }`; `baseArgs(runOfShow, prior)`; `await applyParseResult(tx, args)`; `AGENDA_DAY_EMPTIED` is read off `args.parseResult.warnings` after apply — mirror the existing test at `:91-106`). First add `showEnd: null` to the four existing fixtures (`titled` return, `bareWindow`, `showStartOnly`, `fullyEmpty`, `:5-16`), then add:

```ts
const endOnly: ScheduleDay = { entries: [], showStart: null, showEnd: "6:00 PM", window: null };

it("#307 end-only (showEnd) day survives storage (not filtered)", async () => {
  const { tx, captured } = makeTx();
  await applyParseResult(tx, baseArgs({ "2025-05-14": endOnly }, null));
  expect(captured.run_of_show?.["2025-05-14"]?.showEnd).toBe("6:00 PM");
});

it("#307 prior-populated day that becomes end-only does NOT emit AGENDA_DAY_EMPTIED", async () => {
  const { tx } = makeTx();
  const args = baseArgs(
    { "2025-05-14": endOnly },
    { "2025-05-14": titled("8:00 AM") }, // was stored before; now end-only → still has content
  );
  await applyParseResult(tx, args);
  const codes = (
    args as { parseResult: { warnings: { code: string }[] } }
  ).parseResult.warnings.map((w) => w.code);
  expect(codes).not.toContain("AGENDA_DAY_EMPTIED");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/sync/applyParseResultScheduleDay.test.ts`
Expected: FAIL — `endOnly` day filtered out (missing `showEnd` in predicate) / TS error on fixtures missing `showEnd`.

- [ ] **Step 3: Implement** — `lib/sync/applyParseResult.ts`. Confirmed-day filter (`:156`):

```ts
        ([, day]) =>
          day.entries.length > 0 ||
          day.showStart !== null ||
          day.showEnd !== null ||
          day.window !== null,
```

`isFullyEmpty` (`:165-166`):

```ts
    const isFullyEmpty = (d: ScheduleDay | undefined): boolean =>
      d != null &&
      d.entries.length === 0 &&
      d.showStart === null &&
      d.showEnd === null &&
      d.window === null;
```

`priorHadContent` (`:167-168`):

```ts
    const priorHadContent = (d: ScheduleDay | undefined): boolean =>
      d != null &&
      (d.entries.length > 0 || d.showStart !== null || d.showEnd !== null || d.window !== null);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/sync/applyParseResultScheduleDay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/applyParseResult.ts tests/sync/applyParseResultScheduleDay.test.ts
git commit --no-verify -m "fix(sync): keep end-only (showEnd) days through applyParseResult storage (#307)"
```

---

### Task 4: Crew `ScheduleSection` — `Ends {showEnd}` meta + sentinel-hiding meta-test + resolveKeyTimes guard

**Files:**
- Modify: `components/crew/sections/ScheduleSection.tsx:294-303` (new branch)
- Modify: `tests/components/tiles/_metaSentinelHidingContract.test.ts:258-261` (pattern + comment)
- Test: `tests/components/crew/sections/ScheduleSection.*.test.tsx` (new/existing), `tests/crew/resolveKeyTimes.test.ts`

- [ ] **Step 1: Write the failing tests** —

(a) Crew render — concrete executable test, new file
`tests/components/crew/sections/ScheduleSection.showEnd.test.tsx` (mirrors the `loadoutMeta.test.tsx`
harness: renders `ScheduleSection`, scopes to `[data-day="<iso>"]`, asserts `[data-slot="day-card-meta"]`
textContent — so a sibling KeyTimesStrip cannot satisfy it):

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ScheduleDay } from "@/lib/parser/types";

afterEach(cleanup);

const TODAY = new Date("2026-06-01T15:00:00Z");
const D = "2025-05-14";
const DATES = { travelIn: null, set: null, showDays: [D], travelOut: null };

function renderWith(day: ScheduleDay) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow: { [D]: day }, transportation: null })}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId="show-showend"
    />,
  ).container;
}

describe("ScheduleSection — end-only showEnd meta (#307)", () => {
  test("end-only fragment day → DayCard meta 'Ends 6:00 PM'", () => {
    const c = renderWith({ entries: [], showStart: null, showEnd: "6:00 PM", window: null });
    const wrapper = c.querySelector(`[data-day="${D}"]`);
    expect(wrapper!.querySelector('[data-slot="day-card-meta"]')!.textContent).toBe("Ends 6:00 PM");
  });

  test("sentinel showEnd 'TBD' → no meta (hidden, not 'Ends TBD')", () => {
    const c = renderWith({ entries: [], showStart: null, showEnd: "TBD", window: null });
    const wrapper = c.querySelector(`[data-day="${D}"]`);
    expect(wrapper!.querySelector('[data-slot="day-card-meta"]')).toBeNull();
  });
});
```

This behavioral test is the PRIMARY pin (Codex plan-review R2): the structural
`_metaSentinelHidingContract` only checks that the file contains a `resolveOptionalField(` call, which
`ScheduleSection.tsx` already does for other fields — so it cannot distinguish a guarded from an
unguarded `showEnd`. The `'TBD' → no meta` assertion is what actually proves the guard.

(b) resolveKeyTimes guard, append to `tests/crew/resolveKeyTimes.test.ts`:

```ts
it("#307 showEnd-only day produces NO show anchor (end != start)", () => {
  const anchors = resolveKeyTimes(
    { dates: { showDays: ["2025-05-14"] } } as any,
    null, // no rooms
    { "2025-05-14": { entries: [], showStart: null, showEnd: "6:00 PM", window: null } },
    { kind: "none" },
  );
  expect(anchors.shows).toBeUndefined();
});
```

(c) Sentinel-hiding meta-test — extend the ScheduleDay pattern (this makes the CI guard cover `showEnd`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/components/crew/sections/ScheduleSection.showEnd.test.tsx tests/crew/resolveKeyTimes.test.ts`
Expected: (a) FAIL (no branch renders `Ends`); (b) PASS immediately — resolveKeyTimes is intentionally unchanged, this is a **regression guard** proving the end never leaks as an anchor.

- [ ] **Step 3: Implement the crew branch** — `components/crew/sections/ScheduleSection.tsx`, after the `showStart` fragment branch (`:294-303`):

```tsx
                      } else if (sd != null && sd.showEnd != null && dayEntries.length === 0) {
                        // End-only day (§#307): unknown start, known end → "Ends 6:00 PM".
                        // guardMeta hides a TBD/N/A sentinel. Mutually exclusive with the
                        // showStart branch (showEnd is set only when showStart is null).
                        const t = guardMeta(sd.showEnd);
                        meta = t != null ? `Ends ${t}` : undefined;
                      }
```

- [ ] **Step 4: Extend the sentinel-hiding meta-test** — `tests/components/tiles/_metaSentinelHidingContract.test.ts:258-261`:

```ts
  {
    description: "ScheduleDay.window.start / window.end / showStart / showEnd",
    pattern: /\b(window\??\.(start|end)\b|\bshowStart\b|\bshowEnd\b)/,
  },
```
and add `showEnd` (fragment "Ends 6:00 PM" meta) to the block comment at `:244-252`.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/components/crew/sections/ tests/crew/resolveKeyTimes.test.ts tests/components/tiles/_metaSentinelHidingContract.test.ts`
Expected: PASS (the meta-test still passes because `ScheduleSection` reads `sd.showEnd` via `guardMeta` = `resolveOptionalField`).

- [ ] **Step 6: Commit**

```bash
git add components/crew/sections/ScheduleSection.tsx tests/components/crew/sections/ tests/crew/resolveKeyTimes.test.ts tests/components/tiles/_metaSentinelHidingContract.test.ts
git commit --no-verify -m "feat(crew-page): render end-only showEnd as 'Ends {time}' meta + sentinel guard (#307)"
```

---

### Task 5: Wizard `ScheduleDayRow` — fragment-day meta (Fix 1)

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx:831-839,853-857,900-925` (+ imports)
- Test: `tests/components/admin/wizard/Step3Review.*.test.tsx` (new cases)

**Interfaces:**
- Consumes: `ScheduleDay.showStart/window/showEnd` (Tasks 1-2).

- [ ] **Step 1: Write the failing test** — new file `tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ScheduleDay } from "@/lib/parser/types";

afterEach(cleanup);

const day = (extra: Partial<ScheduleDay>): ScheduleDay => ({
  entries: [], showStart: null, showEnd: null, window: null, ...extra,
});
// Query the meta line by its testid + read textContent (repo convention — no jest-dom).
const metaText = (c: HTMLElement): string | null =>
  c.querySelector('[data-testid="wizard-step3-card-d-sched-meta"]')?.textContent ?? null;

describe("wizard ScheduleDayRow fragment-day meta (#307)", () => {
  test("showStart-only day → start meta", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{ "2025-05-13": day({ showStart: "8:00 AM" }) }} />);
    expect(metaText(container)).toBe("8:00 AM");
  });
  test("window day → range meta", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{ "2025-06-25": day({ window: { start: "7:30 AM", end: "5:50 PM" } }) }} />);
    expect(metaText(container)).toBe("7:30 AM–5:50 PM");
  });
  test("end-only day → 'Ends' meta", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{ "2025-05-14": day({ showEnd: "6:00 PM" }) }} />);
    expect(metaText(container)).toBe("Ends 6:00 PM");
  });
  test("titled day → entries, no meta line", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{ "2025-05-14": day({ entries: [{ start: "8am", title: "Reg" }] }) }} />);
    expect(container.textContent).toContain("Reg");
    expect(metaText(container)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx`
Expected: FAIL — no meta line rendered for fragment days.

- [ ] **Step 3: Add imports** — `components/admin/wizard/step3ReviewSections.tsx` (near existing `@/lib/crew` imports, ~:90):

```ts
import { resolveOptionalField, formatScheduleWindow } from "@/lib/crew/agendaDisplay";
```

- [ ] **Step 4: Extend `ScheduleDayRow`** — signature (`:831-839`):

```tsx
export function ScheduleDayRow({
  dfid,
  iso,
  entries,
  showStart = null,
  window: dayWindow = null,
  showEnd = null,
}: {
  dfid: string;
  iso: string;
  entries: AgendaEntry[];
  showStart?: string | null;
  window?: { start: string; end: string } | null;
  showEnd?: string | null;
}) {
```

Derive `timeMeta` after `const rows = ...` (`:851`):

```tsx
  // Fragment-day meta (§#307 Fix 1): a day with no titled entries surfaces its
  // showStart / window / showEnd — mirrors the crew ScheduleSection. Sentinel-guarded
  // (resolveOptionalField hides TBD/N/A), so it never renders "Ends TBD".
  let timeMeta: string | null = null;
  if (entries.length === 0) {
    const win = dayWindow != null ? formatScheduleWindow(dayWindow) : null;
    const start = resolveOptionalField(showStart ?? undefined) ?? null;
    const end = resolveOptionalField(showEnd ?? undefined) ?? null;
    timeMeta = win ?? start ?? (end != null ? `Ends ${end}` : null);
  }
```

Render it under the date header (after the `{humanizeDate(iso) ?? iso}` span, `:857`):

```tsx
      {timeMeta ? (
        <span
          data-testid={`wizard-step3-card-${dfid}-sched-meta`}
          className="text-sm tabular-nums text-text-subtle"
        >
          {timeMeta}
        </span>
      ) : null}
```

- [ ] **Step 5: Thread the fields at the call site** — `ScheduleBreakdown` (`:925`):

```tsx
            <ScheduleDayRow
              key={iso}
              dfid={dfid}
              iso={iso}
              entries={arr(ros[iso]?.entries)}
              showStart={ros[iso]?.showStart ?? null}
              window={ros[iso]?.window ?? null}
              showEnd={ros[iso]?.showEnd ?? null}
            />
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx
git commit --no-verify -m "feat(admin): surface showStart/window/showEnd in wizard schedule breakdown (#307)"
```

---

### Task 6: Transport — passengers-column-only (Fix 2)

**Files:**
- Modify: `lib/parser/blocks/transport.ts:598-630` (`extractAssignedNames`)
- Test: `tests/parser/blocks/transport.test.ts`
- Reconcile: `tests/parser/exporterFixtures.test.ts:661-672` (existing test encodes the OLD bug)

- [ ] **Step 1: Write the failing tests** — append to `tests/parser/blocks/transport.test.ts`:

```ts
describe("#307 no-header transport never harvests names", () => {
  const crew = [{ name: "Eric Carroll" }, { name: "Eric Weiss" }, { name: "Connor Hester" }] as any;
  it("scratch names beside $ costs → assigned_names []", () => {
    const md = [
      "| TRANSPORTATION | NAME | PHONE |  |  |",
      "| :---: | :---: | :---: | :---: | :---: |",
      "| Pick Up Warehouse | 5/10 @ TBD |  | Eric Carroll | $938.80 |",
      "| Pick Up Venue | 5/14 @ 6:00 PM |  | Connor Hester | $1,143.29 |",
    ].join("\n");
    const t = parseTransportation(md, "v2", crew);
    for (const leg of t!.schedule) expect(leg.assigned_names).toEqual([]);
  });
  it("plain no-header row with a real roster name → [] (no-header passengers unsupported, R10)", () => {
    const md = [
      "| TRANSPORTATION | NAME | PHONE |  |",
      "| :---: | :---: | :---: | :---: |",
      "| Pick Up Venue | 5/14 @ 6:00 PM |  | Connor Hester |",
    ].join("\n");
    expect(parseTransportation(md, "v2", crew)!.schedule[0]!.assigned_names).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/parser/blocks/transport.test.ts -t "#307"`
Expected: FAIL — the scan harvests `["Eric Carroll"]` / `["Connor Hester"]`.

- [ ] **Step 3: Implement** — `lib/parser/blocks/transport.ts`, replace `extractAssignedNames` body (`:598-630`):

```ts
function extractAssignedNames(
  cells: string[],
  passengersColIdx: number,
  crewMembers?: CrewMemberRow[],
): string[] {
  if (passengersColIdx >= 0) {
    // Explicit PASSENGERS column — use it exclusively (empty = no names).
    const raw = clean(cells[passengersColIdx] ?? "");
    if (!raw || raw === "-" || raw === "\\-") return [];
    return splitNames(raw, crewMembers);
  }
  // No declared PASSENGERS column → no passengers. The former all-column crew-context
  // scan harvested billing/scratch names from unrelated columns (#307 D41:D43). The v2
  // format has no passenger column; no supported no-header passenger assignment exists
  // in the corpus (spec R10). Removed.
  return [];
}
```

(`splitNames`, `isNameLike`, and `crewMembers` remain — used by the passengers-column path.)

- [ ] **Step 4: Reconcile the existing exporter-fidelity test that encoded the OLD bug** —
`tests/parser/exporterFixtures.test.ts:661-672` (`describe "B1 transport assigned_names …"`) currently
asserts the scratch names as expected output:

```ts
    expect(byStage["Pick Up Warehouse"]).toEqual(["Eric Carroll"]);
    expect(byStage["Drop Off Venue"]).toEqual(["Eric Weiss"]);
```

These are the #307 false positives (col-D billing names beside the `$` costs — the B1 fix only stopped
the col0 stage-label read, still harvested col D). Flip **all three** to `[]` and update the
`it`-name/comment to the passengers-column-only contract (RFI/PC has no `PASSENGERS` header → no
passengers):

```ts
    // #307: RFI/PC has no PASSENGERS column; the col-D names (D41:D43, beside the $ costs)
    // are billing scratch, not passengers → assigned_names is [] for every leg.
    expect(byStage["Pick Up Warehouse"]).toEqual([]);
    expect(byStage["Drop Off Venue"]).toEqual([]);
    expect(byStage["Pick Up Venue"]).toEqual([]);
```

Rename the `it` from "maps real crew (col3), not the stage label (col0)" to reflect the new contract
(e.g. "no PASSENGERS header → assigned_names [] for every leg (#307)"). Keep the existing
`not.toContain(e.stage)` loop (`:668`) — it still holds (`[]` contains nothing).

- [ ] **Step 5: Run tests to verify pass (incl. regressions + reconciled fixture)**

Run: `npx vitest run tests/parser/blocks/transport.test.ts tests/parser/exporterFixtures.test.ts`
Expected: PASS — the v4-with-Passengers tests (`transport.test.ts:231-243,561-641`), the v2→`[]` test
(`:149-153`), the new `#307` cases, AND the reconciled RFI/PC exporter fixture.

- [ ] **Step 6: Commit**

```bash
git add lib/parser/blocks/transport.ts tests/parser/blocks/transport.test.ts tests/parser/exporterFixtures.test.ts
git commit --no-verify -m "fix(parser): transport assigned_names only from explicit PASSENGERS column (#307)"
```

---

### Task 7: Resync release-gate — `showEnd` contract (R8)

**Files:**
- Modify: `scripts/verify-resync-scheduletimes.ts:18-21,38,87-94,168`
- Modify: `tests/data/verifyResyncExpectedMap.test.ts:7,9-13,19-40`
- Test: `tests/data/verifyResyncExpectedMap.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/data/verifyResyncExpectedMap.test.ts`:

```ts
test("#307 present showEnd-only day passes { field: 'showEnd' }", () => {
  expect(
    dayHasExpectedField(
      { entries: [], showStart: null, showEnd: "6:00 PM", window: null },
      { field: "showEnd" },
    ),
  ).toBe(true);
});
test("#307 showEnd expectation FAILS when showEnd absent", () => {
  expect(
    dayHasExpectedField(
      { entries: [], showStart: null, showEnd: null, window: null },
      { field: "showEnd" },
    ),
  ).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/data/verifyResyncExpectedMap.test.ts -t "#307"`
Expected: FAIL — `"showEnd"` not in the union / no switch case.

- [ ] **Step 3: Implement in the mirror test's helper** — `tests/data/verifyResyncExpectedMap.test.ts`. Union (`:7`):

```ts
type DayExpectation = { field: "entries" | "window" | "showStart" | "showEnd" | "unparsed" };
```
Checker (after the `window` branch, `:12-13`):

```ts
  if (exp.field === "window") return day.window != null;
  if (exp.field === "showEnd") return day.showEnd != null;
  return day.showStart != null;
```
Add `showEnd: null` to the four `ScheduleDay` fixtures at `:19,24,30,39`.

- [ ] **Step 4: Implement in the live script** — `scripts/verify-resync-scheduletimes.ts`. Union (`:18-21`), add before `unparsed`:

```ts
  | { field: "showStart" } // leading-start fragment (Redefining-FI Day 1)
  | { field: "showEnd" } // end-only fragment (Redefining-FI Day 2 "GS: ... - 6:00 PM")
  | { field: "unparsed" }; // genuinely unparseable → SCHEDULE_TIME_UNPARSED, NOT a decoded day
```
Flip the RFI Day-2 expectation (`:38`):

```ts
    "2025-05-14": { field: "showEnd" }, // "GS: ... - 6:00 PM" — end-only, decoded as showEnd
```
Add the switch case (in `dayHasExpectedField`, after `case "showStart"`, `:92-93`) AND a trailing
compile-time exhaustiveness guard (the repo does NOT set `noImplicitReturns`, so without this a missing
case silently returns `undefined` at runtime instead of failing to compile — Codex plan-review R5):

```ts
    case "showStart":
      return day.showStart != null;
    case "showEnd":
      return day.showEnd != null;
    default: {
      // Exhaustiveness guard: the switch is already exhaustive, so `exp` narrows to
      // `never` here; a new DayExpectation variant with no case leaves `exp` non-never
      // and this assignment becomes a COMPILE error. (Assign `exp`, not `exp.field` —
      // on an exhaustive switch `exp.field` would itself be a `never` access error.)
      const _exhaustive: never = exp;
      return _exhaustive;
    }
```
Recovered-content predicate (`:168`):

```ts
      (d) => d.entries.length > 0 || d.showStart != null || d.showEnd != null || d.window != null,
```

- [ ] **Step 5: Run mirror tests + a REAL typecheck of the whole project (incl. the script)**

Run: `npx vitest run tests/data/verifyResyncExpectedMap.test.ts && pnpm typecheck`
Expected: PASS. `pnpm typecheck` compiles the whole project (the script included) and FAILS on any type
or exhaustiveness regression — unlike a `tsc | grep` pipeline, which returns success even when errors
match the grep. If the `showEnd` case were omitted, the `_exhaustive: never` assignment would error here.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-resync-scheduletimes.ts tests/data/verifyResyncExpectedMap.test.ts
git commit --no-verify -m "chore(infra): resync gate expects showEnd for RFI/PC 2025-05-14 (#307)"
```

---

### Task 8: §12.4 reconciliation + catalog lockstep (R9)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2896` (DEFINITION column only — NO prettier)
- Regen: `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`)
- Verify: `tests/cross-cutting/codes.test.ts` (x1), `lib/messages/catalog.ts` (expected no change)

- [ ] **Step 1: Edit the master-spec §12.4 definition column** — line 2896, change only the first prose cell (leave the three copy cells byte-identical):

From: `a SHOW DAY's TIME column has content but no readable call time / window / agenda (e.g. an end-only "GS: ... - 6:00 PM" or "General Session TBD"); that day falls back to anchors`

To: `a SHOW DAY's TIME column has content but no readable call time / window / agenda / end time (e.g. "General Session TBD"); that day falls back to anchors`

Use a surgical `Edit` (exact-string) — do NOT run prettier.

- [ ] **Step 2: Regenerate spec codes**

Run: `pnpm gen:spec-codes`
Expected: **no diff** to `lib/messages/__generated__/spec-codes.ts` (copy columns unchanged). `git status` should show only the master-spec edit staged-worthy.

- [ ] **Step 3: Run the x1 parity gate + catalog check**

Run: `npx vitest run tests/cross-cutting/codes.test.ts`
Expected: PASS (catalog ↔ §12.4 copy parity holds; `catalog.ts` needs no edit). If gen produced any diff or x1 fails, update `lib/messages/catalog.ts` accordingly and re-run.

- [ ] **Step 4: Commit** (include any regenerated file, per three-way lockstep)

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts
git commit --no-verify -m "docs(spec): §12.4 SCHEDULE_TIME_UNPARSED no longer fires for end-only times (#307)"
```

(If `spec-codes.ts`/`catalog.ts` are unchanged, `git add` is a no-op for them and only the master spec is committed — expected.)

---

### Task 9: Full-suite reconciliation, gates & impeccable close-out

**Files:** any test asserting the old end-only warning; whole diff.

- [ ] **Step 1: Reconcile parser-behavior tests** — run the candidates and fix any that assert `SCHEDULE_TIME_UNPARSED` for `GS: ... - 6:00 PM` (now a `showEnd` day, no warning) — reconcile to the new contract, do NOT blind-delete:

Run: `npx vitest run tests/parser/blocks/scheduleTimes.test.ts tests/parser/blocks/agendaWarnings.test.ts tests/parser/blocks/scheduleBookends.test.ts tests/components/crew/primitives/RunOfShowList.test.tsx tests/crew/resolveKeyTimes.test.ts`
For each failure: if it pinned the old end-only warning, update it to expect the day present with `showEnd` and no warning. (Task 1 already reconciled `scheduleTimes.test.ts:50-57`; it's listed here as the safety net.)

- [ ] **Step 2: Full suite (FAIL-CLOSED)**

Run (the `pipefail` makes a failing suite propagate its non-zero exit through the `tee`/`tail` pipe —
a bare `pnpm test | tail` would mask failures behind `tail`'s exit 0, Codex plan-review R6):

```bash
set -o pipefail
pnpm test 2>&1 | tee /tmp/307-test.log | tail -40; status=$?; echo "test exit=$status"; exit $status
```
The `status=$?` captures the pipeline's (pipefail) exit BEFORE `echo` resets `$?`, and `exit $status`
re-propagates it so the command fails closed (a trailing bare `echo` would reset the status to 0 —
Codex plan-review R7). Expected: `test exit=0` and all pass. Triage any failure as real vs env/psql (per
`feedback_full_suite_before_push_scoped_gates_miss_regressions`). Grep `/tmp/307-test.log` for the vitest
SUMMARY line, not just the tail.

- [ ] **Step 3: Typecheck, lint, format, build (FAIL-CLOSED)**

Capture-then-re-exit so the status reflects the `&&` chain, not the trailing `echo`:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build; status=$?; echo "gates exit=$status"; exit $status
```
Expected: `gates exit=0`. (`--no-verify` commits skipped the prettier hook; `format:check` is the net.
`lint` enforces canonical Tailwind, e.g. `wrap-break-word` not `break-words`.) If you need to trim
`build` output, use `set -o pipefail; pnpm build 2>&1 | tee /tmp/307-build.log | tail -20; s=$?; exit $s`
— never a bare `| tail` and never a trailing `echo` as the last command.

- [ ] **Step 4: Impeccable dual-gate (UI diff)** — the diff touches `components/crew/sections/ScheduleSection.tsx` + `components/admin/wizard/step3ReviewSections.tsx` (invariant 8). Run `/impeccable critique` AND `/impeccable audit` on the UI diff; fix HIGH/CRITICAL or defer via `DEFERRED.md`. Record dispositions.

- [ ] **Step 5: Commit any reconciliation/fixups**

```bash
git add -A
git commit --no-verify -m "test(parser): reconcile end-only warning assertions to showEnd contract (#307)"
```

---

## Self-Review

**Spec coverage:** Fix 1 → Task 5. Fix 2 → Task 6. Fix 3 → Tasks 1-4,7. R7 predicate class → Tasks 1 (scheduleTimes), 2 (decode), 3 (applyParseResult), 7 (verifier). R8 resync gate → Task 7. R9 §12.4 → Tasks 1 (doc comment) + 8. R10 transport audit → Task 6 tests. Sentinel-hiding meta-test (R6) → Task 4. resolveKeyTimes guard (R2) → Task 4. Every spec section maps to a task.

**Placeholder scan:** none — every code step shows the code.

**Type consistency:** `ScheduleDay = { entries; showStart; showEnd; window }` used identically in Tasks 1,2,3,4,5,7. `extractAssignedNames(cells, passengersColIdx, crewMembers?)` signature unchanged (Task 6). `DayExpectation` gains `showEnd` in both the script and mirror (Task 7). `timeMeta` derivation (Task 5) uses `formatScheduleWindow` + `resolveOptionalField`, both imported.
