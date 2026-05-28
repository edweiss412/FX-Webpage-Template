import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";

/**
 * REAL-DB end-to-end test for the M12 Phase 0.F smoke-3 finalize 500 (5th
 * onboarding defect, launch blocker): `pending_syncs.parse_result` was stored
 * DOUBLE-ENCODED (a jsonb STRING SCALAR) because the postgres.js write site
 * passed `JSON.stringify(obj)` for a `$N::jsonb` param — postgres.js then ran
 * its own JSON serializer on the already-stringified string. postgres.js read
 * it back as a JS `string`, so `parseResult.show.title` threw an uncaught
 * TypeError → empty 500 body.
 *
 * The prior revision-race e2e seeded a HAND-BUILT parse_result object, so it
 * never exercised the real scan write and missed the double-encode. This test
 * closes that gap: it drives the REAL writer (`upsertLivePendingSync`) over real
 * postgres.js, then the REAL finalize handler (real `withTx`/`withRowTx`
 * connections to local Supabase), and asserts a show is actually PUBLISHED with
 * a proper jsonb object — apply→publish, not just "no 500".
 *
 * Runs against local Supabase. Skips cleanly if Postgres is unreachable.
 */
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "5e5e5e5e-2222-4222-8222-5e5e5e5e5e5e";
const FOLDER = "finalize-publish-db-folder";
const DRIVE_FILE_ID = "finalize-publish-db-file";
const STAGED_INSTANT = "2026-05-09T03:44:06.040Z";
const TITLE = "Finalize Publish DB Fixture";

// A realistic ParseResult — client_contact is a NON-NULL OBJECT specifically so
// the publish-path WRITE (shows.client_contact = $::jsonb) is exercised: before
// the fix that column too was double-encoded into a string scalar.
const PARSE_RESULT = {
  show: {
    title: TITLE,
    client_label: "Acme Corp",
    client_contact: { primary: { name: "Pat", email: "pat@example.com" } },
    template_version: "v4",
    venue: { name: "Grand Hall" },
    dates: { travelIn: "2026-05-07", set: "2026-05-08", showDays: ["2026-05-09"], travelOut: "2026-05-10" },
    event_details: { theme: "Annual" },
    agenda_links: [{ label: "Run of show", url: "https://example.com/ros" }],
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
};

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(databaseUrl, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

// postgres.js .unsafe returns an array whose [0] is possibly-undefined under
// noUncheckedIndexedAccess; every fixture query below returns exactly one row.
function first<T = Record<string, unknown>>(rows: unknown): T {
  return (rows as T[])[0]!;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  await sql.unsafe(`delete from public.sync_audit where drive_file_id = $1`, [DRIVE_FILE_ID]).catch(() => {});
  await sql.unsafe(`delete from public.shows where drive_file_id = $1`, [DRIVE_FILE_ID]).catch(() => {});
  await sql
    .unsafe(`delete from public.pending_syncs where drive_file_id = $1`, [DRIVE_FILE_ID])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.shows_pending_changes where drive_file_id = $1`, [DRIVE_FILE_ID])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`, [SESSION])
    .catch(() => {});
  await sql
    .unsafe(
      `update public.app_settings
          set pending_wizard_session_id = null, pending_wizard_session_at = null,
              pending_folder_id = null
        where id = 'default'`,
    )
    .catch(() => {});
}

async function activateSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
}

// Drive the REAL writer over real postgres.js (the exact production write path).
async function writeViaRealWriter(parseResult: unknown): Promise<void> {
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await tx.upsertLivePendingSync({
      driveFileId: DRIVE_FILE_ID,
      wizardSessionId: SESSION,
      baseModifiedTime: null,
      stagedModifiedTime: STAGED_INSTANT,
      parseResult: parseResult as never,
      triggeredReviewItems: [],
      priorLastSyncStatus: null,
      priorLastSyncError: null,
      sourceKind: "onboarding_scan",
      warningSummary: "",
    });
  });
}

async function approveStagedRow(): Promise<void> {
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true,
            wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = '[]'::jsonb,
            wizard_approved_by_email = 'doug@example.com',
            wizard_approved_at = now()
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE_FILE_ID, SESSION],
  );
}

function finalizeDeps() {
  return {
    requireAdminIdentity: async () => ({ email: "doug@example.com" }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: STAGED_INSTANT,
    }),
  };
}

beforeAll(async () => {
  if (!dbUp) return;
  await cleanup();
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await activateSession();
});

afterEach(async () => {
  if (!dbUp) return;
  await cleanup();
});

afterAll(async () => {
  if (sql) await sql.end().catch(() => {});
});

