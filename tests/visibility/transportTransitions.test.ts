/**
 * Tests for `lib/visibility/transportTransitions.ts` — the §8.1
 * TransportTile reassignment transition matrix (M4 Task 4.12 Batch 2
 * Step 4b).
 *
 * The 2×2 starting state space (driverNameMatch, anyScheduleTagMatch)
 * yields 4 states {FF, TF, FT, TT} and C(4, 2) = 6 unordered
 * transition pairs. Each pair carries an AnimatePresence treatment;
 * structural invariants are pinned here, animation behavior is
 * exercised in e2e tests.
 */
import { describe, expect, test } from "vitest";
import {
  TRANSPORT_TRANSITION_MATRIX,
  transportTransitionTreatment,
  directedTransportTreatment,
  type TransportBranchState,
  type TransportTreatment,
} from "@/lib/visibility/transportTransitions";

const ALL_STATES = ["FF", "TF", "FT", "TT"] as const satisfies readonly TransportBranchState[];

const VALID_TREATMENTS: ReadonlyArray<TransportTreatment> = [
  "fade-in-mount",
  "fade-out-unmount",
  "stay-mounted-pulse",
  "unreachable",
];

function pairKey(a: TransportBranchState, b: TransportBranchState): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

describe("TRANSPORT_TRANSITION_MATRIX — structural invariants", () => {
  test("matrix has exactly 6 entries (C(4, 2) = 4*3/2)", () => {
    expect(TRANSPORT_TRANSITION_MATRIX).toHaveLength(6);
  });

  test("no diagonals — every entry has from !== to", () => {
    const diagonals = TRANSPORT_TRANSITION_MATRIX.filter(
      (entry) => entry.from === entry.to,
    );
    expect(diagonals).toEqual([]);
  });

  test("no duplicates — every unordered pair appears at most once", () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const entry of TRANSPORT_TRANSITION_MATRIX) {
      const key = pairKey(entry.from, entry.to);
      if (seen.has(key)) dups.push(key);
      seen.add(key);
    }
    expect(dups).toEqual([]);
    expect(seen.size).toBe(6);
  });

  test("coverage — every state appears in exactly 3 entries (its 3 partners)", () => {
    const counts = new Map<TransportBranchState, number>();
    for (const s of ALL_STATES) counts.set(s, 0);
    for (const entry of TRANSPORT_TRANSITION_MATRIX) {
      counts.set(entry.from, (counts.get(entry.from) ?? 0) + 1);
      counts.set(entry.to, (counts.get(entry.to) ?? 0) + 1);
    }
    for (const s of ALL_STATES) {
      expect(counts.get(s)).toBe(3);
    }
  });

  test("every entry's treatment is one of the four enum values", () => {
    const valid = new Set<string>(VALID_TREATMENTS);
    for (const entry of TRANSPORT_TRANSITION_MATRIX) {
      expect(valid.has(entry.treatment)).toBe(true);
    }
  });

  test("every entry has a non-empty `reason` field", () => {
    const offenders = TRANSPORT_TRANSITION_MATRIX.filter(
      (entry) => !entry.reason || entry.reason.trim().length === 0,
    );
    expect(offenders).toEqual([]);
  });
});

describe("transportTransitionTreatment(from, to) — symmetric lookup", () => {
  test("symmetric for every matrix pair: f(a, b) === f(b, a)", () => {
    for (const entry of TRANSPORT_TRANSITION_MATRIX) {
      const forward = transportTransitionTreatment(entry.from, entry.to);
      const reverse = transportTransitionTreatment(entry.to, entry.from);
      expect(forward).toBe(entry.treatment);
      expect(reverse).toBe(entry.treatment);
    }
  });

  test("returns null for diagonal pairs", () => {
    for (const s of ALL_STATES) {
      expect(transportTransitionTreatment(s, s)).toBeNull();
    }
  });

  test("returns null for unknown states (defense against `as any`)", () => {
    expect(
      transportTransitionTreatment(
        "ZZ" as TransportBranchState,
        "FF",
      ),
    ).toBeNull();
  });
});

describe("directedTransportTreatment — direction-aware lookup", () => {
  test("forward directions match matrix entries verbatim", () => {
    for (const entry of TRANSPORT_TRANSITION_MATRIX) {
      expect(directedTransportTreatment(entry.from, entry.to)).toBe(
        entry.treatment,
      );
    }
  });

  test("fade-in-mount inverts to fade-out-unmount on reverse direction", () => {
    // FF → TF is fade-in-mount; reverse TF → FF should be fade-out-unmount.
    expect(directedTransportTreatment("TF", "FF")).toBe("fade-out-unmount");
    expect(directedTransportTreatment("FT", "FF")).toBe("fade-out-unmount");
    expect(directedTransportTreatment("TT", "FF")).toBe("fade-out-unmount");
  });

  test("stay-mounted-pulse is symmetric on reverse direction", () => {
    // TF → FT is stay-mounted-pulse; reverse FT → TF should also be
    // stay-mounted-pulse (no AnimatePresence cycle in either direction).
    expect(directedTransportTreatment("FT", "TF")).toBe("stay-mounted-pulse");
    expect(directedTransportTreatment("TT", "TF")).toBe("stay-mounted-pulse");
    expect(directedTransportTreatment("TT", "FT")).toBe("stay-mounted-pulse");
  });

  test("returns null for diagonal pairs", () => {
    for (const s of ALL_STATES) {
      expect(directedTransportTreatment(s, s)).toBeNull();
    }
  });
});

describe("Plan Step 4b spec-named transitions match matrix", () => {
  /**
   * Spec-named transitions from the dispatch:
   *
   *   (false,false) → (true,false): fade-in mount.
   *   (false,false) → (false,true): fade-in mount.
   *   (true,false)  → (false,false): fade-out.
   *   (false,true)  → (false,false): fade-out.
   *   (true,false)  ↔ (false,true): stay mounted (no flicker).
   *   (true,true)   → (true,false): stay mounted (one branch dropped).
   *   (true,true)   → (false,true): stay mounted (one branch dropped).
   *   (true,true)   → (false,false): fade out.
   */
  test("FF → TF is fade-in-mount", () => {
    expect(directedTransportTreatment("FF", "TF")).toBe("fade-in-mount");
  });

  test("FF → FT is fade-in-mount", () => {
    expect(directedTransportTreatment("FF", "FT")).toBe("fade-in-mount");
  });

  test("TF → FF is fade-out-unmount", () => {
    expect(directedTransportTreatment("TF", "FF")).toBe("fade-out-unmount");
  });

  test("FT → FF is fade-out-unmount", () => {
    expect(directedTransportTreatment("FT", "FF")).toBe("fade-out-unmount");
  });

  test("TF ↔ FT is stay-mounted-pulse (no flicker)", () => {
    expect(directedTransportTreatment("TF", "FT")).toBe("stay-mounted-pulse");
    expect(directedTransportTreatment("FT", "TF")).toBe("stay-mounted-pulse");
  });

  test("TT → TF is stay-mounted-pulse (one branch flips false but other stays true)", () => {
    expect(directedTransportTreatment("TT", "TF")).toBe("stay-mounted-pulse");
  });

  test("TT → FT is stay-mounted-pulse", () => {
    expect(directedTransportTreatment("TT", "FT")).toBe("stay-mounted-pulse");
  });

  test("TT → FF is fade-out-unmount (both branches flip false in single sync)", () => {
    expect(directedTransportTreatment("TT", "FF")).toBe("fade-out-unmount");
  });
});
