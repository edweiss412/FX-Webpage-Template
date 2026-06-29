import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleWizardStagedApprove } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";

/**
 * Task 5b — the Step-3 checkbox `/approve` route must REFUSE a row demoted by a
 * per-sheet re-scan (last_finalize_failure_code === 'RESCAN_REVIEW_REQUIRED').
 *
 * The approve route deliberately clears last_finalize_failure_code and synthesizes
 * an apply-all over every triggered item (so the cheap checkbox can recover ordinary
 * finalize-demotions). For a dirty re-scan that is WRONG: it would silently re-approve
 * a crew-identity change (MI-11) or write an invalid apply-all for a multi-action
 * MI-12/13/14 (→ 500 at finalize). The guard is TARGETED — only the rescan code is
 * gated; every other demotion code keeps the existing one-click checkbox recovery.
 *
 * Real DB (local 54322). Values are read back from the DB, not asserted against the
 * request body (anti-tautology). The concrete failure mode pinned here: a silent
 * re-approve of a re-scan crew change via the publish checkbox.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "5b5b5b5b-1111-4111-8111-5b5b5b5b5b5b";
const FOLDER = "rescan-approve-guard-folder";
const DRIVE_FILE_ID = "rescan-approve-guard-drive-file";
const ADMIN_EMAIL = "Doug@FXAV.com";
const CANONICAL_ADMIN_EMAIL = "doug@fxav.com";

// A NORMAL (non-rescan) demotion code — the guard must NOT gate it (regression check).
const NORMAL_DEMOTED_FAILURE_CODE = "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE";

// Seeded review items — the synthesized choices map THESE ids → apply (derive
// expectations from the fixture, never hardcode the choice array shape).
const REVIEW_ITEMS = [
  { id: "rev-5b-a", invariant: "ONBOARDING_SCAN_REVIEW" },
  { id: "rev-5b-b", invariant: "ONBOARDING_SCAN_REVIEW" },
];
const EXPECTED_CHOICES = REVIEW_ITEMS.map((i) => ({ item_id: i.id, action: "apply" }));

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
    `delete from public.pending_syncs where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE_FILE_ID}'`,
    `update public.app_settings
        set pending_wizard_session_id = null, pending_wizard_session_at = null,
            pending_folder_id = null
      where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, []).catch(() => {});
  }
}

// Seed a clean staged row (wizard_approved=false, manifest 'staged') under the active
// SESSION, carrying the ONBOARDING_SCAN_REVIEW sentinels.
async function seedStaged(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, wizard_session_id, base_modified_time, staged_modified_time,
        parse_result, source_kind, warning_summary, triggered_review_items,
        wizard_approved)
     values ($1, $2::uuid, '2026-06-01T00:00:00Z'::timestamptz, '2026-06-01T00:00:00Z'::timestamptz,
             '{"show":{"title":"5b"}}'::jsonb, 'onboarding_scan', '', $3::jsonb,
             false)`,
    [DRIVE_FILE_ID, SESSION, JSON.stringify(REVIEW_ITEMS)],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', '5b.gsheet', 'staged')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'staged'`,
    [FOLDER, SESSION, DRIVE_FILE_ID],
  );
}

// Seed a row demoted with a specific failure code (manifest 'staged',
// wizard_approved=false → the CHECK's false-branch permits the lingering code).
async function seedDemotedWith(code: string): Promise<void> {
  await seedStaged();
  await sql!.unsafe(
    `update public.pending_syncs
        set last_finalize_failure_code = $3
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE_FILE_ID, SESSION, code],
  );
}

async function pendingRow(): Promise<{
  wizard_approved: boolean;
  wizard_approved_by_email: string | null;
  wizard_reviewer_choices: unknown;
  wizard_reviewer_choices_version: number | null;
  last_finalize_failure_code: string | null;
}> {
  return one(
    await sql!.unsafe(
      `select wizard_approved, wizard_approved_by_email,
              wizard_reviewer_choices, wizard_reviewer_choices_version,
              last_finalize_failure_code
         from public.pending_syncs
        where drive_file_id = $1 and wizard_session_id = $2::uuid`,
      [DRIVE_FILE_ID, SESSION],
    ),
  ) as never;
}

async function manifestStatus(): Promise<string> {
  return (
    one(
      await sql!.unsafe(
        `select status from public.onboarding_scan_manifest
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [DRIVE_FILE_ID, SESSION],
      ),
    ) as { status: string }
  ).status;
}

const context = {
  params: Promise.resolve({ wizardSessionId: SESSION, driveFileId: DRIVE_FILE_ID }),
};

function req(): Request {
  return new Request(
    `https://crew.fxav.test/api/admin/onboarding/staged/${SESSION}/${DRIVE_FILE_ID}/approve`,
    { method: "POST" },
  );
}

beforeAll(() => {
  if (!dbUp) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("Task 5b — /approve refuses a dirty re-scan row (RESCAN_REVIEW_REQUIRED)", () => {
  test.skipIf(!dbUp)(
    "a RESCAN_REVIEW_REQUIRED row → /approve is REFUSED (HTTP 200, code returned), row stays unapproved + code NOT cleared",
    async () => {
      await seedDemotedWith(RESCAN_REVIEW_REQUIRED);
      // Precondition (derived from seed): genuinely demoted by a re-scan.
      const before = await pendingRow();
      expect(before.wizard_approved).toBe(false);
      expect(before.last_finalize_failure_code).toBe(RESCAN_REVIEW_REQUIRED);
      expect(await manifestStatus()).toBe("staged");

      const response = await handleWizardStagedApprove(req(), context, {
        requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
      });
      // HTTP 200 with the cataloged code — the card routes Doug to the reapply page.
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: false, code: RESCAN_REVIEW_REQUIRED });

      // ZERO mutation: the re-scan crew change was NOT silently re-approved.
      const after = await pendingRow();
      expect(after.wizard_approved).toBe(false);
      expect(after.last_finalize_failure_code).toBe(RESCAN_REVIEW_REQUIRED);
      expect(after.wizard_approved_by_email).toBeNull();
      expect(await manifestStatus()).toBe("staged");
    },
  );

  test.skipIf(!dbUp)(
    "regression: a NORMAL demoted row (different code) is STILL cleared + approved by /approve",
    async () => {
      await seedDemotedWith(NORMAL_DEMOTED_FAILURE_CODE);
      const before = await pendingRow();
      expect(before.wizard_approved).toBe(false);
      expect(before.last_finalize_failure_code).toBe(NORMAL_DEMOTED_FAILURE_CODE);

      const response = await handleWizardStagedApprove(req(), context, {
        requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "approved" });

      const after = await pendingRow();
      expect(after.wizard_approved).toBe(true);
      expect(after.last_finalize_failure_code).toBeNull();
      expect(after.wizard_approved_by_email).toBe(CANONICAL_ADMIN_EMAIL);
      expect(after.wizard_reviewer_choices_version).toBe(1);
      // Synthesized choices apply-all over the seeded sentinel ids (anti-tautology).
      expect(after.wizard_reviewer_choices).toEqual(EXPECTED_CHOICES);
      expect(await manifestStatus()).toBe("applied");
    },
  );
});
