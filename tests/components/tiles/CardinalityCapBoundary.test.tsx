// @vitest-environment jsdom
/**
 * tests/components/tiles/CardinalityCapBoundary.test.tsx
 *
 * Crew-redesign retarget (wp-20 step b, test 27): the §8.4 / AC-4.4
 * cardinality-cap boundary, ported off the deleted CrewTile / PackListTile
 * onto the curated section surfaces that now own each cap:
 *
 *   - Crew roster      — CREW_INLINE_CAP = 8  (CrewSection, exported)
 *                        rows: [data-testid="crew-person-row"]
 *                        overflow stub: [data-testid="crew-overflow-stub"]
 *   - Key contacts     — CONTACTS_INLINE_CAP = 6 (CrewSection, exported)
 *                        rows: [data-testid="contact-person-row"]
 *                        overflow stub: [data-testid="contacts-overflow-stub"]
 *   - Show notes       — SOURCE_CAP = 8 / TRUNCATE_AT = 280 (TodaySection,
 *                        unexported → source-scan sync guard + behavioral)
 *                        rows: li[data-source]
 *                        overflow: [data-testid="today-notes-overflow"]
 *   - Pack list        — CASE_CAP = 12 (GearSection, unexported → sync guard)
 *                        rows: [data-testid="gear-pack-list-case"]
 *                        overflow stub: [data-testid="gear-pack-list-overflow-stub"]
 *
 * Coverage split (anti-duplication per task brief):
 *   - The Crew roster cap-1/cap/cap+1 matrix is ALREADY pinned by
 *     tests/components/crew/sections/CrewSection.test.tsx ("roster cap
 *     boundary at %i"). To avoid an identical duplicate, this file pins the
 *     Crew roster overflow-COUNT formula + tail-trim direction (the parts the
 *     section test asserts only loosely via `String(n - CAP)`), the Key
 *     contacts cap (not covered elsewhere), the Notes SOURCE_CAP + TRUNCATE_AT
 *     (not covered elsewhere), and the Pack-list cap (GearSection.test.tsx
 *     pins gate-false omission, NOT the >12 overflow boundary).
 *
 * Boundary contract per cap (cap-1 / cap / cap+1):
 *   - cap-1 → all rows inline, NO overflow affordance.
 *   - cap   → all rows inline, NO overflow affordance. [affordance at `> cap`,
 *             never `>= cap` — no "+0" stub at exactly-cap.]
 *   - cap+1 → exactly `cap` rows inline + stub with count = length − cap,
 *             DERIVED from fixture length (never hardcoded). The first
 *             overflowed entry is asserted ABSENT to prove the slice trims the
 *             tail, not the head.
 *
 * Anti-tautology: expected overflow counts derive from fixture dimensions;
 * row counts are DOM-node counts (not name-substring presence); the rendered
 * tree is only the section under test, so substring assertions are scoped.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import {
  CrewSection,
  CREW_INLINE_CAP,
  CONTACTS_INLINE_CAP,
} from "@/components/crew/sections/CrewSection";
import { GearSection } from "@/components/crew/sections/GearSection";
import { TodaySection } from "@/components/crew/sections/TodaySection";
import {
  ScheduleSection,
  RUN_OF_SHOW_DISPLAY_CAP,
} from "@/components/crew/sections/ScheduleSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { AgendaEntry, ContactRow } from "@/lib/parser/types";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
const VIEWER = { kind: "admin" } as const;

// The Notes block renders TodaySection, which mounts the RightNowHero client
// island; the hero's usePrefersReducedMotion hook calls window.matchMedia in a
// mount effect that jsdom lacks. Stub it (matches:false = no reduced-motion)
// so the hero's REAL wiring runs — mirrors TodaySection.test.tsx.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Read a crew section/primitive source file for the cap sync guards. */
function readSource(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

// ─────────────────────────────────────────────────────────────────────
// Crew roster — CREW_INLINE_CAP = 8 (overflow formula + tail-trim)
//
// The cap-1/cap/cap+1 ROW-COUNT matrix is pinned in CrewSection.test.tsx;
// this block pins the overflow-count formula (length − cap, derived) and
// that the slice trims the TAIL (first overflowed member absent inline) —
// the precise off-by-one guards that the section test only checks loosely.
// ─────────────────────────────────────────────────────────────────────

describe("§8.4 cardinality-cap — Crew roster (CREW_INLINE_CAP, CrewSection)", () => {
  function makeCrew(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `crew-${i}`,
      // Zero-padded so "Crew Member 01" is never a substring of "Crew Member 10".
      name: `Crew Member ${String(i + 1).padStart(2, "0")}`,
      email: null,
      phone: null,
      role: "",
      roleFlags: [] as never[],
      dateRestriction: { kind: "none" as const },
      stageRestriction: { kind: "none" as const },
    }));
  }

  function renderCrew(count: number) {
    return render(
      <CrewSection
        data={makeShowForViewer({ crewMembers: makeCrew(count) })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  test(`cap+1 (${CREW_INLINE_CAP + 1}) — exactly cap rows + stub count = length − cap (derived, tail-trim)`, () => {
    const n = CREW_INLINE_CAP + 1;
    const expectedOverflow = n - CREW_INLINE_CAP; // derived
    const c = renderCrew(n);
    expect(c.querySelectorAll('[data-testid="crew-person-row"]').length).toBe(CREW_INLINE_CAP);
    const stub = c.querySelector('[data-testid="crew-overflow-stub"]');
    expect(stub).not.toBeNull();
    expect(stub!.getAttribute("data-tile-show-more")).toBe("true");
    expect(stub!.textContent).toContain(`+${expectedOverflow}`);
    // Singular copy at overflow=1.
    expect(stub!.textContent).toContain(
      expectedOverflow === 1 ? "more crew member" : "more crew members",
    );
    // The last inline member renders; the first OVERFLOWED member does NOT
    // (proves the slice trims the tail, not the head).
    const text = c.textContent ?? "";
    expect(text).toContain(`Crew Member ${String(CREW_INLINE_CAP).padStart(2, "0")}`);
    expect(text).not.toContain(`Crew Member ${String(CREW_INLINE_CAP + 1).padStart(2, "0")}`);
  });

  test(`larger overflow (${CREW_INLINE_CAP + 5}) — stub count tracks length − cap`, () => {
    const n = CREW_INLINE_CAP + 5;
    const c = renderCrew(n);
    expect(c.querySelectorAll('[data-testid="crew-person-row"]').length).toBe(CREW_INLINE_CAP);
    expect(c.querySelector('[data-testid="crew-overflow-stub"]')!.textContent).toContain(
      `+${n - CREW_INLINE_CAP}`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Key contacts — CONTACTS_INLINE_CAP = 6 (full cap-1 / cap / cap+1 matrix)
// Not covered by any Phase-3 section test — fully owned here.
// ─────────────────────────────────────────────────────────────────────

describe("§8.4 cardinality-cap — Key contacts (CONTACTS_INLINE_CAP, CrewSection)", () => {
  function makeContacts(count: number): ContactRow[] {
    return Array.from({ length: count }, (_, i) => ({
      kind: "venue" as const,
      name: `Venue Contact ${String(i + 1).padStart(2, "0")}`,
      email: null,
      phone: "555-0100",
      notes: null,
    }));
  }

  function renderContacts(count: number) {
    return render(
      <CrewSection
        data={makeShowForViewer({ contacts: makeContacts(count) })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  test.each([CONTACTS_INLINE_CAP - 1, CONTACTS_INLINE_CAP, CONTACTS_INLINE_CAP + 1])(
    "contacts cap boundary at %i",
    (n) => {
      const c = renderContacts(n);
      const rows = c.querySelectorAll('[data-testid="contact-person-row"]').length;
      const stub = c.querySelector('[data-testid="contacts-overflow-stub"]');
      if (n <= CONTACTS_INLINE_CAP) {
        expect(rows).toBe(n);
        expect(stub).toBeNull();
        expect(c.textContent ?? "").not.toContain("+0");
      } else {
        const expectedOverflow = n - CONTACTS_INLINE_CAP; // derived
        expect(rows).toBe(CONTACTS_INLINE_CAP);
        expect(stub).not.toBeNull();
        expect(stub!.getAttribute("data-tile-show-more")).toBe("true");
        expect(stub!.textContent).toContain(`+${expectedOverflow}`);
        expect(stub!.textContent).toContain(
          expectedOverflow === 1 ? "more contact" : "more contacts",
        );
        // Tail-trim: last inline contact present, first overflowed absent.
        const text = c.textContent ?? "";
        expect(text).toContain(`Venue Contact ${String(CONTACTS_INLINE_CAP).padStart(2, "0")}`);
        expect(text).not.toContain(
          `Venue Contact ${String(CONTACTS_INLINE_CAP + 1).padStart(2, "0")}`,
        );
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────
// Show notes — SOURCE_CAP = 8 + TRUNCATE_AT = 280 (TodaySection)
// Not covered by any Phase-3 section test — fully owned here.
// The caps are unexported, so a source-scan sync guard pins the mirror.
// ─────────────────────────────────────────────────────────────────────

describe("§8.4 cardinality-cap — Show notes (SOURCE_CAP / TRUNCATE_AT, TodaySection)", () => {
  const SOURCE_CAP = 8;
  const TRUNCATE_AT = 280;

  test("sync guard — TodaySection still declares SOURCE_CAP + TRUNCATE_AT = mirrored values", () => {
    const source = readSource("components", "crew", "sections", "TodaySection.tsx");
    const capMatch = source.match(/const SOURCE_CAP\s*=\s*(\d+)\s*;/);
    const truncMatch = source.match(/const TRUNCATE_AT\s*=\s*(\d+)\s*;/);
    expect(capMatch, "SOURCE_CAP declaration not found in TodaySection.tsx").not.toBeNull();
    expect(truncMatch, "TRUNCATE_AT declaration not found in TodaySection.tsx").not.toBeNull();
    expect(Number(capMatch![1])).toBe(SOURCE_CAP);
    expect(Number(truncMatch![1])).toBe(TRUNCATE_AT);
  });

  // Notes aggregate across venue → hotel → room → transport → contact in that
  // order. Build N distinct contact notes (one source family, zero-padded) so
  // the count is deterministic and each note label is unique.
  function makeContactsWithNotes(count: number): ContactRow[] {
    return Array.from({ length: count }, (_, i) => ({
      kind: "venue" as const,
      name: `Note Contact ${String(i + 1).padStart(2, "0")}`,
      email: null,
      phone: null,
      notes: `Note body ${String(i + 1).padStart(2, "0")}`,
    }));
  }

  function renderNotes(count: number) {
    return render(
      <TodaySection
        data={makeShowForViewer({ contacts: makeContactsWithNotes(count) })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  test(`cap-1 (${SOURCE_CAP - 1} notes) — all notes inline, NO overflow`, () => {
    const c = renderNotes(SOURCE_CAP - 1);
    expect(c.querySelectorAll("li[data-source]").length).toBe(SOURCE_CAP - 1);
    expect(c.querySelector('[data-testid="today-notes-overflow"]')).toBeNull();
  });

  test(`exactly cap (${SOURCE_CAP} notes) — all notes inline, NO overflow (no +0)`, () => {
    const c = renderNotes(SOURCE_CAP);
    expect(c.querySelectorAll("li[data-source]").length).toBe(SOURCE_CAP);
    expect(c.querySelector('[data-testid="today-notes-overflow"]')).toBeNull();
    expect(c.textContent ?? "").not.toContain("+0");
  });

  test(`cap+1 (${SOURCE_CAP + 1} notes) — exactly cap inline + overflow count = length − cap`, () => {
    const n = SOURCE_CAP + 1;
    const expectedOverflow = n - SOURCE_CAP; // derived
    const c = renderNotes(n);
    expect(c.querySelectorAll("li[data-source]").length).toBe(SOURCE_CAP);
    const overflow = c.querySelector('[data-testid="today-notes-overflow"]');
    expect(overflow).not.toBeNull();
    expect(overflow!.textContent).toContain(`+${expectedOverflow}`);
    expect(overflow!.textContent).toContain(expectedOverflow === 1 ? "more note" : "more notes");
  });

  test("TRUNCATE_AT — a note longer than TRUNCATE_AT is truncated with an ellipsis + data-truncated", () => {
    // Derive the long body from TRUNCATE_AT so the test tracks the constant.
    const longBody = "X".repeat(TRUNCATE_AT + 50);
    const shortBody = "Y".repeat(10);
    const c = render(
      <TodaySection
        data={makeShowForViewer({
          contacts: [
            { kind: "venue", name: "Long Note", email: null, phone: null, notes: longBody },
            { kind: "venue", name: "Short Note", email: null, phone: null, notes: shortBody },
          ],
        })}
        viewer={VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container;
    const rows = [...c.querySelectorAll("li[data-source]")];
    expect(rows.length).toBe(2);
    const truncatedRow = rows.find((r) => r.getAttribute("data-truncated") === "true");
    const plainRow = rows.find((r) => r.getAttribute("data-truncated") !== "true");
    // The long note is flagged truncated; the short note is not.
    expect(truncatedRow, "long note should be flagged data-truncated").toBeTruthy();
    expect(plainRow, "short note should NOT be flagged data-truncated").toBeTruthy();
    // The truncated summary contains the ellipsis; the full body still lives
    // in the expandable <details> region (so nothing is lost), but the visible
    // summary line is capped at TRUNCATE_AT codepoints (ellipsis replaces 1).
    const summary = truncatedRow!.querySelector("summary");
    expect(summary, "truncated row renders a <summary>").toBeTruthy();
    expect(summary!.textContent ?? "").toContain("…");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pack list — CASE_CAP = 12 (GearSection)
// GearSection.test.tsx pins gate-false omission only — the >12 overflow
// boundary is owned here. The cap is unexported → source-scan sync guard.
// ─────────────────────────────────────────────────────────────────────

describe("§8.4 cardinality-cap — Pack list (CASE_CAP, GearSection)", () => {
  const CASE_CAP = 12;

  // GearSection gates the pack list behind isPackListVisibleToday — the
  // default fixture's empty schedule_phases makes that false. Provide a
  // schedule_phase whose "today" lands on a Set phase so the list renders
  // without time mocking (mirrors the deleted PackListTile fixture idiom).
  const TODAY_ISO = "2026-04-21";
  const PACK_TODAY = new Date("2026-04-21T16:00:00Z");

  function makeCases(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      // Zero-padded so "Road Case 01" is never a substring of "Road Case 10".
      caseLabel: `Road Case ${String(i + 1).padStart(2, "0")}`,
      items: [
        { qty: 1, cat: null, subCat: null, item: `Cable Loom ${String(i + 1).padStart(2, "0")}` },
      ],
    }));
  }

  function renderPack(count: number) {
    return render(
      <GearSection
        data={makeShowForViewer({
          show: { schedule_phases: { [TODAY_ISO]: ["Set"] } },
          pullSheet: makeCases(count),
        })}
        viewer={VIEWER}
        today={PACK_TODAY}
        showId={SHOW_ID}
      />,
    ).container;
  }

  test("sync guard — GearSection still declares CASE_CAP = mirrored value", () => {
    const source = readSource("components", "crew", "sections", "GearSection.tsx");
    const match = source.match(/const CASE_CAP\s*=\s*(\d+)\s*;/);
    expect(match, "CASE_CAP declaration not found in GearSection.tsx").not.toBeNull();
    expect(Number(match![1])).toBe(CASE_CAP);
  });

  test(`cap-1 (${CASE_CAP - 1} cases) — all cases inline, NO overflow`, () => {
    const c = renderPack(CASE_CAP - 1);
    expect(c.querySelectorAll('[data-testid="gear-pack-list-case"]').length).toBe(CASE_CAP - 1);
    expect(c.querySelector('[data-testid="gear-pack-list-overflow-stub"]')).toBeNull();
  });

  test(`exactly cap (${CASE_CAP} cases) — all cases inline, NO overflow (no +0)`, () => {
    const c = renderPack(CASE_CAP);
    expect(c.querySelectorAll('[data-testid="gear-pack-list-case"]').length).toBe(CASE_CAP);
    expect(c.querySelector('[data-testid="gear-pack-list-overflow-stub"]')).toBeNull();
    expect(c.textContent ?? "").not.toContain("+0");
  });

  test(`cap+1 (${CASE_CAP + 1} cases) — exactly cap inline + stub count = length − cap (tail-trim)`, () => {
    const n = CASE_CAP + 1;
    const expectedOverflow = n - CASE_CAP; // derived
    const c = renderPack(n);
    expect(c.querySelectorAll('[data-testid="gear-pack-list-case"]').length).toBe(CASE_CAP);
    const stub = c.querySelector('[data-testid="gear-pack-list-overflow-stub"]');
    expect(stub).not.toBeNull();
    expect(stub!.getAttribute("data-tile-show-more")).toBe("true");
    expect(stub!.textContent).toContain(`+${expectedOverflow}`);
    expect(stub!.textContent).toContain(expectedOverflow === 1 ? "more case" : "more cases");
    // Tail-trim: last inline case present, first overflowed case absent.
    const text = c.textContent ?? "";
    expect(text).toContain(`Road Case ${String(CASE_CAP).padStart(2, "0")}`);
    expect(text).not.toContain(`Road Case ${String(CASE_CAP + 1).padStart(2, "0")}`);
  });
});

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
        data={makeShowForViewer({
          show: { dates: RS_DATES },
          runOfShow: { [D1]: { entries: makeEntries(count), showStart: "8:00AM", window: null } },
        })}
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
        // Positive tail-trim presence SCOPED to the run-of-show list (anti-
        // tautology); the absence check on the whole container is stronger.
        const list = c.querySelector(`[data-testid="run-of-show-${D1}"]`)!;
        expect(list.textContent ?? "").toContain(
          `Agenda Item ${String(RUN_OF_SHOW_DISPLAY_CAP).padStart(2, "0")}`,
        );
        expect(c.textContent ?? "").not.toContain(
          `Agenda Item ${String(RUN_OF_SHOW_DISPLAY_CAP + 1).padStart(2, "0")}`,
        );
      }
    },
  );
});
