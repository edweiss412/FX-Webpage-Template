import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/email/canonicalize";
import type { CrewMemberRow } from "@/lib/parser/types";
import type { PreviousCrewMember } from "@/lib/sync/applyParseResult";
import {
  reconcileCrewOverrides,
  type ReconcileCrewOverridesArgs,
  type ReconcileCrewOverridesResult,
} from "@/lib/sync/reconcileCrewOverrides";

// ---- fixtures -----------------------------------------------------------------------------------

function crew(name: string, over: Partial<CrewMemberRow> = {}): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase()}@example.com`,
    phone: "555-OLD",
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
    ...over,
  };
}

function prev(id: string, member: CrewMemberRow): PreviousCrewMember {
  return { ...member, id, claimed_via_oauth_at: null, selections_reset_at: null };
}

function baseArgs(over: Partial<ReconcileCrewOverridesArgs> = {}): ReconcileCrewOverridesArgs {
  return {
    showId: "show-1",
    postHoldCrew: [],
    heldRetained: [],
    protectedNames: new Set(),
    heldNames: new Set(),
    previousCrewMembers: [],
    activeCrewOverrides: [],
    ...over,
  };
}

/**
 * Simulate sequential application of the ordered four-phase plan against the live set, asserting no
 * step transiently violates `unique(show_id, name)`. Under the correct order (delete → park → insert
 * → finals) it never throws; under the naive `insertBeforePark` order it MUST throw whenever a
 * survivor still holds a name a new insert wants (R24). Returns nothing; throws on violation.
 */
function assertNoTransientUniqueViolation(
  result: ReconcileCrewOverridesResult,
  prevRows: { id: string; name: string }[],
  opts: { insertBeforePark?: boolean } = {},
): void {
  const live = new Map<string, string>();
  for (const p of prevRows) live.set(p.id, p.name);
  const assertUnique = (step: string) => {
    const names = [...live.values()];
    if (new Set(names).size !== names.length) {
      throw new Error(`unique(show_id,name) violation after ${step}`);
    }
  };
  const doDeletes = () => {
    for (const id of result.writes.deletes) live.delete(id);
    assertUnique("delete");
  };
  const doParks = () => {
    for (const { id } of result.writes.parks) live.set(id, `\x1f__reassign__${id}`);
    assertUnique("park");
  };
  const doInserts = () => {
    let n = 0;
    for (const row of result.writes.inserts) {
      live.set(`__ins-${n++}`, row.name);
      assertUnique("insert");
    }
  };
  const doFinals = () => {
    for (const f of result.writes.finals) {
      live.set(f.id, f.row.name);
      assertUnique("final");
    }
  };
  doDeletes();
  if (opts.insertBeforePark) {
    doInserts();
    doParks();
  } else {
    doParks();
    doInserts();
  }
  doFinals();
}

// ---- tests --------------------------------------------------------------------------------------

describe("reconcileCrewOverrides", () => {
  it("keeps crew_members.id stable across override apply AND edit (finals reuse the prev id)", () => {
    // Failure mode caught: delete+reinsert (new id) on a display rename — the whole R11/id-churn class.
    const apply = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [crew("Jon", { role: "A2" })],
        previousCrewMembers: [prev("id-jon", crew("John"))],
        activeCrewOverrides: [
          { id: "ov1", field: "name", match_key: "Jon", override_value: "John" },
        ],
      }),
    );
    expect(apply.writes.inserts).toHaveLength(0);
    expect(apply.writes.deletes).toHaveLength(0);
    expect(apply.writes.parks).toHaveLength(0); // display name unchanged (John === John)
    expect(apply.writes.finals).toHaveLength(1);
    const applied = apply.writes.finals[0]!;
    expect(applied.id).toBe("id-jon");
    expect(applied.row.name).toBe("John");
    expect(applied.sheetName).toBe("Jon"); // §4.4 visibility alias
    expect(applied.row.sheet_name).toBe("Jon");
    expect(apply.crewSideEffects).toContainEqual({ overrideId: "ov1", sheetValue: "Jon" });

    // Edit: Doug changes the output Jon→Johnny; RPC immediate-applied so the live row now reads
    // "Johnny". The parsed identity is still "Jon" → SAME id in finals.
    const edit = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [crew("Jon", { role: "A2" })],
        previousCrewMembers: [prev("id-jon", crew("Johnny"))],
        activeCrewOverrides: [
          { id: "ov1", field: "name", match_key: "Jon", override_value: "Johnny" },
        ],
      }),
    );
    expect(edit.writes.finals[0]!.id).toBe("id-jon");
    expect(edit.writes.finals[0]!.row.name).toBe("Johnny");
  });

  it("runtime collision (R11): the override-derived member loses, its id stays bound to its parsed identity", () => {
    // Failure mode caught: silently handing the pre-conflict id to the newly-parsed colliding member.
    const prevRows = [{ id: "id-jon", name: "John" }];
    const result = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [crew("Jon"), crew("John", { role: "NEW" })],
        previousCrewMembers: [prev("id-jon", crew("John"))],
        activeCrewOverrides: [
          { id: "ov1", field: "name", match_key: "Jon", override_value: "John" },
        ],
      }),
    );
    // override deactivated name_conflict
    expect(result.crewSideEffects).toContainEqual({
      overrideId: "ov1",
      deactivate: "name_conflict",
    });
    // pre-conflict id-jon stays bound to parsed identity "Jon" (fell back), NEVER reassigned/inserted
    const jonFinal = result.writes.finals.find((f) => f.id === "id-jon")!;
    expect(jonFinal.row.name).toBe("Jon");
    expect(jonFinal.sheetName).toBeNull();
    expect(result.writes.parks).toContainEqual({ id: "id-jon" }); // its name changed John→Jon
    expect(result.writes.inserts.map((r) => r.name)).toEqual(["John"]); // the new John is a fresh row
    expect(result.writes.inserts.some((r) => r.name === "Jon")).toBe(false);

    // R24: the four-phase order commits with no unique violation; naive insert-before-park throws.
    expect(() => assertNoTransientUniqueViolation(result, prevRows)).not.toThrow();
    expect(() =>
      assertNoTransientUniqueViolation(result, prevRows, { insertBeforePark: true }),
    ).toThrow(/unique\(show_id,name\)/);
  });

  it("R23 fail-closed convergence: a vanished parsed identity is target_missing, never silent re-key", () => {
    // Jon→John override + Jon→Lead role override; next parse emits a (different) "John", Jon gone.
    // Failure mode caught: re-keying id-jon to the arriving John (binds a picker cookie to a stranger)
    // OR stranding the sibling role override.
    const result = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [crew("John", { role: "X" })],
        previousCrewMembers: [prev("id-jon", crew("John"))],
        activeCrewOverrides: [
          { id: "ov-name", field: "name", match_key: "Jon", override_value: "John" },
          { id: "ov-role", field: "role", match_key: "Jon", override_value: "Lead" },
        ],
      }),
    );
    expect(result.writes.deletes).toEqual(["id-jon"]); // departed Jon deleted
    expect(result.writes.inserts.map((r) => r.name)).toEqual(["John"]); // arriving John = fresh id
    expect(result.writes.finals.some((f) => f.id === "id-jon")).toBe(false); // never re-keyed
    // BOTH override rows deactivate target_missing (name + sibling role)
    expect(result.crewSideEffects).toContainEqual({
      overrideId: "ov-name",
      deactivate: "target_missing",
    });
    expect(result.crewSideEffects).toContainEqual({
      overrideId: "ov-role",
      deactivate: "target_missing",
    });
  });

  it("R29 full-column refresh: the id-keyed final carries every NEW parsed column, only name/role overridden", () => {
    // Failure mode caught: dropping any mutable column the legacy upsert wrote on override-active shows.
    const parsed = crew("Alice", {
      email: "NEW@Example.COM",
      phone: "555-NEW",
      role: "A3",
      role_flags: ["V1"],
      date_restriction: { kind: "explicit", days: ["2026-05-09"] },
      stage_restriction: { kind: "explicit", stages: ["Show"] },
      flight_info: "AA123",
    });
    const result = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [parsed],
        previousCrewMembers: [prev("id-alice", crew("Alicia"))],
        activeCrewOverrides: [
          { id: "ov1", field: "name", match_key: "Alice", override_value: "Alicia" },
        ],
      }),
    );
    const final = result.writes.finals[0]!;
    expect(final.id).toBe("id-alice");
    expect(final.row).toEqual({
      name: "Alicia", // name overridden
      email: canonicalize("NEW@Example.COM"), // canonicalized parsed email (derived, not hardcoded)
      phone: "555-NEW",
      role: "A3", // no role override → parsed role passes through
      role_flags: ["V1"],
      date_restriction: { kind: "explicit", days: ["2026-05-09"] },
      stage_restriction: { kind: "explicit", stages: ["Show"] },
      flight_info: "AA123",
      sheet_name: "Alice",
    });
  });

  it("R24 write order: a name-swap cycle produces a constraint-safe plan with zero id churn", () => {
    // ovA Jon→John, ovB John→Jon — a stable applied swap. id-keyed reconciliation keeps both on
    // their original ids (no delete/insert), so the four-phase plan is trivially collision-free.
    const prevRows = [
      { id: "id-a", name: "John" }, // parsed Jon, displayed John
      { id: "id-b", name: "Jon" }, // parsed John, displayed Jon
    ];
    const result = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [crew("Jon"), crew("John")],
        previousCrewMembers: [prev("id-a", crew("John")), prev("id-b", crew("Jon"))],
        activeCrewOverrides: [
          { id: "ovA", field: "name", match_key: "Jon", override_value: "John" },
          { id: "ovB", field: "name", match_key: "John", override_value: "Jon" },
        ],
      }),
    );
    expect(result.writes.deletes).toHaveLength(0);
    expect(result.writes.inserts).toHaveLength(0);
    expect(new Set(result.writes.finals.map((f) => f.id))).toEqual(new Set(["id-a", "id-b"]));
    expect(() => assertNoTransientUniqueViolation(result, prevRows)).not.toThrow();
  });

  it("SYNC-6: when BOTH colliding outputs are override-derived, ALL of them deactivate and fall back", () => {
    // Failure mode caught: deactivating only one of two override-derived collisions (leaves a dup name).
    const result = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [crew("Amy"), crew("Ben")],
        previousCrewMembers: [],
        activeCrewOverrides: [
          { id: "ovA", field: "name", match_key: "Amy", override_value: "Sam" },
          { id: "ovB", field: "name", match_key: "Ben", override_value: "Sam" },
        ],
      }),
    );
    expect(result.crewSideEffects).toContainEqual({
      overrideId: "ovA",
      deactivate: "name_conflict",
    });
    expect(result.crewSideEffects).toContainEqual({
      overrideId: "ovB",
      deactivate: "name_conflict",
    });
    // both fall back to their own parsed names — no "Sam" is ever written
    expect(result.writes.inserts.map((r) => r.name).sort()).toEqual(["Amy", "Ben"]);
    expect(result.writes.inserts.some((r) => r.name === "Sam")).toBe(false);
  });

  it("post-hold only (R11): a held prev-only member is retained, NOT deactivated", () => {
    // Failure mode caught: deciding deactivation before the hold disposition — a removal-suppressed
    // member would be wrongly deleted + its override deactivated stale.
    const result = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [crew("Bob")],
        previousCrewMembers: [prev("id-bob", crew("Bob")), prev("id-eve", crew("Eve"))],
        protectedNames: new Set(["Eve"]),
        heldNames: new Set(["Eve"]),
        activeCrewOverrides: [
          { id: "ov-eve", field: "role", match_key: "Eve", override_value: "Lead" },
        ],
      }),
    );
    expect(result.writes.deletes).toHaveLength(0); // Eve retained
    // Eve's override stays active — no side-effect at all for it (left exactly as-is)
    expect(result.crewSideEffects.some((s) => "overrideId" in s && s.overrideId === "ov-eve")).toBe(
      false,
    );
  });

  it("G3 (R3): appliedCrew carries the WRITTEN display name + final role, not the raw parse", () => {
    // Failure mode caught: applyParseResult returning the raw parsed crew list as appliedCrewMembers,
    // so writeAutoApplyChanges (which diffs the LIVE previousCrewMembers "John" against nextCrewMembers)
    // sees "John" removed + "Jon" added on a STABLE display-rename sync — bogus crew_removed/crew_added
    // feed rows for a pure display rename (spec §3.6 line 150). appliedCrew must be the display view.
    const result = reconcileCrewOverrides(
      baseArgs({
        postHoldCrew: [crew("Jon", { role: "A2" }), crew("Kim", { role: "A1" })],
        previousCrewMembers: [prev("id-jon", crew("John")), prev("id-kim", crew("Kim"))],
        activeCrewOverrides: [
          { id: "ov-name", field: "name", match_key: "Jon", override_value: "John" },
          { id: "ov-role", field: "role", match_key: "Kim", override_value: "Lead" },
        ],
      }),
    );
    const byName = new Map(result.appliedCrew.map((m) => [m.name, m]));
    // The name-overridden member appears under its DISPLAY name (matches the live row → no diff).
    expect(byName.has("John")).toBe(true);
    expect(byName.has("Jon")).toBe(false); // raw parsed name must NOT leak into the applied list
    // The role-overridden member carries the FINAL (overridden) role.
    expect(byName.get("Kim")?.role).toBe("Lead");
    // Full-column identity is preserved (email from the parsed row, not invented).
    expect(byName.get("John")?.email).toBe(canonicalize("jon@example.com"));
    expect(result.appliedCrew).toHaveLength(2);
  });
});
