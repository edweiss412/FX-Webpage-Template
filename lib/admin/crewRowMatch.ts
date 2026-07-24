// lib/admin/crewRowMatch.ts
//
// Id-matched crew-row fan-out resolver (spec
// docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md §6.3).
//
// Pure, id-only placement math for the AMBIGUOUS_EMAIL_BINDING banner: given the
// alert's involved crew ids and the ids of the RENDERED crew rows, return the
// row indexes to fan the banner into, or null to fall back to one section-top
// banner. Names never enter this layer — matching is by DB id, so a rename or a
// display-name collision can neither move nor double-place a banner.
import { CREW_CAP } from "@/components/admin/wizard/step3ReviewSections";

/**
 * §6.3 completeness rule (set-correspondence, NOT a count comparison). Returns
 * the matched RENDERED-row indexes (ascending) iff every expected id maps to
 * EXACTLY one rendered row; null otherwise.
 *
 * Degenerate-input guards run FIRST — an empty id list, a duplicate WITHIN the
 * expected ids, or an `expectedCount` that disagrees with the id-list length is
 * a malformed caller: conservation demands the section-top fallback (null),
 * never a silent no-placement or a doubled index. `expectedCount` is CONSUMED
 * here (carried from derivation), never re-derived.
 */
export function crewRowIndexesForIds(
  expected: { crewMemberIds: readonly string[]; expectedCount: number },
  shownCrewIds: readonly string[],
): number[] | null {
  const { crewMemberIds, expectedCount } = expected;
  if (crewMemberIds.length === 0) return null;
  if (new Set(crewMemberIds).size !== crewMemberIds.length) return null;
  if (expectedCount !== crewMemberIds.length) return null;

  const matched: number[] = [];
  for (const id of crewMemberIds) {
    let hitIndex = -1;
    let hits = 0;
    shownCrewIds.forEach((sid, i) => {
      if (sid === id) {
        hits += 1;
        hitIndex = i;
      }
    });
    // hits(id) must be EXACTLY 1 for every id: hits===0 (row beyond CREW_CAP,
    // roster drift, id absent) or hits>1 (degenerate duplicate rendered id) →
    // section-top for the whole item.
    if (hits !== 1) return null;
    matched.push(hitIndex);
  }
  // Distinct by construction (each rendered index carries one id), but pin the
  // conservation invariant explicitly.
  if (matched.length !== expectedCount) return null;
  return matched.sort((a, b) => a - b);
}

/**
 * Partial application over a show's roster ids for the modal's one-line wiring:
 * `crewRowIndexesForIds: buildCrewRowResolver(crewIds)`. Applies the CREW_CAP
 * slice internally so an involved row rendered BEYOND the cap resolves to null
 * (section-top) — the resolver only ever sees the shown slice.
 */
export function buildCrewRowResolver(
  crewIds: readonly string[],
): (expected: { crewMemberIds: readonly string[]; expectedCount: number }) => number[] | null {
  const shown = crewIds.slice(0, CREW_CAP);
  return (expected) => crewRowIndexesForIds(expected, shown);
}
