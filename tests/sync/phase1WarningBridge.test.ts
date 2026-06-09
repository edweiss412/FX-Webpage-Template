import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type {
  ContactRow,
  CrewMemberRow,
  HotelReservationRow,
  ParseResult,
  RoomRow,
  TriggeredReviewItem,
} from "@/lib/parser/types";

type FakeShowRow = {
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  priorParseResult: ParseResult;
};

type FakePendingSync = {
  driveFileId: string;
  wizardSessionId: string | null;
  baseModifiedTime: string | null;
  stagedModifiedTime: string;
  parseResult: ParseResult;
  triggeredReviewItems: TriggeredReviewItem[];
  priorLastSyncStatus: string | null;
  priorLastSyncError: string | null;
  stagedId: string;
  sourceKind: string;
  warningSummary: string;
};

function crew(name: string): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase()}@example.com`,
    phone: null,
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

function room(): RoomRow {
  return {
    kind: "gs",
    name: "General Session",
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
  };
}

function hotel(): HotelReservationRow {
  return {
    ordinal: 1,
    hotel_name: "Hotel",
    hotel_address: null,
    names: [],
    confirmation_no: null,
    check_in: null,
    check_out: null,
    notes: null,
  };
}

function contact(): ContactRow {
  return {
    kind: "venue",
    name: "Kurt",
    email: "kurt@example.com",
    phone: null,
    notes: null,
  };
}

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: {
      title: "Show Title",
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
      coi_status: "Pending",
      po: "PO-1",
      proposal: "Proposal-1",
      invoice: "Invoice-1",
      invoice_notes: "Notes",
    },
    crewMembers: [crew("Alice")],
    hotelReservations: [hotel()],
    rooms: [room()],
    transportation: null,
    contacts: [contact()],
    pullSheet: [{ caseLabel: "A", items: [{ qty: 1, cat: null, subCat: null, item: "Cable" }] }],
    diagrams: {
      linkedFolder: null,
      embeddedImages: [],
      linkedFolderItems: [],
    },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...overrides,
  };
}

function fileMeta(): DriveListedFile {
  return {
    driveFileId: "sheet-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
  };
}

class FakePhase1Tx {
  shows = new Map<string, FakeShowRow>();
  pendingSyncs: FakePendingSync[] = [];

  async readShowForPhase1(driveFileId: string) {
    return this.shows.get(driveFileId) ?? null;
  }

  async readLivePendingSync() {
    return null;
  }

  async upsertLivePendingIngestion() {}

  async deleteLivePendingIngestion() {}

  async upsertLivePendingSync(row: Omit<FakePendingSync, "stagedId"> & { stagedId?: string }) {
    const next = { ...row, stagedId: row.stagedId ?? "staged-1" };
    this.pendingSyncs = [next];
    return { stagedId: next.stagedId };
  }

  async updateShowParseError() {}

  async updateShowPendingReview(driveFileId: string) {
    const show = this.shows.get(driveFileId);
    if (show) show.lastSyncStatus = "pending_review";
  }

  async deleteWizardPendingSyncsExcept() {}
}

async function runWithWarning(
  code: string,
  overrides: Partial<ParseResult>,
): Promise<{
  result: Awaited<ReturnType<typeof import("@/lib/sync/phase1").runPhase1>>;
  tx: FakePhase1Tx;
}> {
  vi.resetModules();
  const { runPhase1 } = await import("@/lib/sync/phase1");
  const tx = new FakePhase1Tx();
  tx.shows.set("sheet-1", {
    driveFileId: "sheet-1",
    lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
    lastSyncStatus: "ok",
    lastSyncError: null,
    priorParseResult: parseResult(),
  });
  const next = parseResult({
    ...overrides,
    warnings: [{ severity: "warn", code, message: `${code} message` }],
  });

  const result = await runPhase1(tx, {
    driveFileId: "sheet-1",
    mode: "cron",
    fileMeta: fileMeta(),
    binding: { bindingToken: "token-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
    parseResult: next,
  });

  return { result, tx };
}

describe("Phase 1 sync-layer warning bridge (Phase 2: asset items auto-apply, never staged — PF34)", () => {
  // Phase 2 Task 2.1: the sync-layer asset-review items (DIAGRAMS_*/REEL_DRIFT) are notifications.
  // The decision rule auto-applies them (existing show → `pass`) and never routes them to a live
  // pending_sync stage. Their metadata still flows to the Phase-2/Phase-5 feed-row derivation; the
  // per-item shape is covered there. Here we pin that NONE of them stages.
  test("DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE auto-applies (no stage)", async () => {
    const { result, tx } = await runWithWarning("DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE", {});
    expect(result.outcome).toBe("pass");
    expect(tx.pendingSyncs).toEqual([]);
  });

  test("DIAGRAMS_EMBEDDED_NONE_FOUND auto-applies (no stage)", async () => {
    const { result, tx } = await runWithWarning("DIAGRAMS_EMBEDDED_NONE_FOUND", {});
    expect(result.outcome).toBe("pass");
    expect(tx.pendingSyncs).toEqual([]);
  });

  test("DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING auto-applies (no stage)", async () => {
    const { result, tx } = await runWithWarning("DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING", {});
    expect(result.outcome).toBe("pass");
    expect(tx.pendingSyncs).toEqual([]);
  });

  test("REEL_DRIFT_PENDING auto-applies (no stage)", async () => {
    const { result, tx } = await runWithWarning("REEL_DRIFT_PENDING", {
      openingReel: {
        driveFileId: "reel-1",
        drive_modified_time: "2026-05-08T10:00:00.000Z",
        headRevisionId: "reel-rev-1",
        mimeType: "video/mp4",
      },
    });
    expect(result.outcome).toBe("pass");
    expect(tx.pendingSyncs).toEqual([]);
  });
});
