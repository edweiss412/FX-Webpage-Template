import { describe, expect, test, vi } from "vitest";
import type { RunManualStageForFirstSeenTx } from "@/lib/sync/runManualStageForFirstSeen";
import { runManualStageForFirstSeen } from "@/lib/sync/runManualStageForFirstSeen";

class FakeManualStageTx implements RunManualStageForFirstSeenTx {
  held = true;
  stagedRows: Array<{
    driveFileId: string;
    triggeredReviewItems: Array<{ invariant: string }>;
  }> = [];
  async queryOne<T>(sql: string) {
    if (/pg_locks/i.test(sql)) return { held: this.held } as T;
    return { held: this.held } as T;
  }
  async deleteLivePendingIngestion() {
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

  test("downgrades first-seen auto-publish readiness into FIRST_SEEN_REVIEW staging", async () => {
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
    });

    expect(result).toEqual({ outcome: "parsed_pending_review", stagedId: "staged-forced" });
    expect(tx.stagedRows).toEqual([
      {
        driveFileId: "file-1",
        triggeredReviewItems: [expect.objectContaining({ invariant: "FIRST_SEEN_REVIEW" })],
      },
    ]);
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
