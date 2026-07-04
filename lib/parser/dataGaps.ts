/**
 * summarizeDataGaps — single-sourced count logic for the data-quality surfaces
 * (parse-data-quality-warnings §6).
 *
 * The three data-quality ParseWarning codes (FIELD_UNREADABLE,
 * UNKNOWN_SECTION_HEADER, BLOCK_DISAPPEARED) are surfaced at the operator
 * surfaces (staged card, wizard Step 3, changes feed, SHOW_FIRST_PUBLISHED
 * digest, per-show panel). Every surface derives its count
 * from THIS helper so the logic is single-sourced — tests assert against the
 * helper's input array (the data source), never the rendered output.
 *
 * Lives in lib/parser (next to the warning codes + ParseWarning type) so both
 * the admin loaders and the UI can import it without a parser→admin dependency.
 */

import { FIELD_UNREADABLE } from "@/lib/parser/warnings";
import type { ParseWarning } from "@/lib/parser/types";

/**
 * GAP_CLASSES — the single source of truth for the data-quality gap class. Each
 * entry pairs a persisted `warn`-severity ParseWarning code that means "sheet data
 * didn't land / couldn't be resolved" with its PLAIN-LANGUAGE label (invariant 5 —
 * never the raw code). Ordered: this array drives set membership, the `GapCode`
 * union, the labels map, AND the `dataGapClassDetails` / `formatDataGapBreakdown`
 * display order. Curated allow-list (NOT "all warn-severity" — five autocorrect
 * codes are warn yet benign); see the spec's §2 for the verified taxonomy and the
 * drift-guard meta-test (tests/parser/dataGapsClassCompleteness.test.ts) that pins
 * the full 42-code persisted-ParseWarning partition.
 */
export const GAP_CLASSES = [
  { code: "FIELD_UNREADABLE", label: "unreadable field" },
  { code: "UNKNOWN_SECTION_HEADER", label: "unknown section" },
  { code: "BLOCK_DISAPPEARED", label: "removed section" },
  { code: "UNKNOWN_FIELD", label: "unrecognized field" },
  { code: "SCHEDULE_TIME_UNPARSED", label: "unreadable schedule time" },
  { code: "UNKNOWN_ROLE_TOKEN", label: "unrecognized role" },
  { code: "UNKNOWN_DAY_RESTRICTION", label: "unrecognized day restriction" },
  { code: "SECTION_HEADER_NO_FIELDS", label: "empty section" },
  { code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE", label: "strike date off schedule" },
  { code: "TRAVEL_FLIGHT_UNPARSEABLE", label: "unreadable flight" },
  { code: "TRAVEL_FLIGHT_NAME_UNMATCHED", label: "unmatched flight passenger" },
  { code: "TRAVEL_FLIGHT_AMBIGUOUS_TABLE", label: "ambiguous flight table" },
  { code: "AGENDA_GRID_MALFORMED", label: "malformed agenda grid" },
  { code: "AGENDA_BLOCK_UNRESOLVED", label: "unresolved agenda block" },
  { code: "AGENDA_DAY_AMBIGUOUS", label: "ambiguous agenda day" },
  { code: "AGENDA_DAY_TRUNCATED", label: "truncated agenda day" },
  { code: "AGENDA_DAY_EMPTIED", label: "empty agenda day" },
  { code: "AGENDA_PDF_UNREADABLE", label: "unreadable agenda PDF" },
  { code: "AGENDA_LINK_NOT_CLICKABLE", label: "unreachable agenda link" },
  { code: "PULL_SHEET_PARSE_PARTIAL", label: "partial pull sheet" },
  { code: "PULL_SHEET_AMBIGUOUS_FORMAT", label: "ambiguous pull sheet" },
  { code: "PULL_SHEET_UNKNOWN_VARIANT", label: "unrecognized pull sheet" },
] as const;

export type GapCode = (typeof GAP_CLASSES)[number]["code"];

export type DataGapsSummary = {
  total: number;
  classes: Record<GapCode, number>;
};

/**
 * The data-quality gap codes, single-sourced from GAP_CLASSES. `shows_internal.parse_warnings`
 * is NOT limited to these — other producers persist `warn`-severity warnings (autocorrects,
 * asset/diagram codes) whose `.message` may BE the raw code. Any surface that renders a
 * warning's `.message` MUST gate on this set first, or it would print a raw §12.4 code
 * (invariant 5) and misclassify a non-gap warning under "Data quality".
 */
export const DATA_GAP_CODES: ReadonlySet<string> = new Set(GAP_CLASSES.map((g) => g.code));

/** Fresh, all-keys-zero `classes` record (every GapCode → 0). */
const zeroClasses = (): Record<GapCode, number> =>
  Object.fromEntries(GAP_CLASSES.map((g) => [g.code, 0])) as Record<GapCode, number>;

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
  const classes = zeroClasses();
  if (!warnings) return { total: 0, classes };

  let total = 0;
  for (const w of warnings) {
    if (w.severity === "info") continue; // #289 contract: skip only info (missing severity counts)
    if (DATA_GAP_CODES.has(w.code)) {
      classes[w.code as GapCode] += 1;
      total += 1;
    }
  }
  return { total, classes };
}

/**
 * Human, operator-facing label for each data-quality class — used by the
 * per-class detail rendered on the Step-3 card and the per-show panel. These
 * are PLAIN-LANGUAGE labels, never the raw code
 * literal (invariant 5: no raw §12.4 codes in UI). Single-sourced here so every
 * surface reads the same wording.
 */
