// lib/parser/leadingColumnNormalize.ts
// Spec §6: when EVERY row a section owns (header AND colon-dash alignment rows
// included) leads with an empty cell, the section was drag-shifted on export.
// The inverse transform is total: drop the leading column, warn once.
import type { ParseWarning } from "./types";
import { canonicalSectionKind, GENERIC_SECTION_KIND } from "./sectionKind"; // branch-2 helper (retro F1/F2)
import { splitCellsUnescaped } from "./rowWidthDiscriminator"; // round-3 escape-aware cell count

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
      // refErrorDetector.ts:154 / rowWidthDiscriminator.ts:195. An `index` here is not
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
  // behind an empty leading cell. A cell-1-only variant of the shipped detector measures
  // 461/535 corpus mutation sites restored (review round 3); the cell-2 branch below closes
  // 47 of the remaining 74, leaving 27 unrestored (review round 3): 9 `COI` + 5 `In House AV`
  // are a `LABEL_TO_KIND` vocabulary gap (deferred deliberately, not this file's bug), and 8
  // are typo'd headers the mutation harness itself classifies `headerRow: null`.
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
  // Review round 3, Critical #1 (third narrowing): the width itself was measured with a
  // naive `line.split("|")`, which counts an escaped in-cell pipe `\|` as a delimiter and
  // inflates a row's count by exactly the +1 the corroboration reads as proof of a shift -
  // one literal pipe inside any cell of an UNSHIFTED row could spoof the check (corpus-
  // attested: 9 rows across 6 files, e.g. "Holiday Inn Express \| Dubois"). This is the
  // identical counting bug `rowWidthDiscriminator.ts` already found and fixed for its own
  // column-counting surface (probed there with a route cell reading "JFK \| LAX"), so its
  // `splitCellsUnescaped` is reused here rather than re-solved - both the candidate row's
  // width and `lastUnshiftedWidth` now count unescaped pipes only. Measured cost: zero (the
  // same 508/535 corpus sites restore as before the repair); measured benefit: no
  // corpus-reachable spoof of the width check remains.
  //
  // This closes the finding only because the exporter escapes `\` BEFORE it escapes `|`
  // (lib/drive/exportSheetToMarkdown.ts:43 then :45): a cell ending in a literal `\`
  // immediately before a real delimiter would otherwise read as an escaped pipe, understating
  // that row's count by one - the inverse of the bug this repair closes. That ordering is a
  // fact about the exporter, invisible from this file. An ingestion path that escaped pipes
  // but not backslashes, or escaped them in the other order, would re-open this class.
  //
  // Residual limit, not reachable by the mutation harness: if a section is shifted with NO
  // unshifted row anywhere EARLIER in its physical block (i.e. the pair is block-initial -
  // the reference survives a logical-section close, so an unshifted row anywhere earlier in
  // the block, not only immediately before, still corroborates a later shifted section),
  // `lastUnshiftedWidth` has no valid reference and the corroboration does not fire. The
  // shifted section is then read together with whatever preceded it as one combined span;
  // the payload is still fully restored (dropping the leading cell from every row is
  // idempotent whether done as one correction or two), just under one warning instead of
  // two. This is not unreachable merely because `columnShift`
  // (tests/parser/mutation/operators.ts:153-168) shifts one section per mutant - it is
  // unreachable because the mutation harness segments on `KNOWN_SECTION_HEADERS`
  // (tests/parser/mutation/classify.ts:100) while this detector segments on `LABEL_TO_KIND`
  // (sectionKind.ts), so a single harness-defined section can contain rows this detector
  // reads as its own openers, and the harness never produces a mutant where two
  // detector-visible sections are BOTH shifted with nothing unshifted ahead of them.
  //
  // Documented limit (review round 3, Important, deliberately not patched): the same model
  // mismatch runs the other way inside a section that IS shifted. Every row of a shifted
  // section is one cell wider than it was, so a MID-BLOCK data row whose own cell 2
  // canonicalizes now also satisfies the width corroboration and splits the section - one
  // shift can emit two warnings instead of one. Payload is always fully restored either way;
  // 0 of 535 corpus mutation sites hit this. Not patched: the only way to suppress it is
  // requiring the row immediately before to be unshifted, which would also suppress the
  // legitimate two-adjacent-shifted-sections case the paragraph above documents as working -
  // trading one correct case for another rather than fixing anything.
  //
  // Documented limit (whole-diff review r1 §2.5, measured not assumed): this pass is Step 2.55,
  // but `classifyVersion` is Step 1 and therefore reads the UNCORRECTED markdown. Over all 540
  // block-start shift sites in the corpus, payload is restored at 540/540, and the load-bearing
  // number is `not_a_sheet=0` - that verdict is the one path returning a stub early
  // (index.ts:585), which would bypass this pass entirely, and it never fires. 7 sites do gain a
  // `VERSION_AMBIGUOUS` the clean parse lacks; those still restore fully and additionally
  // hard-fail into review, which is conservative-plus-signalled rather than silent. Not a
  // regression either way: origin/main returns the identical verdict on the identical input,
  // because the version gate is upstream of everything this module changes. Moving the pass
  // earlier is the only thing that would alter that, and it would cost the Step 2.6 ordering
  // this module depends on.
  const opener = (line: string, lastUnshiftedWidth: number | null): boolean => {
    const parts = line.split("|");
    const c1 = (parts[1] ?? "").trim();
    if (c1 !== "") return canonicalSectionKind(c1) !== null;
    if (canonicalSectionKind((parts[2] ?? "").trim()) === null) return false;
    return (
      lastUnshiftedWidth !== null && splitCellsUnescaped(line).length === lastUnshiftedWidth + 1
    );
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
      if ((parts[1] ?? "").trim() !== "")
        lastUnshiftedWidth = splitCellsUnescaped(lines[i]!).length;
    }
  }
  return { corrected: lines.join("\n"), warnings };
}
