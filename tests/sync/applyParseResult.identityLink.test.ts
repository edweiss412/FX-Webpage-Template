import { describe, expect, it, vi } from "vitest";
import { applyParseResult, type ApplyParseResultArgs } from "@/lib/sync/applyParseResult";
import type { CrewMemberRow } from "@/lib/parser/types";

// BL-CREW-RENAME-SILENT-REPLACEMENT spec §3.4: identity-preserving rename ordering + skip guards.
// The held-name skip guard is deliberately NOT here — it lives as one real-DB acceptance test in
// applyParseResult.identityLink.db.test.ts (single home).

function crew(name: string, overrides: Partial<CrewMemberRow> = {}): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@x.example`,
    phone: null,
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
    ...overrides,
  };
}

function makeTx() {
  const ops: string[] = [];
  const tx = {
    deleteCrewMembersNotIn: vi.fn(async () => {
      ops.push("deleteCrewMembersNotIn");
    }),
    upsertCrewMembers: vi.fn(async () => {
      ops.push("upsertCrewMembers");
    }),
    renameCrewMember: vi.fn(async (_showId: string, removedName: string, addedName: string) => {
      ops.push(`renameCrewMember:${removedName}→${addedName}`);
      // Default models a rename that LANDED; per-test overrides use mockResolvedValue(false).
      return true;
    }),
    provisionAddedCrewAuth: vi.fn(),
    revokeRemovedCrewAuth: vi.fn(),
    replaceHotelReservations: vi.fn(),
    replaceRooms: vi.fn(),
    replaceTransportation: vi.fn(),
    replaceContacts: vi.fn(),
    upsertShowsInternal: vi.fn(),
    deleteLivePendingIngestion: vi.fn(),
  };
  return { tx, ops };
}

function baseArgs(
  previousCrewNames: string[],
  nextCrew: CrewMemberRow[],
  identityLinkRenames?: Array<{ removedName: string; addedName: string }>,
) {
  return {
    driveFileId: "f1",
    parseResult: {
      show: { po: null, proposal: null, invoice: null, invoice_notes: null },
      crewMembers: nextCrew,
      hotelReservations: [],
      rooms: [],
      transportation: null,
      contacts: [],
      pullSheet: null,
      diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
      openingReel: null,
      raw_unrecognized: [],
      warnings: [],
      hardErrors: [],
    },
    snapshot: { showId: "s1", previousCrewNames, priorRunOfShow: null },
    ...(identityLinkRenames !== undefined ? { identityLinkRenames } : {}),
  } as unknown as ApplyParseResultArgs;
}

describe("applyParseResult — identity-link renames (spec §3.4)", () => {
  it("linked pair renames BEFORE delete and both before upsert", async () => {
    const { tx, ops } = makeTx();
    await applyParseResult(
      tx,
      baseArgs(["Jon"], [crew("John")], [{ removedName: "Jon", addedName: "John" }]),
    );
    expect(ops).toEqual([
      "renameCrewMember:Jon→John",
      "deleteCrewMembersNotIn",
      "upsertCrewMembers",
    ]);
    expect(tx.renameCrewMember).toHaveBeenCalledWith("s1", "Jon", "John");
  });

  it("pair skipped when removedName not in previous crew", async () => {
    const { tx, ops } = makeTx();
    await applyParseResult(
      tx,
      baseArgs(["Someone Else"], [crew("John")], [{ removedName: "Jon", addedName: "John" }]),
    );
    expect(ops).toEqual(["deleteCrewMembersNotIn", "upsertCrewMembers"]);
    expect(tx.renameCrewMember).not.toHaveBeenCalled();
  });

  it("pair skipped when addedName absent from post-hold next crew", async () => {
    const { tx } = makeTx();
    await applyParseResult(
      tx,
      baseArgs(["Jon"], [crew("Unrelated")], [{ removedName: "Jon", addedName: "John" }]),
    );
    expect(tx.renameCrewMember).not.toHaveBeenCalled();
  });

  it("duplicate pair (same removedName twice) consumes first only", async () => {
    const { tx, ops } = makeTx();
    await applyParseResult(
      tx,
      baseArgs(
        ["Jon"],
        [crew("John"), crew("Johnny")],
        [
          { removedName: "Jon", addedName: "John" },
          { removedName: "Jon", addedName: "Johnny" },
        ],
      ),
    );
    expect(ops.filter((op) => op.startsWith("renameCrewMember:"))).toEqual([
      "renameCrewMember:Jon→John",
    ]);
  });

  it("empty/absent identityLinkRenames leaves op sequence identical to today", async () => {
    const { tx: txAbsent, ops: opsAbsent } = makeTx();
    await applyParseResult(txAbsent, baseArgs(["Jon"], [crew("John")]));
    const { tx: txEmpty, ops: opsEmpty } = makeTx();
    await applyParseResult(txEmpty, baseArgs(["Jon"], [crew("John")], []));
    expect(opsAbsent).toEqual(["deleteCrewMembersNotIn", "upsertCrewMembers"]);
    expect(opsEmpty).toEqual(opsAbsent);
    expect(txAbsent.renameCrewMember).not.toHaveBeenCalled();
    expect(txEmpty.renameCrewMember).not.toHaveBeenCalled();
  });
});

// Spec §2.1 A2/A3: the outcome reports which pairs LANDED and, for each that did not, why — plus
// whether the source row survived the apply anyway. The name_held reason and the survived-because-
// held case live in applyParseResult.identityLink.db.test.ts, which wires a real hold port;
// baseArgs has no hold knob and must not grow one to fake a planner shape production never emits.
describe("applyParseResult — landed / unlanded rename reporting (spec §2.1)", () => {
  it("reports a landed pair in landedRenames and nothing in unlandedRenames", async () => {
    const { tx } = makeTx();
    tx.renameCrewMember.mockResolvedValue(true);
    const outcome = await applyParseResult(
      tx,
      baseArgs(["Old"], [crew("New")], [{ removedName: "Old", addedName: "New" }]),
    );
    expect(outcome.landedRenames).toEqual([{ removedName: "Old", addedName: "New" }]);
    expect(outcome.unlandedRenames).toEqual([]);
  });

  it("reports rename_no_op when the guarded update matched nothing", async () => {
    const { tx } = makeTx();
    tx.renameCrewMember.mockResolvedValue(false);
    const outcome = await applyParseResult(
      tx,
      baseArgs(["Old"], [crew("New")], [{ removedName: "Old", addedName: "New" }]),
    );
    expect(outcome.landedRenames).toEqual([]);
    expect(outcome.unlandedRenames).toHaveLength(1);
    expect(outcome.unlandedRenames[0]?.reason).toBe("rename_no_op");
    expect(outcome.unlandedRenames[0]?.sourceSurvived).toBe(false);
  });

  it("maps source_absent, target_absent and pair_already_consumed to distinct reasons", async () => {
    const { tx } = makeTx();
    tx.renameCrewMember.mockResolvedValue(true);

    const sourceAbsent = await applyParseResult(
      tx,
      baseArgs(["Old"], [crew("New")], [{ removedName: "Ghost", addedName: "New" }]),
    );
    expect(sourceAbsent.unlandedRenames[0]?.reason).toBe("source_absent");

    const targetAbsent = await applyParseResult(
      tx,
      baseArgs(["Old"], [crew("New")], [{ removedName: "Old", addedName: "Nowhere" }]),
    );
    expect(targetAbsent.unlandedRenames[0]?.reason).toBe("target_absent");

    const duplicate = await applyParseResult(
      tx,
      baseArgs(
        ["Old"],
        [crew("New"), crew("Other")],
        [
          { removedName: "Old", addedName: "New" },
          { removedName: "Old", addedName: "Other" },
        ],
      ),
    );
    expect(duplicate.unlandedRenames[0]?.reason).toBe("pair_already_consumed");
  });

  it("a same-name pair (source === target) is handled without corrupting state", async () => {
    const { tx } = makeTx();
    tx.renameCrewMember.mockResolvedValue(false);
    // Spec section 7 names this as a required boundary input. "Old" is both sides of the pair, so it
    // is present in previousCrewNames AND in the parse: the source/target guards both pass and the
    // consumed-once belt sees the same name twice. Assert we neither crash nor report a landed
    // rename of a row onto itself. The `reason` is deliberately NOT pinned — which of the guards
    // fires first for an identical source and target is an implementation detail of the loop order.
    const outcome = await applyParseResult(
      tx,
      baseArgs(["Old"], [crew("Old")], [{ removedName: "Old", addedName: "Old" }]),
    );
    expect(outcome.landedRenames).toEqual([]);
    expect(outcome.unlandedRenames).toHaveLength(1);
    expect(outcome.unlandedRenames[0]?.sourceSurvived).toBe(true);
  });

  it("sets sourceSurvived=true when the source name is still in the parsed crew", async () => {
    const { tx } = makeTx();
    tx.renameCrewMember.mockResolvedValue(true);
    // "Old" is BOTH the rename source and a parsed row, so it is in deleteKeepNames and survives.
    // The pair is unlanded because its target is absent from the parse.
    const outcome = await applyParseResult(
      tx,
      baseArgs(["Old"], [crew("Old")], [{ removedName: "Old", addedName: "Nowhere" }]),
    );
    expect(outcome.unlandedRenames[0]?.reason).toBe("target_absent");
    expect(outcome.unlandedRenames[0]?.sourceSurvived).toBe(true);
  });
});
