/**
 * REAL-Postgres reproduction of the latent nested-advisory-lock DEADLOCK in the
 * manual single-file retry path (BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK, second
 * instance).
 *
 * Bug: `retrySingleFile` (and the retry route) acquire the per-show advisory lock
 * via `withPostgresSyncPipelineLock` → `withShowLock(driveFileId)` =
 * `pg_advisory_xact_lock(hashtext('show:' || driveFileId))` on connection A, then
 * `await` `runOnboardingScan`, whose own connection B blocks acquiring the SAME
 * key via the default `withShowLock`. A waits on B's return; B waits on A's lock
 * → app-level deadlock (Postgres's detector can't see it). Every other test mocks
 * the scan, so the real second `withShowLock`-on-B is never exercised; this test
 * runs the REAL `runOnboardingScan` (Drive layer mocked, but withShowLock REAL)
 * under the REAL `retrySingleFile` lock to reproduce the hang.
 *
 * Assertion: the retry COMPLETES within a bounded time. RED (times out) before
 * the fetch-before-lock reorder; GREEN after (the scan runs pre-lock, so there is
 * no nested same-key acquisition).
 *
 * Cleanup safety: a deliberately-deadlocked test must not leak the hung backends
 * (they would hold `show:<file>` and wedge other DB tests). We snapshot the
 * connection pids BEFORE triggering the retry, then terminate only the NEW
 * backends that are `idle in transaction` (conn A) or waiting on an `advisory`
 * lock (conn B) — never pre-existing or unrelated connections.
 *
 * DB-connection convention (mirrors wizardSessionCasRaceDb.test.ts): LOCAL-ONLY;
 * both TEST_DATABASE_URL and DATABASE_URL are pinned to the loopback URL for the
 * whole suite (originals restored in teardown).
 */
import { afterAll, beforeEach, expect, test } from "vitest";
import postgres from "postgres";

import { assertLocalDbUrl } from "../db/_remediationHelpers";
import { retrySingleFile } from "@/lib/sync/retrySingleFile";
import {
  scanOnboardingPreparedFiles,
  type PreparedOnboardingFile,
} from "@/lib/sync/runOnboardingScan";
import type { CrewMemberRow, ParseResult, RoomRow } from "@/lib/parser/types";
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

const SESSION = "5dead10c-1111-4111-8111-5dead10c1111";
const FOLDER = "dlk-repro-folder";
const FILE = "dlk-repro-file";
const MODIFIED = "2026-06-12T00:00:00.000Z";

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

function makeParseResult(): ParseResult {
  return {
    show: {
      title: "Deadlock Repro",
      client_label: "Acme",
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
    crewMembers: [crew("Alice")],
    hotelReservations: [],
    rooms: [room()],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  };
}

function listedMetadata(): DriveListedFile {
  return {
    driveFileId: FILE,
    name: `${FILE}.gsheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: MODIFIED,
    parents: [FOLDER],
  };
}

// A prepared sheet (the Drive prepare is mocked — no real Google). The retry
// then runs the REAL scanOnboardingPreparedFiles, whose REAL per-show
// `withShowLock` acquisition (own connection) is the regression guard: with the
// fetch-before-lock reorder it runs OUTSIDE the retry's pipeline lock and
// acquires freely; if it ever runs back inside that lock, the same-key nesting
// deadlocks again and this test times out.
function preparedSheet(): PreparedOnboardingFile[] {
  return [
    {
      file: listedMetadata(),
      kind: "sheet",
      binding: { bindingToken: "dlk-tok", modifiedTime: MODIFIED },
      parseResult: makeParseResult(),
    },
  ];
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
    .unsafe(`delete from public.pending_syncs where drive_file_id = $1`, [FILE])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.pending_ingestions where drive_file_id = $1`, [FILE])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.onboarding_scan_manifest where drive_file_id = $1`, [FILE])
    .catch(() => {});
  await sql.unsafe(`delete from public.sync_log where drive_file_id = $1`, [FILE]).catch(() => {});
}

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.pending_ingestions
       (drive_file_id, drive_file_name, wizard_session_id, discovered_during_folder_id,
        last_seen_modified_time, last_error_code, last_error_message)
     values ($1, $2, $3::uuid, $4, $5::timestamptz, 'MI_2_INVALID_DATE', 'invalid date in DATES tab')`,
    [FILE, `${FILE}.gsheet`, SESSION, FOLDER, MODIFIED],
  );
});

afterAll(async () => {
  if (sql && dbUp) {
    await cleanup().catch(() => {});
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
    await sql.end().catch(() => {});
  }
  process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
});

async function backendPids(): Promise<number[]> {
  const rows = (await sql!.unsafe(
    `select pid from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()`,
    [],
  )) as Array<{ pid: number }>;
  return rows.map((r) => r.pid);
}

// Terminate ONLY the new backends from the hung retry: conn A (holds the lock,
// idle in transaction) + conn B (waiting on the advisory lock). Never touches
// pre-existing or unrelated connections.
async function terminateHungRetryBackends(beforePids: number[]): Promise<number> {
  const before = new Set(beforePids);
  const rows = (await sql!.unsafe(
    `select pid, state, wait_event from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()`,
    [],
  )) as Array<{ pid: number; state: string | null; wait_event: string | null }>;
  let killed = 0;
  for (const row of rows) {
    if (before.has(row.pid)) continue;
    if (row.state === "idle in transaction" || row.wait_event === "advisory") {
      await sql!.unsafe(`select pg_terminate_backend($1)`, [row.pid]).catch(() => {});
      killed += 1;
    }
  }
  return killed;
}

test.skipIf(!dbUp)(
  "manual single-file retry completes without a nested same-key advisory-lock deadlock",
  async () => {
    const beforePids = await backendPids();

    let completed = false;
    let rejection: unknown = null;
    const retryPromise = retrySingleFile(FILE, SESSION, {
      fetchDriveFileMetadata: async () => listedMetadata(),
      prepareOnboardingFiles: async () => preparedSheet(),
      scanOnboardingPreparedFiles,
    })
      .then(() => {
        completed = true;
      })
      .catch((e) => {
        // A terminated backend (post-timeout cleanup) rejects the hung promise;
        // that is the deadlock path, NOT a completion.
        rejection = e;
      });

    const timedOut = await Promise.race([
      retryPromise.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 6000)),
    ]);

    // Free the hung backends (no-op if the retry already completed).
    const killed = await terminateHungRetryBackends(beforePids);
    await retryPromise.catch(() => {});

    expect(
      completed && !timedOut,
      killed > 0
        ? `manual retry DEADLOCKED on the nested show lock (terminated ${killed} hung backend(s))`
        : `manual retry did not complete; rejection=${
            rejection instanceof Error ? rejection.stack : String(rejection)
          }`,
    ).toBe(true);
  },
  20000,
);
