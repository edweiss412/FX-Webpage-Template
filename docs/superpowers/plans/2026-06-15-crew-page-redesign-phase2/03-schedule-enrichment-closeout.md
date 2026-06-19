# Phase 2 — §03 Schedule Enrichment + Close-out

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (or `superpowers:executing-plans`) to execute this file task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `00-overview.md` (binding interfaces, global constraints, meta-test inventory) **and** the spec `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-17-crew-page-redesign-phase2-agenda.md` (§4.3 / §4.5 / §4.6, D-5/D-6, §6 tests 5–8, §7 watchpoints) before starting.

**Goal:** Enrich the Phase-1 crew **Schedule** Server Component (`components/crew/sections/ScheduleSection.tsx`) so each rendered day renders **either** a rich run-of-show list (when `data.runOfShow[isoDate]?.length > 0`) **or** the existing Phase-1 `resolveKeyTimes` anchor strip — mutually exclusive per day. Add the `stripAgendaUrls` render sanitizer, the 20-entry display cap + 80-char title `<details>` truncation, sentinel-hiding per optional field, extend the two structural meta-tests (`_metaSentinelHidingContract`, `CardinalityCapBoundary`), then run the milestone close-out gates (self-review → cross-model adversarial review → impeccable dual-gate → real CI → merge).

> **Execute after §02.** This file consumes §02's `ShowForViewer.runOfShow: Record<string, AgendaEntry[]> | null` projection field and the §02-extended `makeShowForViewer` fixture (`runOfShow` override key). It is purely additive UI over merged Phase 1 + §01 + §02 — no parser, DB, migration, sync, projection, or auth change here. **UI surface → Opus-owned** (routing hard rule; AGENTS.md invariant 8 dual-gate applies).

---

## Preconditions (verify before Task 1)

- [ ] **§02 is merged/applied on this branch.** `lib/data/getShowForViewer.ts` emits the top-level field `runOfShow: Record<string, AgendaEntry[]> | null` (sibling of `show`/`financials`), and `tests/fixtures/showForViewer.ts` accepts a `runOfShow` override (DEFAULT value `null`). Verify: `grep -n "runOfShow" lib/data/getShowForViewer.ts tests/fixtures/showForViewer.ts` returns hits. **If absent, STOP — §02 is incomplete; §03 cannot be tested.**
- [ ] **`AgendaEntry` type exists** (`lib/parser/types.ts`, authored §01): `{ start: string; finish?: string; trt?: string; title: string; room?: string; av?: string }`. Verify: `grep -n "export type AgendaEntry" lib/parser/types.ts`.
- [ ] Branch is `feat/crew-page-phase2-agenda`. Verify: `git branch --show-current`.

---

## Binding facts (LIVE-cited — use THESE, do not re-derive)

- **The component to enrich:** `components/crew/sections/ScheduleSection.tsx`. The **per-day render site** is the `visibleDays.map((day) => …)` block, `ScheduleSection.tsx:160-179`. Each iteration returns a wrapper `<div>` (`:170-175`) keyed by `day.date`, carrying `data-testid={isToday ? "schedule-day-today" : \`schedule-day-${day.date}\`}` + `data-day={day.date}` + (today only) `data-today="true"`, wrapping `<DayCard day={day.date} phase={day.phase} today={isToday} />` (`:176`). **The run-of-show branch is inserted INSIDE this wrapper, replacing/conditioning the `<DayCard>` content per day.** The wrapper `data-testid`/`data-day`/`data-today` attributes are NOT changed (Phase-1 today-pin + clock-pipeline e2e read them — `:163-168`).
- **The anchor strip** is the Phase-1 floor, rendered TODAY in the RIGHT column via `<KeyTimesStrip anchors={anchors} />` (`:189`), where `anchors = resolveKeyTimes(data.show, data.rooms)` (`:99`). **CRITICAL — do not move/remove it.** `resolveKeyTimes` (`lib/crew/resolveKeyTimes.ts:43`) returns show-wide `{ set?, show?, strike? }` anchors (NOT per-day). The Phase-1 Schedule layout already renders these once for the show in the times column. The per-day run-of-show enrichment is a NEW per-day element in the LEFT (`data-schedule-column="days"`, `:155`) column's day card; it does NOT replace the show-wide `KeyTimesStrip`. **"Anchor strip fallback" for §03 = the existing Phase-1 day rendering (`<DayCard>` + the show-wide `KeyTimesStrip`) is unchanged; the run-of-show list is an ADD-ON inside the day card when `runOfShow[isoDate]?.length > 0`, and is simply absent otherwise.** A day without a confirmed run-of-show is byte-identical to Phase-1 (test 6a pins this).
- **Sentinel predicate:** `shouldHideGenericOptional(value: string | null): boolean` (`lib/visibility/emptyState.ts:75`) — hides trimmed `""`/`TBD`/`N/A`/`TBA` (case-insensitive). Import from `@/lib/visibility/emptyState`.
- **URL-strip reuse:** `stripOpeningReelText` (`lib/visibility/openingReelText.ts:56`) uses `DRIVE_URL_RE = /(https?:\/\/)?(drive\.google\.com|docs\.google\.com)\/[^\s]+/g` (`:54`) then the orphan-connector + whitespace cleanup chain (`:62-68`): `.replace(/\s*-\s*$/, "").replace(/^\s*-\s*/, "").replace(/\s+/g, " ").trim()`. `stripAgendaUrls` reuses that exact cleanup chain but a BROADER URL regex (schemed-anything + scheme-less Google).
- **`makeShowForViewer`** (`tests/fixtures/showForViewer.ts`) — typed builder; array overrides REPLACE wholesale; `show.*` overrides DEEP-merge. After §02 it has a `runOfShow` override key (DEFAULT `null`).
- **Section render-setup idiom** (mirror for new tests): `tests/components/crew/sections/ScheduleSection.test.tsx:19-32` (`TODAY`, `SHOW_ID`, `DATES`, `makeShowForViewer({ show: { dates: DATES } })`, per-viewer `withRestriction`). All section tests are `// @vitest-environment jsdom` (line 1).
- **Cap-boundary contract** (`tests/components/tiles/CardinalityCapBoundary.test.tsx`): affordance at `> cap`, never `>= cap`; overflow stub count = `length − cap` DERIVED from fixture length; stub carries `data-tile-show-more="true"`; tail-trim (first overflowed entry absent inline). Existing caps: `CREW_INLINE_CAP=8`, `CONTACTS_INLINE_CAP=6`, `SOURCE_CAP=8`, `CASE_CAP=12`.
- **DESIGN tokens to reuse** (from `KeyTimesStrip.tsx`): `tabular-nums` for times, `text-text-subtle`/`text-text-strong`, `tracking-eyebrow`, `min-h-tap-min` (44px tap target, §4.6). **No inline `tracking-[…]`** (banned — use `@theme` tokens; AGENTS.md M12.8 lesson).
- **Close-out deferral home:** `docs/superpowers/plans/2026-06-15-crew-page-redesign-phase2/DEFERRED.md` (create if absent — follows the per-plan `DEFERRED.md` convention, e.g. `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md`).

