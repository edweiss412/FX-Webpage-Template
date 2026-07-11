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
    expect(ops).toEqual(["renameCrewMember:Jon→John", "deleteCrewMembersNotIn", "upsertCrewMembers"]);
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
