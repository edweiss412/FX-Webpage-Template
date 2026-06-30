# Unified Show-Day Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the crew Today view, render one chronological timeline interleaving the crew's operational run-of-show entries with the PDF agenda's sessions for today, with the two sources visually distinguished.

**Architecture:** Three pure, independently-tested modules (`clockToMinutes`, `agendaDayForToday`, `showDayTimeline`) feed a new `ShowDayTimelineList` component; `TodaySection` wires inputs and branches the existing "Run of show" card body. Render-time derivation only — no DB/parser/extractor change, no re-extraction, no `EXTRACTOR_VERSION` bump.

**Tech Stack:** Next.js 16 RSC, React, TypeScript, Vitest + Testing Library (jsdom), Playwright (real-browser layout). Spec: `docs/superpowers/specs/2026-06-29-unified-show-day-timeline-design.md` (Codex-APPROVED, 4 rounds).

## Global Constraints (from the spec — every task implicitly includes these)

- **Render-time only.** No write to DB; no edit to `lib/parser/*`, `lib/agenda/extractAgendaSchedule.ts`, `supabase/`, `app/api/`, or `EXTRACTOR_VERSION`. (D5)
- **Ratified decisions:** Today-view only (D1); crew rows emphasized + agenda rows muted "event" context, **distinct from the muted synthetic-crew row** (D2); conservative dedup, **crew wins**, exact `minute + normTitle` (D3); day-match = parse `dayLabel` date then **guarded** positional fallback (D4); **agenda-only day still renders** the card (D6); **tracks omitted** (D7); Today card title stays **"Run of show"** (D8).
- **`clockToMinutes` lives in `lib/time/`** (string→minute-of-day primitive).
- **UI surfaces** (`ShowDayTimelineList`, `TodaySection`, `DESIGN.md`) ship only after the **impeccable v3 dual-gate** (invariant 8) — `/impeccable critique` + `/impeccable audit`.
- **Anti-tautology test rules (AGENTS.md):** sort/order tests use a **non-sorted** input fixture and assert a **constant** expected order; the digit-collapse and dedup tests are **mutation-verified** (removing the named line flips the test); DOM scans **clone + scope** to the card; component fixtures use the real `makeShowForViewer()` (`tests/fixtures/showForViewer.ts`); derive expected counts from the fixture, never literals.
- **Commit per task**, conventional-commits (`feat(crew):` / `test(crew):` / `refactor(crew):`).

## Meta-test inventory (AGENTS.md, declared)

**No structural meta-test is created or extended.** This is a frontend render-time merge with **no** Supabase call boundary, **no** advisory lock, **no** `admin_alerts` catalog row, **no** new DB table, **no** new error code, **no** new API route. The behavior is pinned by the pure-module + component behavioral tests below. (Declared explicitly per the rule; "none applies because the change is render-time pure-function + component rendering" is the reason.)

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/time/clockToMinutes.ts` | string→minute-of-day (both clock formats, range→start, range-validated) | NEW |
| `lib/crew/agendaDayForToday.ts` | `parseIsoFromDayLabel` + `agendaSessionsForToday` (normalize, day-match, placeable filter, multi-link aggregate) | NEW |
| `lib/crew/showDayTimeline.ts` | `TimelineItem` + `buildShowDayTimeline` (sort, dedup) | NEW |
| `components/crew/primitives/ShowDayTimelineList.tsx` | render the discriminated timeline (crew rows reuse `RunOfShowEntry`; agenda rows = `AgendaSessionRow`; synthetic-exempt chronological cap) | NEW |
| `components/crew/primitives/RunOfShowList.tsx` | export `RunOfShowEntry` for reuse | MODIFY (export only) |
| `components/crew/sections/TodaySection.tsx` | compute `agendaToday`; `modeA` gate; card-body branch | MODIFY (`:211-215`, `:598`) |
| `DESIGN.md` | unified-timeline card subsection (impeccable artifact) | MODIFY |
| tests (5 files) | per-module + component + layout-dimensions + modeA extension | NEW/MODIFY |

---

## Task 1: `clockToMinutes` (pure, no deps)

**Files:**
- Create: `lib/time/clockToMinutes.ts`
- Test: `tests/time/clockToMinutes.test.ts`

**Interfaces:**
- Produces: `clockToMinutes(raw: string): number | null` — minute-of-day for a sheet (`normClock`) or agenda (`fmtClock`) clock; range → start; impossible/garbage/no-meridiem → `null`.

- [ ] **Step 1: Write the failing test** (`tests/time/clockToMinutes.test.ts`)

```ts
import { describe, expect, test } from "vitest";
import { clockToMinutes } from "@/lib/time/clockToMinutes";