---

## Mode boundaries / dimensional invariants / transitions (from spec §4.6 — pin in every UI task)

- **Two mutually-exclusive per-day modes** of the LEFT-column day card: **(A)** run-of-show list (the new element), **(B)** the Phase-1 day card with no run-of-show element. Decision: `runOfShow[isoDate]?.length > 0`. **No element is shared** between the two beyond the day wrapper itself. **Exactly one mode renders per day** (test 5 clones the day subtree, asserts exactly one).
- **Dimensional invariants — NONE that need a `getBoundingClientRect` layout task.** Per spec §4.6: the run-of-show list is a flow list inside the existing Schedule day container — there is **no fixed-height/fixed-width parent with flex/grid children**, so the Tailwind-v4 `items-stretch` trap does not apply and no parent==child `getBoundingClientRect` assertion is required. The Phase-1 Schedule layout test already covers the day container's dimensions. Each entry row uses `min-h-tap-min` only if it carries a tap target (it does not in v1 — no links rendered, §4.3 URL-strip), else natural height. **(No "Layout dimensions" Playwright task in this plan — stated here per the writing-plans mandate so the omission is deliberate, not forgotten.)**
- **Transitions — NONE.** Per spec §4.6: the per-day mode is **fixed at render** for a given day+viewer (server-rendered RSC; it does not toggle client-side). So there is **no animation, no `AnimatePresence`, no `exit`/`initial`/`animate`** — **instant; no Transition Inventory needed.** Section-level crossfade is owned by Phase 1's `CrewSectionTransition`, unchanged. **(No "Transition audit" task in this plan — stated here deliberately.)**

---

## Meta-test inventory (this file)

- **EXTENDS `_metaSentinelHidingContract`** (`tests/components/tiles/_metaSentinelHidingContract.test.ts`) — already walks `components/crew/sections/` (CREW_DIRS, `:100-103`). The new `ScheduleSection` run-of-show field reads (`entry.room`/`entry.av`/`entry.finish`/`entry.trt`) must import AND call `shouldHideGenericOptional`. The contract test requires a `GENERIC_OPTIONAL_FIELDS` pattern that matches the new read path (Task 5 adds the `entry.(room|av|finish|trt)` pattern row + extends the behavioral test) so the structural walk catches a future unguarded refactor.
- **EXTENDS the `CardinalityCapBoundary` TEST matrix** (`tests/components/tiles/CardinalityCapBoundary.test.tsx`) — this is a **TEST, not a reusable component**; the cap (`20`) is a per-section const in `ScheduleSection.tsx`. Add a run-of-show `describe` block pinning cap-1/cap/cap+1 with the row testid (`agenda-entry`) + overflow stub testid (`agenda-overflow-stub`), count `= length − 20`, tail-trim.
- **NO new Supabase meta-test work in §03.** `RPC_GATED_TABLES`, `internal-code-enums`, `validation-schema-parity`, the `failedKeys` 6th-domain test — all owned by §01/§02. The new `getShowForViewer` `shows_internal.run_of_show` read is a new Supabase call site, so per invariant 9 it EITHER registers in a structural meta-test OR carries an inline `// not-subject-to-meta: <reason>` waiver; because `lib/data` is outside `_metaInfraContract`'s auth-domain scan (`tests/auth/_metaInfraContract.test.ts:258-259` walks only `lib/auth`/`app/auth`/`app/api/auth`/`app/api/show`), the **inline `// not-subject-to-meta:` waiver is the applicable branch, and it is added in §02 Task 02.5** at the read site. §03 adds NO Supabase call-boundary artifact itself; the §03 close-out (Task 7 self-review) VERIFIES that inline waiver is present on the read.

---

## Tasks

> Each task is TDD: write the failing test (with full code) → run it, confirm it FAILS for the stated reason → write the minimal implementation (with full code) → run it, confirm it PASSES → run the wider suite for no regression → commit (conventional-commits). **No placeholders — every JSX/TS snippet below is complete.** Cite the concrete failure mode each test catches.

---

### Task 1 — `stripAgendaUrls` helper (new `lib/visibility/agendaUrls.ts`)

**Files:** create `lib/visibility/agendaUrls.ts`; create `tests/visibility/agendaUrls.test.ts`.

**Interface:** `export function stripAgendaUrls(value: string): string` — strips (a) every **schemed** URL `https?:\/\/\S+` and (b) every **scheme-less Google** URL `(drive|docs)\.google\.com\/\S+`, then applies the same orphan-connector + whitespace cleanup as `stripOpeningReelText` (`openingReelText.ts:62-68`). DOM invariant it guarantees: **NO `https://`, `http://`, `drive.google.com`, or `docs.google.com` substring remains.** Input is always a string (callers pass already-resolved entry fields).

**Failing test (write FIRST):** `tests/visibility/agendaUrls.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";

const FORBIDDEN = ["https://", "http://", "drive.google.com", "docs.google.com"];
function assertNoUrlSubstring(out: string): void {
  for (const f of FORBIDDEN) expect(out.toLowerCase()).not.toContain(f);
}

describe("stripAgendaUrls", () => {
  test("strips a schemed Drive URL, leaving clean residue (orphan connector trimmed)", () => {
    const out = stripAgendaUrls("Opening Keynote - https://drive.google.com/file/d/abc/view");
    expect(out).toBe("Opening Keynote");
    assertNoUrlSubstring(out);
  });

  test("strips a NON-Google schemed URL (Zoom / CDN) — broader than the opening-reel helper", () => {
    assertNoUrlSubstring(stripAgendaUrls("Breakout A https://zoom.us/j/123456"));
    assertNoUrlSubstring(stripAgendaUrls("Stream https://cdn.example.com/x?sig=9"));
    expect(stripAgendaUrls("Breakout A https://zoom.us/j/123456")).toBe("Breakout A");
  });

  test("strips a SCHEME-LESS Google URL (Doug sometimes omits the scheme)", () => {
    const out = stripAgendaUrls("Slides drive.google.com/file/d/xyz/view");
    expect(out).toBe("Slides");
    assertNoUrlSubstring(out);
  });

  test("multiple URLs in one cell all stripped; whitespace collapsed", () => {
    const out = stripAgendaUrls("A https://a.com/1  and  https://b.com/2 B");
    assertNoUrlSubstring(out);
    expect(out).toBe("A and B");
  });

  test("pure-URL cell → empty residue", () => {
    expect(stripAgendaUrls("https://drive.google.com/file/d/abc")).toBe("");
  });

  test("no URL → returned trimmed/space-collapsed unchanged", () => {
    expect(stripAgendaUrls("  Q&A  w/   panel  ")).toBe("Q&A w/ panel");
  });

  // Documented limitation (spec §4.3 / wp — do-not-relitigate): a scheme-less
  // NON-Google bare domain is NOT stripped. Pinned so a future "widen it"
  // change is a deliberate decision, not an accident.
  test("DOCUMENTED LIMITATION: scheme-less non-Google bare domain is NOT stripped", () => {
    expect(stripAgendaUrls("Call zoom.us/j/1")).toContain("zoom.us/j/1");
  });
});
```

