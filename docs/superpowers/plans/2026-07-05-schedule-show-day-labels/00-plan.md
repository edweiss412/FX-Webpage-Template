# "Show Day x" schedule labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Number crew-schedule show days as "Show Day 1", "Show Day 2", … (1-indexed, chronological) on both the crew page (`DayCard`) and the admin wizard step-3 preview (`ScheduleDayRow`), via the shared `aggregateDays`.

**Architecture:** Add a display-only `label: string` field to `AggregateDay`; `aggregateDays` computes `"Show Day N"` for show days and `label = phase` otherwise. Structural `phase` (`SchedulePhase`) is unchanged — it still drives the `DayCard` tone dot and the wizard cap-exemption. `DayCard` gains an optional `label?` (falls back to `phase`); the wizard `ScheduleDayRow` renders `label` instead of `phase`.

**Tech Stack:** Next.js 16, React Server Components, TypeScript (`exactOptionalPropertyTypes` ON), Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-05-schedule-show-day-labels.md`

## Global Constraints

- TDD per task: failing test → minimal impl → green → commit. Commit per task, conventional commits.
- `exactOptionalPropertyTypes` ON: `label?: string` is absent-or-string, never explicitly `undefined`.
- Structural `phase` is NEVER derived from or folded into the display `label`. Numbering lives only in `label`.
- No DB, parser, advisory-lock, Supabase-call, mutation-surface, or §12.4 changes.
- Invariant 8 (UI dual-gate): impeccable critique + audit before cross-model review (Task 5).

## Meta-test inventory

- **Creates:** none. Display-label change; behavioral unit + component tests are the enforcement.
- **Extends:** none. `tests/crew/agendaDisplay-single-source.test.ts` (text-matches the `aggregateDays` export at `:16`) stays green unchanged — it asserts nothing about output shape.

## Layout-dimensions / transition tasks — declared N/A

- **Layout-dimensions task:** N/A. No fixed-dimension parent constrains the label. The crew phase line (`DayCard.tsx:89-103`) and wizard eyebrow (`step3ReviewSections.tsx:892-908`) both live in `flex-col` containers that already wrap longer strings (meta like "7:30am–5:50pm" exceeds "Show Day 12"). The existing `tests/e2e/crew-layout-dimensions.spec.ts` continues to pin DayCard row geometry and must stay green (no assertion there keys off the phase text length).
- **Transition-audit task:** N/A. `DayCard` and `ScheduleDayRow` are synchronous Server Components — no `'use client'`, no `AnimatePresence`, no state, no animated conditionals. The label change is a pure text swap.

---

### Task 1: `aggregateDays` — `label` field + "Show Day N" numbering

**Files:**
- Modify: `lib/crew/agendaDisplay.ts:66-93` (`AggregateDay` type + `aggregateDays` body)
- Test: `tests/crew/aggregateDaysLabel.test.ts` (new)

**Interfaces:**
- Produces: `AggregateDay = { date: string; phase: SchedulePhase; label: string }`. `aggregateDays(dates)` returns rows where `label === "Show Day ${n}"` for `phase === "Show"` (n = 1-indexed position among Show rows in final ASC order), else `label === phase`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
// tests/crew/aggregateDaysLabel.test.ts
import { describe, expect, it } from "vitest";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import type { ShowRow } from "@/lib/parser/types";

const dates = (o: Partial<ShowRow["dates"]> = {}): ShowRow["dates"] => ({
  travelIn: null,
  set: null,
  showDays: [],
  travelOut: null,
  ...o,
});

describe("aggregateDays — Show Day numbering (bug #316 item 2)", () => {
  it("numbers show days 1..N by CHRONOLOGICAL order, not array order", () => {
    // showDays deliberately out of order; travelIn + travelOut bracket them.
    const rows = aggregateDays(
      dates({
        travelIn: "2025-10-18",
        set: "2025-10-19",
        showDays: ["2025-10-22", "2025-10-20", "2025-10-21"],
        travelOut: "2025-10-23",
      }),
    );
    // Expected labels derived from the fixture (3 show days, sorted ASC), not hardcoded max.
    const showRows = rows.filter((r) => r.phase === "Show");
    expect(showRows.map((r) => r.date)).toEqual(["2025-10-20", "2025-10-21", "2025-10-22"]);
    expect(showRows.map((r) => r.label)).toEqual(
      showRows.map((_, i) => `Show Day ${i + 1}`),
    );
    // Non-show labels equal their phase; phase is UNCHANGED.
    const byDate = new Map(rows.map((r) => [r.date, r]));
    expect(byDate.get("2025-10-18")).toMatchObject({ phase: "Travel In", label: "Travel In" });
    expect(byDate.get("2025-10-19")).toMatchObject({ phase: "Set", label: "Set" });
    expect(byDate.get("2025-10-23")).toMatchObject({ phase: "Travel Out", label: "Travel Out" });
    // "Show" phase never leaks into the label field.
    expect(rows.every((r) => r.label !== "Show")).toBe(true);
  });

  it("single show day → 'Show Day 1'", () => {
    const rows = aggregateDays(dates({ showDays: ["2025-10-20"] }));
    expect(rows).toEqual([{ date: "2025-10-20", phase: "Show", label: "Show Day 1" }]);
  });

  it("a showDays date colliding with set is deduped to 'Set' and NOT counted as a show day", () => {
    // 2025-10-19 is both set and a showDays entry → first-wins = Set.
    const rows = aggregateDays(
      dates({ set: "2025-10-19", showDays: ["2025-10-19", "2025-10-20", "2025-10-21"] }),
    );
    const byDate = new Map(rows.map((r) => [r.date, r]));
    expect(byDate.get("2025-10-19")).toMatchObject({ phase: "Set", label: "Set" });
    // Remaining show days number 1..2 CONTIGUOUSLY (no gap from the collided date).
    expect(byDate.get("2025-10-20")).toMatchObject({ phase: "Show", label: "Show Day 1" });
    expect(byDate.get("2025-10-21")).toMatchObject({ phase: "Show", label: "Show Day 2" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/crew/aggregateDaysLabel.test.ts`
