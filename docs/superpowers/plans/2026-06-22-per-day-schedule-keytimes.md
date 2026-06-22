# Per-Day Schedule & Key-Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the per-show-day schedule/run-of-show that lives in the DATES TIME column (dropped today), compose the Set key-time date, and reshape Key Times to carry per-day Show anchors — fixing all three audited gaps across every v4 show.

**Architecture:** A new `parseScheduleTimes` tokenizer extracts per-day `ScheduleDay` ({entries, showStart, window}) from the DATES SHOW DAY TIME column; `lib/parser/index.ts` merges it with the existing AGENDA-grid into ONE date-gated `runOfShow: Record<iso, ScheduleDay>` (jsonb value reshape, no migration). `resolveKeyTimes` gains a per-day `shows[]` anchor list (decision-table resolved, date-restriction gated, date-safe room fallback) and a composed Set date; the schedule/today/right-now surfaces render it. Backward-compatible decode + a forced re-sync release gate + a downgrade converter make deploy/rollback safe.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase (Postgres jsonb), Vitest (+ jsdom for components), Playwright (real-browser layout), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-22-per-day-schedule-keytimes-design.md` (APPROVED — 13 adversarial rounds, 19 findings fixed). Section refs below (§N) point there.

## Global Constraints

- **TDD per task; commit per task** (conventional-commits: `feat|fix|test|refactor|docs|chore(scope): …`). Never implementation before its test.
- **Vitest** runner; component tests use `@vitest-environment jsdom` + `@testing-library/jest-dom/vitest` (jest-dom is `globals:false`). Single test: `pnpm vitest run <path> -t '<name>'`.
- **Pinned interface contract** (every task uses these verbatim): `ScheduleDay = {entries: AgendaEntry[]; showStart: string|null; window: {start:string;end:string}|null}`; `RunOfShow = Record<string, ScheduleDay>`; `ShowAnchor = {date:string; label:string; time:string}`; `KeyTimeAnchors = {set?: string; shows?: ShowAnchor[]; strike?: string}`; `resolveKeyTimes(show, rooms, runOfShow, dateRestriction)`; `buildRightNowContext({…, rooms, runOfShow})` → `RightNowContext` gains `showAnchors`; `parseScheduleTimes(markdown, dates) → {scheduleDays, warnings}`; `decodeRunOfShow(raw) → {value: RunOfShow|null, corrupt}` (legacy-array tolerant); `extractClockTimes(raw)` colon-required; `dates.setupTime?: string|null`; new `SCHEDULE_TIME_UNPARSED` warning.
- **Per-day Show ANCHOR DECISION TABLE** (resolveKeyTimes, per visible day D; `unknown_asterisk`→`{}` first): 1 showStart → 2 window.start → 3 entries[0].start → 4 (absent/null & RAW showDays.length===1) room show_time → 5 (absent/null & M/D(room show_time)===D) room show_time → 6 OMIT.
- **Privacy:** `visibleShowDays = showDays ∩ DateRestriction` (shared `agendaDisplay` helper); Set/Strike are show-wide for `explicit`/`none` (NOT per-day gated); the whole strip is suppressed for `unknown_asterisk`.
- **No DB migration** (jsonb value reshape). **Advisory-lock topology unchanged** (rides the single JS-wrapper holder). **No raw error codes in UI** (`SCHEDULE_TIME_UNPARSED` via the §12.4 catalog).
- **Anti-tautology + negative-regression** on every test task (assert the data source, derive expecteds from fixtures, stash-the-fix where noted).
- **UI files** (`components/**`, `app/**` non-api) are **Opus + impeccable v3 dual-gate** before milestone close.
- **Re-sync is a release gate**: `scripts/verify-resync-scheduletimes.ts` per-show/per-ISO must be green; rollback via the downgrade converter / graceful corrupt-skip (§14).

---

### Task 1: `SCHEDULE_TIME_UNPARSED` catalog + internal code enum + warning constructor

**Files:**
- Modify `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2889` (insert §12.4 table row after `AGENDA_DAY_EMPTIED`) + `:3185` (insert YAML appendix `helpfulContext` entry after `AGENDA_DAY_EMPTIED:`)
- Modify `lib/messages/__generated__/spec-codes.ts` (regenerated, do not hand-edit)
- Modify `lib/messages/catalog.ts:1141` (insert new catalog row after the `AGENDA_DAY_EMPTIED` row, before the next entry)
- Create constructor `scheduleTimeUnparsed(index, iso)` in `lib/parser/blocks/agendaWarnings.ts:44` (append after `agendaDayEmptied`, mirroring the existing constructors)
- Modify `lib/messages/__generated__/internal-code-enums.ts` (regenerated via `pnpm gen:internal-code-enums` — auto-picks up the new `code:` literal in the constructor file)
- Test: `tests/cross-cutting/codes.test.ts` (x1 parity, existing — must still pass with the new code), new `tests/parser/blocks/agendaWarnings.test.ts` (constructor shape)

**Interfaces:**
- **Consumes:** `ParseWarning` (`lib/parser/types.ts:1-7`: `{ severity: "info"|"warn"; code: string; message: string; blockRef?: {kind:string;index?:number}; rawSnippet? }`)
- **Produces:** `scheduleTimeUnparsed(index: number, iso: string): ParseWarning` (new `ParseWarning` code `SCHEDULE_TIME_UNPARSED`); new catalog row `SCHEDULE_TIME_UNPARSED` in `MESSAGE_CATALOG`; new `SPEC_CODES.SCHEDULE_TIME_UNPARSED`; new `INTERNAL_CODE_ENUMS.SCHEDULE_TIME_UNPARSED` (source `"parse_warnings.code"`)

TDD steps:

- [ ] Write the failing constructor test in `tests/parser/blocks/agendaWarnings.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { scheduleTimeUnparsed } from "@/lib/parser/blocks/agendaWarnings";

describe("scheduleTimeUnparsed warning constructor", () => {
  // _Catches:_ a constructor that emits the wrong code/severity/blockRef, or
  // that omits the ISO from the message (operators must see WHICH day failed).
  it("returns a SCHEDULE_TIME_UNPARSED warn-severity ParseWarning carrying the ISO", () => {
    const w = scheduleTimeUnparsed(1, "2025-05-14");
    expect(w.code).toBe("SCHEDULE_TIME_UNPARSED");
    expect(w.severity).toBe("warn");
    expect(w.blockRef).toEqual({ kind: "dates", index: 1 });
    expect(w.message).toContain("2025-05-14");
  });
});
```
- [ ] Run it and confirm it fails because the export does not exist yet:
  `pnpm vitest run tests/parser/blocks/agendaWarnings.test.ts -t 'scheduleTimeUnparsed'`
  Expected: `Error: ... does not provide an export named 'scheduleTimeUnparsed'` (or a transform error) → suite RED.
- [ ] Add the constructor to `lib/parser/blocks/agendaWarnings.ts` (append after `agendaDayEmptied`, mirror its JSDoc + shape). Use `kind: "dates"` because the cell originates in the DATES block, and embed the ISO so the sync-log surface names the failing day:
```ts
/**
 * Emitted by §04 parseScheduleTimes when a SHOW DAY TIME cell is non-empty AND
 * non-sentinel yet yields zero usable fields (no showStart, no window, no
 * entries) — the end-only/unknown-start case ("GS: ... - 6:00 PM") and the
 * no-clock-contentful case ("General Session TBD"). Defined here so its code:
 * literal lives in lib/parser for the internal-code-enums extractor (matches
 * agendaDayEmptied's rationale).
 */
export function scheduleTimeUnparsed(index: number, iso: string): ParseWarning {
  return {
    severity: "warn",
    code: "SCHEDULE_TIME_UNPARSED",
    message: `SHOW DAY ${iso} TIME cell has content but yielded no usable schedule time; falling back to anchors`,
    blockRef: { kind: "dates", index },
  };
}
```
- [ ] Re-run the constructor test and confirm GREEN:
  `pnpm vitest run tests/parser/blocks/agendaWarnings.test.ts -t 'scheduleTimeUnparsed'`
  Expected: `1 passed`.
- [ ] Add the §12.4 table row in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` immediately after line 2889 (the `AGENDA_DAY_EMPTIED` row), matching the 5-cell format `| code | description | dougFacing | crewFacing | followUp |`:
```
| `SCHEDULE_TIME_UNPARSED` | a SHOW DAY's TIME column has content but no readable call time / window / agenda (e.g. an end-only "GS: ... - 6:00 PM" or "General Session TBD"); that day falls back to anchors | "A show-day TIME entry in _<sheet-name>_'s DATES tab has text we couldn't read as a start time, window, or agenda, so that day shows the standard anchor schedule. Check the TIME cell reads like '7:15am - Registration …' or '7:30am - 5:50pm', or tell the developer if it keeps happening." | — | Doug → check sheet |
```
- [ ] Add the YAML appendix `helpfulContext` entry in the same spec file immediately after line 3185 (the `AGENDA_DAY_EMPTIED:` appendix line), inside the existing `\`\`\`yaml` block:
```yaml
SCHEDULE_TIME_UNPARSED: "Each show day's TIME column in the DATES tab is parsed for a first call time, a start–end window, or a titled run-of-show. When a cell has content but none of those can be read — an end-only fragment like 'GS: ... - 6:00 PM', or a placeholder like 'General Session TBD' — we store no per-day time for that day and it falls back to the always-correct anchor schedule. Restoring a readable start (e.g. '7:15am - Registration') re-publishes the per-day time on the next sync."
```
- [ ] Regenerate the spec-codes manifest (extracts both the table row and the YAML appendix into `SPEC_CODES`):
  `pnpm gen:spec-codes`
  Expected: `lib/messages/__generated__/spec-codes.ts` now contains a `SCHEDULE_TIME_UNPARSED` entry with the `dougFacing` / `helpfulContext` strings above; `git diff --stat lib/messages/__generated__/spec-codes.ts` shows the file changed.
- [ ] Add the matching runtime catalog row in `lib/messages/catalog.ts` immediately after the `AGENDA_DAY_EMPTIED` entry (closes at `:1142`), copying the §12.4 `dougFacing`/`helpfulContext` verbatim so x1 deep-compare passes:
```ts
  SCHEDULE_TIME_UNPARSED: {
    code: "SCHEDULE_TIME_UNPARSED",
    dougFacing:
      "A show-day TIME entry in _<sheet-name>_'s DATES tab has text we couldn't read as a start time, window, or agenda, so that day shows the standard anchor schedule. Check the TIME cell reads like '7:15am - Registration …' or '7:30am - 5:50pm', or tell the developer if it keeps happening.",
    crewFacing: null,
    followUp: "Doug → check sheet",
    helpfulContext:
      "Each show day's TIME column in the DATES tab is parsed for a first call time, a start–end window, or a titled run-of-show. When a cell has content but none of those can be read — an end-only fragment like 'GS: ... - 6:00 PM', or a placeholder like 'General Session TBD' — we store no per-day time for that day and it falls back to the always-correct anchor schedule. Restoring a readable start (e.g. '7:15am - Registration') re-publishes the per-day time on the next sync.",
    title: "Show-day time unreadable",
    longExplanation:
      "A show day's DATES TIME cell has content but no readable start time, window, or agenda, so that day reverts to the standard anchor schedule. Give the cell a readable start time to re-publish it.",
    helpHref: "/help/errors#SCHEDULE_TIME_UNPARSED",
  },
```
- [ ] Regenerate the internal-code-enums manifest (auto-detects the new `code:` literal inside the `ParseWarning`/`warnings`-matching `agendaWarnings.ts`):
  `pnpm gen:internal-code-enums`
  Expected: `lib/messages/__generated__/internal-code-enums.ts` gains `SCHEDULE_TIME_UNPARSED` with `source` containing `"parse_warnings.code"`.
- [ ] Run the x1 catalog-parity gate and confirm GREEN (proves the three layers — spec table, YAML appendix→`spec-codes.ts`, `catalog.ts` — are in lockstep):
  `pnpm test:audit:x1-catalog-parity`
  Expected: `tests/cross-cutting/codes.test.ts` passes; `Object.keys(MESSAGE_CATALOG)` ⊇ `SCHEDULE_TIME_UNPARSED`, deep-match of `dougFacing`/`crewFacing`/`followUp`/`helpfulContext` all pass.
- [ ] Negative-regression — prove x1 actually pins the lockstep: temporarily edit the `catalog.ts` `SCHEDULE_TIME_UNPARSED.helpfulContext` to append `" XXX"`, re-run `pnpm test:audit:x1-catalog-parity`, confirm it FAILS with `catalog SCHEDULE_TIME_UNPARSED.helpfulContext differs from §12.4`, then revert the edit and confirm GREEN again.
- [ ] Run the x2 no-raw-codes gate to confirm the new internal code is registered and not raw-rendered:
  `pnpm test:audit:x2-no-raw-codes`
  Expected: `tests/cross-cutting/no-raw-codes.test.ts` passes; `INTERNAL_CODE_ENUMS` equals the freshly-extracted manifest (now including `SCHEDULE_TIME_UNPARSED`).
- [ ] **Phase-1 design amendment — VERIFY (already applied during spec ratification, commit `0bb1ecc4`; plan-review R2 finding 1).** The spec §9 amendment to `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md` (lines ~138 + ~428 — overturning "sheets store one show-wide value" / "Per-day call times … out of scope") is ALREADY in the branch. Confirm it is present (no re-edit needed): `rg -n "Amendment \(2026-06-22|Superseded 2026-06-22" docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-15-crew-page-redesign-phase1-design.md` returns the §4.4-area amendment AND the out-of-scope `~~strikethrough~~` line. If (and only if) a rebase dropped it, re-apply per spec §9 and commit separately as `docs(spec): amend Phase-1 one-value premise`.
- [ ] Commit:
  `git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts lib/parser/blocks/agendaWarnings.ts lib/messages/__generated__/internal-code-enums.ts tests/parser/blocks/agendaWarnings.test.ts`
  `git commit -m "feat(parser): add SCHEDULE_TIME_UNPARSED warning code + §12.4 catalog lockstep"`

---

### Task 2: `ScheduleDay`/`ShowAnchor` types + `parseScheduleTimes` clock-boundary tokenizer

**Files:**
- Modify `lib/parser/types.ts:94-100` (add `setupTime` is Task 3; here add `ScheduleDay`, `ShowAnchor`, and retype `ParsedSheet.runOfShow` `:347` + `ParseResult.runOfShow` `:373` from `Record<string, AgendaEntry[]>` to `RunOfShow`)
- Create `lib/parser/blocks/scheduleTimes.ts`
- Test: new `tests/parser/blocks/scheduleTimes.test.ts`

**Interfaces:**
- **Consumes:** `AgendaEntry` (`lib/parser/types.ts:320-327`: required `start`+`title`, optional `finish`/`trt`/`room`/`av`); `ParseWarning` (`lib/parser/types.ts:1-7`); `shouldHideGenericOptional` (`lib/visibility/emptyState.ts`); `scheduleTimeUnparsed` (Task 1); `ShowRow['dates']` (`lib/parser/types.ts:94`)
- **Produces:**
```ts
export type ScheduleDay = { entries: AgendaEntry[]; showStart: string | null; window: { start: string; end: string } | null };
export type RunOfShow = Record<string, ScheduleDay>;   // keyed ISO 'YYYY-MM-DD'
export type ShowAnchor = { date: string; label: string; time: string };
export function parseScheduleTimes(markdown: string, dates: ShowRow['dates']): { scheduleDays: RunOfShow; warnings: ParseWarning[] };
```

TDD steps:

- [ ] Add the type declarations to `lib/parser/types.ts` (near `AgendaEntry`, before the `ParsedSheet` block) and retype the two `runOfShow?` fields:
```ts
export type ScheduleDay = {
  entries: AgendaEntry[];                          // titled run-of-show (may be [])
  showStart: string | null;                        // per-day first-call anchor
  window: { start: string; end: string } | null;   // bare-window days only
};
export type RunOfShow = Record<string, ScheduleDay>; // keyed by ISO 'YYYY-MM-DD'
export type ShowAnchor = { date: string; label: string; time: string }; // date = ISO
```
  and change `runOfShow?: Record<string, AgendaEntry[]>;` → `runOfShow?: RunOfShow;` at both `ParsedSheet` (`:347`) and `ParseResult` (`:373`).
- [ ] Confirm the project still type-checks after the retype (downstream consumers are fixed in later tasks; this step only proves the type module itself is valid):
  `pnpm tsc --noEmit -p tsconfig.json 2>&1 | head -30`
  Expected: only EXPECTED downstream errors in `enrichWithDrivePins.ts`/`applyParseResult.ts`/`decodeRunOfShow.ts` (retype propagation, handled in their tasks) — note them; the `types.ts` declarations themselves must produce no error.
- [ ] Write the failing tokenizer test in `tests/parser/blocks/scheduleTimes.test.ts`. Derive every expectation from the fixture cell text (no hardcoded magic times unrelated to the input). The `datesTable` helper mirrors `tests/parser/blocks/dates.test.ts:306-312` (5-col DATES table) so the `dates` arg gets real `showDays` ISO keys:
```ts
import { describe, it, expect } from "vitest";
import { parseScheduleTimes } from "@/lib/parser/blocks/scheduleTimes";
import { parseDates } from "@/lib/parser/blocks/dates";

function datesTable(rows: Array<[string, string, string, string]>): string {
  const header = "| DATES | | | | |\n| --- | --- | --- | --- | --- |";
  const body = rows.map(([l, d, dt, t]) => `| | ${l} | ${d} | ${dt} | ${t} |`).join("\n");
  return `${header}\n${body}\n`;
}
function run(rows: Array<[string, string, string, string]>) {
  const md = datesTable(rows);
  const dates = parseDates(md, "v4");
  return { dates, ...parseScheduleTimes(md, dates) };
}

describe("parseScheduleTimes — tokenizer", () => {
  // _Catches:_ the whole gap — SHOW DAY TIME column dropped wholesale.
  it("titled list: each clock→{start,title}; first leading clock → showStart", () => {
    const { dates, scheduleDays } = run([
      ["SHOW DAY 1", "Wed", "10/8/25", "7:15am - Registration  8:00am - Leaders Breakfast"],
    ]);
    const iso = dates.showDays[0]; // "2025-10-08"
    expect(scheduleDays[iso].showStart).toBe("7:15AM");
    expect(scheduleDays[iso].window).toBeNull();
    expect(scheduleDays[iso].entries.map((e) => [e.start, e.title])).toEqual([
      ["7:15AM", "Registration"],
      ["8:00AM", "Leaders Breakfast"],
    ]);
  });

  it("bare window: 2 title-less tokens + separator → {start,end}, entries []", () => {
    const { dates, scheduleDays } = run([["SHOW DAY 1", "Tue", "4/21/26", "8:00 AM - 5:30 PM"]]);
    const iso = dates.showDays[0];
    expect(scheduleDays[iso].window).toEqual({ start: "8:00 AM", end: "5:30 PM" });
    expect(scheduleDays[iso].entries).toEqual([]);
    expect(scheduleDays[iso].showStart).toBeNull();
  });

  it("leading-start fragment 'GS: 8:00 AM -' → showStart, no window/entries", () => {
    const { dates, scheduleDays, warnings } = run([
      ["SHOW DAY 1", "Tue", "5/13/25", "GS: 8:00 AM -"],
    ]);
    const iso = dates.showDays[0];
    expect(scheduleDays[iso].showStart).toBe("8:00 AM");
    expect(scheduleDays[iso].window).toBeNull();
    expect(scheduleDays[iso].entries).toEqual([]);
    expect(warnings.map((w) => w.code)).not.toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("end-only fragment 'GS: ... - 6:00 PM' → NO ScheduleDay + SCHEDULE_TIME_UNPARSED", () => {
    const { dates, scheduleDays, warnings } = run([
      ["SHOW DAY 1", "Wed", "5/14/25", "GS: ... - 6:00 PM"],
    ]);
    const iso = dates.showDays[0];
    expect(scheduleDays[iso]).toBeUndefined(); // not persisted: no usable field
    expect(warnings.map((w) => w.code)).toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("terminal-event single token '4:15pm - Meeting Concludes' → entry kept, showStart null, NO warning", () => {
    const { dates, scheduleDays, warnings } = run([
      ["SHOW DAY 1", "Thu", "10/9/25", "4:15pm - Meeting Concludes"],
    ]);
    const iso = dates.showDays[0];
    expect(scheduleDays[iso].entries).toEqual([{ start: "4:15PM", title: "Meeting Concludes" }]);
    expect(scheduleDays[iso].showStart).toBeNull();
    expect(warnings.map((w) => w.code)).not.toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("non-terminal single token '8:45am - General Session' → showStart promoted", () => {
    const { dates, scheduleDays } = run([["SHOW DAY 1", "Wed", "10/8/25", "8:45am - General Session"]]);
    expect(scheduleDays[dates.showDays[0]].showStart).toBe("8:45AM");
  });

  it("no-clock contentful cell 'General Session TBD' → no ScheduleDay + SCHEDULE_TIME_UNPARSED", () => {
    const { dates, scheduleDays, warnings } = run([["SHOW DAY 1", "Wed", "10/8/25", "General Session TBD"]]);
    expect(scheduleDays[dates.showDays[0]]).toBeUndefined();
    expect(warnings.map((w) => w.code)).toContain("SCHEDULE_TIME_UNPARSED");
  });

  it("bare sentinel 'TBD' → nothing emitted, NO warning (intentional absence)", () => {
    const { dates, scheduleDays, warnings } = run([["SHOW DAY 1", "Wed", "10/8/25", "TBD"]]);
    expect(scheduleDays[dates.showDays[0]]).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("variants: 4pm (no colon), 5;30pm (semicolon), AM/PM casing all tokenize", () => {
    const { dates, scheduleDays } = run([["SHOW DAY 1", "Wed", "10/8/25", "4pm - Doors  5;30pm - Dinner"]]);
    const iso = dates.showDays[0];
    expect(scheduleDays[iso].entries.map((e) => e.start)).toEqual(["4PM", "5:30PM"]);
    expect(scheduleDays[iso].showStart).toBe("4PM");
  });
});
```
- [ ] Run it and confirm RED (module does not exist):
  `pnpm vitest run tests/parser/blocks/scheduleTimes.test.ts`
  Expected: `Failed to resolve import "@/lib/parser/blocks/scheduleTimes"` → all tests fail to collect.
- [ ] Create `lib/parser/blocks/scheduleTimes.ts` with the clock-boundary tokenizer. The clock regex is the PERMISSIVE show-day form (no-colon/semicolon allowed) — deliberately distinct from the SET-row colon-required `extractClockTimes` (Task 3):
```ts
import type { AgendaEntry, ParseWarning, RunOfShow, ScheduleDay, ShowRow } from "../types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { scheduleTimeUnparsed } from "./agendaWarnings";

// SHOW-DAY-ONLY permissive clock: colon OR semicolon-typo separator OR bare hour.
const CLOCK_RE = /\b(\d{1,2})(?:[:;](\d{2}))?\s*([AaPp][Mm])?\b/g;
const TERMINAL_RE = /\b(conclude|concludes|concluded|ends?|ended|adjourn|wrap|dismiss|load\s*out|strike|depart)\b/i;
const PLACEHOLDER_RE = /(\.\.\.|\bTBD\b|\bTBA\b|\bN\/A\b)/i;

type Tok = { raw: string; start: number; end: number; norm: string };

function normClock(h: string, m: string | undefined, ap: string | undefined): string {
  const mm = m ? `:${m}` : "";
  const suffix = ap ? ap.toUpperCase() : "";
  return `${parseInt(h, 10)}${mm}${suffix}`.replace(/\s+/g, " ").trim();
}

// preserve the source spacing form for windows ("8:00 AM"), so re-extract the
// substring rather than the collapsed norm. Window display wants "8:00 AM".
function tokenize(cell: string): Tok[] {
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  CLOCK_RE.lastIndex = 0;
  while ((m = CLOCK_RE.exec(cell)) !== null) {
    if (!m[2] && !m[3]) continue; // bare integer with neither minutes nor am/pm = not a clock
    toks.push({ raw: m[0], start: m.index, end: m.index + m[0].length, norm: normClock(m[1], m[2], m[3]) });
  }
  return toks;
}

function titleAfter(cell: string, from: number, to: number): string {
  return cell.slice(from, to).replace(/^\s*[-–:]?\s*/, "").replace(/\s+/g, " ").trim();
}

export function parseScheduleTimes(
  markdown: string,
  dates: ShowRow["dates"],
): { scheduleDays: RunOfShow; warnings: ParseWarning[] } {
  const scheduleDays: RunOfShow = {};
  const warnings: ParseWarning[] = [];
  const cells = readShowDayTimeCells(markdown); // [{iso, raw}] aligned to dates.showDays

  cells.forEach(({ iso, raw }, index) => {
    const cell = raw.replace(/\s+/g, " ").trim();
    if (!cell) return; // empty → nothing
    const toks = tokenize(cell);

    if (toks.length === 0) {
      // contentful but zero clocks. Bare sentinel → silent; else warn.
      if (!shouldHideGenericOptional(cell)) warnings.push(scheduleTimeUnparsed(index, iso));
      return;
    }

    // Window: exactly 2 tokens, separated only by a separator, both title-less.
    if (toks.length === 2) {
      const between = cell.slice(toks[0].end, toks[1].start);
      const tail = cell.slice(toks[1].end);
      if (/^\s*[-–]\s*$/.test(between) && tail.trim() === "" && titleAfter(cell, 0, toks[0].start) === "") {
        scheduleDays[iso] = {
          entries: [],
          showStart: null,
          window: { start: cell.slice(toks[0].start, toks[0].end).trim(), end: cell.slice(toks[1].start, toks[1].end).trim() },
        };
        return;
      }
    }

    // Titled list.
    const entries: AgendaEntry[] = [];
    toks.forEach((t, i) => {
      const next = toks[i + 1]?.start ?? cell.length;
      const title = titleAfter(cell, t.end, next);
      if (title && !shouldHideGenericOptional(title)) entries.push({ start: t.norm, title });
    });

    // showStart = first token IFF it is a LEADING START (only a short label:
    // prefix or whitespace before it) AND not preceded by a placeholder AND its
    // title is non-terminal.
    const first = toks[0];
    const lead = cell.slice(0, first.start);
    const isLeadingStart = /^(\s*[A-Za-z][\w ]*:\s*)?$/.test(lead) && !PLACEHOLDER_RE.test(lead);
    const firstTitle = titleAfter(cell, first.end, toks[1]?.start ?? cell.length);
    const showStart =
      isLeadingStart && !(toks.length === 1 && TERMINAL_RE.test(firstTitle)) ? first.norm : null;

    const day: ScheduleDay = { entries, showStart, window: null };
    if (day.entries.length === 0 && day.showStart === null && day.window === null) {
      warnings.push(scheduleTimeUnparsed(index, iso)); // contentful, zero usable → warn, drop
      return;
    }
    scheduleDays[iso] = day;
  });

  return { scheduleDays, warnings };
}
```
  Plus a `readShowDayTimeCells(markdown)` helper that walks the DATES block `SHOW DAY` rows, reads `row[4]` (the TIME column the current `parseDates` ignores at `dates.ts:223-229`), and pairs each with the normalized ISO from the same row — keying off the SAME normalization `parseDates` uses for `showDays`.
