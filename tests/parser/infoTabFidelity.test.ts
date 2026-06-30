import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser/index";
import { newRoom } from "@/lib/parser/blocks/gear";
import { KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES } from "@/lib/parser/knownSections";

const consultants = () =>
  parseSheet(readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8"));

describe("lunch-room dedup (H2)", () => {
  it("merges the GEAR lunch room onto the INFO lunch room without losing INFO data", () => {
    const rooms = consultants().rooms;
    const ballroomC = rooms.filter((r) => /\bBALLROOM C\b/i.test(r.name));
    // Exactly one BALLROOM C room (the INFO breakout), not two.
    expect(ballroomC).toHaveLength(1);
    const lunch = ballroomC[0]!;
    expect(lunch.kind).toBe("breakout");
    // GEAR audio merged in...
    expect(lunch.audio).toBeTruthy();
    // ...AND the INFO room's own data survives (the H2 bug is split-room data
    // loss: a gear-only BALLROOM C room would have null times/setup, so these
    // assertions prove the merge landed ON the INFO room, not a gear stub).
    expect(lunch.setup).toBeTruthy();
    expect(lunch.set_time).toBeTruthy();
    expect(lunch.show_time).toBeTruthy();
    expect(lunch.strike_time).toBeTruthy();
    // No separate GRAND BALLROOM C room remains.
    expect(rooms.some((r) => /^GRAND BALLROOM C$/i.test(r.name))).toBe(false);
  });

  it("leaves GS and FOYER rooms intact", () => {
    const rooms = consultants().rooms;
    expect(rooms.some((r) => r.kind === "gs")).toBe(true);
    expect(rooms.some((r) => /^FOYER$/i.test(r.name))).toBe(true);
  });
});

// Direct newRoom coverage — proves the GRAND strip is scoped to ^LUNCH only.
describe("gear newRoom — GRAND strip is lunch-scoped (H2 collision safety)", () => {
  it("strips leading GRAND from a LUNCH room and sets kind=breakout", () => {
    expect(newRoom("LUNCH SESSION - GRAND BALLROOM C")).toMatchObject({
      kind: "breakout",
      name: "BALLROOM C",
    });
  });
  it("does NOT strip GRAND from a non-lunch additional room (no global strip)", () => {
    expect(newRoom("ADDITIONAL ROOM - GRAND FOYER")).toMatchObject({
      kind: "additional",
      name: "GRAND FOYER",
    });
  });
  it("does NOT strip GRAND from a GS room (a global strip would break GS merge)", () => {
    expect(newRoom("GENERAL SESSION - GRAND BALLROOM A/B")).toMatchObject({
      kind: "gs",
      name: "GRAND BALLROOM A/B",
    });
  });
});

// Integration guard on the real parser path: a global strip would de-merge GS
// (GEAR "GRAND BALLROOM A/B" → "BALLROOM A/B" ≠ INFO GS "GRAND BALLROOM A/B"),
// so the GS room would lose its merged gear.
describe("gear-merge integration — GS gear retained (H2)", () => {
  it("the consultants GS room keeps its merged GEAR audio", () => {
    const gs = consultants().rooms.find((r) => r.kind === "gs");
    expect(gs?.audio).toBeTruthy();
  });
});

describe("title banner-preference (M3)", () => {
  it("uses the proper-cased line-1 banner, not the uppercase Event Name cell", () => {
    expect(consultants().show.title).toBe("AII/III - Consultants Roundtable 2025");
  });

  it.each([
    ["fintech", "II - FinTech Forum CTO Summit 2026"],
    ["fixed-income", "II - Fixed Income Trading Summit 2025"],
    ["rpas", "II - Retirement Plan Advisor Institute - Central 2026"],
  ])("%s uses the proper-cased banner", (slug, expected) => {
    const md = readFileSync(`fixtures/shows/exporter-xlsx/${slug}.md`, "utf8");
    expect(parseSheet(md).show.title).toBe(expected);
  });

  it("a positive banner that is not a section header is accepted", () => {
    const md = "| Acme Annual Forum 2026 | Acme Annual Forum 2026 |\n| CLIENT | X |";
    expect(parseSheet(md).show.title).toBe("Acme Annual Forum 2026");
  });

  // Codex whole-diff review: #0 must require a FULL-row duplicated banner, not
  // just cells[0]===cells[1] after filtering empties.
  it("does NOT treat a partial-duplicate first row as a banner", () => {
    // "Show X" duplicated in cols 1-2 but col 3 differs → not a clean banner.
    const md = "| Show X | Show X | Other |\n| Event Name: | Real Title 2026 |";
    expect(parseSheet(md).show.title).not.toBe("Show X");
    expect(parseSheet(md).show.title).toBe("Real Title 2026");
  });

  it("does NOT treat a leading-empty data row as a banner", () => {
    // Real col0 is empty (a continuation/data row), so it is not a banner even
    // though the non-empty cells duplicate.
    const md = "|  | Show X | Show X |\n| Event Name: | Real Title 2026 |";
    expect(parseSheet(md).show.title).not.toBe("Show X");
    expect(parseSheet(md).show.title).toBe("Real Title 2026");
  });

  // Anti-regression: shows whose title should be UNCHANGED by banner-preference.
  // redefining-fi's banner carries an in-cell &#10; (a two-forum multi-value
  // cell) so #0 skips it and the existing chain keeps "RFI & PC Chicago";
  // ria/east-coast have clean banners that #0 returns at the same value as before.
  it.each([
    ["redefining-fi", "RFI & PC Chicago"],
    ["ria", "II - RIA Investment Forum - Central 2025"],
    ["east-coast", "East Coast Family Office Wealth Conference"],
  ])("%s title is preserved", (slug, expected) => {
    const md = readFileSync(`fixtures/shows/exporter-xlsx/${slug}.md`, "utf8");
    expect(parseSheet(md).show.title).toBe(expected);
  });
});

describe("title guard — section headers never become the title (structural, M3)", () => {
  const bare = [...KNOWN_SECTION_HEADERS];
  const suffixed = [...PREFIX_SECTION_FAMILIES].flatMap((fam) => [
    `${fam} - SYNTHETIC ROOM`,
    `${fam} 2 - SYNTHETIC`,
    `${fam} SYNTHETIC ROOM`, // no-separator shape the parser still recognizes
  ]);
  it.each([...bare, ...suffixed])(
    "duplicated first-row header %s is not promoted to show.title",
    (header) => {
      // no-banner sheet whose first table row is the header, column-duplicated
      const md = `| ${header} | ${header} |\n| CLIENT | X |\n| DATES | |`;
      expect(parseSheet(md).show.title).not.toBe(header);
    },
  );
});
