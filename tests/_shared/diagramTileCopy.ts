/**
 * The two ratified diagram-tile failure sentences, for the census suites that
 * assert WHICH failed state a tile landed in.
 *
 * Ratified 2026-08-28 (DEFERRED.md DIAGRAMTILE-FAILURE-STATE-COPY-1). Straight
 * apostrophes, because the ratified strings carry them; the corpus holds both
 * forms and no guard decides it, so the spec settles it rather than leaving it
 * to whoever types the next string.
 *
 * WHY THIS IS SHARED, and why it is not tautological. These are test-side
 * literals typed by hand once, not the shipped constant: importing
 * `DIAGRAM_TILE_FAILURE_COPY` from the component would assert each string
 * against itself and a wrong sentence would ship green. Seventeen hand-copied
 * literals across five suites is a typo surface with no upside, and the
 * DECIDING suite for the copy itself is
 * tests/components/admin/wizard/step3DiagramTile.states.test.tsx, which
 * deliberately keeps its OWN independent literals. So a wrong sentence still
 * fails there even if this file were edited to agree with it.
 *
 * What the census suites are for is the STATE — that a tile driven to `absent`
 * says the absent thing and not the load-failed thing. The string is their
 * handle on the state, not their subject.
 */
export const DIAGRAM_TILE_COPY = {
  /** Seeded, before any request: the source does not resolve. */
  absent: "Not captured. Won't appear on the crew page.",
  /** Written, and only ever by a real error on an image that mounted. */
  loadFailed: "Preview couldn't load. The diagram will still publish.",
} as const;

/** Every failure sentence, for the live-negatives that assert a tile is showing
 *  none of them. Asserting the absence of ONE sentence stopped discriminating
 *  the moment there were two. */
export const DIAGRAM_TILE_FAILURE_SENTENCES: readonly string[] = [
  DIAGRAM_TILE_COPY.absent,
  DIAGRAM_TILE_COPY.loadFailed,
];