- [ ] Write the test. **Run → MUST FAIL** (module does not exist): `pnpm vitest run tests/visibility/agendaUrls.test.ts`. **Failure mode caught:** a Drive/Zoom/CDN/scheme-less-Google URL pasted into an agenda `title`/`room`/`av` cell reaching the crew DOM (the §10/§7.3 raw-URL-in-crew-DOM invariant, generalized to agenda free text).

**Minimal implementation:** `lib/visibility/agendaUrls.ts`

```ts
/**
 * lib/visibility/agendaUrls.ts — render-time URL sanitizer for AGENDA
 * run-of-show free-text fields (title / room / av), Phase-2 §4.3.
 *
 * Broader than stripOpeningReelText's DRIVE_URL_RE (Drive/Docs only): agenda
 * cells can paste Zoom / Teams / signed-CDN links, so this strips EVERY schemed
 * URL plus scheme-less Google links. The DOM invariant it upholds is exactly:
 * no `https://`, `http://`, `drive.google.com`, or `docs.google.com` substring
 * in the crew DOM.
 *
 * DOCUMENTED LIMITATION (spec §4.3, do-not-relitigate): a scheme-less NON-Google
 * bare domain (e.g. `zoom.us/j/1`, `teams.microsoft.com/l/…`) is NOT stripped —
 * deliberately, because (i) pasted links carry a scheme in practice and (ii) a
 * general `\w+\.\w+/\S+` stripper would over-strip legitimate agenda text
 * (`A/V`, a room labeled `5/6`, `Q&A w/ X`).
 *
 * Pure function — no I/O, deterministic. Reuses the orphan-connector +
 * whitespace cleanup chain from stripOpeningReelText (openingReelText.ts:62-68).
 */

/** Every schemed URL (greedy on non-whitespace) — covers Zoom/Teams/CDN/Drive/Docs WITH a scheme. */
const SCHEMED_URL_RE = /https?:\/\/\S+/g;
/** Scheme-less Google Drive/Docs links (Doug sometimes omits the scheme). */
const SCHEMELESS_GOOGLE_RE = /(?:drive|docs)\.google\.com\/\S+/g;

export function stripAgendaUrls(value: string): string {
  return value
    .replace(SCHEMED_URL_RE, "")
    .replace(SCHEMELESS_GOOGLE_RE, "")
    // Orphan connectors the URL strip leaves behind (mirrors openingReelText).
    .replace(/\s*-\s*$/, "")
    .replace(/^\s*-\s*/, "")
    // Collapse whitespace runs + trim.
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] Run → **MUST PASS**: `pnpm vitest run tests/visibility/agendaUrls.test.ts`.
- [ ] **Commit:** `feat(crew-page): add stripAgendaUrls render sanitizer for run-of-show free text`

---

### Task 2 — Run-of-show entry render + per-day mode branch (test 5)

**Files:** edit `components/crew/sections/ScheduleSection.tsx`; create `tests/components/crew/sections/ScheduleSection.agenda.test.tsx`.

**Interface:** add (1) a module const `export const RUN_OF_SHOW_DISPLAY_CAP = 20;` and a `const TITLE_TRUNCATE_AT = 80;`; (2) a per-entry render helper `RunOfShowEntry`; (3) a per-day `RunOfShowList` that takes `entries: AgendaEntry[]` and `isoDate: string`; (4) the branch inside the day-map wrapper: when `data.runOfShow?.[day.date]?.length` is truthy → render `<RunOfShowList entries={…} isoDate={day.date} />` INSIDE the day wrapper (in addition to / replacing the `<DayCard>` content's body — see impl). Import `AgendaEntry` type, `shouldHideGenericOptional`, `stripAgendaUrls`.

> **Render placement decision (binding):** the run-of-show list renders **inside the existing day wrapper `<div>`** (`ScheduleSection.tsx:170-175`), as a child appended after `<DayCard>` so the day's phase/date header (DayCard) is preserved and the run-of-show is its body. The wrapper keeps its `data-testid`/`data-day`/`data-today` (today-pin + clock e2e contract). The new list carries its own `data-testid="run-of-show-<isoDate>"`. A day WITHOUT a confirmed run-of-show renders `<DayCard>` alone (Phase-1-identical).

This task ships the **happy-path list + per-day mutual exclusivity**. Caps/truncation/URL-strip land in Task 3, sentinel hiding in Task 4 — but the entry render helper is written once here with those hooks **stubbed minimally** only where a later task's test will tighten them. To avoid placeholder churn, Task 2's `RunOfShowEntry` already routes title through `stripAgendaUrls` and optional fields through `shouldHideGenericOptional` (so Tasks 3/4 only ADD tests + caps, not re-architect). The Task-2 test asserts ONLY the per-day mode contract.

**Failing test (write FIRST):** `tests/components/crew/sections/ScheduleSection.agenda.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const DATES = { travelIn: null, set: null, showDays: ["2026-05-14", "2026-05-15"], travelOut: null };
const D1 = "2026-05-14";
const D2 = "2026-05-15";
const VIEWER = { kind: "admin" } as const;

// Data source for the assertions — NOT the rendered container (anti-tautology):
// expected entry text is read from THIS array, never from the DOM that renders it.
const D1_ENTRIES: AgendaEntry[] = [
  { start: "7:15 AM", finish: "7:30 AM", trt: "0:15", title: "Family Office Only Breakfast", av: "NONE" },
  { start: "8:15 AM", finish: "8:30 AM", trt: "0:15", title: "Welcome and Introductory Remarks", room: "Mabel 1", av: "POD" },
];

function renderAgenda(runOfShow: Record<string, AgendaEntry[]> | null) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}

describe("Schedule enrichment — per-day run-of-show mode (test 5)", () => {
  test("day with entries → run-of-show list; day without → no run-of-show element (anchor-only)", () => {
    const c = renderAgenda({ [D1]: D1_ENTRIES }); // D1 filled, D2 absent
    const d1List = c.querySelector(`[data-testid="run-of-show-${D1}"]`);
    const d2List = c.querySelector(`[data-testid="run-of-show-${D2}"]`);
    expect(d1List, "D1 has entries → run-of-show list present").not.toBeNull();
    expect(d2List, "D2 has no entries → NO run-of-show element").toBeNull();
    // Each entry's title (from the DATA SOURCE) appears inside the D1 list subtree.
    for (const e of D1_ENTRIES) {
      expect(d1List!.textContent).toContain(e.title);
    }
  });

  test("exactly-one-mode-per-day: clone the D1 day subtree, assert a run-of-show list AND no second mode marker", () => {
    const c = renderAgenda({ [D1]: D1_ENTRIES });
    // The day wrapper for D1 (today) carries data-day=D1.
    const dayWrapper = c.querySelector(`[data-day="${D1}"]`);
    expect(dayWrapper).not.toBeNull();
    const clone = dayWrapper!.cloneNode(true) as HTMLElement;
    // Exactly one per-day run-of-show CONTAINER inside the day. The container
    // testid is `run-of-show-<isoDate>`; entry rows / overflow stub use the
    // `agenda-*` namespace (NOT the `run-of-show-` prefix), so the prefix
    // selector counts ONLY the per-day container — exactly 1 for a correct
    // render, regardless of entry count. (A `^="run-of-show-"` selector would
    // otherwise also match every entry row + the stub and read 3+, going red
    // for the wrong reason.)
    expect(clone.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(1);
    // Belt-and-braces: the exact container testid is present exactly once, and
    // there is no second per-day container of a different ISO date in this day.
    expect(clone.querySelectorAll(`[data-testid="run-of-show-${D1}"]`).length).toBe(1);
    // The DayCard header still renders (the run-of-show is the body, not a replacement).
    expect(clone.querySelector('[data-testid="agenda-overflow-stub"]')).toBeNull(); // only 2 entries < cap
  });

  test("runOfShow = null → NO run-of-show element on any day (Phase-1 identical)", () => {
    const c = renderAgenda(null);
    expect(c.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(0);
  });

  test("a title-only entry (no time/room/av) renders the title row, never an empty row", () => {
    const c = renderAgenda({ [D1]: [{ start: "", title: "Closing Remarks" }] });
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`);
    expect(list!.textContent).toContain("Closing Remarks");
    // Exactly one entry row.
    expect(list!.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(1);
  });
});
```

- [ ] Write the test. **Run → MUST FAIL** (no `run-of-show-<iso>` element renders): `pnpm vitest run tests/components/crew/sections/ScheduleSection.agenda.test.tsx`. **Failure mode caught:** double-rendering (both modes in one day), the anchor floor disappearing when a SIBLING day has agenda, a title-only entry rendering an empty row, or the list rendering when `runOfShow` is null.

**Minimal implementation** — edit `components/crew/sections/ScheduleSection.tsx`. Add imports + consts + helpers near the top (after the existing imports / `aggregateDays`), and the per-day branch inside the map. Full additions:

```tsx
// ── add to the import block (top of file) ───────────────────────────────
import type { AgendaEntry } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";

