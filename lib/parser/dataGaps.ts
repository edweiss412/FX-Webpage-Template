/**
 * summarizeDataGaps — single-sourced count logic for the data-quality surfaces
 * (parse-data-quality-warnings §6).
 *
 * The three data-quality ParseWarning codes (FIELD_UNREADABLE,
 * UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED) are surfaced at six operator
 * surfaces (staged card, wizard Step 3, /admin/unpublished chip, changes feed,
 * SHOW_FIRST_PUBLISHED digest, per-show panel). Every surface derives its count
 * from THIS helper so the logic is single-sourced — tests assert against the
 * helper's input array (the data source), never the rendered output.
 *
 * Lives in lib/parser (next to the warning codes + ParseWarning type) so both
 * the admin loaders and the UI can import it without a parser→admin dependency.
 */

import { FIELD_UNREADABLE, UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED } from "@/lib/parser/warnings";
import type { ParseWarning } from "@/lib/parser/types";

export type DataGapsSummary = {
  total: number;
  classes: {
    FIELD_UNREADABLE: number;
    UNKNOWN_SECTION_HEADER: number;
    BLOCK_DISAPPEARED: number;
  };
};

/**
 * Count the three data-quality warning classes in `warnings`, excluding any
 * `severity:"info"` warning (only operator-actionable `warn`-severity drops
 * count) and any non-data-quality code. `null`/`undefined`/`[]` → `{ total: 0 }`.
 */
export function summarizeDataGaps(
  warnings: readonly ParseWarning[] | null | undefined,
): DataGapsSummary {
  const classes = {
    FIELD_UNREADABLE: 0,
    UNKNOWN_SECTION_HEADER: 0,
    BLOCK_DISAPPEARED: 0,
  };
  if (!warnings) return { total: 0, classes };

  for (const w of warnings) {
    if (w.severity === "info") continue;
    if (w.code === FIELD_UNREADABLE) classes.FIELD_UNREADABLE += 1;
    else if (w.code === UNKNOWN_SECTION_HEADER) classes.UNKNOWN_SECTION_HEADER += 1;
    else if (w.code === BLOCK_DISAPPEARED) classes.BLOCK_DISAPPEARED += 1;
  }

  const total =
    classes.FIELD_UNREADABLE + classes.UNKNOWN_SECTION_HEADER + classes.BLOCK_DISAPPEARED;
  return { total, classes };
}
