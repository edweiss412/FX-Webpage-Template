/**
 * lib/visibility/transportTransitions.ts — §8.1 TransportTile
 * reassignment transition matrix (M4 Task 4.12 Batch 2 Step 4b).
 *
 * TransportTile visibility is OR'd over two branches per spec §8.1:
 *
 *   1. `namesRefer(transportation.driver_name, viewer.name)` — the
 *      assigned driver sees their own ride card (name-aware match;
 *      `driver_name` is free-text, BL-TRANSPORT-VIEWER-NAME-MATCH).
 *   2. The viewer's name refers to a name in any per-day schedule entry's
 *      `assigned_names[]` — passengers and co-drivers tagged on a leg
 *      see the tile so they know which vehicle / driver / parking
 *      they're paired with.
 *
 * The visibility predicate (`transportTileVisible` in
 * `lib/visibility/scopeTiles.ts`) returns:
 *
 *   visible = isAdmin || driverNameMatch || anyScheduleTagMatch
 *
 * For a non-admin viewer, the surface state can be modeled as a
 * 2-dimensional boolean: `(driverNameMatch, anyScheduleTagMatch)`.
 * That gives 4 possible starting states; transitions between them
 * yield C(4, 2) = 6 unordered pairs, each with a §8.1 treatment.
 *
 * The four starting states:
 *
 *   FF = (false, false) — tile hidden.
 *   TF = (true,  false) — tile visible via driver branch.
 *   FT = (false, true)  — tile visible via schedule-tag branch.
 *   TT = (true,  true)  — tile visible via both.
 *
 * Each transition's treatment per the dispatch spec lines 526-546:
 *
 *   FF → TF: viewer becomes driver via sheet edit. AnimatePresence
 *            mount (fade in).
 *   FF → FT: viewer added to schedule[*].assigned_names[]. Same
 *            fade-in mount.
 *   TF → FF: viewer removed as driver. Fade out (AnimatePresence
 *            unmount).
 *   FT → FF: viewer removed from every assigned_names[]. Same fade-out.
 *   TF ↔ FT: net result stays true, reason changed. Tile stays mounted
 *            (no AnimatePresence cycle); body MAY pulse on the changed
 *            field. Tile MUST NOT flicker.
 *   TT → TF: schedule-tag branch flipped false but driver still true.
 *            Tile stays mounted; body pulses on changed field.
 *   TT → FT: driver branch flipped false but schedule-tag still true.
 *            Same stay-mounted treatment.
 *   TT → FF: both branches flip false in single sync. Tile fades out.
 *
 * The matrix below records the 6 unordered pairs. Each row also
 * carries the `treatment` constant that the (future) TransportTile
 * AnimatePresence wiring will read to choose between
 * `fade-in-mount`, `fade-out-unmount`, `stay-mounted-pulse`, and
 * `unreachable`. (Currently no entry uses unreachable — every pair is
 * reachable through sheet edits.)
 *
 * Pure data + a tiny lookup helper. No I/O, no environment reads.
 * Server-safe.
 */

/**
 * Two-axis branch state. The string-literal union keeps the matrix
 * grep-friendly and forces typo-safety in tests.
 */
export type TransportBranchState =
  /** (false, false) — tile hidden. */
  | "FF"
  /** (true, false) — tile visible via driver branch only. */
  | "TF"
  /** (false, true) — tile visible via schedule-tag branch only. */
  | "FT"
  /** (true, true) — tile visible via both branches. */
  | "TT";

/**
 * Animation treatments for §8.1 transport branch transitions. Mirrors
 * the §8.2 RightNow treatment enum but applies to the TransportTile's
 * own AnimatePresence (the tile mounts / unmounts at the grid level
 * when visibility flips; per the spec, it MUST NOT flicker when
 * branches swap reason without changing net visibility).
 */
export type TransportTreatment =
  /** Tile becomes visible — fade in via AnimatePresence mount. */
  | "fade-in-mount"
  /** Tile becomes hidden — fade out via AnimatePresence unmount. */
  | "fade-out-unmount"
  /**
   * Net visibility stays true (or true→true with a branch change).
   * Tile stays mounted; the body MAY pulse the changed field.
   * AnimatePresence MUST NOT cycle (no flicker).
   */
  | "stay-mounted-pulse"
  /** Reserved for future use; no current pair uses this. */
  | "unreachable";

export interface TransportTransitionEntry {
  from: TransportBranchState;
  to: TransportBranchState;
  treatment: TransportTreatment;
  reason: string;
}

/**
 * The full 6-entry unordered transport transition matrix
 * (C(4, 2) = 6). Each row is one unordered pair of branch states; the
 * `treatment` is the AnimatePresence behavior for the FORWARD
 * direction shown (`from → to`). The reverse direction's treatment is
 * derived by `directedTransportTreatment` (helper below) using the
 * obvious inversion rules:
 *
 *   fade-in-mount      ↔ fade-out-unmount   (mount and unmount are
 *                                            inverses of each other)
 *   stay-mounted-pulse  symmetric           (no AnimatePresence cycle
 *                                            in either direction)
 *   unreachable         symmetric
 */
