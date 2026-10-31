/**
 * tests/crew/transitionAudit.test.ts: the crew page's transition audit (crew
 * page redesign spec §7, plan Task 12).
 *
 * Spec §7, copied from docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md
 * (each row's spec line is its key in `ROWS` below):
 *
 * | From → To | Treatment |
 * |---|---|
 * | Sheet closed → open | Sheet slides up from the bottom edge, scrim fades in, `--duration-normal`, `--ease-out-quart`. |
 * | Sheet open → closed (close button, scrim tap, Esc, swipe down, browser Back) | Reverse of the above, same duration. Every close path runs the same exit. **Amendment 2026-10-30 (invariant-8 gate, critique F4; overridable), compound row: another section opened while this exit is still running** (a list row, an in-page link, `openSectionAndReveal`): the departing sheet is dropped at once, without the rest of its exit, and the new section's sheet opens with the closed → open slide. Its title and its body are the new section's from the first frame: reusing the departing frame showed the new title over the old body for as long as the body crossfade ran. An in-sheet switch (open on A → B) is unchanged: one open, the body crossfades. |
 * | Sheet open, dragging → released past the close threshold | Continues to closed with the exit animation. |
 * | Sheet open, dragging → released before the threshold | Springs back to open, `--duration-fast`. |
 * | Sheet open on section A → section B (an in-sheet link to another section) | Sheet stays up; body crossfades, `--duration-normal`; scroll position resets to top. |
 * | Day A selected → day B | Pass body and run-of-show card crossfade, `--duration-normal`; the pass keeps its height during the fade (§8). |
 * | Pass, today: live state X → live state Y | Existing 66-pair `transitionTreatment` table, unchanged. |
 * | Pass, today (live) → another day (static), and back | Crossfade, `--duration-normal`. |
 * | Day button (or "Now") unselected ↔ selected | Background and text color, `--duration-fast`. |
 * | "Now" button present ↔ absent (today enters or leaves the day set at midnight) | Instant; the row re-lays out with no animation. |
 * | Wide nav item inactive ↔ active | Accent bar moves to the active item, `--duration-fast` (matching the admin rail). |
 * | Copy toast hidden → shown → hidden | Fade and 4px rise in, `--duration-fast`; holds 2 s; fades out, `--duration-fast`. |
 * | Light ↔ dark theme | Instant (CSS variable swap). The pass does not change. |
 * | Quick fact, section card, run-of-show row present ↔ omitted | Instant. Only a server render changes these. |
 *
 * **Compound transitions.**
 *
 * | While | Then | Treatment |
 * |---|---|---|
 * | Sheet open | Realtime refresh re-renders the page (`ShowRealtimeBridge` → `router.refresh()`) | Sheet stays open on the same section; its body updates in place with no animation. The open section survives because the controller stays mounted (the freshness invariant cited in §2). |
 * | Sheet open | Viewport crosses into wide (rotation, window resize) | Sheet is dismissed without animation; the page shows the wide layout scrolled to that section; the URL keeps `?s=` and the entry keeps its marker. A nested dialog open inside it unmounts with it; the shared scroll lock leaves the page unlocked whatever the unmount order (§5.2). |
 * | Sheet mid-drag | Viewport crosses into wide | Drag is cancelled, then the row above applies. |
 * | Wide, scrolled to section A | Viewport crosses into compact | Home screen at the top; no sheet opens automatically; `replaceState(url without s, state without crewSheet)`. |
 * | Day `day(iso)` selected | Realtime refresh removes that day from the day set | Selection returns to `live`. |
 * | Sheet open | Realtime refresh removes the open section from membership | Sheet stays open showing the section's fresh empty or degraded state (§5.2); after a lost entitlement it closes to home instead, without animation (§5.2 amendment 2026-10-27). |
 * | Nested dialog open inside the sheet | Realtime refresh removes the dialog's owner | The nested dialog unmounts alone; the sheet stays open; scroll stays locked by the sheet. |
 * | Nested dialog open inside the sheet | Esc pressed | Only the nested dialog closes (§5.2). |
 * | Day crossfade running | Another day tapped | The second selection wins; the running fade is replaced, never queued. |
 * | Sheet open | Theme switched | Not reachable: the header is behind the scrim and inert while the sheet is open. |
 *
 * Reduced motion collapses every row to instant: app/globals.css sets
 * `--duration-fast` and `--duration-normal` to 0ms, and the framer surfaces
 * read the preference and pass a 0 duration.
 *
 * HOW EACH ROW IS PINNED. `ROWS` holds one entry per table row, keyed by its
 * spec line. An entry names the cases that pin the row's behavior, browser
 * (`e2e`) or jsdom (`unit`), and carries source pins for what a case cannot
 * reach: the token each duration is drawn from, and the reduced-motion branch.
 * The suite checks that (1) the keys are exactly the spec's table rows,
 * re-derived from the spec on every run, so a row added there fails here until
 * it has an entry; (2) every named case exists, verbatim, in its file, so a
 * renamed or deleted case fails here; (3) every source pin holds.
 *
 * CONDITIONAL RENDERS. `CONDITIONAL_RENDERS` lists every conditional render
 * (`cond ? <A> : …`, `cond && <A>`, `cond ? null : <A>`) and every
 * `AnimatePresence` in the crew components this redesign added, each with the
 * §7 treatment that governs it. The scan finds them by shape; a new one fails
 * here until it is registered.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// §5.7: these four surfaces are synchronous Server Components — every visual
// difference across viewers/days/show-counts is a distinct render, NOT an
// in-page animated transition. They MUST NOT gain 'use client', framer-motion,
// AnimatePresence, or exit/initial/animate motion props.
const SSR_SURFACES = [
  "components/crew/primitives/KeyTimesStrip.tsx",
  "components/crew/primitives/DayCard.tsx",
  "components/crew/sections/ScheduleSection.tsx",
  "components/crew/sections/HomeSection.tsx",
];

describe("§5.7 SSR surfaces stay instant (no client motion)", () => {
  for (const rel of SSR_SURFACES) {
    test(`${rel} is a synchronous Server Component (no 'use client'/framer/AnimatePresence/motion props)`, () => {
      const src = read(rel);
      // Match only the actual directive (line-start, optional semicolon) — not
      // JSDoc comments that mention 'use client' in backtick or prose form.
      expect(/^['"]use client['"];?\s*$/m.test(src), "must NOT be a client component").toBe(false);
      expect(/framer-motion/.test(src), "must NOT import framer-motion").toBe(false);
      expect(/AnimatePresence/.test(src), "must NOT use AnimatePresence").toBe(false);
      // No motion props on any ternary/conditional render — these surfaces fork
      // SSR output, they do not animate between states.
      expect(
        /\b(exit|initial|animate)\s*=/.test(src),
        "must carry NO exit/initial/animate motion props",
      ).toBe(false);
    });
  }
});

describe("§5.7 the pass IS the single client component (inverse guard)", () => {
  // The pass replaced RightNowHero and carries its machinery (crew page redesign
  // spec §4.3; plan Task 9).
  test("pass: CrewPass carries 'use client' + framer-motion (the ONE animated Today surface)", () => {
    const src = read("components/crew/CrewPass.tsx");
    expect(/^['"]use client['"];?\s*$/m.test(src)).toBe(true);
    expect(/framer-motion/.test(src)).toBe(true);
    // It must select today's day by the client-computed show-tz todayIso.
    expect(/formatIsoForTimezone\(now,\s*props\.timezone\)/.test(src)).toBe(true);
  });
});

// ── The tokens every duration is drawn from ───────────────────────────────────
const CSS = read("app/globals.css");

function tokenMs(name: string): number {
  const m = CSS.match(new RegExp(`--${name}:\\s*(\\d+)ms`));
  if (!m?.[1]) throw new Error(`app/globals.css declares no --${name} in ms`);
  return Number(m[1]);
}

/** `--duration-normal` in seconds, as framer takes it. */
const NORMAL_S = tokenMs("duration-normal") / 1000;
/** `--ease-out-quart` as the framer ease array the sources spell: `[0.25, 1, 0.5, 1]`. */
const EASE_LITERAL = (() => {
  const m = CSS.match(/--ease-out-quart:\s*cubic-bezier\(([^)]+)\)/);
  if (!m?.[1]) throw new Error("app/globals.css declares no --ease-out-quart");
  return `[${m[1]
    .split(",")
    .map((n) => Number(n.trim()))
    .join(", ")}]`;
})();

