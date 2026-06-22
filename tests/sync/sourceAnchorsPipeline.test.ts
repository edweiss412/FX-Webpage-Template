/**
 * Task 5: pipeline integration test — source-anchor extraction wired into the sync pipeline.
 *
 * Asserts:
 * (a) The object handed to tx.applyShowSnapshot carries sourceAnchors.venue.gid === 0
 *     (INFO tab, sheetId 0, confirmed by extractSourceAnchors on the XLSX bytes).
 * (b) driveClient.listSpreadsheetSheets is called EXACTLY ONCE across the whole prepare
 *     step — both anchor extraction AND enrichWithDrivePins share the single call.
 *
 * This test is in-memory only — tx is mocked, no DB is hit.
 */
import { describe, expect, test, vi } from "vitest";
import * as XLSX from "xlsx";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import type { Phase1Binding, Phase1Tx } from "@/lib/sync/phase1";
import type { Phase2Tx } from "@/lib/sync/phase2";
import type { DriveClient, SpreadsheetSheet } from "@/lib/sync/enrichWithDrivePins";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  prepareProcessOneFile,
  processOneFile_unlocked as processOneFile_unlockedRaw,
  type ProcessOneFileDeps,
  revisionRaceCooldownSeconds,
} from "@/lib/sync/runScheduledCronSync";

// ── XLSX fixture helpers ──────────────────────────────────────────────────────

