import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  extractUnknownFieldAnchors,
  resolveUnknownFieldCell,
  normalizeCellKey,
} from "@/lib/drive/unknownFieldAnchors";
import { parseSheet } from "@/lib/parser";
import { premiseHolds } from "@/tests/_shared/premise";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";

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

/** Multi-tab workbook plus the gid map the real ingestion path would resolve. */
function buildWorkbook(tabs: Record<string, (string | null)[][]>): {
  buffer: ArrayBuffer;
  gids: Map<string, number>;
} {
  const wb = XLSX.utils.book_new();
  const gids = new Map<string, number>();
  let gid = 0;
  for (const [name, rows] of Object.entries(tabs)) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? ""))),
      name,
    );
    gids.set(name, gid);
    gid += 1;
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const buffer =
    out instanceof Uint8Array
      ? (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer)
      : (out as ArrayBuffer);
  return { buffer, gids };
}

/** Read a committed workbook as a standalone ArrayBuffer. `readFileSync(...).buffer` is a
 *  POOLED allocation for small files and would carry a byteOffset; slice it. */
function fixtureBuffer(relative: string): ArrayBuffer {
  const b = readFileSync(join(process.cwd(), relative));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Run the real ingestion shape: synthesize -> parse -> attach, then read the warnings the
 *  detector actually emitted. Never reads `kind` off the warning to decide an assertion. */
async function anchoredUnknownFields(tabs: Record<string, (string | null)[][]>) {
  const { buffer, gids } = buildWorkbook(tabs);
  const parsed = parseSheet(synthesizeMarkdownFromXlsx(buffer).markdown, "probe.md");
  await attachWarningAnchors(parsed.warnings, buffer, () => Promise.resolve(gids));
  return parsed.warnings.filter((w) => w.code === "UNKNOWN_FIELD");
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
    // Spec 2026-08-27 §2.4: zero matches on a kind that lives on ONE tab now resolves to
    // that tab. The PROVENANCE claim is unchanged and is what matters here - the tab,
    // never the impostor cell.
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "outside-val")).toEqual({
      title: "INFO",
      gid: 0,
      scope: "tab",
    });
  });

  it("same label AND same value (true duplicate) → null (never a wrong cell)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "dup"],
      ["Notes", "dup"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    // Spec 2026-08-27 §2.4: several matches, one tab -> the tab. Still never a cell.
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "dup")).toEqual({
      title: "INFO",
      gid: 0,
      scope: "tab",
    });
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
    // Spec 2026-08-27 §2.4: the label matches nothing, but the kind names one tab.
    expect(resolveUnknownFieldCell(anchors, "details", "Nonexistent", "x")).toEqual({
      title: "INFO",
      gid: 0,
      scope: "tab",
    });
    expect(resolveUnknownFieldCell(anchors, undefined, "Floor Plan", "LINK")).toBeNull();
    expect(extractUnknownFieldAnchors(buffer, new Map())).toEqual([]);
  });

  // Retired 2026-08-27 (spec §2.6). The old scanner scanned PAST an internal blank row
  // and keyed those rows on the DETAILS header above it — but the detector never saw the
  // block that way, because the exporter SPLITS at the blank row, so the rows below carry
  // the second block's opener as their kind and the "details"-keyed anchor for them could
  // never match anything. The replacement asserts the truth both sides now agree on.
  it("rows after an internal blank row anchor under their OWN block's kind (the exporter splits there, and so does the detector)", async () => {
    const warnings = await anchoredUnknownFields({
      INFO: [
        ["DETAILS", ""],
        ["Stage Size", "40x12"],
        ["", ""],
        ["Stage", "30x10"],
      ],
    });
    // Probed 2026-08-27 against the live exporter + detector: this shape emits exactly
    // `stage:Stage` (the second block's opener IS the row, so its kind is the row's own
    // normalized label), and nothing under `details`.
    const w = warnings.find((x) => x.blockRef?.name === "Stage");
    premiseHolds("the second-block near-miss was flagged", w !== undefined);
    expect(w?.blockRef?.kind).toBe("stage");
    expect(w?.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A4", scope: "cell" });
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
    // Spec 2026-08-27 §2.4: the tab, not a cell - the comment above still holds, because
    // a tab-level anchor is not the "Details Notes" row.
    expect(resolveUnknownFieldCell(anchors, "details", "Details Notes", "some note")).toEqual({
      title: "INFO",
      gid: 0,
      scope: "tab",
    });
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

    // Assert the ANCHOR SET, not the resolution: resolution discriminates nothing here
    // (`Diagrams?` resolves to A5 under the exact recognizer AND under a prefix mutant).
    //
    // Re-aimed 2026-08-27 (spec §2). The scanner no longer carries a venue-header regex of
    // its own - block boundaries come from the exporter and the KIND comes from
    // `anchorNamespace`, so the mutant this case exists to catch now lives in
    // `isVenueBlockOpener`. Broaden that to /^VENUE/i and the `VENUE NOTES` block above
    // (its own block: a blank row separates it) becomes venue-kind too, putting
    // `venue notes` and its value row into the venue anchor set. Under the exact
    // recognizer it is a different kind entirely. That is what this assertion catches.
    //
    // `venue name` IS now a venue anchor and correctly so: the opener row is a row of the
    // block like any other, and anchoring it is what lets a near-miss ON the header row
    // reach its own cell (spec §2.6).
    expect(venue.map((a) => a.label)).not.toContain("venue notes");
    expect(venue.map((a) => a.label)).toContain("venue name");
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

describe("spec 2026-08-27 §2: anchors follow the exporter's blocks, every kind, every tab the exporter includes", () => {
  it("the dispatching show's workbook (ria.xlsx): the three near-miss rows resolve to their own cells", async () => {
    const buffer = fixtureBuffer("fixtures/shows/exporter-xlsx/ria.xlsx");
    const wb = XLSX.read(buffer, { type: "array" });
    const gids = new Map(wb.SheetNames.map((n, i) => [n, i] as const));
    const parsed = parseSheet(synthesizeMarkdownFromXlsx(buffer).markdown, "ria.md");
    await attachWarningAnchors(parsed.warnings, buffer, () => Promise.resolve(gids));

    // Independent read: the cell whose trimmed text EQUALS the label, on the expected tab.
    // Never a hardcoded A1 - a fixture edit moves the expectation with the fixture.
    const cellOf = (tab: string, text: string): string => {
      const ws = wb.Sheets[tab]!;
      const range = XLSX.utils.decode_range(ws["!ref"]!);
      const hits: string[] = [];
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
          if (typeof v === "string" && v.trim() === text)
            hits.push(XLSX.utils.encode_cell({ r, c }));
        }
      }
      premiseHolds(`${tab}!${text} occurs exactly once`, hits.length === 1);
      return hits[0]!;
    };

    const byName = new Map(
      parsed.warnings
        .filter((w) => w.code === "UNKNOWN_FIELD")
        .map((w) => [w.blockRef?.name, w.sourceCell ?? null]),
    );
    premiseHolds(
      "the three RIA near-miss rows are emitted",
      ["Room Diagram", "Backdrop", "Speaker"].every((n) => byName.has(n)),
    );
    // The rows live on FORM and `3rd Level` (spec §1); this workbook has no GEAR tab.
    expect(byName.get("Room Diagram")).toEqual({
      title: "FORM",
      gid: gids.get("FORM"),
      a1: cellOf("FORM", "Room Diagram"),
      scope: "cell",
    });
    expect(byName.get("Backdrop")).toEqual({
      title: "FORM",
      gid: gids.get("FORM"),
      a1: cellOf("FORM", "Backdrop"),
      scope: "cell",
    });
    expect(byName.get("Speaker")).toEqual({
      title: "3rd Level",
      gid: gids.get("3rd Level"),
      a1: cellOf("3rd Level", "Speaker"),
      scope: "cell",
    });
    for (const name of ["Room Diagram", "Backdrop", "Speaker"]) {
      const c = byName.get(name)!;
      expect(buildSheetDeepLink("dfid", c)).toBe(
        `https://docs.google.com/spreadsheets/d/dfid/edit#gid=${c.gid}&range=${c.a1}`,
      );
    }
  });

  it("a Timestamp-opened INFO block and a Console-opened GEAR block both anchor to the row's own label cell", async () => {
    const warnings = await anchoredUnknownFields({
      INFO: [
        ["Timestamp", "6/1/2025"],
        ["Room Diagram", ""],
        ["Backdrop", ""],
      ],
      GEAR: [
        ["Console", "Allen & Heath QU-16"],
        ["Speaker", "QSC KLA"],
      ],
    });
    const byLabel = new Map(warnings.map((w) => [w.blockRef?.name, w.sourceCell ?? null]));
    premiseHolds("the detector flagged all three rows", byLabel.size === 3);
    expect(byLabel.get("Room Diagram")).toEqual({ title: "INFO", gid: 0, a1: "A2", scope: "cell" });
    expect(byLabel.get("Backdrop")).toEqual({ title: "INFO", gid: 0, a1: "A3", scope: "cell" });
    expect(byLabel.get("Speaker")).toEqual({ title: "GEAR", gid: 1, a1: "A2", scope: "cell" });
  });

  it("a block on a tab outside SOURCE_LINK_ALLOWLIST (FORM, the RIA shape) anchors too, scoped, and the link honours it", async () => {
    const warnings = await anchoredUnknownFields({
      INFO: [["CLIENT", "x"]],
      FORM: [
        ["Timestamp", "t"],
        ["Backdrop", ""],
      ],
    });
    const w = warnings.find((x) => x.blockRef?.name === "Backdrop");
    premiseHolds("the FORM row was flagged", w !== undefined);
    expect(w!.sourceCell).toEqual({ title: "FORM", gid: 1, a1: "A2", scope: "cell" });
    expect(buildSheetDeepLink("dfid", w!.sourceCell)).toBe(
      "https://docs.google.com/spreadsheets/d/dfid/edit#gid=1&range=A2",
    );
  });

  it("a used range that starts at B2 anchors to the real coordinate, not the grid-relative one", async () => {
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.sheet_add_aoa(
      ws,
      [
        ["Timestamp", "t"],
        ["Backdrop", ""],
      ],
      { origin: "B2" },
    );
    ws["!ref"] = "B2:C3";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INFO");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const buffer =
      out instanceof Uint8Array
        ? (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer)
        : (out as ArrayBuffer);
    // All seven corpus sheets start at A1, so a coordinate path that drops range.s.r /
    // range.s.c fails HERE and nowhere else.
    premiseHolds(
      "the sheet's used range starts at B2",
      XLSX.read(buffer, { type: "array" }).Sheets.INFO!["!ref"] === "B2:C3",
    );
    const parsed = parseSheet(synthesizeMarkdownFromXlsx(buffer).markdown, "probe.md");
    await attachWarningAnchors(parsed.warnings, buffer, () =>
      Promise.resolve(new Map([["INFO", 0]])),
    );
    const w = parsed.warnings.find(
      (x) => x.code === "UNKNOWN_FIELD" && x.blockRef?.name === "Backdrop",
    );
    premiseHolds("the row was flagged", w !== undefined);
    expect(w!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "B3", scope: "cell" });
  });

  it("duplicate (kind,label,value) on one tab → the tab, not either cell; the same kind on two tabs → null", async () => {
    const dup = await anchoredUnknownFields({
      INFO: [
        ["Timestamp", "t"],
        ["Backdrop", ""],
        ["Backdrop", ""],
      ],
    });
    premiseHolds(
      "both duplicates flagged",
      dup.filter((w) => w.blockRef?.name === "Backdrop").length === 2,
    );
    for (const w of dup) expect(w.sourceCell).toEqual({ title: "INFO", gid: 0, scope: "tab" });

    const split = await anchoredUnknownFields({
      INFO: [
        ["Timestamp", "t"],
        ["Backdrop", ""],
      ],
      GEAR: [
        ["Timestamp", "t"],
        ["Backdrop", ""],
      ],
    });
    premiseHolds("both tabs flagged their row", split.length === 2);
    for (const w of split) expect(w.sourceCell ?? null).toBeNull();
  });

  it("the synthesized PULL SHEET title row never anchors (absRow null)", () => {
    const { buffer, gids } = buildWorkbook({
      "PULL SHEET": [
        ["Show Title", ""],
        ["", ""],
        ["1", "Cable", "x"],
        ["2", "Stand", "y"],
      ],
    });
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    premiseHolds("the tab produced anchors at all", anchors.length > 0);
    expect(anchors.every((a) => a.label !== "show title")).toBe(true);
  });
});
