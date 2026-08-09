/**
 * lib/parser/rowWidthDiscriminator.ts — spec §5.
 *
 * Merging two cells in Sheets exports as a DELETED PIPE: the row comes out one cell short
 * of its neighbours, the two values fuse into one, and every column to their right shifts
 * within that row. Each individual value still looks well-formed, which is exactly why
 * nothing downstream notices — the operator sees a plausible-looking row whose fields are
 * one column out.
 *
 * THE DISCRIMINATOR IS "SHORT BY EXACTLY ONE AGAINST THE SECTION'S MODAL WIDTH", and the
 * calibration problem it solves is that genuinely ragged rows are normal sheet authoring.
 * A modal taken over at least three data rows separates "this row lost a pipe" from "the
 * author left a trailing cell blank": one row disagreeing with three siblings is a
 * defect, one row disagreeing with one sibling is a coin flip.
 *
 * DETECTION ONLY (spec §5.1). The fusion still absorbs into payload exactly as before;
 * this reports it. Correcting would mean guessing which of the fused values belongs in
 * which column, and a wrong guess is worse than a flagged row an operator can look at.
 *
 * SKIPPED, deliberately, and recorded as §5.3 residue rather than papered over:
 *   - sections with fewer than 3 data rows (no meaningful modal)
 *   - sections whose width distribution TIES (no single modal to be short of)
 */
import { clean, splitRow } from "./blocks/_helpers";
import { GENERIC_SECTION_KIND, canonicalSectionKind } from "./sectionKind";
import type { ParseWarning } from "./types";

/** The minimum data rows for a modal to mean anything. Below this the section is skipped. */
const MIN_DATA_ROWS_FOR_MODAL = 3;

/** A true markdown delimiter row: EVERY cell is a dash run with optional colons. */
function isAlignmentRow(line: string): boolean {
  const cells = splitRow(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

/** Index of the first non-whitespace character, or -1 when the line is blank. */
function firstNonSpace(line: string): number {
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9 && c !== 13) return i;
  }
  return -1;
}

/** The row's first cell, without allocating an array for the whole row. */
function firstCell(line: string): string {
  const open = line.indexOf("|");
  if (open === -1) return "";
  const close = line.indexOf("|", open + 1);
  return close === -1 ? "" : line.slice(open + 1, close);
}

/** Memoized label resolution — section labels repeat on every row of a section. */
const KIND_MEMO_CAP = 4096;
const kindMemo = new Map<string, string | null>();
function kindOfFirstCell(rawCol0: string): string | null {
  const hit = kindMemo.get(rawCol0);
  if (hit !== undefined) return hit;
  const resolved = canonicalSectionKind(clean(rawCol0));
  if (kindMemo.size >= KIND_MEMO_CAP) kindMemo.clear();
  kindMemo.set(rawCol0, resolved);
  return resolved;
}

type Row = { line: string; cells: number };

export function detectFusedRows(markdown: string): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");

  let section: Row[] = [];
  let sectionKind: string = GENERIC_SECTION_KIND;

  const flush = (): void => {
    const data = section.filter((r) => !isAlignmentRow(r.line));
    if (data.length < MIN_DATA_ROWS_FOR_MODAL) return;

    const freq = new Map<number, number>();
    for (const r of data) freq.set(r.cells, (freq.get(r.cells) ?? 0) + 1);
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    // A tie means there is no single "normal" width for this section, so "short by one"
    // has no referent. Skipping is the conservative reading (spec §5.3).
    if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return;
    const modal = sorted[0]![0];

    for (const r of data) {
      if (r.cells !== modal - 1) continue;
      warnings.push({
        severity: "warn",
        code: "ROW_CELLS_FUSED",
        message:
          "A row in this section has one fewer column than its neighbors, which is how a merged cell exports.",
        blockRef: { kind: sectionKind },
        rawSnippet: r.line.trim(),
      });
    }
  };

  for (const line of lines) {
    const start = firstNonSpace(line);
    const isRow = start !== -1 && line.charCodeAt(start) === 124; /* "|" */

    if (isRow) {
      const opener = kindOfFirstCell(firstCell(line));
      // A LOGICAL section boundary is a blank line OR a recognized opener inside a pipe
      // run (retro r5/r6). Without the second condition, two sections written with no
      // blank line between them are measured as one, and a legitimate width change at the
      // boundary reads as a fused row in every row of the shorter half.
      if (section.length > 0 && opener !== null) {
        flush();
        section = [];
      }
      if (section.length === 0) sectionKind = opener ?? GENERIC_SECTION_KIND;
      section.push({ line, cells: splitRow(line).length });
      continue;
    }

    // ANY non-row line closes the section, not only a blank one — markdown ends a table at
    // the first line that is not part of it. Restricting this to blank lines merges two
    // tables separated by a paragraph into a single section, and the wider table's rows
    // then set a modal that reports every row of the narrower one as fused.
    //
    // The converse cost is accepted deliberately: a stray line INSIDE one table splits it,
    // and each half may fall under the 3-row floor and be skipped. That direction is a
    // conservative miss (spec §5.3 residue), while the other is a false positive on
    // well-formed input — which is the failure that teaches an operator to ignore the
    // warning.
    if (section.length > 0) {
      flush();
      section = [];
    }
  }
  flush();
  return warnings;
}
