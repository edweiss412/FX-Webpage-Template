/**
 * REAL-Postgres regression for the onboarding-scan live_row_conflict recovery
 * path (class-sweep sibling of the first-seen slug-collision 25P02 abort).
 *
 * Bug: scanPreparedFileWithTx caught a 23505/42P10 raised by a statement on the
 * per-file transaction and then issued its recovery writes (logSync,
 * upsertAdminAlert, upsertManifest) on the SAME aborted transaction. On real
 * Postgres every statement after the first error fails with 25P02
 * `in_failed_sql_transaction`, so the graceful live_row_conflict recovery
 * became an OnboardingScanInfraError and the whole scan 500'd instead of
 * recording the conflict and continuing. The mocked FakeOnboardingTx in
 * tests/sync/onboarding.test.ts has no abort semantics, so it approved the
 * broken pattern — the "mocked-only tests invite tautological APPROVE" class.
 *
 * Trigger here: a temporary partial UNIQUE index on pending_syncs (scoped to
 * this suite's drive_file_id prefix) that is NOT the upsert's arbiter, so the
 * second file's staging INSERT raises a real non-arbiter 23505 inside the
 * per-file transaction — the same shape as the production
 * unique_violation_against_legacy_pk drift this path defends against.
 *
 * DB-connection convention (mirrors tests/onboarding/wizardSessionCasRaceDb.test.ts):
 * LOCAL-ONLY; runOnboardingScan's databaseUrl() resolves TEST_DATABASE_URL ??
 * DATABASE_URL at call time, so BOTH are pinned to the loopback URL for the
 * whole suite (originals restored in teardown).
 */
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import postgres from "postgres";

import { assertLocalDbUrl } from "../db/_remediationHelpers";
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

const SESSION = "1bc1bc1b-3333-4333-8333-1bc1bc1b1bc1";
const FOLDER = "lrc-db-folder";
const FILE_A = "lrc-db-a";
const FILE_B = "lrc-db-b";
const MODIFIED_TIME = "2026-06-11T08:00:00.000Z";
const TMP_INDEX = "lrc_db_tmp_staged_mt_key";

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

function listedFile(driveFileId: string): DriveListedFile {
  return {
    driveFileId,
    name: `${driveFileId}.gsheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: MODIFIED_TIME,
    parents: [FOLDER],
  } as DriveListedFile;
}

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
let originalSettings: {
  pending_wizard_session_id: string | null;
  pending_folder_id: string | null;
} | null = null;
try {
  const probe = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  const rows = (await probe.unsafe(
    `select pending_wizard_session_id, pending_folder_id from public.app_settings where id = 'default'`,
    [],
  )) as Array<{ pending_wizard_session_id: string | null; pending_folder_id: string | null }>;
  originalSettings = rows[0] ?? { pending_wizard_session_id: null, pending_folder_id: null };
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  await sql
    .unsafe(`delete from public.pending_syncs where drive_file_id like 'lrc-db-%'`, [])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.pending_ingestions where drive_file_id like 'lrc-db-%'`, [])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.onboarding_scan_manifest where drive_file_id like 'lrc-db-%'`, [])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.sync_log where drive_file_id like 'lrc-db-%'`, [])
    .catch(() => {});
  await sql
    .unsafe(
      `delete from public.admin_alerts
        where code = 'LIVE_ROW_CONFLICT' and context->>'drive_file_id' like 'lrc-db-%'`,
      [],
    )
    .catch(() => {});
}

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  // Non-arbiter partial UNIQUE index scoped to this suite's prefix: the staging
  // upsert's arbiter is (drive_file_id, wizard_session_id), so the second
  // same-staged_modified_time INSERT raises a genuine 23505 mid-transaction.
  await sql!.unsafe(
    `create unique index if not exists ${TMP_INDEX}
       on public.pending_syncs (staged_modified_time)
       where drive_file_id like 'lrc-db-%'`,
    [],
  );
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
});

afterAll(async () => {
  if (sql && dbUp) {
    await cleanup().catch(() => {});
    await sql.unsafe(`drop index if exists public.${TMP_INDEX}`, []).catch(() => {});
    if (originalSettings) {
      await sql
        .unsafe(
          `update public.app_settings
              set pending_wizard_session_id = $1::uuid, pending_folder_id = $2
            where id = 'default'`,
          [originalSettings.pending_wizard_session_id, originalSettings.pending_folder_id],
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
  "a mid-transaction unique violation records live_row_conflict in a FRESH transaction and the scan completes",
  async () => {
    const { runOnboardingScan } = await import("@/lib/sync/runOnboardingScan");

    const result = await runOnboardingScan(FOLDER, SESSION, {
      // NO deps.tx: real withDefaultTx → one REAL postgres transaction per file,
      // which is the only place the 25P02 abort is observable.
      listFolder: vi.fn(async () => [listedFile(FILE_A), listedFile(FILE_B)]),
      captureBinding: vi.fn(async (_driveFileId: string, meta: DriveListedFile) => ({
        bindingToken: meta.modifiedTime,
        modifiedTime: meta.modifiedTime,
      })),
      fetchMarkdownAtRevision: vi.fn(async (driveFileId: string) => `markdown:${driveFileId}`),
      parseSheet: vi.fn((markdown: string) => ({ markdown }) as unknown as ParsedSheet),
      enrichWithDrivePins: vi.fn(async (parsed: ParsedSheet) =>
        makeParseResult(
          (parsed as unknown as { markdown: string }).markdown.replace("markdown:", ""),
        ),
      ),
    });

    // Failure mode (pre-fix): the recovery writes ran on the ABORTED per-file
    // transaction → 25P02 → OnboardingScanInfraError rejects the whole scan.
    expect(result).toMatchObject({
      outcome: "completed",
      processed: [
        { driveFileId: FILE_A, outcome: "staged" },
        { driveFileId: FILE_B, outcome: "live_row_conflict" },
      ],
    });

    const staged = (await sql!.unsafe(
      `select drive_file_id from public.pending_syncs where drive_file_id like 'lrc-db-%' order by drive_file_id`,
      [],
    )) as Array<{ drive_file_id: string }>;
    expect(staged.map((row) => row.drive_file_id)).toEqual([FILE_A]);

    const manifest = (await sql!.unsafe(
      `select drive_file_id, status from public.onboarding_scan_manifest
        where drive_file_id like 'lrc-db-%' order by drive_file_id`,
      [],
    )) as Array<{ drive_file_id: string; status: string }>;
    expect(manifest).toEqual([
      { drive_file_id: FILE_A, status: "staged" },
      { drive_file_id: FILE_B, status: "live_row_conflict" },
    ]);

    const alerts = (await sql!.unsafe(
      `select context->>'drive_file_id' as drive_file_id, context->>'kind' as kind
         from public.admin_alerts
        where code = 'LIVE_ROW_CONFLICT' and context->>'drive_file_id' like 'lrc-db-%'`,
      [],
    )) as Array<{ drive_file_id: string; kind: string }>;
    expect(alerts).toEqual([{ drive_file_id: FILE_B, kind: "unique_violation_against_legacy_pk" }]);
  },
);
