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
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import {
  affectedTilesOnFlip,
  type CapabilityPredicate,
} from "@/lib/visibility/capabilityTransitions";
import type { TransportationRow } from "@/lib/parser/types";

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
    const diagonals = TRANSPORT_TRANSITION_MATRIX.filter((entry) => entry.from === entry.to);
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
    expect(transportTransitionTreatment("ZZ" as TransportBranchState, "FF")).toBeNull();
  });
});

describe("directedTransportTreatment — direction-aware lookup", () => {
  test("forward directions match matrix entries verbatim", () => {
    for (const entry of TRANSPORT_TRANSITION_MATRIX) {
      expect(directedTransportTreatment(entry.from, entry.to)).toBe(entry.treatment);
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

/**
 * Compound transitions (review Important 4 / plan Step 4b).
 *
 * The transport matrix encodes per-branch transition treatments; the
 * production contract is that `transportTileVisible` AND the matrix
 * agree on the visibility outcome when MULTIPLE inputs change in the
 * same sync. The two compound tests below exercise the §8.1 contract
 * across both schedule-tag content changes (driver/passenger renames)
 * and capability-flip × transport-flip composition.
 *
 * Mid-animation interrupt behavior (e.g., a Realtime push that flips
 * the schedule-tag branch while the AnimatePresence enter cycle is
 * still in flight) is M6 territory — those tests live alongside the
 * Realtime push handlers in M5/M6. What we lock down HERE is the
 * pure-data contract those animation handlers depend on.
 */
describe("Compound transport transitions (review Important 4)", () => {
  /**
   * Compound 1 — schedule-tag flip mid `crew_members.name` change.
   *
   * Setup: viewer is renamed from "Old Name" to "New Name" via sheet
   * edit. The transportation.schedule[*].assigned_names array still
   * contains "Old Name" (parser hasn't re-tagged yet). Verify:
   *   - BEFORE rename: viewer matches by old name (FT branch true).
   *   - DURING (assigned_names not yet updated): viewer no longer
   *     matches (FF branch — tile would unmount until parser catches up).
   *   - AFTER (assigned_names updated to "New Name"): viewer matches
   *     again (FT branch true).
   *
   * The matrix transition for the DURING → AFTER step is FF → FT, which
   * is `fade-in-mount` per the matrix. The test composes the predicate
   * outcomes against the matrix lookup to verify they agree.
   */
  test("schedule-tag flip during viewer rename: FT → FF → FT round-trip composes correctly", () => {
    const baseTransport: TransportationRow = {
      driver_name: "Doug Larson",
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [
        {
          stage: "Hotel → Venue",
          date: "2026-04-21",
          time: "08:00",
          assigned_names: ["Old Name"],
        },
      ],
      notes: null,
    };

    // Step A — BEFORE rename: viewer.name = "Old Name", schedule tags
    // include "Old Name". Driver branch false; schedule-tag branch true.
    const beforeVisible = transportTileVisible({
      transportation: baseTransport,
      viewerName: "Old Name",
      isAdmin: false,
    });
    expect(beforeVisible).toBe(true);

    // Step B — DURING: viewer renamed to "New Name" but parser hasn't
    // re-tagged. Driver branch false; schedule-tag branch false (no
    // entry contains "New Name"). Tile MUST unmount → FT → FF.
    const duringVisible = transportTileVisible({
      transportation: baseTransport,
      viewerName: "New Name",
      isAdmin: false,
    });
    expect(duringVisible).toBe(false);

    // Step C — AFTER: parser re-tagged the schedule entry with the
    // new name. Driver branch false; schedule-tag branch true.
    const reTaggedTransport: TransportationRow = {
      ...baseTransport,
      schedule: [{ ...baseTransport.schedule[0]!, assigned_names: ["New Name"] }],
    };
    const afterVisible = transportTileVisible({
      transportation: reTaggedTransport,
      viewerName: "New Name",
      isAdmin: false,
    });
    expect(afterVisible).toBe(true);

    // Matrix agreement on the DURING → AFTER step: FF → FT is
    // fade-in-mount (forward direction). Both helpers — symmetric
    // (transportTransitionTreatment) and direction-aware
    // (directedTransportTreatment) — return fade-in-mount.
    expect(transportTransitionTreatment("FF", "FT")).toBe("fade-in-mount");
    expect(directedTransportTreatment("FF", "FT")).toBe("fade-in-mount");
    // And BEFORE → DURING (FT → FF) is fade-out-unmount per the
    // direction-aware lookup.
    expect(directedTransportTreatment("FT", "FF")).toBe("fade-out-unmount");
  });

  /**
   * Compound 2 — `role_flags[]` capability flip composed with transport
   * visibility flip in the same sync.
   *
   * Setup: a non-LEAD viewer (`['LEAD']` only — they ARE lead) is NOT
   * an assigned driver and is NOT in any schedule's assigned_names.
   * Their capability flips to `['LEAD','A1']` (gains A1) AND they
   * become the assigned driver in the same sync.
   *
   * Two distinct contracts compose here:
   *   (a) Capability matrix: flipping hasA1 false→true with hasLead held
   *       true is conditional on hasLead's value (LEAD already unlocks
   *       Audio); the capability matrix records the definitive delta as
   *       empty for this case (per the entry's `bFlipDelta`).
   *   (b) Transport matrix: FF → TF is fade-in-mount (driver branch
   *       newly true).
   *
   * The compound is correct when BOTH the gated-tile visibility AND the
   * transport visibility derive coherently from the new state. We
   * verify both predicates simultaneously.
   */
  test("capability flip + transport flip in same sync compose to coherent visibility", () => {
    // Capability side — hasA1 flips with hasLead held true. The matrix
    // entry hasLead × hasA1 records aFlipDelta for hasLead and
    // bFlipDelta for hasA1; the bFlipDelta is empty (Audio remains
    // visible via the LEAD branch regardless of A1). Encoded as
    // `{appears: [], disappears: []}` in the matrix.
    const a1FlipWithLeadHeld = affectedTilesOnFlip(
      "hasA1" as CapabilityPredicate,
      "hasLead" as CapabilityPredicate,
      "false_to_true",
    );
    expect(a1FlipWithLeadHeld).toEqual({ appears: [], disappears: [] });

    // Transport side — viewer was hidden (no driver match, no schedule
    // tag). They become the driver in the same sync.
    const beforeTransport: TransportationRow = {
      driver_name: "Other Person",
      driver_phone: null,
      driver_email: null,
      vehicle: null,
      license_plate: null,
      color: null,
      parking: null,
      schedule: [],
      notes: null,
    };
    const beforeVisible = transportTileVisible({
      transportation: beforeTransport,
      viewerName: "Viewer Name",
      isAdmin: false,
    });
    expect(beforeVisible).toBe(false);

    // After the sync: driver_name is the viewer. Schedule still empty.
    // Driver branch true → tile visible (TF).
    const afterTransport: TransportationRow = {
      ...beforeTransport,
      driver_name: "Viewer Name",
    };
    const afterVisible = transportTileVisible({
      transportation: afterTransport,
      viewerName: "Viewer Name",
      isAdmin: false,
    });
    expect(afterVisible).toBe(true);

    // Matrix agreement: FF → TF is fade-in-mount.
    expect(transportTransitionTreatment("FF", "TF")).toBe("fade-in-mount");
    expect(directedTransportTreatment("FF", "TF")).toBe("fade-in-mount");

    // Compound coherence: the capability flip's empty definitive delta
    // (bFlipDelta on hasA1) means Audio's visibility was unchanged
    // across the sync (already visible via LEAD), AND the transport
    // tile's visibility flipped false→true. Two independent contracts,
    // both derived from the SAME post-sync state — no half-applied
    // intermediate is observable to the renderer.
  });
});