- [ ] Run the full scheduleTimes suite and confirm GREEN:
  `pnpm vitest run tests/parser/blocks/scheduleTimes.test.ts`
  Expected: `11 passed` (all tokenizer cases above).
- [ ] Negative-regression — prove the terminal-event guard is load-bearing: temporarily comment out the `TERMINAL_RE.test(firstTitle)` clause so `showStart` is set unconditionally for single tokens; re-run `pnpm vitest run tests/parser/blocks/scheduleTimes.test.ts -t 'terminal-event single token'`; confirm it FAILS (`expected null, received "4:15PM"`); then restore the clause and confirm GREEN.
- [ ] Negative-regression — prove the leading-start vs end-only distinction is pinned: temporarily change `isLeadingStart` to a constant `true`; re-run `pnpm vitest run tests/parser/blocks/scheduleTimes.test.ts -t "end-only fragment"`; confirm it FAILS (the `6:00 PM` is wrongly promoted to `showStart`, so the day is persisted and no warning fires); restore and confirm GREEN.
- [ ] Commit:
  `git add lib/parser/types.ts lib/parser/blocks/scheduleTimes.ts tests/parser/blocks/scheduleTimes.test.ts`
  `git commit -m "feat(parser): ScheduleDay/ShowAnchor types + parseScheduleTimes clock-boundary tokenizer"`

---

### Task 3: `dates.setupTime` field + `extractClockTimes` (first-match → all-matches, colon-required)

**Files:**
- Modify `lib/parser/types.ts:94-100` (add `setupTime?: string | null` to the `dates` object type)
- Modify `lib/parser/blocks/dates.ts:263-272` (rename/replace `extractClockTime` with `extractClockTimes(raw): string[]`, SAME colon-required regex), `:207-221` (set/travel_set: `loadIn = times[0]`, `setupTime = times[1] ?? null`)
- Test: `tests/parser/blocks/dates.test.ts` (preserve the existing `loadIn capture (§9 test 4)` suite; add `setupTime` cases)

**Interfaces:**
- **Consumes:** `ShowRow['dates']` (`lib/parser/types.ts:94-100`); the DATES TIME column `row[4]` (`dates.ts:211,218`)
- **Produces:** `ShowRow['dates']` GAINS `setupTime?: string | null`; new internal `extractClockTimes(raw: string): string[]` (COLON-REQUIRED regex `\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?` — ALL matches in document order; this is NOT the permissive Task-2 show-day tokenizer)

TDD steps:

- [ ] Add `setupTime?: string | null;` to the `dates` object in `lib/parser/types.ts` immediately after `loadIn` (`:99`):
```ts
    loadIn?: string | null; // free-text load-in clock time from the DATES TIME column (set/travel_set rows). §4.4
    setupTime?: string | null; // second clock in the SET-row TIME cell (e.g. "10:00PM SETUP"). §4.2 / D7
```
- [ ] Write the failing `setupTime` tests in `tests/parser/blocks/dates.test.ts`, appended inside the existing `parseDates — loadIn capture (§9 test 4)` describe block (reusing its `datesTable` helper at `:306`). Derive expectations from the cell text, not magic literals:
```ts
  it("captures setupTime as the SECOND clock in a SET-row TIME cell", () => {
    const md = datesTable([
      ["SET", "Tue", "3/23/26", "9:00PM LOAD IN 10:00PM SETUP"],
      ["SHOW DAY 1", "Wed", "3/24/26", ""],
    ]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe("9:00PM");   // first clock — unchanged precedence
    expect(d.setupTime).toBe("10:00PM"); // second clock — newly captured
  });

  it("setupTime is null when the SET-row TIME cell has only one clock", () => {
    const md = datesTable([["SET", "Tue", "3/23/26", "11:00 AM LOAD IN"]]);
    const d = parseDates(md, "v4");
    expect(d.loadIn).toBe("11:00 AM");
    expect(d.setupTime).toBeNull();
  });
```
- [ ] Add an `extractClockTimes` direct test (proves first→all and the COLON-REQUIRED constraint that prevents vague-text false capture), as a new top-level describe in the same file. `extractClockTimes` is exported for the test:
```ts
import { parseDates, extractClockTimes } from "@/lib/parser/blocks/dates";
// ...
describe("extractClockTimes — all-matches, colon-required (R12 finding 19)", () => {
  // _Catches:_ a permissive (no-colon) SET extractor silently converting vague
  // qualifiers like "AFTER 8PM" into an exact crew-facing key time.
  it("returns ALL colon-bearing clocks in document order", () => {
    expect(extractClockTimes("9:00PM - LOAD IN 10:00PM - SETUP")).toEqual(["9:00PM", "10:00PM"]);
  });
  it("returns [] for coarse no-colon text ('AFTER 8PM')", () => {
    expect(extractClockTimes("AFTER 8PM")).toEqual([]);
  });
  it("returns [] for 'LOAD IN' (no clock at all)", () => {
    expect(extractClockTimes("LOAD IN")).toEqual([]);
  });
});
```
- [ ] Run and confirm RED:
  `pnpm vitest run tests/parser/blocks/dates.test.ts -t 'setupTime'`
  Expected: failures — `d.setupTime` is `undefined` (field not populated) and `extractClockTimes` is not exported (`does not provide an export named 'extractClockTimes'`).
- [ ] Replace `extractClockTime` in `lib/parser/blocks/dates.ts:263-272` with `extractClockTimes` (export it; keep the EXACT colon-required regex, only change first-match → all-matches; preserve the AM/PM uppercasing + whitespace-collapse normalization):
```ts
/**
 * Extract ALL clock times (HH:MM with optional AM/PM) from a free-text TIME cell,
 * in document order. COLON-REQUIRED (no-colon "8PM" / semicolon "5;30pm" are
 * NOT matched here — that tolerance is exclusive to the SHOW DAY tokenizer in
 * scheduleTimes.ts, §4.2 R12 finding 19). "LOAD IN" / "AFTER 8PM" → []. §4.2.
 */
export function extractClockTimes(raw: string): string[] {
  const c = clean(raw);
  if (!c) return [];
  const matches = c.match(/\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?/g);
  if (!matches) return [];
  return matches.map((m) =>
    m.replace(/\s+/g, " ").replace(/([AaPp][Mm])$/, (s) => s.toUpperCase()).trim(),
  );
}
```
- [ ] Update the `set` + `travel_set` cases in `dates.ts:207-221` to use `extractClockTimes` and capture `setupTime`. `loadIn` precedence is UNCHANGED (`times[0]`; explicit SET overrides travel_set); `setupTime = times[1] ?? null`:
```ts
      case "travel_set": {
        const iso = presence(rawDate) ? normalizeDate(rawDate) : null;
        result.set = iso;
        if (!result.travelIn) result.travelIn = iso;
        const times = extractClockTimes(row[4] ?? "");
        if (times[0] && !result.loadIn) result.loadIn = times[0]; // travel_set fills loadIn only if unset
        if (times[1] && result.setupTime == null) result.setupTime = times[1];
        break;
      }

      case "set": {
        result.set = presence(rawDate) ? normalizeDate(rawDate) : null;
        const times = extractClockTimes(row[4] ?? "");
        if (times[0]) result.loadIn = times[0]; // explicit SET row overrides any travel_set value
        if (times[1]) result.setupTime = times[1];
        break;
      }
```
  (Initialize `result.setupTime` to `null` alongside the other `dates` defaults where `loadIn` is initialized.)
- [ ] Re-run the new setupTime + extractClockTimes tests and confirm GREEN:
  `pnpm vitest run tests/parser/blocks/dates.test.ts -t 'setupTime'` then
  `pnpm vitest run tests/parser/blocks/dates.test.ts -t 'extractClockTimes'`
  Expected: `2 passed` then `3 passed`.