export const TRANSPORT_TRANSITION_MATRIX: TransportTransitionEntry[] = [
  {
    from: "FF",
    to: "TF",
    treatment: "fade-in-mount",
    reason:
      "Viewer becomes driver via sheet edit. transportTileVisible flips false→true (driver branch). Reverse TF→FF is fade-out-unmount.",
  },
  {
    from: "FF",
    to: "FT",
    treatment: "fade-in-mount",
    reason:
      "Viewer added to schedule[*].assigned_names[]. transportTileVisible flips false→true (schedule-tag branch). Reverse FT→FF is fade-out-unmount.",
  },
  {
    from: "FF",
    to: "TT",
    treatment: "fade-in-mount",
    reason:
      "Viewer simultaneously becomes driver AND tagged on a leg. Net visibility flips false→true; treated identically to single-branch unlock for the AnimatePresence mount. Reverse TT→FF is fade-out-unmount.",
  },
  {
    from: "TF",
    to: "FT",
    treatment: "stay-mounted-pulse",
    reason:
      "Net visibility stays true; reason changed from driver to schedule-tag. Tile MUST NOT flicker — no AnimatePresence cycle. Body MAY pulse on the changed field per §8.1.",
  },
  {
    from: "TF",
    to: "TT",
    treatment: "stay-mounted-pulse",
    reason:
      "Driver branch stays true; schedule-tag branch flips false→true. Net visibility unchanged (still true). Stay mounted, body MAY pulse on the changed field.",
  },
  {
    from: "FT",
    to: "TT",
    treatment: "stay-mounted-pulse",
    reason:
      "Schedule-tag branch stays true; driver branch flips false→true. Net visibility unchanged. Stay mounted, body MAY pulse.",
  },
];

/**
 * Sort two states lexicographically and return them as a `:`-
 * separated key. Used for symmetric lookup — `(FF, TF)` and `(TF, FF)`
 * resolve to the same matrix row.
 */
function pairKey(a: TransportBranchState, b: TransportBranchState): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

const TREATMENT_LOOKUP: Map<string, TransportTreatment> = (() => {
  const map = new Map<string, TransportTreatment>();
  for (const entry of TRANSPORT_TRANSITION_MATRIX) {
    map.set(pairKey(entry.from, entry.to), entry.treatment);
  }
  return map;
})();

/**
 * Look up the treatment for a §8.1 transport branch transition. The
 * matrix is symmetric: `transportTransitionTreatment(a, b) ===
 * transportTransitionTreatment(b, a)`. Returns null for diagonals
 * (`from === to`) and unknown states.
 *
 * Note: the matrix encodes the AnimatePresence treatment regardless
 * of direction. A `fade-in-mount` entry on FF → TF describes the
 * MOUNT direction; the reverse TF → FF is a `fade-out-unmount`. The
 * lookup helper returns the FROM-direction treatment for the given
 * pair as ordered by the matrix entry. To get the DIRECTION-aware
 * treatment, the caller must look up the matching matrix entry by
 * `(from, to)` order — both directions are stored separately.
 */
export function transportTransitionTreatment(
  from: TransportBranchState,
  to: TransportBranchState,
): TransportTreatment | null {
  if (from === to) return null;
  return TREATMENT_LOOKUP.get(pairKey(from, to)) ?? null;
}

/**
 * Direction-aware treatment lookup. Unlike
 * `transportTransitionTreatment` (symmetric), this returns the
 * treatment for the EXACT directed transition by linear-scanning the
 * matrix for an entry where `entry.from === from && entry.to === to`.
 * Returns null if the directed pair is not in the matrix (the
 * inverse direction MAY be — the matrix is unordered for symmetry but
 * directed for the treatment of the AnimatePresence cycle).
 */
export function directedTransportTreatment(
  from: TransportBranchState,
  to: TransportBranchState,
): TransportTreatment | null {
  if (from === to) return null;
  // Look up the matching directed entry; if not found, derive the
  // inverse direction's treatment (e.g., FF → TF is fade-in-mount, so
  // TF → FF is fade-out-unmount; FF → TT is fade-in-mount, so TT → FF
  // is fade-out-unmount; TF ↔ FT is stay-mounted-pulse symmetric).
  const directed = TRANSPORT_TRANSITION_MATRIX.find((e) => e.from === from && e.to === to);
  if (directed) return directed.treatment;
  const inverse = TRANSPORT_TRANSITION_MATRIX.find((e) => e.from === to && e.to === from);
  if (!inverse) return null;
  // Direction inversion rules:
  //   fade-in-mount       → fade-out-unmount
  //   fade-out-unmount    → fade-in-mount
  //   stay-mounted-pulse  → stay-mounted-pulse  (symmetric)
  //   unreachable         → unreachable          (symmetric)
  if (inverse.treatment === "fade-in-mount") return "fade-out-unmount";
  if (inverse.treatment === "fade-out-unmount") return "fade-in-mount";
  return inverse.treatment;
}
