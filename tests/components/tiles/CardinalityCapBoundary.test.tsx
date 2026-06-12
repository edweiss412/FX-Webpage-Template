/**
 * tests/components/tiles/CardinalityCapBoundary.test.tsx
 *
 * Pins the §8.4 / AC-4.4 cardinality-cap boundary on the two tiles
 * that render an overflow disclosure stub (`data-tile-show-more`):
 *
 *   - CrewTile      — CREW_INLINE_CAP = 8  (components/tiles/CrewTile.tsx:58)
 *   - PackListTile  — CASE_CAP        = 12 (components/tiles/PackListTile.tsx:67)
 *
 * Neither constant is exported, so each describe block mirrors the
 * value locally AND a source-scan sync test asserts the component
 * still declares the mirrored value — if the component cap drifts,
 * the sync test fails loudly instead of the boundary tests silently
 * testing the wrong threshold.
 *
 * Boundary matrix per tile (cap-1 / cap / cap+1):
 *   - cap-1 → all rows inline, NO overflow affordance.
 *   - cap   → all rows inline, NO overflow affordance. [Catches the
 *             affordance-threshold flip: `>= cap` instead of `> cap`
 *             would show a "+0 more" stub at exactly-cap.]
 *   - cap+1 → exactly `cap` rows inline, affordance present, count
 *             text derived from fixture.length - cap. [Catches
 *             off-by-one in `.slice(0, CAP)` and a wrong overflow
 *             count formula.]
 *
 * Anti-tautology guarantees:
 *   - Expected overflow counts are DERIVED from fixture dimensions
 *     (`fixture.length - CAP`), never hardcoded literals.
 *   - Row counts are counted via the per-row data-testid occurrences,
 *     not inferred from name presence alone.
 *   - The first-hidden entry's label is generated unique (zero-padded,
 *     no entry label is a substring of another) and asserted ABSENT
 *     inline at cap+1 — proving the slice trims the tail, not the head.
 *   - renderToStaticMarkup renders ONLY the tile under test, so every
 *     substring assertion is already scoped to the tile container (no
 *     sibling component can satisfy it).
 *
 * Driving strategy: `renderToStaticMarkup` server-render to an HTML
 * string — same pattern as tests/components/tiles/SentinelHidingClass.
 * test.tsx and ScopeTileIcons.test.tsx. No jsdom needed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CrewTile } from "@/components/tiles/CrewTile";
import { PackListTile } from "@/components/tiles/PackListTile";
import type { PullSheetCase } from "@/lib/parser/types";

/** Count occurrences of a marker substring in rendered HTML. */
function countOccurrences(html: string, marker: string): number {
  return html.split(marker).length - 1;
}

function readComponentSource(filename: string): string {
  return readFileSync(join(process.cwd(), "components", "tiles", filename), "utf8");
}

// ─────────────────────────────────────────────────────────────────────
// CrewTile — CREW_INLINE_CAP boundary (7 / 8 / 9)
// ─────────────────────────────────────────────────────────────────────

