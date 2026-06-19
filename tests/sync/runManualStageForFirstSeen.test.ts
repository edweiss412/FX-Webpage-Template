import { describe, expect, test, vi } from "vitest";
import type { RunManualStageForFirstSeenTx } from "@/lib/sync/runManualStageForFirstSeen";
import { runManualStageForFirstSeen } from "@/lib/sync/runManualStageForFirstSeen";
import type { ParseResult } from "@/lib/parser/types";

const snapshotAssetMock = vi.hoisted(() => ({
  factoryCalls: [] as Array<{ showId: string }>,
  snapshotCalls: [] as Array<{ driveFileId: string; diagrams: ParseResult["diagrams"] }>,
}));

vi.mock("@/lib/sync/defaultSnapshotAssetsForApply", () => ({
  makeSnapshotAssetsForApply: vi.fn((showId: string) => {
    snapshotAssetMock.factoryCalls.push({ showId });
    return async (args: { driveFileId: string; diagrams: ParseResult["diagrams"] }) => {
      snapshotAssetMock.snapshotCalls.push(args);
      return {
        snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        runUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        tempPrefix: `diagram-snapshots/shows/${showId}/_pending/run-1/`,
        warnings: [],
        pending: {
          revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          snapshot_status: "complete",
          linkedFolder: args.diagrams.linkedFolder,
          embeddedImages: [],
          linkedFolderItems: [],
        },
      };
    };
  }),
}));

