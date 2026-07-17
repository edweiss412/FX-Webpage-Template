// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/eyebrowSubtle.test.tsx
 *
 * Accent-contrast token pass (spec 2026-07-16 §4.2, VCR-1): Stage-3 card
 * eyebrows are 10px uppercase TEXT — `text-text-faint` measures 3.21:1 light /
 * 4.00:1 dark, below the 4.5:1 AA floor. Every eyebrow (the shared
 * CELL_EYEBROW_CLASS *and* the formerly hard-coded Venue / Loading-dock
 * literals) plus the VenueMapTile "map" badge must render `text-text-subtle`.
 *
 * Failure mode caught: an eyebrow re-inlines the 10px+faint pairing (the exact
 * drift that produced the two hard-coded venue/dock literals) — sighted
 * low-vision users lose the field labels on every Stage-3 card.
 *
 * Anti-tautology: assertions scan the RENDERED section body subtree for the
 * banned class (source-independent — a new faint eyebrow from any code path
 * fails), and separately pin the known labels to the subtle class.
 */
import React from "react";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { step3Sections, VenueBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import { buildStagedSectionData, type SectionData } from "@/components/admin/review/sectionData";
import { VenueMapTile } from "@/components/admin/wizard/VenueMapTile";
import { buildParseResult, stagedRow, harnessVenue } from "./_step3ReviewFixture";

afterEach(() => cleanup());

// Mirrors step3ReviewSections.test.tsx's sectionData assembly.
function sectionData(): SectionData {
  const pr = buildParseResult({});
  const row = stagedRow(pr);
  return buildStagedSectionData({
    pr,
    row,
    dfid: "dfid-eyebrow-test",
    wizardSessionId: "11111111-1111-4111-8111-111111111111",
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

function renderSection(id: string) {
  const def = step3Sections(sectionData()).find((s) => s.id === id);
  if (!def) throw new Error(`registry has no section '${id}'`);
  return render(<>{def.render(sectionData())}</>);
}

describe("Stage-3 eyebrows render text-subtle, never 10px faint (spec §4.2)", () => {
  // The ban is the 10px+faint TEXT pairing (spec §4.2) — decorative faint
  // ICONS (e.g. the hotels arrow glyph, class C decorative) remain legitimate.
  function tenPxFaint(container: HTMLElement): string[] {
    return [...container.querySelectorAll<HTMLElement>('[class*="text-text-faint"]')]
      .map((el) => el.getAttribute("class") ?? "")
      .filter((cls) => cls.includes("text-[10px]"));
  }

  for (const id of ["venue", "hotels", "transport", "contacts"]) {
    test(`${id} section body contains NO 10px text-text-faint eyebrow`, () => {
      const { container } = renderSection(id);
      expect(tenPxFaint(container).join("\n")).toBe("");
    });
  }

  test("VenueBreakdown (populated venue incl. dock) contains NO text-text-faint element", () => {
    // Exercises the two formerly HARD-CODED eyebrows (Venue + Loading dock)
    // that bypass CELL_EYEBROW_CLASS — the exact VCR-1 sites.
    const { container } = render(<VenueBreakdown dfid="dfid-x" venue={harnessVenue()} />);
    const faint = container.querySelectorAll('[class*="text-text-faint"]');
    expect(faint.length, [...faint].map((el) => el.getAttribute("class")).join("\n")).toBe(0);
    expect(container.textContent).toContain("Loading dock");
  });

  test("VenueMapTile 'map' badge uses text-text-subtle, not text-text-faint", () => {
    const { container } = render(
      <VenueMapTile query="The Masonic, SF" mapHref="https://maps.google.com/?q=x" />,
    );
    const badge = [...container.querySelectorAll("span")].find((el) => el.textContent === "map");
    expect(badge, "map badge not rendered").toBeTruthy();
    const tokens = new Set((badge!.getAttribute("class") ?? "").split(/\s+/));
    expect(tokens.has("text-text-subtle")).toBe(true);
    expect(tokens.has("text-text-faint")).toBe(false);
  });
});
