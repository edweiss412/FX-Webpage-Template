/**
 * `namesRefer` — does a parsed hotel-guest name and a roster viewer name refer to
 * the SAME person? Used by `getShowForViewer`'s per-viewer hotel-visibility filter
 * (replacing a naive `guest.includes(viewer)` substring that under-matched ~5 of 7
 * shows). Spec: docs/superpowers/specs/2026-06-26-hotel-viewer-name-match.md.
 *
 * The filter is UX, NOT a security boundary (owner determination 2026-05-23 — the
 * picker is a free self-identify over the full roster; getShowForViewer fetches via
 * service-role). So the matcher is LENIENT: UNDER-match (hides a viewer's own
 * hotel) is the harm; OVER-match (an extra, already-reachable card) is benign.
 * Hence the multi-token rule is SURNAME-only — it catches every nickname/legal-name
 * form (Bill↔William, Doug↔Douglas, DJ↔David) while distinct surnames still exclude
 * unrelated same-first-name people (Eric Carroll ↮ Eric Weiss).
 */

// Generational suffixes stripped before tokenizing ("William Werner Jr" → werner).
const SUFFIX_RE = /\b(?:jr|sr|ii|iii|iv)\b/g;

/** Normalize a single-person name to lowercase letter tokens: fold diacritics
 * (NFD + strip combining marks → José == Jose == decomposed), drop suffixes, keep
 * hyphens inside tokens, split on whitespace/comma. */
function toks(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(SUFFIX_RE, " ")
    .replace(/[^\p{L}\s-]/gu, "")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

/** Two tokens are compatible if equal or one is a prefix of the other — covers
 * same-initial nicknames (doug⊂douglas) AND initials (w⊂weiss, e⊂eric). */
function tokCompat(x: string, y: string): boolean {
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** Whether two SINGLE-person name strings refer to the same person. */
function refersSingle(a: string, b: string): boolean {
  const A = toks(a);
  const B = toks(b);
  if (A.length === 0 || B.length === 0) return false;
  // A single-token name (a first-name-only guest "Carl", or a lone surname) matches
  // the other name's first OR last token.
  if (A.length === 1) return tokCompat(A[0]!, B[0]!) || tokCompat(A[0]!, B[B.length - 1]!);
  if (B.length === 1) return tokCompat(B[0]!, A[0]!) || tokCompat(B[0]!, A[A.length - 1]!);
  // Both multi-token: SURNAME-compatible. The first name is intentionally not
  // required — non-prefix nicknames (Bill↔William) share neither a prefix nor a
  // first letter yet are the same person; distinct surnames still exclude.
  return tokCompat(A[A.length - 1]!, B[B.length - 1]!);
}

/**
 * Whether two names refer to the same person. Either side may be a `/`-merged
 * multi-person string (legacy persisted `hotel_reservations.names` rows hold the
 * un-split "David Johnson / Jeffrey Justice"; the parser slash-split only cleans
 * future re-ingestions). Splitting on `/` at match time makes those legacy rows
 * match without a backfill. Symmetric.
 */
export function namesRefer(a: string, b: string): boolean {
  return a.split("/").some((pa) => b.split("/").some((pb) => refersSingle(pa, pb)));
}
