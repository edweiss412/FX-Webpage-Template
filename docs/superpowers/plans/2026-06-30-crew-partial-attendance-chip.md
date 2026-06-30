# Partial-attendance chip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show a partial-attendance chip ("Oct 7 & 9 only") from `DateRestriction` next to a crew member's role on the crew roster (`CrewSection`→`PersonRow`) and the Step-3 review modal (`CrewBreakdown`).

**Architecture:** Render-only. A new `humanizeDayList` date helper + a shared `partialAttendanceLabel(restriction,{humanize})` feed both surfaces: the crew roster (ISO days → humanized pill) and the modal (raw `M/D` tokens → inline as-parsed segment). No parser/DB/projection change.

**Tech Stack:** Next.js Server Components, TypeScript, Vitest + Testing Library. Spec: `docs/superpowers/specs/2026-06-30-crew-partial-attendance-chip-design.md` (Codex-APPROVED round 2).

## Global Constraints

- Edits in `lib/dates/humanize.ts`, `lib/crew/partialAttendance.ts` (new), `components/crew/primitives/PersonRow.tsx`, `components/crew/sections/CrewSection.tsx`, `components/admin/wizard/Step3SheetCard.tsx`, `DESIGN.md`, `tests/**`. No parser/DB/projection/crew-data-path change.
- `DateRestriction` (`lib/parser/types.ts:24-27`): `explicit{days:string[]}` | `unknown_asterisk{days:null}` | `none`. Crew surface = ISO days (`ShowForViewer.crewMembers[].dateRestriction`); modal = raw `M/D` (`ParseResult.crewMembers[].date_restriction`).
- Chip label only via `partialAttendanceLabel` (returns null for the no-chip cases). Crew = humanize:true; modal = humanize:false (as-parsed).
- TDD per task; commit per task (`feat(crew-page):` / `feat(admin):` / `feat(dates):`). `--no-verify`. Run `pnpm exec prettier --check .` before push.
- Worktree: `/Users/ericweiss/fxav-crew-partial-attendance` (branch `feat/crew-partial-attendance-chip`).

---

## File Structure

- **Modify** `lib/dates/humanize.ts` — add `humanizeDayList`.
- **Create** `lib/crew/partialAttendance.ts` — `partialAttendanceLabel`.
- **Modify** `components/crew/primitives/PersonRow.tsx` — `partial?` prop + chip + `data-partial`.
- **Modify** `components/crew/sections/CrewSection.tsx` — compute + pass `partial`.
- **Modify** `components/admin/wizard/Step3SheetCard.tsx` — `CrewBreakdown` partial segment.
- **Modify** `tests/dates/humanize.test.ts`, **Create** `tests/crew/partialAttendance.test.ts`, **Modify** `tests/components/crew/sections/CrewSection.test.tsx` + `tests/components/admin/wizard/Step3Review.test.tsx`.
- **Modify** `DESIGN.md`.

---

## Task 1: `humanizeDayList` helper

**Files:** Modify `lib/dates/humanize.ts`, `tests/dates/humanize.test.ts`.

- [ ] **Step 1: Write failing tests** — append to `tests/dates/humanize.test.ts`:

