// Spec docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md §5 (T1, T4).
//
// The three wave codes carry no positional ordinal, so the cell a warning came from is
// recovered by REPLAYING the same detectors over the exporter's own block list and pairing
// the i-th warning with the i-th replay hit. This suite decides two things: that the replay
// sees exactly what the parse saw (T1, over the corpus and over constructed variants one
// ordinary edit away from it), and that the guards refuse rather than mis-pair (T4).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { normalizeCellKey } from "@/lib/drive/unknownFieldAnchors";
import {
  extractWaveCodeSites,
  ownerOfFragment,
  pairWaveCodeSites,
  WAVE_CODES,
  type SynthOpts,
  type WaveCodeSite,
} from "@/lib/drive/waveCodeAnchors";
import { parseSheet } from "@/lib/parser";
import { canonicalSectionKind } from "@/lib/parser/sectionKind";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { buildXlsx } from "../helpers/buildXlsx";

const DIR = join(process.cwd(), "fixtures/shows/exporter-xlsx");

/** Read a committed workbook as a standalone ArrayBuffer. Copied from
 *  tests/drive/unknownFieldAnchors.test.ts:57-60: `readFileSync(...).buffer` is a POOLED
 *  allocation for small files and would carry a byteOffset, so slice it. */
function fixtureBuffer(relative: string): ArrayBuffer {
  const b = readFileSync(join(process.cwd(), relative));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Multi-tab workbook plus the gid map the real ingestion path would resolve. Copied from
 *  tests/drive/unknownFieldAnchors.test.ts:31-55 (module-local there, not exported). */
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

/** Independent raw scan: every cell whose text contains #REF!, as `TAB!A1`, in workbook order. */
function rawRefCells(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    const sh = wb.Sheets[name]!;
    const ref = sh["!ref"];
    if (!ref) continue;
    const r = XLSX.utils.decode_range(ref);
    for (let R = r.s.r; R <= r.e.r; R++) {
      for (let C = r.s.c; C <= r.e.c; C++) {
        const c = sh[XLSX.utils.encode_cell({ r: R, c: C })] as XLSX.CellObject | undefined;
        const t = c ? String(c.w ?? c.v ?? "") : "";
        if (t.includes("#REF!")) out.push(`${name}!${XLSX.utils.encode_cell({ r: R, c: C })}`);
      }
    }
  }
  return out;
}

/** gid per tab = its index in SheetNames, the convention `buildWorkbook` and
 *  `attachWarningAnchors`'s resolver share in these suites. */
function gidsFor(buffer: ArrayBuffer): Map<string, number> {
  return new Map(
    XLSX.read(buffer, { type: "array" }).SheetNames.map((name, i) => [name, i] as const),
  );
}

/** Edit one cell of a committed workbook and re-serialize (one ordinary edit away from the corpus). */
function editCell(buffer: ArrayBuffer, tab: string, a1: string, text: string): ArrayBuffer {
  const wb = XLSX.read(buffer, { type: "array" });
  const sh = wb.Sheets[tab];
  if (!sh) throw new Error(`no tab ${tab}`);
  sh[a1] = { t: "s", v: text };
  const at = XLSX.utils.decode_cell(a1);
  const r = XLSX.utils.decode_range(sh["!ref"] ?? a1);
  r.s.r = Math.min(r.s.r, at.r);
  r.s.c = Math.min(r.s.c, at.c);
  r.e.r = Math.max(r.e.r, at.r);
  r.e.c = Math.max(r.e.c, at.c);
  sh["!ref"] = XLSX.utils.encode_range(r);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out instanceof Uint8Array
    ? (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer)
    : (out as ArrayBuffer);
}

/** The raw text of one cell, for premises about the state BEFORE an edit. */
function cellText(buffer: ArrayBuffer, tab: string, a1: string): string {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const c = wb.Sheets[tab]?.[a1] as XLSX.CellObject | undefined;
  return c ? String(c.w ?? c.v ?? "") : "";
}

/** The (row, col) of the first row whose FIRST NON-BLANK cell opens a section of `kind`.
 *  Derived from the workbook through the parser's own resolver, never hardcoded. */
function sectionHeaderCell(
  buffer: ArrayBuffer,
  tab: string,
  kind: string,
): { r: number; c: number } {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const sh = wb.Sheets[tab]!;
  const range = XLSX.utils.decode_range(sh["!ref"]!);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sh[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      const text = cell ? String(cell.w ?? cell.v ?? "") : "";
      if (text.trim() === "") continue;
      if (canonicalSectionKind(text) === kind) return { r, c };
      break; // first non-blank cell of the row only: a section opener is a row's lead cell
    }
  }
  throw new Error(`no ${kind} section header in ${tab}`);
}