describe("§8.4 cardinality-cap boundary — CrewTile (CREW_INLINE_CAP)", () => {
  // Mirror of the unexported constant at components/tiles/CrewTile.tsx:58
  // (`const CREW_INLINE_CAP = 8;`). The sync test below pins the mirror
  // against the live source so drift cannot go unnoticed.
  const CREW_INLINE_CAP = 8;

  // Fixture names are zero-padded so no name is a substring of another
  // ("Crew Member 01" vs "Crew Member 10") — substring assertions on the
  // rendered HTML stay unambiguous.
  function makeCrew(count: number) {
    const members = [];
    for (let i = 1; i <= count; i++) {
      members.push({
        id: `crew-${i}`,
        name: `Crew Member ${String(i).padStart(2, "0")}`,
        email: `crew${i}@example.com`,
        phone: "555-0100",
        role: "A1",
        roleFlags: ["A1"] as const,
        dateRestriction: { kind: "none" as const },
        stageRestriction: { kind: "none" as const },
      });
    }
    return members;
  }

  test("sync guard — component still declares CREW_INLINE_CAP = mirrored value", () => {
    // Catches: cap constant drifts in the component (e.g., tuned to 6
    // or 10) without these boundary tests being updated — without this
    // guard the suite would keep testing a stale threshold and pass
    // vacuously.
    const source = readComponentSource("CrewTile.tsx");
    const match = source.match(/const CREW_INLINE_CAP\s*=\s*(\d+)\s*;/);
    expect(match, "CREW_INLINE_CAP declaration not found in CrewTile.tsx").not.toBeNull();
    expect(Number(match![1])).toBe(CREW_INLINE_CAP);
  });

  test(`cap-1 (${CREW_INLINE_CAP - 1} members) — all rows inline, NO overflow affordance`, () => {
    // Catches: affordance threshold mis-wired to fire below the cap
    // (e.g., `length >= CAP - 1`), or the slice trimming rows early.
    const crew = makeCrew(CREW_INLINE_CAP - 1);
    const html = renderToStaticMarkup(<CrewTile crewMembers={crew as never} />);
    expect(countOccurrences(html, 'data-testid="crew-row"')).toBe(crew.length);
    // Every member renders inline, including the last.
    expect(html).toContain(crew[crew.length - 1]!.name);
    // No overflow affordance in any form.
    expect(html).not.toContain("data-tile-show-more");
    expect(html).not.toContain("crew-overflow-stub");
  });

  test(`exactly cap (${CREW_INLINE_CAP} members) — all rows inline, NO overflow affordance`, () => {
    // Catches: affordance-threshold flip — `overflowCount >= 0` or
    // `length >= CAP` rendering a "+0 more" stub at exactly-cap. This
    // is THE boundary the cap contract hinges on.
    const crew = makeCrew(CREW_INLINE_CAP);
    const html = renderToStaticMarkup(<CrewTile crewMembers={crew as never} />);
    expect(countOccurrences(html, 'data-testid="crew-row"')).toBe(crew.length);
    expect(html).toContain(crew[crew.length - 1]!.name);
    expect(html).not.toContain("data-tile-show-more");
    expect(html).not.toContain("crew-overflow-stub");
    // Belt-and-braces against a "+0" stub leaking through a >= flip.
    expect(html).not.toContain("+0");
  });

  test(`cap+1 (${CREW_INLINE_CAP + 1} members) — exactly cap rows inline + affordance with derived count`, () => {
    // Catches: off-by-one in `.slice(0, CREW_INLINE_CAP)` (9 rows
    // rendered, or only 7), and a wrong overflow formula (count not
    // equal to fixture.length - cap).
    const crew = makeCrew(CREW_INLINE_CAP + 1);
    const expectedOverflow = crew.length - CREW_INLINE_CAP; // derived, never hardcoded
    const html = renderToStaticMarkup(<CrewTile crewMembers={crew as never} />);
    expect(countOccurrences(html, 'data-testid="crew-row"')).toBe(CREW_INLINE_CAP);
    // The last inline member renders; the first overflowed member does NOT
    // (proves the slice trims the tail, not the head).
    expect(html).toContain(crew[CREW_INLINE_CAP - 1]!.name);
    expect(html).not.toContain(crew[CREW_INLINE_CAP]!.name);
    // Affordance present with the derived count.
    expect(html).toContain('data-tile-show-more="true"');
    expect(html).toContain('data-testid="crew-overflow-stub"');
    expect(html).toContain(`+${expectedOverflow}`);
    // Singular/plural copy derived from the overflow count (CrewTile.tsx:178).
    expect(html).toContain(
      expectedOverflow === 1 ? "more crew member on the source sheet" : "more crew members on the source sheet",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// PackListTile — CASE_CAP boundary (11 / 12 / 13)
// ─────────────────────────────────────────────────────────────────────

describe("§8.4 cardinality-cap boundary — PackListTile (CASE_CAP)", () => {
  // Mirror of the unexported constant at components/tiles/PackListTile.tsx:67
  // (`const CASE_CAP = 12;`). Sync test below pins it against source.
  const CASE_CAP = 12;

  // Visibility gate fixture — same fixed-date strategy as the round-17
  // PackListTile block in SentinelHidingClass.test.tsx: "today" lands
  // on a Set phase so isPackListVisibleToday() passes without time mocks.
  const TODAY_ISO = "2026-04-21";
  const TODAY = new Date("2026-04-21T16:00:00Z");
  const SHOW = {
    schedule_phases: { [TODAY_ISO]: ["Set"] },
    venue: null,
  } as never;

  // Case labels are zero-padded so no label is a substring of another.
  function makeCases(count: number): PullSheetCase[] {
    const cases: PullSheetCase[] = [];
    for (let i = 1; i <= count; i++) {
      cases.push({
        caseLabel: `Road Case ${String(i).padStart(2, "0")}`,
        items: [{ qty: 1, cat: null, subCat: null, item: `Cable Loom ${String(i).padStart(2, "0")}` }],
      });
    }
    return cases;
  }

  function renderTile(pullSheet: PullSheetCase[]): string {
    return renderToStaticMarkup(
      <PackListTile
        pullSheet={pullSheet}
        show={SHOW}
        stageRestriction={{ kind: "none" }}
        today={TODAY}
      />,
    );
  }

  test("sync guard — component still declares CASE_CAP = mirrored value", () => {
    // Catches: cap constant drifts in the component without these
    // boundary tests following — prevents the suite from silently
    // pinning a stale threshold.
    const source = readComponentSource("PackListTile.tsx");
    const match = source.match(/const CASE_CAP\s*=\s*(\d+)\s*;/);
    expect(match, "CASE_CAP declaration not found in PackListTile.tsx").not.toBeNull();
    expect(Number(match![1])).toBe(CASE_CAP);
  });

  test(`cap-1 (${CASE_CAP - 1} cases) — all cases inline, NO overflow disclosure`, () => {
    // Catches: disclosure firing below the cap, or the slice trimming
    // cases before the threshold.
    const cases = makeCases(CASE_CAP - 1);
    const html = renderTile(cases);
    expect(countOccurrences(html, 'data-testid="pack-list-case"')).toBe(cases.length);
    expect(html).toContain(cases[cases.length - 1]!.caseLabel);
    expect(html).not.toContain("data-tile-show-more");
    expect(html).not.toContain("pack-list-overflow-stub");
  });

  test(`exactly cap (${CASE_CAP} cases) — all cases inline, NO overflow disclosure`, () => {
    // Catches: affordance-threshold flip (`length >= CASE_CAP`)
    // rendering a "+0 more cases" stub at exactly-cap.
    const cases = makeCases(CASE_CAP);
    const html = renderTile(cases);
    expect(countOccurrences(html, 'data-testid="pack-list-case"')).toBe(cases.length);
    expect(html).toContain(cases[cases.length - 1]!.caseLabel);
    expect(html).not.toContain("data-tile-show-more");
    expect(html).not.toContain("pack-list-overflow-stub");
    expect(html).not.toContain("+0");
  });

  test(`cap+1 (${CASE_CAP + 1} cases) — exactly cap cases inline + disclosure with derived count`, () => {
    // Catches: off-by-one in `.slice(0, CASE_CAP)` (13 cases rendered,
    // or only 11), and a wrong overflow formula (count not equal to
    // pullSheet.length - cap).
    const cases = makeCases(CASE_CAP + 1);
    const expectedOverflow = cases.length - CASE_CAP; // derived, never hardcoded
    const html = renderTile(cases);
    expect(countOccurrences(html, 'data-testid="pack-list-case"')).toBe(CASE_CAP);
    // Last inline case renders; first overflowed case does NOT
    // (slice trims the tail, not the head).
    expect(html).toContain(cases[CASE_CAP - 1]!.caseLabel);
    expect(html).not.toContain(cases[CASE_CAP]!.caseLabel);
    // Disclosure present with the derived count.
    expect(html).toContain('data-tile-show-more="true"');
    expect(html).toContain('data-testid="pack-list-overflow-stub"');
    expect(html).toContain(`+${expectedOverflow}`);
    // Singular/plural copy derived from the overflow count (PackListTile.tsx:270).
    expect(html).toContain(
      expectedOverflow === 1
        ? "more case on the source pull sheet"
        : "more cases on the source pull sheet",
    );
  });
});
