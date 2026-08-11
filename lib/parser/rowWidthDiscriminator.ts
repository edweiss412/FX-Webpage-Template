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
 * SECTION BOUNDARIES ARE STRUCTURAL: an alignment row starts a table, and the row above
 * it is that table's header. No label registry is consulted, so no heading spelling, colon
 * suffix, or registered word sitting in a data cell can move a boundary.
 *
 * SKIPPED, deliberately, and recorded as §5.3 residue rather than papered over:
 *   - sections with fewer than 3 data rows (no meaningful modal)
 *   - sections whose width distribution TIES (no single modal to be short of)
 */
import { clean } from "./blocks/_helpers";
import { GENERIC_SECTION_KIND, canonicalSectionKind } from "./sectionKind";
import type { ParseWarning } from "./types";

/** The minimum data rows for a modal to mean anything. Below this the section is skipped. */
const MIN_DATA_ROWS_FOR_MODAL = 3;

/** A delimiter cell: optional leading colon, one or more dashes, optional trailing colon. */
const ALIGNMENT_CELL = /^:?-+:?$/;

/**
 * Split a row on UNESCAPED pipes only.
 *
 * `splitRow` (blocks/_helpers) splits on every `|`, which is right for its callers but
 * wrong for counting COLUMNS: the exporter writes a literal in-cell pipe as `\|`, and
 * counting that as a delimiter inflates the row by one. A section where some rows carry an
 * escaped pipe and others do not then has a bimodal width, and the rows WITHOUT one land
 * at modal-1 and are reported as fused -- a false positive on well-formed input. Probed by
 * cross-model review with a route cell reading `JFK \| LAX`.
 *
 * Deliberately local rather than a fix to `splitRow`: that function has many callers whose
 * behavior is not in this branch's scope, and widening the blast radius to fix a counting
 * bug here would be the wrong trade.
 *
 * EXPORTED (review round 3): `leadingColumnNormalize.ts`'s width-delta corroboration hit the
 * identical counting bug - a naive `split("|")` reads `\|` as a delimiter and inflates a
 * row's count by exactly the +1 the corroboration reads as proof of a shift. Reusing this
 * function rather than writing a second copy is the point; two copies of this rule is how a
 * wave ends up fixing the same bug twice.
 */