Expected: FAIL — `label` is `undefined` on the returned rows (property does not exist yet).

- [ ] **Step 3: Write minimal implementation**

In `lib/crew/agendaDisplay.ts`, extend `AggregateDay` (`:68-73`) with `label: string` and update the JSDoc:

```ts
export type AggregateDay = {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  /** Structural phase tag — drives tone + cap-exemption. Unchanged. */
  phase: SchedulePhase;
  /** Display text. Equals `phase` except show days → "Show Day N" (1-indexed
   *  by chronological order among the aggregate's Show days). */
  label: string;
};
```

Update `aggregateDays` (`:80-93`) — assign `label` during the final map:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/crew/aggregateDaysLabel.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crew/agendaDisplay.ts tests/crew/aggregateDaysLabel.test.ts
git commit --no-verify -m "feat(crew): aggregateDays emits 'Show Day N' label (bug #316 item 2)"
```

---

### Task 2: `DayCard` — optional `label` prop (falls back to `phase`)

**Files:**
- Modify: `components/crew/primitives/DayCard.tsx:38-118`
- Test: `tests/components/crew/primitives.test.tsx` (add cases to the existing `<DayCard>` describe at `:129`)

**Interfaces:**
- Consumes: `AggregateDay.label` (via caller).
- Produces: `DayCardProps` gains `label?: string`. Phase line renders `label ?? phase`. Tone dot unchanged (keys off `phase`).

- [ ] **Step 1: Write the failing test**

Add to the `describe("<DayCard> — horizontal date badge", ...)` block (`tests/components/crew/primitives.test.tsx:129`):

```ts
  test("renders `label` as the phase line when provided (Show Day N)", () => {
    const { getByTestId, queryByText } = render(
      <DayCard day="2026-06-14" phase="Show" today={false} label="Show Day 2" />,
    );
    // The phase-line text is the label, not the bare phase.
    expect(getByTestId("day-card").textContent).toContain("Show Day 2");
    expect(queryByText("Show", { exact: true })).toBeNull();
    // Tone dot still keys off the structural phase.
    expect(getByTestId("day-card-phase-dot").getAttribute("data-tone")).toBe("show");
  });

  test("falls back to `phase` text when `label` is omitted", () => {
    const { getByTestId } = render(<DayCard day="2026-06-13" phase="Set" today={false} />);
    expect(getByTestId("day-card").textContent).toContain("Set");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/crew/primitives.test.tsx -t "Show Day N"`
Expected: FAIL — `label` prop not accepted (TS) / text is "Show" not "Show Day 2".

- [ ] **Step 3: Write minimal implementation**

In `components/crew/primitives/DayCard.tsx`, add to `DayCardProps` (`:38-47`):

```ts
  /** Display text for the phase line. Falls back to `phase` when omitted. */
  label?: string;
```

Destructure it (`:57`) and render `label ?? phase` at the phase-line text (`:102`, currently `{phase}`):

```ts
export function DayCard({ day, phase, today, meta, label }: DayCardProps) {
  // ...
  //   {label ?? phase}   ← was {phase}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/crew/primitives.test.tsx`
Expected: PASS (new cases + all existing DayCard tone tests, which omit `label` and hit the fallback).

- [ ] **Step 5: Commit**

```bash
git add components/crew/primitives/DayCard.tsx tests/components/crew/primitives.test.tsx
git commit --no-verify -m "feat(crew): DayCard renders optional display label (bug #316 item 2)"
```

---

### Task 3: `ScheduleSection` — pass `label` to `DayCard`

**Files:**
- Modify: `components/crew/sections/ScheduleSection.tsx:326`
- Test: `tests/components/crew/sections/ScheduleSection.showDayLabels.test.tsx` (new)

**Interfaces:**
- Consumes: `AggregateDay.label` from `aggregateDays(data.show.dates)` (already computed into `visibleDays`, `:192-197`).
- Produces: crew Schedule day cards show "Show Day N".

- [ ] **Step 1: Write the failing test**

The existing `ScheduleSection` suites build a full `ShowForViewer`. Reuse the nearest existing fixture harness. New file:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

afterEach(cleanup);

// Mirror ScheduleSection.bookends.test.tsx:86 — admin viewer → dateRestriction
// none → every aggregate day is visible.
const adminViewer = { kind: "admin" } as const;

describe("ScheduleSection — Show Day numbering (bug #316 item 2)", () => {
  test("multi show-day schedule numbers the show days chronologically", () => {
    const dates = {
      travelIn: "2025-10-18",
      set: null,
      showDays: ["2025-10-20", "2025-10-19"], // out of order on purpose
      travelOut: "2025-10-21",
    };
    const data = makeShowForViewer({ dates }); // VERIFY the fixture accepts a `dates` override; if it merges into show.dates, pass accordingly
    const { container } = render(
      <ScheduleSection data={data} viewer={adminViewer} today={new Date("2025-10-19T12:00:00Z")} showId="s" />,
    );
    // Expected labels DERIVED from the data source, not hardcoded.
    const expected = new Map(aggregateDays(data.show.dates).map((d) => [d.date, d.label]));
    // Each visible day-card row renders its label text.
    for (const [iso, label] of expected) {
      const row = container.querySelector(`[data-day="${iso}"]`);
      expect(row?.textContent).toContain(label);
    }
    // Concretely: the two show days read "Show Day 1"/"Show Day 2" in ASC order.
    expect(expected.get("2025-10-19")).toBe("Show Day 1");
    expect(expected.get("2025-10-20")).toBe("Show Day 2");
  });
});
```

> **Impl note:** the harness is confirmed — `makeShowForViewer` from `@/tests/fixtures/showForViewer`, admin viewer `{ kind: "admin" } as const` (both per `ScheduleSection.bookends.test.tsx:24,86`). The one thing to confirm at impl time is HOW `makeShowForViewer` accepts date overrides (a `dates` key vs. a nested `show.dates` merge) — inspect the fixture's option shape and pass dates through whichever path it exposes; assert against `aggregateDays(data.show.dates)` regardless.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/crew/sections/ScheduleSection.showDayLabels.test.tsx`
Expected: FAIL — rows render "Show" (no number) because `DayCard` still receives `phase`, not `label`.

- [ ] **Step 3: Write minimal implementation**

`components/crew/sections/ScheduleSection.tsx:326` — add `label={day.label}`:

```tsx
<DayCard day={day.date} phase={day.phase} today={isToday} meta={meta} label={day.label} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/crew/sections/ScheduleSection.showDayLabels.test.tsx`
Expected: PASS. Also run the full `ScheduleSection` suite to confirm no regression:
Run: `pnpm vitest run tests/components/crew/sections/`
Expected: PASS (existing suites don't assert on the "Show" text; they check tone/testid/geometry).

- [ ] **Step 5: Commit**

```bash
git add components/crew/sections/ScheduleSection.tsx tests/components/crew/sections/ScheduleSection.showDayLabels.test.tsx
git commit --no-verify -m "feat(crew): ScheduleSection shows 'Show Day N' on day cards (bug #316 item 2)"
```

---

### Task 4: Wizard `ScheduleDayRow` renders `label`; `ScheduleBreakdown` threads it

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` — `ScheduleDayRow` prop `phase → label` (`:896-908` render; the row's prop signature), `ScheduleBreakdown` (`:977-1019`)
- Test: `tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx` (update `:45-49`, add numbering case)

**Interfaces:**
- Consumes: `AggregateDay.label`.
- Produces: wizard eyebrow renders `label` (string) for aggregate days, nothing for ros-only days (`label: null`). Cap-exemption unchanged (keys off `phase`).

- [ ] **Step 1: Update the existing assertion + write the failing numbering test**

In `tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx`:

Update the "every aggregate day's phase label matches aggregateDays(dates)" test (`:45-50`) to assert against `d.label` (show days now render "Show Day N", not "Show"):

```ts
  test("every aggregate day's label matches aggregateDays(dates).label (bound per date)", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={fx} />);
    for (const d of aggregateDays(fx)) {
      expect(phaseOf(container, d.date)).toBe(d.label); // expected DERIVED from the data source
    }
  });
```

Add a numbering-specific test (fixture `fx` has 2 show days: 2025-10-20, 2025-10-21):

```ts
  test("show days render numbered 'Show Day N' in chronological order", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={fx} />);
    expect(phaseOf(container, "2025-10-20")).toBe("Show Day 1");
    expect(phaseOf(container, "2025-10-21")).toBe("Show Day 2");
    // travel bookends still read their phase (regression guard for Task 1's non-show branch).
    expect(phaseOf(container, "2025-10-18")).toBe("Travel In");
    expect(phaseOf(container, "2025-10-22")).toBe("Travel Out");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx`
Expected: FAIL — the numbering test expects "Show Day 1" but the row still renders "Show" (`d.phase`); the updated per-date test also fails on the show days for the same reason.

- [ ] **Step 3: Write minimal implementation**

In `components/admin/wizard/step3ReviewSections.tsx`:

(a) `ScheduleDayRow` — change the display prop from `phase?: SchedulePhase | null` to `label?: string | null`, and render `{label}` in the eyebrow (`:896-908`). The `phase != null` guard becomes `label != null`; the testid `wizard-step3-card-${dfid}-sched-phase-${iso}` is unchanged. (`SchedulePhase` may no longer be needed as a `ScheduleDayRow` prop import — leave the top-level import; `aggregateDays`/`ScheduleBreakdown` still use it.)

(b) `ScheduleBreakdown` (`:977-1019`):
- `aggregate` is `aggregateDays(dates)` → now typed `AggregateDay[]` (has `label`). Keep the local working type as `{ date: string; phase: SchedulePhase | null; label: string | null }`.
- `rosOnly` rows: add `label: null` alongside `phase: null` (`:979-981`).
- Cap-exemption `alwaysShown` (`:992-993`) — UNCHANGED (keys off `phase`).
- Pass `label={d.label}` to `ScheduleDayRow` (`:1018`, was `phase={d.phase}`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx`
Expected: PASS (all cases, incl. the union/regression/cap tests unchanged). Also run the wizard ScheduleDayRow phase test:
Run: `pnpm vitest run tests/components/admin/wizard/ScheduleDayRow.phase.test.tsx`
Expected: this file passes `phase=` today (`renderRow({ iso, phase?: SchedulePhase | null })` at `:9-15`) and will FAIL to typecheck after the prop rename. Update it in this task: change `renderRow`'s prop to `label?: string | null` (and drop the now-unused `SchedulePhase` import), pass `label="Travel In"` in test 1 (assertion string "Travel In" unchanged — testid `wizard-step3-card-d-sched-phase-2025-10-18` unchanged), and in test 2 render with no `label` → assert no `[data-testid^="wizard-step3-card-d-sched-phase-"]` node. The file's intent ("label present when set, absent when null") is preserved verbatim:

```ts
const renderRow = (props: { iso: string; label?: string | null }) =>
  render(
    <ul>
      <ScheduleDayRow dfid="d" entries={[]} {...props} />
    </ul>,
  );
// test 1: renderRow({ iso: "2025-10-18", label: "Travel In" }) → textContent "Travel In"
// test 2: renderRow({ iso: "2025-10-30" }) → no sched-phase node
```

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx tests/components/admin/wizard/ScheduleDayRow.phase.test.tsx
git commit --no-verify -m "feat(admin): wizard schedule preview shows 'Show Day N' (bug #316 item 2)"
```

---

### Task 5: Full-suite green + typecheck/lint/format + impeccable dual-gate (invariant 8)

**Files:** none (verification task).

- [ ] **Step 1: Typecheck, lint, format, full test suite**

```bash
pnpm tsc --noEmit         # or the project's typecheck script (verify: `pnpm typecheck`)
pnpm lint
pnpm format:check
pnpm vitest run
```
Expected: green except the known environmental live-DB failures (validation-schema-parity, pg-cron-coverage, live email-canonicalization, test-auth-gate HTTP, mint-validation-fixture-atomic, validation-report-fixtures-rendering) — confirm each failing file is untouched by this diff (`git diff --name-only origin/main..HEAD` excludes them) and has no DB/schema/auth surface. Triage any NEW failure as a real regression.

- [ ] **Step 2: Impeccable critique on the UI diff**

Run `/impeccable critique` scoped to the diff (crew `DayCard`/`ScheduleSection`, wizard `ScheduleDayRow`). Evaluate: does "Show Day N" read well in the dense day list; contrast/weight/placement unchanged from the approved eyebrow recipe; no truncation/overflow at "Show Day 12"+. Fix HIGH/CRITICAL or defer via `DEFERRED.md`.

- [ ] **Step 3: Impeccable audit on the UI diff**

Run `/impeccable audit` (a11y, responsive, perf). The phase line already carries the meaning as text (not color-only) — confirm the longer label preserves that and wraps rather than overflows at 390px. Fix HIGH/CRITICAL or defer.

- [ ] **Step 4: Record dispositions**

Note critique + audit findings/dispositions for the close-out handoff. Commit any fixes (`style(...)`/`fix(...)`).

---

## Self-review checklist (run before adversarial review)

- **Spec coverage:** Task 1 (numbering), Task 2/3 (crew surface), Task 4 (wizard surface), Task 5 (dual-gate) cover every spec section. No Dark synthesis (spec §2) — correctly absent.
- **Placeholder scan:** the only deferred detail is the `ScheduleSection` fixture-helper name (Task 3) and the exact `ScheduleDayRow.phase.test.tsx` assertions (Task 4) — both flagged as "verify at impl time against the live harness," with the contract (assert label text per `data-day` / per testid, derived from `aggregateDays`) fully specified.
- **Type consistency:** `AggregateDay.label: string` (Task 1) → `DayCard.label?: string` (Task 2) → `ScheduleDayRow.label?: string | null` (Task 4). `phase` never changes type. Consistent across tasks.
- **Anti-tautology:** every numbering assertion derives expected values from `aggregateDays(fixture.dates)` (the data source), not from the rendered container or a hardcoded max.

## Adversarial review (cross-model)

After self-review: Codex adversarial review of this plan, REVIEWER ONLY, iterate to APPROVE (no round budget). Then execution handoff.
