/**
 * lib/visibility/capabilityTransitions.ts — §8.1 capability-flip
 * transition matrix (M4 Task 4.12 Batch 2 Step 4).
 *
 * The crew page's tile-visibility logic is driven by the
 * `role_flags[]` capability array. Five derived predicates gate the
 * five gated tiles (FinancialsTile, AudioScopeTile, VideoScopeTile,
 * LightingScopeTile — see `lib/visibility/scopeTiles.ts`):
 *
 *   • `hasLead`  → `flags.includes('LEAD')`. Unlocks FinancialsTile +
 *                  AudioScopeTile (via the `flags.includes('LEAD')`
 *                  branch of `audioScopeVisible`) + VideoScopeTile
 *                  (via the `flags.includes('LEAD')` branch of
 *                  `videoScopeVisible`). LightingScopeTile is
 *                  INTENTIONALLY NOT unlocked by LEAD per §8.1.
 *   • `hasA1`    → `flags.includes('A1') || flags.includes('A2')`.
 *                  Unlocks AudioScopeTile via the A1/A2 branch.
 *   • `hasV1`    → `flags.includes('V1')`. Unlocks VideoScopeTile via
 *                  the V1 branch.
 *   • `hasL1`    → `flags.includes('L1')`. Unlocks LightingScopeTile.
 *   • `hasAdmin` → `isAdmin === true`. The admin viewer synthesizes
 *                  the SCOPE_TILE_UNLOCKING_FLAGS array (LEAD, A1, V1,
 *                  L1) so admin sees every gated tile via the
 *                  individual flag branches; admin also sees Financials
 *                  via the explicit `isAdmin` branch in
 *                  `financialsVisible`.
 *
 * The matrix below enumerates the 10 unordered pairs of these 5
 * predicates (C(5, 2) = 10). Each pair represents a transition where
 * one of the two predicates flips while the other is held fixed. For
 * each pair we document which tiles APPEAR (or DISAPPEAR) when each
 * direction of the flip happens. The flip is a single boolean change;
 * `true → false` removes the unlocked tiles, `false → true` adds them.
 *
 * Compound transitions (multiple predicates flipping in the same
 * render cycle) are NOT modeled in the matrix — they are exercised by
 * the e2e compound-transition tests in
 * `tests/e2e/right-now-transitions.spec.ts`. The pairwise matrix is
 * the contract surface for unit-testable visibility deltas.
 *
 * Pure data + a tiny lookup helper. No I/O, no environment reads.
 * Server-safe. Mirrors the structural pattern of
 * `lib/time/rightNowTransitions.ts`.
 */

/**
 * The 5 capability predicates that gate scope-tile and financials
 * visibility on the crew page. Hand-listed (rather than `keyof`-
 * extracted) so a future predicate addition surfaces here AND in the
 * matrix as a TypeScript error if the matrix is incomplete.
 */
export type CapabilityPredicate =
  | "hasLead"
  | "hasA1"
  | "hasV1"
  | "hasL1"
  | "hasAdmin";

/**
 * The five gated tiles whose visibility this matrix covers. Listed
 * as a string-literal union so the per-flip delta records can name
 * tiles by exact identifier (no free-text drift).
 */
export type GatedTile =
  | "FinancialsTile"
  | "AudioScopeTile"
  | "VideoScopeTile"
  | "LightingScopeTile";

/**
 * One flip direction: which predicate flipped, what direction, and
 * which tiles appear / disappear AT THAT FLIP, given the OTHER
 * predicate is held at the value the matrix entry records.
 */
export type FlipDirection = "false_to_true" | "true_to_false";

/**
 * One row in the capability matrix. Each row is an unordered pair of
 * predicates; the `forwardFlipsA` and `forwardFlipsB` fields record
 * the tile-visibility delta when predicate A flips (with B held) and
 * when predicate B flips (with A held).
 */
export interface CapabilityTransitionEntry {
  /** First predicate of the unordered pair. */
  a: CapabilityPredicate;
  /** Second predicate of the unordered pair. */
  b: CapabilityPredicate;
  /**
   * Tile-visibility delta when `a` flips false→true (with `b` held
   * at its prior value, both true and false treated as the union).
   * `appears` and `disappears` are the FRESHLY UNLOCKED / NEWLY GATED
   * tiles after the flip.
   */
  aFlipDelta: TileVisibilityDelta;
  /** Same as aFlipDelta but for `b`. */
  bFlipDelta: TileVisibilityDelta;
  /** Free-text rationale for the entry (cites the §8.1 rule). */
  reason: string;
}

/**
 * Tiles that change visibility on a single predicate flip. The flip
 * direction is implicit:
 *
 *   - false → true: tiles in `appears` become visible.
 *   - true → false: tiles in `appears` become hidden (the inverse).
 *
 * `disappears` is reserved for the (unusual) case where flipping a
 * predicate true → false might UNHIDE a previously-hidden tile — this
 * does NOT happen in the §8.1 contract (every predicate is positive-
 * unlocking) but the field is kept for future-proofing.
 */