/** Fan a merged top-left cell out across its merge's columns on the top row, as the
 *  exporter's `expandMerges` does. */
function expandMerged(buffer: ArrayBuffer, cells: string[]): string[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return cells.flatMap((ref) => {
    const [tab, a1] = ref.split("!") as [string, string];
    const at = XLSX.utils.decode_cell(a1);
    const m = (wb.Sheets[tab]?.["!merges"] ?? []).find((mr) => mr.s.r === at.r && mr.s.c === at.c);
    if (!m) return [ref];
    const out: string[] = [];
    for (let c = m.s.c; c <= m.e.c; c++)
      out.push(`${tab}!${XLSX.utils.encode_cell({ r: at.r, c })}`);
    return out;
  });
}

function parseAndSites(buffer: ArrayBuffer, gids: Map<string, number>, opts?: SynthOpts) {
  const { markdown } = synthesizeMarkdownFromXlsx(buffer, opts);
  const warnings = parseSheet(markdown, "probe.xlsx").warnings;
  const sites = extractWaveCodeSites(buffer, gids, opts);
  return { warnings, sites };
}

const triple = (w: ParseWarning) => [
  w.code,
  w.blockRef?.kind ?? null,
  normalizeCellKey(w.rawSnippet ?? ""),
];
const siteTriple = (s: WaveCodeSite) => [s.code, s.kind, normalizeCellKey(s.snippet ?? "")];
const at = (s: WaveCodeSite | undefined) => `${s?.anchor?.title}!${s?.anchor?.a1}`;

const corpusFiles = readdirSync(DIR)
  .filter((f) => f.endsWith(".xlsx"))
  .sort();

describe("T1 corpus: the replay sees exactly what the parse saw (spec §5 T1)", () => {
  for (const f of corpusFiles) {
    it(f, () => {
      const buffer = fixtureBuffer(join("fixtures/shows/exporter-xlsx", f));
      const { warnings, sites } = parseAndSites(buffer, gidsFor(buffer));
      const parsed = warnings.filter((w) => (WAVE_CODES as readonly string[]).includes(w.code));
      expect(sites.map(siteTriple)).toEqual(parsed.map(triple));
      for (const code of WAVE_CODES) {
        const paired = pairWaveCodeSites(warnings, sites, code);
        expect(paired).toHaveLength(warnings.filter((w) => w.code === code).length);
        if (code === "REF_ERROR_LITERAL") expect(paired.every((a) => a !== null)).toBe(true);
      }
    });
  }

  it("premise: the corpus yields REF sites and no FUSED / LEADING sites (both exporter-unreachable, spec §8); a corpus change that starts emitting either is noticed here", () => {
    let ref = 0;
    let fused = 0;
    let leading = 0;
    for (const f of corpusFiles) {
      const buffer = fixtureBuffer(join("fixtures/shows/exporter-xlsx", f));
      for (const s of extractWaveCodeSites(buffer, gidsFor(buffer))) {
        if (s.code === "REF_ERROR_LITERAL") ref += 1;
        if (s.code === "ROW_CELLS_FUSED") fused += 1;
        if (s.code === "LEADING_COLUMN_AUTOCORRECTED") leading += 1;
      }
    }
    premise("corpus REF sites", ref, 0);
    premiseHolds("corpus has no FUSED / LEADING sites (spec §1, §8)", fused === 0 && leading === 0);
  });
});

