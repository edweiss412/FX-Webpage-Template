// lib/parser/leadingColumnNormalize.ts
// Spec §6: when EVERY row a section owns (header AND colon-dash alignment rows
// included) leads with an empty cell, the section was drag-shifted on export.
// The inverse transform is total: drop the leading column, warn once.
import type { ParseWarning } from "./types";
import { canonicalSectionKind } from "./sectionKind"; // branch-2 helper (retro F1/F2)

export function normalizeLeadingColumn(markdown: string): {
  corrected: string;
  warnings: ParseWarning[];
} {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");
  let start = -1;
  let sectionIndex = -1;

  const leadsEmpty = (line: string): boolean => {
    const parts = line.split("|");
    return parts.length >= 3 && (parts[1] ?? "").trim() === "";
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
      blockRef: {
        kind: canonicalSectionKind((lines[from]!.split("|")[1] ?? "").trim()) ?? "section",
        index: sectionIndex,
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
  const opener = (line: string): boolean => {
    const parts = line.split("|");
    const c1 = (parts[1] ?? "").trim();
    if (c1 !== "") return canonicalSectionKind(c1) !== null;
    return canonicalSectionKind((parts[2] ?? "").trim()) !== null;
  };

  for (let i = 0; i <= lines.length; i++) {
    const isRow = i < lines.length && lines[i]!.trimStart().startsWith("|");
    const boundary = !isRow || (start !== -1 && i > start && opener(lines[i]!)); // retro F1: logical-section split
    if (isRow && start === -1) {
      start = i;
      sectionIndex += 1;
    } else if (boundary && start !== -1) {
      const rows = lines.slice(start, i);
      if (rows.length > 0 && rows.every(leadsEmpty)) correct(start, i);
      start = isRow ? i : -1; // a recognized opener starts the next logical section
      if (isRow) sectionIndex += 1;
    }
  }
  return { corrected: lines.join("\n"), warnings };
}
