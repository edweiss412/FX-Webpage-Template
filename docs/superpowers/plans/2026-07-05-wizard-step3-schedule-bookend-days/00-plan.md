# Wizard step-3 Crew Schedule shows all schedule days — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The wizard step-3 "Crew Schedule" preview renders every schedule day — including the travel-in/travel-out bookend days it currently drops — each aggregate day carrying its phase label, mirroring the crew page. (Bug #316 item 1.)

**Architecture:** `ScheduleBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:937`) iterates `Object.keys(ros)` today, so bookend days (no run-of-show entry) vanish. Change it to render the chronological UNION of `aggregateDays(dates)` (phase-labeled) and any `ros`-only day (unchanged, no phase). Thread `dates` (`s.pr.show.dates`) into the component; add an optional `phase` prop to `ScheduleDayRow`. Non-Show aggregate bookends (Travel In / Set / Travel Out) are cap-exempt so the bug cannot recur through `SCHEDULE_DAYS_CAP`.

**Tech Stack:** Next.js 16 React Server Components, TypeScript (exactOptionalPropertyTypes ON), Vitest + @testing-library/react (jsdom), Tailwind v4.

## Global Constraints

- **TDD per task**, **commit per task** (`<type>(<scope>): <summary>`; scope `admin`).
- **exactOptionalPropertyTypes ON:** optional props are present-or-absent, never assigned `undefined`.
- **Invariant 8 (UI dual-gate):** touches `components/**` → `/impeccable critique` + `/impeccable audit` at close-out; HIGH/CRITICAL fixed or `DEFERRED.md`-deferred before cross-model review. Opus-only work.
- **No new §12.4 codes, no DB/migration, no `app/api/**`, no mutation/advisory/Supabase surface.**
- **Single source of the day aggregate + phase:** `aggregateDays` / `SchedulePhase` from `@/lib/crew/agendaDisplay` (do not re-derive).
- **Companion surface:** crew `ScheduleSection` (`app/show/[slug]/[shareToken]/page.tsx` path) already renders the full aggregate — reference, NOT modified. Single `ScheduleBreakdown`/`ScheduleDayRow` definition (both in `step3ReviewSections.tsx`); no parallel copy.

## Meta-test inventory

None applies. This change touches no auth call-boundary, DB write, admin-alert catalog, advisory lock, or tile-sentinel-hiding surface. The phase label is a controlled `SchedulePhase` enum, not a sentinel-guarded optional text field, so `_metaSentinelHidingContract` does not gain a row. Declared explicitly per the writing-plans meta-test rule.

## File structure

- **Modify:** `components/admin/wizard/step3ReviewSections.tsx` — `ScheduleDayRow` (phase prop + label), `ScheduleBreakdown` (merge/union + cap-exemption + `dates` prop), call site (`:2438`).
- **Test:** `tests/components/admin/wizard/ScheduleDayRow.phase.test.tsx` (new — phase label), `tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx` (new — merge/union/cap).
- **Untouched (regression targets):** `tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx`, `tests/components/step3SheetCard.bookends.test.tsx`, `tests/e2e/step3-schedule-bookend-layout.spec.ts` — all must still pass. The first two call `ScheduleBreakdown` (directly / via `Step3SheetCard`); `dates` is optional so they render unchanged (or gain only a benign "Show" phase label that collides with no assertion).

---

### Task 1: `ScheduleDayRow` phase label

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`ScheduleDayRow`, ~843-935; imports ~86-92)
- Test: `tests/components/admin/wizard/ScheduleDayRow.phase.test.tsx` (create)

**Interfaces:**
- Produces: `ScheduleDayRow` accepts `phase?: SchedulePhase | null`. When non-null, renders `<span data-testid={`wizard-step3-card-${dfid}-sched-phase-${iso}`}>{phase}</span>` in the `<li>` header stack, after the date span (`:884`). Absent/`null` → no phase node.
- Consumes: `SchedulePhase` from `@/lib/crew/agendaDisplay`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ScheduleBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ScheduleDay, ShowRow } from "@/lib/parser/types";

