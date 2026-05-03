/**
 * Tests for `lib/time/rightNowTransitions.ts` — the §8.2 RightNow
 * 12-state transition audit matrix (M4 Task 4.12 Batch 1).
 *
 * These contract tests pin the matrix's structural invariants.
 * Animation-behavior tests live in
 * `tests/e2e/right-now-transitions.spec.ts` (scaffolded as
 * `test.fixme()` until Batch 2 lands `framer-motion`).
 *
 * The matrix is the single source of truth for the audit. Any drift
 * (size, duplicates, unreachable cells without rationale, asymmetric
 * lookup) fails here, NOT downstream in the Playwright surface.
 */
import { describe, expect, test } from "vitest";
import type { RightNowState } from "@/lib/time/rightNow";
import {
  RIGHT_NOW_TRANSITION_MATRIX,
  transitionTreatment,
  type RightNowStateKind,
  type TransitionTreatment,
} from "@/lib/time/rightNowTransitions";

/**
 * The canonical list of 12 RightNow state kinds. Hand-listed (rather
 * than `keyof` extracted) so a future state addition or removal MUST be
 * mirrored here AND surfaces as a TypeScript error (the assignment
 * below to `RightNowStateKind` would fail to typecheck).
 *
 * Ordering matches the spec §8.2 precedence table top-to-bottom for
 * documentation purposes only — the matrix is symmetric, so test
 * iteration order does not affect outcomes.
 */
const ALL_KINDS: ReadonlyArray<RightNowStateKind> = [
  "viewer_unconfirmed",
  "viewer_after_last_day",
  "viewer_off_day",
  "viewer_off_day_pre",
  "pre_travel",
  "travel_in_day",
  "set_day",
  "show_day_n",
  "travel_out_day",
  "post_show",
  "unknown",
  "dateless",
];

// Compile-time guard: the array literally is `RightNowState["kind"]`s,
// nothing more, nothing less. If a state is added/removed in
// `lib/time/rightNow.ts`, this assignment fails to typecheck and the
// dev is forced to update ALL_KINDS to match.
const _typeCheck: ReadonlyArray<RightNowState["kind"]> = ALL_KINDS;
void _typeCheck;

const VALID_TREATMENTS: ReadonlyArray<TransitionTreatment> = [
  "crossfade-body",
  "morph-to-last-good",
  "instant",
  "unreachable",
];

/** Sorted lexicographic pair key — same definition the helper uses. */
function pairKey(a: RightNowStateKind, b: RightNowStateKind): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

describe("RIGHT_NOW_TRANSITION_MATRIX — structural invariants", () => {
  test("matrix has exactly 66 entries (C(12,2) = 12*11/2)", () => {
    expect(RIGHT_NOW_TRANSITION_MATRIX).toHaveLength(66);
  });

  test("no diagonals — every entry has from !== to", () => {
    const diagonals = RIGHT_NOW_TRANSITION_MATRIX.filter(
      (entry) => entry.from === entry.to,
    );
    expect(diagonals).toEqual([]);
  });

  test("no duplicates — every unordered pair appears at most once", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      const key = pairKey(entry.from, entry.to);
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
    expect(seen.size).toBe(66);
  });

  test("coverage — every kind appears in exactly 11 entries (its 11 partners)", () => {
    const counts = new Map<RightNowStateKind, number>();
    for (const kind of ALL_KINDS) counts.set(kind, 0);
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      counts.set(entry.from, (counts.get(entry.from) ?? 0) + 1);
      counts.set(entry.to, (counts.get(entry.to) ?? 0) + 1);
    }
    for (const kind of ALL_KINDS) {
      expect(counts.get(kind)).toBe(11);
    }
  });

  test("every entry's `from` and `to` is a valid RightNowStateKind", () => {
    const validKinds = new Set<string>(ALL_KINDS);
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      expect(validKinds.has(entry.from)).toBe(true);
      expect(validKinds.has(entry.to)).toBe(true);
    }
  });

  test("every entry's `treatment` is one of the four enum values", () => {
    const valid = new Set<string>(VALID_TREATMENTS);
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      expect(valid.has(entry.treatment)).toBe(true);
    }
  });

  test("every `unreachable` entry has a non-empty `reason` field", () => {
    const offenders = RIGHT_NOW_TRANSITION_MATRIX.filter(
      (entry) =>
        entry.treatment === "unreachable" &&
        (entry.reason === undefined || entry.reason.trim().length === 0),
    );
    expect(offenders).toEqual([]);
  });
});

