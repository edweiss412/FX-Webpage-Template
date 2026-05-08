/**
 * Tests for `lib/visibility/capabilityTransitions.ts` — the §8.1
 * capability-flip transition matrix (M4 Task 4.12 Batch 2 Step 4).
 *
 * Structural invariants of the matrix are pinned here; the matrix is
 * the single source of truth for visibility-delta semantics across
 * predicate flips. Compound transitions (multiple predicates flipping
 * simultaneously) are exercised by e2e tests in
 * `tests/e2e/right-now-transitions.spec.ts`.
 */
import { describe, expect, test } from "vitest";
import {
  CAPABILITY_TRANSITION_MATRIX,
  affectedTilesOnFlip,
  type CapabilityPredicate,
  type GatedTile,
} from "@/lib/visibility/capabilityTransitions";
import {
  audioScopeVisible,
  videoScopeVisible,
  lightingScopeVisible,
  financialsVisible,
} from "@/lib/visibility/scopeTiles";
import type { RoleFlag } from "@/lib/parser/types";

const ALL_PREDICATES = [
  "hasLead",
  "hasA1",
  "hasV1",
  "hasL1",
  "hasAdmin",
] as const satisfies readonly CapabilityPredicate[];

function pairKey(a: CapabilityPredicate, b: CapabilityPredicate): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

describe("CAPABILITY_TRANSITION_MATRIX — structural invariants", () => {
  test("matrix has exactly 10 entries (C(5, 2) = 5*4/2)", () => {
    expect(CAPABILITY_TRANSITION_MATRIX).toHaveLength(10);
  });

  test("no diagonals — every entry has a !== b", () => {
    const diagonals = CAPABILITY_TRANSITION_MATRIX.filter((entry) => entry.a === entry.b);
    expect(diagonals).toEqual([]);
  });

  test("no duplicates — every unordered pair appears at most once", () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const entry of CAPABILITY_TRANSITION_MATRIX) {
      const key = pairKey(entry.a, entry.b);
      if (seen.has(key)) dups.push(key);
      seen.add(key);
    }
    expect(dups).toEqual([]);
    expect(seen.size).toBe(10);
  });

  test("coverage — every predicate appears in exactly 4 entries (its 4 partners)", () => {
    const counts = new Map<CapabilityPredicate, number>();
    for (const p of ALL_PREDICATES) counts.set(p, 0);
    for (const entry of CAPABILITY_TRANSITION_MATRIX) {
      counts.set(entry.a, (counts.get(entry.a) ?? 0) + 1);
      counts.set(entry.b, (counts.get(entry.b) ?? 0) + 1);
    }
    for (const p of ALL_PREDICATES) {
      expect(counts.get(p)).toBe(4);
    }
  });

  test("every entry's predicates are valid CapabilityPredicate values", () => {
    const valid = new Set<string>(ALL_PREDICATES);
    for (const entry of CAPABILITY_TRANSITION_MATRIX) {
      expect(valid.has(entry.a)).toBe(true);
      expect(valid.has(entry.b)).toBe(true);
    }
  });

  test("every entry has a non-empty `reason` field", () => {
    const offenders = CAPABILITY_TRANSITION_MATRIX.filter(
      (entry) => !entry.reason || entry.reason.trim().length === 0,
    );
    expect(offenders).toEqual([]);
  });
});

