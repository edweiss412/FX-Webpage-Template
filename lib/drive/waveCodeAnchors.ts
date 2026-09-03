// lib/drive/waveCodeAnchors.ts
// Spec docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md §2.
//
// The three wave codes (`REF_ERROR_LITERAL`, `ROW_CELLS_FUSED`,
// `LEADING_COLUMN_AUTOCORRECTED`) are byte-identical to their siblings: `blockRef` carries a
// kind and no index, `rawSnippet` is the same escaped literal on every instance. A key join
// in the style of `resolveUnknownFieldCell` therefore finds five matches on five tabs and
// returns null, and the information that separates them -- their POSITION -- is what the
// detectors deliberately do not emit (a document ordinal in the signal channel scored 603
// harness rows as SILENT_SIGNAL_LOSS).
//
// So the position is recovered rather than transmitted: run the SAME detectors over the SAME
// blocks in the SAME order at anchor time, pair the i-th warning of a code with the i-th
// replay hit, and refuse the whole sequence the moment count or content disagree. The
// ordinal lives here, after `parseSheet` has returned, where the parser mutation oracle
// never looks.
import * as XLSX from "xlsx";

import {
  blockMarkdown,
  renderRow,
  synthesizeBlocksFromXlsx,
  type GridBlock,
} from "@/lib/drive/exportSheetToMarkdown";
import { normalizeCellKey } from "@/lib/drive/unknownFieldAnchors";
import { clean, splitRow } from "@/lib/parser/blocks/_helpers";
import { normalizeLeadingColumn } from "@/lib/parser/leadingColumnNormalize";
import { scanRefErrorLiterals } from "@/lib/parser/refErrorDetector";
import { GENERIC_SECTION_KIND } from "@/lib/parser/sectionKind";
import { scanFusedRows } from "@/lib/parser/rowWidthDiscriminator";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

export const WAVE_CODES = [
  "REF_ERROR_LITERAL",
  "ROW_CELLS_FUSED",
  "LEADING_COLUMN_AUTOCORRECTED",
] as const;
export type WaveCode = (typeof WAVE_CODES)[number];

/** One replay hit, in document order. `anchor` is null when the hit has no source cell:
 *  a synthesized pull-sheet title row, a tab with no gid, or an opaque OLD-tab region.
 *  A null-anchor site is KEPT so later hits still pair against their own warnings. */
export type WaveCodeSite = {
  code: WaveCode;
  kind: string;
  snippet: string | null;
  anchor: SourceAnchor | null;
  /** The owning tab's OOXML visibility (`GridBlock.sheetHidden`); false for an opaque block.
   *  Carried on every site so a consumer can pair it positionally like the anchor. */
  hiddenTab: boolean;
};

export type SynthOpts = { includePullSheetFromTab?: string };

/** One array per code, each entry aligned with that code's warnings in array order. */
export type WavePairedAnchors = Partial<Record<WaveCode, (SourceAnchor | null)[]>>;

const REF_LITERAL = "#REF!";

/** `blockMarkdown` line k -> block row: 0 -> 0, 1 -> the delimiter row (never a hit),
 *  k >= 2 -> k - 1. */
function rowOfLine(line: number): number | null {
  if (line === 1) return null;
  return line === 0 ? 0 : line - 1;
}

/**
 * Fragment index -> owning exporter cell.
 *
 * The scanners report an index into `splitRow(line)`, which is a FRAGMENT index and not a
 * column: `escapeCell` writes a literal pipe as `\|` and `splitRow` splits on every pipe
 * regardless, so one exporter cell holding a pipe becomes two or more fragments and every
 * fragment after it shifts. The map is therefore derived from the exporter's OWN cells
 * through the SAME pair of functions the markdown path uses -- cell j contributes
 * `splitRow(renderRow([cells[j]], 1)).length` fragments, and padding cells one each.
 *
 * Null when the index is out of range, when it lands on a padding cell, or when the
 * per-cell counts do not sum to the whole padded row's fragment count (an escape
 * interaction nobody has constructed; spec §8 documents the limit).
 */
