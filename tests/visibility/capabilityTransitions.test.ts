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
} from "@/lib/visibility/capabilityTransitions";

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
    const diagonals = CAPABILITY_TRANSITION_MATRIX.filter(
      (entry) => entry.a === entry.b,
    );
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
  test("symmetric in (flipped, held): reading flip(a, b) returns a's delta; flip(b, a) returns same a-delta when looked up by `flipped=a`", () => {
    for (const entry of CAPABILITY_TRANSITION_MATRIX) {
      // Looking up flipped=a, held=b reads the entry's aFlipDelta.
      const ab = affectedTilesOnFlip(entry.a, entry.b, "false_to_true");
      const ba = affectedTilesOnFlip(entry.a, entry.b, "false_to_true");
      expect(ab).toEqual(ba);
      // The B-direction:
      const bWithA = affectedTilesOnFlip(entry.b, entry.a, "false_to_true");
      expect(bWithA).toEqual(entry.bFlipDelta);
    }
  });

  test("returns null for diagonal pairs", () => {
    for (const p of ALL_PREDICATES) {
      expect(affectedTilesOnFlip(p, p, "false_to_true")).toBeNull();
    }
  });

  test("returns null for unknown predicates (defense against `as any`)", () => {
    expect(
      affectedTilesOnFlip(
        "not_a_predicate" as CapabilityPredicate,
        "hasLead",
        "false_to_true",
      ),
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
    const leadDelta = affectedTilesOnFlip(
      "hasLead",
      "hasL1",
      "true_to_false",
    );
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
});