- [ ] Run the FULL dates suite to confirm the existing no-false-capture contract is preserved under `extractClockTimes` (the `AFTER 8PM → null`, `LOAD IN → null`, `loadIn` precedence, and SHOW/TRAVEL-row-don't-populate cases at `:362-390` must still pass):
  `pnpm vitest run tests/parser/blocks/dates.test.ts`
  Expected: all existing `loadIn capture (§9 test 4)` cases + the new cases pass; `0 failed`.
- [ ] Negative-regression — prove the colon constraint is load-bearing: temporarily change the regex in `extractClockTimes` to `/\d{1,2}:?\d{0,2}(?:\s*[AaPp][Mm])?/g` (colon optional); re-run `pnpm vitest run tests/parser/blocks/dates.test.ts -t "coarse no-colon"` and the existing `:386 'AFTER 8PM' → null` case; confirm they FAIL (`"8PM"` wrongly captured as `loadIn`/in the array); restore the colon-required regex and confirm GREEN.
- [ ] Commit:
  `git add lib/parser/types.ts lib/parser/blocks/dates.ts tests/parser/blocks/dates.test.ts`
  `git commit -m "feat(parser): capture dates.setupTime via extractClockTimes (all-matches, colon-required)"`

---

### Task 4: Shared `agendaDisplay` helpers — `visibleShowDays`, `formatScheduleWindow`, today-anchor filter (single-sourced)

**Files:**
- Modify: `lib/crew/agendaDisplay.ts` — **FIRST rename the legacy `export type ScheduleDay = { date; phase }` at `:54` → `AggregateDay`** (and `aggregateDays(): ScheduleDay[]` at `:66` → `: AggregateDay[]`) to free the canonical `ScheduleDay` name for the NEW parser type (`lib/parser/types.ts`, Task 2) and eliminate the same-name collision before any file imports both. Then add three exports after `aggregateDays`; reuse the existing `shouldHideGenericOptional` import at `:12`.
- Modify: `components/crew/sections/ScheduleSection.tsx` — update the `ScheduleDay` import at `:55` and the `ScheduleDay[]` annotation at `:124` to `AggregateDay`; route the explicit-restriction day-list intersection (`:122-128`) through `visibleShowDays` instead of the inline `new Set(dateRestriction.days)` filter.
- Test: `tests/crew/agendaDisplay.test.ts` (new — behavioral), and extend `tests/crew/agendaDisplay-single-source.test.ts` (structural drift guard)

> **Name-collision note:** the legacy `ScheduleDay = {date, phase}` (used by `aggregateDays`, 2 files only — `agendaDisplay.ts`, `ScheduleSection.tsx`) is renamed to `AggregateDay`. The spec's canonical `ScheduleDay = {entries, showStart, window}` (Task 2, in `lib/parser/types.ts`) is the ONLY `ScheduleDay` after this task. Do this rename before Task 12 (ScheduleSection imports both type families).

**Interfaces:**
- Consumes: `ShowRow['dates']` (`lib/parser/types.ts:94-99`, gains `setupTime?` in Task 5/parser tasks — not required here), `DateRestriction` (`lib/parser/types.ts:10-13`), `ShowAnchor = { date: string; label: string; time: string }`.
- Produces (exact signatures):
  - `export function visibleShowDays(dates: Pick<ShowRow['dates'],'showDays'>, dateRestriction: DateRestriction): string[]` — `showDays ∩ restriction`; `explicit` → `showDays.filter(d => restriction.days.includes(d))` (preserves `showDays` ASC order); `none` → all `showDays`; `unknown_asterisk` → `[]`.
  - `export function formatScheduleWindow(window: { start: string; end: string } | null): string | null` — `null`/either-end-sentinel → `null`; else `` `${window.start}–${window.end}` `` (en-dash, no spaces — e.g. `'7:30am–5:50pm'`).
  - `export function todayShowAnchors(anchors: ShowAnchor[], todayIso: string): ShowAnchor[]` — `anchors.filter(a => a.date === todayIso)` (the Today filter; §5.4).

Steps:

- [ ] **Rename the legacy type first — a pure, test-GUARDED refactor (no behavior change; plan-review finding 5).** This is the recognized TDD exception for a mechanical rename: the EXISTING suite is the guard, not a new failing test. (a) Run the existing guards GREEN first: `pnpm vitest run tests/crew/agendaDisplay-single-source.test.ts tests/components/crew/sections/ScheduleSection.test.tsx` → all pass (baseline). (b) In `lib/crew/agendaDisplay.ts` rename `export type ScheduleDay` (`:54`) → `AggregateDay` and `aggregateDays(...): ScheduleDay[]` (`:66`) → `: AggregateDay[]`. In `components/crew/sections/ScheduleSection.tsx` rename the `ScheduleDay` import (`:55`) and the `(): ScheduleDay[] =>` annotation (`:124`) → `AggregateDay`. (c) Confirm no stray refs: `rg -n "\bScheduleDay\b" lib components app | rg -v "lib/parser/types"` returns ONLY new-type sites. (d) Re-run the SAME existing tests GREEN + `pnpm exec tsc --noEmit` (no errors) — proving the refactor changed no behavior. Commit: `refactor(crew): rename legacy ScheduleDay→AggregateDay to free the name for the per-day type`.
- [ ] Write the failing behavioral test `tests/crew/agendaDisplay.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import {
    visibleShowDays,
    formatScheduleWindow,
    todayShowAnchors,
  } from "@/lib/crew/agendaDisplay";

  const SHOW_DAYS = ["2025-10-08", "2025-10-09"]; // Consultants Day1/Day2, ASC

  describe("visibleShowDays (showDays ∩ DateRestriction — single source)", () => {
    it("none → all show days in showDays order", () => {
      expect(visibleShowDays({ showDays: SHOW_DAYS }, { kind: "none" })).toEqual(SHOW_DAYS);
    });
    it("explicit → only listed days, preserving showDays order (not restriction order)", () => {
      // restriction lists Day2 first; result must follow showDays ASC, not restriction order
      expect(
        visibleShowDays({ showDays: SHOW_DAYS }, { kind: "explicit", days: ["2025-10-09", "2025-10-08"] }),
      ).toEqual(SHOW_DAYS);
    });
    it("explicit → drops restriction days not in showDays (no fabricated day)", () => {
      expect(
        visibleShowDays({ showDays: SHOW_DAYS }, { kind: "explicit", days: ["2025-10-08", "2025-12-31"] }),
      ).toEqual(["2025-10-08"]);
    });
    it("unknown_asterisk → [] (whole-strip suppression upstream relies on this)", () => {
      expect(visibleShowDays({ showDays: SHOW_DAYS }, { kind: "unknown_asterisk", days: null })).toEqual([]);
    });
  });

  describe("formatScheduleWindow", () => {
    it("renders start–end with an en-dash, no surrounding spaces", () => {
      expect(formatScheduleWindow({ start: "7:30am", end: "5:50pm" })).toBe("7:30am–5:50pm");
    });
    it("null window → null", () => {
      expect(formatScheduleWindow(null)).toBeNull();
    });
    it("sentinel end (TBD) → null (no '7:30am–TBD' leak)", () => {
      expect(formatScheduleWindow({ start: "7:30am", end: "TBD" })).toBeNull();
    });
  });

  describe("todayShowAnchors (Today filter — §5.4)", () => {
    it("returns ONLY the anchor whose date === todayIso (never other show days')", () => {
      const anchors = [
        { date: "2025-10-08", label: "Day 1", time: "7:15am" },
        { date: "2025-10-09", label: "Day 2", time: "8:00am" },
      ];
      expect(todayShowAnchors(anchors, "2025-10-09")).toEqual([anchors[1]]);
    });
    it("non-show 'today' → [] (Set/Strike pass through elsewhere, not here)", () => {
      const anchors = [{ date: "2025-10-08", label: "Day 1", time: "7:15am" }];
      expect(todayShowAnchors(anchors, "2025-10-07")).toEqual([]);
    });
  });
  ```
  Concrete failure mode caught: `explicit` ordering bug (restriction-order vs showDays-order would cross-label "Day 1"/"Day 2"); a sentinel `end` leaking `'7:30am–TBD'` into a DayCard meta; the Today filter showing OTHER days' Show anchors (the D6 leak this whole helper prevents).
- [ ] Run it and confirm failure (helpers do not yet exist):
  - `pnpm vitest run tests/crew/agendaDisplay.test.ts`
  - Expected: `FAIL` — `No "visibleShowDays" export is defined on "@/lib/crew/agendaDisplay"` (and same for the other two).
- [ ] Add the three helpers to `lib/crew/agendaDisplay.ts` (after `aggregateDays`, end of file):
  ```ts
  import type { DateRestriction } from "@/lib/parser/types";

  export type ShowAnchor = { date: string; label: string; time: string };

  /**
   * §contract: visibleShowDays = show.dates.showDays ∩ DateRestriction.
   * explicit → listed days (filtered through showDays, so order = showDays ASC,
   * never restriction order); none → all showDays; unknown_asterisk → [].
   * SINGLE SOURCE — ScheduleSection's day-list intersection AND resolveKeyTimes'
   * per-day Show iteration both route here (agendaDisplay-single-source guard).
   */
  export function visibleShowDays(
    dates: Pick<ShowRow["dates"], "showDays">,
    dateRestriction: DateRestriction,
  ): string[] {
    const showDays = dates.showDays ?? [];
    if (dateRestriction.kind === "unknown_asterisk") return [];
    if (dateRestriction.kind === "explicit") {
      const allowed = new Set(dateRestriction.days);
      return showDays.filter((d) => allowed.has(d));
    }
    return [...showDays]; // none
  }

  /** §5.3 bare-window DayCard meta: '7:30am–5:50pm'. Sentinel-guarded both ends → null. */
  export function formatScheduleWindow(
    window: { start: string; end: string } | null,
  ): string | null {
    if (window == null) return null;
    if (resolveOptionalField(window.start) == null) return null;
    if (resolveOptionalField(window.end) == null) return null;
    return `${window.start}–${window.end}`;
  }

  /** §5.4 Today filter: only the Show anchor(s) whose date === today's ISO. */
  export function todayShowAnchors(anchors: ShowAnchor[], todayIso: string): ShowAnchor[] {
    return anchors.filter((a) => a.date === todayIso);
  }
  ```
  (Note: `resolveOptionalField` and `ShowRow` are already imported in this module — `:11,26`.)
- [ ] Re-run and confirm pass:
  - `pnpm vitest run tests/crew/agendaDisplay.test.ts`
  - Expected: `PASS` — 9 tests passing.
- [ ] Route `ScheduleSection.tsx:122-128` through the shared helper (remove the inline duplicate predicate). Replace the existing block:
  ```tsx
  const visibleDays =
    dateRestriction.kind === "explicit"
      ? ((): AggregateDay[] => {   // post Task-4 rename — was ScheduleDay[]
          const allowed = new Set(dateRestriction.days);
          return allDays.filter((d) => allowed.has(d.date));
        })()
      : allDays; // kind === 'none'
  ```
  with a routing that derives its allowed-set from `visibleShowDays` on the SHOW-DAY axis while keeping the full-aggregate (travel/set/show/travelOut) day list:
  ```tsx
  // visibleShowDays is the SINGLE SOURCE for the SHOW-DAY ∩ restriction set;
  // the full schedule list also shows travel/set/strike, so for explicit we
  // intersect the FULL aggregate against (restriction.days) — but the show-day
  // SUBSET of that intersection MUST equal visibleShowDays(...) (drift guard).
  const allowedShowDays = new Set(visibleShowDays(data.show.dates, dateRestriction));
  const visibleDays: AggregateDay[] =
    dateRestriction.kind === "explicit"
      ? allDays.filter(
          (d) => allowedShowDays.has(d.date) || dateRestriction.days.includes(d.date),
        )
      : allDays; // kind === 'none'
  ```
  Add the `visibleShowDays` import to the existing `from "@/lib/crew/agendaDisplay"` block at `ScheduleSection.tsx:52-56`.
- [ ] Extend the structural drift guard `tests/crew/agendaDisplay-single-source.test.ts` — add assertions that the new predicates are exported once and that ScheduleSection routes through them (no inline `new Set(dateRestriction.days)` SHOW-DAY copy). Append inside the `describe` block:
  ```ts
  it("the shared module exports the new per-day helpers (single source)", () => {
    const m = src("lib/crew/agendaDisplay.ts");
    expect(m).toMatch(/export function visibleShowDays/);
    expect(m).toMatch(/export function formatScheduleWindow/);
    expect(m).toMatch(/export function todayShowAnchors/);
  });
  it("ScheduleSection routes its show-day intersection through visibleShowDays (no inline copy)", () => {
    const s = src("components/crew/sections/ScheduleSection.tsx");
    expect(s).toMatch(/visibleShowDays\(data\.show\.dates,\s*dateRestriction\)/);
  });
  it("the legacy ScheduleDay name is gone — no ScheduleDay imported from agendaDisplay (rename complete)", () => {
    // plan-review R2 finding 3: post-rename, the ONLY ScheduleDay is the parser-types value type.
    const s = src("components/crew/sections/ScheduleSection.tsx");
    expect(s).not.toMatch(/import[^;]*\bScheduleDay\b[^;]*from\s+["']@\/lib\/crew\/agendaDisplay["']/);
    expect(src("lib/crew/agendaDisplay.ts")).not.toMatch(/export type ScheduleDay\b/);
  });
  ```
  Failure mode caught: a future edit re-inlining the show-day intersection in ScheduleSection (or resolveKeyTimes) would let the Today/Schedule visible-day sets drift apart — the exact privacy-contract drift this meta-test exists to prevent; and an incomplete rename re-introducing the `ScheduleDay` name collision.
- [ ] Run both test files and confirm pass:
  - `pnpm vitest run tests/crew/agendaDisplay.test.ts tests/crew/agendaDisplay-single-source.test.ts`
  - Expected: `PASS` — both suites green.
- [ ] Commit: `feat(crew): add visibleShowDays/formatScheduleWindow/todayShowAnchors shared helpers; route ScheduleSection day-list through visibleShowDays`

---

### Task 5: Parser-side D2 merge in `lib/parser/index.ts` — one `runOfShow: Record<iso, ScheduleDay>` (grid wins per titled day, DATES col fills the rest)

**Files:**
- Modify: `lib/parser/index.ts:368-369` (call `parseScheduleTimes` after `parseAgenda`, merge its warnings) and `:425` (merge grid + DATES into one `runOfShow` ScheduleDay map for the `ParsedSheet` return)
- Modify: `lib/parser/types.ts:348,374` (retype `ParsedSheet.runOfShow` and `ParseResult.runOfShow` to `Record<string, ScheduleDay>`)
- Test: `tests/parser/parseSheet.test.ts` (extend the existing `describe("parseSheet — runOfShow wiring (Phase 2)")` at `:184`); `tests/parser/parseAgenda.test.ts` (encode D2 merge precedence)

**Interfaces:**
- Consumes:
  - `parseAgenda(markdown, dates): ParseAgendaResult` (`lib/parser/blocks/agenda.ts:11-14`) → `.runOfShow: Record<iso, AgendaEntry[]> | undefined`, `.warnings: ParseWarning[]`.
  - `parseScheduleTimes(markdown: string, dates: ShowRow['dates']): { scheduleDays: RunOfShow; warnings: ParseWarning[] }` (new module from the parser task; `scheduleDays` keyed by the same normalized ISO `parseDates` produces).
- Produces:
  - `ParsedSheet.runOfShow?: Record<string, ScheduleDay>` where `ScheduleDay = { entries: AgendaEntry[]; showStart: string | null; window: { start: string; end: string } | null }`. A grid day with ≥1 titled entry lifts to `{ entries: gridEntries, showStart: gridEntries[0].start, window: null }`; otherwise the DATES-column `ScheduleDay` is used; `undefined` only when the grid was unlocatable AND `parseScheduleTimes` produced no days.
  - `agg.warnings` gains `...scheduleTimesResult.warnings` (mirrors `agg.warnings.push(...agendaResult.warnings)` at `:369`).

Steps:

- [ ] Write the failing merge-precedence test in `tests/parser/parseAgenda.test.ts` (or a sibling `parseSheet` precedence block — keep it at `parseSheet` level so it exercises the `index.ts` merge, not `parseAgenda` alone). Add to `tests/parser/parseSheet.test.ts` inside the Phase-2 describe at `:184`:
  ```ts
  it("D2 merge: grid-titled day keeps grid entries; DATES-only day recovered as ScheduleDay (one merged runOfShow)", () => {
    // East Coast has a populated AGENDA grid (2024-05-15 titled). Use it as the
    // 'grid wins' anchor; assert the merged value is a ScheduleDay, not a bare array.
    const md = readFileSync(`${dir}/2024-05-east-coast-production.md`, "utf8");
    const r = parseSheet(md, "east-coast.md");
    expect(r.runOfShow).toBeDefined();
    const day = r.runOfShow!["2024-05-15"]!;
    // Reshaped value — ScheduleDay, NOT AgendaEntry[]:
    expect(Array.isArray(day)).toBe(false);
    expect(day.entries[0]!.title).toBe("Family Office Only Breakfast"); // grid entries survive
    expect(day.showStart).toBe(day.entries[0]!.start); // grid lift: showStart = first entry start
    expect(day.window).toBeNull();
  });

  it("D2 merge: a bare-window DATES day (no grid entries) is recovered with window, entries:[]", () => {
    // RIA Day with a bare-window TIME cell ('7:30am - 5:50pm'); grid leaves it empty,
    // DATES col4 fills it. Derive the ISO + window ends from the fixture, not hardcoded.
    const md = readFileSync(`${dir}/2025-06-ria-west-2025.md`, "utf8");
    const r = parseSheet(md, "ria.md");
    expect(r.runOfShow).toBeDefined();
    const windowDays = Object.values(r.runOfShow!).filter((d) => d.window !== null);
    expect(windowDays.length).toBeGreaterThanOrEqual(1);
    const w = windowDays[0]!;
    expect(w.entries).toEqual([]); // bare window → no titled entries fabricated
    expect(w.window!.start).toMatch(/\d/); // a real clock, derived from the cell
    expect(w.window!.end).toMatch(/\d/);
  });
  ```
  Anti-tautology: asserts against `r.runOfShow` (the merged parser data source), not a rendered container; the grid-day `showStart === entries[0].start` invariant is derived from the entry, not a hardcoded literal; the window ends are matched against `/\d/`, derived from the fixture cell, not a hardcoded `'7:30am'`. Failure mode caught: (a) the merge clobbering grid-titled days with DATES col4, (b) DATES-only bare-window days being dropped (the pre-fix `entries.length>0`-only behavior), (c) the value still being a bare `AgendaEntry[]` instead of a `ScheduleDay`.
- [ ] Run and confirm failure (type still `Record<iso, AgendaEntry[]>`; no merge wired):
  - `pnpm vitest run tests/parser/parseSheet.test.ts -t 'D2 merge'`
  - Expected: `FAIL` — `day.entries` is `undefined` (value is still an array), and the bare-window test finds zero `window` days.
- [ ] Retype `lib/parser/types.ts:348` and `:374` from `runOfShow?: Record<string, AgendaEntry[]>;` to:
  ```ts
  // AGENDA + DATES-column run-of-show (Phase 2 / per-day-schedule). ISO date ->
  // ScheduleDay (entries + per-day showStart anchor + bare-window). undefined =
  // grid unlocatable AND no DATES-column days. Admin-only (shows_internal, R18).
  runOfShow?: Record<string, ScheduleDay>;
  ```
  on BOTH lines. (`ScheduleDay` is defined in `lib/parser/types.ts` by the data-model parser task; import/reference it as a sibling type.)
- [ ] Wire `parseScheduleTimes` + warning merge in `lib/parser/index.ts`. After `:369` (`agg.warnings.push(...agendaResult.warnings);`) add:
  ```ts
  const scheduleTimesResult = parseScheduleTimes(markdown, dates);
  agg.warnings.push(...scheduleTimesResult.warnings); // mirrors :369 — routes SCHEDULE_TIME_UNPARSED to ParsedSheet.warnings → sync log → §12.4
  ```
  Add `import { parseScheduleTimes } from "./blocks/scheduleTimes";` alongside the existing `parseAgenda` import.
- [ ] Replace the bare grid spread at `lib/parser/index.ts:425` with the D2 merge into one `Record<iso, ScheduleDay>`. Build a local `mergedRunOfShow` just before the `return` (Step 6) and spread it conditionally:
  ```ts
  // §4.3 D2 merge — runs IN THE PARSER (single carrier). grid wins per day with
  // ≥1 titled entry (lifted to ScheduleDay); else the DATES-column ScheduleDay.
  // showStart/window of a grid-lifted day come from the grid first entry / null.
  let mergedRunOfShow: Record<string, ScheduleDay> | undefined;
  const gridDays = agendaResult.runOfShow; // Record<iso, AgendaEntry[]> | undefined
  const datesDays = scheduleTimesResult.scheduleDays; // Record<iso, ScheduleDay>
  if (gridDays !== undefined || Object.keys(datesDays).length > 0) {
    const merged: Record<string, ScheduleDay> = { ...datesDays };
    for (const [iso, gridEntries] of Object.entries(gridDays ?? {})) {
      if (gridEntries.length > 0) {
        merged[iso] = {
          entries: gridEntries,
          showStart: gridEntries[0]!.start,
          window: null,
        };
      }
      // grid day present-as-[] → leave the DATES-column ScheduleDay (if any) in place
      else if (!(iso in merged)) {
        merged[iso] = { entries: [], showStart: null, window: null };
      }
    }
    mergedRunOfShow = merged;
  }
  ```
  Then change the return spread at `:425` from
  `...(agendaResult.runOfShow !== undefined ? { runOfShow: agendaResult.runOfShow } : {}),`
  to
  `...(mergedRunOfShow !== undefined ? { runOfShow: mergedRunOfShow } : {}),`.
- [ ] Run the merge tests and the existing Phase-2 wiring tests; confirm pass (and that the existing `:188-202` assertions, which read `.title`/`.start`, are updated to `.entries[0].title`/`.entries[0].start` — the value is now a ScheduleDay):
  - First update the legacy assertions at `tests/parser/parseSheet.test.ts:190,201,202` from `r.runOfShow!["2024-05-15"]![0]!.title` to `r.runOfShow!["2024-05-15"]!.entries[0]!.title` (and the RIA `[0]!.title`/`[0]!.start` likewise).
  - `pnpm vitest run tests/parser/parseSheet.test.ts tests/parser/parseAgenda.test.ts`
  - Expected: `PASS` — all parseSheet + parseAgenda suites green, including the new D2 merge cases and the retyped legacy wiring cases.
- [ ] Add the warning-propagation test (SCHEDULE_TIME_UNPARSED reaches `ParsedSheet.warnings`) to `tests/parser/parseSheet.test.ts`:
  ```ts
  it("SCHEDULE_TIME_UNPARSED from a 'GS: ... - 6:00 PM' end-only SHOW DAY cell reaches ParsedSheet.warnings (index.ts merge)", () => {
    // Redefining-FI SHOW DAY 2 has 'GS: ... - 6:00 PM' (end-only). The warning
    // must survive the parseScheduleTimes → agg.warnings merge, not be unit-local.
    const md = readFileSync(`${dir}/2025-05-redefining-fixed-income-private-credit.md`, "utf8");
    const r = parseSheet(md, "redefining-fi.md");
    expect(r.warnings.map((w) => w.code)).toContain("SCHEDULE_TIME_UNPARSED");
  });
  ```
  Anti-tautology / failure mode: this asserts the warning is on the `ParsedSheet.warnings` (sync-log / §12.4) path — a regression where `parseScheduleTimes` returns the warning but `index.ts` forgets the `agg.warnings.push(...)` merge would make this fail even though the `scheduleTimes` unit test still passes. Negative-regression note: stash the `agg.warnings.push(...scheduleTimesResult.warnings)` line → this test must go red while the `scheduleTimes` unit test stays green, proving it pins the merge.
- [ ] Run the warning-propagation test; confirm pass:
  - `pnpm vitest run tests/parser/parseSheet.test.ts -t 'SCHEDULE_TIME_UNPARSED'`
  - Expected: `PASS` — 1 test passing.
- [ ] Commit: `feat(parser): D2-merge grid + DATES-column run-of-show into one Record<iso,ScheduleDay> in index.ts; propagate SCHEDULE_TIME_UNPARSED`

---

### Task 6: `decodeRunOfShow` reshape — accept `ScheduleDay` object shape + legacy `AgendaEntry[]` wrap; preserve corrupt path

**Files:**
- Modify: `lib/data/decodeRunOfShow.ts:32-121` (return type → `Record<string, ScheduleDay> | null`; per-day branch accepts BOTH the new object shape and legacy arrays)
- Test: `tests/data/decodeRunOfShow.test.ts` (new ScheduleDay-shape cases + legacy-array negative-regression + old-decoder-on-ScheduleDay corrupt-skip-not-throw contract)

**Interfaces:**
- Consumes: `raw: unknown` (the schemaless `shows_internal.run_of_show` jsonb).
- Produces (exact signature): `decodeRunOfShow(raw: unknown): { value: Record<string, ScheduleDay> | null; corrupt: boolean }`.
  - New object day `{entries, showStart, window}` → validate `entries[]` via the existing per-entry gates (`:64-109`), `showStart` `string | null` sentinel-guarded, `window` `{start,end}` both non-sentinel strings else `null`.
  - Legacy array day → wrap `{ entries: <decoded array>, showStart: null, window: null }`.
  - Corrupt/partial → existing `corrupt` flag; a day that yields zero usable fields (`entries:[]` + `showStart:null` + `window:null`) is omitted from `value`.

Steps:

- [ ] Write the failing tests in `tests/data/decodeRunOfShow.test.ts` (append a new `describe`):
  ```ts
  describe("decodeRunOfShow — ScheduleDay reshape (§3.2)", () => {
    it("new object shape: entries + showStart + window decode through", () => {
      const day = { entries: [good], showStart: "7:15 AM", window: null };
      const r = decodeRunOfShow({ "2026-01-02": day });
      expect(r.corrupt).toBe(false);
      expect(r.value).toEqual({ "2026-01-02": { entries: [good], showStart: "7:15 AM", window: null } });
    });
    it("new object shape: bare-window day (entries:[], window present, showStart null) survives", () => {
      const day = { entries: [], showStart: null, window: { start: "7:30am", end: "5:50pm" } };
      const r = decodeRunOfShow({ "2026-01-02": day });
      expect(r.value!["2026-01-02"]!.window).toEqual({ start: "7:30am", end: "5:50pm" });
      expect(r.corrupt).toBe(false);
    });
    it("new object shape: sentinel showStart ('TBD') → null, not a leaked anchor", () => {
      const day = { entries: [good], showStart: "TBD", window: null };
      const r = decodeRunOfShow({ "2026-01-02": day });
      expect(r.value!["2026-01-02"]!.showStart).toBeNull();
    });
    it("new object shape: sentinel window end → window null (no '7:30am–TBD')", () => {
      const day = { entries: [], showStart: "7:30am", window: { start: "7:30am", end: "N/A" } };
      const r = decodeRunOfShow({ "2026-01-02": day });
      expect(r.value!["2026-01-02"]!.window).toBeNull();
    });
    it("new object shape: fully-empty day (no entries/showStart/window) → omitted", () => {
      const r = decodeRunOfShow({ "2026-01-02": { entries: [], showStart: null, window: null } });
      expect(r.value).toBeNull();
    });

    // NEGATIVE-REGRESSION: legacy Record<iso, AgendaEntry[]> still decodes (deploy→re-sync window)
    it("legacy array shape wraps to ScheduleDay (entries:[...], showStart:null, window:null)", () => {
      const r = decodeRunOfShow({ "2026-01-02": [good] });
      expect(r.corrupt).toBe(false);
      expect(r.value).toEqual({ "2026-01-02": { entries: [good], showStart: null, window: null } });
    });
  });
  ```
  Anti-tautology / failure mode caught: the sentinel-`showStart` and sentinel-`window`-end cases catch an unguarded passthrough that would leak `'TBD'`/`'N/A'` as a crew-facing key time; the legacy-wrap case is the explicit deploy→re-sync negative-regression (§3.2) — without it, every pre-re-sync row would decode `corrupt:true` and lose its agenda.
- [ ] Add the old-decoder-on-ScheduleDay corrupt-skip-not-throw contract test (§14 — pins the rollback blast radius). Because the production decoder is being reshaped to ACCEPT the object shape, this test asserts the **current/old** array-only behavior against a `ScheduleDay` value by inlining the old per-day predicate (the decoder currently rejects non-array day values at `:56-59`). Add to the same file, in its own describe, BEFORE editing the implementation:
  ```ts
  describe("OLD decoder shape on a ScheduleDay value → corrupt-skip, NOT throw (rollback contract §14)", () => {
    it("a ScheduleDay object under the current array-only day check is corrupt-skipped without throwing", () => {
      // Snapshot the CURRENT (pre-reshape) behavior: the array-only Layer-3 guard
      // (decodeRunOfShow.ts:56-59) treats a {entries,...} object as a non-array day →
      // dropped + corrupt:true, and MUST NOT throw. This pins graceful rollback.
      const scheduleDayValue = { "2026-01-02": { entries: [good], showStart: "7:15 AM", window: null } };
      expect(() => decodeRunOfShow(scheduleDayValue)).not.toThrow();
    });
  });
  ```
  Note for the implementer: run this assertion FIRST against the unmodified decoder (it must pass — proving the current behavior is corrupt-skip-not-throw), THEN keep it green after the reshape only by NOT regressing totality. Per spec §14, after the reshape the production decoder ACCEPTS this shape (so this exact value will no longer be corrupt under the new decoder); the contract being pinned is the **old** decoder's corrupt-skip-not-throw on the future shape — verify it against `git stash` of the implementation change, and document that the post-reshape decoder's acceptance is the forward-compat half of the same §14 contract. (Adjust the assertion to `corrupt:false` after the reshape; keep the `not.toThrow()` invariant unconditional.)
- [ ] Run and confirm the new-shape tests fail (old decoder rejects the object day at `:56-59`):
  - `pnpm vitest run tests/data/decodeRunOfShow.test.ts -t 'ScheduleDay reshape'`
  - Expected: `FAIL` — every new-object-shape case errors (`r.value` is `null`, `corrupt` is `true`) because the Layer-3 array guard drops the object day; the legacy-wrap case fails (value is `{...: [good]}`, not the wrapped `{entries:...}`).
- [ ] Reshape `lib/data/decodeRunOfShow.ts`. Change the return type at `:33` to `value: Record<string, ScheduleDay> | null;`, import `ScheduleDay` from `@/lib/parser/types`, and replace the per-day Layer-3/Layer-4 block (`:56-115`) with a shape-discriminating decoder. Factor the existing entry-validation loop into a helper and add object/array handling:
  ```ts
  // ScheduleDay-shape decode (§3.2). Returns the decoded ScheduleDay or null
  // (fully-empty → omit). Mutates `corrupt` via the closure flag.
  // ---- inside the for-loop over keys, after the ISO_DATE_RE guard ----
  let entries: AgendaEntry[];
  let showStart: string | null = null;
  let window: { start: string; end: string } | null = null;

  if (Array.isArray(dayRaw)) {
    // Legacy Record<iso, AgendaEntry[]> → wrap.
    entries = decodeEntries(dayRaw); // factored from current :63-110; sets `corrupt` on bad entries
  } else if (dayRaw !== null && typeof dayRaw === "object") {
    const day = dayRaw as Record<string, unknown>;
    // entries[]
    if (!Array.isArray(day["entries"])) {
      corrupt = true;
      continue;
    }
    entries = decodeEntries(day["entries"]);
    // showStart: string|null, sentinel-guarded
    const ss = day["showStart"];
    if (ss === null || ss === undefined) {
      showStart = null;
    } else if (typeof ss === "string") {
      showStart = shouldHideGenericOptional(ss) ? null : ss;
    } else {
      corrupt = true;
      continue;
    }
    // window: {start,end} both non-sentinel strings, else null
    const w = day["window"];
    if (w === null || w === undefined) {
      window = null;
    } else if (typeof w === "object" && !Array.isArray(w)) {
      const ws = (w as Record<string, unknown>)["start"];
      const we = (w as Record<string, unknown>)["end"];
      if (typeof ws === "string" && typeof we === "string" &&
          !shouldHideGenericOptional(ws) && !shouldHideGenericOptional(we)) {
        window = { start: ws, end: we };
      } else {
        window = null; // sentinel/partial window → drop the window, not corrupt
      }
    } else {
      corrupt = true;
      continue;
    }
  } else {
    // neither array nor object → corrupt-skip (rollback blast-radius contract, §14)
    corrupt = true;
    continue;
  }

  // Omit fully-empty days (no usable fields) — anchor-strip fallback upstream.
  if (entries.length > 0 || showStart !== null || window !== null) {
    result[key] = { entries, showStart, window };
  }
  ```
  where `decodeEntries(dayRaw: unknown[]): AgendaEntry[]` is the existing per-entry validation loop (`:63-110`) lifted to a module-private function that sets the outer `corrupt` flag (pass a setter or return `{entries, corrupt}` and OR it in).
- [ ] Run the full decode suite (new + legacy negative-regression + the prior R14 totality cases that must still hold):
  - `pnpm vitest run tests/data/decodeRunOfShow.test.ts`
  - Expected: `PASS` — all cases green, including the pre-existing R14 corrupt/totality tests (non-object top-level, non-ISO key, null entry) and the new ScheduleDay + legacy-wrap cases.
- [ ] Commit: `feat(data): decodeRunOfShow accepts ScheduleDay object shape + wraps legacy AgendaEntry[]; preserves corrupt-skip totality`

---

### Task 7: `getShowForViewer` — retype `runOfShow` to `Record<iso, ScheduleDay>`; read-time `showDays ∩ DateRestriction` holds on the new shape

**Files:**
- Modify: `lib/data/getShowForViewer.ts:187` (`ShowForViewer.runOfShow` type) and `:524-588` (the local `runOfShow` declaration + the intersection block — type only; the gating loop logic is shape-agnostic over keys)
- Test: `tests/data/getShowForViewerRunOfShow.test.ts` (extend with ScheduleDay-shape intersection + gated-field cases)

**Interfaces:**
- Consumes: stored `shows_internal.run_of_show` jsonb → `decodeRunOfShow` (Task 6) → `Record<string, ScheduleDay> | null`; the active viewer's `DateRestriction` (computed at `:564-567`).
- Produces: `ShowForViewer.runOfShow: Record<string, ScheduleDay> | null` — keys are `showDays ∩ DateRestriction` (intersection at `:562-588`); a gated-out day (and its `showStart`/`window`/`entries`) never reaches the projection.

Steps:

- [ ] Write the failing intersection-on-new-shape test. Extend `tests/data/getShowForViewerRunOfShow.test.ts` (reuse the existing `setup`/`makeChain`/`CREW`/`ADMIN` harness at `:50-119`). Add a `describe`:
  ```ts
  describe("getShowForViewer.runOfShow ScheduleDay projection (per-day-schedule)", () => {
    const sd = (start: string | null, win: { start: string; end: string } | null = null) => ({
      entries: start ? [{ start, title: "Keynote" }] : [],
      showStart: start,
      window: win,
    });

    it("ADMIN/none → both ScheduleDay days survive with showStart + window intact", async () => {
      setup({
        showDays: [d1, d2],
        showsInternal: { data: { run_of_show: { [d1]: sd("7:15 AM"), [d2]: sd(null, { start: "8:00am", end: "5:00pm" }) } }, error: null },
      });
      const r = await getShowForViewer(SHOW_ID, ADMIN);
      expect(Object.keys(r.runOfShow ?? {})).toEqual([d1, d2]);
      expect(r.runOfShow![d1]!.showStart).toBe("7:15 AM");
      expect(r.runOfShow![d2]!.window).toEqual({ start: "8:00am", end: "5:00pm" });
    });

    it("explicit Day-1-only crew viewer → Day-2 ScheduleDay (incl. its window/showStart) is GATED OUT", async () => {
      setup({
        showDays: [d1, d2],
        crew: { data: [crewRow({ kind: "explicit", days: [d1] })], error: null },
        showsInternal: { data: { run_of_show: { [d1]: sd("7:15 AM"), [d2]: sd("8:00 AM") } }, error: null },
      });
      const r = await getShowForViewer(SHOW_ID, CREW);
      expect(Object.keys(r.runOfShow ?? {})).toEqual([d1]); // Day 2 dropped at read
      expect(r.runOfShow![d1]!.showStart).toBe("7:15 AM");
    });

    it("unknown_asterisk crew viewer → runOfShow null (no ScheduleDay leaks)", async () => {
      setup({
        showDays: [d1, d2],
        crew: { data: [crewRow({ kind: "unknown_asterisk", days: null })], error: null },
        showsInternal: { data: { run_of_show: { [d1]: sd("7:15 AM"), [d2]: sd("8:00 AM") } }, error: null },
      });
      const r = await getShowForViewer(SHOW_ID, CREW);
      expect(r.runOfShow).toBeNull();
    });
  });
  ```
  Anti-tautology / failure mode caught: the Day-2-gated case asserts the WHOLE ScheduleDay (its `showStart`/`window`) is dropped, not just the key — proving the new-shape fields ride the same `showDays ∩ DateRestriction` gate and can't re-leak a per-day time to a restricted viewer. Negative-regression note: stash the `:573-579` explicit-intersection branch → the Day-1-only assertion must show `[d1, d2]`, proving the test pins the gate on the new shape.
- [ ] Run and confirm failure on type/shape grounds (the harness `e = [{start,title}]` legacy shape and the new `sd()` shape both flow through `decodeRunOfShow`; with the Task-6 decoder this passes at runtime, but the `ShowForViewer.runOfShow` declared type is still `Record<string, AgendaEntry[]>`, so `r.runOfShow![d1]!.showStart` is a TYPE error and the `.window` assertion fails to compile):
  - `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts -t 'ScheduleDay projection'`
  - Expected: `FAIL` — TypeScript error `Property 'showStart' does not exist on type 'AgendaEntry[]'` (and `'window'`), surfaced by vitest's transform.
- [ ] Retype in `lib/data/getShowForViewer.ts`:
  - `:187` — `runOfShow: Record<string, ScheduleDay> | null;` (and import `ScheduleDay` from `@/lib/parser/types`).
  - `:524` — `let runOfShow: Record<string, ScheduleDay> | null = null;`.
  - `:581` — `const gated: Record<string, ScheduleDay> = {};`.
  The intersection loop body (`:582-587`) is key-only and needs no logic change; the `decodeRunOfShow` return (Task 6) already supplies `Record<string, ScheduleDay> | null`, so the assignment at `:548` type-checks unchanged.
- [ ] Run the full `getShowForViewerRunOfShow` suite (new ScheduleDay cases + the pre-existing D-4 projection cases must all stay green):
  - `pnpm vitest run tests/data/getShowForViewerRunOfShow.test.ts`
  - Expected: `PASS` — all suites green, including the legacy `e = [{start,title}]`-shape cases (which now decode-wrap to ScheduleDay) and the new intersection/gated-field cases.
- [ ] Commit: `feat(data): retype getShowForViewer runOfShow to Record<iso,ScheduleDay>; date-restriction gate holds on the new shape`

---

### Task 8: `applyParseResult` — persist predicate `entries>0 || showStart!=null || window!=null`; `AGENDA_DAY_EMPTIED` only on fully-empty

**Files:**
- Modify: `lib/sync/applyParseResult.ts:145-169` (the confirmed-day predicate at `:153-156`, the `AGENDA_DAY_EMPTIED` reconcile at `:163-168`, and the `runOfShowToStore`/`priorRunOfShow`/`upsertShowsInternal.run_of_show` types at `:24,50,146` — all retyped to `Record<string, ScheduleDay>`)
- **Modify the PRIOR-`run_of_show` PRODUCER (closes plan-review finding 2 — apply reads prior as `ScheduleDay`, so the producer MUST decode legacy arrays first):** `lib/sync/phase2.ts:67` (retype the `applyShowSnapshot` arg `priorRunOfShow` from `Record<string, AgendaEntry[]> | null` → `RunOfShow | null`); `lib/sync/runScheduledCronSync.ts:978-980` (the live `select run_of_show` — pass the raw column through `decodeRunOfShow(raw).value` so a legacy-array row is wrapped to `ScheduleDay` before it reaches apply) and `:1200` (forward the decoded value); plus any fake/in-memory tx fixtures that construct `priorRunOfShow` (e.g. `tests/**` fakes + `lib/sync/*` test doubles — grep `priorRunOfShow`).
- Test: `tests/sync/applyParseResult*.test.ts` (extend the existing apply-core suite; or new `tests/sync/applyParseResultScheduleDay.test.ts`) + a **live-producer regression** seeding a LEGACY-ARRAY prior in stored `run_of_show`.

**Interfaces:**
- Consumes: `args.parseResult.runOfShow: Record<string, ScheduleDay> | undefined` (already merged in the parser, Task 5); `args.snapshot.priorRunOfShow: RunOfShow | null` (now decoded/wrapped by THIS task's producer step via `decodeRunOfShow`, so apply always reads `ScheduleDay`); `decodeRunOfShow` (Task 6).
- Produces: `upsertShowsInternal({ run_of_show: Record<string, ScheduleDay> | null })` — `null` only when ZERO days qualify; `AGENDA_DAY_EMPTIED` (`agendaDayEmptied(index, iso)`, `lib/parser/blocks/agendaWarnings.ts:36`) appended to `args.parseResult.warnings` only when a prior-stored day is now fully empty.

Steps:

- [ ] **Producer decode first — CONCRETE test (plan-review R1 finding 2 + R3 finding 5).** The prior `run_of_show` SELECT must be decoded (legacy array → wrapped `ScheduleDay`) before apply reads it. The wrapping BEHAVIOR is already pinned by Task 6's `decodeRunOfShow` legacy-array test; here add a concrete STRUCTURAL test that the real producer routes the SELECT through `decodeRunOfShow` (the fake `makeFakeTx` in `runOfShowConfirmedReplace.test.ts` seeds `priorRunOfShow` directly and so CANNOT exercise the real decode — hence a source-scan, the project's meta-test idiom). Create `tests/sync/priorRunOfShowDecode.test.ts`:
  ```ts
  import { readFileSync } from "node:fs";
  import { describe, expect, it } from "vitest";

  describe("prior run_of_show is decoded at the producer (R3 finding 5)", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    it("imports decodeRunOfShow", () => {
      expect(src).toMatch(/import[^;]*\bdecodeRunOfShow\b[^;]*from\s+["']@\/lib\/data\/decodeRunOfShow["']/);
    });
    it("wraps the prior run_of_show read in decodeRunOfShow(...).value (not the raw array)", () => {
      // The applyShowSnapshot prior-read region must not assign run_of_show raw.
      expect(src).toMatch(/decodeRunOfShow\(\s*[^)]*run_of_show[^)]*\)\.value/);
      // Guard against the legacy raw assignment surviving.
      expect(src).not.toMatch(/priorRunOfShow:\s*priorInternal\?\.run_of_show\s*\?\?\s*null/);
    });
  });
  ```
  Run → FAIL (producer still assigns the raw array at `:1200`). `pnpm vitest run tests/sync/priorRunOfShowDecode.test.ts`.
- [ ] Implement the producer decode: retype `lib/sync/phase2.ts:67` `priorRunOfShow` → `RunOfShow | null`; import `decodeRunOfShow`; in `lib/sync/runScheduledCronSync.ts:978-980` read into a raw local then assign `priorRunOfShow: decodeRunOfShow(priorInternal?.run_of_show ?? null).value` at `:1200`; update every fake/test-double constructing `priorRunOfShow` to the `RunOfShow` shape (grep `priorRunOfShow` — incl. `runOfShowConfirmedReplace.test.ts`'s `makeFakeTx`). Run the structural test → PASS. Commit: `fix(sync): decode prior run_of_show to ScheduleDay at the snapshot producer`.
- [ ] Behavioral confirmation (no new code): re-run Task 6's `tests/data/decodeRunOfShow.test.ts` legacy-array case (array `{ "2025-10-08": [{start,title}] }` → `{ "2025-10-08": { entries:[…], showStart:null, window:null } }`) — this IS the wrapping the producer now applies. `pnpm vitest run tests/data/decodeRunOfShow.test.ts -t 'legacy'` → green.
- [ ] Confirm `AGENDA_DAY_EMPTIED` still reconciles on the wrapped shape: with a legacy-array prior that had content for a day now fully-empty in the parse, assert the warning fires (prior read as wrapped `ScheduleDay`, `priorHadContent` checks `.entries.length||.showStart||.window`, not `.length` on an array).
- [ ] Write the failing apply-persistence test. Create `tests/sync/applyParseResultScheduleDay.test.ts` (mirror the existing apply-core harness — a stub `ApplyParseResultTx` capturing `upsertShowsInternal`'s `run_of_show` payload + the mutated `args.parseResult.warnings`):
  ```ts
  import { describe, it, expect, vi } from "vitest";
  import { applyParseResult, type ApplyParseResultArgs } from "@/lib/sync/applyParseResult";
  import type { ScheduleDay } from "@/lib/parser/types";

  const titled = (start: string): ScheduleDay => ({ entries: [{ start, title: "Keynote" }], showStart: start, window: null });
  const bareWindow: ScheduleDay = { entries: [], showStart: null, window: { start: "7:30am", end: "5:50pm" } };
  const showStartOnly: ScheduleDay = { entries: [], showStart: "8:00 AM", window: null };
  const fullyEmpty: ScheduleDay = { entries: [], showStart: null, window: null };

  function makeTx() {
    const captured: { run_of_show?: Record<string, ScheduleDay> | null } = {};
    const tx = {
      deleteCrewMembersNotIn: vi.fn(), upsertCrewMembers: vi.fn(),
      provisionAddedCrewAuth: vi.fn(), revokeRemovedCrewAuth: vi.fn(),
      replaceHotelReservations: vi.fn(), replaceRooms: vi.fn(),
      replaceTransportation: vi.fn(), replaceContacts: vi.fn(),
      upsertShowsInternal: vi.fn(async (_id: string, payload: { run_of_show: Record<string, ScheduleDay> | null }) => {
        captured.run_of_show = payload.run_of_show;
      }),
      deleteLivePendingIngestion: vi.fn(),
    };
    return { tx, captured };
  }
  // Minimal ParseResult — only fields apply dereferences; runOfShow + warnings are the focus.
  function baseArgs(runOfShow: Record<string, ScheduleDay> | undefined, prior: Record<string, ScheduleDay> | null) {
    return {
      driveFileId: "f1",
      parseResult: {
        show: { po: null, proposal: null, invoice: null, invoice_notes: null },
        crewMembers: [], hotelReservations: [], rooms: [], transportation: null,
        contacts: [], pullSheet: null,
        diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
        openingReel: null, raw_unrecognized: [], warnings: [], hardErrors: [],
        ...(runOfShow !== undefined ? { runOfShow } : {}),
      },
      snapshot: { showId: "s1", previousCrewNames: [], priorRunOfShow: prior },
    } as unknown as ApplyParseResultArgs; // tighter than `as never` so a wrong call shape still type-errors (R2 finding 4)
  }

  describe("applyParseResult — ScheduleDay persist predicate (§7)", () => {
    it("bare-window day AND showStart-only day BOTH survive storage (NOT entries.length>0)", async () => {
      const { tx, captured } = makeTx();
      await applyParseResult(tx, baseArgs({ "2025-06-25": bareWindow, "2025-06-26": showStartOnly }, null));
      expect(Object.keys(captured.run_of_show ?? {})).toEqual(["2025-06-25", "2025-06-26"]);
      expect(captured.run_of_show!["2025-06-25"]!.window).toEqual({ start: "7:30am", end: "5:50pm" });
      expect(captured.run_of_show!["2025-06-26"]!.showStart).toBe("8:00 AM");
    });

    it("fully-empty day (no entries/showStart/window) is dropped from storage", async () => {
      const { tx, captured } = makeTx();
      await applyParseResult(tx, baseArgs({ "2025-06-25": titled("7:15am"), "2025-06-26": fullyEmpty }, null));
      expect(Object.keys(captured.run_of_show ?? {})).toEqual(["2025-06-25"]);
    });

    it("ALL days fully-empty → run_of_show stored as null", async () => {
      const { tx, captured } = makeTx();
      await applyParseResult(tx, baseArgs({ "2025-06-25": fullyEmpty }, null));
      expect(captured.run_of_show).toBeNull();
    });

    it("AGENDA_DAY_EMPTIED fires ONLY when a prior-stored day becomes fully empty", async () => {
      const { tx } = makeTx();
      const args = baseArgs(
        { "2025-06-25": showStartOnly, "2025-06-26": fullyEmpty }, // 25 retains a time; 26 went empty
        { "2025-06-25": titled("7:15am"), "2025-06-26": titled("9:00am") }, // both were stored before
      );
      await applyParseResult(tx, args);
      const codes = (args as { parseResult: { warnings: { code: string; message: string }[] } }).parseResult.warnings.map((w) => w.code);
      const emptied = (args as { parseResult: { warnings: { code: string; message: string }[] } }).parseResult.warnings.filter((w) => w.code === "AGENDA_DAY_EMPTIED");
      expect(codes).toContain("AGENDA_DAY_EMPTIED");
      expect(emptied).toHaveLength(1); // only 2025-06-26 (25 retained a showStart → NOT emptied)
      expect(emptied[0]!.message).toContain("2025-06-26");
    });
  });
  ```
  Anti-tautology / failure mode caught: the first case is the core regression — under the old `entries.length>0` predicate (`:153-155`) BOTH bare-window and showStart-only days SILENTLY VANISH (the exact data this spec recovers); the `AGENDA_DAY_EMPTIED` case proves a day that lost titled entries but kept a `showStart` is NOT falsely reported emptied. Derived from fixture-shaped ScheduleDay values, no hardcoded clock literal drives the assertion logic. Negative-regression note: stash the predicate change (revert to `entries.length > 0`) → the bare-window day must vanish from `captured.run_of_show`, proving the test pins the predicate; stash the `AGENDA_DAY_EMPTIED` fully-empty condition (revert to present-as-`[]`) → the showStart-retaining `2025-06-25` would falsely emit emptied.
- [ ] Run and confirm failure:
  - `pnpm vitest run tests/sync/applyParseResultScheduleDay.test.ts`
  - Expected: `FAIL` — bare-window/showStart-only days are absent from `captured.run_of_show` (filtered out by the old `entries.length > 0`); `AGENDA_DAY_EMPTIED` count is wrong (old `entries.length === 0` condition fires on the showStart-only day too).
- [ ] Retype the apply types in `lib/sync/applyParseResult.ts`: `:24` (`priorRunOfShow?: Record<string, ScheduleDay> | null;`), `:50` (`run_of_show: Record<string, ScheduleDay> | null;` in `upsertShowsInternal`'s payload), `:146` (`let runOfShowToStore: Record<string, ScheduleDay> | null;`). Import `ScheduleDay` from `@/lib/parser/types` at `:1`.
- [ ] Replace the confirmed-day predicate (`:153-156`):
  ```ts
  const confirmed = Object.fromEntries(
    Object.entries(parsedRunOfShow).filter(
      ([, day]) => day.entries.length > 0 || day.showStart !== null || day.window !== null,
    ),
  );
  runOfShowToStore = Object.keys(confirmed).length > 0 ? confirmed : null;
  ```
- [ ] Replace the `AGENDA_DAY_EMPTIED` reconcile loop (`:163-168`) — a prior-stored day is "emptied" only when it is now FULLY empty (no entries/showStart/window), and the prior is read as a `ScheduleDay`:
  ```ts
  const prior = args.snapshot.priorRunOfShow;
  let emittedIndex = 0;
  const isFullyEmpty = (d: ScheduleDay | undefined): boolean =>
    d != null && d.entries.length === 0 && d.showStart === null && d.window === null;
  const priorHadContent = (d: ScheduleDay | undefined): boolean =>
    d != null && (d.entries.length > 0 || d.showStart !== null || d.window !== null);
  for (const [iso, day] of Object.entries(parsedRunOfShow)) {
    if (isFullyEmpty(day) && priorHadContent(prior?.[iso])) {
      args.parseResult.warnings.push(agendaDayEmptied(emittedIndex, iso));
      emittedIndex += 1;
    }
  }
  ```
  (Legacy-array prior is wrapped to `ScheduleDay` at the snapshot producer per §3.2; here it is read as `ScheduleDay`. The `agendaDayEmptied` import at `:3` is unchanged.)
- [ ] Run and confirm pass:
  - `pnpm vitest run tests/sync/applyParseResultScheduleDay.test.ts`
  - Expected: `PASS` — 4 tests passing.
- [ ] Run the existing apply suite to confirm no regression in the confirmed-only full-replace / `AGENDA_DAY_EMPTIED` contract (legacy-shape apply tests must still pass after the retype):
  - `pnpm vitest run tests/sync/`
  - Expected: `PASS` — all sync/apply suites green.
- [ ] Commit: `feat(sync): persist ScheduleDay when entries||showStart||window; AGENDA_DAY_EMPTIED only on fully-empty prior-stored day`

---

### Task 9: resolveKeyTimes reshape — signature, per-day `shows[]`, Set compose, date-safe room fallback

**Files:**
- Modify: `lib/crew/resolveKeyTimes.ts` (`KeyTimeAnchors` reshape `show?: string` → `shows?: ShowAnchor[]`; signature `+runOfShow, +dateRestriction`; `unknown_asterisk → {}`; Set compose `dates.set`+`loadIn`; per-day `shows[]` via the anchor decision table; new `formatMD` + `parseRoomShowTimeMD` helpers). Current state: `resolveKeyTimes(show, rooms)` at `:43-46`, `KeyTimeAnchors = { set?; show?; strike? }` at `:7`, `isAbsentTime` at `:16-21`, loadIn branch at `:54-56`, show/strike branches at `:62-67`.
- CONSUME (do NOT modify `agendaDisplay.ts`): import `visibleShowDays(dates, dateRestriction)` from Task 4. The legacy `{date, phase}` type is `AggregateDay` after Task 4's rename; the canonical `ScheduleDay`/`RunOfShow` come from `lib/parser/types.ts` (Task 2) — no name collision remains.
- Test: `tests/crew/resolveKeyTimes.test.ts` (extend existing; current header imports + `room()`/`dates()` factories at `:1-29`).

**Interfaces:**
- Consumes: `RunOfShow = Record<string, ScheduleDay>` where `ScheduleDay = { entries: AgendaEntry[]; showStart: string | null; window: { start: string; end: string } | null }`; `DateRestriction` (`lib/parser/types.ts:10-13`); `ShowRow['dates']` (`types.ts:94-100`, now with `setupTime?: string | null` from §4.2 task — not read here); `ProjectedRoomRow` (`resolveKeyTimes.ts:3-4`).
- Produces (VERBATIM):
  - `export type ShowAnchor = { date: string; label: string; time: string }`
  - `export type KeyTimeAnchors = { set?: string; shows?: ShowAnchor[]; strike?: string }`
  - `export function resolveKeyTimes(show: Pick<ShowRow,'dates'>, rooms: ProjectedRoomRow[] | null, runOfShow: RunOfShow | null, dateRestriction: DateRestriction): KeyTimeAnchors`
  - (no new exports in `agendaDisplay.ts` — `visibleShowDays` is Task 4's; Task 9 only imports it)

Steps:

- [ ] Write failing test 1 — **per-day distinct anchors (multi-day, decision-table rows 1/2/3)**. Append to `tests/crew/resolveKeyTimes.test.ts`. Derive expected from the fixture's `showDays`, not literals:

  ```ts
  import { resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
  import type { RunOfShow } from "@/lib/parser/types";
  const NONE = { kind: "none" } as const;

  describe("resolveKeyTimes — per-day shows[] (decision table rows 1-3)", () => {
    it("emits one ShowAnchor per visible show day, each carrying that day's own anchor", () => {
      const showDays = ["2026-10-08", "2026-10-09", "2026-10-10"];
      const runOfShow: RunOfShow = {
        "2026-10-08": { entries: [], showStart: "7:15am", window: null },                  // row 1
        "2026-10-09": { entries: [], showStart: null, window: { start: "7:30am", end: "5:50pm" } }, // row 2
        "2026-10-10": { entries: [{ start: "8:00am", title: "GS" }], showStart: null, window: null }, // row 3
      };
      const anchors = resolveKeyTimes(dates({ showDays }), null, runOfShow, NONE);
      // assert against the RETURNED anchors (data source), not a render container:
      expect(anchors.shows?.map((a) => a.date)).toEqual(showDays); // ASC, one per visible day
      expect(anchors.shows?.map((a) => a.time)).toEqual(["7:15am", "7:30am", "8:00am"]);
    });
  });
  ```
  _Catches:_ collapsing N show days into a single anchor; picking the wrong field precedence (showStart > window.start > entries[0].start).

- [ ] Write failing test 2 — **Set compose + sentinel guard + loadIn precedence + rooms-independence**:

  ```ts
  describe("resolveKeyTimes — Set compose (D3)", () => {
    it("composes dates.set (M/D) + dates.loadIn → '10/7 @ 9:00PM' with rooms null", () => {
      const a = resolveKeyTimes(dates({ set: "2026-10-07", loadIn: "9:00PM" }), null, null, NONE);
      expect(a.set).toBe("10/7 @ 9:00PM"); // composed; rooms-INDEPENDENT (rooms null)
    });
    it("loadIn precedence: dates.loadIn wins over GS room set_time even when room present", () => {
      const gs = room({ set_time: "5:00 AM" });
      const a = resolveKeyTimes(dates({ set: "2026-10-07", loadIn: "9:00PM" }), [gs], null, NONE);
      expect(a.set).toBe("10/7 @ 9:00PM"); // NOT "5:00 AM"
    });
    it("sentinel-guards the clock portion: '10/7 @ TBD' resolves absent, falls back to room set_time", () => {
      const gs = room({ set_time: "5:00 AM" });
      const a = resolveKeyTimes(dates({ set: "2026-10-07", loadIn: "TBD" }), [gs], null, NONE);
      expect(a.set).toBe("5:00 AM"); // loadIn sentinel → compose skipped → GS room fallback
    });
    it("dates.set absent → bare loadIn (no '@' compose)", () => {
      const a = resolveKeyTimes(dates({ set: null, loadIn: "9:00PM" }), null, null, NONE);
      expect(a.set).toBe("9:00PM");
    });
  });
  ```
  _Catches:_ losing the Set date (the §1 bug); compose firing on a sentinel clock (silently converting "TBD" into a fake time); regressing wp-23 loadIn-over-room precedence + rooms-independence.

- [ ] Write failing test 3 — **single-day back-compat, all-absent, legacy-wrapped, unknown_asterisk, explicit Day-1-only, date-safe fallback**:

  ```ts
  describe("resolveKeyTimes — gating + fallback (decision table rows 4-6)", () => {
    it("single show day, room show_time present → shows[0] from room (row 4, RAW count===1)", () => {
      const gs = room({ show_time: "10/8 @ 8:45am" });
      const a = resolveKeyTimes(dates({ showDays: ["2026-10-08"] }), [gs], null, NONE);
      expect(a.shows).toEqual([{ date: "2026-10-08", label: expect.any(String), time: "10/8 @ 8:45am" }]);
    });
    it("all anchors absent → {} (no set/shows/strike)", () => {
      const a = resolveKeyTimes(dates({ showDays: [] }), [], null, NONE);
      expect(a).toEqual({});
    });
    it("legacy-wrapped day (entries only, showStart null) → anchor from entries[0].start (row 3)", () => {
      const runOfShow: RunOfShow = {
        "2026-10-08": { entries: [{ start: "7:15am", title: "Registration" }], showStart: null, window: null },
      };
      const a = resolveKeyTimes(dates({ showDays: ["2026-10-08"] }), null, runOfShow, NONE);
      expect(a.shows?.[0]?.time).toBe("7:15am");
    });
    it("unknown_asterisk → {} (entire strip suppressed, even with rooms + set)", () => {
      const gs = room({ show_time: "10/8 @ 8:45am", strike_time: "10/9 @ 4:30pm" });
      const a = resolveKeyTimes(dates({ set: "2026-10-07", loadIn: "9:00PM", showDays: ["2026-10-08"] }),
        [gs], null, { kind: "unknown_asterisk", days: null });
      expect(a).toEqual({}); // no set, no shows, no strike, zero date text
    });
    it("explicit Day-1-only on a multi-day show → no Day-2 anchor via fallback; set/strike still render", () => {
      const gs = room({ set_time: "9:00 AM", show_time: "10/8 @ 8:45am", strike_time: "10/9 @ 4:30pm" });
      const a = resolveKeyTimes(
        dates({ set: "2026-10-07", loadIn: "9:00PM", showDays: ["2026-10-08", "2026-10-09"] }),
        [gs], null, { kind: "explicit", days: ["2026-10-08"] });
      expect(a.shows?.map((s) => s.date)).toEqual(["2026-10-08"]); // ONLY visible Day 1
      expect(a.set).toBe("10/7 @ 9:00PM"); // show-wide Set renders for explicit viewer
      expect(a.strike).toBe("10/9 @ 4:30pm"); // show-wide Strike renders
    });
    it("date-safe fallback: Redefining-FI Day-2 (5/14) absent from runOfShow, room dated 5/13 → NO 5/14 anchor", () => {
      const gs = room({ show_time: "5/13 @ 8:00 AM" });
      const runOfShow: RunOfShow = {
        "2026-05-13": { entries: [], showStart: "8:00 AM", window: null }, // Day 1 recovered
        // 2026-05-14 deliberately absent (contentful-unparsed end-only cell)
      };
      const a = resolveKeyTimes(dates({ showDays: ["2026-05-13", "2026-05-14"] }), [gs], runOfShow, NONE);
      const d14 = a.shows?.find((s) => s.date === "2026-05-14");
      expect(d14).toBeUndefined(); // room's 5/13 value must NOT cross-label 5/14 (row 6 OMIT)
      expect(a.shows?.find((s) => s.date === "2026-05-13")?.time).toBe("8:00 AM");
    });
    it("Day-2-only restricted viewer on RAW-multi-day (2 show days) → no 5/14 anchor (row 4 keys on RAW count, not visible)", () => {
      const gs = room({ show_time: "5/13 @ 8:00 AM" });
      const a = resolveKeyTimes(
        dates({ showDays: ["2026-05-13", "2026-05-14"] }), [gs], null,
        { kind: "explicit", days: ["2026-05-14"] });
      expect(a.shows ?? []).toEqual([]); // exactly one VISIBLE day, but RAW count===2 → row 4 N/A; 5/13≠5/14 → row 5 N/A → OMIT
    });
  });
  ```
  _Catches:_ the R10/R11 cross-day room-fallback leak (room `5/13` mislabeling `5/14`); using the post-restriction visible count instead of the RAW `showDays.length`; the pre-existing `unknown_asterisk` room-date leak; legacy-row anchor loss during the deploy→re-sync window.

- [ ] Run the new tests — expect FAIL (current 2-arg signature + `show?: string` shape). Run: `pnpm vitest run tests/crew/resolveKeyTimes.test.ts -t 'per-day shows'`
  Expected output: `FAIL` with `TypeError`/arity or `Expected: [...] Received: undefined` on `anchors.shows` (current code has no `shows` key).

- [ ] CONSUME the `visibleShowDays` helper from Task 4 — do NOT redefine it here (plan-review R2 finding 2). Task 9 does NOT modify `lib/crew/agendaDisplay.ts`. `resolveKeyTimes` imports `visibleShowDays` and uses the Task-4 semantics verbatim: `visibleShowDays(dates: Pick<ShowRow['dates'],'showDays'>, dateRestriction)`, which PRESERVES `showDays` order (no extra `.sort`). Confirm: `rg -n "export function visibleShowDays" lib/crew/agendaDisplay.ts` returns exactly ONE (Task 4's).

- [ ] Reshape `resolveKeyTimes` in `lib/crew/resolveKeyTimes.ts`. Replace `KeyTimeAnchors` (`:7`), add `ShowAnchor`, widen the signature, add `formatMD` + `parseRoomShowTimeMD`, implement the decision table. Sketch:

  ```ts
  import type { DateRestriction, RunOfShow, ShowRow } from "@/lib/parser/types";
  import { visibleShowDays } from "@/lib/crew/agendaDisplay";

  export type ShowAnchor = { date: string; label: string; time: string };
  export type KeyTimeAnchors = { set?: string; shows?: ShowAnchor[]; strike?: string };

  /** ISO 'YYYY-MM-DD' → 'M/D' (no zero-pad), matching the room show_time M/D form. */
  function formatMD(iso: string): string {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    return `${Number(m[1])}/${Number(m[2])}`;
  }
  /** Extract a leading 'M/D' from a free-text room show_time (e.g. '5/13 @ 8:00 AM'); null if none. */
  function parseRoomShowTimeMD(raw: string): string | null {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\b/.exec(raw);
    return m ? `${Number(m[1])}/${Number(m[2])}` : null;
  }

  export function resolveKeyTimes(
    show: Pick<ShowRow, "dates">,
    rooms: ProjectedRoomRow[] | null,
    runOfShow: RunOfShow | null,
    dateRestriction: DateRestriction,
  ): KeyTimeAnchors {
    // unknown_asterisk → whole strip suppressed (zero date leak). Short-circuit BEFORE the table.
    if (dateRestriction.kind === "unknown_asterisk") return {};

    const anchors: KeyTimeAnchors = {};
    const sorted = (rooms ?? []).slice().sort(compareRooms);
    const selected = sorted[0] ?? null;

    // Set (D3): compose dates.set (M/D) + loadIn when clock non-sentinel; else GS set_time.
    const loadIn = show.dates.loadIn;
    if (!isAbsentTime(loadIn)) {
      const clock = (loadIn as string).trim();
      anchors.set = show.dates.set ? `${formatMD(show.dates.set)} @ ${clock}` : clock;
    } else if (selected && !isAbsentTime(selected.set_time)) {
      anchors.set = (selected.set_time as string).trim();
    }

    // Strike: unchanged.
    if (selected && !isAbsentTime(selected.strike_time)) {
      anchors.strike = (selected.strike_time as string).trim();
    }

    // shows[] — decision table over VISIBLE show days only.
    const rawShowDayCount = (show.dates.showDays ?? []).length;
    const roomShow = selected && !isAbsentTime(selected.show_time) ? (selected.show_time as string).trim() : null;
    const roomMD = roomShow ? parseRoomShowTimeMD(roomShow) : null;
    const out: ShowAnchor[] = [];
    for (const D of visibleShowDays(show.dates, dateRestriction)) {
      const day = runOfShow?.[D] ?? null;
      let time: string | null = null;
      if (day) {
        // rows 1-3, EACH sentinel-guarded via isAbsentTime so a 'TBD'/'N/A'/'TBA'
        // candidate (incl. a legacy-wrapped entries[0].start) never becomes a
        // ShowAnchor.time — this is what makes ShowAnchor.time SOURCE-guarded
        // (R3 finding 1; it stays OUT of the render sentinel meta-test, Task 15).
        for (const cand of [day.showStart, day.window?.start, day.entries[0]?.start]) {
          if (!isAbsentTime(cand)) { time = (cand as string).trim(); break; }
        }
      }
      if (time == null && roomShow) {
        if (rawShowDayCount === 1) time = roomShow;                 // row 4 (RAW count)
        else if (roomMD != null && roomMD === formatMD(D)) time = roomShow; // row 5 (date-matched)
      }
      if (time != null) out.push({ date: D, label: labelFor(D, rawShowDayCount), time }); // row 6 = OMIT
    }
    if (out.length > 0) anchors.shows = out;

    return anchors;
  }
  ```
  (`labelFor` returns `"Show"` for a single show day and `"Day N · <Wkd M/D>"` for multi-day per §3.3 — final copy fixed here; `isAbsentTime`/`compareRooms` unchanged at `:16-31`.)

- [ ] Run all resolveKeyTimes tests — expect PASS: `pnpm vitest run tests/crew/resolveKeyTimes.test.ts`
  Expected output: `Test Files  1 passed`, all `resolveKeyTimes —` describes green. Also re-run the determinism suite (`:31`) — its 2-arg calls become 4-arg; update those existing calls to pass `null, NONE` (no behavior change for the room path).

- [ ] **Sentinel-anchor guard test (R3 finding 1 — proves ShowAnchor.time is source-guarded).** Append to `tests/crew/resolveKeyTimes.test.ts`:
  ```ts
  describe("resolveKeyTimes — ShowAnchor.time is sentinel-guarded at the source", () => {
    const NONE = { kind: "none" } as const;
    it("a sentinel showStart/window.start/entries[0].start never becomes a ShowAnchor.time; falls through", () => {
      const showDays = ["2026-10-08", "2026-10-09", "2026-10-10"];
      const runOfShow: RunOfShow = {
        "2026-10-08": { entries: [], showStart: "TBD", window: { start: "7:30am", end: "5:50pm" } }, // showStart sentinel → window.start
        "2026-10-09": { entries: [{ start: "N/A", title: "GS" }], showStart: null, window: null },    // entries[0].start sentinel → omit (no room)
        "2026-10-10": { entries: [], showStart: "TBA", window: null },                                  // all sentinel/absent → omit
      };
      const a = resolveKeyTimes(dates({ showDays }), null, runOfShow, NONE);
      // No anchor.time may equal a sentinel.
      expect((a.shows ?? []).every((s) => !/\b(TBD|TBA|N\/A)\b/i.test(s.time))).toBe(true);
      expect(a.shows?.find((s) => s.date === "2026-10-08")?.time).toBe("7:30am"); // fell through to window.start
      expect(a.shows?.some((s) => s.date === "2026-10-09")).toBe(false);          // sentinel entry → omitted
      expect(a.shows?.some((s) => s.date === "2026-10-10")).toBe(false);          // all sentinel → omitted
    });
  });
  ```
  Negative-regression: stash the per-candidate `isAbsentTime` loop back to `day.showStart ?? day.window?.start ?? day.entries[0]?.start` → the `2026-10-08` anchor wrongly becomes `"TBD"` and the every-non-sentinel assertion FAILS. Confirms the source-guard is real (and justifies omitting ShowAnchor.time from the Task-15 render meta-test).
- [ ] **Negative-regression** (date-safe guard): temporarily change `else if (roomMD != null && roomMD === formatMD(D))` to `else` (blanket fallback), re-run `pnpm vitest run tests/crew/resolveKeyTimes.test.ts -t 'date-safe'` → the `5/14`-no-anchor test MUST fail (the `5/13` room value wrongly appears on `5/14`). Revert. Confirms the test pins the leak fix, not a tautology.

- [ ] Commit: `git commit -m 'feat(crew-page): reshape resolveKeyTimes to per-day shows[] with date-safe room fallback'`

---

### Task 10: buildRightNowContext — `+runOfShow` opt, `showAnchors` carry, both callers updated

**Files:**
- Modify: `components/right-now/buildRightNowContext.ts` — opts gain `runOfShow: RunOfShow | null`; pass `(runOfShow, dateRestriction)` to `resolveKeyTimes`; `RightNowContext` gains `showAnchors: ShowAnchor[]`; keep `loadInTime`/`strikeTime` single. Current: opts at `:66-71`, `resolveKeyTimes(show, rooms)` at `:78`, `callTime = anchors.show ?? null` at `:80`, return at `:89-102`, `RightNowContext` at `:24-49`.
- Modify: `components/crew/sections/TodaySection.tsx:207-213` — add `runOfShow: data.runOfShow ?? null` to the `buildRightNowContext({...})` call (it already reads `data.runOfShow` at `:204` and `ctx.dateRestriction` at `:209`).
- Modify: `app/show/[slug]/[shareToken]/_CrewShell.tsx:207-214` — add `runOfShow: data.runOfShow ?? null` to the second `buildRightNowContext({...})` call (Footer `rightNowState` autocapture; `data.runOfShow` + `ctx.dateRestriction` already in scope at `:210`).
- Test: `tests/components/buildRightNowContext.test.ts` (extend; existing header + `room()`/`show()` factories at `:1-38`).

**Interfaces:**
- Consumes: `RunOfShow` (`lib/parser/types.ts`), `DateRestriction` (`types.ts:10-13`), reshaped `resolveKeyTimes(show, rooms, runOfShow, dateRestriction)` + `ShowAnchor` (Task 9).
- Produces (VERBATIM):
  - `buildRightNowContext(opts: { show: Pick<ShowRow,'dates'|'title'|'venue'|'event_details'>; dateRestriction: DateRestriction; hotelReservations: HotelReservationRow[]; rooms: ProjectedRoomRow[] | null; runOfShow: RunOfShow | null }): RightNowContext`
  - `RightNowContext` gains `showAnchors: ShowAnchor[]` (the dated per-day Show anchors carried through; `loadInTime`/`strikeTime` unchanged single strings).

Steps:

- [ ] Write failing test 1 — **showAnchors carried (dated per-day)**. Derive from the fixture's `showDays`:

  ```ts
  import type { RunOfShow } from "@/lib/parser/types";
  const NONE = { kind: "none" } as const;

  describe("buildRightNowContext — showAnchors carry (D6/§5.1)", () => {
    it("carries the dated per-day Show anchors from runOfShow into RightNowContext.showAnchors", () => {
      const showDays = ["2026-10-08", "2026-10-09"];
      const runOfShow: RunOfShow = {
        "2026-10-08": { entries: [], showStart: "7:15am", window: null },
        "2026-10-09": { entries: [], showStart: "8:30am", window: null },
      };
      const ctx = buildRightNowContext({
        show: show({ dates: { travelIn: null, set: null, showDays, travelOut: null } }),
        dateRestriction: NONE,
        hotelReservations: [],
        rooms: null,
        runOfShow,
      });
      // assert against the data source (runOfShow), not a rendered container:
      expect(ctx.showAnchors.map((a) => a.date)).toEqual(showDays);
      expect(ctx.showAnchors.map((a) => a.time)).toEqual(["7:15am", "8:30am"]);
    });
  });
  ```
  _Catches:_ the R2-finding-4 single-`callTime` collapse — a single string can't carry distinct Day-1/Day-2 anchors; `RightNowHero` needs the dated array to select today's anchor.

- [ ] Write failing test 2 — **unknown_asterisk → all null + empty showAnchors**:

  ```ts
  it("unknown_asterisk → loadInTime/callTime/strikeTime all null AND showAnchors empty (zero leak)", () => {
    const gs = room({ set_time: "9:00 AM", show_time: "10/8 @ 8:45am", strike_time: "10/9 @ 4:30pm" });
    const ctx = buildRightNowContext({
      show: show({ dates: { travelIn: null, set: "2026-10-07", showDays: ["2026-10-08"], travelOut: null, loadIn: "9:00PM" } }),
      dateRestriction: { kind: "unknown_asterisk", days: null },
      hotelReservations: [],
      rooms: [gs],
      runOfShow: null,
    });
    expect(ctx.loadInTime).toBeNull();
    expect(ctx.callTime).toBeNull();
    expect(ctx.strikeTime).toBeNull();
    expect(ctx.showAnchors).toEqual([]);
  });
  ```
  _Catches:_ the pre-existing `***` room-date leak in the Footer autocapture / hero context — resolver now returns `{}` for `unknown_asterisk`, so every anchor must go null (no `10/8`/`10/9` date strings reach `rightNowState`).

- [ ] Run the new tests — expect FAIL: `pnpm vitest run tests/components/buildRightNowContext.test.ts -t 'showAnchors carry'`
  Expected output: `FAIL` — `ctx.showAnchors` is `undefined` (field doesn't exist yet) and/or arity error on the missing `runOfShow` opt → `resolveKeyTimes` called 2-arg.

- [ ] Implement in `components/right-now/buildRightNowContext.ts`. Add `runOfShow` to opts, add `showAnchors` to `RightNowContext`, pass new args:

  ```ts
  import type { DateRestriction, HotelReservationRow, RunOfShow, ShowRow } from "@/lib/parser/types";
  import { resolveKeyTimes, type ProjectedRoomRow, type ShowAnchor } from "@/lib/crew/resolveKeyTimes";

  export type RightNowContext = {
    // ...unchanged fields...
    loadInTime: string | null;
    callTime: string | null;
    roomName: string | null;
    strikeTime: string | null;
    /** Dated per-day Show anchors; RightNowHero selects by client show-tz todayIso. */
    showAnchors: ShowAnchor[];
    timezone: string;
  };

  export function buildRightNowContext(opts: {
    show: Pick<ShowRow, "dates" | "title" | "venue" | "event_details">;
    dateRestriction: DateRestriction;
    hotelReservations: HotelReservationRow[];
    rooms: ProjectedRoomRow[] | null;
    runOfShow: RunOfShow | null; // NEW
  }): RightNowContext {
    const { show, dateRestriction, hotelReservations, rooms, runOfShow } = opts;
    const firstHotel = hotelReservations[0] ?? null;

    const anchors = resolveKeyTimes(show, rooms, runOfShow, dateRestriction); // 4-arg now
    const loadInTime = anchors.set ?? null;
    const strikeTime = anchors.strike ?? null;
    const showAnchors = anchors.shows ?? [];
    // callTime stays a single string for back-compat consumers; RightNowHero re-selects
    // from showAnchors by todayIso. Default to the first anchor (or null) — never a cross-day guess.
    const callTime = showAnchors[0]?.time ?? null;
    const roomName = null;
    // ...timezone + return, now including showAnchors...
    return { /* ...existing fields..., */ loadInTime, callTime, roomName, strikeTime, showAnchors, timezone };
  }
  ```

- [ ] Update **caller 1** — `components/crew/sections/TodaySection.tsx:207-213`. Add the opt to the existing call:

  ```ts
  const rightNowContext = buildRightNowContext({
    show: data.show,
    dateRestriction: ctx.dateRestriction,
    hotelReservations: data.hotelReservations,
    rooms: data.rooms,
    runOfShow: data.runOfShow ?? null, // NEW
  });
  ```
  Also update the sibling `resolveKeyTimes(data.show, data.rooms)` at `:214` → `resolveKeyTimes(data.show, data.rooms, data.runOfShow ?? null, ctx.dateRestriction)`.

- [ ] Update **caller 2** — `app/show/[slug]/[shareToken]/_CrewShell.tsx:207-214`. Add the opt to the Footer-autocapture call:

  ```ts
  const rightNowCtx = canBuildRightNow
    ? buildRightNowContext({
        show: data.show,
        dateRestriction: ctx.dateRestriction,
        hotelReservations: data.hotelReservations ?? [],
        rooms: data.rooms ?? [],
        runOfShow: data.runOfShow ?? null, // NEW — keeps rightNowState in sync, no stale context
      })
    : null;
  ```

- [ ] Write failing test 3 — **both-caller compile / type contract**. Add a typecheck step (the required `runOfShow` opt forces both callers to pass it):
  Run: `pnpm tsc --noEmit`
  Expected output before caller edits: errors at `TodaySection.tsx:207` and `_CrewShell.tsx:208` — `Property 'runOfShow' is missing`. After the two caller edits above: clean. (This is the compile-break guard from §5.1 — omitting either caller fails the build.)

- [ ] Run the full suite for this surface — expect PASS:
  `pnpm vitest run tests/components/buildRightNowContext.test.ts && pnpm tsc --noEmit`
  Expected output: `Test Files  1 passed`; `tsc` exits 0.

- [ ] **Negative-regression** (unknown_asterisk leak): temporarily revert the `resolveKeyTimes` 4-arg call back to `resolveKeyTimes(show, rooms)` (2-arg, ignoring `dateRestriction`), re-run `pnpm vitest run tests/components/buildRightNowContext.test.ts -t 'unknown_asterisk'` → `callTime`/`strikeTime` MUST become non-null (`10/8 @ 8:45am`, `10/9 @ 4:30pm` leak back). Revert. Confirms the test pins the leak fix.

- [ ] Commit: `git commit -m 'feat(crew-page): carry per-day showAnchors through buildRightNowContext (both callers)'`

---

### Task 11: KeyTimesStrip — render set + N shows[] rows + strike (per-row inv6, stack/row layouts, 5-row cap) (UI — Opus + impeccable)

**Files:**
- Modify: `components/crew/primitives/KeyTimesStrip.tsx` (replace the fixed `ANCHOR_ORDER` set/show/strike map at `:44-49` and the `present`/render loop at `:51-85` with set → N `shows[]` → strike; keep `data-testid="key-times-strip"` `:72`, `data-layout` `:72`, per-row `data-anchor` + inv6 span structure `:73-81`, container/anchor class strings `:64-69`)
- Modify: `lib/crew/resolveKeyTimes.ts` (`KeyTimeAnchors` type at `:7` — the contract reshape `show?: string` → `shows?: ShowAnchor[]`; the resolver body itself is owned by the parser/display task that lands `resolveKeyTimes`'s new signature, but `KeyTimesStrip` consumes the new type here)
- Test: `tests/components/crew/primitives.test.tsx` (extend the existing `describe("<KeyTimesStrip>")` block at `:192-260`; `// @vitest-environment jsdom` already at `:1`)

**Interfaces:**
- Consumes: `type ShowAnchor = { date: string; label: string; time: string }`; `export type KeyTimeAnchors = { set?: string; shows?: ShowAnchor[]; strike?: string }` (from `@/lib/crew/resolveKeyTimes`)
- Produces: `KeyTimesStrip({ anchors, layout }: { anchors: KeyTimeAnchors; layout?: "stack" | "row" })` — a presentational Server Component (no `'use client'`), markup out

**Note for implementer:** `set`/`strike` rows keep `data-anchor="set"`/`data-anchor="strike"`. Each `shows[]` element renders as a `data-anchor="show"` row (so the existing `[data-anchor="show"]` selector still finds the show row(s)); for multi-show disambiguation also stamp `data-anchor-date={anchor.date}` so a test can target a specific day. The per-row label is `anchor.label` (the contract's already-composed `"Day 1 · Wed 10/8"` / plain `"Show"` for single-day); the value is `anchor.time`. Do NOT recompute labels in this component — the resolver owns label copy.

Steps:
- [ ] Add a failing test: N-row render. Append to the `describe("<KeyTimesStrip>")` block in `tests/components/crew/primitives.test.tsx`:
  ```tsx
  test("N shows[] → set row, one show row per anchor (in array order), strike row", () => {
    const shows = [
      { date: "2026-10-08", label: "Day 1 · Wed 10/8", time: "7:15am" },
      { date: "2026-10-09", label: "Day 2 · Thu 10/9", time: "8:00am" },
    ];
    const anchors: KeyTimeAnchors = { set: "10/7 @ 9:00PM", shows, strike: "10/9 @ 4:30pm" };
    const { getByTestId } = render(<KeyTimesStrip anchors={anchors} />);
    const strip = getByTestId("key-times-strip");
    // Total rows = 1 set + shows.length + 1 strike (derived from the fixture, not hardcoded).
    const expectedRows = (anchors.set != null ? 1 : 0) + shows.length + (anchors.strike != null ? 1 : 0);
    expect(strip.querySelectorAll("[data-anchor]").length).toBe(expectedRows); // = 4
    expect(strip.querySelectorAll('[data-anchor="show"]').length).toBe(shows.length); // = 2
    // Each show row carries its date hook + its label + its time, in array order.
    const showRows = Array.from(strip.querySelectorAll('[data-anchor="show"]'));
    showRows.forEach((row, i) => {
      expect(row.getAttribute("data-anchor-date")).toBe(shows[i]!.date);
      expect(row.textContent).toContain(shows[i]!.label);
      expect(row.textContent).toContain(shows[i]!.time);
    });
  });
  ```
  Failure mode caught: a strip that renders a single collapsed Show anchor (the pre-fix `show?: string` shape) instead of one row per visible show day — the Day-2-call-time gap from §1 finding 3.
- [ ] Run it, expect FAIL: `pnpm vitest run tests/components/crew/primitives.test.tsx -t 'N shows'` → expected output contains `1 failed` and a TS/assertion error that `anchors.shows`/`data-anchor-date` is not rendered (compile error on `shows` if `KeyTimeAnchors` still has `show?: string`).
- [ ] Update `KeyTimeAnchors` in `lib/crew/resolveKeyTimes.ts:7` to the contract shape (add the `ShowAnchor` type; `set?: string; shows?: ShowAnchor[]; strike?: string`).
- [ ] Implement the render in `components/crew/primitives/KeyTimesStrip.tsx`: replace `ANCHOR_ORDER` (`:44-49`) and the `present`/`map` loop (`:51-85`) so the row list is built as `[set?, ...shows, strike?]`:
  ```tsx
  import type { KeyTimeAnchors, ShowAnchor } from "@/lib/crew/resolveKeyTimes";

  type Row = { anchor: "set" | "show" | "strike"; label: string; value: string; date?: string };

  export function KeyTimesStrip({ anchors, layout = "stack" }: KeyTimesStripProps) {
    const rows: Row[] = [];
    if (anchors.set != null) rows.push({ anchor: "set", label: "Set", value: anchors.set });
    for (const s of anchors.shows ?? []) {
      rows.push({ anchor: "show", label: s.label, value: s.time, date: s.date });
    }
    if (anchors.strike != null) rows.push({ anchor: "strike", label: "Strike", value: anchors.strike });
    if (rows.length === 0) return null; // all absent → no empty band reflows in

    const isRow = layout === "row";
    const containerClass = isRow
      ? "flex flex-col gap-2 min-[720px]:flex-row min-[720px]:gap-0 min-[720px]:divide-x min-[720px]:divide-border"
      : "flex flex-col gap-2";
    const anchorClass = isRow
      ? "flex min-w-0 items-baseline justify-between gap-3 min-[720px]:flex-1 min-[720px]:flex-col min-[720px]:items-start min-[720px]:justify-start min-[720px]:gap-0.5 min-[720px]:px-4 min-[720px]:first:pl-0 min-[720px]:last:pr-0"
      : "flex items-baseline justify-between gap-3";

    return (
      <div data-testid="key-times-strip" data-layout={layout} className={containerClass}>
        {rows.map((row, i) => (
          <div
            key={`${row.anchor}-${row.date ?? i}`}
            data-anchor={row.anchor}
            {...(row.date != null ? { "data-anchor-date": row.date } : {})}
            className={anchorClass}
          >
            <span className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
              {row.label}
            </span>
            <span className="min-w-0 text-sm font-semibold tabular-nums text-text-strong">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  ```
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/primitives.test.tsx -t 'N shows'` → `1 passed`.
- [ ] Add a failing test: inv6 first/last span per row (label-first / value-last preserved across N show rows + both layouts):
  ```tsx
  test("inv6: each row's FIRST span = label, LAST span = value (set + N shows + strike)", () => {
    const shows = [{ date: "2026-10-08", label: "Day 1 · Wed 10/8", time: "7:15am" }];
    const anchors: KeyTimeAnchors = { set: "10/7 @ 9:00PM", shows, strike: "10/9 @ 4:30pm" };
    const { getByTestId } = render(<KeyTimesStrip anchors={anchors} />);
    const strip = getByTestId("key-times-strip");
    for (const row of Array.from(strip.querySelectorAll("[data-anchor]"))) {
      const spans = row.querySelectorAll("span");
      expect(spans.length).toBe(2);
      // First span is the label, last is the value — pin per row, derive expected from the row's own data.
      const isShow = row.getAttribute("data-anchor") === "show";
      const expectedLabel = isShow ? shows[0]!.label : (row.getAttribute("data-anchor") === "set" ? "Set" : "Strike");
      const expectedValue = isShow ? shows[0]!.time : (row.getAttribute("data-anchor") === "set" ? anchors.set : anchors.strike);
      expect(spans[0]!.textContent).toBe(expectedLabel);
      expect(spans[1]!.textContent).toBe(expectedValue);
    }
  });
  ```
  Failure mode caught: a refactor that puts the value before the label (or wraps either in an extra span) breaks the e2e mobile column-alignment contract (inv6 reads `span.first()`/`span.last()`).
- [ ] Run it, expect PASS (the impl already orders label-then-value): `pnpm vitest run tests/components/crew/primitives.test.tsx -t 'inv6: each row'` → `1 passed`. (Negative-regression: temporarily swap the two `<span>`s in the impl → this test must FAIL; revert.)
- [ ] Add a failing test: both layouts carry the documented classes with N show rows (the existing `layout="row"` test at `:240-256` only had 3 fixed anchors):
  ```tsx
  test('layout="row" with N shows → row container divider classes + every cell gets min-[720px]:flex-1', () => {
    const shows = [
      { date: "2026-10-08", label: "Day 1", time: "7:15am" },
      { date: "2026-10-09", label: "Day 2", time: "8:00am" },
    ];
    const anchors: KeyTimeAnchors = { set: "9:00PM", shows, strike: "4:30pm" };
    const { getByTestId } = render(<KeyTimesStrip anchors={anchors} layout="row" />);
    const strip = getByTestId("key-times-strip");
    expect(strip.getAttribute("data-layout")).toBe("row");
    expect(strip.className).toContain("min-[720px]:flex-row");
    expect(strip.className).toContain("min-[720px]:divide-x");
    // Equal-width cells: every present row carries the flex-1 cell class (Dimensional Invariants §5.5).
    for (const row of Array.from(strip.querySelectorAll("[data-anchor]"))) {
      expect(row.className).toContain("min-[720px]:flex-1");
      expect(row.className).toContain("min-[720px]:first:pl-0");
      expect(row.className).toContain("min-[720px]:last:pr-0");
    }
  });
  test('layout="stack" with N shows → vertical, no horizontal row classes', () => {
    const shows = [{ date: "2026-10-08", label: "Day 1", time: "7:15am" }];
    const { getByTestId } = render(<KeyTimesStrip anchors={{ shows }} layout="stack" />);
    const strip = getByTestId("key-times-strip");
    expect(strip.getAttribute("data-layout")).toBe("stack");
    expect(strip.className).toContain("flex-col");
    expect(strip.className).not.toContain("flex-row");
  });
  ```
  Failure mode caught: §5.5 Dimensional Invariant regression — a show cell that drops `min-[720px]:flex-1` collapses to content-width (Tailwind v4 `.flex` ≠ `items-stretch`), leaving uneven columns.
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/primitives.test.tsx -t 'layout='` → `2 passed` (plus the pre-existing layout tests still green).
- [ ] Add a failing test: 5-row cap on `shows[]` (first 4 + `"+N more"`). §6 caps Show-anchor rows at 5; beyond that render first 4 + a `+N more` row:
  ```tsx
  test("shows[] longer than the cap → first 4 show rows + a single '+N more' row", () => {
    const shows = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${String(8 + i).padStart(2, "0")}`,
      label: `Day ${i + 1}`,
      time: `${7 + i}:00am`,
    }));
    const anchors: KeyTimeAnchors = { shows };
    const { getByTestId } = render(<KeyTimesStrip anchors={anchors} />);
    const strip = getByTestId("key-times-strip");
    // First 4 show rows render; the 5th..Nth collapse into one overflow row.
    expect(strip.querySelectorAll('[data-anchor="show"]').length).toBe(4);
    const overflow = strip.querySelector('[data-testid="key-times-shows-overflow"]');
    expect(overflow).not.toBeNull();
    // Overflow count derived from the fixture (7 - 4 = 3), never hardcoded.
    const hidden = shows.length - 4;
    expect(overflow!.textContent).toContain(`+${hidden}`);
  });
  test("exactly 5 shows → all 5 render, no overflow row (boundary)", () => {
    const shows = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-10-${String(8 + i).padStart(2, "0")}`, label: `Day ${i + 1}`, time: `${7 + i}:00am`,
    }));
    const { getByTestId } = render(<KeyTimesStrip anchors={{ shows }} />);
    const strip = getByTestId("key-times-strip");
    expect(strip.querySelectorAll('[data-anchor="show"]').length).toBe(5);
    expect(strip.querySelector('[data-testid="key-times-shows-overflow"]')).toBeNull();
  });
  ```
  Failure mode caught: unbounded `showDays` (the realistic max is 3 but the type is unbounded — §6) rendering an arbitrarily tall strip with no truncation honesty.
- [ ] Implement the cap in `KeyTimesStrip.tsx`: cap at 5 — when `shows.length > 5`, push the first 4 show rows then a single overflow row (`data-testid="key-times-shows-overflow"`, `data-anchor` omitted so it is NOT counted by the `[data-anchor="show"]` selector) with `+{shows.length - 4} more`:
  ```tsx
  const SHOWS_CAP = 5;
  const showAnchors = anchors.shows ?? [];
  const cappedShows = showAnchors.length > SHOWS_CAP ? showAnchors.slice(0, 4) : showAnchors;
  const overflow = showAnchors.length > SHOWS_CAP ? showAnchors.length - 4 : 0;
  // ...push cappedShows as data-anchor="show" rows...
  // after the rows.map(...), render the overflow row when overflow > 0:
  {overflow > 0 ? (
    <div data-testid="key-times-shows-overflow" className={anchorClass}>
      <span className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">More days</span>
      <span className="min-w-0 text-sm font-semibold tabular-nums text-text-strong">+{overflow} more</span>
    </div>
  ) : null}
  ```
  (The strike row, when present, must still render AFTER the overflow row — keep the rows array `[set, ...cappedShows]` then render overflow then strike, or fold overflow into the rows array before strike.)
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/primitives.test.tsx -t 'cap'` → `2 passed`.
- [ ] Run the full primitives suite + the sentinel/single-source meta-tests to confirm no regression in the shared primitive: `pnpm vitest run tests/components/crew/primitives.test.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts` → all green.
- [ ] Run `pnpm tsc --noEmit` (the `KeyTimeAnchors` reshape is consumed by ScheduleSection/TodaySection/buildRightNowContext/source-link-dim — expect those to compile-error here; they are fixed in Tasks 12–14 and the resolver task, so if running standalone scope this step to `tsc -p tsconfig.json --noEmit components/crew/primitives/KeyTimesStrip.tsx`). Note any downstream breakage for the dependent tasks.
- [ ] Commit: `git commit -m "feat(crew-page): KeyTimesStrip renders per-day shows[] rows with 5-row cap + inv6"`

---

### Task 12: DayCard meta + ScheduleSection — per-day window/setupTime meta, "Daily call times" all-shows strip, shared visibleShowDays (UI — Opus + impeccable)

**Files:**
- Modify: `components/crew/sections/ScheduleSection.tsx` — change the resolver call at `:87` to `resolveKeyTimes(data.show, data.rooms, data.runOfShow, dateRestriction)`; replace the inline explicit-intersection IIFE at `:121-128` with the shared `visibleShowDays` helper; pass `DayCard.meta` (`:208`) per the meta rules; keep `hasTimesCard`/`rightHasContent` anchor-floor logic at `:152-153` working with `anchors.shows`
- Modify: `components/crew/primitives/DayCard.tsx` — no structural change needed (`meta?` prop + `data-slot="day-card-meta"` render already wired at `:45-46`,`:104-108`); confirm it forwards a string meta
- CONSUME (do NOT redefine): `visibleShowDays(dates, dateRestriction)` and `formatScheduleWindow(window)` from `lib/crew/agendaDisplay.ts` — BOTH are produced by Task 4. Task 12 does NOT modify `agendaDisplay.ts`.
- Test: `tests/components/crew/sections/ScheduleSection.test.tsx`, `tests/components/crew/sections/ScheduleSection.anchorFloor.test.tsx`

**Interfaces:**
- Consumes: the canonical `ScheduleDay = { entries: AgendaEntry[]; showStart: string | null; window: { start: string; end: string } | null }` and `RunOfShow = Record<string, ScheduleDay>` from `lib/parser/types.ts` (Task 2); `data.runOfShow: RunOfShow | null`; `resolveKeyTimes(show, rooms, runOfShow, dateRestriction): KeyTimeAnchors` (Task 9); `visibleShowDays(dates: Pick<ShowRow['dates'],'showDays'>, dateRestriction): string[]` + `formatScheduleWindow(window: {start;end}|null): string|null` (Task 4); `AggregateDay` (the day-list element `{date, phase}` — Task 4's rename of the legacy `ScheduleDay`).
- Produces: `DayCard.meta` wiring in `ScheduleSection.tsx` = `formatScheduleWindow(window)` (bare-window day) | single `showStart` time (fragment day) | `"Setup <setupTime>"` (Set day) | `undefined` (else); the "Daily call times" `KeyTimesStrip` fed `resolveKeyTimes(data.show, data.rooms, data.runOfShow, dateRestriction)`.

**Naming note (post Task-4 rename):** the day-list element type is now `AggregateDay` (`{date, phase}`, renamed from the legacy `ScheduleDay` in Task 4). The ONLY `ScheduleDay` is the canonical `run_of_show` value type from `lib/parser/types.ts`. In `ScheduleSection.tsx` the day-list variable is `AggregateDay[]`; `data.runOfShow[iso]` is `ScheduleDay`. No import disambiguation needed (the names no longer collide).

Steps:
- [ ] Confirm the shared helpers exist (PRODUCED by Task 4 — do NOT redefine or re-test here): `rg -n "export function visibleShowDays|export function formatScheduleWindow" lib/crew/agendaDisplay.ts` returns both with the Task-4 signatures (`visibleShowDays(dates, dateRestriction)`, `formatScheduleWindow(window|null): string|null`). Task 12 IMPORTS them; the single-source drift guard lives in Task 4's `agendaDisplay-single-source.test.ts`.
- [ ] Add a failing test (window meta): in `tests/components/crew/sections/ScheduleSection.test.tsx`, render a show whose `runOfShow` has a bare-window day and assert the Set/other-day DayCard meta:
  ```tsx
  test("bare-window day → DayCard meta = the window string from the data source", () => {
    const window = { start: "7:30am", end: "5:50pm" };
    const data = makeShowForViewer({
      dates: { showDays: ["2026-10-08"], travelIn: null, travelOut: null, set: null },
      runOfShow: { "2026-10-08": { entries: [], showStart: null, window } },
    });
    const { getByTestId } = render(
      <ScheduleSection data={data} viewer={adminViewer} today={at("2026-10-08")} showId="s1" />,
    );
    const dayCard = getByTestId("schedule-day-today").querySelector('[data-slot="day-card-meta"]');
    // Expected meta derived from the data source's window, not a hardcoded literal.
    expect(dayCard).not.toBeNull();
    expect(dayCard!.textContent).toBe(`${window.start}–${window.end}`);
  });
  ```
  Failure mode caught: §1 finding 2 — a bare-window day (RIA/Asset-Mgmt) dropping its TIME data and rendering a DayCard with NO time line.
- [ ] Run it, expect FAIL: `pnpm vitest run tests/components/crew/sections/ScheduleSection.test.tsx -t 'bare-window'` → `1 failed` (no meta node).
- [ ] Implement the meta wiring in `ScheduleSection.tsx`. Replace the inline IIFE at `:121-128` with the shared helper applied to `data.show.dates.showDays`, but keep the FULL aggregate (`aggregateDays`) for the day-card list (travel/set/show/travelOut). Compute per-day meta inside the `visibleDays.map`:
  ```tsx
  const dr = dateRestriction; // already resolved at :85
  const setupTime = data.show.dates.setupTime;
  // ...inside visibleDays.map((day) => { ...
  const sd = data.runOfShow?.[day.date] ?? null; // types.ScheduleDay | null
  const isSetDay = day.phase === "Set";
  let meta: string | undefined;
  if (isSetDay && !shouldHideGenericOptional(setupTime ?? "")) {
    meta = `Setup ${setupTime!.trim()}`;
  } else if (sd?.window != null) {
    meta = formatScheduleWindow(sd.window);
  } else if (sd != null && sd.showStart != null && sd.entries.length === 0) {
    meta = sd.showStart; // fragment day: single showStart, no window/entries
  }
  // titled day (entries.length > 0) → meta stays undefined; RunOfShowList renders below
  // <DayCard day={day.date} phase={day.phase} today={isToday} meta={meta} />
  ```
  Update the resolver call at `:87` to `resolveKeyTimes(data.show, data.rooms, data.runOfShow, dateRestriction)`. The `RunOfShowList` gate at `:213-216` reads `data.runOfShow?.[day.date]` which is now a `ScheduleDay` value, not an `AgendaEntry[]` — change it to `displayableEntries(sd?.entries).length > 0 ? <RunOfShowList entries={sd!.entries} isoDate={day.date} /> : null`.
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/sections/ScheduleSection.test.tsx -t 'bare-window'` → `1 passed`.
- [ ] Add a failing test (Set-day setupTime meta + absent → no meta):
  ```tsx
  test("Set day with dates.setupTime → DayCard meta 'Setup <time>'; sentinel/absent → no meta", () => {
    const data = makeShowForViewer({
      dates: { showDays: ["2026-10-08"], set: "2026-10-07", travelIn: null, travelOut: null, setupTime: "10:00PM" },
      runOfShow: null,
    });
    const r = render(<ScheduleSection data={data} viewer={adminViewer} today={at("2026-10-07")} showId="s1" />);
    const setCard = r.getByTestId("schedule-day-today").querySelector('[data-slot="day-card-meta"]');
    expect(setCard!.textContent).toBe(`Setup ${data.show.dates.setupTime}`);
    cleanup();
    const data2 = makeShowForViewer({
      dates: { showDays: ["2026-10-08"], set: "2026-10-07", travelIn: null, travelOut: null, setupTime: "N/A" },
      runOfShow: null,
    });
    const r2 = render(<ScheduleSection data={data2} viewer={adminViewer} today={at("2026-10-07")} showId="s1" />);
    expect(r2.getByTestId("schedule-day-today").querySelector('[data-slot="day-card-meta"]')).toBeNull();
  });
  ```
  Failure mode caught: §4.2/§5.3 zombie-field — `dates.setupTime` captured by the parser but never reaching a user surface (R9 finding 17), AND a sentinel `"N/A"` setupTime leaking as `"Setup N/A"`.
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/sections/ScheduleSection.test.tsx -t 'Set day with dates.setupTime'` → `1 passed`.
- [ ] Add the anchor-floor negative-regression confirmation (no times → zero Phase-2 markup) with the updated wrapper-child shape, plus the date-safe fallback render (Redefining-FI Day-2). Extend `tests/components/crew/sections/ScheduleSection.anchorFloor.test.tsx`:
  ```tsx
  test("no anchors, no runOfShow → right column emitted but empty; grid falls back to flex (anchor floor holds)", () => {
    const data = makeShowForViewer({
      dates: { showDays: ["2026-10-08"], travelIn: null, travelOut: null, set: null },
      runOfShow: null, rooms: [], // no room → resolveKeyTimes yields {}
    });
    const { getByTestId } = render(<ScheduleSection data={data} viewer={adminViewer} today={at("2026-10-08")} showId="s1" />);
    const grid = getByTestId("schedule-grid");
    expect(grid.className).toContain("flex flex-col"); // rightHasContent === false
    // Anti-tautology: the times column container is STILL present (the floor contract)…
    const timesCol = grid.querySelector('[data-schedule-column="times"]');
    expect(timesCol).not.toBeNull();
    // …but holds NO call-times card (no anchors → KeyTimesStrip null → no card shell).
    expect(grid.querySelector('[data-card-id="schedule-call-times"]')).toBeNull();
  });
  test("Redefining-FI Day 2 absent from runOfShow + cross-dated room → day renders, no cross-day anchor", () => {
    // Day 2 (5/14) intentionally absent (GS: ... - 6:00 PM → showStart null); room show_time dated 5/13.
    const data = makeShowForViewer({
      dates: { showDays: ["2026-05-13", "2026-05-14"], travelIn: null, travelOut: null, set: null },
      runOfShow: { "2026-05-13": { entries: [], showStart: "8:00 AM", window: null } },
      rooms: [{ id: "r1", kind: "gs", name: "GS", set_time: null, show_time: "5/13 @ 8:00 AM", strike_time: null }],
    });
    const { getByTestId } = render(<ScheduleSection data={data} viewer={adminViewer} today={at("2026-05-13")} showId="s1" />);
    // Day 2 card still renders (from dates.showDays) — date-safe fallback, no crash.
    expect(getByTestId("schedule-day-2026-05-14")).not.toBeNull();
    // The strip's show anchors come from resolveKeyTimes (data source) — Day 2 must NOT inherit 5/13's value.
    const showRows = getByTestId("key-times-strip").querySelectorAll('[data-anchor="show"]');
    const day2Row = Array.from(showRows).find((r) => r.getAttribute("data-anchor-date") === "2026-05-14");
    expect(day2Row).toBeUndefined(); // omitted, not cross-labeled (§5.1 row 6)
  });
  ```
  Failure mode caught: (a) the Phase-2 anchor-floor contract breaking when the wrapper child shape changed to `ScheduleDay`; (b) the §5.1 date-safe room fallback cross-labeling Day 2 with Day 1's `5/13` value.
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/sections/ScheduleSection.anchorFloor.test.tsx` → all green. (Anti-tautology check: the Day-2 assertion reads `key-times-strip` show rows by `data-anchor-date`; it does NOT scan the whole section text, so a sibling "5/13" label elsewhere can't satisfy it. Negative-regression: stash the §5.1 date-safe guard in `resolveKeyTimes` → the Day-2 row reappears.)
- [ ] Run the broad Schedule + single-source meta suite (a shared-primitive/helper change can break distant tests): `pnpm vitest run tests/components/crew/sections/ScheduleSection.test.tsx tests/components/crew/sections/ScheduleSection.agenda.test.tsx tests/components/crew/sections/ScheduleSection.caps.test.tsx tests/components/crew/sections/ScheduleSection.fieldGuards.test.tsx tests/crew/agendaDisplay-single-source.test.ts` → all green.
- [ ] Commit: `git commit -m "feat(crew-page): ScheduleSection per-day meta (window/setup) + shared visibleShowDays + all-shows call-times strip"`

---

### Task 13: TodaySection — today-filtered shows[], show-wide set/strike, unknown_asterisk suppression, runOfShow into buildRightNowContext (UI — Opus + impeccable)

**Files:**
- Modify: `components/crew/sections/TodaySection.tsx` — change the resolver call at `:214` to `resolveKeyTimes(data.show, data.rooms, data.runOfShow, ctx.dateRestriction)`; filter `anchors.shows` to today's ISO before rendering; add `runOfShow` to the `buildRightNowContext` call at `:207-212`; update `anchorsPresent` at `:412-413` to test `anchors.shows`/`set`/`strike`
- Test: `tests/components/crew/sections/TodaySection.test.tsx`

**Interfaces:**
- Consumes: `resolveKeyTimes(show, rooms, runOfShow, dateRestriction): KeyTimeAnchors` (returns `{ set?, shows?: ShowAnchor[], strike? }`); `buildRightNowContext(opts: { show; dateRestriction; hotelReservations; rooms; runOfShow }): RightNowContext`; `todayIsoInShowTimezone(show, today): string` (`@/lib/visibility/packList`, already imported at `:60`)
- Produces: the Today render — `KeyTimesStrip` fed `{ set, strike, shows: <only today's ISO> }`; `unknown_asterisk` → `resolveKeyTimes` returns `{}` → no strip / no leak

Steps:
- [ ] Add a failing test (Today day-matrix): in `tests/components/crew/sections/TodaySection.test.tsx`, render across the day matrix and assert Set/Strike always present, Show only on show days = that day's time. Use the shared fixture builder + the `at()` show-tz instant:
  ```tsx
  function makeMultiDay() {
    return makeShowForViewer({
      dates: { travelIn: "2026-10-06", set: "2026-10-07", showDays: ["2026-10-08", "2026-10-09"], travelOut: "2026-10-10", loadIn: "9:00PM" },
      runOfShow: {
        "2026-10-08": { entries: [], showStart: "7:15am", window: null },
        "2026-10-09": { entries: [], showStart: "8:00am", window: null },
      },
      rooms: [{ id: "r1", kind: "gs", name: "GS", set_time: null, show_time: "10/8 @ 8:45am", strike_time: "4:30pm" }],
    });
  }
  const matrix: Array<{ label: string; today: string; showAnchorDate: string | null }> = [
    { label: "set day", today: "2026-10-07", showAnchorDate: null },
    { label: "show day 1", today: "2026-10-08", showAnchorDate: "2026-10-08" },
    { label: "show day 2", today: "2026-10-09", showAnchorDate: "2026-10-09" },
    { label: "strike/travel-out day", today: "2026-10-10", showAnchorDate: null },
    { label: "travel-in day", today: "2026-10-06", showAnchorDate: null },
  ];
  test.each(matrix)("Today $label → Set+Strike always; Show only on show days, today's time", ({ today, showAnchorDate }) => {
    const data = makeMultiDay();
    const { getByTestId, queryByTestId } = render(
      <TodaySection data={data} viewer={adminViewer} today={at(today)} showId="s1" />,
    );
    // Key times card exists (set/strike are show-wide → always present here).
    const strip = getByTestId("key-times-strip");
    expect(strip.querySelector('[data-anchor="set"]')).not.toBeNull();
    expect(strip.querySelector('[data-anchor="strike"]')).not.toBeNull();
    const showRows = Array.from(strip.querySelectorAll('[data-anchor="show"]'));
    if (showAnchorDate === null) {
      expect(showRows.length).toBe(0); // non-show day: no Show anchor
    } else {
      // Exactly today's show anchor, carrying today's showStart from the data source.
      expect(showRows.length).toBe(1);
      expect(showRows[0]!.getAttribute("data-anchor-date")).toBe(showAnchorDate);
      const expectedTime = data.runOfShow![showAnchorDate]!.showStart;
      expect(showRows[0]!.textContent).toContain(expectedTime);
    }
  });
  ```
  Failure mode caught: §5.4 / D6 — Today leaking OTHER show days' anchors (the full per-day breakdown belongs in Schedule), or date-gating Set/Strike (which are show-wide milestones, §13.8). Expected times derived from the fixture's `runOfShow`, not hardcoded.
- [ ] Run it, expect FAIL: `pnpm vitest run tests/components/crew/sections/TodaySection.test.tsx -t 'Today'` → multiple `failed` (Show rows not filtered to today / resolver still 2-arg).
- [ ] Implement in `TodaySection.tsx`: update the `buildRightNowContext` call (`:207-212`) to add `runOfShow: data.runOfShow`; change `resolveKeyTimes(data.show, data.rooms)` (`:214`) to the 4-arg form; then filter `shows` to today's ISO for the rendered strip (Set/Strike pass through untouched):
  ```tsx
  const rightNowContext = buildRightNowContext({
    show: data.show,
    dateRestriction: ctx.dateRestriction,
    hotelReservations: data.hotelReservations,
    rooms: data.rooms,
    runOfShow: data.runOfShow,
  });

  const resolved = resolveKeyTimes(data.show, data.rooms, data.runOfShow, ctx.dateRestriction);
  // todayIso is already computed at :196 (todayIsoInShowTimezone(data.show, today)).
  // Today shows ONLY today's Show anchor; set/strike are show-wide → pass through.
  const anchors: KeyTimeAnchors = {
    ...(resolved.set != null ? { set: resolved.set } : {}),
    ...(resolved.strike != null ? { strike: resolved.strike } : {}),
    ...((resolved.shows ?? []).some((s) => s.date === todayIso)
      ? { shows: resolved.shows!.filter((s) => s.date === todayIso) }
      : {}),
  };
  ```
  Update `anchorsPresent` (`:412-413`) to `anchors.set != null || (anchors.shows?.length ?? 0) > 0 || anchors.strike != null`. Note `todayIso` is computed at `:196` inside the render closure — `anchors` must be computed AFTER it (move the `resolveKeyTimes` block below `:196`, replacing the current `:214` call). For `unknown_asterisk`, `resolveKeyTimes` returns `{}` (§5.1), so `resolved.set/shows/strike` are all absent → `anchors` is `{}` → both `KeyTimesStrip` instances (`:426`, `:536`) render null.
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/sections/TodaySection.test.tsx -t 'Today'` → all matrix rows `passed`.
- [ ] Add a failing test (unknown_asterisk no leak + negative-regression): a `***` viewer renders NO set/strike/show anchor labels AND none of the room-sourced Show/Strike date strings:
  ```tsx
  test("unknown_asterisk viewer → resolveKeyTimes {} → NO set/show/strike rows, zero date text", () => {
    const data = makeMultiDay(); // room show_time '10/8 @ 8:45am', strike_time '4:30pm'
    const viewer = makeCrewViewer({ dateRestriction: { kind: "unknown_asterisk" } });
    const { queryByTestId, container } = render(
      <TodaySection data={data} viewer={viewer} today={at("2026-10-08")} showId="s1" />,
    );
    expect(queryByTestId("key-times-strip")).toBeNull();      // strip fully suppressed
    expect(queryByTestId("today-key-times")).toBeNull();      // no card shell either
    // Anti-tautology: clone the section and strip RightNowHero (it independently renders
    // copy) before scanning for leaked date strings, so a hero label can't mask the leak.
    const section = container.querySelector('[data-testid="section-today"]')!.cloneNode(true) as HTMLElement;
    section.querySelector('[data-testid="right-now-hero"]')?.remove();
    expect(section.textContent).not.toContain("8:45am"); // room Show date must NOT leak
    expect(section.textContent).not.toContain("4:30pm"); // room Strike date must NOT leak
  });
  ```
  Failure mode caught: the PRE-EXISTING `***` room-date leak (§5.6 gate 3 / R4 finding 7) — `TodaySection.tsx:214` previously called `resolveKeyTimes` unconditionally and rendered the strip in Mode B for `unknown_asterisk`.
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/sections/TodaySection.test.tsx -t 'unknown_asterisk'` → `1 passed`. (Negative-regression: in `resolveKeyTimes`, stash the `unknown_asterisk → {}` early return so it falls through to room anchors → this test must FAIL with `4:30pm` reappearing; revert. If the resolver branch is not yet implemented in a sibling task, note this test depends on it and order accordingly.)
- [ ] Run the Today suites + modeA + meta-tests (shared-primitive + privacy surfaces): `pnpm vitest run tests/components/crew/sections/TodaySection.test.tsx tests/components/crew/sections/TodaySection.modeA.test.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts tests/crew/agendaDisplay-single-source.test.ts` → all green.
- [ ] Commit: `git commit -m "feat(crew-page): TodaySection today-filtered show anchor + show-wide set/strike + runOfShow into RightNow"`

---

### Task 14: RightNowHero — select showAnchors entry by client show-tz todayIso for the call-time display (UI — Opus + impeccable)

**Files:**
- Modify: `components/crew/RightNowHero.tsx` — in the `show_day_n` body (`:141-156`), select the call-time from `ctx.showAnchors` by the client-computed show-tz `todayIso` instead of the single `ctx.callTime`; `formatIsoForTimezone(now, ctx.timezone)` is already imported/used at `:215`
- Modify: `components/right-now/buildRightNowContext.ts` — add `showAnchors: ShowAnchor[]` to `RightNowContext` (`:24-49`) and populate it from `resolveKeyTimes(...).shows` (`:78-81`); keep `callTime` as a back-compat single anchor (or derive it) per the contract
- Test: `tests/components/crew/rightNowHero.test.tsx` (`// @vitest-environment jsdom` already at `:1`; fake-timer harness already in place at `:82`,`:286`)

**Interfaces:**
- Consumes: `RightNowContext` GAINS `showAnchors: ShowAnchor[]` (where `ShowAnchor = { date: string; label: string; time: string }`, ordered ASC by date); the hero already computes `const todayIso = formatIsoForTimezone(now, ctx.timezone)` (`:215`)
- Produces: in `show_day_n`, the "Show" stat value = the `showAnchors` entry whose `date === todayIso`; non-show "now" → existing fallback; never freezes on a prior day's anchor across midnight rollover / recovery

Steps:
- [ ] Add a failing test (distinct Day1/Day2 anchors; now=Day2 → Day2 anchor): append to `tests/components/crew/rightNowHero.test.tsx`:
  ```tsx
  test("show_day_n: Show stat = the showAnchors entry for the current show-tz day (Day 2, not Day 1)", () => {
    vi.setSystemTime(at("2026-04-23")); // showDays[1] in the showDates() fixture
    const showAnchors = [
      { date: "2026-04-22", label: "Day 1", time: "7:15am" },
      { date: "2026-04-23", label: "Day 2", time: "8:00am" },
    ];
    const ctx = makeContext({ dates: showDates(), showAnchors, strikeTime: "11:00 PM" });
    const { container } = render(<RightNowHero context={ctx} />);
    // Sanity: the machine is in show_day_n.
    expect(stateMarker(container).getAttribute("data-state")).toBe("show_day_n");
    const showStat = container.querySelector('[data-stat="Show"] dd');
    // Expected time derived from the fixture's Day-2 anchor (the current show-tz day), never hardcoded.
    const expected = showAnchors.find((a) => a.date === formatIsoForTimezone(at("2026-04-23"), ctx.timezone))!.time;
    expect(showStat!.textContent).toBe(expected); // "8:00am", NOT Day 1's "7:15am"
    expect(showStat!.textContent).not.toBe(showAnchors[0]!.time);
  });
  ```
  (Import `formatIsoForTimezone` from `@/lib/time/rightNow` at the top of the test — already imported by the source.) Failure mode caught: §5.1 / R2 finding 4 — a single collapsed `callTime` cannot pick the right day, so Day 2 would show Day 1's call time.
- [ ] Run it, expect FAIL: `pnpm vitest run tests/components/crew/rightNowHero.test.tsx -t 'showAnchors entry for the current show-tz day'` → `1 failed` (`showAnchors` not on `RightNowContext` / stat shows `callTime`).
- [ ] Implement in `buildRightNowContext.ts`: add `showAnchors` to the type and populate it:
  ```ts
  import { resolveKeyTimes, type ProjectedRoomRow, type ShowAnchor } from "@/lib/crew/resolveKeyTimes";
  // in RightNowContext:
  /** Per-day Show anchors (ASC by date) — RightNowHero selects by client show-tz todayIso. */
  showAnchors: ShowAnchor[];
  // in the body — the builder now receives runOfShow + dateRestriction (per the 4-arg resolver):
  const anchors = resolveKeyTimes(show, rooms, runOfShow, dateRestriction);
  const showAnchors = anchors.shows ?? [];
  // back-compat single callTime kept for any non-day-aware consumer: first anchor, else null
  const callTime = showAnchors[0]?.time ?? null;
  // ...return { ..., showAnchors, callTime, ... };
  ```
  (Add `runOfShow: RunOfShow | null` to the `buildRightNowContext` opts signature per the contract; the two call sites pass it — TodaySection in Task 13, `_CrewShell` in the resolver/wiring task.)
- [ ] Implement in `RightNowHero.tsx` `show_day_n` body (`:141-156`): select the call-time by the show-tz `todayIso`. `renderHeroBody` receives `(state, ctx, now)` — compute `todayIso` from `now`/`ctx.timezone` (mirroring `:215`) and pick the matching anchor, falling back to the existing `ctx.callTime`:
  ```tsx
  case "show_day_n": {
    const todayIso = formatIsoForTimezone(now, ctx.timezone);
    const todayAnchor = ctx.showAnchors.find((a) => a.date === todayIso);
    const showTime = todayAnchor?.time ?? ctx.callTime; // fallback: legacy single anchor
    const stats = [
      statOrNull("Show", showTime, true),
      state.isLast ? statOrNull("Strike", ctx.strikeTime) : null,
    ].filter((s): s is HeroStat => s !== null);
    return { ...base, eyebrow: "Today", live: true, lead: `Today: Show day ${state.n} of ${state.total}`, detail: null, progressTotal: state.total, progressActive: state.n, stats };
  }
  ```
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/rightNowHero.test.tsx -t 'showAnchors entry for the current show-tz day'` → `1 passed`.
- [ ] Add a failing test (midnight rollover Day1→Day2 re-selects; no stale freeze) — mirror the existing re-derive harness at `:386-417` (`vi.useFakeTimers` `:82`, `vi.advanceTimersByTime(60_000)` + `visibilitychange`):
  ```tsx
  test("show-tz midnight rollover Day1→Day2 → Show stat re-selects to Day 2's anchor (no freeze on Day 1)", () => {
    vi.setSystemTime(at("2026-04-22")); // Day 1
    const showAnchors = [
      { date: "2026-04-22", label: "Day 1", time: "7:15am" },
      { date: "2026-04-23", label: "Day 2", time: "8:00am" },
    ];
    const ctx = makeContext({ dates: showDates(), showAnchors });
    const { container } = render(<RightNowHero context={ctx} />);
    expect(container.querySelector('[data-stat="Show"] dd')!.textContent).toBe(showAnchors[0]!.time); // Day 1
    act(() => {
      vi.setSystemTime(at("2026-04-23")); // cross to Day 2 in show tz
      vi.advanceTimersByTime(60_000);     // 60s tick → setNow(new Date()) re-derives
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Re-selected to Day 2's anchor — derived from the fixture, must NOT keep Day 1's.
    expect(container.querySelector('[data-stat="Show"] dd')!.textContent).toBe(showAnchors[1]!.time);
    expect(container.querySelector('[data-stat="Show"] dd')!.textContent).not.toBe(showAnchors[0]!.time);
  });
  ```
  Failure mode caught: §5.7 client-state transition — the displayed call time freezing on Day 1's anchor after a show-tz midnight rollover (stale-anchor freeze).
- [ ] Run it, expect PASS: `pnpm vitest run tests/components/crew/rightNowHero.test.tsx -t 'midnight rollover'` → `1 passed`.
- [ ] **Recovery / last-good — scope note (R3 finding 4: NOT a jsdom test here).** The per-day Show stat is rendered ONLY in the `show_day_n` body (`RightNowHero.tsx:141-143`), which is NOT in the degraded zone (`isDegradedState`, `:95-107`). The `lastGood`/`morph-to-last-good` machinery (`:344-392`) only freezes a body WHILE inside the degraded zone — where there is no Show stat — so it structurally cannot pin a stale per-day Show anchor across a recovery. The ONLY real per-day client transition is the show-tz midnight rollover (tested above). The genuine degraded→recover transition (entering `isDegradedState` then returning to `show_day_n`) is exercised end-to-end in the **Task 18** e2e transition audit via `driveToState`, where real state transitions are drivable — not faked in jsdom. (Documenting this here closes the §5.7 recovery requirement honestly instead of with a tautological jsdom test that never enters the degraded zone.)
- [ ] Run the full RightNowHero + transition-audit + buildRightNowContext suites (client-component + transition surfaces): `pnpm vitest run tests/components/crew/rightNowHero.test.tsx tests/components/crew/transitionAudit.test.tsx` → all green.
- [ ] Run `pnpm tsc --noEmit` to confirm the `RightNowContext.showAnchors` addition + 4-arg `resolveKeyTimes`/`runOfShow` opts compile across both `buildRightNowContext` call sites.
- [ ] Commit: `git commit -m "feat(crew-page): RightNowHero selects per-day show anchor by client show-tz todayIso"`

---

### Task 15: `_metaSentinelHidingContract` registration — new ScheduleDay free-text fields

**Files:**
- Modify: `tests/components/tiles/_metaSentinelHidingContract.test.ts:166-244` (`GENERIC_OPTIONAL_FIELDS` array — add one entry covering the new ScheduleDay/ShowAnchor free-text fields)
- Test: this file IS the test (a structural meta-test); no separate test file.

**Interfaces:**
- Consumes: `type ScheduleDay = { entries: AgendaEntry[]; showStart: string | null; window: { start: string; end: string } | null }`, `type ShowAnchor = { date: string; label: string; time: string }`, `ShowRow['dates'].setupTime?: string | null`. The new user-visible free-text fields are: `window.start`, `window.end`, `showStart`, `ShowAnchor.time`, `dates.setupTime`.
- Produces: nothing (registry edit only). The contract it enforces: any `components/crew/**` or `components/tiles/**` file that reads one of these fields MUST route it through `shouldHideGenericOptional` (`lib/visibility/emptyState.ts`) — directly OR via `resolveOptionalField` (`lib/crew/agendaDisplay.ts:26`).

**Why these five fields:** `window.start`/`window.end` reach `DayCard.meta` as `"7:30am–5:50pm"` (§5.3); `showStart` reaches `DayCard.meta` (fragment day) and `KeyTimeAnchors.shows[].time` (§5.1); `ShowAnchor.time` is rendered by `KeyTimesStrip` (`KeyTimesStrip.tsx:78` value span); `setupTime` reaches the Set-day `DayCard.meta` as `"Setup 10:00PM"` (§5.3). All are raw sheet text → all can carry `TBD`/`N/A`/`TBA` sentinels and MUST hide, not render.

- [ ] Run the meta-test BEFORE any UI wiring lands to confirm it currently passes (baseline — the new fields aren't read by any tile/crew file yet, so the registry edit is a no-op until §5 UI tasks read them): `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts`. Expected: `5 passed` (the 5 existing tests in the `describe` block).
- [ ] Add the registry row. The pattern anchors on the ScheduleDay/anchor accessors used by `DayCard`/`KeyTimesStrip`/`ScheduleSection` so an unguarded read fails at CI. Edit `tests/components/tiles/_metaSentinelHidingContract.test.ts`, inserting AFTER the `agenda entry.room / av / finish / trt` entry (the last element of `GENERIC_OPTIONAL_FIELDS`, ~`:243`):

```ts
  // Per-day-schedule-keytimes spec §5.3 / §5.5 / §3.3: the RAW-RENDERED free-text
  // fields are the ScheduleDay window/showStart (DayCard meta "7:30am–5:50pm" /
  // fragment showStart) and dates.setupTime (Set-day "Setup 10:00PM"). Each is
  // raw sheet text rendered by DayCard meta and MUST route through
  // shouldHideGenericOptional so a 'TBD'/'N/A'/'TBA' sentinel hides rather than
  // rendering as content. Accessors used by the consumers:
  //   - `day.window.start` / `day.window.end` (DayCard window meta)
  //   - `day.showStart`     (DayCard fragment meta)
  //   - `dates.setupTime`   (Set-day DayCard "Setup …" meta)
  // NOTE (R2 finding 6): ShowAnchor.time is INTENTIONALLY NOT registered here —
  // it is sentinel-guarded at the SOURCE (`resolveKeyTimes` only emits anchors
  // whose value passes `isAbsentTime`, and the §5.1 decision table never emits an
  // absent/sentinel time), so the KeyTimesStrip value (`s.time` → `row.value`) is
  // already clean by construction; a render-time pattern here would be vacuous.
  {
    description: "ScheduleDay.window.start / window.end / showStart",
    pattern: /\b(window\??\.(start|end)\b|\bshowStart\b)/,
  },
  {
    description: "dates.setupTime (Set-day DayCard meta)",
    pattern: /\bdates\??\.setupTime\b|\bsetupTime\b/,
  },
```

- [ ] Run the meta-test again to confirm the registry edit alone keeps it green (no crew/tile file reads these yet at this point in the plan ordering): `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts`. Expected: `5 passed`.
- [ ] Negative-regression PROOF (defend the contract is live, not vacuous): temporarily append a stub file `components/crew/primitives/__sentinel_probe__.tsx` containing exactly `export const X = (day: any) => <span>{day.showStart}</span>;` (a raw `showStart` read with NO `shouldHideGenericOptional`/`resolveOptionalField`). Re-run the meta-test. Expected: the `every tile/crew file that consumes a §8.3 generic-optional field imports shouldHideGenericOptional` test FAILS with `components/crew/primitives/__sentinel_probe__.tsx: consumes [ScheduleDay.window.start / window.end / showStart] but does not route them through shouldHideGenericOptional`. This proves the new `showStart` pattern actually matches a crew read path. Then DELETE the probe file and re-run → `5 passed`. (Concrete failure mode caught: a future §5 UI task that reads `day.showStart`/`day.window.start`/`anchor.time`/`dates.setupTime` raw and forgets the predicate ships a `TBD` leak — this row makes that a CI failure, not a round-N adversarial finding.)
- [ ] `rm -f components/crew/primitives/__sentinel_probe__.tsx` (verify the probe is gone before committing): `git status --porcelain components/crew/primitives/__sentinel_probe__.tsx` → empty output.
- [ ] Commit: `git commit -am "test(crew): register ScheduleDay/ShowAnchor/setupTime free-text fields in sentinel-hiding meta-test"`

---

### Task 16: Downgrade converter `downgradeRunOfShow` + re-sync verifier script

**Files:**
- Create: `lib/data/downgradeRunOfShow.ts` (the rollback converter, §14)
- Create: `tests/data/downgradeRunOfShow.test.ts` (round-trip + drop-fields test)
- Create: `scripts/verify-resync-scheduletimes.ts` (the §7 release-gate artifact)
- Modify: `package.json:44`-area scripts block — add `"verify-resync-scheduletimes": "tsx scripts/verify-resync-scheduletimes.ts"`

**Interfaces:**
- Consumes: `type ScheduleDay = { entries: AgendaEntry[]; showStart: string | null; window: { start: string; end: string } | null }`, `type RunOfShow = Record<string, ScheduleDay>`, `decodeRunOfShow(raw: unknown): { value: RunOfShow | null; corrupt: boolean }` (`lib/data/decodeRunOfShow.ts` — retyped to `RunOfShow` by the data-model task), `AgendaEntry` (`lib/parser/types.ts:320-327`).
- Produces: `export function downgradeRunOfShow(map: RunOfShow): Record<string, AgendaEntry[]>` — entries-only; DROPS `showStart` and `window`. This is the §14 clean-rollback path: it restores OLD-decoder-valid data (the current decoder at `decodeRunOfShow.ts:56-59` rejects non-array day values as `corrupt`).
- The verifier script Produces nothing importable — it is a CLI that reads each affected show's `shows_internal.run_of_show`, decodes via `decodeRunOfShow`, compares against a per-show/per-ISO EXPECTED COVERAGE MAP, prints a PASS/FAIL table, and `process.exit(1)` on any miss.

**Converter (this task IMPLEMENTS it; the script's expected-map is DESCRIBED, not run):**

- [ ] Write the failing converter test FIRST. Create `tests/data/downgradeRunOfShow.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { downgradeRunOfShow } from "@/lib/data/downgradeRunOfShow";
import { decodeRunOfShow } from "@/lib/data/decodeRunOfShow";
import type { RunOfShow } from "@/lib/parser/types";

describe("downgradeRunOfShow — ScheduleDay map → legacy Record<iso, AgendaEntry[]>", () => {
  const titled: RunOfShow = {
    "2025-10-08": {
      entries: [
        { start: "7:15am", title: "Registration" },
        { start: "8:00am", title: "Leaders Breakfast" },
      ],
      showStart: "7:15am",
      window: null,
    },
  };

  test("titled day → entries only; showStart/window dropped", () => {
    const out = downgradeRunOfShow(titled);
    // Assert against the DATA SHAPE, not a rendered container (anti-tautology).
    expect(out["2025-10-08"]).toEqual([
      { start: "7:15am", title: "Registration" },
      { start: "8:00am", title: "Leaders Breakfast" },
    ]);
    // The legacy shape is a bare array — no object keys, no showStart/window.
    expect(Array.isArray(out["2025-10-08"])).toBe(true);
    expect((out["2025-10-08"] as unknown as Record<string, unknown>).showStart).toBeUndefined();
  });

  test("bare-window day (entries:[]) → empty legacy array (the window is unrepresentable in the old shape)", () => {
    const win: RunOfShow = {
      "2025-05-13": { entries: [], showStart: "7:30am", window: { start: "7:30am", end: "5:50pm" } },
    };
    const out = downgradeRunOfShow(win);
    expect(out["2025-05-13"]).toEqual([]);
  });

  test("downgrade output is array-shaped (OLD-decoder-valid) AND decodes clean under the new decoder", () => {
    const legacy = downgradeRunOfShow(titled);
    // OLD-decoder validity == every day value is a bare ARRAY. The PRE-Task-6
    // decoder requires arrays and corrupt-skips object days; downgrade restores
    // that array shape. (Plan-review finding 3: do NOT assert the OLD bare-array
    // shape out of the POST-Task-6 decoder — it now WRAPS arrays into ScheduleDay,
    // so the correct expected value below is the WRAPPED shape. The OLD decoder's
    // corrupt-skip-not-throw on a ScheduleDay object is pinned separately in
    // Task 6's decodeRunOfShow.test.ts, not here.)
    expect(Object.values(legacy).every((d) => Array.isArray(d))).toBe(true);
    const decoded = decodeRunOfShow(legacy);
    expect(decoded.corrupt).toBe(false);
    expect(decoded.value).toEqual({
      "2025-10-08": {
        entries: [
          { start: "7:15am", title: "Registration" },
          { start: "8:00am", title: "Leaders Breakfast" },
        ],
        showStart: null,
        window: null,
      },
    });
  });
});
```

- [ ] Run it — expect failure (module does not exist yet): `pnpm vitest run tests/data/downgradeRunOfShow.test.ts`. Expected: `Failed to resolve import "@/lib/data/downgradeRunOfShow"` / all 3 tests error.
- [ ] Minimal implementation. Create `lib/data/downgradeRunOfShow.ts`:

```ts
import type { AgendaEntry, RunOfShow } from "@/lib/parser/types";

/**
 * §14 clean-rollback converter. Maps the new ScheduleDay value shape back to
 * the LEGACY `Record<iso, AgendaEntry[]>` that the CURRENT (pre-fix) decoder
 * accepts (`lib/data/decodeRunOfShow.ts:56-72` requires an ARRAY day value;
 * a ScheduleDay OBJECT day is corrupt-skipped). Run this (or simply re-run the
 * OLD sync, which regenerates legacy arrays) before a deliberate rollback to
 * clear corrupt/tileError signals.
 *
 * LOSSY by design: `showStart` and `window` have no representation in the old
 * shape and are dropped. A bare-window day (entries:[]) downgrades to `[]`
 * (the window cannot be carried); the old code falls back to room anchors for
 * that day, which is exactly pre-fix behavior.
 */
export function downgradeRunOfShow(map: RunOfShow): Record<string, AgendaEntry[]> {
  const out: Record<string, AgendaEntry[]> = {};
  for (const [iso, day] of Object.entries(map)) {
    out[iso] = day.entries.map((e) => ({ ...e }));
  }
  return out;
}
```

- [ ] Run — expect pass: `pnpm vitest run tests/data/downgradeRunOfShow.test.ts`. Expected: `3 passed`.
- [ ] Negative-regression: temporarily change `out[iso] = day.entries.map(...)` to `out[iso] = day as unknown as AgendaEntry[]` (i.e. pass the ScheduleDay object through un-downgraded). Re-run → the round-trip test FAILS at `Object.values(legacy).every((d) => Array.isArray(d))` (the day is now an object, not an array) and at the wrapped-shape `toEqual` (the object's `showStart` is non-null). This proves the test pins "downgrade produces array-shaped, old-decoder-valid data", not a tautology. Revert → `3 passed`.

**Verifier script (IMPLEMENT the script body; ASSERT-SHAPE the expected-map; do NOT run against live Supabase in CI — it is a deploy-time `pnpm` artifact):**

- [ ] Create `scripts/verify-resync-scheduletimes.ts`. The expected coverage map is DERIVED from the live/fixture DATES TIME cells (§7 step 2): each recoverable show day maps to the field it should populate; deliberate end-only days map to an expected `SCHEDULE_TIME_UNPARSED` (asserted separately so they don't mask a real miss):

```ts
/**
 * §7 release-gate artifact. Reads each affected show's
 * `shows_internal.run_of_show` from the validation/prod Supabase (via the
 * established `supabase db query --linked` / `TEST_DATABASE_URL` mechanism —
 * the same surgical-apply path used for migrations), decodes via
 * decodeRunOfShow, and asserts a PER-SHOW, PER-ISO coverage map. FAILS
 * (exit 1) if ANY recoverable show day lacks its expected populated field —
 * NOT "≥1 day" (closes adversarial R8 finding 14). Run as:
 *     pnpm verify-resync-scheduletimes
 * after the forced re-sync (§7 step 1). Rollout is "complete" ONLY when green.
 */
import postgres from "postgres";
import { decodeRunOfShow } from "@/lib/data/decodeRunOfShow";
import type { RunOfShow } from "@/lib/parser/types";

/** Per recoverable show day: which ScheduleDay field MUST be populated. */
type DayExpectation =
  | { field: "entries" }          // titled run-of-show (Consultants, RPAS, FinTech)
  | { field: "window" }           // bare-window span (RIA, Asset-Mgmt)
  | { field: "showStart" }        // leading-start fragment (Redefining-FI Day 1)
  | { field: "unparsed" };        // deliberate end-only → expected SCHEDULE_TIME_UNPARSED, NOT a decoded day

/** drive_file_id → { isoDate → expectation }. CANONICAL live Drive IDs (gsheets-MCP
 *  recon 2026-06-22) + per-ISO field derived from each show's live DATES TIME cells.
 *  Each ISO is a member of that show's show.dates.showDays. East Coast (v1, no DATES
 *  TIME column — schedule rides the AGENDA grid) is intentionally EXCLUDED; it is not
 *  affected by this change. VB01–VB10/DRILL are Consultants clones (same ISOs) — add
 *  rows for any that are live-synced at deploy time. */
const EXPECTED: Record<string, Record<string, DayExpectation>> = {
  // Consultants Roundtable 2025 — titled both show days
  "1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4": {
    "2025-10-08": { field: "entries" }, // "7:15am - Registration … 5:35pm - Meeting Concludes"
    "2025-10-09": { field: "entries" }, // "7:30am - Reg & Breakfast … 4:30pm - Meeting Concludes"
  },
  // Redefining Fixed Income / Private Credit 2025 — Day 1 leading-start fragment, Day 2 end-only
  "1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg": {
    "2025-05-13": { field: "showStart" }, // "GS: 8:00 AM -"
    "2025-05-14": { field: "unparsed" },  // "GS: ... - 6:00 PM" — deliberate end-only
  },
  // RIA Investment Forum - Central 2025 — bare windows both days
  "1Ll_fx6Q24y6aTSqIV7YiruDKrYtezkkKrVCXVc4Cwkw": {
    "2025-06-25": { field: "window" }, // "7:30am - 5:50pm"
    "2025-06-26": { field: "window" }, // "7:45am - 12:15pm"
  },
  // Retirement Plan Advisor Institute (RPAS) Central 2026 — titled both show days
  "1vyZMRTqeFAJgocbSJM2_HDDMsUUJFBiLKk6WKq-dUYo": {
    "2026-03-24": { field: "entries" }, // 16-line agenda
    "2026-03-25": { field: "entries" },
  },
  // FinTech Forum CTO Summit 2026 — titled three show days
  "1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY": {
    "2026-05-04": { field: "entries" },
    "2026-05-05": { field: "entries" },
    "2026-05-06": { field: "entries" },
  },
  // Fixed Income Trading Summit 2025 — Day 1 empty TIME (no per-day data, not recoverable → omit),
  // Day 2 single terminal token "4:15pm - Meeting Concludes" → entry kept (showStart guarded null)
  "1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4": {
    "2025-10-21": { field: "entries" },
  },
};

/** VB01–VB10 + DRILL are Consultants byte-clones synced from the same folder
 *  (plan-review R2 finding 5 — the gate MUST cover them, not leave them as a
 *  deploy-time TODO). Their show-day dates can drift from edits, so we don't
 *  hardcode per-ISO fields; instead we FAIL-CLOSED: each MUST have a non-null,
 *  decode-clean run_of_show with ≥1 ScheduleDay carrying a populated field
 *  (proving the per-day capture ran on the clone). Drive IDs from the 2026-06-22
 *  folder enumeration. */
const REQUIRED_CLONE_IDS: string[] = [
  "1f2mV_cq0jdmJhrL-lD5Hn7PVnSRTkLyVjZMLGEbbh7k", // DRILL Consultants Fresh Copy
  "1kIA-qj_Uwj-y9pMbZxg_4ei_6fTixpgP0vpTfOaTjbY", // VB01
  "13j9ErFcM1BeUVy5vLD6S4-TYshM0QMgvm3KCvMj0Vo0", // VB02
  "17kPwZFyEt59qYcYyNNlm2iVQ2IpLzgQw-vopRtsZZJI", // VB03
  "1yj6DAnn3nSo3PFXW6vxNu7Y2IWtV8PySsUtjui1PKPc", // VB04
  "1Wvs2STSWJnoDxrhFMSd0qJmP0IR8tg3SbAk6-OxquAo", // VB05
  "1xOLemFr6cf-Su1i_wNIwkOT27RmqTU2G1BTaXBCcUB4", // VB06
  "1OcBwfeBkqbC5PEJi9xyPl2CkdiPS8wCQd8Oz2B_5eZg", // VB07
  "1YMi8tmiBeuf8DpQ3qhfnjMsrlwroRtzxbYDpZg20loo", // VB08
  "1TmaQkl0mgaCa97v5QDCe9vR1Q63xNk4aioCX3IRr_so", // VB09
  "1oV7SdkZvhnQZ3sN7vuDLVutGnUaDhFMzm3X8TArElUs", // VB10
];

function dayHasExpectedField(day: RunOfShow[string] | undefined, exp: DayExpectation): boolean {
  if (exp.field === "unparsed") return day === undefined; // must be ABSENT from runOfShow
  if (day === undefined) return false;
  switch (exp.field) {
    case "entries": return day.entries.length > 0;
    case "window": return day.window != null;
    case "showStart": return day.showStart != null;
  }
}

/** parse_warnings is a jsonb array of ParseWarning; the SCHEDULE_TIME_UNPARSED message
 *  embeds the ISO (Task 1 constructor), so an end-only day is "confirmed unparsed" only
 *  when BOTH (a) it is absent from run_of_show AND (b) its warning is present — a missing
 *  warning must NOT silently pass (plan-review finding 4). */
function hasUnparsedWarning(warnings: Array<{ code?: string; message?: string }>, iso: string): boolean {
  return warnings.some((w) => w.code === "SCHEDULE_TIME_UNPARSED" && (w.message ?? "").includes(iso));
}

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) { console.error("TEST_DATABASE_URL unset"); process.exit(2); }
  const sql = postgres(url, { prepare: false });
  let anyFail = false;
  const rows: Array<{ show: string; iso: string; expect: string; got: string; pass: boolean }> = [];

  for (const [driveId, dayMap] of Object.entries(EXPECTED)) {
    const [rec] = await sql<{ run_of_show: unknown; parse_warnings: unknown }[]>`
      SELECT si.run_of_show, si.parse_warnings
      FROM shows_internal si
      JOIN shows s ON s.id = si.show_id
      WHERE s.drive_file_id = ${driveId}
    `;
    const { value } = decodeRunOfShow(rec?.run_of_show ?? null);
    const decoded: RunOfShow = (value as RunOfShow) ?? {};
    const warnings = (Array.isArray(rec?.parse_warnings) ? rec!.parse_warnings : []) as Array<{
      code?: string; message?: string;
    }>;
    for (const [iso, exp] of Object.entries(dayMap)) {
      // For an `unparsed` day, BOTH the absence AND the expected warning must hold.
      const pass =
        exp.field === "unparsed"
          ? dayHasExpectedField(decoded[iso], exp) && hasUnparsedWarning(warnings, iso)
          : dayHasExpectedField(decoded[iso], exp);
      if (!pass) anyFail = true;
      rows.push({
        show: driveId, iso, expect: exp.field,
        got:
          exp.field === "unparsed"
            ? (decoded[iso] ? "PRESENT(!)" : "absent") + (hasUnparsedWarning(warnings, iso) ? "+warn" : "+NO-warn(!)")
            : decoded[iso] ? JSON.stringify(decoded[iso]).slice(0, 60) : "ABSENT",
        pass,
      });
    }
  }

  // Clone copies (VB/DRILL) — FAIL-CLOSED presence + recovered-something check
  // (R2 finding 5: the gate must not pass while required clones are unverified).
  for (const driveId of REQUIRED_CLONE_IDS) {
    const [rec] = await sql<{ run_of_show: unknown }[]>`
      SELECT si.run_of_show
      FROM shows_internal si
      JOIN shows s ON s.id = si.show_id
      WHERE s.drive_file_id = ${driveId}
    `;
    const { value, corrupt } = decodeRunOfShow(rec?.run_of_show ?? null);
    const decoded: RunOfShow = (value as RunOfShow) ?? {};
    const recoveredSomething = Object.values(decoded).some(
      (d) => d.entries.length > 0 || d.showStart != null || d.window != null,
    );
    const pass = rec !== undefined && !corrupt && recoveredSomething;
    if (!pass) anyFail = true;
    rows.push({
      show: driveId, iso: "(clone)", expect: "present+recovered",
      got: rec === undefined ? "NO-ROW(!)" : corrupt ? "CORRUPT(!)" : recoveredSomething ? "ok" : "EMPTY(!)",
      pass,
    });
  }

  // Per-show / per-day PASS/FAIL table.
  console.table(rows);
  await sql.end();
  if (anyFail) { console.error("verify-resync-scheduletimes: FAIL — recoverable day(s) missing, unparsed warning absent, or a required clone unverified"); process.exit(1); }
  console.log("verify-resync-scheduletimes: PASS — all recoverable days + required clones covered");
}

main().catch((e) => { console.error(e); process.exit(2); });
```

- [ ] Add the `pnpm` script. Edit `package.json` after `"test:e2e:ui"` (`:45`): add `"verify-resync-scheduletimes": "tsx scripts/verify-resync-scheduletimes.ts",`.
- [ ] Verify the script TYPECHECKS (does NOT execute it against live Supabase — that runs only at deploy time per §7): `pnpm exec tsc --noEmit`. Expected: no errors referencing `scripts/verify-resync-scheduletimes.ts`. The `EXPECTED` map carries the CANONICAL live Drive IDs + concrete per-ISO field expectations inline (plan-review finding 4 — NOT placeholders), and `REQUIRED_CLONE_IDS` carries the VB01–VB10 + DRILL clone IDs with a fail-closed presence+recovered check (plan-review finding 5). No deploy-time ID fill-in is required; the gate is concrete and enforceable as committed.
- [ ] DESCRIBE-only verification of the expected-map shape (no DB): add a fixture-shape unit test `tests/data/verifyResyncExpectedMap.test.ts` that imports nothing from the script (the script does live I/O) but re-states the contract — assert via `dayHasExpectedField`-style logic that (a) an `entries`-expectation day with `entries.length===0` FAILS, (b) a `window`-expectation day with `window:null` FAILS, (c) an `unparsed`-expectation day FAILS when the day IS present (it must be ABSENT). This pins the per-ISO, per-field contract (not "≥1 day") in CI without a live connection:

```ts
import { describe, expect, test } from "vitest";
import type { RunOfShow } from "@/lib/parser/types";

// Mirror of scripts/verify-resync-scheduletimes.ts dayHasExpectedField — kept
// here so the per-field, per-ISO contract is CI-pinned (the script itself is a
// deploy-time live-DB artifact, not runnable in CI).
type DayExpectation = { field: "entries" | "window" | "showStart" | "unparsed" };
function dayHasExpectedField(day: RunOfShow[string] | undefined, exp: DayExpectation): boolean {
  if (exp.field === "unparsed") return day === undefined;
  if (day === undefined) return false;
  if (exp.field === "entries") return day.entries.length > 0;
  if (exp.field === "window") return day.window != null;
  return day.showStart != null;
}

describe("verify-resync expected-map contract (per-ISO, per-field — NOT ≥1 day)", () => {
  test("entries-expectation day with empty entries FAILS (a recovered-titled-day miss is not masked)", () => {
    expect(dayHasExpectedField({ entries: [], showStart: null, window: null }, { field: "entries" })).toBe(false);
  });
  test("window-expectation day with null window FAILS", () => {
    expect(dayHasExpectedField({ entries: [], showStart: "7:30am", window: null }, { field: "window" })).toBe(false);
  });
  test("unparsed-expectation day FAILS when the day is PRESENT (deliberate-absence must stay absent)", () => {
    expect(dayHasExpectedField({ entries: [], showStart: "6:00pm", window: null }, { field: "unparsed" })).toBe(false);
    expect(dayHasExpectedField(undefined, { field: "unparsed" })).toBe(true);
  });
  test("a fully-recovered show day PASSES", () => {
    expect(dayHasExpectedField({ entries: [{ start: "7:15am", title: "Reg" }], showStart: "7:15am", window: null }, { field: "entries" })).toBe(true);
  });

  // unparsed days require BOTH absence AND the SCHEDULE_TIME_UNPARSED warning (finding 4).
  function hasUnparsedWarning(ws: Array<{ code?: string; message?: string }>, iso: string): boolean {
    return ws.some((w) => w.code === "SCHEDULE_TIME_UNPARSED" && (w.message ?? "").includes(iso));
  }
  test("unparsed day absent BUT no warning → must FAIL (a missing warning cannot silently pass)", () => {
    const absent = dayHasExpectedField(undefined, { field: "unparsed" }); // true (absent)
    const warned = hasUnparsedWarning([], "2025-05-14"); // false (no warning)
    expect(absent && warned).toBe(false); // the script ANDs both → overall FAIL
  });
  test("unparsed day absent AND warning present → PASS", () => {
    const warned = hasUnparsedWarning(
      [{ code: "SCHEDULE_TIME_UNPARSED", message: "SHOW DAY 2025-05-14 TIME cell has content but…" }],
      "2025-05-14",
    );
    expect(dayHasExpectedField(undefined, { field: "unparsed" }) && warned).toBe(true);
  });
});
```
  Run: `pnpm vitest run tests/data/verifyResyncExpectedMap.test.ts`. Expected: `6 passed`. (Concrete failure modes caught: (a) a "≥1 day recovered" verifier would PASS a 2-day show with Day 1 recovered but Day 2 still legacy/null — this contract FAILS it; (b) an end-only day silently dropped WITHOUT its `SCHEDULE_TIME_UNPARSED` warning would pass an absence-only check — the AND with `hasUnparsedWarning` FAILS it.)
- [ ] Commit: `git commit -am "feat(data): downgradeRunOfShow rollback converter + verify-resync-scheduletimes release-gate script"`

---

### Task 17: Layout-dimensions real-browser gate (`tests/e2e/crew-layout-dimensions.spec.ts`)

**Files:**
- Modify: `tests/e2e/crew-layout-dimensions.spec.ts` (extend the existing Task-10 suite with the new per-day-schedule-keytimes invariants — the file already has the harness: `signInAs(ADMIN_FIXTURE)`, `lookupSeededShow`, `rectOf`, mobile-safari single-writer, `X-Screenshot-Frozen-Now` clock pin, and the `shows_internal.run_of_show` beforeAll/afterAll seed)
- Test: this file IS the real-browser test.

**Interfaces:**
- Consumes (rendered DOM only — asserts against `getBoundingClientRect()`, the layout engine, NOT a data container): `[data-testid="key-times-strip"]` row cells (`KeyTimesStrip.tsx:71` container, `:74` per-anchor `[data-anchor]`), `[data-testid="day-card"]` + `[data-testid="day-card-date"]` + the `self-stretch` vline (`DayCard.tsx:61,72,86`) + `[data-slot="day-card-meta"]` (`DayCard.tsx:104`), `[data-testid="schedule-grid"]` with `min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-start` (`ScheduleSection.tsx:159`).
- Produces: nothing — a Playwright assertion gate. Baselines/screenshots are NOT touched by this suite (it reads rects, it does not snapshot), but per §5.5 any committed screenshot baseline regen for the redesigned crew surfaces goes through the **amd64 docker `screenshots-regen` workflow_dispatch** (`.github/workflows/screenshots-regen.yml`), NEVER local arm64 (byte-comparison gate).

**§5.5 Dimensional Invariants (the exact list this suite must pin):**

| Parent → child | Relationship | Guaranteeing class/style |
|---|---|---|
| `KeyTimesStrip` row-layout container → each anchor cell | equal width across N cells | `min-[720px]:flex-1` on each cell |
| row-layout container → hairline dividers | full-height rules between cells | `min-[720px]:divide-x min-[720px]:divide-border`, `first:pl-0/last:pr-0` |
| `DayCard` row → `self-stretch` vline | vline fills the taller (meta-bearing) row height | `self-stretch` on the vline span (`DayCard.tsx:86`) — must still fill when meta adds height |
| `DayCard` → date badge | fixed 50px column regardless of meta | `w-12.5 shrink-0` (`DayCard.tsx:72`) |
| Schedule split-wide grid → columns | natural height (not stretch) | `min-[720px]:items-start` (DESIGN.md 2026-06-21 amendment) |

- [ ] Seed a MULTI-anchor + meta-bearing render in the existing `beforeAll`. The current `SHOW_DAY_1_AGENDA` seeds ONE titled day; extend it to also seed a BARE-WINDOW day (so a `[data-slot="day-card-meta"]` row exists, making the `self-stretch`-fills-taller-row assertion meaningful) and a second show day (so `KeyTimesStrip` renders ≥2 `[data-anchor]` cells for the equal-width assertion). Edit the seeded `run_of_show` object to the new `ScheduleDay` shape:

```ts
const SEED_RUN_OF_SHOW = {
  "2026-04-21": { // titled show day 1 (existing entries)
    entries: SHOW_DAY_1_AGENDA["2026-04-21"],
    showStart: "7:30am",
    window: null,
  },
  "2026-04-22": { // bare-window show day 2 → DayCard meta "8:00am–5:30pm"
    entries: [],
    showStart: "8:00am",
    window: { start: "8:00am", end: "5:30pm" },
  },
};
```
  (Member ISOs of `show.dates.showDays` so the read-time intersection at `getShowForViewer.ts:545-571` retains them for the admin `{kind:'none'}` viewer.)

- [ ] Write the failing assertion block. Append to the mobile-safari-gated `describe` (after the existing Schedule split-wide assertions):

```ts
test("§5.5 KeyTimesStrip row cells are equal-width at ≥720px", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1200 });
  await gotoSection(page, "today"); // Today wide → KeyTimesStrip layout="row". NO crewUrl — gotoSection is the harness helper (crew-layout-dimensions.spec.ts:226) that navigates /show/${slug}/${shareToken}?s=<section> with the frozen-now header.
  const cells = page.locator('[data-testid="key-times-strip"][data-layout="row"] [data-anchor]');
  const n = await cells.count();
  expect(n, "expected ≥2 row anchors (Set + ≥1 Show)").toBeGreaterThanOrEqual(2);
  const widths: number[] = [];
  for (let i = 0; i < n; i++) widths.push((await rectOf(cells.nth(i))).width);
  // DERIVED expectation (anti-hardcode): every cell ≈ the first cell's width.
  const w0 = widths[0];
  for (const w of widths) expect(Math.abs(w - w0)).toBeLessThanOrEqual(2);
});

test("§5.5 DayCard self-stretch vline fills the TALLER (meta-bearing) row", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1200 });
  await gotoSection(page, "schedule");
  // The bare-window day-2 card carries a meta line → it is the taller card.
  const metaCard = page.locator('[data-testid="day-card"]', {
    has: page.locator('[data-slot="day-card-meta"]'),
  }).first();
  const cardRect = await rectOf(metaCard);
  const vline = metaCard.locator('span.self-stretch').first();
  const vlineRect = await rectOf(vline);
  // The vline must fill the full row height (Tailwind v4 .flex ≠ items-stretch;
  // self-stretch is the guarantee). Account for the card's p-3 (12px each side).
  expect(Math.abs(vlineRect.height - (cardRect.height - 24))).toBeLessThanOrEqual(0.5);
});

test("§5.5 date badge is the fixed 50px (w-12.5) column regardless of meta", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1200 });
  await gotoSection(page, "schedule");
  const badges = page.locator('[data-testid="day-card-date"]');
  for (let i = 0; i < (await badges.count()); i++) {
    expect((await rectOf(badges.nth(i))).width).toBeCloseTo(50, 0); // w-12.5 = 3.125rem = 50px
  }
});