/** Both motion tokens collapse to 0ms under reduced motion. */
function expectReducedTokens(): void {
  const at = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
  expect(at, "app/globals.css has a reduced-motion block").toBeGreaterThan(-1);
  const block = CSS.slice(at, CSS.indexOf("}", CSS.indexOf("}", at) + 1) + 1);
  expect(block).toMatch(/--duration-fast:\s*0ms/);
  expect(block).toMatch(/--duration-normal:\s*0ms/);
}

const SHEET = "components/crew/CrewSectionSheet.tsx";
const SECTIONS = "components/crew/CrewSections.tsx";
const TRANSITION = "components/crew/CrewSectionTransition.tsx";
const PASS = "components/crew/CrewPass.tsx";
const RUN_CARD = "components/crew/CrewRunOfShowCard.tsx";
const DAY_ROW = "components/crew/CrewDayRow.tsx";
const WIDE_NAV = "components/crew/CrewWideNav.tsx";
const QUICK_FACTS = "components/crew/CrewQuickFacts.tsx";
const ALL_SECTIONS = "components/crew/CrewAllSections.tsx";
const HOME = "components/crew/sections/HomeSection.tsx";

const COMPACT_E2E = "tests/e2e/crew-section-toggle.spec.ts";
const WIDE_E2E = "tests/e2e/crew-wide-nav.spec.ts";
const PAGE_E2E = "tests/e2e/crew-page.spec.ts";
const CONTROLLER_UNIT = "tests/components/crew/crewSections.test.tsx";
const SHEET_UNIT = "tests/components/crew/bottomSheet.test.tsx";
const AUDIT_UNIT = "tests/components/crew/transitionAudit.test.tsx";
const DAY_ROW_UNIT = "tests/components/crew/dayRow.test.tsx";
const QUICK_FACTS_UNIT = "tests/components/crew/crewQuickFacts.test.tsx";
const REPORT_UNIT = "tests/components/report/ReportModal.test.tsx";