describe("clockToMinutes", () => {
  test("bare hour ≡ explicit minutes (catches a parser that ignores bare hours)", () => {
    expect(clockToMinutes("9 AM")).toBe(540);
    expect(clockToMinutes("9:00 AM")).toBe(540);
  });
  test("12-hour wrap (catches noon/midnight inversion)", () => {
    expect(clockToMinutes("12:00 AM")).toBe(0);
    expect(clockToMinutes("12:30 AM")).toBe(30);
    expect(clockToMinutes("12:00 PM")).toBe(720);
    expect(clockToMinutes("12:30 PM")).toBe(750);
    expect(clockToMinutes("1:00 PM")).toBe(780);
  });
  test("range → start", () => {
    expect(clockToMinutes("9:00 AM – 9:40 AM")).toBe(540); // en-dash
    expect(clockToMinutes("9:00 AM - 9:40 AM")).toBe(540); // hyphen
  });
  test("lowercase meridiem accepted (sheet/agenda case variance)", () => {
    expect(clockToMinutes("12:00pm")).toBe(720);
  });
  test("no meridiem / trailing garbage → null (proves the ^…$ anchor)", () => {
    expect(clockToMinutes("9:00")).toBeNull();
    expect(clockToMinutes("TBD")).toBeNull();
    expect(clockToMinutes("9:00 AM x")).toBeNull();
  });
  test("impossible clocks → null (range-validation; corrupt JSONB cannot become a placeable position)", () => {
    expect(clockToMinutes("13:00 PM")).toBeNull();
    expect(clockToMinutes("99:99 PM")).toBeNull();
    expect(clockToMinutes("9:75 AM")).toBeNull();
    expect(clockToMinutes("0:00 AM")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run tests/time/clockToMinutes.test.ts --environment node`
Expected: FAIL — "Cannot find module '@/lib/time/clockToMinutes'".

- [ ] **Step 3: Implement** (`lib/time/clockToMinutes.ts`)

```ts
/**
 * Minute-of-day for a clock string in EITHER the sheet (`normClock`,
 * lib/parser/blocks/scheduleTimes.ts) or agenda (`fmtClock`,
 * lib/agenda/extractAgendaSchedule.ts) format. For a range ("9:00 AM – 9:40 AM")
 * the START is used. Returns null on anything it cannot confidently place
 * (no meridiem, trailing content, or an impossible hour/minute).
 *
 * Mirrors the private `toMin` in extractAgendaSchedule.ts: 12 AM→0, 12 PM→720.
 * Range-validated because normalizeAgendaExtraction only requires a non-empty
 * `session.time` string, so corrupt JSONB ("13:75 AM") must not become a number.
 */
export function clockToMinutes(raw: string): number | null {
  const head = raw.split(/[–—-]/)[0]?.trim() ?? "";
  const m = head.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  const ap = m[3]!.toUpperCase();
  if (h < 1 || h > 12 || mm > 59) return null;
  return ((h % 12) + (ap === "PM" ? 12 : 0)) * 60 + mm;
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `npx vitest run tests/time/clockToMinutes.test.ts --environment node`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/time/clockToMinutes.ts tests/time/clockToMinutes.test.ts
git commit -m "feat(crew): clockToMinutes — string clock → minute-of-day (both formats, range-validated)"
```

---

## Task 2: `agendaDayForToday` (pure; consumes `clockToMinutes`)

**Files:**
- Create: `lib/crew/agendaDayForToday.ts`
- Test: `tests/crew/agendaDayForToday.test.ts`

**Interfaces:**
- Consumes: `clockToMinutes` (Task 1); `normalizeAgendaExtraction` (`@/lib/agenda/normalizeAgendaExtraction`), `AgendaSession` (`@/lib/agenda/types`).
- Produces: `parseIsoFromDayLabel(dayLabel: string): string | null`; `agendaSessionsForToday(agendaLinks: { extracted?: unknown }[] | null | undefined, showDays: string[], todayIso: string): AgendaSession[]`.

- [ ] **Step 1: Write the failing test** (`tests/crew/agendaDayForToday.test.ts`)

```ts
import { describe, expect, test } from "vitest";
import { parseIsoFromDayLabel, agendaSessionsForToday } from "@/lib/crew/agendaDayForToday";
import type { AgendaExtraction, AgendaSession } from "@/lib/agenda/types";

const sess = (time: string, title = "S"): AgendaSession => ({
  time, title, room: null, tracks: [], drift: null,
});
const ext = (days: { dayLabel: string; sessions: AgendaSession[] }[]): AgendaExtraction => ({
  confidence: "high", corrections: 0, extractorVersion: 2,
  days: days.map((d) => ({ dayLabel: d.dayLabel, date: null, sessions: d.sessions })),
});

describe("parseIsoFromDayLabel — representative real labels from the 6-PDF corpus", () => {
  test.each([
    ["Tuesday, March 2 4 , 202 6", "2026-03-24"],
    ["Wednesday, March 2 5, 2026", "2026-03-25"],
    ["Wednesday , June 2 5 , 202 5", "2025-06-25"],
    ["Thursday, October 9, 202 5", "2025-10-09"],
    ["Monday , May 4, 2026", "2026-05-04"],
    ["Tuesday May 13,2024", "2024-05-13"],
    ["Friday, Sept. 18, 2026", "2026-09-18"], // 4-letter "Sept." abbr
  ])("%s → %s", (label, iso) => {
    expect(parseIsoFromDayLabel(label)).toBe(iso);
  });
  test.each([["Day 1"], ["Friday"], ["Marb 5, 2026"], ["May 4, 26"]])(
    "%s → null (positional/garbage/2-digit-year)",
    (label) => expect(parseIsoFromDayLabel(label)).toBeNull(),
  );
  test("MUTATION GUARD: a glyph-split-only date needs the digit-collapse", () => {
    // "March 2 4 , 202 6" is unparseable without collapsing inter-digit spaces.
    // Negative-regression (Task 9) removes the collapse and asserts this flips to null.
    expect(parseIsoFromDayLabel("March 2 4 , 202 6")).toBe("2026-03-24");
  });
});

describe("agendaSessionsForToday", () => {
  const SHOW = ["2026-05-04", "2026-05-05"];
  test("date-bearing match → exactly that day's placeable sessions", () => {
    const links = [{ extracted: ext([
      { dayLabel: "Monday, May 4, 2026", sessions: [sess("9:00 AM", "A")] },
      { dayLabel: "Tuesday, May 5, 2026", sessions: [sess("10:00 AM", "B")] },
    ]) }];
    expect(agendaSessionsForToday(links, SHOW, "2026-05-05").map((s) => s.title)).toEqual(["B"]);
  });
  test("today not in any day → []", () => {
    const links = [{ extracted: ext([{ dayLabel: "Monday, May 4, 2026", sessions: [sess("9:00 AM")] }]) }];
    expect(agendaSessionsForToday(links, SHOW, "2026-05-06")).toEqual([]);
  });
  test("low-confidence extraction → []", () => {
    const low = { ...ext([{ dayLabel: "Monday, May 4, 2026", sessions: [sess("9:00 AM")] }]), confidence: "low" as const, days: [] };
    expect(agendaSessionsForToday([{ extracted: low }], SHOW, "2026-05-04")).toEqual([]);
  });
  test("malformed extracted (missing days / scalar) → skipped, no throw", () => {
    expect(agendaSessionsForToday([{ extracted: { confidence: "high" } }], SHOW, "2026-05-04")).toEqual([]);
    expect(agendaSessionsForToday([{ extracted: "garbage" }], SHOW, "2026-05-04")).toEqual([]);
    expect(agendaSessionsForToday([{ extracted: null }, { extracted: undefined }], SHOW, "2026-05-04")).toEqual([]);
  });
  test("multiple high-conf links each covering today → AGGREGATED (catches first-link-only)", () => {
    const links = [
      { extracted: ext([{ dayLabel: "Monday, May 4, 2026", sessions: [sess("9:00 AM", "A")] }]) },
      { extracted: ext([{ dayLabel: "Monday, May 4, 2026", sessions: [sess("11:00 AM", "B")] }]) },
    ];
    expect(agendaSessionsForToday(links, SHOW, "2026-05-04").map((s) => s.title).sort()).toEqual(["A", "B"]);
  });
  test("positional fallback FIRES — counts equal, all labels positional; correct index", () => {
    const SHOW3 = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const links = [{ extracted: ext([
      { dayLabel: "Day 1", sessions: [sess("8:00 AM", "d1")] },
      { dayLabel: "Day 2", sessions: [sess("8:00 AM", "d2")] },
      { dayLabel: "Day 3", sessions: [sess("8:00 AM", "d3")] },
    ]) }];
    expect(agendaSessionsForToday(links, SHOW3, "2026-01-02").map((s) => s.title)).toEqual(["d2"]);
  });
  test("positional BLOCKED when day-count != showDays count → []", () => {
    const links = [{ extracted: ext([{ dayLabel: "Day 1", sessions: [sess("8:00 AM", "d1")] }]) }];
    expect(agendaSessionsForToday(links, ["2026-01-01", "2026-01-02"], "2026-01-01")).toEqual([]);
  });
  test("positional BLOCKED when a showDay is null → []", () => {
    const links = [{ extracted: ext([
      { dayLabel: "Day 1", sessions: [sess("8:00 AM", "d1")] },
      { dayLabel: "Day 2", sessions: [sess("8:00 AM", "d2")] },
    ]) }];
    expect(agendaSessionsForToday(links, [null as unknown as string, "2026-01-02"], "2026-01-02")).toEqual([]);
  });
  test("positional BLOCKED when ANY label parsed a date (partial alignment) → []", () => {
    const links = [{ extracted: ext([
      { dayLabel: "Monday, May 4, 2026", sessions: [sess("8:00 AM", "d1")] }, // date-bearing
      { dayLabel: "Day 2", sessions: [sess("8:00 AM", "d2")] },               // positional
    ]) }];
    // today matches neither by date; partial date-alignment must block positional.
    expect(agendaSessionsForToday(links, ["2026-05-04", "2026-05-05"], "2026-05-05")).toEqual([]);
  });
  test("unplaceable-time sessions filtered out", () => {
    const links = [{ extracted: ext([{ dayLabel: "Monday, May 4, 2026", sessions: [
      sess("9:00 AM", "ok"), sess("TBD", "drop"), sess("10:00 AM", "ok2"),
    ] }]) }];
    expect(agendaSessionsForToday(links, SHOW, "2026-05-04").map((s) => s.title)).toEqual(["ok", "ok2"]);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run tests/crew/agendaDayForToday.test.ts --environment node`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`lib/crew/agendaDayForToday.ts`)

```ts
import { normalizeAgendaExtraction } from "@/lib/agenda/normalizeAgendaExtraction";
import type { AgendaDay, AgendaExtraction, AgendaSession } from "@/lib/agenda/types";
import { clockToMinutes } from "@/lib/time/clockToMinutes";

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Parse a date-bearing dayLabel ("Tuesday, March 2 4 , 202 6") → ISO, else null.
 *  Collapses glyph-split digits FIRST (pdfjs emits "2 4"/"202 6"); validated
 *  against all 6 live agenda PDFs. Month match is EXACT (full or abbr), not prefix. */
export function parseIsoFromDayLabel(dayLabel: string): string | null {
  const collapsed = dayLabel.replace(/(?<=\d)\s+(?=\d)/g, "");
  const m = collapsed.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/);
  if (!m) return null;
  const month = MONTHS[m[1]!.toLowerCase().replace(/\.$/, "")];
  if (!month) return null;
  return `${m[3]}-${pad2(month)}-${pad2(Number(m[2]))}`;
}

/** Today's PLACEABLE agenda sessions, aggregated across ALL high-confidence links.
 *  `extracted` is raw JSONB → normalized at the boundary (mirrors AgendaScheduleBlock). */
export function agendaSessionsForToday(
  agendaLinks: { extracted?: unknown }[] | null | undefined,
  showDays: string[],
  todayIso: string,
): AgendaSession[] {
  const out: AgendaSession[] = [];
  for (const link of agendaLinks ?? []) {
    const extN = normalizeAgendaExtraction(link.extracted);
    if (!extN || extN.confidence !== "high" || extN.days.length === 0) continue;
    const ext: AgendaExtraction = extN;
    let matched: AgendaDay | null = null;
    let someDateParsed = false;
    for (const day of ext.days) {
      const iso = parseIsoFromDayLabel(day.dayLabel);
      if (iso) someDateParsed = true;
      if (iso === todayIso && matched === null) matched = day;
    }
    if (
      matched === null &&
      !someDateParsed &&
      showDays.length > 0 &&
      showDays.every((d) => d != null) &&
      ext.days.length === showDays.length
    ) {
      const idx = showDays.indexOf(todayIso);
      if (idx >= 0) matched = ext.days[idx]!;
    }
    if (matched) {
      for (const s of matched.sessions) {
        if (clockToMinutes(s.time) !== null) out.push(s);
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `npx vitest run tests/crew/agendaDayForToday.test.ts --environment node`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/crew/agendaDayForToday.ts tests/crew/agendaDayForToday.test.ts
git commit -m "feat(crew): agendaSessionsForToday — normalize + day-match + placeable filter + multi-link aggregate"
```

---

## Task 3: `showDayTimeline` (pure; consumes `clockToMinutes`)

**Files:**
- Create: `lib/crew/showDayTimeline.ts`
- Test: `tests/crew/showDayTimeline.test.ts`

**Interfaces:**
- Consumes: `clockToMinutes` (Task 1); `AgendaEntry` (`@/lib/parser/types`), `AgendaSession` (`@/lib/agenda/types`), `stripAgendaUrls` (`@/lib/visibility/agendaUrls`).
- Produces: `type TimelineItem = { source: "crew"; entry: AgendaEntry; minutes: number | null } | { source: "agenda"; session: AgendaSession; minutes: number | null }`; `buildShowDayTimeline(crewEntries: AgendaEntry[], agendaSessions: AgendaSession[]): TimelineItem[]`.

- [ ] **Step 1: Write the failing test** (`tests/crew/showDayTimeline.test.ts`)

```ts
import { describe, expect, test } from "vitest";
import { buildShowDayTimeline, type TimelineItem } from "@/lib/crew/showDayTimeline";
import type { AgendaEntry } from "@/lib/parser/types";
import type { AgendaSession } from "@/lib/agenda/types";

const crew = (start: string, title: string, kind?: AgendaEntry["kind"]): AgendaEntry => ({ start, title, ...(kind ? { kind } : {}) });
const ag = (time: string, title: string | null = "S"): AgendaSession => ({ time, title, room: null, tracks: [], drift: null });
const titleOf = (i: TimelineItem) => (i.source === "crew" ? i.entry.title : i.session.title);

describe("buildShowDayTimeline", () => {
  test("interleave order — non-sorted input, CONSTANT expected ascending order", () => {
    // Input deliberately out of order; a descending or input-order impl fails.
    const out = buildShowDayTimeline(
      [crew("10:00 AM", "Set"), crew("8:00 AM", "LoadIn")],
      [ag("9:00 AM – 9:40 AM", "Keynote")],
    );
    expect(out.map(titleOf)).toEqual(["LoadIn", "Keynote", "Set"]);
    expect(out.map((i) => i.source)).toEqual(["crew", "agenda", "crew"]);
  });
  test("dedup exact (crew wins) — same minute + same normalized title → 1 crew item", () => {
    const out = buildShowDayTimeline([crew("9:00 AM", "Keynote")], [ag("9:00 AM – 9:40 AM", "Keynote")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe("crew");
  });
  test("dedup near-miss — different minute OR title → both shown", () => {
    expect(buildShowDayTimeline([crew("9:00 AM", "Keynote")], [ag("9:05 AM", "Keynote")])).toHaveLength(2);
    expect(buildShowDayTimeline([crew("9:00 AM", "Keynote")], [ag("9:00 AM", "Keynote Q&A")])).toHaveLength(2);
  });
  test("ties — crew before agenda at the same minute (different titles, not deduped)", () => {
    const out = buildShowDayTimeline([crew("9:00 AM", "X")], [ag("9:00 AM", "Y")]);
    expect(out.map((i) => i.source)).toEqual(["crew", "agenda"]);
  });
  test("crew with unparseable start sorts LAST in original order", () => {
    const out = buildShowDayTimeline([crew("TBD", "Late"), crew("8:00 AM", "Early")], [ag("9:00 AM", "Mid")]);
    expect(out.map(titleOf)).toEqual(["Early", "Mid", "Late"]);
  });
  test("agenda with unparseable time dropped (defensive)", () => {
    const out = buildShowDayTimeline([crew("8:00 AM", "A")], [ag("TBD", "drop")]);
    expect(out.map(titleOf)).toEqual(["A"]);
  });
  test("crew-vs-crew duplicates NOT deduped (sheet errors preserved)", () => {
    expect(buildShowDayTimeline([crew("9:00 AM", "Dup"), crew("9:00 AM", "Dup")], [])).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `npx vitest run tests/crew/showDayTimeline.test.ts --environment node`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`lib/crew/showDayTimeline.ts`)

```ts
import type { AgendaSession } from "@/lib/agenda/types";
import type { AgendaEntry } from "@/lib/parser/types";
import { clockToMinutes } from "@/lib/time/clockToMinutes";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";

export type TimelineItem =
  | { source: "crew"; entry: AgendaEntry; minutes: number | null }
  | { source: "agenda"; session: AgendaSession; minutes: number | null };

/** stripAgendaUrls already collapses whitespace + trims (agendaUrls.ts:44-45). */
const normTitle = (s: string | null): string => stripAgendaUrls(s ?? "").toLowerCase();

/** Merge crew run-of-show entries (already per-viewer gated) with today's agenda
 *  sessions (already day-matched + placeable) into one chronological, deduped list.
 *  Dedup is crew-wins, exact (minute + normalized title); sort is stable, crew-first on ties;
 *  crew entries with an unparseable start sort last (sheet order preserved). */
export function buildShowDayTimeline(
  crewEntries: AgendaEntry[],
  agendaSessions: AgendaSession[],
): TimelineItem[] {
  const crew: TimelineItem[] = crewEntries.map((entry) => ({
    source: "crew", entry, minutes: clockToMinutes(entry.start),
  }));
  const crewKeys = new Set(
    crew.filter((c) => c.minutes !== null).map((c) => `${c.minutes} ${normTitle((c as { entry: AgendaEntry }).entry.title)}`),
  );
  const agenda: TimelineItem[] = [];
  for (const session of agendaSessions) {
    const minutes = clockToMinutes(session.time);
    if (minutes === null) continue; // defensive (caller already filtered)
    if (crewKeys.has(`${minutes} ${normTitle(session.title)}`)) continue; // dedup, crew wins
    agenda.push({ source: "agenda", session, minutes });
  }
  const items = [...crew, ...agenda];
  // Stable sort by minutes asc; nulls last; crew before agenda on ties.
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const am = a.item.minutes;
      const bm = b.item.minutes;
      if (am === null && bm === null) return a.i - b.i;
      if (am === null) return 1;
      if (bm === null) return -1;
      if (am !== bm) return am - bm;
      const srcRank = (s: TimelineItem["source"]) => (s === "crew" ? 0 : 1);
      const sr = srcRank(a.item.source) - srcRank(b.item.source);
      return sr !== 0 ? sr : a.i - b.i;
    })
    .map(({ item }) => item);
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `npx vitest run tests/crew/showDayTimeline.test.ts --environment node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/crew/showDayTimeline.ts tests/crew/showDayTimeline.test.ts
git commit -m "feat(crew): buildShowDayTimeline — chronological interleave + crew-wins dedup + stable sort"
```

---

## Task 4: `ShowDayTimelineList` component (export `RunOfShowEntry`; new `AgendaSessionRow`; synthetic-exempt chronological cap)

**Files:**
- Modify: `components/crew/primitives/RunOfShowList.tsx` (export `RunOfShowEntry`)
- Create: `components/crew/primitives/ShowDayTimelineList.tsx`
- Test: `tests/components/crew/primitives/ShowDayTimelineList.test.tsx`

**Interfaces:**
- Consumes: `TimelineItem` (Task 3); `RunOfShowEntry` + `RUN_OF_SHOW_DISPLAY_CAP`.
- Produces: `ShowDayTimelineList({ items: TimelineItem[]; isoDate: string }): JSX.Element` — container `data-testid="show-day-timeline-<iso>"`; crew rows `data-testid="agenda-entry"` (reused); agenda rows `data-testid="timeline-agenda-session"`; overflow `data-testid="timeline-agenda-overflow"`.

- [ ] **Step 1: Export `RunOfShowEntry`** (`components/crew/primitives/RunOfShowList.tsx:26`)

Change `function RunOfShowEntry(` → `export function RunOfShowEntry(`. No other change.

- [ ] **Step 2: Write the failing test** (`tests/components/crew/primitives/ShowDayTimelineList.test.tsx`)

```tsx
import { describe, expect, test } from "vitest";
import { render, within } from "@testing-library/react";
import { ShowDayTimelineList } from "@/components/crew/primitives/ShowDayTimelineList";
import type { TimelineItem } from "@/lib/crew/showDayTimeline";
import type { AgendaEntry } from "@/lib/parser/types";
import type { AgendaSession } from "@/lib/agenda/types";

const ISO = "2026-05-04";
const crewItem = (start: string, title: string, kind?: AgendaEntry["kind"], minutes: number | null = 0): TimelineItem =>
  ({ source: "crew", entry: { start, title, ...(kind ? { kind } : {}) }, minutes });
const agItem = (time: string, title: string | null, minutes: number, room: string | null = null): TimelineItem =>
  ({ source: "agenda", session: { time, title, room, tracks: [], drift: null } as AgendaSession, minutes });
const scope = (c: HTMLElement) => within(c.querySelector(`[data-testid="show-day-timeline-${ISO}"]`) as HTMLElement);

describe("ShowDayTimelineList", () => {
  test("crew rows render as agenda-entry; agenda rows as timeline-agenda-session with full time + room, no tracks", () => {
    const { container } = render(
      <ShowDayTimelineList isoDate={ISO} items={[
        crewItem("8:00 AM", "LoadIn", undefined, 480),
        agItem("9:00 AM – 9:40 AM", "Keynote", 540, "Main Stage"),
      ]} />,
    );
    const q = scope(container);
    expect(q.getAllByTestId("agenda-entry")).toHaveLength(1);
    const sessions = q.getAllByTestId("timeline-agenda-session");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.textContent).toContain("9:00 AM – 9:40 AM"); // full range, not just start
    expect(sessions[0]!.textContent).toContain("Keynote");
    expect(sessions[0]!.textContent).toContain("Main Stage");
  });
  test("null-title agenda → time-only row (no crash)", () => {
    const { container } = render(<ShowDayTimelineList isoDate={ISO} items={[agItem("9:00 AM", null, 540)]} />);
    expect(scope(container).getByTestId("timeline-agenda-session").textContent).toContain("9:00 AM");
  });
  test("cap: synthetic-exempt + chronological — strike at latest time is LAST and present; 20 non-synthetic + overflow", () => {
    const many = Array.from({ length: 22 }, (_, i) => crewItem(`8:00 AM`, `c${i}`, undefined, 480 + i));
    const items = [...many, agItem("3:00 PM", "Keynote", 900), crewItem("11:00 PM", "Strike", "strike", 1380)];
    const { container } = render(<ShowDayTimelineList isoDate={ISO} items={items} />);
    const q = scope(container);
    // 23 non-synthetic (22 crew + 1 agenda) capped to 20; 1 synthetic strike exempt.
    const nonSynth = q.getAllByTestId("agenda-entry").filter((e) => e.getAttribute("data-entry-kind") == null).length
      + q.getAllByTestId("timeline-agenda-session").length;
    expect(nonSynth).toBe(20);
    const overflow = q.getByTestId("timeline-agenda-overflow");
    expect(overflow.textContent).toContain("3"); // 23 − 20 dropped
    // Strike present AND last (chronological position, NOT partitioned).
    const rows = q.getAllByTestId(/agenda-entry|timeline-agenda-session/);
    const last = rows[rows.length - 1]!;
    expect(last.getAttribute("data-entry-kind")).toBe("strike");
  });
  test("cap: synthetic strike at the EARLIEST time renders FIRST (chronological, not appended)", () => {
    const items = [crewItem("6:00 AM", "Strike", "strike", 360), agItem("9:00 AM", "Keynote", 540), crewItem("10:00 AM", "Wrap", undefined, 600)];
    const { container } = render(<ShowDayTimelineList isoDate={ISO} items={items} />);
    const rows = scope(container).getAllByTestId(/agenda-entry|timeline-agenda-session/);
    expect(rows[0]!.getAttribute("data-entry-kind")).toBe("strike");
  });
});
```

- [ ] **Step 3: Run — verify it fails**

Run: `npx vitest run tests/components/crew/primitives/ShowDayTimelineList.test.tsx --environment jsdom`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** (`components/crew/primitives/ShowDayTimelineList.tsx`)

```tsx
import type { JSX } from "react";
import { RunOfShowEntry } from "@/components/crew/primitives/RunOfShowList";
import type { AgendaSession } from "@/lib/agenda/types";
import { RUN_OF_SHOW_DISPLAY_CAP, resolveOptionalField } from "@/lib/crew/agendaDisplay";
import type { TimelineItem } from "@/lib/crew/showDayTimeline";

/** A muted "event" row for a PDF agenda session — DISTINCT from the muted SYNTHETIC
 *  crew row (which uses a leading hairline `border-l`): the agenda row carries a small
 *  "Agenda" event eyebrow instead. Renders the full `session.time` string verbatim;
 *  tracks + drift are never read (D7). */
function AgendaSessionRow({ session }: { session: AgendaSession }): JSX.Element {
  const room = resolveOptionalField(session.room);
  return (
    <li data-testid="timeline-agenda-session" className="flex min-w-0 flex-col gap-0.5 py-1">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-xs font-semibold tabular-nums text-text-subtle">{session.time}</span>
        <span
          data-agenda-field="event"
          className="shrink-0 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-eyebrow text-text-subtle"
        >
          Agenda
        </span>
        {session.title ? (
          <span className="min-w-0 text-sm font-medium text-text-subtle">{session.title}</span>
        ) : null}
      </div>
      {room ? <div className="text-xs text-text-subtle">{room}</div> : null}
    </li>
  );
}

const isSynthetic = (i: TimelineItem): boolean =>
  i.source === "crew" && (i.entry.kind === "strike" || i.entry.kind === "loadout");

/** Render the discriminated, sorted timeline. Synthetic crew rows (strike/loadout) are
 *  EXEMPT from the cap and stay in their chronological position; the non-synthetic content
 *  (crew-agenda + PDF-agenda) is capped at RUN_OF_SHOW_DISPLAY_CAP with an overflow stub. */
export function ShowDayTimelineList({ items, isoDate }: { items: TimelineItem[]; isoDate: string }): JSX.Element {
  let nonSynthShown = 0;
  let dropped = 0;
  const kept: TimelineItem[] = [];
  for (const it of items) {
    if (isSynthetic(it)) { kept.push(it); continue; }
    if (nonSynthShown < RUN_OF_SHOW_DISPLAY_CAP) { kept.push(it); nonSynthShown++; }
    else dropped++;
  }
  return (
    <div data-testid={`show-day-timeline-${isoDate}`} className="mt-2 flex flex-col">
      <ul className="flex flex-col divide-y divide-border">
        {kept.map((it, i) =>
          it.source === "crew" ? (
            <RunOfShowEntry key={`c${i}`} entry={it.entry} />
          ) : (
            <AgendaSessionRow key={`a${i}`} session={it.session} />
          ),
        )}
      </ul>
      {dropped > 0 ? (
        <p data-testid="timeline-agenda-overflow" className="mt-1 text-xs text-text-subtle">
          {`…and ${dropped} more agenda item${dropped === 1 ? "" : "s"}`}
        </p>
      ) : null}
    </div>
  );
}
```

VERIFIED: `RUN_OF_SHOW_DISPLAY_CAP` (=20) and `resolveOptionalField` are both exported from `@/lib/crew/agendaDisplay` (`agendaDisplay.ts:16` + the symbol `RunOfShowList.tsx:13-18` imports). `RunOfShowEntry` becomes exported in Step 1. Import directly from `@/lib/crew/agendaDisplay` (no re-export through `RunOfShowList.tsx`).

- [ ] **Step 5: Run — verify it passes**

Run: `npx vitest run tests/components/crew/primitives/ShowDayTimelineList.test.tsx --environment jsdom`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/crew/primitives/ShowDayTimelineList.tsx components/crew/primitives/RunOfShowList.tsx tests/components/crew/primitives/ShowDayTimelineList.test.tsx
git commit -m "feat(crew): ShowDayTimelineList — distinguished crew/agenda rows + synthetic-exempt chronological cap"
```

---

## Task 5: TodaySection wiring (`modeA` gate + card-body branch) + modeA test extension

**Files:**
- Modify: `components/crew/sections/TodaySection.tsx` (`:211-215` compute/gate; `:598` card body)
- Modify: `tests/components/crew/sections/TodaySection.modeA.test.tsx` (add agenda-only + merged + crew-only-control cases)

**Interfaces:**
- Consumes: `agendaSessionsForToday` (Task 2), `buildShowDayTimeline` (Task 3), `ShowDayTimelineList` (Task 4).

- [ ] **Step 1: Write the failing tests** (extend `tests/components/crew/sections/TodaySection.modeA.test.tsx`)

Add (using the existing `makeShowForViewer` import + `TODAY`/`TODAY_ISO` already in the file; build a high-conf agenda extraction whose `dayLabel` parses to `TODAY_ISO`):

Fixture API (VERIFIED against `tests/fixtures/showForViewer.ts` + the existing modeA test): `makeShowForViewer(overrides?: DeepPartial<ShowForViewer>)` deep-merges; base `show.agenda_links = []`, `runOfShow = null`. Crew entries are set via the `runOfShow` option; the show day via `show.dates.showDays`; `agenda_links` via post-build assignment (a full object, to avoid deep-merge on the `extracted.days` array). Reuse the file's existing `TODAY` (`new Date("2026-05-14T15:00:00Z")`), `TODAY_ISO` (derived via `todayIsoInShowTimezone`), and `SHOW_ID`. Admin viewer → eligible. Add these constants/imports at the top if not present, then the tests:

```tsx
import { agendaSessionsForToday } from "@/lib/crew/agendaDayForToday";
import type { AgendaExtraction } from "@/lib/agenda/types";

const DAY_DATES = { travelIn: null, set: null, showDays: [TODAY_ISO], travelOut: null };
const MONTHS_FULL = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// A high-conf agenda link whose single day's label parses to TODAY_ISO.
function agendaLinkForToday(iso: string, sessions: { time: string; title: string }[]) {
  const [y, m, d] = iso.split("-").map(Number);
  const dayLabel = `${MONTHS_FULL[m!]} ${d}, ${y}`; // parseIsoFromDayLabel(dayLabel) === iso
  const extracted: AgendaExtraction = {
    confidence: "high", corrections: 0, extractorVersion: 2,
    days: [{ dayLabel, date: null, sessions: sessions.map((s) => ({ ...s, room: null, tracks: [], drift: null })) }],
  };
  return { fileId: "agenda-1", label: "AGENDA", extracted };
}

test("agenda-only show day (no crew entries) → Mode A renders the timeline, no plain run-of-show list", () => {
  const data = makeShowForViewer({ show: { dates: DAY_DATES } }); // runOfShow stays null → no crew entries
  data.show.agenda_links = [
    agendaLinkForToday(TODAY_ISO, [{ time: "9:00 AM – 9:40 AM", title: "Keynote" }, { time: "10:00 AM", title: "Panel" }]),
  ];
  const expectedSessions = agendaSessionsForToday(data.show.agenda_links, data.show.dates.showDays, TODAY_ISO).length;
  const { container } = render(<TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  const card = container.querySelector('[data-testid="today-run-of-show"]') as HTMLElement;
  expect(within(card).getByTestId(`show-day-timeline-${TODAY_ISO}`)).toBeTruthy();
  expect(within(card).getAllByTestId("timeline-agenda-session")).toHaveLength(expectedSessions);
  expect(card.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeNull(); // not the plain list
});

test("merged day → both crew agenda-entry and timeline-agenda-session present", () => {
  const data = makeShowForViewer({
    show: { dates: DAY_DATES },
    runOfShow: { [TODAY_ISO]: { entries: [{ start: "8:00 AM", title: "Load In", room: "Hall A" }], showStart: "8:00 AM", window: null } },
  });
  data.show.agenda_links = [agendaLinkForToday(TODAY_ISO, [{ time: "9:00 AM – 9:40 AM", title: "Keynote" }])];
  const { container } = render(<TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  const card = within(container.querySelector('[data-testid="today-run-of-show"]') as HTMLElement);
  expect(card.getAllByTestId("agenda-entry").length).toBeGreaterThan(0);
  expect(card.getAllByTestId("timeline-agenda-session").length).toBeGreaterThan(0);
});

test("crew-only day (no agenda_links) → plain RunOfShowList, no timeline (activation rule)", () => {
  const data = makeShowForViewer({
    show: { dates: DAY_DATES },
    runOfShow: { [TODAY_ISO]: { entries: [{ start: "8:00 AM", title: "Load In" }], showStart: "8:00 AM", window: null } },
  });
  // agenda_links stays [] → agendaToday = [] → activation rule keeps the plain list.
  const { container } = render(<TodaySection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />);
  expect(container.querySelector(`[data-testid="run-of-show-${TODAY_ISO}"]`)).toBeTruthy();
  expect(container.querySelector(`[data-testid="show-day-timeline-${TODAY_ISO}"]`)).toBeNull();
  expect(container.querySelector('[data-testid="timeline-agenda-session"]')).toBeNull();
});
```

- [ ] **Step 2: Run — verify the new tests fail**

Run: `npx vitest run tests/components/crew/sections/TodaySection.modeA.test.tsx --environment jsdom`
Expected: FAIL on the 3 new tests (no `show-day-timeline` rendered yet); existing tests still PASS.

- [ ] **Step 3: Implement the wiring** (`components/crew/sections/TodaySection.tsx`)

Add imports (near `:39`):
```tsx
import { ShowDayTimelineList } from "@/components/crew/primitives/ShowDayTimelineList";
import { agendaSessionsForToday } from "@/lib/crew/agendaDayForToday";
import { buildShowDayTimeline } from "@/lib/crew/showDayTimeline";
```

Change the compute/gate block (`:211-215`):
```tsx
          const todays =
            dateRestriction.kind === "unknown_asterisk"
              ? []
              : scheduleEntriesForViewer(data.runOfShow?.[todayIso]?.entries, { transportVisible });
          const agendaToday = agendaSessionsForToday(
            data.show.agenda_links ?? [],
            data.show.dates.showDays ?? [],
            todayIso,
          );
          const modeA = isShowDay && eligible && (todays.length > 0 || agendaToday.length > 0);
```

Change the card body (`:598`, inside the `today-run-of-show` SectionCard):
```tsx
                        {agendaToday.length > 0 ? (
                          <ShowDayTimelineList
                            items={buildShowDayTimeline(todays, agendaToday)}
                            isoDate={todayIso}
                          />
                        ) : (
                          <RunOfShowList entries={todays} isoDate={todayIso} />
                        )}
```

- [ ] **Step 4: Run — verify all pass**

Run: `npx vitest run tests/components/crew/sections/TodaySection.modeA.test.tsx tests/components/crew/sections/TodaySection.test.tsx tests/components/crew/sections/TodaySection.bookends.test.tsx --environment jsdom`
Expected: PASS (new + existing).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "TodaySection|ShowDayTimeline|agendaDayForToday|showDayTimeline|clockToMinutes|error TS" | head || echo "tsc clean"
git add components/crew/sections/TodaySection.tsx tests/components/crew/sections/TodaySection.modeA.test.tsx
git commit -m "feat(crew): wire unified timeline into Today (modeA gate + card-body branch)"
```

---

## Task 6: Layout-dimensions (real-browser, AGENTS.md mandatory)

**Files:**
- Modify: `tests/e2e/crew-layout-dimensions.spec.ts`

**Dimensional Invariants (spec §6.1):** in the Mode A split-wide grid (`items-start`, natural height), each timeline row's `getBoundingClientRect().width` equals the `show-day-timeline` container content width (±0.5px); the list height equals Σ rows (±0.5px, no clipping).

- [ ] **Step 1: Add the assertion** — extend the existing Today Mode-A dimension block. Seed (via the e2e harness's fixture mechanism) a Today preview with **2 crew + 2 agenda** interleaved rows, then:

```ts
// Within the Today Mode-A dimension test (real browser), after the page renders:
const list = page.locator('[data-testid^="show-day-timeline-"]');
await expect(list).toBeVisible();
const listW = (await list.boundingBox())!.width;
const rows = list.locator('[data-testid="agenda-entry"], [data-testid="timeline-agenda-session"]');
const n = await rows.count();
expect(n).toBeGreaterThanOrEqual(4);
for (let i = 0; i < n; i++) {
  const w = (await rows.nth(i).boundingBox())!.width;
  expect(Math.abs(w - listW)).toBeLessThanOrEqual(0.5); // rows fill the list width
}
const sum = (await Promise.all(Array.from({ length: n }, (_, i) => rows.nth(i).boundingBox().then((b) => b!.height)))).reduce((a, b) => a + b, 0);
const listH = (await list.boundingBox())!.height;
expect(listH).toBeGreaterThanOrEqual(sum - 0.5); // no clipping
```

NOTE: read `tests/e2e/crew-layout-dimensions.spec.ts` first to match its fixture-seeding + viewport + assertion idiom exactly; adapt the snippet to that harness (it may use a seeded preview route rather than inline render).

- [ ] **Step 2: Run** (only if the e2e harness is runnable locally; otherwise this runs in CI):

Run: `npx playwright test tests/e2e/crew-layout-dimensions.spec.ts -g "Mode A"` (or the suite's documented command)
Expected: PASS — every timeline row fills the list width; no clipping.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/crew-layout-dimensions.spec.ts
git commit -m "test(crew): layout-dimensions — unified timeline rows fill width, no clip (real browser)"
```

---

## Task 7: Transition audit (AGENTS.md mandatory)

**Files:**
- Test: `tests/components/crew/primitives/ShowDayTimelineList.test.tsx` (extend)

**Transition Inventory (spec §6.2):** 4 data-driven states (`crew-only`/`agenda-only`/`merged`/`not-rendered`), **no client-side animation** — server-rendered. No `AnimatePresence`, no `exit`/`initial`/`animate`, no `motion.*`.

- [ ] **Step 1: Add a structural assertion** (extend the ShowDayTimelineList test file):

```ts
import { readFileSync } from "node:fs";
test("Transition audit — ShowDayTimelineList is static (no AnimatePresence/motion/exit)", () => {
  const src = readFileSync("components/crew/primitives/ShowDayTimelineList.tsx", "utf8");
  expect(src).not.toMatch(/AnimatePresence|framer-motion|\bmotion\.|\bexit=|\binitial=|\banimate=/);
});
```

- [ ] **Step 2: Run — verify it passes** (the component has no animation):

Run: `npx vitest run tests/components/crew/primitives/ShowDayTimelineList.test.tsx --environment jsdom`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/components/crew/primitives/ShowDayTimelineList.test.tsx
git commit -m "test(crew): transition audit — unified timeline is static, data-driven (no animation)"
```

---

## Task 8: DESIGN.md subsection (impeccable v3 artifact)

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Add the subsection** (after the existing split-wide amendment, mirroring DESIGN.md's prose style). Content: the 4-state table (crew-only / agenda-only / merged / not-rendered); the **crew row** treatment (real = `text-text-strong`; synthetic = `text-text-subtle` + leading `border-l` hairline — unchanged); the **agenda row** treatment (`timeline-agenda-session`: full `session.time`, muted `text-text-subtle`, a small uppercase **"Agenda" eyebrow badge** — NOT a hairline, so it is visually **distinct from the muted synthetic crew row**); the **cap** (synthetic-exempt, non-synthetic content capped at `RUN_OF_SHOW_DISPLAY_CAP`=20, `…and N more agenda items` stub) rendered **chronologically**.

- [ ] **Step 2: Verify prettier**

Run: `pnpm exec prettier --check DESIGN.md`
Expected: clean (or run `--write`).

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): unified Today timeline — card states + crew-vs-agenda row treatment"
```

---

## Task 9: Whole-suite regression + negative-regression + lint/format

**Files:** none (verification)

- [ ] **Step 1: Full crew/timeline suites**

Run: `npx vitest run tests/time tests/crew tests/components/crew --environment jsdom 2>&1 | tail -4`
Expected: ALL PASS. (Run node-env pure-module files with `--environment node` if jsdom flags them.)

- [ ] **Step 2: Negative-regression (mutation proofs, AGENTS.md)** — confirm the tests catch the bugs they claim:
  1. Remove `.replace(/(?<=\d)\s+(?=\d)/g, "")` from `parseIsoFromDayLabel` → run `tests/crew/agendaDayForToday.test.ts` → the `"March 2 4 , 202 6"` case must FAIL → restore.
  2. Delete the dedup `crewKeys.has(...) continue` line in `buildShowDayTimeline` → the exact-dedup test must FAIL (2 instead of 1) → restore.
  3. Flip the sort to descending in `buildShowDayTimeline` → the constant-order interleave test must FAIL → restore.
  Each restore must return the suite to green.

- [ ] **Step 3: Typecheck + lint + format**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS" | head || echo "tsc clean"
pnpm exec eslint lib/time/clockToMinutes.ts lib/crew/agendaDayForToday.ts lib/crew/showDayTimeline.ts components/crew/primitives/ShowDayTimelineList.tsx components/crew/sections/TodaySection.tsx && echo "eslint OK"
pnpm exec prettier --write lib/time/clockToMinutes.ts lib/crew/agendaDayForToday.ts lib/crew/showDayTimeline.ts components/crew/primitives/ShowDayTimelineList.tsx components/crew/primitives/RunOfShowList.tsx components/crew/sections/TodaySection.tsx tests/time/clockToMinutes.test.ts tests/crew/agendaDayForToday.test.ts tests/crew/showDayTimeline.test.ts tests/components/crew/primitives/ShowDayTimelineList.test.tsx tests/components/crew/sections/TodaySection.modeA.test.tsx
pnpm exec prettier --check lib/crew/showDayTimeline.ts components/crew/primitives/ShowDayTimelineList.tsx
```
Expected: clean. Commit any reformat: `git add -A && git commit -m "chore(crew): prettier unified-timeline surfaces" --allow-empty`.

---

## Task 10: Self-review

**Files:** none

- [ ] **Step 1: Spec coverage** — map every spec section to a task: §3.1→T1, §3.2→T2, §3.3→T3, §4.3→T4, §4.1/4.2→T5, §6.1→T6, §6.2→T7, §7 DESIGN→T8, §8 tests→T1-T7. List gaps; add tasks if any.
- [ ] **Step 2: Placeholder scan** — grep the diff for `TODO`/`TBD`/"handle edge cases". Fix.
- [ ] **Step 3: Citation re-grep** — re-verify the touched `file:line` (TodaySection `:211-215`/`:598`, RunOfShowEntry export, `RUN_OF_SHOW_DISPLAY_CAP`/`resolveOptionalField` import paths) still match post-edit.
- [ ] **Step 4: Render-only invariant** — `grep -rn "EXTRACTOR_VERSION\|supabase\|api/" $(git diff --name-only origin/main)` returns nothing in production files; the diff touches only `lib/time`, `lib/crew`, `components/crew`, `DESIGN.md`, tests.

---

## Task 11: Adversarial review (cross-model)

**Files:** none

- [ ] **Step 1:** Generate the whole-diff package (`git diff origin/main`) and dispatch the **Codex cross-model adversarial review of the IMPLEMENTATION DIFF** (not the spec) via `codex exec` (background, stdin closed) with a self-contained REVIEWER-ONLY brief: fresh-eyes; do-not-relitigate the ratified D1-D8 + the spec-approved algorithms; focus on impl/spec fidelity, the merge correctness, the cap chronology, the trust-boundary normalization, anti-tautology of the tests. Iterate to APPROVE (no round budget). Address each finding with a fix + re-review.

---

## Task 12: Execution handoff (UI gate + CI close-out + merge)

- [ ] **Step 1: impeccable v3 dual-gate (invariant 8)** — run `/impeccable critique` AND `/impeccable audit` on the diff (UI surfaces: `ShowDayTimelineList`, `TodaySection`, `DESIGN.md`). Fix HIGH/CRITICAL or record in `DEFERRED.md`. Capture dispositions.
- [ ] **Step 2:** Push the branch, open the PR.
- [ ] **Step 3: screenshots-drift** — if `crew-preview-today-mobile-{light,dark}.webp` drifts (the Today card changes on the captured fixture), dispatch the **`screenshots-regen` `workflow_dispatch`** to regenerate the baselines on the pinned amd64 image (bot-commit), then re-trigger required checks. **Do not regenerate locally** (host-arch byte divergence). *If the captured RPAS-Central preview fixture has no high-confidence agenda day matching its "today," no drift occurs — verify.*
- [ ] **Step 4:** Watch **real CI green** (all required checks), `gh pr merge --merge`, fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` == `0  0`. Update memory.
