/**
 * REAL-Postgres regression: the onboarding scan persists computed region source
 * anchors into pending_syncs.source_anchors, and a re-stage (ON CONFLICT DO UPDATE)
 * REFRESHES them. Anti-tautology: expected values derive from extractSourceAnchors
 * over the fixture bytes (the data source), never from the render.
 *
 * DB-connection convention (mirrors onboardingScanLiveRowConflictDb.test.ts): LOCAL-ONLY;
 * runOnboardingScan's databaseUrl() resolves TEST_DATABASE_URL ?? DATABASE_URL at call
 * time, so BOTH are pinned to the loopback URL for the whole suite (restored in teardown).
 */
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import postgres from "postgres";
import * as XLSX from "xlsx";

import { assertLocalDbUrl } from "../db/_remediationHelpers";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import type { DriveListedFile } from "@/lib/drive/list";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const ORIGINAL_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

const SESSION = "5a5a5a5a-4444-4444-8444-5a5a5a5a5a5a";
const FOLDER = "sa-db-folder";
const FILE = "sa-db-file";
const MODIFIED_TIME = "2026-06-11T08:00:00.000Z";
const GID = 777;

function xlsxBuffer(aoa: string[][], sheetName: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>)
    .buffer as ArrayBuffer;
}

// Run 1: INFO/venue region → { venue: {...} }. Run 2: INFO/financials region → { financials: {...} }.
// Distinct keys guarantee the ON CONFLICT refresh is observable.
const VENUE_AOA: string[][] = [
  ["CLIENT", "ACME"],
  [],
  ["VENUE", "Four Seasons"],
  ["Hotel Address", "525 N"],
];
const FINANCIALS_AOA: string[][] = [
  ["COI", "Sent"],
  ["Proposal", "Sent - $17,500"],
  ["PO#", ""],
];

function makeParseResult(title: string): ParseResult {
  return {
    show: {
      title,
      client_label: "Acme Corp",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-06-09",
        set: "2026-06-10",
        showDays: ["2026-06-11"],
        travelOut: "2026-06-12",
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
  } as unknown as ParseResult;
}

function listedFile(): DriveListedFile {
  return {
    driveFileId: FILE,
    name: `${FILE}.gsheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: MODIFIED_TIME,
    parents: [FOLDER],
  } as DriveListedFile;
}

function scanDeps(bytes: ArrayBuffer) {
  return {
    listFolder: vi.fn(async () => [listedFile()]),
    fetchMarkdownWithBinding: vi.fn(async (driveFileId: string) => ({
      binding: { bindingToken: `tok-${driveFileId}`, modifiedTime: MODIFIED_TIME },
      markdown: `markdown:${driveFileId}`,
      bytes,
    })),
    parseSheet: vi.fn((markdown: string) => ({ markdown }) as unknown as ParsedSheet),
    enrichWithDrivePins: vi.fn(async () => makeParseResult(FILE)),
    listSheetGids: vi.fn(async () => new Map([["INFO", GID]])),
  };
}

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
let originalSettings: {
  pending_wizard_session_id: string | null;
  pending_folder_id: string | null;
  auto_publish_clean_first_seen: boolean | null;
} | null = null;
try {
  const probe = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  const rows = (await probe.unsafe(
    `select pending_wizard_session_id, pending_folder_id, auto_publish_clean_first_seen
       from public.app_settings where id = 'default'`,
    [],
  )) as Array<{
    pending_wizard_session_id: string | null;
    pending_folder_id: string | null;
    auto_publish_clean_first_seen: boolean | null;
  }>;
  originalSettings = rows[0] ?? {
    pending_wizard_session_id: null,
    pending_folder_id: null,
    auto_publish_clean_first_seen: null,
  };
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const table of [
    "pending_syncs",
    "pending_ingestions",
    "onboarding_scan_manifest",
    "sync_log",
  ]) {
    await sql
      .unsafe(`delete from public.${table} where drive_file_id like 'sa-db-%'`, [])
      .catch(() => {});
  }
  await sql
    .unsafe(`delete from public.shows where drive_file_id like 'sa-db-%'`, [])
    .catch(() => {});
}

async function readAnchors(): Promise<unknown> {
  const rows = (await sql!.unsafe(
    `select source_anchors from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [FILE, SESSION],
  )) as Array<{ source_anchors: unknown }>;
  return rows[0]?.source_anchors;
}

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  // Force STAGING (not auto-publish): the Step-3 finalize path — the consumer of
  // source_anchors — only runs on staged rows. Clean first-seen rows auto-publish when
  // this flag is on (no upsertLivePendingSync), so pin it off for the scan under test.
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2, auto_publish_clean_first_seen = false
      where id = 'default'`,
    [SESSION, FOLDER],
  );
});

afterAll(async () => {
  if (sql && dbUp) {
    await cleanup().catch(() => {});
    if (originalSettings) {
      await sql
        .unsafe(
          `update public.app_settings
              set pending_wizard_session_id = $1::uuid, pending_folder_id = $2,
                  auto_publish_clean_first_seen = coalesce($3::boolean, auto_publish_clean_first_seen)
            where id = 'default'`,
          [
            originalSettings.pending_wizard_session_id,
            originalSettings.pending_folder_id,
            originalSettings.auto_publish_clean_first_seen,
          ],
        )
        .catch(() => {});
    }
  }
  process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  if (sql) await sql.end().catch(() => {});
});

test.skipIf(!dbUp)(
  "scan persists computed source_anchors, and a re-stage refreshes them (ON CONFLICT)",
  async () => {
    const { runOnboardingScan } = await import("@/lib/sync/runOnboardingScan");
    const gids = new Map([["INFO", GID]]);

    // ── Run 1: venue fixture → source_anchors == extractSourceAnchors(venue) ──
    const venueBytes = xlsxBuffer(VENUE_AOA, "INFO");
    const expected1 = extractSourceAnchors(venueBytes, gids);
    expect(expected1.venue).toBeDefined(); // proven-anchorable

    const r1 = await runOnboardingScan(FOLDER, SESSION, scanDeps(venueBytes));
    expect(r1.outcome).toBe("completed");
    expect(await readAnchors()).toEqual(expected1);

    // ── Run 2: DIFFERENT fixture (financials) → ON CONFLICT DO UPDATE refreshes ──
    const finBytes = xlsxBuffer(FINANCIALS_AOA, "INFO");
    const expected2 = extractSourceAnchors(finBytes, gids);
    expect(expected2.financials).toBeDefined();
    expect(expected2).not.toEqual(expected1); // the two fixtures genuinely differ

    const r2 = await runOnboardingScan(FOLDER, SESSION, scanDeps(finBytes));
    expect(r2.outcome).toBe("completed");
    expect(await readAnchors()).toEqual(expected2); // refreshed, not stale
  },
);
