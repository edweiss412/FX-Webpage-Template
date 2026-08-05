/**
 * The warning partition: which catalog codes are PARSE WARNINGS.
 *
 * BL-CATALOG-PARTITION-WARNING-CLASS inverted the direction of this fact. It
 * used to be derived — the gallery filtered `INTERNAL_CODE_ENUMS` for a
 * `parse_warnings.code` provenance string, so the answer was whatever a source
 * scanner could see. That scanner recognises warnings by TYPE, which is strong,
 * but it is still blind wherever the type is erased: an `any`, a higher-order
 * factory, a code built through a helper it cannot follow. A code it missed was
 * absent from the gallery and nothing said otherwise.
 *
 * Now the CATALOG declares the class on each row and the scanner CROSS-CHECKS
 * it. The declaration is the source of truth for consumers; the scanner is the
 * thing that fails when the declaration and the code drift apart, in either
 * direction and by name.
 *
 * DOCUMENTED LIMIT — what this cross-check cannot see (Codex R4).
 *
 * It compares two SETS: what the scanner constructed, and what the catalog
 * declares. That catches a code the scanner sees and the catalog does not class
 * (and the reverse). It does NOT catch a code the scanner cannot see AT ALL.
 *
 * Concretely: build a `ParseWarning` through an `any` and assign it, and the
 * scanner emits neither a code nor an unresolvable-site signal. The catalog row
 * still says `general`, both sets agree, and the code stays absent from the
 * gallery — silently.
 *
 * SO THE INVERSION MOVED THIS DEFECT RATHER THAN CLOSING IT, and saying so is
 * the point. Before, a scanner-blind code was missing from the gallery because
 * the gallery was derived from the scanner. Now it is missing because a human
 * classed it `general` and nothing contradicts them. What genuinely improved:
 * the answer is now WRITTEN DOWN per row and reviewable in a diff, and any
 * disagreement between the written answer and the constructing code fails by
 * name. What did not improve: neither side can know a code that no side sees.
 *
 * Closing it needs a different instrument — a type-level rule forbidding an
 * `any`-typed `ParseWarning` construction, enforced where the assignment
 * happens rather than where the catalog is read. That is a lint surface, not a
 * set comparison, and it is deliberately not attempted here.
 *
 * CATALOG-INTERNAL. `warningClass` follows the `triggerContext` precedent: a
 * field the catalog carries for its own consumers, not §12.4 prose. No lockstep
 * triple, and `tests/cross-cutting/codes.test.ts` (the x1 gate) is untouched —
 * which the test suite asserts rather than assumes.
 */
import { INTERNAL_CODE_ENUMS } from "./__generated__/internal-code-enums";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "./catalog";

/** The closed, total partition over catalog rows. */
export type WarningClass = "parse_warning" | "general";

/** The provenance token the extractor stamps on a parse-warning code. */
const PARSE_WARNING_SOURCE = "parse_warnings.code";

/**
 * Codes the SOURCE SCANNER believes are parse warnings.
 *
 * Membership, not equality: `source` is a comma-joined provenance list, and a
 * code that is both a parse warning and an admin alert is still a parse warning.
 * Equality silently dropped three such codes when this logic lived in the
 * gallery (lib/dev/attentionScenarios/tier1.ts).
 */
export function scannerParseWarningCodes(
  enums: Record<string, { source: string }> = INTERNAL_CODE_ENUMS,
): string[] {
  return Object.entries(enums)
    .filter(([, v]) => v.source.split(",").includes(PARSE_WARNING_SOURCE))
    .map(([code]) => code)
    .sort();
}

/** Codes the CATALOG declares as parse warnings. The source of truth for consumers. */
export function catalogParseWarningCodes(
  catalog: Record<string, MessageCatalogEntry> = MESSAGE_CATALOG,
): string[] {
  return Object.values(catalog)
    .filter((e) => e.warningClass === "parse_warning")
    .map((e) => e.code)
    .sort();
}

export type PartitionCrossCheck = {
  /** Scanner says parse warning, catalog does not. The gallery would drop these. */
  constructedButUnlisted: string[];
  /** Catalog says parse warning, no source constructs one. A row asserting a fiction. */
  listedButNeverConstructed: string[];
};

/**
 * Compare the declaration against the source, in BOTH directions.
 *
 * Returns every mismatch rather than the first: a check that stopped early would
 * drip one finding per run, which is the retail convergence the class-sweep rule
 * exists to prevent.
 *
 * A scanner code with NO catalog row at all counts as `constructedButUnlisted`.
 * That case is worth stating because the naive filter gets it wrong in the quiet
 * direction — an absent row and a `general` row are both falsy, so an unmatched
 * code would agree with nothing instead of being reported.
 */
export function crossCheckWarningPartition(
  input: {
    scanner?: string[];
    catalog?: Record<string, MessageCatalogEntry>;
  } = {},
): PartitionCrossCheck {
  const catalog = input.catalog ?? MESSAGE_CATALOG;
  const scanner = input.scanner ?? scannerParseWarningCodes();
  const declared = new Set(catalogParseWarningCodes(catalog));
  const constructed = new Set(scanner);

  return {
    constructedButUnlisted: [...constructed].filter((c) => !declared.has(c)).sort(),
    listedButNeverConstructed: [...declared].filter((c) => !constructed.has(c)).sort(),
  };
}