/** No client motion library: a surface that is instant by construction. */
function expectNoFramer(rel: string): void {
  const src = read(rel);
  expect(src, `${rel} imports no motion library`).not.toMatch(/framer-motion|motion\/react/);
  expect(src, `${rel} has no AnimatePresence`).not.toMatch(/AnimatePresence/);
  expect(src, `${rel} renders no <motion.*>`).not.toMatch(/<motion\./);
}

type Case = readonly [file: string, title: string];
type Row = {
  /** The row's first cell, as the spec writes it. */
  cell: string;
  e2e?: readonly Case[];
  unit?: readonly Case[];
  /** What the cases cannot reach: the token a duration comes from, and the reduced-motion branch. */
  source?: () => void;
};

const ROWS: Record<number, Row> = {
  348: {
    cell: "Sheet closed → open",
    e2e: [
      [
        COMPACT_E2E,
        "sheet: opening a row from home pushes one entry and opens the sheet with zero network",
      ],
    ],
    unit: [
      [
        AUDIT_UNIT,
        "sheet closed↔open: one AnimatePresence initial={false}; the panel slides and the scrim fades, with an exit on both",
      ],
    ],
    source: () => {
      const s = read(SHEET);
      expect(s, "the slide is --duration-normal on --ease-out-quart").toContain(
        `SHEET_SLIDE = { duration: ${NORMAL_S}, ease: ${EASE_LITERAL} }`,
      );
      expect(s).toMatch(/initial=\{\{\s*y:\s*"100%"\s*\}\}/);
      expect(s, "the scrim fades in").toMatch(/initial=\{\{\s*opacity:\s*0\s*\}\}/);
      // Reduced motion: the same tree, a 0 duration.
      expect(s).toContain("SHEET_INSTANT = { duration: 0 }");
      expect(s).toContain("reduced ? SHEET_INSTANT : SHEET_SLIDE");
    },
  },
  349: {
    cell: "Sheet open → closed (close button, scrim tap, Esc, swipe down, browser Back)",
    e2e: [
      [COMPACT_E2E, "sheet: browser Back from an open sheet closes it"],
      [
        COMPACT_E2E,
        "sheet: closing with the marker goes back to home, and Forward reopens the section",
      ],
    ],
    unit: [
      [SHEET_UNIT, "sheet: the close button, the scrim and Esc each request one close"],
      // The row's 2026-10-30 compound amendment: another open during this exit.
      [
        SHEET_UNIT,
        "sheet: opening B during A's exit shows B's title over B's body, with A's frame gone",
      ],
    ],
    source: () => {
      const s = read(SHEET);
      // One presence, one exit, whichever path closed it.
      expect(s.match(/<AnimatePresence\b/g) ?? []).toHaveLength(1);
      // The compound amendment: each open from closed is a new presence, so the
      // presence that held a departing frame unmounts with it.
      expect(s).toContain("if (section !== null) setOpens((n) => n + 1);");
      expect(s).toContain("<AnimatePresence key={`${presence}:${opens}`} initial={opens !== 0}>");
      expect(s).toMatch(/exit=\{\{\s*y:\s*"100%"\s*\}\}/);
      expect(s).toMatch(/exit=\{\{\s*opacity:\s*0\s*\}\}/);
      expect(s, "reduced motion: the exit takes the instant transition too").toContain(
        "transition={transition}",
      );
    },
  },
  350: {
    cell: "Sheet open, dragging → released past the close threshold",
    unit: [
      [
        SHEET_UNIT,
        "sheet: a drag released past the threshold requests close; a shorter drag does not",
      ],
    ],
    source: () => {
      // Past the threshold the drag hands over to the ordinary close, so the
      // exit continues from the dragged offset (instant under reduced motion).
      expect(read(SHEET)).toMatch(
        /if \(dy > DRAG_DISMISS_THRESHOLD_PX\) \{[\s\S]{0,120}onRequestClose\(\);/,
      );
    },
  },
  351: {
    cell: "Sheet open, dragging → released before the threshold",
    e2e: [[COMPACT_E2E, "sheet: a drag released before the threshold springs back to open"]],
    unit: [
      [
        AUDIT_UNIT,
        "sheet: --duration-normal on --ease-out-quart, instant under reduced motion; the spring-back reads --duration-fast",
      ],
    ],
    source: () => {
      const s = read(SHEET);
      expect(s).toContain('"transform var(--duration-fast) var(--ease-out-quart)"');
      // Reduced motion: no transition runs, so the panel settles at once.
      expect(s).toMatch(/\.every\(\(d\) => parseFloat\(d\) === 0\)/);
      expectReducedTokens();
    },
  },
  352: {
    cell: "Sheet open on section A → section B (an in-sheet link to another section)",
    unit: [
      [
        CONTROLLER_UNIT,
        "sheet: an in-sheet link replaces history, swaps the body and resets its scroll; the next close lands on home",
      ],
      [AUDIT_UNIT, "renders the keyed wrapper + children and swaps to the new section body"],
    ],
    source: () => {
      const t = read(TRANSITION);
      expect(t).toMatch(/<AnimatePresence mode="wait" initial=\{false\}>/);
      expect(t, "reduced motion: a 0 duration").toContain(`prefersReducedMotion ? 0 : ${NORMAL_S}`);
      expect(t).toContain(`ease: ${EASE_LITERAL}`);
      expect(read(SECTIONS), "the body scroller starts at the top").toContain(
        "sheetBodyRef.current.scrollTop = 0",
      );
    },
  },
  353: {
    cell: "Day A selected → day B",
    e2e: [
      [
        PAGE_E2E,
        "pass: a day switch is a crossfade: mid-transition both bodies are mounted at opacity strictly between 0 and 1, and the run card crossfades its rows with it",
      ],
      [
        PAGE_E2E,
        "pass: the height never drops below the minimum-height token across a day crossfade and a live-state swap",
      ],
      [
        PAGE_E2E,
        "pass: under reduced motion a day switch is instant: every sampled frame finds one body",
      ],
    ],
    source: () => {
      for (const rel of [PASS, RUN_CARD]) {
        const s = read(rel);
        expect(s, rel).toContain(`const CROSSFADE_SECONDS = ${NORMAL_S};`);
        expect(s, rel).toContain(`= ${EASE_LITERAL};`);
        // Not mode="wait": both bodies overlap in one grid cell.
        expect(s, rel).toMatch(/<AnimatePresence initial=\{false\} custom=\{swapFades\}>/);
        expect(s, rel).toContain("col-start-1 row-start-1");
        // Reduced motion: no swap fades, and the presence key holds still.
        expect(s, rel).toContain("reduced ? false : fade");
      }
      expect(read(PASS), "the pass never drops below its floor").toContain("min-h-right-now-min-h");
    },
  },
  354: {
    cell: "Pass, today: live state X → live state Y",
    unit: [
      [
        "tests/time/rightNowTransitions.test.ts",
        "matrix has exactly 66 entries (C(12,2) = 12*11/2)",
      ],
    ],
    source: () => {
      const s = read(PASS);
      expect(s).toContain("transitionTreatment(");
      expect(s, "a live-state swap fades only when the table says so").toContain(
        'liveSwap ? treatment === "crossfade-body" : true',
      );
    },
  },
  355: {
    cell: "Pass, today (live) → another day (static), and back",
    e2e: [
      [
        PAGE_E2E,
        "pass: tapping a day in the day row shows its day(iso) body, and today returns to live",
      ],
    ],
    source: () => {
      // A live ↔ day swap is never a live-state swap, so it always crossfades.
      expect(read(PASS)).toContain(
        'const liveSwap = arrival.key.startsWith("live:") && bodyKey.startsWith("live:");',
      );
    },
  },
  356: {
    cell: 'Day button (or "Now") unselected ↔ selected',
    unit: [
      [
        DAY_ROW_UNIT,
        "day row: the pressed state changes background and text colour over --duration-fast, instant under reduced motion",
      ],
    ],
    source: () => {
      expect(read(DAY_ROW)).toContain("transition-colors duration-fast");
      expectReducedTokens();
    },
  },
  357: {
    cell: '"Now" button present ↔ absent (today enters or leaves the day set at midnight)',
    unit: [
      [
        DAY_ROW_UNIT,
        "day row: a Now button renders exactly when today is not in the set, first and pressed in live",
      ],
      [
        DAY_ROW_UNIT,
        "day row: past midnight in the show timezone the pressed Today button moves without a remount",
      ],
    ],
    source: () => expectNoFramer(DAY_ROW),
  },
  358: {
    cell: "Wide nav item inactive ↔ active",
    e2e: [
      [
        WIDE_E2E,
        "wide nav: the accent indicator is one element that moves to the active item at --duration-fast",
      ],
    ],
    unit: [
      [
        AUDIT_UNIT,
        "wide nav: the accent bar turns its transition on after its first measure, even when effects run twice",
      ],
      [
        AUDIT_UNIT,
        "wide nav: moving to a taller item changes the bar's scale, never its layout height (critique F15)",
      ],
    ],
    source: () => {
      expect(read(WIDE_NAV)).toContain(
        "transition-transform duration-fast ease-out-quart motion-reduce:transition-none",
      );
      expectNoFramer(WIDE_NAV);
    },
  },
  359: {
    cell: "Copy toast hidden → shown → hidden",
    e2e: [
      [PAGE_E2E, "home: the copy toast fades and rises in, holds 2 seconds and fades out"],
      [PAGE_E2E, "home: under reduced motion the copy toast shows and hides at once"],
    ],
    unit: [
      [
        QUICK_FACTS_UNIT,
        "quick facts: the toast enters with the fade-and-rise keyframe and leaves with the fade, both motion-safe",
      ],
      [
        QUICK_FACTS_UNIT,
        "quick facts: under reduced motion the toast hides at once when the hold ends",
      ],
    ],
    source: () => {
      const s = read(QUICK_FACTS);
      expect(s).toContain(
        "motion-safe:animate-[crew-toast-in_var(--duration-fast)_var(--ease-out-quart)]",
      );
      expect(s).toContain(
        "motion-safe:animate-[crew-toast-out_var(--duration-fast)_var(--ease-out-quart)_forwards]",
      );
      expect(CSS, "the rise is 4px").toMatch(
        /@keyframes crew-toast-in \{\s*from \{\s*opacity: 0;\s*transform: translateY\(4px\);/,
      );
      expect(read("lib/ui/copyFeedback.ts"), "the hold is 2s").toContain(
        "export const COPY_FEEDBACK_RESET_MS = 2_000;",
      );
    },
  },
  360: {
    cell: "Light ↔ dark theme",
    e2e: [
      [PAGE_E2E, "pass: the surface is dark in both themes, and a theme swap leaves it unchanged"],
    ],
    source: () => expect(read(PASS)).toContain('data-theme="dark"'),
  },
  361: {
    cell: "Quick fact, section card, run-of-show row present ↔ omitted",
    // Server-driven presence: no motion where these render. The conditional
    // renders themselves are registered below, each with this row.
    source: () => {
      for (const rel of [HOME, ALL_SECTIONS, QUICK_FACTS]) expectNoFramer(rel);
    },
  },
  367: {
    cell: "Sheet open",
    e2e: [
      [
        COMPACT_E2E,
        "compound: a realtime refresh with the sheet open keeps it open on the same section and updates its body in place",
      ],
    ],
    unit: [
      [
        AUDIT_UNIT,
        "compound: a freshness re-render (same open section, new sectionNodes) does NOT re-key (no spurious crossfade)",
      ],
      [
        CONTROLLER_UNIT,
        "compound: a refresh that replaced the pushed entry's state with Next's alone gets the marker back",
      ],
    ],
  },
  368: {
    cell: "Sheet open",
    e2e: [
      [
        WIDE_E2E,
        "compound: crossing into wide with the sheet open dismisses it without animation and shows that section, keeping s and the marker",
      ],
      [
        WIDE_E2E,
        "compound: crossing into wide with a nested dialog open unmounts the dialog with the sheet and leaves the page scrollable",
      ],
    ],
    // Instant under either motion setting: the sheet unmounts with the compact layout.
    source: () => expect(read(SECTIONS)).toMatch(/\{showCompact \? \(\s*<CrewSectionSheet/),
  },
  369: {
    cell: "Sheet mid-drag",
    e2e: [
      [
        WIDE_E2E,
        "compound: crossing into wide mid-drag cancels the drag, then dismisses the sheet as above",
      ],
    ],
  },
  370: {
    cell: "Wide, scrolled to section A",
    e2e: [
      [
        WIDE_E2E,
        "compound: crossing back into compact from a scrolled wide page shows the home at the top with no sheet, replacing s and the marker away",
      ],
    ],
    unit: [
      [
        CONTROLLER_UNIT,
        "compound: crossing from wide into compact opens no sheet and replaces s and the marker away",
      ],
    ],
  },
  371: {
    cell: "Day `day(iso)` selected",
    e2e: [
      [
        COMPACT_E2E,
        "compound: a refresh that removes the selected day from the day set returns the selection to live",
      ],
    ],
    unit: [
      [
        DAY_ROW_UNIT,
        "day row: a refresh that removes the selected day returns the selection to live, for good",
      ],
    ],
  },
  372: {
    cell: "Sheet open",
    e2e: [
      [
        COMPACT_E2E,
        "compound: a refresh that takes Budget from a previewed lead closes the Budget sheet to home without animation and leaves no Budget value on the page",
      ],
    ],
    unit: [
      [
        CONTROLLER_UNIT,
        "compound: a refresh that takes the open section's body away closes the sheet in that commit, with no exit slide, and goes back over the marker",
      ],
      [
        CONTROLLER_UNIT,
        "compound: a lost entitlement on a deep-linked sheet replaces s away instead",
      ],
      [
        CONTROLLER_UNIT,
        "compound: a section that leaves the list while its body stays keeps the sheet open on its fresh body",
      ],
    ],
    // Instant under either motion setting: a new presence key drops the departing frame.
    source: () => expect(read(SHEET)).toContain("<AnimatePresence key={`${presence}:${opens}`}"),
  },
  373: {
    cell: "Nested dialog open inside the sheet",
    e2e: [
      [
        COMPACT_E2E,
        "compound: a refresh that removes a nested dialog's owner unmounts the dialog alone, and the sheet keeps the page locked",
      ],
    ],
  },
  374: {
    cell: "Nested dialog open inside the sheet",
    e2e: [
      [
        COMPACT_E2E,
        "compound: Esc with the agenda viewer open closes only the viewer, and focus returns inside the sheet",
      ],
      [
        COMPACT_E2E,
        "compound: Esc with the diagram lightbox open closes only the lightbox, and focus returns inside the sheet",
      ],
      [
        COMPACT_E2E,
        "compound: Esc with the report modal open closes only the report modal, and focus returns inside the sheet",
      ],
    ],
    unit: [
      [SHEET_UNIT, "sheet: Esc and the scrim are ignored while another aria-modal dialog is open"],
      [
        REPORT_UNIT,
        "Escape closes the modal through the close path and keeps the draft (crew page redesign spec §5.2)",
      ],
    ],
  },
  375: {
    cell: "Day crossfade running",
    e2e: [
      [
        COMPACT_E2E,
        "compound: a second day tap mid-crossfade wins: the running fade is replaced at once, never queued",
      ],
    ],
  },
  376: {
    cell: "Sheet open",
    e2e: [
      [
        COMPACT_E2E,
        "compound: the theme switch is unreachable while the sheet is open: the header is inert behind the scrim",
      ],
    ],
  },
};

/** The §7 table rows, re-derived from the spec: line number and first cell. */
function specRows(): Array<{ line: number; cell: string }> {
  const lines = read("docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md").split("\n");
  const start = lines.findIndex((l) => l.startsWith("## 7. Transition inventory"));
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## 8."));
  expect(start, "PREMISE: the spec has a §7").toBeGreaterThan(-1);
  const rows: Array<{ line: number; cell: string }> = [];
  for (let i = start; i < end; i++) {
    const l = lines[i]!;
    if (!l.startsWith("| ") || l.startsWith("|---")) continue;
    const cell = l.split("|")[1]!.trim();
    if (cell === "From → To" || cell === "While") continue; // header rows
    rows.push({ line: i + 1, cell });
  }
  return rows;
}

describe("§7 transition inventory: every row of the spec's tables is pinned", () => {
  test("the audit's rows are exactly the spec's table rows, at their spec lines", () => {
    const rows = specRows();
    expect(rows.length, "PREMISE: both tables parsed (14 rows, then 10)").toBe(24);
    expect(
      rows.map((r) => r.line),
      "a row added to or moved in spec §7 needs its entry here",
    ).toEqual(
      Object.keys(ROWS)
        .map(Number)
        .sort((a, b) => a - b),
    );
    for (const r of rows) expect(ROWS[r.line]!.cell, `spec line ${r.line}`).toBe(r.cell);
  });

  for (const [line, row] of Object.entries(ROWS)) {
    test(`L${line} ${row.cell}: its cases exist, verbatim, and its source pins hold`, () => {
      const cases = [...(row.e2e ?? []), ...(row.unit ?? [])];
      expect(cases.length + (row.source ? 1 : 0), "every row has a pin").toBeGreaterThan(0);
      for (const [file, title] of cases) {
        expect(read(file), `${file} defines "${title}"`).toContain(JSON.stringify(title));
      }
      row.source?.();
    });
  }
});

// ── Conditional renders in the redesign's crew components ─────────────────────

/** The treatments a conditional render can carry, each tied to its §7 row. */
const T = {
  serverPresence: "L361 instant: only a server render changes it",
  modeLayout: "L368/L370 instant: the layout mounts or unmounts with the mode",
  sheetHost: "L368 instant: the sheet unmounts with the compact layout, no exit slide",
  sheetPresence:
    "L348/L349 slide and fade at --duration-normal, reduced motion instant; L372 instant (presence key)",
  sheetEffects: "instant: renders nothing, holds the open sheet's side effects",
  indicator: "L358 placed without a slide, then moves at --duration-fast; reduced motion instant",
  now: "L357 instant",
  inBody:
    "L353/L355 instant inside one body; the body crossfades as a whole (reduced motion: one commit)",
  toast: "L359 inside the toast, which fades and rises; reduced motion instant",
  search: "instant: search results replace the page (crew show search spec §6.2), outside §7",
  hydration: "instant: the server render leaves the open body to the sheet; filled after hydration",
} as const;

type Conditional = {
  /** A fragment of the scanned render (its line, then the next line, each trimmed). */
  match: string;
  /** How many renders the fragment matches; two renders can be identical. */
  count?: number;
  treatment: (typeof T)[keyof typeof T];
};

/**
 * Every conditional render in the crew components PR A added, by file, and the
 * file's `AnimatePresence` count.
 */
const CONDITIONAL_RENDERS: Record<string, { presences: number; renders: Conditional[] }> = {
  [SECTIONS]: {
    presences: 0,
    renders: [
      { match: "{showWide && hasSections ? (\n<CrewWideNav", treatment: T.modeLayout },
      { match: "{dayRow ? (", treatment: T.serverPresence },
      { match: "{pass ? (", treatment: T.serverPresence },
      { match: "{runCard ? <CrewRunOfShowCard", treatment: T.serverPresence },
      { match: "{showCompact && hasSections ? (", treatment: T.modeLayout },
      { match: "{showWide && hasSections ? (\n<div", treatment: T.modeLayout },
      { match: '{mode === "ssr" && s.id === open ? null', treatment: T.hydration },
      { match: "{searchActive ? (", treatment: T.search },
      { match: "{showCompact ? (\n<CrewSectionSheet", treatment: T.sheetHost },
    ],
  },
  [SHEET]: {
    presences: 1,
    renders: [
      { match: "{section !== null && modal ? (", treatment: T.sheetEffects },
      { match: "{section !== null ? (", treatment: T.sheetPresence },
    ],
  },
  [TRANSITION]: { presences: 1, renders: [] },
  [WIDE_NAV]: {
    presences: 0,
    renders: [{ match: "{indicator !== null ? (", treatment: T.indicator }],
  },
  [ALL_SECTIONS]: {
    presences: 0,
    renders: [{ match: "{section.peek !== null ? (", treatment: T.serverPresence }],
  },
  [DAY_ROW]: { presences: 0, renders: [{ match: "{todayInSet ? null : (", treatment: T.now }] },
  [PASS]: {
    presences: 1,
    renders: [
      { match: "{body.live ? (", treatment: T.inBody },
      { match: "{eyebrowRight ? (", treatment: T.inBody },
      { match: "{body.status ? (", treatment: T.inBody },
      { match: "{body.lead ? (", treatment: T.inBody },
      { match: "{body.detail ? (", treatment: T.inBody },
      { match: "{hasTimes ? (", treatment: T.inBody },
      { match: "{body.bigTime ? (", treatment: T.inBody },
      { match: "{body.strike ? (", treatment: T.inBody },
      { match: "{body.progress ? (", treatment: T.inBody },
      { match: "{body.facts.length > 0 ? (", treatment: T.inBody },
    ],
  },
  [RUN_CARD]: {
    presences: 1,
    renders: [
      { match: 'return day.rows.kind === "timeline" ? (', treatment: T.inBody },
      { match: "{day.more ? (", treatment: T.inBody },
    ],
  },
  [QUICK_FACTS]: {
    presences: 0,
    renders: [
      { match: '{toast.copied && toast.phase !== "idle" ? (', treatment: T.toast },
      { match: "i === copyLine && copyAction ? (", treatment: T.serverPresence },
      { match: "{copyAction && copyLine < 0 ? (", treatment: T.serverPresence },
      { match: "{links.length > 0 ? (", treatment: T.serverPresence },
      { match: '{a.kind === "call" ? (', treatment: T.serverPresence },
      { match: ') : a.kind === "text" ? (', treatment: T.serverPresence },
      { match: "{directions ? (", treatment: T.serverPresence },
      // The copy row's label and the plain line's label: the same render twice.
      { match: "{line.label !== undefined ? (", count: 2, treatment: T.serverPresence },
    ],
  },
  [HOME]: {
    presences: 0,
    renders: [
      { match: "model.noteRows.length > 0 ? (", treatment: T.serverPresence },
      { match: "{truncated ? (", treatment: T.serverPresence },
      { match: "{model.notesOverflow > 0 ? (", treatment: T.serverPresence },
      { match: "const dressCard = model.dress ? (", treatment: T.serverPresence },
      {
        match: '{roomsFetchFailed ? <SectionTileError domain="rooms" />',
        treatment: T.serverPresence,
      },
      {
        match: '{hotelFetchFailed ? <SectionTileError domain="hotel" />',
        treatment: T.serverPresence,
      },
      {
        match: '{contactsFetchFailed ? <SectionTileError domain="contacts" />',
        treatment: T.serverPresence,
      },
      { match: "{facts.length > 0 ? <CrewQuickFacts", treatment: T.serverPresence },
    ],
  },
};

/**
 * Conditional renders, by shape: a line that ends in `? (` (a multi-line arm),
 * an inline `{cond ? <X`, a `{cond && (` or `{cond && <X`, or `{cond ? null :`.
 * Comments are blanked first (the shared stripper keeps line numbers). Each hit
 * is its trimmed line and the next one, so two renders on one condition are
 * told apart by what they render.
 */
function conditionalRenders(src: string, file: string): string[] {
  const shapes = [
    /\?\s*\($/,
    /\{[^{}]*\s\?\s*</,
    /\{[^{}]*&&\s*(?:\($|<)/,
    /\{[^{}]*\s\?\s*null\s*:/,
  ];
  const lines = stripCommentsForFile(src, file).split("\n");
  const hits: string[] = [];
  lines.forEach((line, i) => {
    if (shapes.some((re) => re.test(line.trimEnd()))) {
      hits.push(`${line.trim()}\n${(lines[i + 1] ?? "").trim()}`);
    }
  });
  return hits;
}

/** A one-line fragment claims a render by its own line; a two-line one by the line after too. */
function claims(hit: string, match: string): boolean {
  return match.includes("\n") ? hit.includes(match) : hit.split("\n")[0]!.includes(match);
}

describe("§7 transition inventory: every conditional render in the redesign's crew components has its row", () => {
  test("PREMISE: the scan finds each shape it claims, and skips comments and value ternaries", () => {
    expect(conditionalRenders("{a ? (\n<X/>", "x.tsx")).toHaveLength(1);
    expect(conditionalRenders("{a ? <X/> : null}", "x.tsx")).toHaveLength(1);
    expect(conditionalRenders("{a && (\n<X/>", "x.tsx")).toHaveLength(1);
    expect(conditionalRenders("{a && <X/>}", "x.tsx")).toHaveLength(1);
    expect(conditionalRenders("{a ? null : (\n<X/>", "x.tsx")).toHaveLength(1);
    expect(conditionalRenders("// {a ? <X/> : null}", "x.tsx")).toHaveLength(0);
    expect(conditionalRenders("const x = a ? (b ?? c) : null;", "x.tsx")).toHaveLength(0);
  });

  for (const [rel, entry] of Object.entries(CONDITIONAL_RENDERS)) {
    test(`${rel}: every conditional render and AnimatePresence is registered with its treatment`, () => {
      const src = read(rel);
      expect(src.match(/<AnimatePresence\b/g) ?? [], "AnimatePresence count").toHaveLength(
        entry.presences,
      );
      const hits = conditionalRenders(src, rel);
      expect(
        hits.filter((h) => entry.renders.filter((r) => claims(h, r.match)).length !== 1),
        "a render no registry row claims, or more than one does",
      ).toEqual([]);
      for (const r of entry.renders) {
        expect(
          hits.filter((h) => claims(h, r.match)),
          `registry row "${r.match}"`,
        ).toHaveLength(r.count ?? 1);
      }
    });
  }

  test("every registered file without a presence is instant by construction", () => {
    for (const [rel, entry] of Object.entries(CONDITIONAL_RENDERS)) {
      if (entry.presences === 0) expectNoFramer(rel);
    }
    expectReducedTokens();
  });
});
