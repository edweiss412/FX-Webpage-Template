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

/** One scanned table row plus the first-cell text of the row that opened its table. */
export type ScannedRow = { cells: string[]; opener: string };

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
 * A table whose first `|` line is an alignment row takes `:---` as its opener, which
 * normalizes to the empty string; callers deriving a namespace from it fall back to a
 * generic label. No corpus fixture has that shape.
 */
export function scanRowsWithOpener(markdown: string): ScannedRow[] {
  const rows: ScannedRow[] = [];
  let inTable = false;
  let opener = "";
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      inTable = false;
      continue;
    }
    const cells = splitRow(trimmed);
    if (!inTable) {
      inTable = true;
      opener = clean(cells[0] ?? "");
    }
    if (cells.every((seg) => /^[\s:|*-]*$/.test(seg))) continue; // alignment row
    if (cells.length > 0) rows.push({ cells, opener });
  }
  return rows;
}

// TRANSFORM_SITES (spec 2026-07-07-ambiguity-warnings-v1 §6) — value-producing
// transform sites in this file that rest on a JUDGMENT the parser could get wrong.
// None here — the scan reproduces `parseTableRows`' rows verbatim and tags each with a
// cleaned cell it did not choose.
export const TRANSFORM_SITES: ReadonlyArray<
  { site: string; code: string } | { site: string; exempt: string }
> = [];