// ── add near the top-level consts (after the imports) ───────────────────
/** §4.3 / D-6 display cap: render at most this many entries per day. */
export const RUN_OF_SHOW_DISPLAY_CAP = 20;
/** §4.3 / D-6: title display-truncation threshold (chars). */
const TITLE_TRUNCATE_AT = 80;

/**
 * Resolve an optional agenda field for display: URL-strip it, then hide it if
 * the residue is a generic sentinel ('' / TBD / N/A / TBA). Returns null when
 * the field should not render (the entry still renders iff its title is real,
 * which the parser/decoder already guarantee).
 */
function resolveOptionalField(value: string | undefined): string | null {
  if (value == null) return null;
  const stripped = stripAgendaUrls(value);
  if (shouldHideGenericOptional(stripped)) return null;
  return stripped;
}

/** One run-of-show row: START–FINISH · TITLE, with ROOM + AV badge when present. */
function RunOfShowEntry({ entry }: { entry: AgendaEntry }): JSX.Element {
  // Title is URL-stripped (free text could paste a link); it is REAL by contract
  // (parser step-4 + decodeRunOfShow gate), so it always renders.
  const title = stripAgendaUrls(entry.title);
  const isLong = title.length > TITLE_TRUNCATE_AT;
  const start = resolveOptionalField(entry.start) ?? "";
  const finish = resolveOptionalField(entry.finish);
  const room = resolveOptionalField(entry.room);
  const av = resolveOptionalField(entry.av);
  const timeLabel = finish ? `${start}–${finish}` : start;

  return (
    <li data-testid="agenda-entry" className="flex flex-col gap-0.5 py-1">
      <div className="flex items-baseline gap-2">
        {timeLabel ? (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-text-subtle">
            {timeLabel}
          </span>
        ) : null}
        {isLong ? (
          <details data-testid="agenda-title-truncated" className="min-w-0">
            <summary className="cursor-pointer text-sm font-medium text-text-strong">
              {`${title.slice(0, TITLE_TRUNCATE_AT)}…`}
            </summary>
            <span className="text-sm text-text-strong">{title}</span>
          </details>
        ) : (
          <span className="min-w-0 text-sm font-medium text-text-strong">{title}</span>
        )}
      </div>
      {room || av ? (
        <div className="flex items-center gap-2 text-xs text-text-subtle">
          {room ? <span data-agenda-field="room">{room}</span> : null}
          {av ? (
            <span
              data-agenda-field="av"
              className="rounded-xs bg-surface-sunken px-1.5 py-0.5 font-medium uppercase tracking-eyebrow"
            >
              {av}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Per-day run-of-show list with the §4.3 display cap + overflow stub. */
function RunOfShowList({ entries, isoDate }: { entries: AgendaEntry[]; isoDate: string }): JSX.Element {
  const shown = entries.slice(0, RUN_OF_SHOW_DISPLAY_CAP);
  const overflow = entries.length - RUN_OF_SHOW_DISPLAY_CAP; // derived from the STORED array
  return (
    <div data-testid={`run-of-show-${isoDate}`} className="mt-2 flex flex-col">
      <ul className="flex flex-col divide-y divide-border-subtle">
        {shown.map((entry, i) => (
          <RunOfShowEntry key={i} entry={entry} />
        ))}
      </ul>
      {overflow > 0 ? (
        <div
          data-testid="agenda-overflow-stub"
          data-tile-show-more="true"
          className="pt-1 text-xs text-text-subtle"
        >
          {`+${overflow} more ${overflow === 1 ? "agenda item" : "agenda items"}`}
        </div>
      ) : null}
    </div>
  );
}
```

Then edit the per-day wrapper (`ScheduleSection.tsx:169-177`) to append the list inside the wrapper:

```tsx
return (
  <div
    key={day.date}
    data-testid={isToday ? "schedule-day-today" : `schedule-day-${day.date}`}
    data-day={day.date}
    {...(isToday ? { "data-today": "true" } : {})}
  >
    <DayCard day={day.date} phase={day.phase} today={isToday} />
    {data.runOfShow?.[day.date]?.length ? (
      <RunOfShowList entries={data.runOfShow[day.date]!} isoDate={day.date} />
    ) : null}
  </div>
);
```

- [ ] Run → **MUST PASS**: `pnpm vitest run tests/components/crew/sections/ScheduleSection.agenda.test.tsx`.
- [ ] Run the existing Schedule test for no regression: `pnpm vitest run tests/components/crew/sections/ScheduleSection.test.tsx` (must stay green — proves the day wrapper testid/today-pin contract is intact).
- [ ] **Commit:** `feat(crew-page): render run-of-show list per Schedule day when confirmed`

---

### Task 3 — Caps + truncation + URL-strip (test 7a) + extend CardinalityCapBoundary

**Files:** edit `tests/components/tiles/CardinalityCapBoundary.test.tsx`; create `tests/components/crew/sections/ScheduleSection.caps.test.tsx`. (No `ScheduleSection.tsx` change should be needed — Task 2 already implemented the cap + `<details>` + `stripAgendaUrls`; this task PROVES them and pins the boundary. If a test fails, fix the impl minimally.)

**Failing test A — caps/truncation/URL-strip behavior:** `tests/components/crew/sections/ScheduleSection.caps.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { RUN_OF_SHOW_DISPLAY_CAP } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const D1 = "2026-05-14";
const DATES = { travelIn: null, set: null, showDays: [D1], travelOut: null };
const VIEWER = { kind: "admin" } as const;

function renderEntries(entries: AgendaEntry[]) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow: { [D1]: entries } })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}
const mkEntries = (n: number): AgendaEntry[] =>
  Array.from({ length: n }, (_, i) => ({ start: `${i}:00`, title: `Session ${String(i + 1).padStart(2, "0")}` }));

describe("Schedule run-of-show — display cap + truncation + URL-strip (test 7a)", () => {
  test(`cap+1 (${RUN_OF_SHOW_DISPLAY_CAP + 1}) → exactly cap rows + stub count = length − cap (tail-trim)`, () => {
    const n = RUN_OF_SHOW_DISPLAY_CAP + 1;
    const expectedOverflow = n - RUN_OF_SHOW_DISPLAY_CAP; // derived
    const c = renderEntries(mkEntries(n));
    expect(c.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(RUN_OF_SHOW_DISPLAY_CAP);
    const stub = c.querySelector('[data-testid="agenda-overflow-stub"]');
    expect(stub).not.toBeNull();
    expect(stub!.textContent).toContain(`+${expectedOverflow}`);
    // Tail-trim: last shown present, first overflowed absent.
    const text = c.textContent ?? "";
    expect(text).toContain(`Session ${String(RUN_OF_SHOW_DISPLAY_CAP).padStart(2, "0")}`);
    expect(text).not.toContain(`Session ${String(RUN_OF_SHOW_DISPLAY_CAP + 1).padStart(2, "0")}`);
  });

  test(`exactly cap (${RUN_OF_SHOW_DISPLAY_CAP}) → all rows, NO stub (no +0 at >= cap)`, () => {
    const c = renderEntries(mkEntries(RUN_OF_SHOW_DISPLAY_CAP));
    expect(c.querySelectorAll('[data-testid="agenda-entry"]').length).toBe(RUN_OF_SHOW_DISPLAY_CAP);
    expect(c.querySelector('[data-testid="agenda-overflow-stub"]')).toBeNull();
    expect(c.textContent ?? "").not.toContain("+0");
  });

  test("title > 80 chars → <details> with truncated summary + full body", () => {
    const long = "Z".repeat(81);
    const c = renderEntries([{ start: "9:00", title: long }]);
    const details = c.querySelector('[data-testid="agenda-title-truncated"]');
    expect(details).not.toBeNull();
    expect(details!.querySelector("summary")!.textContent).toContain("…");
    expect(details!.textContent).toContain(long); // full body preserved in <details>
  });

  test("URL-strip: Drive / non-Google schemed / scheme-less-Google links never reach the crew DOM", () => {
    const c = renderEntries([
      { start: "9:00", title: "Keynote https://drive.google.com/file/d/abc", room: "https://zoom.us/j/9", av: "drive.google.com/x" },
    ]);
    const dom = (c.textContent ?? "").toLowerCase();
    for (const f of ["https://", "http://", "drive.google.com", "docs.google.com"]) {
      expect(dom).not.toContain(f);
    }
    expect(c.textContent).toContain("Keynote");
  });
});
```

- [ ] Write the test. **Run → MUST FAIL** if Task 2's cap/`<details>`/strip is incomplete (it should mostly pass; tighten impl if not): `pnpm vitest run tests/components/crew/sections/ScheduleSection.caps.test.tsx`. **Failure mode caught:** unbounded mobile scroll (no cap), a wrong overflow count (`>= cap` off-by-one, or counting from the displayed-not-stored array), an 81-char title rendering full without `<details>`, or a Drive/Zoom/scheme-less-Google URL leaking into the crew DOM.

**Failing test B — extend the boundary matrix:** add to `tests/components/tiles/CardinalityCapBoundary.test.tsx` a new `describe` block (after the Pack-list block, ~`:386`). Import additions at the top:

```tsx
import { ScheduleSection, RUN_OF_SHOW_DISPLAY_CAP } from "@/components/crew/sections/ScheduleSection";
import type { AgendaEntry } from "@/lib/parser/types";
```

New block:

```tsx
// ─────────────────────────────────────────────────────────────────────
// Run-of-show — RUN_OF_SHOW_DISPLAY_CAP = 20 (ScheduleSection, exported)
//   rows: [data-testid="agenda-entry"]
//   overflow stub: [data-testid="agenda-overflow-stub"]
// Cap is exported, so this asserts the live const (not a mirrored literal).
// ─────────────────────────────────────────────────────────────────────
describe("§8.4 cardinality-cap — Run-of-show (RUN_OF_SHOW_DISPLAY_CAP, ScheduleSection)", () => {
  const D1 = "2026-05-14";
  const RS_DATES = { travelIn: null, set: null, showDays: [D1], travelOut: null };
  const RS_TODAY = new Date("2026-05-14T15:00:00Z");

  function makeEntries(count: number): AgendaEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      start: `${i}:00`,
      title: `Agenda Item ${String(i + 1).padStart(2, "0")}`,
    }));
  }
  function renderRunOfShow(count: number) {
    return render(
      <ScheduleSection
        data={makeShowForViewer({ show: { dates: RS_DATES }, runOfShow: { [D1]: makeEntries(count) } })}
        viewer={VIEWER}
        today={RS_TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  test.each([RUN_OF_SHOW_DISPLAY_CAP - 1, RUN_OF_SHOW_DISPLAY_CAP, RUN_OF_SHOW_DISPLAY_CAP + 1])(
    "run-of-show cap boundary at %i",
    (n) => {
      const c = renderRunOfShow(n);
      const rows = c.querySelectorAll('[data-testid="agenda-entry"]').length;
      const stub = c.querySelector('[data-testid="agenda-overflow-stub"]');
      if (n <= RUN_OF_SHOW_DISPLAY_CAP) {
        expect(rows).toBe(n);
        expect(stub).toBeNull();
        expect(c.textContent ?? "").not.toContain("+0");
      } else {
        const expectedOverflow = n - RUN_OF_SHOW_DISPLAY_CAP; // derived
        expect(rows).toBe(RUN_OF_SHOW_DISPLAY_CAP);
        expect(stub).not.toBeNull();
        expect(stub!.getAttribute("data-tile-show-more")).toBe("true");
        expect(stub!.textContent).toContain(`+${expectedOverflow}`);
        const text = c.textContent ?? "";
        expect(text).toContain(`Agenda Item ${String(RUN_OF_SHOW_DISPLAY_CAP).padStart(2, "0")}`);
        expect(text).not.toContain(`Agenda Item ${String(RUN_OF_SHOW_DISPLAY_CAP + 1).padStart(2, "0")}`);
      }
    },
  );
});
```

- [ ] **Run → MUST PASS** both: `pnpm vitest run tests/components/crew/sections/ScheduleSection.caps.test.tsx tests/components/tiles/CardinalityCapBoundary.test.tsx`. **Failure mode caught (matrix):** the run-of-show list silently dropping into the un-pinned set of section caps, so a future cap regression (off-by-one at the `> cap` vs `>= cap` boundary, or a head-trim) ships unnoticed.
- [ ] **Commit:** `test(crew-page): pin run-of-show display cap + truncation + URL-strip; extend CardinalityCapBoundary`

---

### Task 4 — Sentinel hiding (test 8) + extend `_metaSentinelHidingContract`

**Files:** edit `tests/components/tiles/_metaSentinelHidingContract.test.ts`; create `tests/components/crew/sections/ScheduleSection.sentinel.test.tsx`. (No `ScheduleSection.tsx` change expected — Task 2 already routes optional fields through `resolveOptionalField` → `shouldHideGenericOptional`; tighten only if a test fails.)

**Failing test A — behavioral sentinel hiding:** `tests/components/crew/sections/ScheduleSection.sentinel.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const D1 = "2026-05-14";
const DATES = { travelIn: null, set: null, showDays: [D1], travelOut: null };
const VIEWER = { kind: "admin" } as const;

function renderEntries(entries: AgendaEntry[]) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow: { [D1]: entries } })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}

