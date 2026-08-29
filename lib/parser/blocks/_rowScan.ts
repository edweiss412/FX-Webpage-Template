import { clean, splitRow } from "./_helpers";

/**
 * The opener-tagged table-row scan.
 *
 * Its own module, and deliberately a SMALL one: this is the only place a row's physical
 * BLOCK is derived, which is what makes an occurrence identity — the consumption-ledger
 * key that distinguishes a byte-identical row in a `DETAILS` block from one in a
 * `Timestamp` block, and the anchor namespace the near-miss detector reports under. It is
 * therefore enrolled in the source-mutation registry (`tests/mutation/source/registry.ts`,
 * surface `rowScanOpener`), and it can only BE enrolled at file granularity — the registry
 * mutates a whole `sourcePath`. Left inside `_helpers.ts` its nine sites would sit among
 * that file's 144 belonging to date normalization and cell cleaning, none of which the
 * detector's suites decide, so the enrollment would have measured mostly unrelated code.
 *
 * It does not live in `lib/parser/fieldNearMiss.ts` for the reason that moved it out of
 * there in the first place: `blocks/venue.ts` reads openers too (its `TYPO_NORMALIZED`
 * gate is keyed on venue-block membership), and a block file importing the detector would
 * close a module cycle through `lib/parser/sectionHeaderTokens.ts`, which imports every
 * block's tokens back. `_helpers.ts` deliberately does NOT re-export it — that would make
 * this module and `_helpers.ts` mutually importing, which is the same cycle one level down.
 */

/**
 * One scanned table row, plus the first-cell text of the row that opened its table, plus
 * its block's minimum value-cell count.
 *
 * `blockMinValueCells` is a property of the BLOCK, repeated on every row of it: the
 * smallest number of non-empty cleaned cells after column 0 that any kept row of the
 * block carries. It is REQUIRED rather than optional. Both construction sites are in this
 * file, so the compiler enforces that neither forgets it, and an optional field would let
 * a future site read `undefined`, which `>= 6` evaluates as false — silently admitting
 * every block to the near-miss detector's candidacy test.
 */
export type ScannedRow = { cells: string[]; opener: string; blockMinValueCells: number };

/** A scanned row plus its position in the INPUT array the core was handed. */
export type ScannedBlockRow = ScannedRow & { index: number };

const ALIGNMENT_SEGMENT = /^[\s:|*-]*$/;

/**
 * Value cells in one row: non-empty CLEANED cells after column 0.
 *
 * Column 0 is the row's label, never a value, so it is skipped rather than counted and
 * subtracted. Cleaning before the emptiness test is what makes a cell holding only a
 * zero-width character count as empty; no corpus input distinguishes the two definitions
 * (measured: 0 of 44,446 value cells), so the difference is pinned by a constructed
 * witness in `tests/parser/rowScanCore.test.ts` rather than left to chance.
 */
function valueCellCount(cells: readonly string[]): number {
  // `slice(1).filter(...)` rather than an indexed loop: an indexed loop's bound comparison
  // has no observable boundary (reading one past the end yields `undefined`, which cleans
  // to the empty string and is not counted anyway), so widening it produces an equivalent
  // mutant the source-mutation gate reports as an unkillable survivor. The slice offset is
  // observable — dropping it counts the label column — so this shape has no dead site.
  return cells.slice(1).filter((cell) => clean(cell) !== "").length;
}

/**
 * The opener/alignment core shared by the markdown shell below and the raw-workbook
 * anchor scanner (`lib/drive/unknownFieldAnchors.ts`). Opener = row 0 cell 0, cleaned;
 * every alignment-shaped row is dropped; `index` is the row's position in the INPUT so
 * a caller holding coordinates can map back. One definition, two callers, so the
 * detector and the scanner cannot disagree about which block a row belongs to
 * (spec 2026-08-27-wizard-warning-row-links-copy §2.3).
 */