test("§5.5 schedule split-wide grid is items-start (natural height, NOT stretch) at ≥720px", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1200 });
  await gotoSection(page, "schedule");
  const cols = page.locator('[data-testid="schedule-grid"] [data-testid="schedule-column"]');
  expect(await cols.count()).toBe(2);
  const left = await rectOf(cols.nth(0));
  const right = await rectOf(cols.nth(1));
  // 1.6fr / 1fr ratio (DERIVED tolerance, not a hardcoded px width).
  expect(left.width / right.width).toBeGreaterThan(1.45);
  expect(left.width / right.width).toBeLessThan(1.75);
  // items-start: the SHORTER column is NOT stretched to the taller's height.
  expect(Math.abs(left.height - right.height)).toBeGreaterThan(2);
});
```

- [ ] Run — expect failure on the new blocks until §5 UI tasks land the reshaped `KeyTimesStrip` (N rows), the bare-window `DayCard.meta`, and the `items-start` grid: `pnpm test:e2e -- crew-layout-dimensions.spec.ts --project=mobile-safari`. Expected: the four new tests FAIL (e.g. `expected ≥2 row anchors` — the strip currently renders the single legacy `show` anchor; `day-card-meta` not found — meta not yet wired).
- [ ] After the §5 UI tasks (KeyTimesStrip N-row, DayCard meta, items-start grid) are implemented, re-run: `pnpm test:e2e -- crew-layout-dimensions.spec.ts --project=mobile-safari`. Expected: all tests pass (the existing Task-10 invariants + the 4 new §5.5 invariants).
- [ ] Negative-regression (prove the `self-stretch` test catches a real collapse): temporarily change `DayCard.tsx:86`'s vline class from `w-px self-stretch bg-border` to `w-px bg-border` (drop `self-stretch`). Re-run the vline test → it FAILS (the vline collapses to content height, no longer `cardRect.height - 24`). Revert. (Concrete failure mode caught: a Tailwind-v4 stretch-collapse where the vline shrinks when meta adds row height — invisible to jsdom unit tests, only a real layout engine catches it.)
- [ ] Note for the deploy step (NOT a test step — a comment in the spec/handoff): if the crew screenshot baselines change for the redesigned surfaces, regenerate via `gh workflow run screenshots-regen.yml --ref <branch>` (amd64 native runner), then empty-commit re-trigger if GITHUB_TOKEN push doesn't re-fire `screenshots-drift` — NEVER capture locally on arm64 (byte-comparison gate, §5.5).
- [ ] Commit: `git commit -am "test(crew): real-browser §5.5 dimensional invariants for KeyTimesStrip/DayCard/schedule grid"`

---

### Task 18: Transition audit — SSR-instant surfaces + RightNowHero client-state

**Files:**
- Modify: `tests/e2e/right-now-transitions.spec.ts` (extend with the new `showAnchors` day-selection transitions — the file already has `page.clock.install`, `setSystemTime`, `pinClock`, `driveToState`, `lookupSeededShow` helpers)
- Create: `tests/crew/transitionAudit.test.ts` (the structural SSR-instant audit — asserts the four SSR surfaces carry no `'use client'`/`AnimatePresence`/`framer-motion`/`exit`/`initial`/`animate`)
- Test: both files above.

**Interfaces:**
- Consumes: the source text of `components/crew/primitives/KeyTimesStrip.tsx`, `components/crew/primitives/DayCard.tsx`, `components/crew/sections/ScheduleSection.tsx`, `components/crew/sections/TodaySection.tsx` (SSR surfaces — must stay instant); `components/crew/RightNowHero.tsx` (the ONE client component, `RightNowHero.tsx:38 "use client"`, `:41` `framer-motion`, `:495` `AnimatePresence`); `type ShowAnchor = { date: string; label: string; time: string }`; `RightNowContext` GAINS `showAnchors: ShowAnchor[]`; `RightNowHero` selects the anchor whose `date === todayIso` (`RightNowHero.tsx:215` `formatIsoForTimezone(now, ctx.timezone)`).
- Produces: nothing — an audit gate.

**§5.7 Transition Inventory (the exact tables this audit pins):**

| Client-state transition | Treatment |
|---|---|
| show-tz **midnight rollover** Day 1 → Day 2 (anchors differ) | the displayed call time must re-select to the NEW day's anchor — NOT keep Day 1's (no stale-anchor freeze) |
| context **recovery / last-good fallback** | on recovery, re-select by the current `todayIso`; a last-good cache must not pin a prior day's call time |
| non-show "now" → show day | call time appears only once "now" is a show day in show tz |

| State pair | Treatment |
|---|---|
| KeyTimesStrip: zero anchors ↔ set/strike-only ↔ single-show ↔ multi-show (1↔N rows) | instant — SSR render fork, no animation |
| DayCard: meta present ↔ absent (window vs none) | instant — SSR render fork |
| ScheduleSection: per-day `RunOfShowList` present ↔ absent | instant — SSR render fork (existing behavior, unchanged) |
| Today Key Times: today-filtered (`shows` 0/1) ↔ Schedule full (`shows` N) | instant — distinct renders, not a runtime transition |

- [ ] Write the failing SSR-instant audit FIRST. Create `tests/crew/transitionAudit.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
// §5.7: these four surfaces are synchronous Server Components — every visual
// difference across viewers/days/show-counts is a distinct render, NOT an
// in-page animated transition. They MUST NOT gain 'use client', framer-motion,
// AnimatePresence, or exit/initial/animate motion props.
const SSR_SURFACES = [
  "components/crew/primitives/KeyTimesStrip.tsx",
  "components/crew/primitives/DayCard.tsx",
  "components/crew/sections/ScheduleSection.tsx",
  "components/crew/sections/TodaySection.tsx",
];

