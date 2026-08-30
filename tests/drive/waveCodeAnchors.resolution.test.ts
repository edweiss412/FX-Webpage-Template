// Spec docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md §5 T3.
//
// The dispatching workbook, end to end: synthesize -> parse -> attachWarningAnchors. The
// expected coordinates come from an INDEPENDENT raw scan of the workbook, never from a
// hardcoded list and never from the resolver under test.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { extractWaveCodeSites, WAVE_CODES } from "@/lib/drive/waveCodeAnchors";
import { parseSheet } from "@/lib/parser";
import { buildSheetDeepLink, SOURCE_LINK_ALLOWLIST } from "@/lib/sheet-links/buildSheetDeepLink";
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
import { premise, premiseHolds } from "@/tests/_shared/premise";

/** Copied from tests/drive/waveCodeAnchors.test.ts (module-local there, not exported). */
function fixtureBuffer(relative: string): ArrayBuffer {
  const b = readFileSync(join(process.cwd(), relative));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Copied from tests/drive/waveCodeAnchors.test.ts: gid per tab = its index in SheetNames. */
function gidsFor(buffer: ArrayBuffer): Map<string, number> {
  return new Map(
    XLSX.read(buffer, { type: "array" }).SheetNames.map((name, i) => [name, i] as const),
  );
}

/** Copied from tests/drive/waveCodeAnchors.test.ts: every cell containing #REF!, in workbook order. */
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

/** Copied from tests/drive/waveCodeAnchors.test.ts: fan a merged top-left cell across its columns. */
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

async function anchored(relative: string) {
  const buffer = fixtureBuffer(relative);
  const gids = gidsFor(buffer);
  const { markdown } = synthesizeMarkdownFromXlsx(buffer);
  const warnings = parseSheet(markdown, relative).warnings;
  await attachWarningAnchors(warnings, buffer, () => Promise.resolve(gids));
  return { buffer, gids, warnings };
}

describe("T3 the dispatching workbook, through attachWarningAnchors (spec §5 T3, AC-1)", () => {
  it("fintech.xlsx: five REF warnings resolve, in order, to the five #REF! cells an independent scan finds", async () => {
    const { buffer, warnings } = await anchored("fixtures/shows/exporter-xlsx/fintech.xlsx");
    const refs = warnings.filter((w) => w.code === "REF_ERROR_LITERAL");
    const expected = rawRefCells(buffer);
    premiseHolds("five raw #REF! cells (spec §1 table)", expected.length === 5);
    expect(refs.map((w) => `${w.sourceCell?.title}!${w.sourceCell?.a1}`)).toEqual(expected);
    for (const w of refs) {
      expect(w.sourceCell?.scope).toBe("cell");
      // The five tabs are NOT allowlisted; a scoped cell anchor bypasses the allowlist by
      // design (spec §1.1, ratified 2026-08-27 §2.5).
      expect(SOURCE_LINK_ALLOWLIST as readonly string[]).not.toContain(w.sourceCell!.title);
      expect(buildSheetDeepLink("DF", w.sourceCell)).toBe(
        `https://docs.google.com/spreadsheets/d/DF/edit#gid=${w.sourceCell!.gid}&range=${w.sourceCell!.a1}`,
      );
    }
  });

  it("consultants.xlsx: six REF warnings, AGENDA rows 3 and 4, columns A through C (merge fan-out, spec §1.1)", async () => {
    const { buffer, warnings } = await anchored("fixtures/shows/exporter-xlsx/consultants.xlsx");
    const refs = warnings.filter((w) => w.code === "REF_ERROR_LITERAL");
    const raw = rawRefCells(buffer);
    const expected = expandMerged(buffer, raw);
    premiseHolds(
      "two raw #REF! cells, each merged three wide (spec §1 table)",
      raw.length === 2 && expected.length === 6,
    );
    // The derived list and the spec §1 table must agree, or one of the two is stale.
    expect(expected).toEqual([
      "AGENDA!A3",
      "AGENDA!B3",
      "AGENDA!C3",
      "AGENDA!A4",
      "AGENDA!B4",
      "AGENDA!C4",
    ]);
    expect(refs.map((w) => `${w.sourceCell?.title}!${w.sourceCell?.a1}`)).toEqual(expected);
    for (const w of refs) expect(w.sourceCell?.scope).toBe("cell");
  });

  it("east-coast.xlsx: no wave warnings, no sites", () => {
    const buffer = fixtureBuffer("fixtures/shows/exporter-xlsx/east-coast.xlsx");
    const { markdown } = synthesizeMarkdownFromXlsx(buffer);
    const warnings = parseSheet(markdown, "east-coast.xlsx").warnings;
    premise(
      "east-coast parses with some warnings, so an empty wave filter is a selection, not an empty parse",
      warnings.length,
      0,
    );
    expect(warnings.filter((w) => (WAVE_CODES as readonly string[]).includes(w.code))).toEqual([]);
    expect(extractWaveCodeSites(buffer, gidsFor(buffer))).toEqual([]);
  });
});
