// lib/parser/leadingColumnNormalize.ts
// Spec §6: when EVERY row a section owns (header AND colon-dash alignment rows
// included) leads with an empty cell, the section was drag-shifted on export.
// The inverse transform is total: drop the leading column, warn once.
import type { ParseWarning } from "./types";
import { canonicalSectionKind, GENERIC_SECTION_KIND } from "./sectionKind"; // branch-2 helper (retro F1/F2)

export function normalizeLeadingColumn(markdown: string): {
  corrected: string;
  warnings: ParseWarning[];
} {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");
  let start = -1;

  const leadsEmpty = (line: string): boolean => {
    const parts = line.split("|");
    // >= 4, not >= 3 (review round 1, Minor #5): a 3-part row ("||") has only ONE cell
    // total - the very one this detector would drop - so treating it as "shifted" and
    // then dropping it collapses the row to a bare "|" and calls that a restoration. A
    // width floor of 4 requires at least one surviving cell past the dropped leading one.
    return parts.length >= 4 && (parts[1] ?? "").trim() === "";
  };

  const correct = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      // drop cell 1 (the uniformly-empty leading column) from every row
      const parts = lines[i]!.split("|");
      lines[i] = [parts[0], ...parts.slice(2)].join("|");
    }
    warnings.push({
      severity: "warn",
      code: "LEADING_COLUMN_AUTOCORRECTED",
      message:
        "Every row of a section started with an empty column, so we read the section one column to the left.",
      // NO POSITIONAL ORDINAL (review round 1, Important #3): matches
      // refErrorDetector.ts:154 / rowWidthDiscriminator.ts:189. An `index` here is not
      // stable under unrelated structural edits - the harness's `signalEq` is a deep-equal
      // over the signal channel, so a blank row injected anywhere above shifts the
      // ordinal and scores the mutant SILENT_SIGNAL_LOSS (measured on refErrorDetector.ts:
      // 603 rows, 564 blank-row, in `newHoles`, the bucket spec §9 marks HARD).
      blockRef: {
        kind:
          canonicalSectionKind((lines[from]!.split("|")[1] ?? "").trim()) ?? GENERIC_SECTION_KIND,
      }, // retro F2
      autocorrect: {
        subject: null,
        corrections: [{ detected: "empty leading column", corrected: "shifted left" }],
      },
    });
  };

  // Retro r5: the opener may sit in cell 1 OR - when the section is shifted, including
  // the boundary-defining row of a NEIGHBOUR section the operator moved - in cell 2
  // behind an empty leading cell. One-cell detection restores only 473/535 mutants.
  //
  // Review round 1, Critical #1 / Important #2, then round 2: a bare cell-2 label MATCH is
  // not enough - ordinary data coincides with section vocabulary by construction (a
  // contact's title reads "Venue", a driver's name reads "Driver", a gear line item names a
  // room family). Round 1 tried corroborating with "the next line is its own colon-dash
  // alignment row", which round 2 measured DEAD on every corpus-derived input (0 of 216
  // mid-block section headers across the corpus are followed by their own alignment row -
  // a section deep enough in a block to need cell-2 detection never re-declares its columns)
  // and still reachable by a lone `-` placeholder cell, which is a real, if rare, shape in
  // the corpus (fixed-income.md:47,49,51).
  //
  // Corroborate by WIDTH instead: the `columnShift` operator's physical signature (spec
  // §6.1) is that a shifted row has exactly ONE MORE cell than it would unshifted - the
  // drag inserts one real leading pipe. `lastUnshiftedWidth` tracks the cell count of the
  // most recently seen row IN THE CURRENT PHYSICAL BLOCK whose own cell 1 was non-empty
  // (never the candidate row itself, which is empty by construction whenever this branch is
  // reached). It is reset only when the block ends (blank line / EOF), not when a logical
  // section inside it closes, so it survives across the section boundary a cell-2 opener is
  // trying to detect. Using the MOST RECENT such row (rather than a block-wide mode) keeps
  // the comparison local, so a block whose rows legitimately vary in width in different
  // places still gets a locally-accurate reference at the point being checked.
  //
  // Residual limit, not reachable by the mutation harness: if two ADJACENT sections in one
  // block are BOTH shifted with no unshifted row between them, `lastUnshiftedWidth` has no
  // valid reference at the second section's boundary and the corroboration does not fire.
  // The two sections are then read as one combined span; the payload is still fully
  // restored (dropping the leading cell from every row is idempotent whether done as one
  // correction or two), just under one warning instead of two. `columnShift`
  // (tests/parser/mutation/operators.ts:153-168) shifts exactly one section per mutant, so
  // this shape never arises in the measured corpus.
  const opener = (line: string, lastUnshiftedWidth: number | null): boolean => {
    const parts = line.split("|");
    const c1 = (parts[1] ?? "").trim();
    if (c1 !== "") return canonicalSectionKind(c1) !== null;
    if (canonicalSectionKind((parts[2] ?? "").trim()) === null) return false;
    return lastUnshiftedWidth !== null && parts.length === lastUnshiftedWidth + 1;
  };

  let lastUnshiftedWidth: number | null = null;
  for (let i = 0; i <= lines.length; i++) {
    const isRow = i < lines.length && lines[i]!.trimStart().startsWith("|");
    const boundary = !isRow || (start !== -1 && i > start && opener(lines[i]!, lastUnshiftedWidth)); // retro F1: logical-section split
    if (isRow && start === -1) {
      start = i;
    } else if (boundary && start !== -1) {
      const rows = lines.slice(start, i);
      if (rows.length > 0 && rows.every(leadsEmpty)) correct(start, i);
      start = isRow ? i : -1; // a recognized opener starts the next logical section
    }
    if (!isRow) {
      lastUnshiftedWidth = null; // the block ended; no reference survives into the next one
    } else {
      const parts = lines[i]!.split("|");
      if ((parts[1] ?? "").trim() !== "") lastUnshiftedWidth = parts.length;
    }
  }
  return { corrected: lines.join("\n"), warnings };
}
