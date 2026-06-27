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

/**
 * Operator-actionable, source-anchorable parse-warning codes. These get a
 * source-sheet "Open in Sheet" deep link on the review surfaces. DISJOINT in
 * meaning from DATA_GAP_CODES (the count-only digest) — though FIELD_UNREADABLE
 * is intentionally in BOTH (keeps its data-gap count AND gains a region link).
 * lib/drive/showDayTimeAnchors.ts uses this SAME object as the anchor-population
 * gate (CELL_ANCHORED_CODES), so the render gate and the population gate cannot
 * drift.
 */
export const OPERATOR_ACTIONABLE_ANCHORED: ReadonlySet<string> = new Set([
  "SCHEDULE_TIME_UNPARSED",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_DAY_RESTRICTION",
  "UNKNOWN_FIELD",
  "STAGE_WORD_AUTOCORRECTED",
  "ROLE_TOKEN_AUTOCORRECTED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "SECTION_HEADER_AUTOCORRECTED",
  "AGENDA_GRID_MALFORMED",
  "AGENDA_BLOCK_UNRESOLVED",
  "AGENDA_DAY_AMBIGUOUS",
  "AGENDA_DAY_TRUNCATED",
  "AGENDA_DAY_EMPTIED",
  "PULL_SHEET_PARSE_PARTIAL",
  "PULL_SHEET_AMBIGUOUS_FORMAT",
  "PULL_SHEET_UNKNOWN_VARIANT",
  FIELD_UNREADABLE,
]);

/**
 * Select the operator-actionable warnings for a durable review surface:
 * filter to OPERATOR_ACTIONABLE_ANCHORED (warn-severity only), PRESERVE parse
 * order, and dedup by (code, resolved-anchor-A1). A cascade of same-cell
 * warnings (one per unknown token) collapses to one line; warnings WITHOUT a
 * resolved sourceCell are NEVER deduped (the synthesis-unstable blockRef.index
 * is never a dedup key), so no actionable row is ever hidden.
 */
export function operatorActionableWarnings(
  warnings: readonly ParseWarning[] | null | undefined,
): ParseWarning[] {
  if (!warnings) return [];
  const out: ParseWarning[] = [];
  const seen = new Set<string>();
  for (const w of warnings) {
    if (w.severity !== "warn") continue;
    if (!OPERATOR_ACTIONABLE_ANCHORED.has(w.code)) continue;
    const a1 = w.sourceCell?.a1;
    if (a1) {
      const key = `${w.code}\0${w.sourceCell!.gid}\0${a1}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(w);
  }
  return out;
}
