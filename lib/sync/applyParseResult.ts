import type { ParseResult } from "@/lib/parser/types";

export type ApplyParseResultSnapshot = {
  showId: string;
  previousCrewNames: string[];
  previousCrewMembers?: ParseResult["crewMembers"];
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
};

function namesFrom(parseResult: ParseResult): string[] {
  return parseResult.crewMembers.map((member) => member.name);
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

export async function applyParseResult(
  tx: ApplyParseResultTx,
  args: ApplyParseResultArgs,
): Promise<void> {
  const nextCrewNames = namesFrom(args.parseResult);
  const removedCrewNames = difference(args.snapshot.previousCrewNames, nextCrewNames);
  const addedCrewNames = difference(nextCrewNames, args.snapshot.previousCrewNames);

  await tx.deleteCrewMembersNotIn(args.snapshot.showId, nextCrewNames);
  await tx.upsertCrewMembers(args.snapshot.showId, args.parseResult.crewMembers);
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
}
