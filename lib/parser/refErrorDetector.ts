/**
 * lib/parser/refErrorDetector.ts — spec §4.
 *
 * `#REF!` is what Sheets writes into a cell whose formula reference was deleted. It
 * exports verbatim, so the parser sees it as an ordinary value and stores it as one:
 * the crew page then renders "#REF!" where a name or a time belongs, and nothing
 * upstream ever said so. Present in 3 of the 7 live shows, so this is observed, not
 * hypothetical.
 *
 * DETECTION IS `includes` ON THE POST-`clean()` TEXT, and both halves of that matter.
 * The corpus stores the ESCAPED form `\#REF\!`, which `clean()` unescapes, so matching
 * raw line text would miss every real occurrence. And a cell is not always the literal
 * alone — `#REF!/NAME` and `#REF! - #REF!` both occur — so an equality test would miss
 * the composite cells while `includes` catches them (spec §4.4 as amended by retro F1).
 *
 * ONE WARNING PER OFFENDING CELL. The loop visits each cell once, so a cell that fans
 * out into several derived fields still warns once, and a cell containing the literal
 * twice still warns once. That is the dedup the spec requires, achieved by construction
 * rather than by a post-pass.
 *
 * `blockRef` CARRIES `kind` BUT NO `index`, deliberately, and against the plan's original
 * "logical section ordinal" wording. A document-position ordinal is not stable under
 * unrelated structural edits: the harness's `signalEq` is a full deep-equal over the
 * signal channel, so injecting a blank row anywhere ABOVE a `#REF!` cell shifts that
 * warning's index, makes baseline and mutant signals unequal while no signal key gets
 * stronger, and the oracle scores the mutant SILENT_SIGNAL_LOSS. Measured on the first
 * full 8-shard run of this branch: 603 such rows, 564 of them `blank-row`, in `newHoles`
 * — the bucket spec §9 marks HARD and never deferrable. The index was manufacturing
 * signal churn, not carrying information: `kind` plus `rawSnippet` already identify the
 * offending cell, and warnings.ts:50 and :114 already omit `index` for the same reason.
 *
 * Detection only. The value is left exactly as parsed (spec §1.1.4: warn, never
 * hard-fail) — an operator seeing the literal on the page and a warning naming its
 * section is strictly better informed than one seeing a silently blanked field.
 */
import { clean, splitRow } from "./blocks/_helpers";
import { GENERIC_SECTION_KIND, canonicalSectionKind } from "./sectionKind";
import type { ParseWarning } from "./types";

/** The broken-reference literal, after `clean()` has removed markdown escaping. */
const REF_LITERAL = "#REF!";

/**
 * A TRUE markdown delimiter row: every cell is a run of dashes with optional colons.
 *
 * The obvious predicate — "first cell starts with `:?-`" — is what shipped first, and it
 * is wrong in a way that costs detections rather than causing false ones. A perfectly
 * ordinary data row can begin with a hyphen in its otherwise-unused first column, and
 * skipping the whole row then hides every `#REF!` further along it: cross-model review
 * probed a CREW row with `-` in col0 and `#REF!` in NAME, which the parser stored as a
 * crew member literally named `#REF!` while the detector stayed silent (SILENT_WRONG).
 *
 * Requiring EVERY cell to be delimiter-shaped cannot make that mistake, because a row
 * carrying real data has at least one cell that is not a dash run.
 */
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

/**
 * Memoized `canonicalSectionKind(clean(col0))`, keyed on the RAW first cell.
 *
 * Section labels repeat relentlessly — every row of a section shares a col0 shape, and
 * the empty string alone accounts for most rows in the corpus — while `clean()` runs
 * three regex passes and the resolver normalizes and scans a prefix list. Measured on
 * the 17-fixture corpus (best-of-3, expressed as a RATIO against `parseSheet` in the
 * same process, because this host's load swings absolute timings by 2x): the memo took
 * the detector from 8.35 to 1.16 ms/doc, which is 0.4% of the 330 ms `parseSheet` costs
 * on those same documents. The detector is therefore not on anyone's critical path.
 *
 * Bounded so a pathological document cannot grow it without limit; the cap is far above
 * the number of DISTINCT col0 values any real sheet has.
 */
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