function makeXlsx(sheets: Array<{ name: string; rows: unknown[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Minimal XLSX: INFO tab with a VENUE row, sheetId inferred as 0 via titleToGid. */
const VENUE_BYTES: ArrayBuffer = makeXlsx([
  {
    name: "INFO",
    rows: [
      ["CLIENT", "Test Show"],
      ["VENUE", "Marriott Grand"],
      ["Hotel Address", "123 Main St"],
    ],
  },
]);

// ── minimal ParseResult ───────────────────────────────────────────────────────

function emptyParsedSheet(overrides: Partial<ParsedSheet> = {}): ParsedSheet {
  return {
    show: {
      title: "Test Show",
      client_label: "Test",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: "2026-05-07", set: "2026-05-08", showDays: ["2026-05-09"], travelOut: "2026-05-10" },
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
        name: "Alice",
        email: "alice@example.com",
        phone: null,
        role: "A1",
        role_flags: ["A1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
    ],
    hotelReservations: [],
    rooms: [
      {
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
    ...overrides,
  };
}

function emptyParseResult(): ParseResult {
  return {
    ...emptyParsedSheet(),
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function cooldownKey(driveFileId: string, revisionId: string): string {
  return `${driveFileId}\0${revisionId}`;
}

function makeFileMeta(driveFileId: string): DriveListedFile {
  return {
    driveFileId,
    name: "Test Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-01-01T00:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "rev-1",
  };
}

const BINDING: Phase1Binding = {
  bindingToken: "rev-1",
  modifiedTime: "2026-01-01T00:00:00.000Z",
};

const SHEETS_RESPONSE: SpreadsheetSheet[] = [{ title: "INFO", sheetId: 0 }];

// ── captured applyShowSnapshot args ──────────────────────────────────────────

type CapturedApplyArgs = Parameters<Phase2Tx["applyShowSnapshot"]>[0];

// ── full pipeline mock tx ─────────────────────────────────────────────────────

type PipelineTx = Phase1Tx &
  Phase2Tx & {
    operations: string[];
    revisionRaceCooldowns: Map<string, { retryCount: number; lastRaceAtMs: number }>;
    nowMs: number;
    queryOne<T>(): Promise<T>;
    readRevisionRaceCooldown(
      driveFileId: string,
      racedHeadRevisionId: string,
    ): Promise<{ retryCount: number; cooldownSeconds: number; cooldownRemainingMs: number } | null>;
    upsertRevisionRaceCooldown(
      driveFileId: string,
      racedHeadRevisionId: string,
    ): Promise<{ retryCount: number; cooldownSeconds: number }>;
    deleteRevisionRaceCooldowns(driveFileId: string): Promise<void>;
    readLiveDeferral(
      driveFileId: string,
    ): Promise<{
      deferred_kind: "defer_until_modified" | "permanent_ignore";
      deferred_at_modified_time: string | null;
    } | null>;
    deleteLiveDeferral(driveFileId: string): Promise<void>;
    markShowSheetUnavailable(
      driveFileId: string,
      code: string,
    ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null }>;
    markShowDriveError(
      driveFileId: string,
      code: string,
    ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null }>;
    insertSyncLog(
      entry: { driveFileId: string | null; outcome: string; code?: string; payload?: Record<string, unknown> },
      showId?: string | null,
    ): Promise<void>;
    upsertAdminAlert(input: { showId: string | null; code: string; context: Record<string, unknown> }): Promise<string | null>;
    capturedApplyArgs?: CapturedApplyArgs;
  };

function makeTx(): PipelineTx {
  return {
    operations: [],
    nowMs: Date.parse("2026-01-01T00:00:00.000Z"),
    revisionRaceCooldowns: new Map(),

    async queryOne<T>() {
      return { held: true, locked: true } as T;
    },
    async readRevisionRaceCooldown(driveFileId, racedHeadRevisionId) {
      const row = this.revisionRaceCooldowns.get(cooldownKey(driveFileId, racedHeadRevisionId));
      if (!row || row.retryCount <= 0) return null;
      const seconds = revisionRaceCooldownSeconds(row.retryCount);
      const remaining = row.lastRaceAtMs + seconds * 1000 - this.nowMs;
      if (remaining <= 0) return null;
      return { retryCount: row.retryCount, cooldownSeconds: seconds, cooldownRemainingMs: remaining };
    },
    async upsertRevisionRaceCooldown(driveFileId, racedHeadRevisionId) {
      const key = cooldownKey(driveFileId, racedHeadRevisionId);
      const existing = this.revisionRaceCooldowns.get(key);
      const retryCount = (existing?.retryCount ?? 0) + 1;
      this.revisionRaceCooldowns.set(key, { retryCount, lastRaceAtMs: this.nowMs });
      return { retryCount, cooldownSeconds: revisionRaceCooldownSeconds(retryCount) };
    },
    async deleteRevisionRaceCooldowns(driveFileId) {
      for (const key of [...this.revisionRaceCooldowns.keys()]) {
        if (key.startsWith(`${driveFileId}\0`)) this.revisionRaceCooldowns.delete(key);
      }
    },
    async readLiveDeferral() { return null; },
    async deleteLiveDeferral() {},
    // Phase1Tx
    async readShowForPhase1() {
      return {
        driveFileId: "file-1",
        lastSeenModifiedTime: "2025-12-31T00:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: emptyParseResult(),
      };
    },
    async readLivePendingSync() { return null; },
    async upsertLivePendingIngestion() {},
    async deleteLivePendingIngestion() {},
    async upsertLivePendingSync() { return { stagedId: "staged-1" }; },
    async updateShowParseError() {},
    async updateShowPendingReview() {},
    async deleteWizardPendingSyncsExcept() {},
    // ApplyParseResultTx
    async deleteCrewMembersNotIn() {},
    async upsertCrewMembers() {},
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {},
    async replaceRooms() {},
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal() {},
    // Phase2Tx
    async applyShowSnapshot(args) {
      this.capturedApplyArgs = args;
      return {
        outcome: "updated",
        showId: "show-uuid-1",
        previousCrewNames: [],
        previousCrewMembers: [],
        priorRunOfShow: null,
      };
    },
    async markShowSheetUnavailable() { return { showId: null, lastSeenModifiedTime: null }; },
    async markShowDriveError() { return { showId: null, lastSeenModifiedTime: null }; },
    async insertSyncLog() {},
    async upsertAdminAlert() { return null; },
  };
}

// ── test ─────────────────────────────────────────────────────────────────────

describe("sourceAnchors pipeline (Task 5)", () => {
  test(
    "sourceAnchors.venue.gid===0 reaches tx.applyShowSnapshot; listSpreadsheetSheets called exactly once",
    async () => {
      const DRIVE_FILE_ID = "file-1";
      const fileMeta = makeFileMeta(DRIVE_FILE_ID);

      // Stub driveClient with a vi.fn() for listSpreadsheetSheets — exactly-once contract.
      const listSpreadsheetSheetsMock = vi
        .fn<(id: string) => Promise<SpreadsheetSheet[]>>()
        .mockResolvedValue(SHEETS_RESPONSE);

      const mockDriveClient: DriveClient = {
        async getFile() {
          return {
            driveFileId: DRIVE_FILE_ID,
            headRevisionId: "rev-1",
            md5Checksum: "a".repeat(32),
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-01-01T00:00:00.000Z",
          };
        },
        async listFolder() { return { folderId: "folder-1", files: [] }; },
        listSpreadsheetSheets: listSpreadsheetSheetsMock,
      };

      const deps: ProcessOneFileDeps = {
        captureBinding: async () => BINDING,
        fetchMarkdownAtRevision: async () => "",
        // Task 5 new injection point: raw XLSX bytes for anchor extraction
        fetchXlsxBytes: async () => VENUE_BYTES,
        parseSheet: () => emptyParsedSheet(),
        driveClient: mockDriveClient,
        // No enrichWithDrivePins override — use real impl so its listSpreadsheetSheets call is counted
      };

      // Step 1: prepare (fetch + parse + enrich + anchor extraction)
      const prepared = await prepareProcessOneFile(
        DRIVE_FILE_ID,
        "cron",
        fileMeta,
        deps,
        // readCooldown: pass the tx's reader to satisfy the interface
        async () => null,
      );

      expect(prepared.kind, "pipeline should reach ready state").toBe("ready");
      if (prepared.kind !== "ready") return;

      // (b) listSpreadsheetSheets called EXACTLY ONCE across prepare (both anchor scan + enrich)
      expect(listSpreadsheetSheetsMock).toHaveBeenCalledTimes(1);

      // Step 2: run the locked phase with a mock tx
      const pipelineTx = makeTx();
      const lockedTx = pipelineTx as unknown as LockedShowTx<PipelineTx>;

      await processOneFile_unlockedRaw(
        lockedTx,
        DRIVE_FILE_ID,
        "cron",
        fileMeta,
        deps,
        prepared,
      );

      // (a) sourceAnchors.venue.gid === 0 (INFO tab, sheetId 0)
      const capturedArgs = pipelineTx.capturedApplyArgs;
      expect(capturedArgs, "applyShowSnapshot should have been called").toBeDefined();

      const sourceAnchors = (capturedArgs as Record<string, unknown>)?.sourceAnchors as
        | Record<string, SourceAnchor>
        | undefined;
      expect(sourceAnchors, "sourceAnchors should be present on the applyShowSnapshot args").toBeDefined();
      expect(sourceAnchors?.venue?.gid, "venue.gid must equal 0 (INFO tab sheetId=0)").toBe(0);
    },
  );
});