class FakeManualStageTx implements RunManualStageForFirstSeenTx {
  held = true;
  operations: string[] = [];
  autoPublishFirstSeen: { unpublishToken: string; unpublishTokenExpiresAt: string } | undefined;
  stagedRows: Array<{
    driveFileId: string;
    triggeredReviewItems: Array<{ invariant: string }>;
  }> = [];
  alerts: Array<{ showId: string | null; code: string; context: Record<string, unknown> }> = [];
  pendingSnapshotUploads: unknown[] = [];
  diagramSnapshot: ParseResult["diagrams"] | null = null;
  async queryOne<T>(sql: string) {
    if (/pg_locks/i.test(sql)) return { held: this.held } as T;
    return { held: this.held } as T;
  }
  async upsertAdminAlert(input: {
    showId: string | null;
    code: string;
    context: Record<string, unknown>;
  }) {
    this.alerts.push(input);
    return "alert-1";
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
  async readShowId() {
    return null;
  }
  async insertPendingSnapshotUpload(row: unknown) {
    this.pendingSnapshotUploads.push(row);
  }
  async applyDiagramSnapshot(_driveFileId: string, diagrams: ParseResult["diagrams"]) {
    this.operations.push("applyDiagramSnapshot");
    this.diagramSnapshot = diagrams;
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
      {}, // Task 4.3: third arg is the (empty here) Phase1Deps flag-thread
    );
  });

  test("Task 4.3: threads getAutoPublishCleanFirstSeen into runPhase1; OFF → parsed_pending_review (no auto-publish)", async () => {
    const tx = new FakeManualStageTx();
    const getAutoPublishCleanFirstSeen = async () => ({ kind: "value", autoPublish: false }) as const;
    // runPhase1 spy returns what the REAL runPhase1 returns when the flag is OFF (proven in phase1.test.ts):
    // a FIRST_SEEN_REVIEW stage. We assert the flag dep is threaded through as the 3rd arg.
    const runPhase1 = vi.fn(async () => ({
      outcome: "stage" as const,
      triggeredReviewItems: [{ id: "item-1", invariant: "FIRST_SEEN_REVIEW" as const }],
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
      binding: { bindingToken: "rev-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
      runPhase1,
      getAutoPublishCleanFirstSeen,
    });

    expect(result).toEqual({ outcome: "parsed_pending_review", stagedId: "staged-1" });
    expect(runPhase1).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ mode: "manual" }),
      { getAutoPublishCleanFirstSeen },
    );
    // OFF must NOT auto-publish: no first-published alert.
    expect(tx.alerts).toEqual([]);
  });

  test("auto-publishes first-seen clean retry, alerts with undo payload, invalidates, and deletes the live pending ingestion", async () => {
    const tx = new FakeManualStageTx();
    const events: string[] = [];
    const upsertAdminAlert = vi.fn(
      async (input: { showId: string | null; code: string; context: Record<string, unknown> }) => {
        events.push("alert:first-published");
        tx.alerts.push(input);
        return "alert-1";
      },
    );
    const publishShowInvalidation = vi.fn(async () => {
      events.push("broadcast");
    });

    const result = await runManualStageForFirstSeen(tx as never, "file-1", {
      fileMeta: {
        driveFileId: "file-1",
        name: "First Seen Sheet.xlsx",
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
        crewMembers: [
          {
            name: "Alex Crew",
            email: "alex@example.com",
            phone: null,
            role: "A1",
            role_flags: ["A1"],
            date_restriction: { kind: "none" },
            stage_restriction: { kind: "none" },
            flight_info: null,
          },
          {
            name: "Blair Crew",
            email: "blair@example.com",
            phone: null,
            role: "V1",
            role_flags: ["V1"],
            date_restriction: { kind: "none" },
            stage_restriction: { kind: "none" },
            flight_info: null,
          },
        ],
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
      upsertAdminAlert,
      publishShowInvalidation,
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
    expect(publishShowInvalidation).toHaveBeenCalledWith("show-1");
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "SHOW_FIRST_PUBLISHED",
      context: {
        drive_file_id: "file-1",
        sheet_name: "First Seen Sheet.xlsx",
        crew_count: 2,
        show_date: "2026-05-08",
        // M12.13: the raw bearer secret no longer persists in alert context; expiry stays.
        unpublish_token_expires_at: "2026-05-09T12:00:00.000Z",
      },
    });
    expect(tx.alerts).toEqual([
      {
        showId: "show-1",
        code: "SHOW_FIRST_PUBLISHED",
        context: {
          drive_file_id: "file-1",
          sheet_name: "First Seen Sheet.xlsx",
          crew_count: 2,
          show_date: "2026-05-08",
          // M12.13: the raw bearer secret no longer persists in alert context; expiry stays.
          unpublish_token_expires_at: "2026-05-09T12:00:00.000Z",
        },
      },
    ]);
    // M12.13: assert the secret is absent (the exact-match assertions above already pin shape).
    expect(tx.alerts[0]!.context).not.toHaveProperty("unpublish_token");
    expect(events).toEqual(["broadcast", "alert:first-published"]);
    expect(tx.autoPublishFirstSeen).toEqual({
      unpublishToken: "11111111-1111-4111-8111-111111111111",
      unpublishTokenExpiresAt: "2026-05-09T12:00:00.000Z",
    });
    expect(tx.stagedRows).toEqual([]);
  });

  test("auto-published first-seen retry snapshots diagram assets after show creation", async () => {
    snapshotAssetMock.factoryCalls.length = 0;
    snapshotAssetMock.snapshotCalls.length = 0;
    const tx = new FakeManualStageTx();
    const diagrams: ParseResult["diagrams"] = {
      linkedFolder: null,
      embeddedImages: [
        {
          sheetTab: "DIAGRAMS",
          objectId: "obj-1",
          mimeType: "image/png",
          sheetsRevisionId: "sheet-rev-1",
          embeddedFingerprint: "fingerprint",
          recovery_disposition: "normal",
          snapshotPath: null,
        },
      ],
      linkedFolderItems: [],
    };

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
        diagrams,
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
      upsertAdminAlert: vi.fn(async () => "alert-1"),
    });

    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(snapshotAssetMock.factoryCalls).toEqual([{ showId: "show-1" }]);
    expect(snapshotAssetMock.snapshotCalls).toEqual([{ driveFileId: "file-1", diagrams }]);
    expect(tx.operations).toContain("applyDiagramSnapshot");
    expect(tx.diagramSnapshot).toMatchObject({
      pending: expect.objectContaining({
        snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    });
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
      runPhase1: vi.fn(async () => ({
        outcome: "defer" as const,
        reason: "mi8_modtime_unstable" as const,
      })),
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