export function scanBlockCells(rowsOfCells: readonly (readonly string[])[]): ScannedBlockRow[] {
  const first = rowsOfCells[0];
  if (!first) return [];
  const opener = clean(first[0] ?? "");
  const kept: { cells: string[]; index: number }[] = [];
  rowsOfCells.forEach((cells, index) => {
    if (cells.every((seg) => ALIGNMENT_SEGMENT.test(seg))) return; // alignment row
    if (cells.length > 0) kept.push({ cells: [...cells], index });
  });
  // Two passes, because the block statistic is not known while the rows are still being
  // collected. The empty case is handled by emitting nothing rather than by choosing a
  // value for it: with no kept rows there is no row to carry a number, so any constant
  // would be unobservable, and an unobservable difference is an equivalent mutant the
  // harness plants, cannot kill, and charges as a new accepted row.
  if (kept.length === 0) return [];
  const blockMinValueCells = Math.min(...kept.map((r) => valueCellCount(r.cells)));
  return kept.map(({ cells, index }) => ({ cells, opener, index, blockMinValueCells }));
}

/**
 * `parseTableRows`, but each row is also tagged with its physical block's opening
 * first-cell text.
 *
 * The opener rule — first `|`-leading line of a run, reset at any non-pipe line — is the
 * rule `parseContacts` and `harvestFormLayout` use to build their consumption-ledger
 * keys, so a detector probe key and a writer key for the same row are identical by
 * construction. The emitted rows are exactly `parseTableRows`' rows, in order (pinned in
 * `tests/parser/fieldNearMiss.test.ts`).
 *
 * A table whose first `|` line is an alignment row takes `:---` as its opener; callers
 * deriving a namespace from it fall back to a generic label. No corpus fixture has that
 * shape.
 *
 * This is the line-grouping SHELL over `scanBlockCells`: group pipe lines into runs,
 * `splitRow` each, run the core per run.
 */
export function scanRowsWithOpener(markdown: string): ScannedRow[] {
  const rows: ScannedRow[] = [];
  let run: string[][] = [];
  // `flush` is unguarded on purpose: `scanBlockCells([])` is `[]` and the reset is a
  // no-op, so a length check before each call would add two branches that no input can
  // distinguish (the source-mutation gate reported exactly those four sites as
  // survivors, and an unreachable branch is a bigger guard, not a safer one).
  const flush = () => {
    for (const r of scanBlockCells(run))
      rows.push({
        cells: r.cells,
        opener: r.opener,
        blockMinValueCells: r.blockMinValueCells,
      });
    run = [];
  };
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      flush();
      continue;
    }
    run.push(splitRow(trimmed));
  }
  flush();
  return rows;
}

/**
 * The physical block opener in effect at every line of a document, indexed by line number.
 *
 * Exists because a block parser that finds its section by a SEMANTIC header regex and a
 * detector that reads the PHYSICAL pipe run can disagree about which opener a row belongs to,
 * and the consumption ledger is keyed on the opener — so when they disagree, a resolved row's
 * mark lands under a key the detector never probes and the row is reported unrecognized
 * anyway. Measured on the corpus with `Stage Size` → `Stage-Size`: resolved to `stage_size`,
 * autocorrected, and simultaneously reported unknown under the namespace of a DIFFERENT block
 * (whole-diff r4 P1). Any writer whose block boundaries are not the pipe run's must key
 * through this function rather than through the header row it matched.
 *
 * Non-table lines get `""`. The rule is `scanRowsWithOpener`'s, applied from the document
 * start, so the two cannot drift.
 */
export function openerByLine(markdown: string): string[] {
  const out: string[] = [];
  let inTable = false;
  let opener = "";
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      inTable = false;
      opener = "";
      out.push("");
      continue;
    }
    if (!inTable) {
      inTable = true;
      opener = clean(splitRow(trimmed)[0] ?? "");
    }
    out.push(opener);
  }
  return out;
}

// TRANSFORM_SITES (spec 2026-07-07-ambiguity-warnings-v1 §6) — value-producing
// transform sites in this file that rest on a JUDGMENT the parser could get wrong.
// None here — the scan reproduces `parseTableRows`' rows verbatim and tags each with a
// cleaned cell it did not choose.
export const TRANSFORM_SITES: ReadonlyArray<
  { site: string; code: string } | { site: string; exempt: string }
> = [];
