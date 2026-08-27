import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  extractUnknownFieldAnchors,
  resolveUnknownFieldCell,
  normalizeCellKey,
} from "@/lib/drive/unknownFieldAnchors";
import { parseSheet } from "@/lib/parser";
import { premiseHolds } from "@/tests/_shared/premise";

// Build a minimal INFO sheet from an array-of-arrays; returns bytes + gid map.
// Row/col are 0-based; A1 is derived by the code under test.
function buildInfoWorkbook(rows: (string | null)[][]): {
  buffer: ArrayBuffer;
  gids: Map<string, number>;
} {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? "")));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { buffer, gids: new Map([["INFO", 0]]) };
}

describe("extractUnknownFieldAnchors", () => {
  it("anchors each venue/details row to its LABEL cell keyed by (kind,label,value)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DATES", ""],
      ["", ""],
      ["VENUE", ""],
      ["Where", "Four Seasons Hotel"],
      ["", ""],
      ["DETAILS", ""],
      ["Floor Plan", "LINK"],
      ["GS Podium Type", "(2) Acrylic Podium"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(anchors.find((a) => a.kind === "venue" && a.label === "where")?.anchor.a1).toBe("A4");
    const podium = anchors.find((a) => a.kind === "details" && a.label === "gs podium type");
    expect(podium?.anchor.a1).toBe("A8");
    expect(podium?.value).toBe(normalizeCellKey("(2) Acrylic Podium"));
  });

  it("resolves exactly-one (kind,label,value) match to the cell", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["GS Podium Type", "(2) Acrylic Podium"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(
      resolveUnknownFieldCell(anchors, "details", "GS Podium Type", "(2) Acrylic Podium")?.a1,
    ).toBe("A2");
  });

  it("PROVENANCE: same label, different value → matches the correct row (never the impostor)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "real note"],
      ["Notes", "other note"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "other note")?.a1).toBe("A3");
  });

  it("PROVENANCE across bound divergence: outside-bound label + inside impostor sharing the label but not the value → never anchors to the impostor", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "inside-val"],
      ["", ""],
      ["CONTACTS", ""],
      ["Notes", "outside-val"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "outside-val")).toBeNull();
  });

  it("same label AND same value (true duplicate) → null (never a wrong cell)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "dup"],
      ["Notes", "dup"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "dup")).toBeNull();
  });

  it("kind-scoping: same label in venue and details does not cross-collide", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["VENUE", ""],
      ["Notes", "venue note"],
      ["", ""],
      ["DETAILS", ""],
      ["Notes", "details note"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "venue", "Notes", "venue note")?.a1).toBe("A2");
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "details note")?.a1).toBe("A5");
  });

  it("no match → null; wrong/absent inputs → null; missing gid → []", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Floor Plan", "LINK"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Nonexistent", "x")).toBeNull();
    expect(resolveUnknownFieldCell(anchors, undefined, "Floor Plan", "LINK")).toBeNull();
    expect(extractUnknownFieldAnchors(buffer, new Map())).toEqual([]);
  });

  it("over-inclusive: does NOT stop at an internal blank row within the block", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Floor Plan", "LINK"],
      ["", ""],
      ["Notes", "kept"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(anchors.find((a) => a.label === "notes")?.anchor.a1).toBe("A4");
  });

  it("EXACT header: a field row starting with 'Details' is NOT mistaken for the DETAILS header (never a false-early scan)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["Details Notes", "some note"], // prefix-only regex would false-match this as the header
      ["", ""],
      ["DETAILS", ""], // the real header
      ["Floor Plan", "LINK"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    // The real detail row anchors to its real cell (A4) — proving the scan started at
    // the real DETAILS header, not the "Details Notes" field row above it.
    expect(resolveUnknownFieldCell(anchors, "details", "Floor Plan", "LINK")?.a1).toBe("A4");
    // "Details Notes" (above the header) is never scanned as a details row.
    expect(resolveUnknownFieldCell(anchors, "details", "Details Notes", "some note")).toBeNull();
  });

  // ── the v4 venue shape: anchors where there were none ────────────────────────────────
  //
  // Before the shared venue-block predicate a `VENUE NAME`-opened table produced ZERO
  // anchors of any kind, so a near-miss row in one resolved to null and its card carried no
  // "Open in Sheet" link. UNKNOWN_FIELD is in OPERATOR_ACTIONABLE_ANCHORED, so this is a
  // working link where there was none, not a bookkeeping change.
  // Spec: docs/superpowers/specs/parser/2026-08-27-venue-block-predicate-design.md §4.

  it("anchors a v4 VENUE NAME-opened venue table, so a near-miss row in it resolves to its own cell", () => {
    // ONE row set, used by the workbook AND the premise. Three rows, not two: a two-row
    // sheet gives {count: 1, cell: "A2"} and three gives {count: 2, cell: "A3"}, so a
    // two-row fixture cannot support an A3 expectation.
    const ROWS = [
      ["VENUE NAME", "Four Seasons Hotel Chicago"],
      ["VENUE ADDRESS", "120 E Delaware Pl"],
      ["Diagrams?", "see folder"],
    ];
    const { buffer, gids } = buildInfoWorkbook(ROWS);

    // PREMISE — reads the PARSER, not the anchor scanner, so it holds identically before and
    // after this change. That independence is what makes it a premise rather than a
    // restatement of the goal: premising the ANCHOR COUNT would be false on the RED, so the
    // case would stop at "premise not met" and never reach the assertion below.
    //
    // It parses the SAME ROWS the workbook was built from. A premise over different input
    // than the case's own validates something adjacent, not this case.
    //
    // The witness is `Diagrams?`, NOT `Venu Notes`: the venue parser's scoped fuzzy path
    // RECOVERS `Venu Notes` and consumes the row (FIELD_LABEL_AUTOCORRECTED, empty
    // raw_unrecognized), so it never becomes an UNKNOWN_FIELD and an anchor assertion over
    // it would pass without exercising the routing key this arc changes.
    const parsed = parseSheet(
      ROWS.map((r) => `| ${r[0]} | ${r[1]} |`).join("\n"),
      "anchor-witness",
    );
    const warning = parsed.warnings.find((w) => w.code === "UNKNOWN_FIELD");
    premiseHolds(
      "the witness row is genuinely an UNKNOWN_FIELD, not a consumed row",
      warning !== undefined,
    );

    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(anchors.filter((a) => a.kind === "venue").length).toBeGreaterThan(0);

    // JOIN ON THE WARNING'S OWN kind — never a literal "venue". That is what the runtime
    // passes, and hardcoding it tests the scanner in isolation while letting the DETECTOR
    // regress underneath.
    //
    // PLANTED MUTANT (run, not reasoned): revert fieldNearMiss's venue arm to the venue-only
    // classification while parseVenue keeps the shared predicate. Observed —
    //   warning kind:              "venue name"
    //   hardcoded "venue":         "A3"   the case PASSES, proving nothing
    //   joined on blockRef.kind:   null   the real path, broken
    // So this line is the one assertion pinning the SECOND caller of the shared predicate.
    expect(
      resolveUnknownFieldCell(anchors, warning?.blockRef?.kind, "Diagrams?", "see folder")?.a1,
    ).toBe("A3");
  });

  it("EXACT header: a VENUE-prefixed field row above the real header is not mistaken for it", () => {
    // Tests EXACTNESS, not ordering. A fixture with a valid bare VENUE header above a later
    // VENUE NAME table does NOT do that: the exact regex and a prefix mutant both select
    // row 0 there, so it pins first-valid-header ordering and survives the recognizer being
    // broadened — the one regression this exists to catch.
    const { buffer, gids } = buildInfoWorkbook([
      ["VENUE NOTES", "dock closes at 5"], // a prefix mutant would open the scan HERE
      ["", ""],
      ["VENUE NAME", "Four Seasons Hotel Chicago"],
      ["VENUE ADDRESS", "120 E Delaware Pl"],
      ["Diagrams?", "see folder"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    const venue = anchors.filter((a) => a.kind === "venue");

    // Assert the ANCHOR SET, not the resolution.
    //
    // PLANTED MUTANT (run, not reasoned): broaden the venue header to /^VENUE/i. Observed —
    //   exact  /^VENUE(\s+NAME)?$/i : 2 anchors, venue address@A4 | diagrams?@A5
    //   prefix /^VENUE/i            : 3 anchors, venue name@A3 | venue address@A4 | diagrams?@A5
    //   resolution under BOTH       : "A5"
    // Resolution discriminates NOTHING. Under the exact regex the real header row is consumed
    // AS the header and never anchored; under the prefix mutant the scan opens at VENUE NOTES
    // and `venue name` becomes an anchored field row. That is what this assertion catches.
    expect(venue.map((a) => a.label)).not.toContain("venue name");
    expect(resolveUnknownFieldCell(anchors, "venue", "Diagrams?", "see folder")?.a1).toBe("A5");
  });

  it("#217 regression: an EVENT DETAILS block OPENING with a 'DIagrams' row still anchors the rows below it (DIAGRAMS/DRESS are known field labels, not details terminators)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["EVENT DETAILS", "EVENT DETAILS"], // A1 header (v4 template shape)
      ["DIagrams", "LINK"], // A2 real field row — must NOT terminate the scan
      ["LED", "N/A"], // A3
      ["GS Podium Type", "Truss Podium"], // A4 — below DIagrams; must still resolve
      ["Dress", "Black Tie"], // A5 — DRESS is a field too, not a terminator
      ["Notes", "kept"], // A6 — below Dress; must still resolve
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "DIagrams", "LINK")?.a1).toBe("A2");
    expect(resolveUnknownFieldCell(anchors, "details", "GS Podium Type", "Truss Podium")?.a1).toBe(
      "A4",
    );
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "kept")?.a1).toBe("A6");
  });
});
