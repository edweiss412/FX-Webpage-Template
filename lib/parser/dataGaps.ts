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
 * The three data-quality warning codes, single-sourced. `shows_internal.parse_warnings`
 * is NOT limited to these — other producers persist `warn`-severity warnings whose
 * `.message` may BE the raw code (e.g. asset `reelWarning()` returns
 * `{ severity:"warn", code, message: code }`). Any surface that renders a warning's
 * `.message` (the per-show Data-Quality panel) MUST gate on this set first, or it would
 * print a raw §12.4 code (invariant 5) and misclassify a non-data-quality warning under
 * "Data quality". Whole-diff review R1 [high].
 */
export const DATA_GAP_CODES: ReadonlySet<string> = new Set([
  FIELD_UNREADABLE,
  UNKNOWN_SECTION_HEADER,
  BLOCK_DISAPPEARED,
]);

/** True when `w` is a `warn`-severity data-quality warning (one of the three DQ codes). */
export function isDataQualityWarning(w: ParseWarning | null | undefined): boolean {
  return !!w && w.severity === "warn" && DATA_GAP_CODES.has(w.code);
}

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

/**
 * Human, operator-facing label for each data-quality class — used by the
 * per-class detail rendered on the Step-3 card, the /admin/unpublished chip,
 * and the per-show panel. These are PLAIN-LANGUAGE labels, never the raw code
 * literal (invariant 5: no raw §12.4 codes in UI). Single-sourced here so every
 * surface reads the same wording.
 */
export const DATA_GAP_CLASS_LABELS: Record<keyof DataGapsSummary["classes"], string> = {
  FIELD_UNREADABLE: "unreadable field",
  UNKNOWN_SECTION_HEADER: "unknown section",
  BLOCK_DISAPPEARED: "removed section",
};

/**
 * Flatten a summary into ordered per-class detail entries with a count > 0,
 * pairing the human label with its count and the plural form. Surfaces map this
 * into chips / list items so the per-class breakdown (NOT just a total) is
 * single-sourced and consistently ordered. Empty when `total === 0`.
 */
export function dataGapClassDetails(
  summary: DataGapsSummary,
): Array<{ key: keyof DataGapsSummary["classes"]; count: number; label: string }> {
  const order: Array<keyof DataGapsSummary["classes"]> = [
    "FIELD_UNREADABLE",
    "UNKNOWN_SECTION_HEADER",
    "BLOCK_DISAPPEARED",
  ];
  const out: Array<{ key: keyof DataGapsSummary["classes"]; count: number; label: string }> = [];
  for (const key of order) {
    const count = summary.classes[key];
    if (count > 0) {
      const base = DATA_GAP_CLASS_LABELS[key];
      out.push({ key, count, label: count === 1 ? base : `${base}s` });
    }
  }
  return out;
}