describe("T1 variants, each one ordinary edit from the corpus (spec §5 T1 (a)-(f))", () => {
  const EAST = "fixtures/shows/exporter-xlsx/east-coast.xlsx";

  /** The cell directly below the INFO tab's crew section header: a data cell of a known
   *  section, located through the parser's own `canonicalSectionKind`. */
  function crewDataCell(buffer: ArrayBuffer): string {
    const header = sectionHeaderCell(buffer, "INFO", "crew");
    return XLSX.utils.encode_cell({ r: header.r + 1, c: header.c });
  }

  it("(a) a #REF! written into a data cell of a known section anchors to that cell", () => {
    const clean = fixtureBuffer(EAST);
    premiseHolds("east-coast is #REF-free before the edit", rawRefCells(clean).length === 0);
    const target = crewDataCell(clean);
    premiseHolds(
      `${target} held ordinary text before the edit`,
      !cellText(clean, "INFO", target).includes("#REF!"),
    );

    const buffer = editCell(clean, "INFO", target, "#REF!");
    const { warnings, sites } = parseAndSites(buffer, gidsFor(buffer));
    const refs = sites.filter((s) => s.code === "REF_ERROR_LITERAL");
    premise("the edit produced a REF site", refs.length, 0);
    expect(refs.map(at)).toEqual([`INFO!${target}`]);
    expect(refs[0]!.anchor?.scope).toBe("cell");
    expect(pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL").map((a) => a?.a1)).toEqual([
      target,
    ]);
  });

  it("(b) a literal pipe in an earlier cell of the same row does not move the anchor", () => {
    const clean = fixtureBuffer(EAST);
    const target = crewDataCell(clean);
    const lead = XLSX.utils.encode_cell({
      r: XLSX.utils.decode_cell(target).r,
      c: XLSX.utils.decode_cell(target).c - 1,
    });
    // The fracture must sit BEFORE the #REF! cell in the same row: `escapeCell` writes the
    // pipe as `\|` and `splitRow` splits on it anyway, so every fragment after it shifts.
    const buffer = editCell(editCell(clean, "INFO", target, "#REF!"), "INFO", lead, "a|b");
    const { warnings, sites } = parseAndSites(buffer, gidsFor(buffer));
    const refs = sites.filter((s) => s.code === "REF_ERROR_LITERAL");
    premise("the edit produced a REF site", refs.length, 0);
    expect(refs.map(at)).toEqual([`INFO!${target}`]);
    expect(pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL").map((a) => a?.a1)).toEqual([
      target,
    ]);
  });

  it("(b) ownerOfFragment refuses an out-of-range index and a row whose counts cannot reconcile", () => {
    // "a|b" costs two fragments, "#REF!" one: three in a two-cell row, so index 3 is past
    // the end and index 2 is the last cell.
    expect(ownerOfFragment(["a|b", "#REF!"], 2, 2)).toBe(1);
    expect(ownerOfFragment(["a|b", "#REF!"], 2, 5)).toBeNull();
    // width below the cell count: the whole-row render drops cells, so the per-cell counts
    // cannot sum to it and every hit on the row is refused.
    expect(ownerOfFragment(["a|b", "#REF!"], 1, 0)).toBeNull();
  });

  it("(c) a merged #REF! fans out to one site per column of the merge, each its own column", () => {
    const buffer = fixtureBuffer("fixtures/shows/exporter-xlsx/consultants.xlsx");
    const raw = rawRefCells(buffer);
    const expected = expandMerged(buffer, raw);
    premiseHolds(
      "two raw #REF! cells, each merged three wide (spec §1 table)",
      raw.length === 2 && expected.length === 6,
    );
    const { sites } = parseAndSites(buffer, gidsFor(buffer));
    expect(sites.filter((s) => s.code === "REF_ERROR_LITERAL").map(at)).toEqual(expected);
  });

  it("(c) a merged cell whose value fractures on a pipe still maps each warning to its own column", () => {
    const clean = fixtureBuffer("fixtures/shows/exporter-xlsx/consultants.xlsx");
    const origin = rawRefCells(clean)[0]!.split("!")[1]!;
    const buffer = editCell(clean, "AGENDA", origin, "prefix | #REF!");
    const { warnings, sites } = parseAndSites(buffer, gidsFor(buffer));
    const refs = sites.filter((s) => s.code === "REF_ERROR_LITERAL");
    // The merge copies the fractured value across its three columns, so the first three
    // sites are that merge's three columns. The naive fragment-as-column map sent the
    // first of them to the SECOND column, whose merge copy also contains #REF!.
    const merge = expandMerged(clean, [`AGENDA!${origin}`]);
    premiseHolds("the edited cell is merged three wide", merge.length === 3);
    expect(refs.slice(0, 3).map(at)).toEqual(merge);
    expect(
      pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL")
        .slice(0, 3)
        .map((a) => a?.a1),
    ).toEqual(merge.map((m) => m.split("!")[1]));
  });

  it("(c) a hand-built row `a|b`, `#REF!`, `#REF!` maps its two warnings to columns B and C", () => {
    const { buffer, gids } = buildWorkbook({ INFO: [["a|b", "#REF!", "#REF!"]] });
    const { warnings, sites } = parseAndSites(buffer, gids);
    expect(sites.filter((s) => s.code === "REF_ERROR_LITERAL").map(at)).toEqual([
      "INFO!B1",
      "INFO!C1",
    ]);
    expect(pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL").map((a) => a?.a1)).toEqual([
      "B1",
      "C1",
    ]);
  });

  it("(d) a used range starting at B2 anchors at the true coordinate, not an A1-relative one", () => {
    const rows = [
      ["CREW", "NAME", "ROLE"],
      ["Alice", "#REF!", "x"],
      ["Bob", "y", "z"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.sheet_add_aoa(ws, rows, { origin: "B2" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "INFO");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const buffer =
      out instanceof Uint8Array
        ? (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer)
        : (out as ArrayBuffer);
    // rows[1][1] sits one row and one column past the B2 origin, so its true coordinate is C3.
    expect(rawRefCells(buffer)).toEqual(["INFO!C3"]);
    const { warnings, sites } = parseAndSites(buffer, new Map([["INFO", 0]]));
    expect(sites.filter((s) => s.code === "REF_ERROR_LITERAL").map(at)).toEqual(["INFO!C3"]);
    expect(pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL").map((a) => a?.a1)).toEqual([
      "C3",
    ]);
  });

  // Verbatim copy of `regionA` from tests/drive/synthesizeBlocks.test.ts:13-19, with #REF!
  // written into one item cell: those five rows are what makes an OLD tab collectable.
  const oldRegion: string[][] = [
    ["PULL SHEET", "PULL SHEET"],
    ["RIA - CHICAGO, IL"],
    [],
    ["QTY", "ITEM"],
    ["2", "#REF!"],
  ];

  function oldTabWorkbook(): ArrayBuffer {
    return buildXlsx([
      {
        name: "INFO",
        grid: [
          ["CREW", "NAME"],
          ["Alice", "#REF!"],
          ["Bob", "x"],
        ],
      },
      { name: "OLD PULL SHEET", grid: oldRegion },
    ]);
  }

  it("(e) an opaque OLD-tab hit is a null-anchor site that keeps the grid hits paired", () => {
    const buffer = oldTabWorkbook();
    const opts: SynthOpts = { includePullSheetFromTab: "OLD PULL SHEET" };
    const { warnings, sites } = parseAndSites(buffer, gidsFor(buffer), opts);
    const refs = sites.filter((s) => s.code === "REF_ERROR_LITERAL");
    premiseHolds("both the grid hit and the opaque hit are present", refs.length === 2);
    // The OLD tab is appended after INFO, so the opaque hit is second.
    expect(refs.map((s) => s.anchor === null)).toEqual([false, true]);
    expect(
      pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL").map((a) => a?.a1 ?? null),
    ).toEqual(["B2", null]);
  });

  it("(e) a replay run without the option the parse used refuses rather than mis-pairs", () => {
    const buffer = oldTabWorkbook();
    const { markdown } = synthesizeMarkdownFromXlsx(buffer, {
      includePullSheetFromTab: "OLD PULL SHEET",
    });
    const warnings = parseSheet(markdown, "probe.xlsx").warnings;
    const sites = extractWaveCodeSites(buffer, gidsFor(buffer)); // no option: one site, two warnings
    premiseHolds(
      "the mismatch is a count mismatch",
      warnings.filter((w) => w.code === "REF_ERROR_LITERAL").length === 2 &&
        sites.filter((s) => s.code === "REF_ERROR_LITERAL").length === 1,
    );
    expect(pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL")).toEqual([null, null]);
  });

  it("(f) the Step 2.5 seam makes the two sides disagree on kind, and REF pairing still yields the cell", () => {
    // "Shuttle" is deliberately NOT a section-opening label: were it one, the replay would
    // resolve the same kind as the parse and the case would assert nothing.
    premiseHolds(
      "the data row's lead cell opens no section",
      canonicalSectionKind("Shuttle") === null,
    );
    const { buffer, gids } = buildWorkbook({
      INFO: [
        ["TRANSPORTATON", "", ""],
        ["Shuttle", "#REF!", ""],
        ["Van", "v", ""],
      ],
    });
    const { warnings, sites } = parseAndSites(buffer, gids);
    premiseHolds(
      "Step 2.5 corrected the header, so the parse side sees the corrected kind",
      warnings.filter((w) => w.code === "SECTION_HEADER_AUTOCORRECTED").length === 1,
    );
    const parsedRef = warnings.find((w) => w.code === "REF_ERROR_LITERAL")!;
    const siteRef = sites.find((s) => s.code === "REF_ERROR_LITERAL")!;
    expect(parsedRef.blockRef?.kind).toBe("transportation");
    expect(siteRef.kind).toBe("section");
    // Snippet, never kind: that is what lets REF pairing survive a seam the replay cannot see.
    expect(pairWaveCodeSites(warnings, sites, "REF_ERROR_LITERAL").map((a) => a?.a1)).toEqual([
      "B2",
    ]);
  });
});

describe("T4 the guards refuse, never mis-pair (spec §5 T4)", () => {
  const cell = (a1: string): SourceAnchor => ({ title: "VENUE", gid: 5, a1, scope: "cell" });
  const warn = (code: string, kind: string, snippet: string | null): ParseWarning =>
    ({
      severity: "warn",
      code,
      message: "m",
      blockRef: { kind },
      ...(snippet === null ? {} : { rawSnippet: snippet }),
    }) as ParseWarning;
  const site = (
    code: (typeof WAVE_CODES)[number],
    kind: string,
    snippet: string | null,
    anchor: SourceAnchor | null,
  ): WaveCodeSite => ({ code, kind, snippet, anchor, hiddenTab: false });

  const refSites = [
    site("REF_ERROR_LITERAL", "section", "\\#REF\\!", cell("A1")),
    site("REF_ERROR_LITERAL", "section", "\\#REF\\!", cell("B7")),
  ];
  const refWarn = () => warn("REF_ERROR_LITERAL", "section", "\\#REF\\!");

  it("more warnings than sites: every entry is null", () => {
    const w = [refWarn(), refWarn(), refWarn()];
    expect(pairWaveCodeSites(w, refSites, "REF_ERROR_LITERAL")).toEqual([null, null, null]);
  });

  it("fewer warnings than sites: every entry is null", () => {
    expect(pairWaveCodeSites([refWarn()], refSites, "REF_ERROR_LITERAL")).toEqual([null]);
  });

  it("a snippet disagreement anywhere refuses the whole sequence", () => {
    const w = [refWarn(), warn("REF_ERROR_LITERAL", "section", "\\#VALUE\\!")];
    expect(pairWaveCodeSites(w, refSites, "REF_ERROR_LITERAL")).toEqual([null, null]);
  });

  it("a LEADING kind disagreement anywhere refuses the whole sequence", () => {
    const w = [
      warn("LEADING_COLUMN_AUTOCORRECTED", "crew", null),
      warn("LEADING_COLUMN_AUTOCORRECTED", "venue", null),
    ];
    const s = [
      site("LEADING_COLUMN_AUTOCORRECTED", "crew", null, cell("A1")),
      site("LEADING_COLUMN_AUTOCORRECTED", "agenda", null, cell("B7")),
    ];
    expect(pairWaveCodeSites(w, s, "LEADING_COLUMN_AUTOCORRECTED")).toEqual([null, null]);
  });

  it("LEADING pairs on kind alone, and FUSED on normalized snippet: the two codes no exporter workbook reaches", () => {
    const lw = [
      warn("LEADING_COLUMN_AUTOCORRECTED", "crew", null),
      warn("LEADING_COLUMN_AUTOCORRECTED", "venue", null),
    ];
    const ls = [
      site("LEADING_COLUMN_AUTOCORRECTED", "crew", null, cell("A1")),
      site("LEADING_COLUMN_AUTOCORRECTED", "venue", null, cell("B7")),
    ];
    expect(pairWaveCodeSites(lw, ls, "LEADING_COLUMN_AUTOCORRECTED")).toEqual([
      cell("A1"),
      cell("B7"),
    ]);

    const fw = [
      warn("ROW_CELLS_FUSED", "crew", "| a | b |"),
      warn("ROW_CELLS_FUSED", "crew", "| c | d |"),
    ];
    const fs = [
      // normalizeCellKey collapses whitespace and lowercases, so these agree with the
      // warnings above without being byte-identical to them.
      site("ROW_CELLS_FUSED", "crew", "|  A  | B |", cell("C3")),
      site("ROW_CELLS_FUSED", "crew", "| C | D |", cell("D4")),
    ];
    expect(pairWaveCodeSites(fw, fs, "ROW_CELLS_FUSED")).toEqual([cell("C3"), cell("D4")]);
  });

  it("a null-anchor placeholder holds its place so the later hit still pairs", () => {
    const s = [
      site("REF_ERROR_LITERAL", "section", "\\#REF\\!", null),
      site("REF_ERROR_LITERAL", "section", "\\#REF\\!", cell("B7")),
    ];
    expect(pairWaveCodeSites([refWarn(), refWarn()], s, "REF_ERROR_LITERAL")).toEqual([
      null,
      cell("B7"),
    ]);
  });
});