describe("transitionTreatment(from, to) — symmetric lookup helper", () => {
  test("symmetric for every matrix pair: f(a, b) === f(b, a)", () => {
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      const forward = transitionTreatment(entry.from, entry.to);
      const reverse = transitionTreatment(entry.to, entry.from);
      expect(forward).toBe(entry.treatment);
      expect(reverse).toBe(entry.treatment);
    }
  });

  test("returns null for diagonal pairs (from === to)", () => {
    for (const kind of ALL_KINDS) {
      expect(transitionTreatment(kind, kind)).toBeNull();
    }
  });

  test("returns null for unknown kinds (defense against `as any` bypass)", () => {
    expect(
      transitionTreatment(
        "not_a_real_state" as RightNowStateKind,
        "pre_travel",
      ),
    ).toBeNull();
    expect(
      transitionTreatment(
        "pre_travel",
        "also_not_real" as RightNowStateKind,
      ),
    ).toBeNull();
    expect(
      transitionTreatment(
        "garbage" as RightNowStateKind,
        "more_garbage" as RightNowStateKind,
      ),
    ).toBeNull();
  });

  test("post_show ↔ pre_travel is unreachable with reason populated", () => {
    expect(transitionTreatment("post_show", "pre_travel")).toBe("unreachable");
    expect(transitionTreatment("pre_travel", "post_show")).toBe("unreachable");
    const entry = RIGHT_NOW_TRANSITION_MATRIX.find(
      (e) =>
        (e.from === "pre_travel" && e.to === "post_show") ||
        (e.from === "post_show" && e.to === "pre_travel"),
    );
    expect(entry?.reason).toBeDefined();
    expect((entry?.reason ?? "").length).toBeGreaterThan(0);
  });

  test("pre_travel → travel_in_day is crossfade-body (spec line 2420)", () => {
    expect(transitionTreatment("pre_travel", "travel_in_day")).toBe(
      "crossfade-body",
    );
    expect(transitionTreatment("travel_in_day", "pre_travel")).toBe(
      "crossfade-body",
    );
  });

  test("any-state ↔ unknown is morph-to-last-good (spec line 2424)", () => {
    // Excluding the `unknown ↔ dateless` pair (Rule 3 — recovery).
    const partners: RightNowStateKind[] = ALL_KINDS.filter(
      (k) => k !== "unknown" && k !== "dateless",
    );
    for (const partner of partners) {
      expect(transitionTreatment("unknown", partner)).toBe("morph-to-last-good");
      expect(transitionTreatment(partner, "unknown")).toBe("morph-to-last-good");
    }
  });

  test("unknown ↔ dateless is crossfade-body (recovery, not stale-on-stale)", () => {
    expect(transitionTreatment("unknown", "dateless")).toBe("crossfade-body");
    expect(transitionTreatment("dateless", "unknown")).toBe("crossfade-body");
  });

  test("any-state ↔ dateless (excluding unknown) is morph-to-last-good", () => {
    const partners: RightNowStateKind[] = ALL_KINDS.filter(
      (k) => k !== "dateless" && k !== "unknown",
    );
    for (const partner of partners) {
      expect(transitionTreatment("dateless", partner)).toBe("morph-to-last-good");
      expect(transitionTreatment(partner, "dateless")).toBe("morph-to-last-good");
    }
  });

  test("viewer_off_day_pre ↔ viewer_after_last_day is unreachable (calendrical paradox)", () => {
    expect(
      transitionTreatment("viewer_off_day_pre", "viewer_after_last_day"),
    ).toBe("unreachable");
    expect(
      transitionTreatment("viewer_after_last_day", "viewer_off_day_pre"),
    ).toBe("unreachable");
  });

  test("viewer_off_day_pre → set_day is crossfade-body (plan Step 2 explicit)", () => {
    expect(transitionTreatment("viewer_off_day_pre", "set_day")).toBe(
      "crossfade-body",
    );
  });

  test("viewer_off_day → show_day_n is crossfade-body (spec lines 2422-2423)", () => {
    expect(transitionTreatment("viewer_off_day", "show_day_n")).toBe(
      "crossfade-body",
    );
    expect(transitionTreatment("show_day_n", "viewer_off_day")).toBe(
      "crossfade-body",
    );
  });
});

describe("RIGHT_NOW_TRANSITION_MATRIX — full enumeration cross-check", () => {
  /**
   * Cross-check that the matrix covers EVERY one of the 66 unordered
   * kind-pairs, not just the right total count + the specific ones the
   * other tests poke at. A future commit that swaps two entries for a
   * duplicate would still pass the size + duplicate tests if both
   * entries happen to match — this test catches that by enumerating the
   * full Cartesian product.
   */
  test("every (kind, kind) unordered pair has a matrix entry", () => {
    const expectedKeys = new Set<string>();
    for (let i = 0; i < ALL_KINDS.length; i += 1) {
      for (let j = i + 1; j < ALL_KINDS.length; j += 1) {
        expectedKeys.add(pairKey(ALL_KINDS[i]!, ALL_KINDS[j]!));
      }
    }
    expect(expectedKeys.size).toBe(66);

    const actualKeys = new Set(
      RIGHT_NOW_TRANSITION_MATRIX.map((e) => pairKey(e.from, e.to)),
    );
    const missing = [...expectedKeys].filter((k) => !actualKeys.has(k));
    const extra = [...actualKeys].filter((k) => !expectedKeys.has(k));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });
});
