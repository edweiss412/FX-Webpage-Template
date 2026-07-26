import type { JSX } from "react";

/**
 * components/shared/NewTabHint.tsx — visually-hidden new-tab suffix for external
 * links (spec 2026-07-25-newtab-announcement-family §2.1).
 *
 * A `↗` glyph or external-link icon tells sighted users a link leaves the page,
 * but every such glyph in this codebase is aria-hidden, so screen-reader users
 * heard only the destination. This supplies the missing announcement.
 *
 * MUST be preceded by a real sibling space text node (§3.1):
 *
 *     {label} <NewTabHint />        // correct
 *     {label}{" "}<NewTabHint />    // correct, prettier-equivalent
 *
 * A space written INSIDE the span is dropped by the accessible-name
 * implementations Testing Library uses (both installed dom-accessibility-api
 * versions), producing "Open in Sheet(…)". Anchored accessible-name assertions
 * in the test suite pin the boundary.
 *
 * Do NOT add this to an element that already has an aria-label: the label
 * replaces the accessible name, so the span would be dead markup. Extend the
 * label string instead (§2).
 *
 * The copy string lives here and only here, so it cannot drift across the 15
 * call sites. Keep it out of this comment: the structural guard's census counts
 * occurrences in source.
 */
export function NewTabHint(): JSX.Element {
  return <span className="sr-only">(opens in a new tab)</span>;
}
