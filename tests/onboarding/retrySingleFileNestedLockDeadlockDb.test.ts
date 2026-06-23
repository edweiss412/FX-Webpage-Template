/**
 * REAL-Postgres reproduction of the latent nested-advisory-lock DEADLOCK in the
 * manual single-file retry path (BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK, second
 * instance).
 *
 * Bug (original shape): `retrySingleFile` held the per-show advisory lock
 * (`withPostgresSyncPipelineLock` → `pg_advisory_xact_lock(hashtext('show:' ||
 * driveFileId))`) on connection A, then `await`ed the scan, whose OWN connection B
 * blocked acquiring the SAME key. A waits on B's return; B waits on A's lock →
 * app-level deadlock (Postgres's detector can't see it). Every other test mocks
 * the scan, so the real second `withShowLock`-on-B was never exercised.
 *
 * Fix: the slow Drive prepare runs pre-lock, and the DB scan runs on the SAME
 * locked connection (inline scan tx + passthrough `withShowLock`), so there is no
 * second connection to nest. This test runs the REAL `scanOnboardingPreparedFiles`
 * (Drive prepare mocked) through the REAL `retrySingleFile` lock topology.
 *
 * Assertion: the retry COMPLETES within a bounded time. It is a live regression
 * guard for the nesting: if `retrySingleFile` ever runs the scan on a SEPARATE
 * connection while holding the pipeline lock again, the injected real scan blocks
 * on the held key and this test times out.
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

// A prepared sheet (the Drive prepare is mocked — no real Google). The retry then
// runs the REAL scanOnboardingPreparedFiles, which retrySingleFile invokes on the
// locked connection (inline scan tx + passthrough withShowLock). That is the
// regression guard: if retrySingleFile reverted to running the scan on a separate
// connection while holding the pipeline lock, the real scan's withShowLock would
// block on the held key and this test would time out.
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

// Concurrency regression (Codex R1 HIGH): running the scan OUTSIDE the lock would
// let a concurrent defer/ignore decision be silently overwritten by the retry's
// staging. The atomic design closes this — the scan + finalize run under one
// pipeline lock and a re-preflight aborts the retry if the pending row was
// resolved during the (unlocked) Drive window. Here a defer/ignore resolves the
// row mid-Drive-window (it takes + releases the same show lock); the retry must
// then abort with not_found, stage nothing, and leave the defer manifest intact.
test.skipIf(!dbUp)(
  "a defer/ignore that resolves the pending ingestion during the unlocked Drive window aborts the retry (no staging, defer manifest preserved)",
  async () => {
    // Seed a manifest row so we can prove the retry does not overwrite a
    // concurrent defer/ignore manifest transition.
    await sql!.unsafe(
      `insert into public.onboarding_scan_manifest
         (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
       values ($1, $2::uuid, $3, $4, $5, 'hard_failed')
       on conflict (wizard_session_id, drive_file_id) do update set status = 'hard_failed'`,
      [FOLDER, SESSION, FILE, "application/vnd.google-apps.spreadsheet", `${FILE}.gsheet`],
    );

    let scanInvoked = false;
    const result = await retrySingleFile(FILE, SESSION, {
      fetchDriveFileMetadata: async () => listedMetadata(),
      // During the unlocked Drive window, a concurrent defer/ignore resolves the
      // SAME pending row: it takes the show lock, deletes the pending_ingestion,
      // and transitions the manifest to defer_until_modified — then releases the
      // lock (committed) before retry's Lock#2 acquires it.
      prepareOnboardingFiles: async () => {
        const other = postgres(DB_URL, { max: 1, idle_timeout: 2, prepare: false });
        try {
          await other.begin(async (t) => {
            await t.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [FILE]);
            await t.unsafe(`delete from public.pending_ingestions where drive_file_id = $1`, [
              FILE,
            ]);
            await t.unsafe(
              `update public.onboarding_scan_manifest
                  set status = 'defer_until_modified', transitioned_at = now()
                where drive_file_id = $1 and wizard_session_id = $2::uuid`,
              [FILE, SESSION],
            );
          });
        } finally {
          await other.end().catch(() => {});
        }
        return preparedSheet();
      },
      scanOnboardingPreparedFiles: ((folderId, sessionId, prepared, scanDeps) => {
        scanInvoked = true;
        return scanOnboardingPreparedFiles(folderId, sessionId, prepared, scanDeps);
      }) as typeof scanOnboardingPreparedFiles,
    });

    // The retry aborts at Lock#2 re-preflight (pending row gone) — it never stages.
    expect(scanInvoked).toBe(false);
    expect(result).toMatchObject({ outcome: "not_found", code: "PENDING_INGESTION_NOT_FOUND" });

    // The concurrent defer/ignore manifest decision is preserved, not overwritten.
    const manifest = (await sql!.unsafe(
      `select status from public.onboarding_scan_manifest where drive_file_id = $1`,
      [FILE],
    )) as Array<{ status: string }>;
    expect(manifest[0]?.status).toBe("defer_until_modified");

    // And nothing was staged.
    const staged = await sql!.unsafe(
      `select 1 from public.pending_syncs where drive_file_id = $1`,
      [FILE],
    );
    expect(staged).toHaveLength(0);
  },
  20000,
);

// Partition regression (Codex R2 + independent review, CRITICAL): the under-lock
// scan MUST stage into the WIZARD partition (wizard_session_id = SESSION), not the
// live partition (null). An inheriting inline scan tx would pick up the pipeline
// tx's live-only upsertLivePendingSync (wizard_session_id null) and silently stage
// where the wizard finalize/approve pipeline (which filters wizard_session_id =
// SESSION) can never see it — wedging the onboarding session. This is the
// assertion the earlier tests lacked, which masked the bug.
test.skipIf(!dbUp)(
  "a successful retry stages into the WIZARD partition (wizard_session_id = SESSION), visible to the wizard apply query",
  async () => {
    const result = await retrySingleFile(FILE, SESSION, {
      fetchDriveFileMetadata: async () => listedMetadata(),
      prepareOnboardingFiles: async () => preparedSheet(),
      scanOnboardingPreparedFiles,
    });
    expect(result).toMatchObject({ outcome: "retried", status: "staged" });

    const rows = (await sql!.unsafe(
      `select wizard_session_id from public.pending_syncs where drive_file_id = $1`,
      [FILE],
    )) as Array<{ wizard_session_id: string | null }>;
    expect(rows).toHaveLength(1);
    // The load-bearing assertion: wizard-scoped, NOT the live (null) partition.
    expect(rows[0]?.wizard_session_id).toBe(SESSION);

    // And the row is matched by the wizard-scoped apply filter (the query the
    // finalize/approve pipeline uses), proving it is reachable, not orphaned.
    const visible = await sql!.unsafe(
      `select 1 from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [FILE, SESSION],
    );
    expect(visible).toHaveLength(1);
  },
  20000,
);
