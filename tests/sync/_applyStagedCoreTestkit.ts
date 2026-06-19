import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import type { ApplyStagedCoreArgs } from "@/lib/sync/applyStagedCore";

/**
 * Shared spy helpers for the applyStagedCore suites (Task 1.2 extraction — the fixtures were
 * authored in tests/sync/applyStagedCore.test.ts for Task 1.1 and are reused by the
 * live-partition scoping suite and later F1 tasks). Fixture shape mirrors
 * tests/sync/applyStaged.test.ts:32-120.
 */

export function parseResult(crewNames: string[] = ["Ada", "Bo"]): ParseResult {
  return {
    show: {
      title: "Show",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: "PO-1",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: crewNames.map((name) => ({
      name,
      email: `${name.toLowerCase()}@example.com`,
      phone: null,
      role: "A1",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    })),
    hotelReservations: [],
    rooms: [
      {
        kind: "ballroom",
        name: "Main",
        dimensions: null,
        floor: null,
        setup: null,
        set_time: null,
        show_time: null,
        strike_time: null,
        audio: null,
        video: null,
        lighting: null,
        scenic: null,
        power: null,
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  } as unknown as ParseResult;
}

export function fileMeta(): DriveListedFile {
  return {
    driveFileId: "drive-core-1",
    name: "Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-06-10T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "h1",
  } as DriveListedFile;
}

export type SpyTx = LockedShowTx<SyncPipelineTx> & { ops: string[]; sql: string[] };

export function spyTx(): SpyTx {
  const tx = {
    ops: [] as string[],
    sql: [] as string[],
    async queryOne<T>(sql: string, _params: unknown[]) {
      tx.sql.push(sql.replace(/\s+/g, " ").trim());
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      throw new Error(`unexpected queryOne SQL: ${sql}`);
    },
    holdPort() {
      return {
        unsafe: async (q: string) => {
          tx.sql.push(q);
          return [];
        },
      };
    },
    async applyShowSnapshot() {
      tx.ops.push("applyShowSnapshot");
      return {
        outcome: "updated" as const,
        showId: "show-1",
        previousCrewNames: ["Ada"],
        previousCrewMembers: [],
        priorRunOfShow: null,
      };
    },
    async deleteCrewMembersNotIn() {
      tx.ops.push("deleteCrewMembersNotIn");
    },
    async upsertCrewMembers() {
      tx.ops.push("upsertCrewMembers");
    },
    async provisionAddedCrewAuth(_id: string, names: string[]) {
      tx.ops.push(`provisionAddedCrewAuth:${names.join(",")}`);
    },
    async revokeRemovedCrewAuth() {
      tx.ops.push("revokeRemovedCrewAuth");
    },
    async replaceHotelReservations() {
      tx.ops.push("replaceHotelReservations");
    },
    async replaceRooms() {
      tx.ops.push("replaceRooms");
    },
    async replaceTransportation() {
      tx.ops.push("replaceTransportation");
    },
    async replaceContacts() {
      tx.ops.push("replaceContacts");
    },
    async upsertShowsInternal() {
      tx.ops.push("upsertShowsInternal");
    },
    async deleteLivePendingIngestion() {
      tx.ops.push("deleteLivePendingIngestion");
    },
  } as unknown as SpyTx;
  return tx;
}

export function coreArgs(
  tx: SpyTx,
  overrides: Partial<ApplyStagedCoreArgs> = {},
): ApplyStagedCoreArgs {
  void tx;
  return {
    sourceScope: "live",
    driveFileId: "drive-core-1",
    show: { showId: "show-1", lastSeenModifiedTime: "2026-06-09T00:00:00.000Z", diagrams: null },
    parseResult: parseResult(),
    triggeredReviewItems: [],
    reviewerChoices: [],
    stagedId: "33333333-3333-4333-8333-333333333333",
    stagedModifiedTime: "2026-06-10T12:00:00.000Z",
    baseModifiedTime: "2026-06-09T00:00:00.000Z",
    appliedByEmail: "doug@fxav.com",
    appliedAt: null,
    auditSource: "staged_apply",
    fileMeta: fileMeta(),
    mi11Items: [],
    skipDiagramsWrite: false,
    feedPolicy: { kind: "none" }, // R37-1: required field, no API default — choice_aware cases override explicitly
    ...overrides,
  };
}