/**
 * The row's first cell, without splitting the whole row.
 *
 * Same slice `splitRow` would yield at index 0, but it stops at the second pipe instead
 * of allocating an array per line — this runs on every row of every parse, and the
 * section-tracking read is the only thing it is needed for.
 */
function firstCell(line: string): string {
  const open = line.indexOf("|");
  if (open === -1) return "";
  const close = line.indexOf("|", open + 1);
  return close === -1 ? "" : line.slice(open + 1, close);
}

/** One `#REF!` hit, with the position the emitter deliberately does not carry.
 *
 *  `cell` is the index into `splitRow(line)`, which is a FRAGMENT index rather than a
 *  spreadsheet column: `escapeCell` writes a literal pipe as `\|` and `splitRow` splits on
 *  every pipe regardless. The anchor replay maps it back to the owning exporter cell
 *  (spec 2026-08-29 §2.1); nothing here interprets it. */
export type RefErrorHit = { line: number; cell: number; kind: string; snippet: string };

/**
 * The walker under `detectRefErrorLiterals`: same traversal, same order, plus the line and
 * cell of every hit.
 *
 * The position is reported HERE, for the anchor replay to consume in `lib/drive/`, and is
 * never placed on the emitted warning (spec 2026-08-29 §2.3) — a document ordinal in the
 * signal channel scored 603 harness rows as SILENT_SIGNAL_LOSS, which is why `blockRef`
 * still carries `kind` and no `index`.
 */
export function scanRefErrorLiterals(markdown: string): RefErrorHit[] {
  const hits: RefErrorHit[] = [];
  const lines = markdown.split("\n");
  let sectionKind: string = GENERIC_SECTION_KIND;
  let prevBlank = true;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    // Character scan rather than trimStart()/trim(): both allocate a new string for
    // every line of every parse, which is pure waste on a pass that reads two facts.
    const start = firstNonSpace(line);
    const isRow = start !== -1 && line.charCodeAt(start) === 124; /* "|" */
    if (isRow) {
      const opener = kindOfFirstCell(firstCell(line));
      // A new LOGICAL section starts at a blank-line boundary OR at a recognized
      // opener inside a pipe run (retro r5). Without the second condition a section
      // that follows another with no blank line between them inherits its
      // predecessor's kind, and every warning in it is anchored to the wrong place.
      //
      // NO POSITIONAL ORDINAL IS EMITTED, and that is deliberate — see the note on
      // blockRef below.
      if (prevBlank || opener !== null) sectionKind = opener ?? GENERIC_SECTION_KIND;
    }
    prevBlank = start === -1;
    if (!isRow || isAlignmentRow(line)) continue;

    // HOT PATH. This detector runs on every parse, and the typo-space generator suites
    // parse tens of thousands of documents, so a per-cell `clean()` here is not free:
    // adding one timed out `venue.test.ts` and `event.test.ts` at their 30s budgets.
    //
    // `clean()` only REMOVES characters (markdown escapes, zero-width, surrounding
    // whitespace) — it can never introduce a `#`. So a line with no `#` at all cannot
    // contain a cell that cleans to something holding `#REF!`, and skipping it is
    // behavior-preserving rather than an approximation. Nearly every corpus line
    // takes this exit.
    if (!line.includes("#")) continue;

    const cells = splitRow(line);
    for (let cell = 0; cell < cells.length; cell++) {
      const cellRaw = cells[cell]!;
      if (!cellRaw.includes("#")) continue;
      if (!clean(cellRaw).includes(REF_LITERAL)) continue;
      hits.push({ line: lineIndex, cell, kind: sectionKind, snippet: cellRaw.trim() });
    }
  }
  return hits;
}

export function detectRefErrorLiterals(markdown: string): ParseWarning[] {
  return scanRefErrorLiterals(markdown).map((h) => ({
    severity: "warn",
    code: "REF_ERROR_LITERAL",
    message:
      'A broken spreadsheet reference ("#REF!") appears in the sheet where a real value belongs.',
    blockRef: { kind: h.kind },
    rawSnippet: h.snippet,
  }));
}