describe("affectedTilesOnFlip(flipped, held, direction) — symmetric lookup", () => {
  test("matrix lookup is order-insensitive on the {flipped, held} pair: flip(a, b) and flip(a, b) (order swapped on the lookup key) resolve to the SAME entry, with the per-flip delta selected by which predicate is `flipped`", () => {
    // Concrete failure mode caught: a `pairKey` regression that
    // produced different keys for `(a, b)` vs `(b, a)` would cause
    // ENTRY_LOOKUP misses on one ordering but not the other. The test
    // below proves: for every matrix entry, looking up `flipped=a,
    // held=b` returns the entry's aFlipDelta AND looking up
    // `flipped=b, held=a` (note: ARG ORDER REVERSED) returns the
    // entry's bFlipDelta. Same entry, two different per-predicate
    // deltas, each correctly attributed to the flipped predicate.
    for (const entry of CAPABILITY_TRANSITION_MATRIX) {
      // Forward lookup: flipped=a, held=b → aFlipDelta.
      const aFlippedWithBHeld = affectedTilesOnFlip(entry.a, entry.b, "false_to_true");
      expect(aFlippedWithBHeld).toEqual(entry.aFlipDelta);
      // Reverse-arg-order lookup: flipped=b, held=a (note: arguments
      // physically swapped). pairKey must produce the SAME key, so
      // ENTRY_LOOKUP hits the same entry; the helper then selects
      // bFlipDelta because `flipped === entry.b`.
      const bFlippedWithAHeld = affectedTilesOnFlip(entry.b, entry.a, "false_to_true");
      expect(bFlippedWithAHeld).toEqual(entry.bFlipDelta);
    }
  });

  test("returns null for diagonal pairs", () => {
    for (const p of ALL_PREDICATES) {
      expect(affectedTilesOnFlip(p, p, "false_to_true")).toBeNull();
    }
  });

  test("returns null for unknown predicates (defense against `as any`)", () => {
    expect(
      affectedTilesOnFlip("not_a_predicate" as CapabilityPredicate, "hasLead", "false_to_true"),
    ).toBeNull();
  });

  test("true→false swaps appears↔disappears", () => {
    // Pick the hasLead × hasL1 entry — hasL1 has a non-empty appears
    // delta that's a clean test of the swap invariant.
    const trueToFalse = affectedTilesOnFlip("hasL1", "hasLead", "true_to_false");
    expect(trueToFalse).toEqual({
      appears: [], // was disappears
      disappears: ["LightingScopeTile"], // was appears
    });
  });
});