export function ownerOfFragment(
  cells: readonly string[],
  width: number,
  fragment: number,
): number | null {
  const counts: number[] = [];
  for (let j = 0; j < Math.max(width, cells.length); j++) {
    counts.push(j < cells.length ? splitRow(renderRow([cells[j]!], 1)).length : 1);
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== splitRow(renderRow(cells, width)).length) return null;
  let acc = 0;
  for (let j = 0; j < counts.length; j++) {
    acc += counts[j]!;
    if (fragment < acc) return j < cells.length ? j : null;
  }
  return null;
}

function cellAnchor(block: GridBlock, gid: number, row: number, col: number): SourceAnchor | null {
  const src = block.rows[row];
  // A synthesized pull-sheet title row has no absolute row, so it has no coordinate.
  if (!src || src.absRow === null) return null;
  return {
    title: block.sheetName,
    gid,
    a1: XLSX.utils.encode_cell({ r: src.absRow, c: block.absCol0 + col }),
    scope: "cell",
  };
}

/**
 * Every wave-code hit the exporter's blocks yield, in the order the detectors emit them
 * per code. Rendering each block through `blockMarkdown` is what makes the text a scanner
 * sees here byte for byte the text it sees inside the joined document (spec §2.2).
 */
export function extractWaveCodeSites(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
  synthOpts?: SynthOpts,
): WaveCodeSite[] {
  const out: WaveCodeSite[] = [];
  const { blocks } = synthesizeBlocksFromXlsx(buffer, synthOpts);
  for (const block of blocks) {
    const md = blockMarkdown(block);
    const grid = block.kind === "grid" ? block : null;
    const gid = grid ? titleToGid.get(grid.sheetName) : undefined;
    const hiddenTab = grid?.sheetHidden ?? false;
    const anchorAt = (line: number, col: number | null): SourceAnchor | null => {
      if (!grid || typeof gid !== "number" || col === null) return null;
      const row = rowOfLine(line);
      return row === null ? null : cellAnchor(grid, gid, row, col);
    };
    const width = grid ? grid.rows.reduce((m, r) => Math.max(m, r.cells.length), 0) : 0;

    for (const h of scanRefErrorLiterals(md)) {
      // The scanner's cell index is a FRAGMENT index (spec §2.1): map it back to the owning
      // exporter cell, then keep the raw-cell check as a second guard. A containment check
      // ALONE passed a wrong column on a merged `prefix | #REF!` three columns wide, whose
      // merge copies all contain the literal.
      const row = rowOfLine(h.line);
      const cells = grid && row !== null ? (grid.rows[row]?.cells ?? null) : null;
      const owner = cells ? ownerOfFragment(cells, width, h.cell) : null;
      const ok = owner !== null && clean(cells![owner] ?? "").includes(REF_LITERAL);
      out.push({
        code: "REF_ERROR_LITERAL",
        kind: h.kind,
        snippet: h.snippet,
        anchor: ok ? anchorAt(h.line, owner) : null,
        hiddenTab,
      });
    }

    for (const h of scanFusedRows(md)) {
      // The defect is the ROW's width, not one cell, so the link lands on the row at its
      // first content cell.
      const row = rowOfLine(h.line);
      const cells = grid && row !== null ? (grid.rows[row]?.cells ?? []) : [];
      const first = cells.findIndex((c) => clean(c) !== "");
      out.push({
        code: "ROW_CELLS_FUSED",
        kind: h.kind,
        snippet: h.snippet,
        anchor: anchorAt(h.line, first >= 0 ? first : null),
        hiddenTab,
      });
    }

    for (const s of normalizeLeadingColumn(md).shifted) {
      // The section's FIRST row at the block's own first column: the uniformly empty cell
      // the operator deletes.
      out.push({
        code: "LEADING_COLUMN_AUTOCORRECTED",
        kind: s.kind,
        snippet: null,
        anchor: anchorAt(s.from, 0),
        hiddenTab,
      });
    }
  }
  return out;
}

