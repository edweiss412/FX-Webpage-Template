import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";

/**
 * F1 Task 1.5 (moved from Task 1.2 — the end-to-end half of the live-partition class) — a wizard
 * finalize for a drive file that ALSO has live `pending_ingestions` and live `pending_syncs`
 * rows must apply the shadow WITHOUT touching the live partition.
 *
 * Concrete failure mode: the `ApplyParseResultTx.deleteLivePendingIngestion` unconditional call
 * (applyParseResult.ts:131) erases an operator-visible live failure record, and the core's live
 * staged-row delete (spec step 6L) destroys a dashboard reviewer's staged parse — both from a
 * wizard action. Anti-tautology: the test ALSO asserts the apply actually ran (children match
 * the shadow's parse) — the pre-rewire bespoke UPDATE would pass the survival assertions
 * trivially while persisting no children (the origin incident reproduced).
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "9c9c9c9c-3333-4333-8333-9c9c9c9c9c9c";
const FOLDER = "coexistence-folder";
const DRIVE_FILE_ID = "drive-coexist-1";
const T0 = "2026-06-09T00:00:00.000Z";
const T1 = "2026-06-10T12:00:00.040Z";

const WIZARD_PARSE = {
  show: {
    title: "Coexistence Fixture",
    client_label: "Acme Corp",
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
    po: "PO-9",
    proposal: null,
    invoice: null,
    invoice_notes: null,
  },
  crewMembers: [
    {
      name: "Ada",
      email: "ada@example.com",
      phone: null,
      role: "A1",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    },
    {
      name: "Bo",
      email: "bo@example.com",
      phone: null,
      role: "TD",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    },
  ],
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
  const probe = postgres(LOCAL_URL, {
    max: 2,
    idle_timeout: 2,
    connect_timeout: 3,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

function one<T = Record<string, unknown>>(rows: unknown): T {
  return (rows as T[])[0]!;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.show_change_log where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.sync_audit where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.shows_pending_changes where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.shows where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.pending_syncs where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.pending_ingestions where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.deferred_ingestions where wizard_session_id = '${SESSION}'::uuid`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

async function seed(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  // A LIVE show synced at watermark T0 with one (soon to be replaced) crew member.
  const show = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, last_sync_status)
       values ($1, 'slug-coexist-1', 'Coexistence Live', 'Client', 'v4', $2::timestamptz, true, 'ok')
       returning id`,
      [DRIVE_FILE_ID, T0],
    ),
  );
  await sql!.unsafe(
    `insert into public.crew_members (show_id, name, email, role)
     values ($1, 'Old Crew', 'old@example.com', 'A1')`,
    [show.id],
  );
  // The LIVE partition rows that must SURVIVE the wizard finalize:
  await sql!.unsafe(
    `insert into public.pending_ingestions
       (drive_file_id, drive_file_name, last_error_code, last_error_message)
     values ($1, 'coexist.gsheet', 'PARSE_ERROR', 'live failure record')`,
    [DRIVE_FILE_ID],
  );
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, base_modified_time, staged_modified_time, parse_result,
        source_kind, warning_summary)
     values ($1, $2::timestamptz, $2::timestamptz, '{"live":"staged"}'::jsonb, 'manual', '')`,
    [DRIVE_FILE_ID, T0],
  );
  // The wizard staged row via the REAL writer (production-true jsonb shape), then approval.
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await tx.upsertLivePendingSync({
      driveFileId: DRIVE_FILE_ID,
      wizardSessionId: SESSION,
      baseModifiedTime: T0,
      stagedModifiedTime: T1,
      parseResult: WIZARD_PARSE as never,
      triggeredReviewItems: [],
      priorLastSyncStatus: null,
      priorLastSyncError: null,
      sourceKind: "onboarding_scan",
      warningSummary: "",
    });
  });
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true,
            wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = '[]'::jsonb,
            wizard_approved_by_email = 'approver@fxav.com',
            wizard_approved_at = now()
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE_FILE_ID, SESSION],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'coexist.gsheet', 'applied')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'applied'`,
    [FOLDER, SESSION, DRIVE_FILE_ID],
  );
}

beforeAll(() => {
  if (!dbUp) return;
  // Route openers fall back TEST_DATABASE_URL ?? DATABASE_URL — stub BOTH (plan R19-1).
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await seed();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("wizard finalize live-partition coexistence (real DB, real finalize writers)", () => {
  test.skipIf(!dbUp)(
    "live pending_ingestions AND live pending_syncs survive a full wizard finalize that really applied",
    async () => {
      // Phase B (existing-show branch → shadow staged, wizard pending row consumed):
      const phaseB = await handleOnboardingFinalize(
        new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" }),
        {
          requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
          fetchDriveFileMetadata: async (driveFileId: string) => ({
            driveFileId,
            name: "Sheet",
            mimeType: "application/vnd.google-apps.spreadsheet",
            parents: [FOLDER],
            modifiedTime: T1,
          }),
        },
      );
      expect(phaseB.status).toBe(200);
      expect(((await phaseB.json()) as { status: string }).status).toBe("all_batches_complete");

      // Phase D (shadow applied through the shared core):
      const phaseD = await handleOnboardingFinalizeCas(
        new Request("https://crew.fxav.test/api/admin/onboarding/finalize-cas", { method: "POST" }),
        {
          requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
          subscribeToWatchedFolder: async () => undefined,
        },
      );
      expect(phaseD.status).toBe(200);

      // The LIVE failure record survived (class op #1 — deleteLivePendingIngestion no-op'd):
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.pending_ingestions
              where drive_file_id = $1 and wizard_session_id is null`,
            [DRIVE_FILE_ID],
          )
        ).length,
      ).toBe(1);
      // The LIVE staged row survived (class op #2 — step 6L skipped for wizard scope):
      expect(
        (
          await sql!.unsafe(
            `select 1 from public.pending_syncs
              where drive_file_id = $1 and wizard_session_id is null`,
            [DRIVE_FILE_ID],
          )
        ).length,
      ).toBe(1);
      // Anti-tautology: the apply actually RAN — children match the shadow's parse (the
      // pre-rewire bespoke UPDATE persists no children and would pass the survival
      // assertions trivially):
      const show = one<{ id: string; last_seen_modified_time: Date }>(
        await sql!.unsafe(
          `select id, last_seen_modified_time from public.shows where drive_file_id = $1`,
          [DRIVE_FILE_ID],
        ),
      );
      const crew = (await sql!.unsafe(
        `select name from public.crew_members where show_id = $1 order by name`,
        [show.id],
      )) as unknown as Array<{ name: string }>;
      expect(crew.map((c) => c.name)).toEqual(WIZARD_PARSE.crewMembers.map((m) => m.name).sort());
      expect(new Date(show.last_seen_modified_time).toISOString()).toBe(T1);
    },
  );
});
