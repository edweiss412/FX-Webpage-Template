import { describe, expect, test, vi } from "vitest";
import type { RunManualStageForFirstSeenTx } from "@/lib/sync/runManualStageForFirstSeen";
import { runManualStageForFirstSeen } from "@/lib/sync/runManualStageForFirstSeen";

class FakeManualStageTx implements RunManualStageForFirstSeenTx {
  held = true;
  operations: string[] = [];
  autoPublishFirstSeen:
    | { unpublishToken: string; unpublishTokenExpiresAt: string }
    | undefined;
  stagedRows: Array<{
    driveFileId: string;
    triggeredReviewItems: Array<{ invariant: string }>;
  }> = [];
  async queryOne<T>(sql: string) {
    if (/pg_locks/i.test(sql)) return { held: this.held } as T;
    return { held: this.held } as T;
  }
  async deleteLivePendingIngestion(driveFileId = "file-1") {
    this.operations.push(`deleteLivePendingIngestion:${driveFileId}`);
    return undefined;
  }
  async upsertLivePendingSync(row: {
    driveFileId: string;
    triggeredReviewItems: Array<{ invariant: string }>;
  }) {
    this.stagedRows.push({
      driveFileId: row.driveFileId,
      triggeredReviewItems: row.triggeredReviewItems,
    });
    return { stagedId: "staged-forced" };
  }
  async applyShowSnapshot(args: {
    driveFileId: string;
    staleGuard: string;
    autoPublishFirstSeen?: { unpublishToken: string; unpublishTokenExpiresAt: string };
  }) {
    this.operations.push(`applyShowSnapshot:${args.driveFileId}:${args.staleGuard}`);
    this.autoPublishFirstSeen = args.autoPublishFirstSeen;
    return { outcome: "updated" as const, showId: "show-1", previousCrewNames: [] };
  }
  async deleteCrewMembersNotIn() {
    this.operations.push("deleteCrewMembersNotIn");
  }
  async upsertCrewMembers() {
    this.operations.push("upsertCrewMembers");
  }
  async provisionAddedCrewAuth() {
    this.operations.push("provisionAddedCrewAuth");
  }
  async revokeRemovedCrewAuth() {
    this.operations.push("revokeRemovedCrewAuth");
  }
  async replaceHotelReservations() {
    this.operations.push("replaceHotelReservations");
  }
  async replaceRooms() {
    this.operations.push("replaceRooms");
  }
  async replaceTransportation() {
    this.operations.push("replaceTransportation");
  }
  async replaceContacts() {
    this.operations.push("replaceContacts");
  }
  async upsertShowsInternal() {
    this.operations.push("upsertShowsInternal");
  }
}

describe("runManualStageForFirstSeen", () => {
  test("uses the caller-held lock and forces Phase 1 staging for first-seen retry", async () => {
    const tx = new FakeManualStageTx();
    const runPhase1 = vi.fn(async () => ({
      outcome: "stage" as const,
      triggeredReviewItems: [{ id: "item-1", invariant: "ONBOARDING_SCAN_REVIEW" as const }],
      stagedId: "staged-1",
    }));

    const result = await runManualStageForFirstSeen(tx as never, "file-1", {
      fileMeta: {
        driveFileId: "file-1",
        name: "file-1.xlsx",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      },
      parseResult: {
        show: {
          title: "First Seen",
          client_label: "Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: null, set: "2026-05-08", showDays: [], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
        crewMembers: [],
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
      runPhase1,
      binding: {
        bindingToken: "rev-1",
        modifiedTime: "2026-05-08T12:00:00.000Z",
      },
    });

    expect(result).toEqual({ outcome: "parsed_pending_review", stagedId: "staged-1" });
    expect(runPhase1).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "file-1",
        mode: "manual",
      }),
    );
  });

  test("auto-publishes first-seen clean retry and deletes the live pending ingestion", async () => {
    const tx = new FakeManualStageTx();

    const result = await runManualStageForFirstSeen(tx as never, "file-1", {
      fileMeta: {
        driveFileId: "file-1",
        name: "file-1.xlsx",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      },
      parseResult: {
        show: {
          title: "First Seen",
          client_label: "Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: null, set: "2026-05-08", showDays: [], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
        crewMembers: [],
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
      runPhase1: vi.fn(async () => ({ outcome: "auto_publish_ready" as const })),
      binding: {
        bindingToken: "rev-1",
        modifiedTime: "2026-05-08T12:00:00.000Z",
      },
      createUnpublishToken: () => "11111111-1111-4111-8111-111111111111",
      now: () => new Date("2026-05-08T12:00:00.000Z"),
    });

    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(tx.operations).toEqual([
      "applyShowSnapshot:file-1:less_than_or_equal",
      "deleteCrewMembersNotIn",
      "upsertCrewMembers",
      "provisionAddedCrewAuth",
      "revokeRemovedCrewAuth",
      "replaceHotelReservations",
      "replaceRooms",
      "replaceTransportation",
      "replaceContacts",
      "upsertShowsInternal",
      "deleteLivePendingIngestion:file-1",
    ]);
    expect(tx.autoPublishFirstSeen).toEqual({
      unpublishToken: "11111111-1111-4111-8111-111111111111",
      unpublishTokenExpiresAt: "2026-05-09T12:00:00.000Z",
    });
    expect(tx.stagedRows).toEqual([]);
  });

  test("preserves Phase 1 debounce as deferred rather than hard failed", async () => {
    const tx = new FakeManualStageTx();

    const result = await runManualStageForFirstSeen(tx as never, "file-1", {
      fileMeta: {
        driveFileId: "file-1",
        name: "file-1.xlsx",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      },
      binding: {
        bindingToken: "rev-1",
        modifiedTime: "2026-05-08T12:00:00.000Z",
      },
      parseResult: {
        show: {
          title: "First Seen",
          client_label: "Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: null, set: "2026-05-08", showDays: [], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
        crewMembers: [],
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
      runPhase1: vi.fn(async () => ({ outcome: "defer" as const, reason: "mi8_modtime_unstable" as const })),
    });

    expect(result).toEqual({ outcome: "deferred", reason: "mi8_modtime_unstable" });
  });

  test("rejects calls when the show lock is not held", async () => {
    const tx = new FakeManualStageTx();
    tx.held = false;

    await expect(
      runManualStageForFirstSeen(tx as never, "file-1", {
        runPhase1: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "LOCK_OWNERSHIP_ASSERTION_FAILED" });
  });
});