describe("Schedule run-of-show — sentinel hiding per optional field (test 8a)", () => {
  test("room='TBD' / av='' are hidden, but the entry still shows (title is real)", () => {
    const c = renderEntries([{ start: "9:00", title: "Opening Keynote", room: "TBD", av: "" }]);
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    expect(list.textContent).toContain("Opening Keynote");
    expect(list.querySelector('[data-agenda-field="room"]')).toBeNull();
    expect(list.querySelector('[data-agenda-field="av"]')).toBeNull();
    expect(list.textContent).not.toContain("TBD");
  });

  test("finish='N/A' hidden → time shows START only (no en-dash range)", () => {
    const c = renderEntries([{ start: "9:00", finish: "N/A", title: "Session" }]);
    const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
    expect(list.textContent).toContain("9:00");
    expect(list.textContent).not.toContain("N/A");
    expect(list.textContent).not.toContain("–"); // no range dash when finish is sentinel
  });
});
```

- [ ] Write the test. **Run → MUST PASS** (Task 2 already wired it; if it fails, fix `resolveOptionalField`): `pnpm vitest run tests/components/crew/sections/ScheduleSection.sentinel.test.tsx`. **Failure mode caught:** a `TBD`/blank `room`/`av`/`finish` leaking into the run-of-show row as if real content; an `N/A` finish producing a `9:00–N/A` range.

> **Note on test 8 "sentinel TITLE → anchor strip":** the spec's test 8b (a row whose TITLE is a sentinel → no entry; a day of all-sentinel titles → `[]` → anchor strip) is a **PARSER/decoder contract** owned by §01 (parser step-4 emit gate) and §02 (`decodeRunOfShow` title gate) — by the time data reaches `ScheduleSection`, a sentinel-title day is already `runOfShow[d] = []` or the key is absent, so the UI's `?.length > 0` branch falls to anchor-only. The §03-side assertion is: **a day projected with zero entries renders no run-of-show element** — already covered by Task 2's "runOfShow=null" + the per-day "D2 absent → null" assertions, and re-pinned by test 6a below. **No additional §03 test is needed for 8b** beyond confirming the empty-day → anchor-only path (Task 2). State this in the commit body so the reviewer doesn't expect a parser test here.

**Failing test B — extend the structural meta-test:** add a `GENERIC_OPTIONAL_FIELDS` row to `tests/components/tiles/_metaSentinelHidingContract.test.ts` (in the array, `:133-222`) matching the new agenda field read path:

```ts
// Phase-2 §4.3: ScheduleSection run-of-show optional fields. The agenda entry's
// room / av / finish / trt are generic-optional free text — a sentinel ('TBD' /
// 'N/A' / 'TBA' / '') must hide the field, not render as content. The pattern
// anchors on `entry.(room|av|finish|trt)` (RunOfShowEntry's accessor) so a
// future refactor that drops the predicate fails at CI.
{
  description: "agenda entry.room / av / finish / trt (run-of-show)",
  pattern: /\bentry\??\.(room|av|finish|trt)\b/,
},
```

- [ ] **Run → MUST PASS**: `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts`. (Because `ScheduleSection.tsx` reads `entry.room`/`entry.av`/`entry.finish`/`entry.trt` AND imports+calls `shouldHideGenericOptional`, the new pattern matches and the structural contract is satisfied. **Negative-regression check:** temporarily comment out the `shouldHideGenericOptional` import in `ScheduleSection.tsx`, re-run → the meta-test MUST FAIL; restore. Note the negative-regression result in the commit body.)
- [ ] **Commit:** `test(crew-page): pin run-of-show sentinel hiding; extend _metaSentinelHidingContract pattern`

---

### Task 5 — Anchor floor + CONFIRMED-ONLY non-regression (test 6 — the load-bearing pin)

**Files:** create `tests/components/crew/sections/ScheduleSection.anchorFloor.test.tsx`.

> **Scope note:** test 6's parts (b)/(c)/(d) are the **storage/sync/observability** contract — those are pinned end-to-end by §01/§02's parser + sync + projection tests (tests 4b, 6 in those files), where the sync write + `ParseWarning` emission + projection live. **§03's slice of test 6 is the UI half: given a `ShowForViewer.runOfShow` projection value, the Schedule section renders the anchor floor for every non-confirmed shape and is byte-identical to Phase-1 when `runOfShow` is null/empty.** The CONFIRMED-ONLY *retention* (storage drops non-confirmed days) happens upstream — by the time it reaches §03, a non-confirmed day is simply absent / `[]` in `runOfShow`. This task proves §03 never resurrects a stale entry from anywhere and never cannibalizes the floor.

**Failing test:** `tests/components/crew/sections/ScheduleSection.anchorFloor.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ScheduleSection } from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const D1 = "2026-05-14";
const D2 = "2026-05-15";
const DATES = { travelIn: null, set: null, showDays: [D1, D2], travelOut: null };
const VIEWER = { kind: "admin" } as const;

