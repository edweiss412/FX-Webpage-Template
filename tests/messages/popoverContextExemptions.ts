/**
 * tests/messages/popoverContextExemptions.ts
 *
 * Ledger of catalog codes whose "?" help popover intentionally carries NO
 * `helpfulContext` (a Learn-more-only popover is a legitimate design state per
 * `buildHelpPopoverBody`, components/admin/compactAlertHelp.tsx). A code with a
 * non-null `helpHref` that ships no popover copy MUST either author
 * `helpfulContext` or appear here with a written reason; the coverage gate
 * (_metaPopoverContextCoverage.test.ts) fails by default otherwise.
 *
 * Ships EMPTY: every popover-reachable code currently authors real copy.
 */
export const POPOVER_CONTEXT_EXEMPT: ReadonlyArray<{ code: string; reason: string }> = [];
