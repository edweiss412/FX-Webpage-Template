import type { CrewMemberRow, ParseResult } from "@/lib/parser/types";
import { planHoldAwareApply } from "@/lib/sync/holds/holdAwareApply";
import { readOpenHolds, type HoldPort } from "@/lib/sync/holds/holdPort";

// PF38 (resolution #24): the prior-crew snapshot carries id + claimed_via_oauth_at so the
// auto-apply before_image can restore the ORIGINAL crew identity (picker-cookie key + OAuth
// claim) on a Phase-4 undo. Without them an undo re-inserts a different, unclaimed identity.
export type PreviousCrewMember = CrewMemberRow & {
  id: string;
  claimed_via_oauth_at: string | null;
};

export type ApplyParseResultSnapshot = {
  showId: string;
  previousCrewNames: string[];
  previousCrewMembers?: PreviousCrewMember[];
};

export type ApplyParseResultTx = {
  deleteCrewMembersNotIn(showId: string, names: string[]): Promise<void>;
  upsertCrewMembers(showId: string, members: ParseResult["crewMembers"]): Promise<void>;
  provisionAddedCrewAuth(showId: string, names: string[]): Promise<void>;
  revokeRemovedCrewAuth(showId: string, names: string[]): Promise<void>;
  replaceHotelReservations(showId: string, rows: ParseResult["hotelReservations"]): Promise<void>;
  replaceRooms(showId: string, rows: ParseResult["rooms"]): Promise<void>;
  replaceTransportation(showId: string, row: ParseResult["transportation"]): Promise<void>;
  replaceContacts(showId: string, rows: ParseResult["contacts"]): Promise<void>;
  upsertShowsInternal(
    showId: string,
    payload: {
      financials: {
        po: string | null;
        proposal: string | null;
        invoice: string | null;
        invoice_notes: string | null;
      };
      parse_warnings: ParseResult["warnings"];
      raw_unrecognized: ParseResult["raw_unrecognized"];
    },
  ): Promise<void>;
  deleteLivePendingIngestion(driveFileId: string): Promise<void>;
};

export type ApplyParseResultArgs = {
  driveFileId: string;
  parseResult: ParseResult;
  snapshot: ApplyParseResultSnapshot;
  /**
   * Hold-aware apply context (Phase 2). When present, the apply reads open `sync_holds`, pins
   * held crew identity (email+name), suppresses deletes of held names, folds later rename/removal
   * of held crew, reserves proposed targets, honors undo_override holds, and re-evaluates/releases
   * holds in-place — all via service-role SQL on the same locked txn. Absent → legacy apply.
   */
  holds?: {
    port: HoldPort;
    baseModifiedTime: string;
  };
};

function namesFrom(parseResult: ParseResult): string[] {
  return parseResult.crewMembers.map((member) => member.name);
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

export type ApplyParseResultOutcome = {
  // P2-F2: the crew list that ACTUALLY landed in crew_members (post-suppression / post-fold /
  // identity-pinned). The change-log writer must derive crew_added/removed/renamed from THIS, not
  // the raw parse list, so a reservation-suppressed row never gets a phantom auto_apply row.
  appliedCrewMembers: ParseResult["crewMembers"];
};

export async function applyParseResult(
  tx: ApplyParseResultTx,
  args: ApplyParseResultArgs,
): Promise<ApplyParseResultOutcome> {
  // Hold-aware path: when a hold port is supplied, transform the crew list (identity pins, folds,
  // suppressions, undo_override honoring) and protect held names from deletion/auth churn.
  let crewMembers = args.parseResult.crewMembers;
  let deleteProtectedNames: string[] = [];
  let heldNames = new Set<string>();
  if (args.holds) {
    const openHolds = await readOpenHolds(args.holds.port, args.snapshot.showId);
    if (openHolds.length > 0) {
      const { plan } = await planHoldAwareApply({
        port: args.holds.port,
        showId: args.snapshot.showId,
        parseResult: args.parseResult,
        openHolds,
        baseModifiedTime: args.holds.baseModifiedTime,
        // P2-F4: distinguish added vs pre-existing rows so reservation never deletes a live member.
        previousCrewNames: args.snapshot.previousCrewNames,
      });
      crewMembers = plan.crewMembers;
      deleteProtectedNames = [...plan.protectedNames];
      heldNames = plan.heldNames;
    }
  }

  const nextCrewNames = crewMembers.map((m) => m.name);
  // Delete-suppression: held names are never deleted even if absent from the parse.
  const deleteKeepNames = [...new Set([...nextCrewNames, ...deleteProtectedNames])];
  const removedCrewNames = difference(args.snapshot.previousCrewNames, nextCrewNames).filter(
    (name) => !heldNames.has(name),
  );
  const addedCrewNames = difference(nextCrewNames, args.snapshot.previousCrewNames).filter(
    (name) => !heldNames.has(name),
  );

  await tx.deleteCrewMembersNotIn(args.snapshot.showId, deleteKeepNames);
  await tx.upsertCrewMembers(args.snapshot.showId, crewMembers);
  await tx.provisionAddedCrewAuth(args.snapshot.showId, addedCrewNames);
  await tx.revokeRemovedCrewAuth(args.snapshot.showId, removedCrewNames);
  await tx.replaceHotelReservations(args.snapshot.showId, args.parseResult.hotelReservations);
  await tx.replaceRooms(args.snapshot.showId, args.parseResult.rooms);
  await tx.replaceTransportation(args.snapshot.showId, args.parseResult.transportation);
  await tx.replaceContacts(args.snapshot.showId, args.parseResult.contacts);
  await tx.upsertShowsInternal(args.snapshot.showId, {
    financials: {
      po: args.parseResult.show.po,
      proposal: args.parseResult.show.proposal,
      invoice: args.parseResult.show.invoice,
      invoice_notes: args.parseResult.show.invoice_notes,
    },
    parse_warnings: args.parseResult.warnings,
    raw_unrecognized: args.parseResult.raw_unrecognized,
  });
  await tx.deleteLivePendingIngestion(args.driveFileId);
  return { appliedCrewMembers: crewMembers };
}
