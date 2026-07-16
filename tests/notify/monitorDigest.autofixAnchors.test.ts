import { describe, expect, test } from "vitest";
import { attachSourceCellAnchors } from "@/lib/drive/showDayTimeAnchors";
import { computeAutofixShows } from "@/lib/notify/monitorDigest";
import type { ParseWarning } from "@/lib/parser/types";

// Spec 2026-07-16 §9.6 — unique-name-only crew anchors THROUGH THE REAL RESOLVER:
// duplicate-name crew rows anchor to null (resolveCrewRoleCell returns null on
// multiple matches, lib/drive/crewRoleAnchors.ts:177-185), so byte-identical
// notices from those rows collapse; a unique-name pair anchors both and stays
// distinct. Fixture-injected sourceCell values cannot catch this class (R11).
describe("autofix dedupe through the real anchor resolver", () => {
  const stageWarn = (name: string): ParseWarning => ({
    severity: "warn",
    code: "STAGE_WORD_AUTOCORRECTED",
    message: "Read likely-misspelled stage word(s) 'Sage' as 'Stage' in role cell: 'A1 Sage'",
    blockRef: { kind: "crew", name },
  });
  const anchor = (a1: string) => ({ title: "PULL SHEET", gid: 7, a1 });
  // resolveCrewRoleCell compares normalizeCrewNameKey(blockRef.name) against the
  // stored anchor `name` keys — store pre-normalized (lowercased) keys here, the
  // same idiom as tests/drive/crewRoleAnchors.test.ts fixtures.
  const sources = {
    showDay: [],
    crewRole: [
      { name: "jane doe", anchor: anchor("C3") },
      { name: "jane doe", anchor: anchor("C9") }, // duplicate name — resolver must null out
      { name: "bob roe", anchor: anchor("C5") },
      { name: "ann poe", anchor: anchor("C7") },
    ],
    region: {},
  };

  const modelRow = (warnings: ParseWarning[]) => [
    {
      drive_file_id: "d",
      slug: "s",
      title: "T",
      parse_warnings: warnings as unknown[],
      occurred_at: "2099-01-01T10:00:00Z",
    },
  ];

  test("duplicate names → both unanchored → identical notices collapse to 1", () => {
    const warnings = [stageWarn("Jane Doe"), stageWarn("Jane Doe")];
    attachSourceCellAnchors(warnings, sources);
    expect(warnings.every((w) => w.sourceCell == null)).toBe(true);
    const r = computeAutofixShows(modelRow(warnings));
    expect(r.total).toBe(1);
  });

  test("unique names → both anchored → identical notices stay distinct", () => {
    const warnings = [stageWarn("Bob Roe"), stageWarn("Ann Poe")];
    attachSourceCellAnchors(warnings, sources);
    expect(warnings.map((w) => w.sourceCell?.a1)).toEqual(["C5", "C7"]);
    const r = computeAutofixShows(modelRow(warnings));
    expect(r.total).toBe(2);
  });
});
