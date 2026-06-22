/**
 * Task 5 + Task 6: source-anchor pipeline and persistence tests.
 *
 * Task 5 (in-memory):
 * (a) The object handed to tx.applyShowSnapshot carries sourceAnchors.venue.gid === 0
 *     (INFO tab, sheetId 0, confirmed by extractSourceAnchors on the XLSX bytes).
 * (b) driveClient.listSpreadsheetSheets is called EXACTLY ONCE across the whole prepare
 *     step — both anchor extraction AND enrichWithDrivePins share the single call.
 *
 * Task 6 (real-DB, LOCAL-ONLY):
 * (c) PostgresPipelineTx.applyShowSnapshot UPDATE arm writes source_anchors to the DB row
 *     as the raw JS object (not double-stringified). Concrete failure mode: the UPDATE arm
 *     omits source_anchors = $N::jsonb → the column stays '{}' even when sourceAnchors is set.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_remediationHelpers";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
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
    readLiveDeferral(driveFileId: string): Promise<{
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
      entry: {
        driveFileId: string | null;
        outcome: string;
        code?: string;
        payload?: Record<string, unknown>;
      },
      showId?: string | null,
    ): Promise<void>;
    upsertAdminAlert(input: {
      showId: string | null;
      code: string;
      context: Record<string, unknown>;
    }): Promise<string | null>;
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
      return {
        retryCount: row.retryCount,
        cooldownSeconds: seconds,
        cooldownRemainingMs: remaining,
      };
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
    async readLiveDeferral() {
      return null;
    },
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
    async readLivePendingSync() {
      return null;
    },
    async upsertLivePendingIngestion() {},
    async deleteLivePendingIngestion() {},
    async upsertLivePendingSync() {
      return { stagedId: "staged-1" };
    },
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
    async markShowSheetUnavailable() {
      return { showId: null, lastSeenModifiedTime: null };
    },
    async markShowDriveError() {
      return { showId: null, lastSeenModifiedTime: null };
    },
    async insertSyncLog() {},
    async upsertAdminAlert() {
      return null;
    },
  };
}

// ── test ─────────────────────────────────────────────────────────────────────

describe("sourceAnchors pipeline (Task 5)", () => {
  test("sourceAnchors.venue.gid===0 reaches tx.applyShowSnapshot; listSpreadsheetSheets called exactly once", async () => {
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
      async listFolder() {
        return { folderId: "folder-1", files: [] };
      },
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

    // (b) listSpreadsheetSheets called EXACTLY ONCE in the prepare/parse phase (Phase 2 does not call it)
    expect(listSpreadsheetSheetsMock).toHaveBeenCalledTimes(1);

    // Step 2: run the locked phase with a mock tx
    const pipelineTx = makeTx();
    const lockedTx = pipelineTx as unknown as LockedShowTx<PipelineTx>;

    await processOneFile_unlockedRaw(lockedTx, DRIVE_FILE_ID, "cron", fileMeta, deps, prepared);

    // (a) sourceAnchors.venue.gid === 0 (INFO tab, sheetId 0)
    const capturedArgs = pipelineTx.capturedApplyArgs;
    expect(capturedArgs, "applyShowSnapshot should have been called").toBeDefined();

    const sourceAnchors = (capturedArgs as Record<string, unknown>)?.sourceAnchors as
      | Record<string, SourceAnchor>
      | undefined;
    expect(
      sourceAnchors,
      "sourceAnchors should be present on the applyShowSnapshot args",
    ).toBeDefined();
    expect(sourceAnchors?.venue?.gid, "venue.gid must equal 0 (INFO tab sheetId=0)").toBe(0);
  });
});

// ── Task 6: real-DB persistence test ─────────────────────────────────────────
//
// Probes the real PostgresPipelineTx.applyShowSnapshot UPDATE arm against the
// LOCAL Supabase instance. LOCAL_TEST_DATABASE_URL / DATABASE_URL are pinned to
// the loopback URL for the test (restored in afterAll), matching the pattern in
// tests/sync/firstSeenSlugConflictDb.test.ts.

const DB_URL_T6 = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const ORIG_ENV_T6 = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL_T6;
process.env.DATABASE_URL = DB_URL_T6;

const T6_DRIVE_FILE_ID = "task6-source-anchors-persist-fixture";
const T6_SLUG = "2026-06-task6-source-anchors-persist";
const T6_MODIFIED_TIME = "2026-06-21T00:00:00.000Z";
const T6_MODIFIED_TIME_2 = "2026-06-21T01:00:00.000Z";

const T6_PARSE_RESULT = {
  show: {
    title: "Task 6 Fixture Show",
    client_label: "T6 Corp",
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: {
      travelIn: "2026-06-20",
      set: "2026-06-21",
      showDays: ["2026-06-22"],
      travelOut: "2026-06-23",
    },
    event_details: null,
    agenda_links: [],
    coi_status: null,
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
} as unknown as import("@/lib/parser/types").ParseResult;

let t6Sql: ReturnType<typeof postgres> | null = null;
let t6DbUp = false;
try {
  const probe = postgres(DB_URL_T6, {
    max: 1,
    idle_timeout: 2,
    connect_timeout: 3,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  t6Sql = probe;
  t6DbUp = true;
} catch {
  if (t6Sql) await (t6Sql as ReturnType<typeof postgres>).end().catch(() => {});
  t6Sql = null;
  t6DbUp = false;
}

async function t6Cleanup(): Promise<void> {
  if (!t6Sql) return;
  await t6Sql
    .unsafe("delete from public.shows where drive_file_id = $1", [T6_DRIVE_FILE_ID])
    .catch(() => {});
}

beforeEach(async () => {
  if (!t6DbUp) return;
  await t6Cleanup();
});

afterEach(async () => {
  if (!t6DbUp) return;
  await t6Cleanup();
});

afterAll(async () => {
  process.env.TEST_DATABASE_URL = ORIG_ENV_T6.TEST_DATABASE_URL;
  process.env.DATABASE_URL = ORIG_ENV_T6.DATABASE_URL;
  if (ORIG_ENV_T6.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  if (ORIG_ENV_T6.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  if (t6Sql) await t6Sql.end().catch(() => {});
});

describe("sourceAnchors persistence (Task 6)", () => {
  test.skipIf(!t6DbUp)(
    "applyShowSnapshot UPDATE arm writes source_anchors to the DB row (raw object, not double-stringified)",
    async () => {
      const SOURCE_ANCHORS_INPUT: Record<string, SourceAnchor> = {
        venue: { title: "INFO", gid: 0, a1: "B2" },
        contacts: { title: "CONTACTS", gid: 7, a1: "A1" },
      };

      // Seed an existing show row so the UPDATE arm fires (not the INSERT arm).
      await t6Sql!.unsafe(
        `insert into public.shows (drive_file_id, slug, title, client_label, template_version,
           last_seen_modified_time, last_synced_at, last_sync_status, last_sync_error)
         values ($1, $2, $3, 'T6 Corp', 'v4', $4::timestamptz, now(), 'ok', null)`,
        [T6_DRIVE_FILE_ID, T6_SLUG, "Task 6 Fixture Show", T6_MODIFIED_TIME],
      );

      // Drive the real PostgresPipelineTx.applyShowSnapshot via withPostgresSyncPipelineLock.
      const result = await withPostgresSyncPipelineLock(T6_DRIVE_FILE_ID, async (lockedTx) =>
        lockedTx.applyShowSnapshot({
          driveFileId: T6_DRIVE_FILE_ID,
          modifiedTime: T6_MODIFIED_TIME_2,
          staleGuard: "less_than_or_equal",
          parseResult: T6_PARSE_RESULT,
          slug: T6_SLUG,
          sourceAnchors: SOURCE_ANCHORS_INPUT,
        }),
      );

      expect(result).toMatchObject({ outcome: "updated" });

      // Assert the persisted row has source_anchors equal to the input object.
      const rows = (await t6Sql!.unsafe(
        "select source_anchors from public.shows where drive_file_id = $1",
        [T6_DRIVE_FILE_ID],
      )) as Array<{ source_anchors: unknown }>;
      expect(rows.length, "one shows row should exist").toBe(1);

      // Concrete failure mode: if source_anchors = $N::jsonb is missing from the UPDATE,
      // the column stays '{}' (the DDL default) even though sourceAnchors was supplied.
      expect(
        rows[0]!.source_anchors,
        "source_anchors must equal the passed object (not double-stringified)",
      ).toEqual(SOURCE_ANCHORS_INPUT);
    },
  );
});