describe("Plan Step 4 worked examples — three compound cases", () => {
  /**
   * `['LEAD','A1'] → ['A1']`: hasLead flips false. FinancialsTile
   * disappears, VideoScopeTile disappears (was unlocked by LEAD branch
   * since hasV1 is false). AudioScopeTile stays visible (hasA1 still
   * true). LightingScopeTile stays hidden (hasL1 false throughout).
   *
   * The matrix encodes the per-predicate deltas; this test verifies
   * the delta is consistent with the worked example by combining the
   * single-flip lookups.
   */
  test("['LEAD','A1'] → ['A1']: hasLead flip true→false (with hasA1 held true)", () => {
    // hasLead × hasA1 entry: aFlipDelta is for hasLead, recorded as
    // appears = [Financials, Video] on false→true. true→false swaps,
    // so disappears = [Financials, Video].
    const delta = affectedTilesOnFlip("hasLead", "hasA1", "true_to_false");
    expect(delta).toEqual({
      appears: [],
      disappears: ["FinancialsTile", "VideoScopeTile"],
    });
  });

  /**
   * `['LEAD'] → ['L1']`: hasLead flips false, hasL1 flips true. The
   * matrix records the SINGLE-PREDICATE delta — the compound is
   * exercised by composing the two flip lookups.
   *
   * hasLead true→false (with hasL1=false): Financials, Audio, Video
   * disappear.
   * hasL1 false→true (with hasLead=false): Lighting appears.
   */
  test("['LEAD'] → ['L1']: composed deltas — 3 disappear, 1 appears", () => {
    const leadDelta = affectedTilesOnFlip("hasLead", "hasL1", "true_to_false");
    const l1Delta = affectedTilesOnFlip("hasL1", "hasLead", "false_to_true");
    expect(leadDelta).toEqual({
      appears: [],
      disappears: ["FinancialsTile", "AudioScopeTile", "VideoScopeTile"],
    });
    expect(l1Delta).toEqual({
      appears: ["LightingScopeTile"],
      disappears: [],
    });
  });

  /**
   * `['LEAD','A1'] → ['V1']`: hasLead flips false, hasA1 flips false,
   * hasV1 flips true. Net: Financials disappears (no LEAD, no admin),
   * Audio disappears (no LEAD, no A1), Video stays via hasV1's new
   * truth (the reason for visibility shifted from LEAD branch to V1
   * branch — net visibility unchanged). Matrix encodes single-flip
   * deltas; the e2e compound test verifies the no-flicker invariant.
   *
   * The hasV1 flip alone (with everything else false) appears Video.
   */
  test("['LEAD','A1'] → ['V1']: hasV1 false→true alone → Video appears", () => {
    const v1Delta = affectedTilesOnFlip("hasV1", "hasA1", "false_to_true");
    expect(v1Delta).toEqual({
      appears: ["VideoScopeTile"],
      disappears: [],
    });
  });

  /**
   * Compound visibility delta for `['LEAD','A1'] → ['V1']` (review
   * Important 5). The single-flip lookups above record per-predicate
   * deltas; this test composes the §8.1 visibility predicates against
   * the BEFORE and AFTER role_flags arrays directly, computes the net
   * delta, and asserts the no-flicker invariant: VideoScopeTile is
   * present in BOTH visibility sets — its REASON for being visible
   * shifts from the LEAD branch (videoScopeVisible: V1 || LEAD) to the
   * V1 branch, but the tile itself never unmounts.
   *
   * Concrete failure mode caught: a future spec drift where, for
   * example, LEAD is removed from `videoScopeVisible` would silently
   * make this case a flicker — the tile would unmount on the LEAD drop
   * and re-mount on the V1 raise. The test fails immediately because
   * VideoScopeTile leaves the BEFORE set.
   *
   * The DOM-level no-flicker continuity (AnimatePresence keeping the
   * tile mounted across the same render cycle) is exercised at the
   * e2e level — that part requires Realtime push (M6) and is deferred.
   * What we lock down HERE is the pure-data contract the M5/M6 layer
   * depends on.
   */
  test("['LEAD','A1'] → ['V1']: compound visibility delta — Financials + Audio disappear, Video stays", () => {
    /**
     * Compute the visible gated-tile set for a viewer given their
     * role_flags (non-admin viewer). Ordering of the returned set
     * matches the §8.1 grid ordering used by FinancialsTile,
     * AudioScopeTile, VideoScopeTile, LightingScopeTile.
     */
    function visibleGatedTiles(flags: RoleFlag[]): GatedTile[] {
      const visible: GatedTile[] = [];
      if (financialsVisible(flags, /* isAdmin */ false)) visible.push("FinancialsTile");
      if (audioScopeVisible(flags)) visible.push("AudioScopeTile");
      if (videoScopeVisible(flags)) visible.push("VideoScopeTile");
      if (lightingScopeVisible(flags)) visible.push("LightingScopeTile");
      return visible;
    }

    const before = visibleGatedTiles(["LEAD", "A1"]);
    const after = visibleGatedTiles(["V1"]);

    // BEFORE: LEAD unlocks Financials + Audio (LEAD branch) + Video
    // (LEAD branch). A1 also unlocks Audio (already unlocked). L1 not
    // present → no Lighting.
    expect(before).toEqual(["FinancialsTile", "AudioScopeTile", "VideoScopeTile"]);
    // AFTER: V1 unlocks Video only. No LEAD → no Financials, no Audio.
    // No L1 → no Lighting.
    expect(after).toEqual(["VideoScopeTile"]);

    // Compute the net delta: which tiles appear / disappear net.
    const beforeSet = new Set<GatedTile>(before);
    const afterSet = new Set<GatedTile>(after);
    const appears: GatedTile[] = after.filter((t) => !beforeSet.has(t));
    const disappears: GatedTile[] = before.filter((t) => !afterSet.has(t));
    expect(appears).toEqual([]);
    expect(disappears).toEqual(["FinancialsTile", "AudioScopeTile"]);

    // No-flicker invariant: VideoScopeTile is in BOTH sets. Its REASON
    // for being visible shifted (LEAD branch → V1 branch) but its
    // visibility never went false. The DOM-level continuity (no
    // AnimatePresence unmount/remount across this transition) is
    // exercised at e2e level once Realtime push lands in M6.
    expect(beforeSet.has("VideoScopeTile")).toBe(true);
    expect(afterSet.has("VideoScopeTile")).toBe(true);
  });
});