describe("§5.7 SSR surfaces stay instant (no client motion)", () => {
  for (const rel of SSR_SURFACES) {
    test(`${rel} is a synchronous Server Component (no 'use client'/framer/AnimatePresence/motion props)`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(/['"]use client['"]/.test(src), "must NOT be a client component").toBe(false);
      expect(/framer-motion/.test(src), "must NOT import framer-motion").toBe(false);
      expect(/AnimatePresence/.test(src), "must NOT use AnimatePresence").toBe(false);
      // No motion props on any ternary/conditional render — these surfaces fork
      // SSR output, they do not animate between states.
      expect(/\b(exit|initial|animate)\s*=/.test(src), "must carry NO exit/initial/animate motion props").toBe(false);
    });
  }
});

describe("§5.7 RightNowHero IS the single client component (inverse guard)", () => {
  test("RightNowHero carries 'use client' + framer-motion (the ONE animated surface)", () => {
    const src = readFileSync(join(ROOT, "components/crew/RightNowHero.tsx"), "utf8");
    expect(/['"]use client['"]/.test(src)).toBe(true);
    expect(/framer-motion/.test(src)).toBe(true);
    // It must select the dated anchor by the client-computed show-tz todayIso.
    expect(/formatIsoForTimezone\(now,\s*ctx\.timezone\)/.test(src)).toBe(true);
  });
});
```

- [ ] Run — expect PASS already for the SSR surfaces (they have no client motion today and the reshape adds none), and the inverse guard passes (RightNowHero is already a client component): `pnpm vitest run tests/crew/transitionAudit.test.ts`. Expected: `5 passed` (4 SSR + 1 inverse). If any SSR surface FAILS, a UI task wrongly added `'use client'`/motion — STOP and remove it (the reshape is render-fork-only per §5.7).
- [ ] Negative-regression (prove the SSR audit is live): temporarily add `'use client';` to the top of `components/crew/primitives/KeyTimesStrip.tsx`. Re-run → the `KeyTimesStrip … synchronous Server Component` test FAILS. Revert → `5 passed`. (Concrete failure mode caught: a future task converting a render-fork into a client animation — §5.7 mandates all four surfaces stay instant.)
- [ ] Now the RightNowHero CLIENT-STATE transitions (the substantive part). Add a **NON-skipped** `test.describe` to `tests/e2e/right-now-transitions.spec.ts` (the file's existing audits are `test.describe.skip(...)` — this NEW describe must NOT be skipped, R3 finding 3). Use the LIVE harness exactly: `lookupSeededShow()` → `s`, the real crew URL `/show/${s.slug}?crew=${s.leadCrewId}` (NO `crewUrl`), `pinClock`/`driveToState(page, s, state)` (3-arg). Seed a 2-show-day `run_of_show` with DISTINCT Day-1/Day-2 anchors in `beforeAll` (mirror Task 17's `SEED_RUN_OF_SHOW`) and derive expected times from the seed.

  **Client-clock control:** per-day re-selection is CLIENT-side (`RightNowHero` reads `now` via the 60s tick, `RightNowHero.tsx:215`/`:327`), so these tests drive the CLIENT clock with Playwright's `page.clock` API (distinct from the server-side frozen-now header `pinClock` uses). **Implementer verify step:** before writing assertions, confirm (a) `RightNowHero`'s `now` is `page.clock`-controllable (if the app pins the client clock only via the frozen-now header, drive each render with `pinClock(page, iso)` + reload instead, asserting the per-render selection), and (b) the hero root test-id (`grep data-testid components/crew/RightNowHero.tsx` — the body island is `right-now-body` per `:32`). Adapt the two mechanisms below to whichever the live hero uses.

```ts
test.describe("RightNow per-day Show anchor selection (§5.7)", () => {
  let s: Awaited<ReturnType<typeof lookupSeededShow>>;
  test.beforeAll(async () => {
    s = await lookupSeededShow();
    // seed s.showId run_of_show: Day1 2026-04-21 → showStart 7:30am; Day2 2026-04-22 → showStart 8:00am
    // (distinct anchors so a stale freeze is observable). Use the same seed helper Task 17 uses.
  });

  test("midnight rollover Day1→Day2: call time re-selects the NEW day's anchor (no stale freeze)", async ({ page }) => {
    const day1Time = "7:30am", day2Time = "8:00am";
    await page.clock.install({ time: new Date("2026-04-21T12:00:00Z") });
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    await expect(page.getByTestId("right-now-body")).toContainText(day1Time);
    await page.clock.setSystemTime(new Date("2026-04-22T12:00:00Z"));
    await page.clock.runFor(60_000); // the hero's 60s re-derive tick
    await expect(page.getByTestId("right-now-body")).toContainText(day2Time);
    await expect(page.getByTestId("right-now-body")).not.toContainText(day1Time);
  });

  test("recovery/last-good does not pin a prior day's call time", async ({ page }) => {
    // Real degraded→recover via the harness STATE_DRIVERS (the skipped 66-pair suite
    // drives `driveToState(page, s, entry.from/to)`). Enter a degraded-zone kind, then
    // recover into show_day_n on Day 2 and assert the CURRENT day's anchor.
    const day2Time = "8:00am";
    await driveToState(page, s, "viewer_off_day"); // a degraded-zone kind (RightNowHero §4.3 set)
    await page.clock.install({ time: new Date("2026-04-22T12:00:00Z") });
    await driveToState(page, s, "show_day_n");      // recover to Day 2
    await page.clock.runFor(60_000);
    await expect(page.getByTestId("right-now-body")).toContainText(day2Time);
  });

  test("non-show now → show day: call time appears only once now is a show day", async ({ page }) => {
    const showTime = "7:30am";
    await page.clock.install({ time: new Date("2026-04-20T12:00:00Z") }); // pre-show travel day
    await page.goto(`/show/${s.slug}?crew=${s.leadCrewId}`);
    await expect(page.getByTestId("right-now-body")).not.toContainText(showTime);
    await page.clock.setSystemTime(new Date("2026-04-21T12:00:00Z"));
    await page.clock.runFor(60_000);
    await expect(page.getByTestId("right-now-body")).toContainText(showTime);
  });
});
```
  (Confirm `driveToState`'s exact state keys against the harness's `STATE_DRIVERS`/the existing skipped suite during impl; `viewer_off_day`/`show_day_n` are `RightNowState` kinds from `lib/time/rightNow.ts:57-77`.)

- [ ] Run — expect failure until `RightNowContext.showAnchors` + the `RightNowHero` `todayIso`-selection (`RightNowHero.tsx:215`) land: `pnpm test:e2e -- right-now-transitions.spec.ts --project=mobile-safari`. Expected: the 3 new tests FAIL (e.g. Day-2 time never appears — selection not yet wired). Confirm the new describe is NOT skipped (it appears in the run, does not report `skipped`).
- [ ] After the `buildRightNowContext` (`showAnchors`) + `RightNowHero` selection tasks land, re-run: `pnpm test:e2e -- right-now-transitions.spec.ts --project=mobile-safari`. Expected: all pass (existing matrix + 3 new client-state transitions).
- [ ] Negative-regression (prove the midnight-rollover test catches a freeze): temporarily change the `RightNowHero` anchor selection to always pick `showAnchors[0]` (ignore `todayIso`). Re-run the midnight-rollover test → it FAILS (`day1Time` persists into Day 2, `not.toContainText(day1Time)` trips). Revert. (Concrete failure mode caught: the §5.7 stale-anchor freeze — the live clock advances but the displayed call time pins Day 1's anchor.)
- [ ] Commit: `git commit -am "test(crew): §5.7 transition audit — SSR surfaces instant + RightNowHero day-anchor re-selection"`

---

### Task 19: impeccable dual-gate UI close-out (UI — Opus + impeccable)

**Files:**
- No code changes IN this task — it is the milestone UI close-out gate (invariant 8). It RUNS against the UI diff produced by the §5 UI tasks.
- Modify (only if findings are deferred): `DEFERRED.md` (one entry per deferred HIGH/CRITICAL), and the milestone handoff doc §12 (findings + dispositions).

**Interfaces:**
- Consumes: the UI diff for the per-day-schedule-keytimes surfaces — `components/crew/primitives/KeyTimesStrip.tsx`, `components/crew/primitives/DayCard.tsx`, `components/crew/sections/ScheduleSection.tsx`, `components/crew/sections/TodaySection.tsx`, `components/crew/RightNowHero.tsx` (and `components/right-now/buildRightNowContext.ts` only insofar as it feeds the hero — it is non-UI-rendering but the hero render depends on its `showAnchors` output).
- Produces: critique + audit verdicts; HIGH/CRITICAL findings each FIXED in a follow-up commit OR recorded in `DEFERRED.md` with a concrete trigger; dispositions recorded in the handoff doc §12. This gate runs BEFORE adversarial review (Codex) and BEFORE the milestone is marked closed (invariant 8).

This is a PROCESS task. The dual-gate is EXTERNAL attestation (fresh subagent / user), not self-attested. Run with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register identification → preflight signal).

- [ ] Confirm all §5 UI tasks have landed and their tests are green (the gate runs on the FINAL UI diff, not a partial one): `pnpm vitest run tests/crew/ tests/components/ && pnpm test:e2e -- crew-layout-dimensions.spec.ts right-now-transitions.spec.ts --project=mobile-safari`. Expected: all pass.
- [ ] Stage the UI diff for review (the exact surfaces): `git diff main -- components/crew/primitives/KeyTimesStrip.tsx components/crew/primitives/DayCard.tsx components/crew/sections/ScheduleSection.tsx components/crew/sections/TodaySection.tsx components/crew/RightNowHero.tsx`. Confirm the diff is non-empty and covers all five surfaces.
- [ ] Run the critique gate on the affected diff with v3 preflight gates: invoke `/impeccable critique` (via the `impeccable` skill) scoped to the five surfaces above. Preflight must read PRODUCT.md + DESIGN.md, identify the register (mobile-first crew page), and emit the preflight signal before critiquing. Record HIGH/CRITICAL findings.
- [ ] Run the audit gate on the same diff: invoke `/impeccable audit` (via the `impeccable` skill) with the same v3 preflight gates. Record HIGH/CRITICAL findings. (Both commands are required — invariant 8 is a dual-command run; one is not sufficient.)
- [ ] For each HIGH/CRITICAL finding: either FIX it in a follow-up commit (`fix(crew): <impeccable finding summary>`) and re-run the affected vitest/e2e, OR add a `DEFERRED.md` entry with a concrete trigger and rationale. No HIGH/CRITICAL may be left silently open.
- [ ] Re-run BOTH gates on the post-fix diff to confirm no HIGH/CRITICAL remain unaddressed (re-attestation after fixes — external, not self-attested).
- [ ] Record findings + dispositions in §12 of the milestone handoff doc (the dual-gate run, each finding, fixed-or-deferred disposition, and the `DEFERRED.md` references). This section is required before adversarial review (Codex) fires and before the milestone is marked closed.
- [ ] Verify against the design mock for fidelity: per the project rule, since this UI derives from a Claude design mock, cross-check the rendered KeyTimesStrip/DayCard/Schedule/Today/RightNowHero against the mock (impeccable critique is UX-authoritative but NOT product-contract-authoritative — spec-check any copy/label rewrites the critique proposes against §5.1–§5.4 before applying, e.g. the `"Day 1 · Wed 10/8"` anchor label copy from §3.3).
- [ ] Commit any fixes + handoff/DEFERRED updates: `git commit -am "docs(crew): impeccable dual-gate dispositions for per-day schedule key-times UI"` (a no-op-fixes run still commits the handoff §12 + DEFERRED entries).

---

## Task 20: Plan self-review + cross-model adversarial review + execution handoff

- [ ] **Self-review** (orchestrator): spec-coverage sweep (every §N maps to a task), placeholder scan, type-consistency against the pinned contract.
- [ ] **Cross-model adversarial review (Codex)** on this plan via the adversarial-review skill — iterate to APPROVE (no round budget). Reviewer-only.
- [ ] **Execution** via subagent-driven-development (fresh subagent per task, two-stage review); UI tasks routed to Opus + impeccable.
- [ ] **CI → PR → merge** (merge commit); then run the re-sync release gate (Task 16) against validation.
