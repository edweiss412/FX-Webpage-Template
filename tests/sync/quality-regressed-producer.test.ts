/**
 * Unit C (audit #16) INTEGRATION — the REAL applied epilogue calls
 * evaluateQualityRegression_unlocked with the PRE-apply priorShow snapshot.
 *
 * The helper-level lifecycle test drives evaluateQualityRegression_unlocked directly; the
 * meta-tests only see the raise literal. Neither proves the applied path actually WIRES the
 * producer with the pre-apply baseline. This drives the real processOneFile_unlocked applied
 * path (in-memory tx double, mirroring tests/sync/sourceAnchorsPipeline.test.ts) and asserts
 * against the recorded upsertAdminAlert args (anti-tautology — not a rendered surface).
 */
import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import type { Phase1Binding } from "@/lib/sync/phase1";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type ProcessOneFileDeps,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";

type Warn = ParseResult["warnings"][number];

function warns(code: string, n: number): Warn[] {
  return Array.from(
    { length: n },
    () => ({ severity: "warn", code, message: "x" }) as unknown as Warn,
  );
}

function makeFileMeta(driveFileId: string): DriveListedFile {
  return {
    driveFileId,
    name: "QR Fixture Sheet",
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

function parsedSheet(warnings: Warn[]): ParsedSheet {
  return {
    show: {
      title: "QR Fixture Show",
      client_label: "QR",
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
    warnings,
    hardErrors: [],
  } as unknown as ParsedSheet;
}

function parseResult(warnings: Warn[]): ParseResult {
  return parsedSheet(warnings) as unknown as ParseResult;
}

type UpsertCall = { showId: string | null; code: string; context: Record<string, unknown> };

/**
 * Applied-path tx double (mirrors sourceAnchorsPipeline.test.ts makeTx). `readShowForPhase1`
 * returns `priorParseWarningsRaw` = the PRE-apply baseline; `upsertAdminAlert` records every call;
 * `queryOne` returns undefined for the open-alert select (no open alert) and a truthy lock row
 * otherwise. `priorParseWarningsRaw === null` on the returned show → first-seen (returns null show).
 */
function makeTx(opts: {
  priorParseWarningsRaw: Warn[] | null;
  firstSeen: boolean;
  upserts: UpsertCall[];
}): LockedShowTx<SyncPipelineTx> {
  return {
    async queryOne<T>(sql: string): Promise<T> {
      if (sql.includes("select context from public.admin_alerts")) {
        return undefined as T; // no open RESYNC_QUALITY_REGRESSED alert
      }
      return { held: true, locked: true } as T;
    },
    async readShowForPhase1() {
      if (opts.firstSeen) return null;
      return {
        showId: "show-uuid-1",
        driveFileId: "file-1",
        lastSeenModifiedTime: "2025-12-31T00:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: parseResult([]),
        priorParseWarningsRaw: opts.priorParseWarningsRaw,
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
    async updateShowShrinkHeld() {},
    async updateShowPendingReview() {},
    async deleteWizardPendingSyncsExcept() {},
    async readLiveDeferral() {
      return null;
    },
    async deleteLiveDeferral() {},
    async readRevisionRaceCooldown() {
      return null;
    },
    async upsertRevisionRaceCooldown() {
      return { retryCount: 1, cooldownSeconds: 60 };
    },
    async deleteRevisionRaceCooldowns() {},
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
    async applyShowSnapshot() {
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
    async upsertAdminAlert(input: UpsertCall) {
      opts.upserts.push(input);
      return "alert-1";
    },
  } as unknown as LockedShowTx<SyncPipelineTx>;
}

const DRIVE_FILE_ID = "file-1";

async function drive(opts: {
  priorParseWarningsRaw: Warn[] | null;
  nextWarnings: Warn[];
  firstSeen?: boolean;
}): Promise<UpsertCall[]> {
  const upserts: UpsertCall[] = [];
  const tx = makeTx({
    priorParseWarningsRaw: opts.priorParseWarningsRaw,
    firstSeen: opts.firstSeen ?? false,
    upserts,
  });
  const deps: ProcessOneFileDeps = {
    captureBinding: async () => BINDING,
    fetchMarkdownAtRevision: async () => "",
    parseSheet: () => parsedSheet(opts.nextWarnings),
    driveClient: {
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
      listSpreadsheetSheets: async () => [],
    },
  } as unknown as ProcessOneFileDeps;

  const prepared = await prepareProcessOneFile(
    DRIVE_FILE_ID,
    "cron",
    makeFileMeta(DRIVE_FILE_ID),
    deps,
    async () => null,
  );
  expect(prepared.kind, "pipeline should reach ready state").toBe("ready");
  await processOneFile_unlocked(
    tx,
    DRIVE_FILE_ID,
    "cron",
    makeFileMeta(DRIVE_FILE_ID),
    deps,
    prepared,
  );
  return upserts;
}

const qr = (upserts: UpsertCall[]) => upserts.filter((u) => u.code === "RESYNC_QUALITY_REGRESSED");

describe("RESYNC_QUALITY_REGRESSED producer — real applied epilogue wiring", () => {
  test("existing published show, 4→40 → applied epilogue raises show-scoped alert, baseline summarizes to 4", async () => {
    const upserts = await drive({
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 4),
      nextWarnings: warns("UNKNOWN_FIELD", 40),
    });
    const raised = qr(upserts);
    expect(raised, "epilogue must raise exactly one RESYNC_QUALITY_REGRESSED").toHaveLength(1);
    expect(raised[0]!.showId, "show-scoped, NOT null").toBe("show-uuid-1");
    expect(
      (raised[0]!.context.baseline as { classes: Record<string, number> }).classes.UNKNOWN_FIELD,
      "baseline is the PRE-apply prior (4), not the applied (40)",
    ).toBe(4);
    expect((raised[0]!.context.breakdown as Record<string, number>).UNKNOWN_FIELD).toBe(40);
  });

  test("baseline-is-pre-apply: prior warnings (4) differ from applied (40) — alert stores 4 not 40", async () => {
    const upserts = await drive({
      priorParseWarningsRaw: warns("UNKNOWN_FIELD", 4),
      nextWarnings: warns("UNKNOWN_FIELD", 40),
    });
    const raised = qr(upserts);
    expect(raised).toHaveLength(1);
    // Proves the producer read priorShow BEFORE phase2 persisted the new (40) warnings.
    expect((raised[0]!.context.baseline as { total: number }).total).toBe(4);
  });

  test("first-seen (!priorShow) → NO RESYNC_QUALITY_REGRESSED upsert", async () => {
    const upserts = await drive({
      priorParseWarningsRaw: null,
      nextWarnings: warns("UNKNOWN_FIELD", 40),
      firstSeen: true,
    });
    expect(qr(upserts), "first-seen has no prior → producer skips").toHaveLength(0);
  });

  test("null-baseline (published but last-good raw is null) + non-empty current → NO upsert", async () => {
    const upserts = await drive({
      priorParseWarningsRaw: null,
      nextWarnings: warns("UNKNOWN_FIELD", 40),
    });
    expect(qr(upserts), "null priorParseWarningsRaw → record-and-skip").toHaveLength(0);
  });
});