export const DATA_GAP_CLASS_LABELS: Record<GapCode, string> = Object.fromEntries(
  GAP_CLASSES.map((g) => [g.code, g.label]),
) as Record<GapCode, string>;

/**
 * Flatten a summary into ordered per-class detail entries with a count > 0,
 * pairing the human label with its count and the plural form. Surfaces map this
 * into chips / list items so the per-class breakdown (NOT just a total) is
 * single-sourced and consistently ordered. Empty when `total === 0`.
 */
export function dataGapClassDetails(
  summary: DataGapsSummary,
): Array<{ key: GapCode; count: number; label: string }> {
  const out: Array<{ key: GapCode; count: number; label: string }> = [];
  for (const { code, label } of GAP_CLASSES) {
    const count = summary.classes[code];
    if (count > 0) {
      out.push({ key: code, count, label: count === 1 ? label : `${label}s` });
    }
  }
  return out;
}

/**
 * Bounded, human breakdown string for a summary. Ordering: count desc, then
 * GAP_CLASSES registry order (stable tiebreak). Caps at `cap` classes; the
 * remaining classes collapse to "+N more". Used by ALL THREE count-bearing
 * surfaces (badge aria-label/title, per-show alert sub-line, held-row
 * DataGapsChip title) so none is ever unbounded. Empty string when `cap <= 0`
 * or the summary has no gaps (callers already gate on `total > 0`).
 */
export function formatDataGapBreakdown(summary: DataGapsSummary, cap = 4): string {
  if (cap <= 0 || summary.total === 0) return "";
  // dataGapClassDetails is already in registry order; Array.sort is stable, so
  // equal counts preserve registry order (deterministic tiebreak).
  const sorted = [...dataGapClassDetails(summary)].sort((a, b) => b.count - a.count);
  const shown = sorted.slice(0, cap);
  const remainder = sorted.length - shown.length;
  const base = shown.map((d) => `${d.count} ${d.label}`).join(", ");
  return remainder > 0 ? `${base}, +${remainder} more` : base;
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
  "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_DAY_RESTRICTION",
  "UNKNOWN_FIELD",
  "STAGE_WORD_AUTOCORRECTED",
  "ROLE_TOKEN_AUTOCORRECTED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "SECTION_HEADER_AUTOCORRECTED",
  "FIELD_LABEL_AUTOCORRECTED",
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
 * is generally never a dedup key), so no actionable row is ever hidden.
 *
 * EXCEPTION (idx32/#154): FIELD_UNREADABLE warnings for DISTINCT crew rows can
 * share ONE fallback anchor A1 — for duplicate crew names the per-row name-based
 * cell can't be uniquely resolved, so both rows degrade to the shared crew-region
 * anchor. For FIELD_UNREADABLE ONLY, the per-row blockRef.index is folded into the
 * dedup key so genuinely-distinct rows are not collapsed. The index is stable
 * within a single render pass, and adding it can only REDUCE collapsing (never
 * hide a row), so the "no actionable row is ever hidden" guarantee still holds.
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
      // Fold the per-row index into the key for FIELD_UNREADABLE so two distinct crew
      // rows that share a fallback region anchor (e.g. duplicate crew names) are NOT
      // collapsed into one line. Other codes keep the a1-only key (idx32/#154).
      const rowDisc =
        w.code === FIELD_UNREADABLE && w.blockRef?.index != null ? `\0${w.blockRef.index}` : "";
      const key = `${w.code}\0${w.sourceCell!.gid}\0${a1}${rowDisc}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(w);
  }
  return out;
}

/**
 * Read-time compatibility shim (Part D). Warnings persisted BEFORE per-row
 * anchoring carry a stale block-RANGE sourceCell (encode_range → contains ":") and
 * no per-row identity; the admin surface would keep collapsing them and rendering
 * the wrong block-header link until a re-parse rewrites the jsonb (which never
 * happens for an unchanged sheet). Clear that stale anchor at read time so legacy
 * rows behave like ambiguous rows: not deduped (count corrects) and link-less.
 * NO-OP once re-parsed — Part C anchors are single cells (encode_cell → no ":")
 * and ambiguous rows are null, so the range-":" fingerprint is the exact legacy
 * signature (never misfires on a new single-cell/null anchor, incl. empty name).
 */
export function stripLegacyUnknownFieldAnchors(
  warnings: readonly ParseWarning[] | null | undefined,
): ParseWarning[] {
  if (!warnings) return [];
  return warnings.map((w) =>
    w.code === "UNKNOWN_FIELD" &&
    typeof w.sourceCell?.a1 === "string" &&
    w.sourceCell.a1.includes(":")
      ? { ...w, sourceCell: null }
      : w,
  );
}

/**
 * The read-boundary seam for persisted parse_warnings feeding the operator-
 * actionable Data-quality panel: neutralize stale legacy UNKNOWN_FIELD anchors,
 * THEN filter+dedup. All three persisted-read surfaces use this one function —
 * the per-show page (app/admin/show/[slug]/page.tsx), the live first-seen staged
 * page (app/admin/show/staged/[stagedId]/page.tsx), and the wizard reapply page
 * (app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx) — so the
 * legacy behavior is defined (and tested) in exactly one place (audit idx45/#217).
 */
export function selectActionableForDisplay(
  warnings: readonly ParseWarning[] | null | undefined,
): ParseWarning[] {
  return operatorActionableWarnings(stripLegacyUnknownFieldAnchors(warnings));
}
