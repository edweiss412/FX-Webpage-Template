import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleWizardStagedApprove } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route";

/**
 * Task D3 — approve (check) is the LIGHTWEIGHT inverse of C3's un-approve: it
 * durably sets publish-intent WITHOUT the heavy navigation-era apply route's
 * Drive-revision re-validation (finalize/processApprovedRow re-validates at apply
 * time, so the checkbox stays cheap). Admin-gated; under the per-show lock +
 * active-session CAS (mirrors apply/route.ts + C3's guards). It synthesizes
 * apply-all reviewer choices over the row's ONBOARDING_SCAN_REVIEW sentinel(s)
 * (the only allowed action is `apply`), sets pending_syncs.wizard_approved=true
 * with approve provenance + version=1, and marks the manifest row 'applied'. A
 * superseded session → 409 WIZARD_SESSION_SUPERSEDED (no mutation).
 *
 * Real DB (local 54322). Values are read back from the DB, not asserted against
 * the request. Expectations derive from the seeded triggered_review_items
 * (anti-tautology: the synthesized choices map item ids → 'apply').
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "d3d3d3d3-1111-4111-8111-d3d3d3d3d3d3";
const OTHER_SESSION = "d3d3d3d3-9999-4999-8999-d3d3d3d3d3d3";
const FOLDER = "d3-approve-folder";
const DRIVE_FILE_ID = "d3-approve-drive-file";
const ADMIN_EMAIL = "Doug@FXAV.com"; // mixed-case → canonicalization is observable
const CANONICAL_ADMIN_EMAIL = "doug@fxav.com";

// The seeded review items — the synthesized choices must map THESE ids → apply
// (derive expectations from the fixture, never hardcode the choice array shape).
const REVIEW_ITEMS = [
  { id: "rev-d3-a", invariant: "ONBOARDING_SCAN_REVIEW" },
  { id: "rev-d3-b", invariant: "ONBOARDING_SCAN_REVIEW" },
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

// Seed an UNCHECKED (clean) wizard row: pending_syncs.wizard_approved=false (no
// approve provenance), manifest 'staged'. The active wizard session is SESSION.
// triggered_review_items carries the ONBOARDING_SCAN_REVIEW sentinels.
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
             '{"show":{"title":"D3"}}'::jsonb, 'onboarding_scan', '', $3::jsonb,
             false)`,
    [DRIVE_FILE_ID, SESSION, JSON.stringify(REVIEW_ITEMS)],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'D3.gsheet', 'staged')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'staged'`,
    [FOLDER, SESSION, DRIVE_FILE_ID],
  );
}

async function pendingRow(): Promise<{
  wizard_approved: boolean;
  wizard_approved_by_email: string | null;
  wizard_approved_at: string | null;
  wizard_reviewer_choices: unknown;
  wizard_reviewer_choices_version: number | null;
}> {
  return one(
    await sql!.unsafe(
      `select wizard_approved, wizard_approved_by_email, wizard_approved_at,
              wizard_reviewer_choices, wizard_reviewer_choices_version
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

describe("Task D3 — approve sets durable publish-intent (lightweight, real DB)", () => {
  test.skipIf(!dbUp)(
    "an unchecked/staged row → after POST: wizard_approved=true + canonical approver + version=1 + synthesized apply-all choices + manifest 'applied'",
    async () => {
      await seedStaged();
      // Precondition (derived from seed): the row is genuinely unchecked.
      expect((await pendingRow()).wizard_approved).toBe(false);
      expect(await manifestStatus()).toBe("staged");

      const response = await handleWizardStagedApprove(req(), context, {
        requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "approved" });

      const row = await pendingRow();
      expect(row.wizard_approved).toBe(true);
      expect(row.wizard_approved_by_email).toBe(CANONICAL_ADMIN_EMAIL);
      expect(row.wizard_approved_at).not.toBeNull();
      expect(row.wizard_reviewer_choices_version).toBe(1);
      // The synthesized choices apply-all over the seeded sentinel ids (anti-tautology).
      expect(row.wizard_reviewer_choices).toEqual(EXPECTED_CHOICES);

      expect(await manifestStatus()).toBe("applied");
    },
  );

  test.skipIf(!dbUp)(
    "a superseded session → 409 WIZARD_SESSION_SUPERSEDED and the row is NOT mutated",
    async () => {
      // Seed the staged row for SESSION, but make a DIFFERENT session active so the
      // active-session CAS predicate matches 0 rows.
      await seedStaged();
      await sql!.unsafe(
        `update public.app_settings
            set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now()
          where id = 'default'`,
        [OTHER_SESSION],
      );

      const response = await handleWizardStagedApprove(req(), context, {
        requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });

      // The staged row is untouched (no partial mutation on the superseded path).
      const row = await pendingRow();
      expect(row.wizard_approved).toBe(false);
      expect(row.wizard_approved_by_email).toBeNull();
      expect(await manifestStatus()).toBe("staged");
    },
  );

  test.skipIf(!dbUp)("a non-admin caller gets 403", async () => {
    await seedStaged();

    const response = await handleWizardStagedApprove(req(), context, {
      requireAdminIdentity: async () => {
        throw { code: "ADMIN_FORBIDDEN" };
      },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });

    expect((await pendingRow()).wizard_approved).toBe(false);
  });
});
