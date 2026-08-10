/**
 * lib/admin/archiveCopy.ts — the archive refusal classification and the copy
 * every archive surface speaks (admin-dashboard-row-actions Task 5).
 *
 * Two surfaces now archive a show: the per-show page's `ArchiveShowButton` and
 * the dashboard row's ⋮ menu. A destructive confirm that says one thing in one
 * place and something else in the other is the defect this module removes —
 * the same multi-surface copy rule that put the undo sentence in exactly one
 * place (components/admin/undoAnnounceContext.ts).
 *
 * EXTRACTION, not redesign: the classification and the three sentences are the
 * behavior `ArchiveShowButton` already shipped, and
 * `tests/components/admin/ArchiveShowButton.test.tsx` passes unmodified across
 * the move (the plan's second extraction fence).
 */

/**
 * §12.4 codes an archive refusal may surface through the catalog.
 * `ADMIN_LINK_SHOW_NOT_FOUND` is RETIRED — a `show_not_found` result renders
 * the refresh prompt below, never a `messageFor` lookup.
 */
const KNOWN_REFUSAL_CODES = new Set(["FINALIZE_OWNED_SHOW", "SHOW_ARCHIVED_IMMUTABLE"]);

export type ArchiveFailure =
  /** A §12.4 code: render catalog copy (invariant 5). */
  | { kind: "catalog"; code: string }
  /** The generic not-found sentinel: the row is gone, so refresh. */
  | { kind: "not_found" }
  /** `infra_error` and any unmapped sentinel: plain-language retry prose.
   *  NEVER passed to `messageFor` — these are not §12.4 codes. */
  | { kind: "generic" };

export function classifyArchiveFailure(code: string): ArchiveFailure {
  if (code === "show_not_found") return { kind: "not_found" };
  if (KNOWN_REFUSAL_CODES.has(code)) return { kind: "catalog", code };
  return { kind: "generic" };
}

/** The retired-code branch: a stale tab pointing at a deleted or renamed show. */
export const ARCHIVE_NOT_FOUND_COPY =
  "We couldn’t find this show anymore. Refresh the page and try again.";

/** The unmapped-sentinel branch (`infra_error`): no raw code reaches the DOM. */
export const ARCHIVE_GENERIC_ERROR_COPY =
  "Archiving didn’t go through. Try again in a moment; if it keeps failing, contact the developer.";

/**
 * The consequence a destructive archive confirm must state. Names the show when
 * one is known — a confirm that cannot say WHICH show is a confirm the admin
 * cannot audit — and degrades to the unnamed sentence for partial data, which
 * is normal while a row is being edited.
 */
export function archiveConsequenceProse(showName: string | null | undefined): string {
  const named = showName?.trim();
  return named
    ? `Crew links for “${named}” stop working now and won’t come back until you re-publish and issue a new link.`
    : "Crew links stop working now and won’t come back until you re-publish and issue a new link.";
}
