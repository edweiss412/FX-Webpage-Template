import type { CrewMemberRow, ParseResult, ScheduleDay } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { agendaDayEmptied } from "@/lib/parser/blocks/agendaWarnings";
import { attachSourceCellAnchors } from "@/lib/drive/showDayTimeAnchors";
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
  // §02 (D-2 / R6): the prior stored shows_internal.run_of_show, plumbed from applyShowSnapshot's
  // live `select run_of_show from shows_internal`. Used ONLY to decide which AGENDA_DAY_EMPTIED
  // warnings to emit (observability) — never to preserve content (CONFIRMED-ONLY full replace).
  // Optional here (tolerates other snapshot sources); the applyShowSnapshot RETURN is the required
  // live producer (phase2.ts). first-seen / nothing-prior = null.
  priorRunOfShow?: Record<string, ScheduleDay> | null;
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
      // §02 (D-2): CONFIRMED-ONLY full replace — exactly the latest parse's confirmed (non-empty)
      // days, or null when none remain. Persisted as $5::jsonb (postgres.js serializes; never
      // JSON.stringify — double-encode trap).
      run_of_show: Record<string, ScheduleDay> | null;
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
  /**
   * Task 5: source-region anchors extracted from the XLSX bytes. Optional — callers that
   * don't yet supply XLSX bytes (wizard, manual-resync) omit this field. Task 6 will
   * consume this to persist the anchors via the shows UPDATE.
   */
  sourceAnchors?: Record<string, SourceAnchor>;
};

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

  // §02 (D-2 / spec §4.2 / §4.4 retention matrix): CONFIRMED-ONLY full replace of run_of_show.
  // The stored value is EXACTLY the latest parse's confirmed (non-empty) days — no per-day
  // preserve/merge of prior entries; the prior stored value is consulted ONLY to decide which
  // AGENDA_DAY_EMPTIED warnings to emit (observability). The AGENDA_DAY_EMPTIED append must happen
  // BEFORE the parse_warnings payload is built below (ordering invariant, channel 1) AND it mutates
  // args.parseResult.warnings — the same array reference runPhase2 reads for the applied return's
  // parseWarnings (channel 2 / sync_log). Single-owner rule: the parser owns GRID_MALFORMED/
  // BLOCK_UNRESOLVED/DAY_AMBIGUOUS/DAY_TRUNCATED (already in warnings); the sync emits DAY_EMPTIED
  // ONLY (it alone needs prior-stored state the parser lacks). NO write-time date prune (R12).
  const parsedRunOfShow = args.parseResult.runOfShow;
  let runOfShowToStore: Record<string, ScheduleDay> | null;
  if (parsedRunOfShow === undefined) {
    // Grid unlocatable (converter/header failure): store null and append NOTHING — the parser
    // already put AGENDA_GRID_MALFORMED in warnings; the sync carries it, never re-emits, and never
    // adds AGENDA_DAY_EMPTIED here (a distinct conversion-fault state, R22).
    runOfShowToStore = null;
  } else {
    const confirmed = Object.fromEntries(
      Object.entries(parsedRunOfShow).filter(
        ([, day]) => day.entries.length > 0 || day.showStart !== null || day.window !== null,
      ),
    );
    runOfShowToStore = Object.keys(confirmed).length > 0 ? confirmed : null;
    // AGENDA_DAY_EMPTIED ONLY on the LOCATED-grid read-empty shape: a day that was previously
    // stored AND is now FULLY empty (no entries/showStart/window). A day merely ABSENT from the
    // parsed Record (unresolved block → parser's AGENDA_BLOCK_UNRESOLVED) does NOT qualify.
    const prior = args.snapshot.priorRunOfShow;
    let emittedIndex = 0;
    const isFullyEmpty = (d: ScheduleDay | undefined): boolean =>
      d != null && d.entries.length === 0 && d.showStart === null && d.window === null;
    const priorHadContent = (d: ScheduleDay | undefined): boolean =>
      d != null && (d.entries.length > 0 || d.showStart !== null || d.window !== null);
    for (const [iso, day] of Object.entries(parsedRunOfShow)) {
      if (isFullyEmpty(day) && priorHadContent(prior?.[iso])) {
        args.parseResult.warnings.push(agendaDayEmptied(emittedIndex, iso));
        emittedIndex += 1;
      }
    }
    // AGENDA_DAY_EMPTIED is appended HERE, after the cron prepare stage already ran
    // attachWarningAnchors. Re-run the PURE region-only anchoring on the carried
    // sourceAnchors so the appended warning still deep-links to its schedule tab.
    // No fetch, no DB, no lock; idempotent + non-destructive (only sets sourceCell
    // when a region resolves, never clobbers an already-set anchor).
    if (emittedIndex > 0) {
      attachSourceCellAnchors(args.parseResult.warnings, {
        showDay: [],
        crewRole: [],
        unknownField: [],
        region: args.sourceAnchors ?? {},
      });
    }
  }

  await tx.upsertShowsInternal(args.snapshot.showId, {
    financials: {
      po: args.parseResult.show.po,
      proposal: args.parseResult.show.proposal,
      invoice: args.parseResult.show.invoice,
      invoice_notes: args.parseResult.show.invoice_notes,
    },
    parse_warnings: args.parseResult.warnings,
    raw_unrecognized: args.parseResult.raw_unrecognized,
    run_of_show: runOfShowToStore,
  });
  await tx.deleteLivePendingIngestion(args.driveFileId);
  return { appliedCrewMembers: crewMembers };
}