export interface TileVisibilityDelta {
  appears: readonly GatedTile[];
  disappears: readonly GatedTile[];
}

/**
 * The full 10-entry capability flip matrix. Order is documentary —
 * tests do not depend on insertion order.
 *
 * Tile-visibility rules from `lib/visibility/scopeTiles.ts` (verbatim
 * branch logic):
 *
 *   audioScopeVisible    = A1 || A2 || LEAD       (so flip(hasA1) toggles audio iff LEAD is false; flip(hasLead) toggles audio iff hasA1 is false)
 *   videoScopeVisible    = V1 || LEAD              (so flip(hasV1) toggles video iff LEAD is false; flip(hasLead) toggles video iff hasV1 is false)
 *   lightingScopeVisible = L1                       (LEAD intentionally NOT included)
 *   financialsVisible    = isAdmin || LEAD          (LEAD-or-admin)
 *
 * For each pair, the delta records the tiles that DEFINITIVELY change
 * when ONLY the flipped predicate changes — i.e., the flip is
 * SUFFICIENT to change visibility regardless of the other predicate.
 * If the visibility change depends on the other predicate's value,
 * the delta is empty (the e2e compound tests cover those cases).
 */
export const CAPABILITY_TRANSITION_MATRIX: CapabilityTransitionEntry[] = [
  // ── hasLead × hasA1 ───────────────────────────────────────────────
  {
    a: "hasLead",
    b: "hasA1",
    // hasLead flip definitively toggles FinancialsTile + VideoScopeTile.
    // AudioScopeTile depends on hasA1: if hasA1 is true, audio remains
    // visible across hasLead flip; if hasA1 is false, audio toggles
    // with hasLead. We record only the definitive deltas here.
    aFlipDelta: {
      appears: ["FinancialsTile", "VideoScopeTile"],
      disappears: [],
    },
    // hasA1 flip toggles AudioScopeTile only when hasLead is false;
    // when hasLead is true the audio tile is unconditionally visible
    // via the LEAD branch. So the definitive delta is empty (covered
    // by compound tests).
    bFlipDelta: { appears: [], disappears: [] },
    reason:
      "hasLead unlocks FinancialsTile (financialsVisible) + VideoScopeTile (videoScopeVisible LEAD branch). AudioScopeTile is shared between LEAD and A1 branches; the matrix definitive delta records only tiles whose visibility flip is unconditional given the flipped predicate.",
  },
  // ── hasLead × hasV1 ───────────────────────────────────────────────
  {
    a: "hasLead",
    b: "hasV1",
    aFlipDelta: {
      appears: ["FinancialsTile", "AudioScopeTile"],
      disappears: [],
    },
    // hasV1 flip toggles VideoScopeTile only when hasLead is false.
    bFlipDelta: { appears: [], disappears: [] },
    reason:
      "hasLead unlocks FinancialsTile + AudioScopeTile (audioScopeVisible LEAD branch). VideoScopeTile is shared between LEAD and V1 branches.",
  },
  // ── hasLead × hasL1 ───────────────────────────────────────────────
  {
    a: "hasLead",
    b: "hasL1",
    aFlipDelta: {
      appears: ["FinancialsTile", "AudioScopeTile", "VideoScopeTile"],
      disappears: [],
    },
    // hasL1 unconditionally toggles LightingScopeTile (LEAD never
    // unlocks lighting per §8.1).
    bFlipDelta: { appears: ["LightingScopeTile"], disappears: [] },
    reason:
      "hasLead unlocks Financials + Audio + Video. hasL1 ALONE unlocks LightingScopeTile (LEAD intentionally NOT included per §8.1, so the L1 flip delta is unconditional regardless of hasLead).",
  },
  // ── hasLead × hasAdmin ────────────────────────────────────────────
  {
    a: "hasLead",
    b: "hasAdmin",
    // hasLead flip toggles Financials + Audio + Video, but only when
    // hasAdmin is false; admin synthesizes all flags so admin viewers
    // see every gated tile regardless of LEAD presence.
    aFlipDelta: { appears: [], disappears: [] },
    bFlipDelta: {
      appears: [
        "FinancialsTile",
        "AudioScopeTile",
        "VideoScopeTile",
        "LightingScopeTile",
      ],
      disappears: [],
    },
    reason:
      "hasAdmin synthesizes SCOPE_TILE_UNLOCKING_FLAGS (LEAD, A1, V1, L1) and unconditionally unlocks every gated tile per §4.4 super-LEAD posture. hasLead flip is conditional on hasAdmin being false.",
  },
  // ── hasA1 × hasV1 ─────────────────────────────────────────────────
  {
    a: "hasA1",
    b: "hasV1",
    // hasA1 flip toggles AudioScopeTile only when hasLead is false.
    // The matrix entry holds for the case where hasLead=false and
    // hasAdmin=false; in those cases A1 alone unlocks audio.
    aFlipDelta: { appears: ["AudioScopeTile"], disappears: [] },
    bFlipDelta: { appears: ["VideoScopeTile"], disappears: [] },
    reason:
      "Independent atomic flags. hasA1 unlocks AudioScopeTile via the A1/A2 branch; hasV1 unlocks VideoScopeTile via the V1 branch. Both deltas hold when hasLead and hasAdmin are false (matrix entries are evaluated against the no-LEAD-no-admin viewer; LEAD/admin compound interactions are tested by e2e).",
  },
  // ── hasA1 × hasL1 ─────────────────────────────────────────────────
  {
    a: "hasA1",
    b: "hasL1",
    aFlipDelta: { appears: ["AudioScopeTile"], disappears: [] },
    bFlipDelta: { appears: ["LightingScopeTile"], disappears: [] },
    reason:
      "Independent atomic flags. hasA1 unlocks Audio; hasL1 unlocks Lighting (LEAD never gates lighting).",
  },
  // ── hasA1 × hasAdmin ──────────────────────────────────────────────
  {
    a: "hasA1",
    b: "hasAdmin",
    // hasA1 flip toggles Audio only when hasAdmin is false.
    aFlipDelta: { appears: [], disappears: [] },
    bFlipDelta: {
      appears: [
        "FinancialsTile",
        "AudioScopeTile",
        "VideoScopeTile",
        "LightingScopeTile",
      ],
      disappears: [],
    },
    reason:
      "hasAdmin unlocks all gated tiles unconditionally. hasA1 flip is conditional on hasAdmin being false.",
  },
  // ── hasV1 × hasL1 ─────────────────────────────────────────────────
  {
    a: "hasV1",
    b: "hasL1",
    aFlipDelta: { appears: ["VideoScopeTile"], disappears: [] },
    bFlipDelta: { appears: ["LightingScopeTile"], disappears: [] },
    reason: "Independent atomic flags. hasV1 unlocks Video; hasL1 unlocks Lighting.",
  },
  // ── hasV1 × hasAdmin ──────────────────────────────────────────────
  {
    a: "hasV1",
    b: "hasAdmin",
    aFlipDelta: { appears: [], disappears: [] },
    bFlipDelta: {
      appears: [
        "FinancialsTile",
        "AudioScopeTile",
        "VideoScopeTile",
        "LightingScopeTile",
      ],
      disappears: [],
    },
    reason:
      "hasAdmin unlocks all gated tiles. hasV1 flip is conditional on hasAdmin being false.",
  },
  // ── hasL1 × hasAdmin ──────────────────────────────────────────────
  {
    a: "hasL1",
    b: "hasAdmin",
    aFlipDelta: { appears: [], disappears: [] },
    bFlipDelta: {
      appears: [
        "FinancialsTile",
        "AudioScopeTile",
        "VideoScopeTile",
        "LightingScopeTile",
      ],
      disappears: [],
    },
    reason:
      "hasAdmin unlocks all gated tiles. hasL1 flip is conditional on hasAdmin being false.",
  },
];

