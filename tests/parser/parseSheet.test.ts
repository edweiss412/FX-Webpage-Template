import { parseSheet, deriveSchedulePhases, type ParsedSheet } from "@/lib/parser";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("parseSheet across fixture corpus (AC-1.1, AC-1.2)", () => {
  const dir = "fixtures/shows/raw";
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    it(`${f}`, () => {
      const r: ParsedSheet = parseSheet(readFileSync(`${dir}/${f}`, "utf8"), f);
      expect(r.hardErrors).toEqual([]);
      expect(r.show.title.length).toBeGreaterThan(0);
      expect(
        [r.show.dates.travelIn, r.show.dates.set, r.show.dates.showDays[0]].some(Boolean),
      ).toBe(true);
      expect(r.crewMembers.length).toBeGreaterThan(0);
      expect(r.crewMembers[0]!.name.length).toBeGreaterThan(0);
      expect(r.rooms.length).toBeGreaterThan(0);
      // ParsedSheet contract: embeddedImages is ALWAYS empty at parse time
      expect(r.diagrams.embeddedImages).toEqual([]);
      expect(r.diagrams.linkedFolderItems).toEqual([]);
      if (r.openingReel) {
        expect(r.openingReel).not.toHaveProperty("drive_modified_time");
        expect(r.openingReel).not.toHaveProperty("headRevisionId");
        expect(r.openingReel).not.toHaveProperty("mimeType");
      }
    });
  }
});

describe("parseSheet title regression — no column-header artifacts (Task 1.13)", () => {
  const KNOWN_COLUMN_HEADERS = [
    "Main",
    "Name",
    "Details",
    "Setup",
    "BO Setup",
    "GS Setup",
    "Secondary",
    "Event Name",
    "Event Name:",
    "Title of Event",
  ];

  it("does not extract column headers as show.title across entire fixture corpus", () => {
    const dir = "fixtures/shows/raw";
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const r = parseSheet(readFileSync(`${dir}/${f}`, "utf8"), f);
      expect(
        KNOWN_COLUMN_HEADERS,
        `${f}: title "${r.show.title}" is a column header`,
      ).not.toContain(r.show.title);
      // Empty string is acceptable for fixtures with no extractable title;
      // any non-empty title must be longer than any single column-header word.
      if (r.show.title.length > 0) {
        expect(
          r.show.title.length,
          `${f}: title "${r.show.title}" is suspiciously short`,
        ).toBeGreaterThan(2);
      }
    }
  });
});

// ── Codex round-1 finding: agenda_links + schedule_phases populated ──────────
describe("parseSheet — agenda_links extraction (Codex round-1 finding)", () => {
  it("2025-03-dci-rpas-central has at least 2 agenda links (DCI + RPAS)", () => {
    const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
    const r = parseSheet(md, "2025-03-dci-rpas-central.md");
    expect(r.show.agenda_links.length).toBeGreaterThanOrEqual(2);
    const labels = r.show.agenda_links.map((a) => a.label);
    expect(labels.some((l) => /DCI/i.test(l))).toBe(true);
    expect(labels.some((l) => /RPAS/i.test(l))).toBe(true);
  });

  it("2025-05-redefining-fixed-income has at least 1 agenda link", () => {
    const md = readFileSync(
      "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
      "utf8",
    );
    const r = parseSheet(md, "2025-05-redefining-fixed-income-private-credit.md");
    expect(r.show.agenda_links.length).toBeGreaterThanOrEqual(1);
  });
});

describe("parseSheet — schedule_phases derivation from dates (M1 baseline)", () => {
  it("2026-03-rpas-central-four-seasons has phases for set/showDays/travelOut", () => {
    const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
    const r = parseSheet(md, "2026-03-rpas-central-four-seasons.md");
    const phases = r.show.schedule_phases;
    // Per Task 1.5 fixture-grounded: travelIn=2026-03-22, set=2026-03-23 (separate days)
    // Codex round-2 fix: set day is ['Set'] only — Load In is NOT added when travelIn is a
    // different calendar day from set.
    expect(phases["2026-03-23"]).toEqual(["Set"]);
    // travelIn=2026-03-22 is travel-only — no WorkPhase entry expected
    expect(phases["2026-03-22"]).toBeUndefined();
    expect(phases["2026-03-24"]).toEqual(["Show"]);
    expect(phases["2026-03-25"]).toEqual(["Show", "Strike"]); // last show day → compound
    expect(phases["2026-03-26"]).toEqual(["Load Out"]);
  });

  it("schedule_phases compounds Load In + Set when travelIn === set (synthetic)", () => {
    // Synthesize minimal markdown with travelIn === set (same-day crew pattern).
    // The 2026-03 fixture DATES block row for TRAVEL IN is:
    //   |       | TRAVEL IN  |  Sunday   | 3/22/26 |  ...
    // Patching col[3] from 3/22/26 → 3/23/26 makes travelIn === set (2026-03-23).
    const md = readFileSync("fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", "utf8");
    const patched = md.replace(
      /(\|\s*\|\s*TRAVEL IN\s*\|[^|]*\|)\s*3\/22\/26\s*(\|)/,
      "$1 3/23/26 $2",
    );
    const r = parseSheet(patched, "synthetic-same-day-load-in.md");
    const phases = r.show.schedule_phases;
    // When travelIn === set (both 2026-03-23), Load In should be co-located on set day.
    expect(phases["2026-03-23"]).toEqual(["Set", "Load In"]);
  });

  it("schedule_phases is non-empty for every fixture with dates", () => {
    const dir = "fixtures/shows/raw";
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
      const r = parseSheet(readFileSync(`${dir}/${f}`, "utf8"), f);
      const phaseCount = Object.keys(r.show.schedule_phases).length;
      const hasAnyDate = !!(r.show.dates.set || r.show.dates.showDays[0] || r.show.dates.travelOut);
      if (hasAnyDate) {
        expect(phaseCount, `${f}: schedule_phases empty despite having dates`).toBeGreaterThan(0);
      }
    }
  });
});