afterEach(cleanup);

const day = (extra: Partial<ScheduleDay> = {}): ScheduleDay => ({
  entries: [],
  showStart: null,
  showEnd: null,
  window: null,
  ...extra,
});
const dates = (o: Partial<ShowRow["dates"]> = {}): ShowRow["dates"] => ({
  travelIn: null,
  set: null,
  showDays: [],
  travelOut: null,
  ...o,
});

describe("wizard ScheduleDayRow phase label", () => {
  test("aggregate day renders its phase label with a per-date testid", () => {
    // travelIn day has NO ros entry — it comes purely from the aggregate.
    const { container } = render(
      <ScheduleBreakdown dfid="d" ros={{}} dates={dates({ travelIn: "2025-10-18" })} />,
    );
    const phase = container.querySelector(
      '[data-testid="wizard-step3-card-d-sched-phase-2025-10-18"]',
    );
    expect(phase?.textContent).toBe("Travel In");
  });

  test("ros-only day (outside the aggregate) renders NO phase label", () => {
    const { container } = render(
      <ScheduleBreakdown
        dfid="d"
        ros={{ "2025-10-30": day({ entries: [{ start: "5:00 PM", title: "Strike — GS", kind: "strike" }] }) }}
        dates={dates()}
      />,
    );
    // No aggregate day, so no phase node anywhere.
    expect(container.querySelector('[data-testid^="wizard-step3-card-d-sched-phase-"]')).toBeNull();
    // But the ros-only day still renders (regression guard, exercised fully in Task 2).
    expect(container.textContent).toContain("Strike — GS");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/wizard/ScheduleDayRow.phase.test.tsx`
Expected: FAIL — `ScheduleBreakdown` has no `dates` prop yet / no phase label rendered (first test: `phase` is null; second may pass incidentally).

- [ ] **Step 3: Implement — add the `phase` prop + label to `ScheduleDayRow`**

Add `SchedulePhase` to the existing import from `@/lib/crew/agendaDisplay` (currently `import { resolveOptionalField, formatScheduleWindow } from "@/lib/crew/agendaDisplay";` at `:92`):

```tsx
import { resolveOptionalField, formatScheduleWindow, type SchedulePhase } from "@/lib/crew/agendaDisplay";
```

Extend the `ScheduleDayRow` prop object type and destructure (`:843-857`) to add `phase`:

```tsx
export function ScheduleDayRow({
  dfid,
  iso,
  entries,
  showStart = null,
  window: dayWindow = null,
  showEnd = null,
  phase = null,
}: {
  dfid: string;
  iso: string;
  entries: AgendaEntry[];
  showStart?: string | null;
  window?: { start: string; end: string } | null;
  showEnd?: string | null;
  phase?: SchedulePhase | null;
}) {
```

Render the phase label in the header stack — insert immediately AFTER the date `<span>` (`:884-886`), before the `timeMeta` block:

```tsx
      <span className="text-xs font-medium tabular-nums text-text-strong">
        {humanizeDate(iso) ?? iso}
      </span>
      {phase != null ? (
        <span
          data-testid={`wizard-step3-card-${dfid}-sched-phase-${iso}`}
          className="text-[11px] font-semibold uppercase tracking-eyebrow text-text-faint"
        >
          {phase}
        </span>
      ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/admin/wizard/ScheduleDayRow.phase.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/components/admin/wizard/ScheduleDayRow.phase.test.tsx components/admin/wizard/step3ReviewSections.tsx
git commit --no-verify -m "feat(admin): ScheduleDayRow phase label (per-date testid)"
```

---

### Task 2: `ScheduleBreakdown` merged-day union + cap-exemption + `dates` threading

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`ScheduleBreakdown`, ~937-977; call site `:2438`; import `aggregateDays`)
- Test: `tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx` (create)

**Interfaces:**
- Consumes: `aggregateDays`, `SchedulePhase` from `@/lib/crew/agendaDisplay`; `ScheduleDayRow.phase` from Task 1.
- Produces: `ScheduleBreakdown({ dfid, ros, dates })` where `dates?: ShowRow["dates"]` (optional; default empty-dates → aggregate `[]` → renders exactly today's ros-only behavior). Call site passes `dates={s.pr.show.dates}`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { ScheduleBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import { aggregateDays } from "@/lib/crew/agendaDisplay";
import type { ScheduleDay, ShowRow } from "@/lib/parser/types";

afterEach(cleanup);

const day = (extra: Partial<ScheduleDay> = {}): ScheduleDay => ({
  entries: [],
  showStart: null,
  showEnd: null,
  window: null,
  ...extra,
});
const dates = (o: Partial<ShowRow["dates"]> = {}): ShowRow["dates"] => ({
  travelIn: null,
  set: null,
  showDays: [],
  travelOut: null,
  ...o,
});
const phaseOf = (c: HTMLElement, iso: string): string | null =>
  c.querySelector(`[data-testid="wizard-step3-card-d-sched-phase-${iso}"]`)?.textContent ?? null;

describe("wizard ScheduleBreakdown — all schedule days (bug #316 item 1)", () => {
  const fx = dates({
    travelIn: "2025-10-18",
    set: "2025-10-19",
    showDays: ["2025-10-20", "2025-10-21"],
    travelOut: "2025-10-22",
  });

  test("travel-in day surfaces with its phase label even with no ros entry", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={fx} />);
    const travelIn = fx.travelIn as string;
    expect(phaseOf(container, travelIn)).toBe("Travel In");
  });

  test("travel-out day surfaces with its phase label", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={fx} />);
    expect(phaseOf(container, fx.travelOut as string)).toBe("Travel Out");
  });

  test("every aggregate day's phase label matches aggregateDays(dates) (bound per date)", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={fx} />);
    for (const d of aggregateDays(fx)) {
      expect(phaseOf(container, d.date)).toBe(d.phase); // expected DERIVED from the data source
    }
  });

  test("regression: an off-schedule ros-only day is preserved (union, not aggregate-only)", () => {
    // 2025-10-30 is NOT in the aggregate domain — a parser off-schedule strike.
    const ros = {
      "2025-10-30": day({ entries: [{ start: "5:00 PM", title: "Strike — GS", kind: "strike" as const }] }),
    };
    const { container } = render(<ScheduleBreakdown dfid="d" ros={ros} dates={fx} />);
    expect(container.textContent).toContain("Strike — GS");
    expect(phaseOf(container, "2025-10-30")).toBeNull(); // ros-only → no phase
  });

  test("empty dates + empty ros → 'No run-of-show parsed.'", () => {
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={dates()} />);
    expect(container.textContent).toContain("No run-of-show parsed.");
  });

  test("BreakdownSection count reflects merged day count", () => {
    const ros = { "2025-10-30": day({ entries: [{ start: "5:00 PM", title: "X", kind: "strike" as const }] }) };
    const { getByTestId } = render(<ScheduleBreakdown dfid="d" ros={ros} dates={fx} />);
    const el = getByTestId("wizard-step3-card-d-breakdown-schedule");
    // aggregate = 4 days (travelIn/set/2 show/travelOut = 5) ... derive, don't hardcode:
    const merged = new Set([...aggregateDays(fx).map((d) => d.date), "2025-10-30"]).size;
    expect(within(el).getByText(String(merged))).toBeTruthy();
  });

  test("cap-exempt: travelOut survives when > SCHEDULE_DAYS_CAP non-synthetic days precede it", () => {
    // 15 sequential show days (Oct 01..15) push travelOut past the 14-day cap; it must still render.
    const many = Array.from({ length: 15 }, (_, i) => `2025-10-${String(i + 1).padStart(2, "0")}`);
    const capFx = dates({ set: "2025-09-30", showDays: many, travelOut: "2025-10-31" });
    const { container } = render(<ScheduleBreakdown dfid="d" ros={{}} dates={capFx} />);
    // travelOut (non-Show aggregate bookend) is cap-exempt → its phase label renders.
    expect(phaseOf(container, "2025-10-31")).toBe("Travel Out");
    // a mid-list SHOW day beyond the cap is dropped into the overflow note.
    expect(container.textContent).toMatch(/more days/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx`
Expected: FAIL — `dates` prop unsupported / bookend days absent / no cap-exemption.

- [ ] **Step 3: Implement — merged-day union in `ScheduleBreakdown` + thread `dates`**

Add `aggregateDays` to the `@/lib/crew/agendaDisplay` import (Task 1 already added `SchedulePhase`):

```tsx
import { resolveOptionalField, formatScheduleWindow, aggregateDays, type SchedulePhase } from "@/lib/crew/agendaDisplay";
```

Replace the `ScheduleBreakdown` body (`:937-977`):

```tsx
const EMPTY_DATES: ShowRow["dates"] = { travelIn: null, set: null, showDays: [], travelOut: null };

export function ScheduleBreakdown({
  dfid,
  ros,
  dates = EMPTY_DATES,
}: {
  dfid: string;
  ros: RunOfShow;
  dates?: ShowRow["dates"];
}) {
  // Merged day domain = the full schedule aggregate (travelIn/set/showDays/travelOut,
  // phase-labeled) UNION any ros-only day the parser placed off-schedule (strike /
  // load-out / off-schedule agenda — scheduleBookends.ts warns but still emits them;
  // dropping them would regress this review surface). Sorted ASC by ISO.
  const aggregate: { date: string; phase: SchedulePhase | null }[] = aggregateDays(dates);
  const aggregateDates = new Set(aggregate.map((d) => d.date));
  const rosOnly = Object.keys(ros)
    .filter((iso) => !aggregateDates.has(iso))
    .map((iso) => ({ date: iso, phase: null }));
  const mergedDays = [...aggregate, ...rosOnly].sort((a, b) => a.date.localeCompare(b.date));

  // Day cap (spec §9.2 lineage): always-show = synthetic-bearing OR a non-Show
  // aggregate bookend (Travel In / Set / Travel Out — the ≤3 days Doug reported
  // missing; they must never be hidden by the cap). Show days + non-synthetic
  // off-schedule ros days remain cap-subject.
  const isSyntheticDay = (iso: string): boolean =>
    arr(ros[iso]?.entries).some((e) => e.kind === "strike" || e.kind === "loadout");
  const alwaysShown = (d: { date: string; phase: SchedulePhase | null }): boolean =>
    isSyntheticDay(d.date) || (d.phase != null && d.phase !== "Show");
  const shownDays = mergedDays.filter((d, idx) => idx < SCHEDULE_DAYS_CAP || alwaysShown(d));
  const droppedNonExempt = mergedDays.filter(
    (d, idx) => idx >= SCHEDULE_DAYS_CAP && !alwaysShown(d),
  ).length;
  const daysNote = droppedNonExempt > 0 ? `…and ${droppedNonExempt} more days` : null;

  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-schedule`}
      label="Crew Schedule"
      count={mergedDays.length}
    >
      {mergedDays.length === 0 ? (
        <p className="text-sm text-text-subtle">No run-of-show parsed.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shownDays.map((d) => (
            <ScheduleDayRow
              key={d.date}
              dfid={dfid}
              iso={d.date}
              entries={arr(ros[d.date]?.entries)}
              showStart={ros[d.date]?.showStart ?? null}
              window={ros[d.date]?.window ?? null}
              showEnd={ros[d.date]?.showEnd ?? null}
              phase={d.phase}
            />
          ))}
        </ul>
      )}
      {daysNote ? <p className="text-xs text-text-subtle">{daysNote}</p> : null}
    </BreakdownSection>
  );
}
```

Confirm `ShowRow` is imported in this file (it is — used by `VenueBreakdown`/`OpsBreakdown`, `:639`/`:734`). If not, add `ShowRow` to the `@/lib/parser/types` import.

- [ ] **Step 4: Thread `dates` at the call site (`:2438`)**

```tsx
      render: (s) => <ScheduleBreakdown dfid={s.dfid} ros={s.ros} dates={s.pr.show.dates} />,
```

- [ ] **Step 5: Run the new + regression tests**

Run: `pnpm vitest run tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx tests/components/admin/wizard/ScheduleDayRow.phase.test.tsx tests/components/admin/wizard/ScheduleDayRow.meta.test.tsx tests/components/step3SheetCard.bookends.test.tsx`
Expected: PASS (all — new tests green; the two existing suites unchanged).

- [ ] **Step 6: Commit**

```bash
git add tests/components/admin/wizard/scheduleBreakdown.bookendDays.test.tsx components/admin/wizard/step3ReviewSections.tsx
git commit --no-verify -m "fix(admin): wizard step-3 schedule renders all days incl. travel bookends (#316)"
```

---

### Task 3: Verification + impeccable dual-gate

**Files:** none (gates only).

- [ ] **Step 1: Static gates**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: typecheck clean; lint 0 errors; format clean. (Fix formatting with `pnpm exec prettier --write` if needed, then re-commit.)

- [ ] **Step 2: Targeted + full suite triage**

Run: `pnpm vitest run tests/components/admin/wizard tests/components/step3SheetCard.bookends.test.tsx` then `pnpm test`.
Expected: feature + wizard suites green. Triage any full-suite failures against merge-base (`origin/main`) — live-DB / live-project introspection tests (`validation-schema-parity`, `pg-cron-coverage`, `email-canonicalization`, `test-auth-gate` HTTP, `mint-validation-fixture-atomic`) fail locally on an unseeded DB and are NOT regressions; confirm each failing file is untouched by the diff (`git diff --name-only origin/main..HEAD`).

- [ ] **Step 3: Invariant-8 impeccable dual-gate**

Run `/impeccable critique` AND `/impeccable audit` on the diff (the new phase-label element + expanded day list). Focus: the phase label's visual weight/placement in the dense breakdown list, contrast (`text-text-faint`), and that the added bookend rows don't break the `ScheduleDayRow` two-track grid alignment (the e2e `step3-schedule-bookend-layout.spec.ts` invariant). Fix HIGH/CRITICAL or defer via `DEFERRED.md`. Record dispositions.

- [ ] **Step 4: Commit any dual-gate fixes**

```bash
git add -A && git commit --no-verify -m "style(admin): impeccable dual-gate dispositions on schedule phase label"
```

---

### Task 4: Adversarial review (cross-model)

- [ ] Invoke `adversarial-review` (Codex) on the whole implementation diff, fresh-eyes, REVIEWER ONLY, inline-all no-tool (per the `-o` truncation lesson). Iterate until **APPROVE** (no round budget). Class-sweep every finding; structural defense after 3+ same-vector rounds.

---

### Task 5: Execution handoff / close-out

- [ ] Push; open PR. Confirm **real CI green** (pass PR number to `gh pr checks --watch`; require `mergeStateStatus == CLEAN`). `gh pr merge --merge`. Fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

## Self-review

- **Spec coverage:** merge/union (Task 2), phase labels (Task 1 + 2), cap-exemption (Task 2 + test 7), threading (Task 2 call site), all guard conditions (Task 2 tests: empty, ros-only, dup-date via aggregate precedence), anti-tautology (expecteds derived from `aggregateDays(fx)` / fixture, phase bound per-date). ✓
- **Placeholder scan:** none — all steps carry concrete code/commands. ✓
- **Type consistency:** `phase?: SchedulePhase | null` (Task 1) matches `d.phase` (Task 2, `SchedulePhase | null`); `dates?: ShowRow["dates"]` matches `s.pr.show.dates`. ✓
- **Layout-dimensions task:** the phase label sits in a flex-col header (no fixed-dimension parent); the existing e2e grid-alignment invariant is a regression target verified in Task 3 step 3, not a new fixed-parent assertion. ✓
- **Anti-tautology:** every expected derived from `aggregateDays(fx)`/fixture; phase bound to its ISO via per-date testid; the union-regression test (Task 2) is the concrete failure mode for aggregate-only implementations. ✓