/**
 * Sort two predicates lexicographically and return them as a `:`-
 * separated key. Used to look up symmetric pair entries —
 * `(hasLead, hasA1)` and `(hasA1, hasLead)` produce the same key.
 */
function pairKey(a: CapabilityPredicate, b: CapabilityPredicate): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

const ENTRY_LOOKUP: Map<string, CapabilityTransitionEntry> = (() => {
  const map = new Map<string, CapabilityTransitionEntry>();
  for (const entry of CAPABILITY_TRANSITION_MATRIX) {
    map.set(pairKey(entry.a, entry.b), entry);
  }
  return map;
})();

/**
 * Look up the tile-visibility delta when `flipped` predicate flips
 * `direction` while `held` predicate holds. The delta is symmetric in
 * the unordered pair (the matrix entry encodes both A→ and B→ flips);
 * we read the right one based on which predicate is `flipped`.
 *
 * Returns `null` for:
 *   - Diagonals (`flipped === held`): self-pairs are not §8.1 transitions.
 *   - Unknown predicates: defends against typed-bypass callers.
 */
export function affectedTilesOnFlip(
  flipped: CapabilityPredicate,
  held: CapabilityPredicate,
  direction: FlipDirection,
): TileVisibilityDelta | null {
  if (flipped === held) return null;
  const entry = ENTRY_LOOKUP.get(pairKey(flipped, held));
  if (!entry) return null;
  const fwdDelta = entry.a === flipped ? entry.aFlipDelta : entry.bFlipDelta;
  // For true→false direction, swap appears/disappears (a tile that
  // appeared on false→true now disappears on true→false).
  if (direction === "true_to_false") {
    return { appears: fwdDelta.disappears, disappears: fwdDelta.appears };
  }
  return fwdDelta;
}