describe("onboarding finalize publish — real postgres.js write→read→publish", () => {
  test.skipIf(!dbUp)(
    "the REAL writer stores parse_result as a jsonb OBJECT (not a double-encoded string scalar)",
    async () => {
      await writeViaRealWriter(PARSE_RESULT);
      const rows = await sql!.unsafe(
        `select jsonb_typeof(parse_result) as pr_type,
                parse_result->'show'->>'title' as title,
                jsonb_typeof(triggered_review_items) as tri_type
           from public.pending_syncs
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [DRIVE_FILE_ID, SESSION],
      );
      // Failure mode (pre-fix): pr_type === 'string', title === null — the
      // double-encoded scalar that 500s finalize on `parseResult.show.title`.
      const r = first<{ pr_type: string; title: string; tri_type: string }>(rows);
      expect(r.pr_type).toBe("object");
      expect(r.title).toBe(TITLE);
      expect(r.tri_type).toBe("array");
    },
  );

  test.skipIf(!dbUp)(
    "real finalize PUBLISHES a draft show with proper jsonb columns (apply→publish)",
    async () => {
      await writeViaRealWriter(PARSE_RESULT);
      await approveStagedRow();

      const response = await handleOnboardingFinalize(
        new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" }),
        finalizeDeps(),
      );

      // Failure mode (pre-fix): the publish loop throws an uncaught TypeError →
      // empty 500 body → the test sees a non-200 / rejected promise.
      expect(response.status).toBe(200);
      const body = (await response.json()) as { per_row: Array<{ code: string }> };
      expect(body.per_row[0]?.code).toBe("OK");

      const showRows = await sql!.unsafe(
        `select published,
                jsonb_typeof(client_contact) as cc_type,
                client_contact->'primary'->>'email' as cc_email,
                jsonb_typeof(agenda_links) as al_type,
                title
           from public.shows where drive_file_id = $1`,
        [DRIVE_FILE_ID],
      );
      expect(showRows.length).toBe(1);
      const show = first<{
        published: boolean;
        cc_type: string;
        cc_email: string;
        al_type: string;
        title: string;
      }>(showRows);
      expect(show.published).toBe(false);
      // Failure mode (pre-fix publish write): cc_type === 'string' → the crew
      // page (Supabase-JS) would receive a string for client_contact.
      expect(show.cc_type).toBe("object");
      expect(show.cc_email).toBe("pat@example.com");
      expect(show.al_type).toBe("array");
      expect(show.title).toBe(TITLE);

      const auditRows = await sql!.unsafe(
        `select count(*)::int as n from public.sync_audit where drive_file_id = $1`,
        [DRIVE_FILE_ID],
      );
      expect(first<{ n: number }>(auditRows).n).toBe(1);
    },
  );

  test.skipIf(!dbUp)(
    "real finalize STILL publishes a legacy DOUBLE-ENCODED parse_result row (read coercer decodes the string scalar)",
    async () => {
      // Simulate a row written by the OLD buggy writer: a jsonb string scalar.
      await sql!.unsafe(
        `insert into public.pending_syncs
           (drive_file_id, staged_modified_time, parse_result, triggered_review_items,
            source_kind, warning_summary, wizard_session_id,
            wizard_approved, wizard_reviewer_choices, wizard_reviewer_choices_version,
            wizard_approved_by_email, wizard_approved_at)
         values ($1, $2::timestamptz, $3::jsonb, '[]'::jsonb, 'onboarding_scan', '', $4::uuid,
                 true, '[]'::jsonb, 1, 'doug@example.com', now())`,
        // A single JSON.stringify passed as a postgres.js `$N::jsonb` param is
        // exactly what the OLD buggy writer did — postgres.js then serializes
        // the string a SECOND time, producing a jsonb STRING SCALAR whose text
        // is the object JSON. That is the legacy corruption sitting in prod.
        [DRIVE_FILE_ID, STAGED_INSTANT, JSON.stringify(PARSE_RESULT), SESSION],
      );
      // Confirm the seed really is a string scalar (guards the test itself).
      const seed = await sql!.unsafe(
        `select jsonb_typeof(parse_result) as t from public.pending_syncs where drive_file_id = $1`,
        [DRIVE_FILE_ID],
      );
      expect(first<{ t: string }>(seed).t).toBe("string");

      const response = await handleOnboardingFinalize(
        new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" }),
        finalizeDeps(),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { per_row: Array<{ code: string }> };
      expect(body.per_row[0]?.code).toBe("OK");

      const showRows = await sql!.unsafe(
        `select title from public.shows where drive_file_id = $1`,
        [DRIVE_FILE_ID],
      );
      expect(first<{ title: string }>(showRows).title).toBe(TITLE);
    },
  );
});
