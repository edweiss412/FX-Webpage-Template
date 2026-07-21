/**
 * Admin-log-only §12.4 codes (null dougFacing/crewFacing) that ALSO render on
 * the operator warning cards via catalog `title` + `helpfulContext` +
 * `triggerContext` (spec 2026-07-20-warning-card-copy-restore §3.1). Every
 * gate that enforces the "admin-log-only ⇒ user-facing fields null" invariant
 * imports THIS set for its carve-out; the required-non-null side is pinned by
 * tests/messages/_metaWarningCardCopy.test.ts. Single source of truth.
 */
export const CARD_SURFACED_LOG_ONLY: ReadonlySet<string> = new Set([
  "FIELD_UNREADABLE",
  "SECTION_HEADER_NO_FIELDS",
  "UNKNOWN_SECTION_HEADER",
]);