```ts
describe("humanizeDayList", () => {
  it("lists non-contiguous days, repeating month only on change", () => {
    expect(humanizeDayList(["2025-10-07", "2025-10-09"])).toBe("Oct 7 & 9");
    expect(humanizeDayList(["2025-10-07", "2025-10-09", "2025-10-11"])).toBe("Oct 7, 9 & 11");
    expect(humanizeDayList(["2025-10-30", "2025-11-02"])).toBe("Oct 30 & Nov 2");
    expect(humanizeDayList(["2025-10-07"])).toBe("Oct 7");
  });
  it("skips malformed; null when none valid", () => {
    expect(humanizeDayList(["garbage", "2025-10-07"])).toBe("Oct 7");
    expect(humanizeDayList(["garbage"])).toBeNull();
    expect(humanizeDayList([])).toBeNull();
    expect(humanizeDayList(null)).toBeNull();
    expect(humanizeDayList(undefined)).toBeNull();
  });
});
```
(Ensure `humanizeDayList` is in the file's import line from `@/lib/dates/humanize`.)

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/dates/humanize.test.ts -t "humanizeDayList"` → FAIL (not exported).

- [ ] **Step 3: Implement** — in `lib/dates/humanize.ts`, after `humanizeDayRange` (ends ~:84), add (reuses the existing private `parseYmd`, `Ymd`, `MONTHS`):

```ts
/**
 * List ISO show-days as a compact label, repeating the month only when it
 * changes: "Oct 7 & 9", "Oct 7, 9 & 11", "Oct 30 & Nov 2", "Oct 7". Malformed
 * entries are skipped; empty / all-malformed / non-array → null. (Distinct from
 * humanizeDayRange, which collapses to a first–last contiguous range.)
 */
export function humanizeDayList(
  isos: Array<string | null | undefined> | null | undefined,
): string | null {
  if (!Array.isArray(isos)) return null;
  const valid = isos.map(parseYmd).filter((v): v is Ymd => v !== null);
  if (valid.length === 0) return null;
  const parts: string[] = [];
  let prevMonth: number | null = null;
  for (const ymd of valid) {
    parts.push(ymd.month === prevMonth ? `${ymd.day}` : `${MONTHS[ymd.month - 1]} ${ymd.day}`);
    prevMonth = ymd.month;
  }
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}
```

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/dates/humanize.test.ts` → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit** — `feat(dates): humanizeDayList for non-contiguous day lists (BL-CREW-PARTIAL-ATTENDANCE-CHIP)`

---

## Task 2: `partialAttendanceLabel` shared module

**Files:** Create `lib/crew/partialAttendance.ts`, `tests/crew/partialAttendance.test.ts`.

- [ ] **Step 1: Write failing test** — `tests/crew/partialAttendance.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";

describe("partialAttendanceLabel", () => {
  it("explicit humanized (crew, ISO days)", () => {
    expect(
      partialAttendanceLabel({ kind: "explicit", days: ["2025-10-07", "2025-10-09"] }, { humanize: true }),
    ).toBe("Oct 7 & 9 only");
  });
  it("explicit raw (modal, M/D tokens, as-parsed)", () => {
    expect(
      partialAttendanceLabel({ kind: "explicit", days: ["10/7", "10/9"] }, { humanize: false }),
    ).toBe("10/7, 10/9 only");
  });
  it("unknown_asterisk → dates-TBD copy (both modes)", () => {
    expect(partialAttendanceLabel({ kind: "unknown_asterisk", days: null }, { humanize: true })).toBe(
      "Partial (dates TBD)",
    );
    expect(partialAttendanceLabel({ kind: "unknown_asterisk", days: null }, { humanize: false })).toBe(
      "Partial (dates TBD)",
    );
  });
  it("none / null / empty / all-blank / all-malformed → null", () => {
    expect(partialAttendanceLabel({ kind: "none" }, { humanize: true })).toBeNull();
    expect(partialAttendanceLabel(null, { humanize: true })).toBeNull();
    expect(partialAttendanceLabel({ kind: "explicit", days: [] }, { humanize: true })).toBeNull();
    expect(partialAttendanceLabel({ kind: "explicit", days: [" ", "\t"] }, { humanize: true })).toBeNull();
    expect(partialAttendanceLabel({ kind: "explicit", days: ["garbage"] }, { humanize: true })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail** → FAIL (module missing).

- [ ] **Step 3: Implement** — `lib/crew/partialAttendance.ts`:

```ts
import type { DateRestriction } from "@/lib/parser/types";
import { humanizeDayList } from "@/lib/dates/humanize";

/**
 * Chip label for a crew member's partial-attendance restriction, or null when
 * there's nothing to show. One source of truth for the crew roster
 * (humanize=true — ISO days → "Oct 7 & 9 only") and the Step-3 review modal
 * (humanize=false — raw "M/D" tokens shown as-parsed → "10/7, 10/9 only").
 * (BL-CREW-PARTIAL-ATTENDANCE-CHIP)
 */
export function partialAttendanceLabel(
  restriction: DateRestriction | null | undefined,
  opts: { humanize: boolean },
): string | null {
  if (!restriction || restriction.kind === "none") return null;
  if (restriction.kind === "unknown_asterisk") return "Partial (dates TBD)";
  const days = (restriction.days ?? []).filter((d) => typeof d === "string" && d.trim().length > 0);
  if (days.length === 0) return null;
  const list = opts.humanize ? humanizeDayList(days) : days.join(", ");
  return list ? `${list} only` : null;
}
```

- [ ] **Step 4: Run, verify pass** + `pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(crew-page): partialAttendanceLabel shared helper (BL-CREW-PARTIAL-ATTENDANCE-CHIP)`

---

## Task 3: Crew roster chip (`PersonRow` + `CrewSection`)

**Files:** Modify `PersonRow.tsx`, `CrewSection.tsx`, `tests/components/crew/sections/CrewSection.test.tsx`.

- [ ] **Step 1: Write failing test** — add to `CrewSection.test.tsx`:

```ts
test("partial-attendance member gets a chip; full-attendance member does not (BL-CREW-PARTIAL-ATTENDANCE-CHIP)", () => {
  const crewMembers = [
    { id: "c0", name: "Calvin", email: null, phone: null, role: "BO", roleFlags: [],
      dateRestriction: { kind: "explicit" as const, days: ["2025-10-07", "2025-10-09"] },
      stageRestriction: { kind: "none" as const } },
    { id: "c1", name: "Doug", email: null, phone: null, role: "Lead", roleFlags: ["LEAD"],
      dateRestriction: { kind: "none" as const }, stageRestriction: { kind: "none" as const } },
  ];
  const { container } = render(
    <CrewSection data={makeShowForViewer({ crewMembers })} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />,
  );
  const rows = container.querySelectorAll('[data-testid="crew-person-row"]');
  const calvin = [...rows].find((r) => r.textContent?.includes("Calvin"))!;
  const doug = [...rows].find((r) => r.textContent?.includes("Doug"))!;
  expect(calvin.querySelector("[data-partial]")).not.toBeNull();
  expect(calvin.textContent).toContain("Oct 7 & 9 only");
  expect(doug.querySelector("[data-partial]")).toBeNull();
});
```
(`TODAY`/`SHOW_ID`/imports already exist in the file.)

- [ ] **Step 2: Run, verify fail** → FAIL (no chip).

- [ ] **Step 3: Implement**:

(a) `PersonRow.tsx` — add to the `Person` type (`:47-66`):
```ts
  /** Partial-attendance label (e.g. "Oct 7 & 9 only") → a chip + data-partial hook. */
  partial?: string;
```
Destructure `partial` where the other props are pulled from `person` (alongside `you`/`lead`/`primary`), and render the chip after the Primary chip (`:154-166`) with `data-partial` ON THE CHIP SPAN (so `querySelector("[data-partial]")` from the row wrapper finds it unambiguously — Codex plan-R1; the hook marks the chip itself, not the row):
```tsx
            {partial ? (
              <span
                data-partial="true"
                className={[CHIP_CLASS, "bg-surface-sunken text-text-subtle"].join(" ")}
              >
                {partial}
              </span>
            ) : null}
```
(No change to the `<li>` `data-*` hooks block — `data-partial` lives on the chip span.)

(b) `CrewSection.tsx` — add import:
```ts
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";
```
In the roster map (`:175-184`), compute + pass (convert the `return <div>` to a block body if needed):
```tsx
const partial = partialAttendanceLabel(member.dateRestriction, { humanize: true });
// …in person={{…}}:
...(partial ? { partial } : {}),
```

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/components/crew/sections/CrewSection.test.tsx` + `pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(crew-page): partial-attendance chip on the crew roster (BL-CREW-PARTIAL-ATTENDANCE-CHIP)`

---

## Task 4: Modal `CrewBreakdown` segment

**Files:** Modify `Step3SheetCard.tsx`, `tests/components/admin/wizard/Step3Review.test.tsx`.

- [ ] **Step 1: Write failing test** — add to `Step3Review.test.tsx` (gear-review describe):

```ts
test("crew breakdown shows partial-attendance as-parsed (BL-CREW-PARTIAL-ATTENDANCE-CHIP)", () => {
  const pr = {
    ...GEAR_PR,
    crewMembers: [
      { name: "Calvin", role: "BO", phone: null, date_restriction: { kind: "explicit", days: ["10/7", "10/9"] } },
      { name: "Kari", role: "BO", phone: null, date_restriction: { kind: "unknown_asterisk", days: null } },
      { name: "Doug", role: "Lead", phone: null, date_restriction: { kind: "none" } },
    ],
  } as unknown as ParseResult;
  const row: Step3Row = { ...GEAR_ROW, driveFileId: "drive-pa", parseResult: pr };
  const { getByTestId } = render(<Step3Review wizardSessionId={WIZARD_SESSION_ID} rows={[row]} />);
  fireEvent.click(getByTestId("wizard-step3-card-drive-pa-more"));
  const t = getByTestId("wizard-step3-card-drive-pa-breakdown-crew").textContent ?? "";
  expect(t).toContain("Doug"); // all 3 members render
  expect(t).toContain("10/7, 10/9 only"); // Calvin: explicit raw, as-parsed
  expect(t).toContain("Partial (dates TBD)"); // Kari: unknown_asterisk
  // none-member (Doug) adds NO suffix → exactly ONE "only" + ONE "Partial" across
  // the 3-member breakdown (anti-tautology — a leaked suffix on Doug fails this):
  expect((t.match(/ only/g) ?? []).length).toBe(1);
  expect((t.match(/Partial \(dates TBD\)/g) ?? []).length).toBe(1);
});
```

- [ ] **Step 2: Run, verify fail** → FAIL.

- [ ] **Step 3: Implement** — `Step3SheetCard.tsx`: add `import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";`. In `CrewBreakdown` (`:410-416`), convert the `.map((m, i) => (<li>…))` to a block body computing `partial` once, and add a segment after the phone span:
```tsx
          {shown.map((m, i) => {
            const partial = partialAttendanceLabel(m.date_restriction, { humanize: false });
            return (
              <li key={`${m.name}-${i}`} className="text-sm text-text">
                <span className="font-medium text-text-strong">{m.name || "Unnamed"}</span>
                {m.role ? <span className="text-text-subtle"> · {m.role}</span> : null}
                {hasContent(m.phone) ? <span className="text-text-subtle"> · {m.phone}</span> : null}
                {partial ? <span className="text-text-subtle"> · {partial}</span> : null}
              </li>
            );
          })}
```

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx` + `pnpm typecheck`.

- [ ] **Step 5: Commit** — `feat(admin): partial-attendance in Step-3 crew breakdown (BL-CREW-PARTIAL-ATTENDANCE-CHIP)`

---

## Task 5: DESIGN.md + full verification

- [ ] **Step 1: DESIGN.md** — in the Crew section / `PersonRow` chip inventory, add a short note: a partial-attendance chip (`data-partial`) in the `PersonRow` chip family (alongside You/Lead/Primary), neutral `bg-surface-sunken text-text-subtle` tone, label from `partialAttendanceLabel` ("Oct 7 & 9 only" / "Partial (dates TBD)"); the Step-3 modal shows the same as a raw as-parsed `· …` segment.

- [ ] **Step 2: Full suites + lint/format (blocking)**

```bash
pnpm vitest run tests/dates tests/crew tests/components/crew tests/components/admin tests/components/step3SheetCard.test.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts
pnpm typecheck
pnpm exec eslint lib/crew/partialAttendance.ts lib/dates/humanize.ts components/crew/primitives/PersonRow.tsx components/crew/sections/CrewSection.tsx components/admin/wizard/Step3SheetCard.tsx
pnpm exec prettier --check .
git diff --check origin/main...HEAD
```
Expected: all PASS / clean. `_metaSentinelHidingContract` unaffected (the chip is a derived label, not a raw optional field).

- [ ] **Step 3: Commit** — `docs(design): partial-attendance chip in the PersonRow chip family (BL-CREW-PARTIAL-ATTENDANCE-CHIP)`

---

## Task 6: Impeccable v3 dual-gate (invariant 8)

- [ ] **Step 1:** detector — `npx impeccable --json components/crew/primitives/PersonRow.tsx components/crew/sections/CrewSection.tsx components/admin/wizard/Step3SheetCard.tsx`.
- [ ] **Step 2:** `/impeccable critique` + `/impeccable audit` (isolated fresh subagents — external attestation) on the diff. Focus: the chip tone/label (uppercase `CHIP_CLASS` on a date string), copy ("Partial (dates TBD)"), whether the crew chip vs modal-segment treatment is coherent.
- [ ] **Step 3:** Fix HIGH/CRITICAL or defer (`DEFERRED.md`); record dispositions in the PR description; re-run touched tests after any fix.

---

## Task 7: Close-out — whole-diff review → CI → merge

- [ ] **Step 1:** Sync `origin/main` (merge in if moved; re-verify the merged tree with the full crew+admin suite). Whole-diff cross-model review via `codex exec` (do-not-relitigate: chip not viewer-gated; modal shows raw M/D as-parsed; both surfaces). Iterate to APPROVE.
- [ ] **Step 2:** Push; `gh pr create` (body = impeccable dispositions). The crew roster IS captured by screenshots-drift — if `crew-preview-*`/`needs-attention-*` webps drift (a fixture member with a restriction), regen from the CI `drifted-screenshots` artifact (pinned amd64); otherwise none.
- [ ] **Step 3:** Confirm REAL CI green; re-run flakes with `gh run rerun --failed`.
- [ ] **Step 4:** `gh pr merge <PR#> --merge`.
- [ ] **Step 5:** FF local main; verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- [ ] **Step 6:** Mark `BL-CREW-PARTIAL-ATTENDANCE-CHIP` ✅ RESOLVED — PR #<n> in `BACKLOG.md` (chore PR). This is the LAST of the 4 INFO-audit render items — note the cluster complete.

---

## Self-Review

- **Spec coverage:** humanizeDayList→T1; partialAttendanceLabel→T2; crew roster chip→T3; modal segment→T4; DESIGN+verify→T5; impeccable→T6; close-out→T7. ✓
- **Dimensional invariants / Transition inventory:** N/A (chip in the existing PersonRow flex-wrap row + inline modal span) — per spec. ✓
- **Anti-tautology:** humanizeDayList asserts the non-contiguous-collapse failure mode + all-malformed→null; partialAttendanceLabel covers all kinds + all-blank/all-malformed→null; CrewSection test scopes per-row + asserts the none-member has NO chip; modal test scopes to the crew breakdown testId + covers explicit-raw + unknown_asterisk + none. Expected labels derived from the input days. ✓
- **Type/name consistency:** `partialAttendanceLabel`, `humanizeDayList`, `partial` prop, `data-partial`, `{humanize}` — consistent across tasks; crew uses `dateRestriction` (camelCase/ISO), modal uses `date_restriction` (snake_case/raw). ✓
- **No placeholders / guards:** every step has real code; guards (none/unknown_asterisk/empty/blank/malformed/null) tested. ✓