// ── Edge case: showDays empty but set/travelIn/travelOut present ─────────────
//
// PINS current M1 dates-only baseline behavior (lib/parser/index.ts:272-307).
// The master spec (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md) never
// mentions schedule_phases — derivation rules live only in the index.ts comment
// block (M1 baseline + Codex round-2 amendment). With NO show days, no "Show" or
// "Strike" phase is produced anywhere: Strike only attaches to the LAST show day,
// so a show with set+travel dates but zero parsed show days has no Strike day at
// all. If a future spec amendment demands a synthesized Show/Strike phase, that
// is a derivation change, not a parser bug — these tests pin today's contract.
describe("deriveSchedulePhases — empty showDays with set/travel dates (edge-case pin)", () => {
  it("travelIn on a separate day: only Set + Load Out phases; no Show/Strike anywhere", () => {
    const dates = {
      travelIn: "2026-07-01",
      set: "2026-07-02",
      showDays: [] as string[],
      travelOut: "2026-07-05",
    };
    const phases = deriveSchedulePhases(dates);
    // travelIn is travel-only (no phase); set day omits Load In because
    // travelIn is a different calendar day (index.ts:284-292).
    expect(phases).toEqual({
      "2026-07-02": ["Set"],
      "2026-07-05": ["Load Out"],
    });
    const allPhases = Object.values(phases).flat();
    expect(allPhases).not.toContain("Show");
    expect(allPhases).not.toContain("Strike");
  });

  it("travelIn absent: set day compounds Set + Load In; still no Show/Strike", () => {
    const phases = deriveSchedulePhases({
      travelIn: null,
      set: "2026-07-02",
      showDays: [],
      travelOut: "2026-07-05",
    });
    expect(phases).toEqual({
      "2026-07-02": ["Set", "Load In"],
      "2026-07-05": ["Load Out"],
    });
  });

  it("all dates null and showDays empty: returns an empty phase map", () => {
    const phases = deriveSchedulePhases({
      travelIn: null,
      set: null,
      showDays: [],
      travelOut: null,
    });
    expect(phases).toEqual({});
  });
});

describe("parseSheet — runOfShow wiring (Phase 2)", () => {
  it("East Coast production fixture → parseSheet emits runOfShow keyed by show day", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const r = parseSheet(md, "east-coast.md");
    expect(r.runOfShow).toBeDefined();
    expect(Object.keys(r.runOfShow!)).toEqual(expect.arrayContaining(["2024-05-15"]));
    expect(r.runOfShow!["2024-05-15"]![0]!.title).toBe("Family Office Only Breakfast");
  });

  it("RIA production fixture → parseSheet emits runOfShow keyed by RIA show days (both filled shapes wired)", () => {
    // The other real filled production shape — proves parseSheet wiring is not East-Coast-specific.
    // RIA dates come from the sheet's own DATES block; the AGENDA banner carries 6/25/25 (Wed) + 6/26/25 (Thu).
    const md = readFileSync("fixtures/shows/exporter-xlsx/ria.md", "utf8");
    const r = parseSheet(md, "ria.md");
    expect(r.runOfShow).toBeDefined();
    expect(Object.keys(r.runOfShow!)).toEqual(expect.arrayContaining(["2025-06-25"]));
    // first Day-1 session — derived from ria.md:320 (clone-and-read), not hardcoded blind
    expect(r.runOfShow!["2025-06-25"]![0]!.title).toBe("Attendee Registration and Breakfast");
    expect(r.runOfShow!["2025-06-25"]![0]!.start).toBe("7:30 AM");
  });

  it("a VERSION-VALID sheet whose AGENDA tab has NO token-header → runOfShow undefined + AGENDA_GRID_MALFORMED (parseAgenda runs)", () => {
    // R22: must use a VERSION-DETECTABLE input — a bare `| FOO |` table fails detectVersion
    // (schema.ts:102) → parseSheet returns EARLY at index.ts:320-356 (MI-1_VERSION_DETECTION_FAILED)
    // BEFORE any block parser → parseAgenda never runs → AGENDA_GRID_MALFORMED can NEVER fire.
    // So take a REAL fixture (version detection passes on all its other markers) and remove ONLY
    // the AGENDA token-header line, so parseSheet proceeds to parseAgenda, which finds no grid.
    const full = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const noGrid = full
      .split("\n")
      .filter((line) => !/NAME\s*\|\s*ARRIVAL\s*\|\s*FLIGHT/i.test(line))
      .join("\n");
    const r = parseSheet(noGrid, "east-coast-no-agenda.md");
    expect(r.hardErrors).toEqual([]); // version STILL detected — not the MI-1 early-return path
    expect(r.runOfShow).toBeUndefined(); // grid unlocatable → omitted optional property
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_GRID_MALFORMED");
  });
});