export function splitCellsUnescaped(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "\\" && i + 1 < line.length) {
      // An escaped pipe is TEXT, not a divider. Counting it as one inflates the row and
      // makes a section bimodal, so rows without one land at modal-1 and read as fused.
      cur += ch + line[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  // Drop the fragments outside the leading and trailing pipes, matching `splitRow`'s slice
  // so these counts stay comparable to the rest of the parser.
  return out.slice(1, out.length - 1).map((s) => s.trim());
}

/**
 * A row's column count and whether it is a delimiter row.
 *
 * DELIBERATELY THE OBVIOUS IMPLEMENTATION. An earlier version fused this into one
 * allocation-free index scan to save time, and that scan produced two separate P1 defects
 * in review -- it exempted the first cell from validation, and it checked character
 * membership rather than the `:?-+:?` ORDER, so `--:--` and `- - -` passed as delimiters.
 * Both split sections that should not have been split.
 *
 * The optimization was never justified. Measured over the 17-fixture corpus: this shape
 * costs 578ms and the clever one 71ms, against 16,868ms for `parseSheet` itself -- 3.4% of
 * a parse versus 0.4%. The earlier claim that the naive form was "3x slower on the
 * typo-generator suites" was simply wrong; those suites are slow under machine load and
 * fail identically on `main`, where this detector does not exist.
 */
function analyzeRow(line: string): { cells: number; alignment: boolean } {
  const cells = splitCellsUnescaped(line);
  return {
    cells: cells.length,
    alignment: cells.length > 0 && cells.every((c) => ALIGNMENT_CELL.test(c)),
  };
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

type Row = { line: string; cells: number; alignment: boolean; header: boolean };

export function detectFusedRows(markdown: string): ParseWarning[] {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");

  let section: Row[] = [];
  let sectionKind: string = GENERIC_SECTION_KIND;
  // Per-RUN state (a run = a maximal block of consecutive pipe lines).
  //
  // A markdown table has exactly ONE delimiter row, right under its header. A SECOND
  // delimiter-shaped row inside the same run is therefore ambiguous by construction: it is
  // either a second table butted against the first with no blank line, or an ordinary data
  // row whose cells all happen to read `-` / `---` (a placeholder, which sheets do write).
  // Nothing in the text distinguishes them, and guessing wrong reports a valid row as
  // fused — probed by cross-model review across every shape `ALIGNMENT_CELL` admits.
  //
  // So the run is ABANDONED rather than guessed: its warnings are buffered and dropped.
  // Measured cost on real input: ZERO. Across the 17 registry fixtures there are 514 pipe
  // runs and NONE contains two delimiter-shaped rows — real sheets separate their tables
  // with a blank line, which starts a new run. This is a §5.3 abstention, not a gap.
  let runWarnings: ParseWarning[] = [];
  let runDelimiters = 0;
  let runAmbiguous = false;
  const closeRun = (): void => {
    if (!runAmbiguous) warnings.push(...runWarnings);
    runWarnings = [];
    runDelimiters = 0;
    runAmbiguous = false;
  };

  const flush = (): void => {
    // DATA rows only: neither the delimiter row nor the table's HEADER row. The
    // discriminator is defined against the modal width of the section's DATA rows, and a
    // header is legitimately allowed to be narrower than the columns beneath it (a section
    // title spanning fewer cells is ordinary sheet authoring). Measuring it reported that
    // header as a fused data row, and on a wide-data/narrow-header section it was the only
    // row at modal-1. Probed by cross-model review.
    //
    // The cost is a documented §5.3 miss rather than a wrong answer: a merged cell in a
    // HEADER row is not reported. Same trade this file makes everywhere — a conservative
    // miss beats a false positive, which is what teaches an operator to ignore the warning.
    const data = section.filter((r) => !r.alignment && !r.header);
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
      runWarnings.push({
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
      // A RUN HOLDS AT MOST ONE TABLE, and that is what makes segmentation trivial here.
      //
      // A markdown table has exactly one delimiter row, directly under its header. The
      // FIRST delimiter in a run therefore identifies the header (the row above it) and
      // nothing else; a SECOND is ambiguous by construction and abandons the run entirely
      // (see `closeRun`). Between them there is no third case, so there is no mid-run
      // split to perform — an earlier version carried one, and cross-model review showed
      // it was dead code that the abstention rule had made unreachable, with two arms
      // passing through the abstention while claiming to test the split.
      //
      // No LABEL is consulted for any of this. Every lexical formulation of the boundary
      // was wrong in both directions (probed): an unregistered heading (`NOTES`) or a
      // colon-suffixed one (`DATES:`) failed to separate tables, while a registered token
      // in an ordinary data cell (a `Driver` row) falsely separated one.
      // `canonicalSectionKind` survives only as the warning's ROUTING KEY.
      const info = analyzeRow(line);
      if (info.alignment) {
        runDelimiters++;
        if (runDelimiters >= 2) runAmbiguous = true;
        else if (section.length > 0) {
          const h = section[section.length - 1]!;
          section[section.length - 1] = { ...h, header: true };
          sectionKind = kindOfFirstCell(firstCell(h.line)) ?? GENERIC_SECTION_KIND;
        }
      }
      if (section.length === 0)
        sectionKind = kindOfFirstCell(firstCell(line)) ?? GENERIC_SECTION_KIND;
      section.push({ line, cells: info.cells, alignment: info.alignment, header: false });
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
    closeRun();
  }
  flush();
  closeRun();
  return warnings;
}