/**
 * The i-th warning of `code` paired with the i-th replay hit of `code`, or every entry null.
 *
 * Refusal is per code and WHOLE: one disagreement anywhere in the sequence means the
 * sequence cannot be trusted, and a half-trusted sequence is exactly how a wrong-cell link
 * gets made. The failure mode of every guard is a link-less row, which is the row's state
 * today (spec §2.4).
 */
export function pairWaveCodeSites(
  warnings: readonly ParseWarning[],
  sites: readonly WaveCodeSite[],
  code: WaveCode,
): (SourceAnchor | null)[] {
  return pairWaveCodeHits(warnings, sites, code).map((hit) => hit?.anchor ?? null);
}

/** The pairing itself: the i-th warning of `code` with the i-th replay SITE, so a consumer
 *  can read any field the site carries (anchor, hiddenTab) under one refusal rule. */
export function pairWaveCodeHits(
  warnings: readonly ParseWarning[],
  sites: readonly WaveCodeSite[],
  code: WaveCode,
): (WaveCodeSite | null)[] {
  const parsed = warnings.filter((w) => w.code === code);
  const replayed = sites.filter((s) => s.code === code);
  const refuse = parsed.map(() => null);
  if (parsed.length !== replayed.length) return refuse;
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]!;
    const r = replayed[i]!;
    if (code === "LEADING_COLUMN_AUTOCORRECTED") {
      // No rawSnippet on this code, so kind is the only content it carries.
      if ((p.blockRef?.kind ?? null) !== r.kind) return refuse;
    } else if (normalizeCellKey(p.rawSnippet ?? "") !== normalizeCellKey(r.snippet ?? "")) {
      // Snippet, never kind: a seam the replay cannot see (Step 2.5 header normalization)
      // legitimately moves the kind while leaving the cell's own text untouched.
      return refuse;
    }
  }
  return replayed;
}

/**
 * Which warnings are `#REF!` artifacts of a HIDDEN lookup tab, aligned with `warnings`.
 *
 * A `#REF!` on a hidden tab in a GENERIC section (no recognised col0 label on either the
 * parsed warning or the replay hit) is what an IMPORTRANGE lookup tab leaves behind when
 * its source access lapses. Nobody sees that cell on the crew page and nobody can reach it
 * from the deep link, because Google Sheets refuses to open a hidden gid and lands on the
 * last visible tab instead (measured 2026-09-03 on "II - FinTech Forum CTO Summit 2026":
 * five such warnings, every "Open in Sheet" link landing on DIAGRAMS).
 *
 * The rule is deliberately NARROW. Hidden tabs are still parsed (AGENDA is hidden on that
 * same show), so a `#REF!` inside a recognised section renders on the crew page and keeps
 * its warning whatever the tab's visibility. Every other code is untouched. The pairing is
 * the same positional one the anchors use, so a count mismatch suppresses nothing.
 */
export function hiddenTabRefSuppressions(
  warnings: readonly ParseWarning[],
  sites: readonly WaveCodeSite[],
): boolean[] {
  const hits = pairWaveCodeHits(warnings, sites, "REF_ERROR_LITERAL");
  let cursor = 0;
  return warnings.map((w) => {
    if (w.code !== "REF_ERROR_LITERAL") return false;
    const hit = hits[cursor] ?? null;
    cursor += 1;
    return (
      hit !== null &&
      hit.hiddenTab &&
      hit.kind === GENERIC_SECTION_KIND &&
      w.blockRef?.kind === GENERIC_SECTION_KIND
    );
  });
}

export function pairAllWaveCodes(
  warnings: readonly ParseWarning[],
  sites: readonly WaveCodeSite[],
): WavePairedAnchors {
  const out: WavePairedAnchors = {};
  for (const code of WAVE_CODES) out[code] = pairWaveCodeSites(warnings, sites, code);
  return out;
}
