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

  /**
   * True for a genuine (possibly shifted) markdown alignment row: cell 1 empty, cell 2
   * a run of dashes/colons. Same shape as refErrorDetector.ts's `isAlignmentRow`, applied
   * at cell 2 instead of cell 1 - the corroborating signal for the opener's cell-2 branch
   * below (review round 1, Critical #1 / Important #2).
   */
  const isShiftedAlignmentRow = (line: string): boolean => {
    const parts = line.split("|");
    if ((parts[1] ?? "").trim() !== "") return false;
    return /^:?-+:?$/.test((parts[2] ?? "").trim());
  };

  // Retro r5: the opener may sit in cell 1 OR - when the section is shifted, including
  // the boundary-defining row of a NEIGHBOUR section the operator moved - in cell 2
  // behind an empty leading cell. One-cell detection restores only 473/535 mutants.
  //
  // Review round 1, Critical #1 / Important #2: a bare cell-2 label MATCH is not enough -
  // ordinary data coincides with section vocabulary by construction (a contact's title
  // reads "Venue", a driver's name reads "Driver", a gear line item names a room family),
  // and treating that alone as a header rewrote unshifted data and double-warned a
  // genuinely shifted section. Require the row to actually BE a shifted section's header:
  // the NEXT line is its own colon-dash alignment row, also shifted into cell 2 - the same
  // structural guarantee spec §6 already relies on for the block-initial case.
  const opener = (line: string, nextLine: string | undefined): boolean => {
    const parts = line.split("|");
    const c1 = (parts[1] ?? "").trim();
    if (c1 !== "") return canonicalSectionKind(c1) !== null;
    if (canonicalSectionKind((parts[2] ?? "").trim()) === null) return false;
    return nextLine !== undefined && isShiftedAlignmentRow(nextLine);
  };

  for (let i = 0; i <= lines.length; i++) {
    const isRow = i < lines.length && lines[i]!.trimStart().startsWith("|");
    const boundary = !isRow || (start !== -1 && i > start && opener(lines[i]!, lines[i + 1])); // retro F1: logical-section split
    if (isRow && start === -1) {
      start = i;
    } else if (boundary && start !== -1) {
      const rows = lines.slice(start, i);
      if (rows.length > 0 && rows.every(leadsEmpty)) correct(start, i);
      start = isRow ? i : -1; // a recognized opener starts the next logical section
    }
  }
  return { corrected: lines.join("\n"), warnings };
}
