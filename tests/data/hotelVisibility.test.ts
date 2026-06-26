/**
 * Tests for the per-viewer hotel-visibility predicate `hotelVisibleToViewer`, the
 * extracted helper that `getShowForViewer` uses to filter `allHotels` for a crew
 * viewer. Spec: docs/superpowers/specs/2026-06-26-hotel-viewer-name-match.md §3.2/§4.2.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hotelVisibleToViewer } from "@/lib/data/getShowForViewer";
import { namesRefer } from "@/lib/data/nameMatch";
import { parseSheet } from "@/lib/parser";
import type { HotelReservationRow } from "@/lib/parser/types";

const res = (names: string[]): HotelReservationRow => ({
  ordinal: 1,
  hotel_name: "Test Hotel",
  hotel_address: null,
  names,
  confirmation_no: null,
  check_in: null,
  check_out: null,
  notes: null,
});

describe("hotelVisibleToViewer — explicit cases", () => {
  it("a first-name guest is visible to the full-roster viewer", () => {
    // failure mode: substring `.includes` would hide this (carl ⊉ 'carl fenton')
    expect(hotelVisibleToViewer(res(["Carl"]), "Carl Fenton")).toBe(true);
  });
  it("a same-first-name DIFFERENT-surname guest is NOT visible (over-match guard)", () => {
    expect(hotelVisibleToViewer(res(["Eric Carroll"]), "Eric Weiss")).toBe(false);
  });
  it("legacy '/'-merged persisted row is visible via the sub-name", () => {
    expect(hotelVisibleToViewer(res(["David Johnson / Jeffrey Justice"]), "DJ Johnson")).toBe(true);
  });
  it("empty names → not visible (no crash)", () => {
    expect(hotelVisibleToViewer(res([]), "Carl Fenton")).toBe(false);
  });
});

describe("hotelVisibleToViewer — fixture-derived (real parsed shows, self-grounding)", () => {
  const FIXT = (slug: string) =>
    parseSheet(readFileSync(`fixtures/shows/exporter-xlsx/${slug}.md`, "utf8"), `${slug}.md`);
  // the shows the OLD substring filter broke; names read from parseSheet, not hardcoded.
  for (const slug of ["east-coast", "ria", "rpas", "consultants", "fixed-income"]) {
    it(`${slug}: every crew member who matches a hotel guest is surfaced that reservation`, () => {
      const r = FIXT(slug);
      const crewNames = r.crewMembers.map((c) => c.name);
      // a crew member is "expected to have a hotel" iff some guest name refers to them
      const expectedToSeeOne = crewNames.filter((cn) =>
        r.hotelReservations.some((res2) => res2.names.some((g) => namesRefer(g, cn))),
      );
      // sanity: a broken show must have ≥1 crew member with a matchable hotel
      expect(expectedToSeeOne.length).toBeGreaterThan(0);
      for (const cn of expectedToSeeOne) {
        const visible = r.hotelReservations.filter((res2) => hotelVisibleToViewer(res2, cn));
        // failure mode: a wiring/extraction bug would surface nothing for a real crew name
        expect(visible.length, `${slug}: "${cn}" should see ≥1 hotel`).toBeGreaterThan(0);
      }
    });
  }
});

describe("hotelVisibleToViewer — STRUCTURAL GUARD: getShowForViewer is wired off .includes", () => {
  // Catches "helper added but production predicate never swapped" (Codex plan R1/R2).
  const src = readFileSync(path.resolve(__dirname, "../../lib/data/getShowForViewer.ts"), "utf8");
  it("the hotel filter routes through hotelVisibleToViewer", () => {
    expect(src).toContain("hotelVisibleToViewer(");
  });
  it("the hotel filter contains NO naive res.names substring predicate", () => {
    // [\s\S]{0,120}? crosses the arrow-param ')' (the earlier [^)]* stopped at it
    // and false-passed the real `res.names.some((n) => n.toLowerCase().includes(...))`).
    expect(src).not.toMatch(/res\.names\.some\([\s\S]{0,120}?\.includes\(/);
  });
});