function renderRos(runOfShow: Record<string, AgendaEntry[]> | null, extra?: Partial<Parameters<typeof makeShowForViewer>[0]>) {
  return render(
    <ScheduleSection
      data={makeShowForViewer({ show: { dates: DATES }, runOfShow, ...extra })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}

describe("Schedule anchor floor + CONFIRMED-ONLY (test 6 — UI half)", () => {
  test("6a — runOfShow=null → byte-identical to the no-agenda render (no run-of-show element, day cards + key-times strip intact)", () => {
    const withNull = renderRos(null).innerHTML;
    // The Phase-1 floor: day cards present, key-times strip column present, no run-of-show element.
    const c = renderRos(null);
    expect(c.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(0);
    expect(c.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(2);
    expect(c.querySelector('[data-schedule-column="times"]')).not.toBeNull();
    // Idempotent floor: re-render is identical (guards accidental nondeterminism).
    expect(renderRos(null).innerHTML).toBe(withNull);
  });

  test("6a' — runOfShow={} (empty object) → treated as no-agenda (all anchor-only)", () => {
    const c = renderRos({});
    expect(c.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(0);
  });

  test("6c — a non-confirmed shape projects as absent/[] for a day → that day is anchor-only, NEVER prior entries", () => {
    // D1 confirmed (entries), D2 non-confirmed (absent from runOfShow OR []).
    const cAbsent = renderRos({ [D1]: [{ start: "9:00", title: "Real Session" }] });
    expect(cAbsent.querySelector(`[data-testid="run-of-show-${D1}"]`)).not.toBeNull();
    expect(cAbsent.querySelector(`[data-testid="run-of-show-${D2}"]`)).toBeNull();
    // []-valued day guards the same way (UI keys off ?.length > 0).
    const cEmpty = renderRos({ [D1]: [{ start: "9:00", title: "Real Session" }], [D2]: [] });
    expect(cEmpty.querySelector(`[data-testid="run-of-show-${D2}"]`)).toBeNull();
    // No stale text from D2 anywhere.
    expect(cEmpty.textContent).not.toContain("run-of-show-2026-05-15");
  });

  test("6b — a run_of_show fetch fault (tileErrors['run_of_show']) does NOT remove the anchor floor", () => {
    // The Schedule section renders its day cards + times strip regardless of a
    // run_of_show tileError (that error surfaces in the CrewShell projection
    // alert — Phase-1 §4.13 — not by blanking Schedule). runOfShow falls to null.
    const c = renderRos(null, { tileErrors: { run_of_show: "boom" } as Record<string, string> });
    expect(c.querySelectorAll('[data-testid^="schedule-day"]').length).toBe(2);
    expect(c.querySelector('[data-schedule-column="times"]')).not.toBeNull();
    expect(c.querySelectorAll('[data-testid^="run-of-show-"]').length).toBe(0);
    // No raw infra text in the crew DOM.
    expect(c.textContent).not.toContain("boom");
  });
});
```

- [ ] Write the test. **Run → MUST FAIL** initially only if Task 2's null/empty guard is wrong; otherwise it should pass green after Task 2 (it is the regression PIN). Run: `pnpm vitest run tests/components/crew/sections/ScheduleSection.anchorFloor.test.tsx`. **Failure mode caught:** Phase 2 cannibalizing the Phase-1 anchor floor (day cards / times strip disappearing when `runOfShow` is null or a fetch fault fires); a `{}`-or-`[]` day rendering an empty run-of-show element; a non-confirmed day resurrecting stale entries; raw infra text (`"boom"`) leaking into the crew DOM. **This is the R22 / wp-12 UI guard — do-not-relitigate the CONFIRMED-ONLY retention; §03 only proves the UI never resurrects what §02 dropped.**
- [ ] **Commit:** `test(crew-page): pin Schedule anchor floor + CONFIRMED-ONLY non-regression (R22 UI half)`

---

### Task 6 — Full suite + typecheck + lint (verification gate before close-out)

**No new files.** Verification only.

- [ ] `pnpm typecheck` — MUST pass (the new exported const `RUN_OF_SHOW_DISPLAY_CAP`, `AgendaEntry` import, `runOfShow` projection consumption all typecheck under `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`; note `data.runOfShow[day.date]!` non-null after the `?.length` guard).
- [ ] `pnpm vitest run tests/components/crew tests/components/tiles tests/visibility` — the full affected suite green.
- [ ] `pnpm test:audit:x2-no-raw-codes` — confirms no new crew-facing raw code (the agenda surface renders no `AGENDA_*` codes — they are parser-internal).
- [ ] `pnpm lint` — MUST pass (no inline `tracking-[…]`; tokens only).
- [ ] **No commit** (verification only) unless a fix was required; if so, commit `fix(crew-page): <what>` per TDD.

---

### Task 7 — Self-review (plan + diff)

**No new files.** Apply the spec self-review additions (AGENTS.md project-scoped) against the full §03 diff:

- [ ] **Guard conditions (§4.5):** confirm every `runOfShow` shape is handled — `null` → anchors (test 6a); `{}` → anchors (6a'); `[date]=[]` → anchors (6c); title-only entry → title row (Task 2); sentinel optional fields → hidden (Task 4); `unknown_asterisk` viewer → projection drops all keys (the existing Phase-1 unknown_asterisk early-return at `ScheduleSection.tsx:111-122` runs BEFORE the day map, so no run-of-show renders — confirm by reading the branch; add a one-line assertion to Task 2 if not implicitly covered).
- [ ] **Mode boundaries (§4.6):** exactly-one-mode-per-day pinned (Task 2 clone assertion). No shared element between modes.
- [ ] **Cap/truncation (§4.5/D-6):** 20-cap + `+N more` (count from STORED array) + 80-char `<details>` all pinned (Task 3). Overflow at `> cap` not `>= cap`.
- [ ] **Rendered-vs-conceptual:** the run-of-show list, overflow stub, and truncated-title `<details>` are RENDERED elements with exact `data-testid`s — confirm each is in the impl, not just prose.
- [ ] **No-animation / no-fixed-dimension-parent** declarations (§4.6) are correct and the corresponding tasks are deliberately ABSENT (stated in "Mode boundaries" section above).
- [ ] **Existing-code citations:** re-grep every `file:line` cited in this plan against the live tree (`ScheduleSection.tsx:160-179`, `emptyState.ts:75`, `openingReelText.ts:62-68`, `resolveKeyTimes.ts:43`, `_metaSentinelHidingContract.test.ts:100-103/133-222`, `CardinalityCapBoundary.test.tsx`). Fix any drift.
- [ ] **Self-consistency sweep:** the only numeric literals are `20` (display cap), `80` (title truncate). Confirm both appear once-as-source (`RUN_OF_SHOW_DISPLAY_CAP`, `TITLE_TRUNCATE_AT`) and every test derives from them, never re-hardcodes.
- [ ] **Supabase invariant-9 waiver present (defers to §02 Task 02.5):** confirm the `getShowForViewer` `shows_internal.run_of_show` read carries its inline `// not-subject-to-meta: <reason>` waiver (added in §02; `lib/data` is outside `_metaInfraContract`'s auth-domain scan). Verify: `grep -n "not-subject-to-meta" lib/data/getShowForViewer.ts` returns a hit on the `run_of_show` read. §03 does NOT add this waiver — it only verifies it landed; if absent, the gap is §02's, flag it back to the orchestrator (do not patch §02 from §03's session).

---

### Task 8 — Adversarial review (cross-model, Codex) — MANDATORY, between self-review and execution handoff

**No new files.** Invoke the `adversarial-review` skill (sends the §03 diff to Codex for cross-model critique). Iterate until **APPROVE** (round-3 cap per the disagreement-loop rule). Reviewer is **REVIEWER ONLY** — Codex does not fix; fixes come back to this Opus session.

The review-focus brief MUST include this **EXPLICITLY DO NOT RELITIGATE** block (cite each at `file:line`/`watchpoint`):

- [ ] **CONFIRMED-ONLY retention (wp-12 / D-2 / R17→R21→R22):** the crew see a day's run-of-show iff the latest sync confirmed it; every non-confirmed shape (read-empty, unresolved block, unlocatable grid) → anchors. **No preserve-and-show path.** §03 only proves the UI never resurrects a dropped day; the retention itself is §02's. Spec §4.4 invariants 2-3 + retention matrix.
- [ ] **Fail-soft is the contract (wp-1):** a malformed/`#REF!`/ragged AGENDA never throws or removes the anchor floor — the floor is the Phase-1 baseline and is never cannibalized (test 6a/6b).
- [ ] **No new admin code (wp-2):** Phase 2 adds NO `admin_alerts` code, NO §12.4 catalog change, NO `upsert_admin_alert`/`_metaAdminAlertCatalog` change. `run_of_show` rides the existing `TILE_PROJECTION_FETCH_FAILED` (domain-agnostic). §03 adds NO alert-side code at all (that's §02's `failedKeys` 6th-domain test).
- [ ] **`run_of_show` is admin-only `shows_internal` (wp-8):** never `public.shows`/`ShowRow`. (§02 territory — flag if §03 prose contradicts it.)
- [ ] **Phase 2 is AGENDA-only (wp-11):** no flights / Wi-Fi split / room-within-venue — those are `BL-CREW-FIELD-ENRICHMENT`.
- [ ] **Empty AGENDA is a valid result (wp-9):** `runOfShow = null` is the designed phased state, not a bug; a day with no confirmed agenda correctly renders anchors.
- [ ] **`stripAgendaUrls` documented limitation (§4.3):** scheme-less non-Google bare domains are NOT stripped — deliberate (a general bare-domain stripper over-strips `A/V`, `5/6`, `Q&A w/ X`). Do not push toward a general stripper.
- [ ] **No-animation / no-getBoundingClientRect (§4.6):** per-day mode is fixed at render (instant, no Transition Inventory); no fixed-dimension parent (no Playwright layout task). Do not request either.
- [ ] Address every HIGH/CRITICAL finding (fix or DEFERRED.md). Record findings + dispositions for the handoff doc. **Do not proceed to Task 9 without an APPROVE.**

---

### Task 9 — Impeccable dual-gate (critique + audit) — UI quality gate (invariant 8)

**No new files** (unless a finding requires a fix). The §03 Schedule enrichment is a UI surface → run BOTH impeccable v3 commands with the canonical preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal), **external attestation** (a fresh subagent or the user runs them — not self-attested).

- [ ] `/impeccable critique` on the §03 diff (affected: `components/crew/sections/ScheduleSection.tsx`, `lib/visibility/agendaUrls.ts`). PASS.
- [ ] `/impeccable audit` on the same diff. PASS.
- [ ] HIGH + CRITICAL findings either FIXED (commit `fix(crew-page): <what>` per TDD — new test first) OR explicitly DEFERRED via a `docs/superpowers/plans/2026-06-15-crew-page-redesign-phase2/DEFERRED.md` entry (concrete trigger, not "later").
- [ ] **Impeccable knows UX, not product contracts:** if a critique copy/label rewrite contradicts the spec (e.g. asking to render a "stale" badge — forbidden by wp-12, or to surface a parser code — forbidden by invariant 5), DO NOT apply it; cite the spec and note the override. (AGENTS.md: impeccable-critique-not-authoritative-vs-spec.)
- [ ] Record findings + dispositions for the milestone handoff doc §12.

---

### Task 10 — Real CI green + merge

**No new files.**

- [ ] Push the branch; open the PR (`gh pr create`). Body ends with the Generated-with-Claude-Code footer.
- [ ] **Real CI must be GREEN** — not just local + adversarial APPROVE (AGENTS.md: local-passes-CI-fails is its own bug class). Watch for: the `_metaSentinelHidingContract` walk picking up the new field read, `CardinalityCapBoundary` matrix, `x2-no-raw-codes`, typecheck, lint, and the help-screenshot drift gate (this is a crew-route UI change — if the Schedule screenshot baseline shifts, regenerate via `pnpm screenshot:help` FROM the pinned amd64 Docker image, then `git restore public/help/screenshots/` is NOT applicable here — commit the regenerated WebPs; coordinate per the help-screenshot-manifest discipline). Verify which gates fire via `gh pr checks`.
- [ ] If CI surfaces an environment gap absent locally, fix and re-run (treat real-CI-green as a separate close-out gate).
- [ ] Merge once green + APPROVE + impeccable PASS. Update the milestone handoff doc (close §03; record impeccable + adversarial dispositions).

---

## §03 exit checklist

- [ ] **Per-day mode tests green** — day with entries → `run-of-show-<iso>` list; day without → anchor-only; exactly one mode per day (Task 2).
- [ ] **Anchor floor byte-identical** — `runOfShow = null` renders the Phase-1 Schedule output unchanged; day cards + times strip intact under a `run_of_show` fetch fault (Task 5, test 6a/6b).
- [ ] **All 3 non-confirmed shapes → anchors (UI half)** — absent / `[]` / null projected day renders anchor-only, never resurrects entries (Task 5, 6c); the storage-side R22 pins live in §02.
- [ ] **URL-strip + caps green** — Drive / non-Google schemed / scheme-less-Google URLs absent from crew DOM; 20-cap + `+N more` (count = `length − 20`) + 80-char `<details>` (Task 3, test 7a).
- [ ] **Sentinel meta extended** — `_metaSentinelHidingContract` `GENERIC_OPTIONAL_FIELDS` gains the `entry.(room|av|finish|trt)` pattern AND `ScheduleSection.tsx` imports+calls `shouldHideGenericOptional` (Task 4); negative-regression confirmed.
- [ ] **CardinalityCapBoundary extended** — run-of-show cap-1/cap/cap+1 row, against the exported `RUN_OF_SHOW_DISPLAY_CAP` (Task 3).
- [ ] **Impeccable PASS** — critique + audit, external attestation, HIGH/CRITICAL fixed or DEFERRED.md'd (Task 9).
- [ ] **Codex APPROVE** — adversarial review converged with the do-not-relitigate block honored (Task 8).
- [ ] **CI green** — real GitHub Actions, all gates including sentinel-meta walk + cap matrix + x2-no-raw-codes + help-screenshot drift (Task 10).
- [ ] **No animation task, no getBoundingClientRect layout task** — deliberately absent per §4.6 (per-day mode fixed at render; no fixed-dimension parent); the omission is documented, not forgotten.
