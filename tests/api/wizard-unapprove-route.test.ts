import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

const logAdminOutcomeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/logAdminOutcome", () => ({ logAdminOutcome: logAdminOutcomeMock }));

import {
  handleWizardStagedUnapprove,
  type WizardUnapproveRouteDeps,
  type WizardUnapproveRouteTx,
} from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route";

/**
 * Task C3 — un-approve (uncheck) reverts a wizard row to clean `staged`: the inverse
 * of the apply/approve. Admin-gated; under the per-show lock + active-session CAS
 * (mirrors apply/route.ts's guards). Sets pending_syncs.wizard_approved=false and
 * nulls the approve provenance + reviewer choices; resets the manifest row to
 * 'staged'. A superseded session → 409 WIZARD_SESSION_SUPERSEDED (no mutation).
 *
 * Real DB (local 54322). Values are read back from the DB, not asserted against the
 * request.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "c3c3c3c3-1111-4111-8111-c3c3c3c3c3c3";
const OTHER_SESSION = "c3c3c3c3-9999-4999-8999-c3c3c3c3c3c3";
const FOLDER = "c3-unapprove-folder";
const DRIVE_FILE_ID = "c3-unapprove-drive-file";
const APPROVER_EMAIL = "approver@fxav.com";

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

// Seed an APPROVED (checked) wizard row: pending_syncs.wizard_approved=true with
// approve provenance, manifest 'applied'. The active wizard session is SESSION.
async function seedApproved(activeSession: string = SESSION): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [activeSession, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, wizard_session_id, base_modified_time, staged_modified_time,
        parse_result, source_kind, warning_summary,
        wizard_approved, wizard_approved_by_email, wizard_approved_at,
        wizard_reviewer_choices, wizard_reviewer_choices_version)
     values ($1, $2::uuid, '2026-06-01T00:00:00Z'::timestamptz, '2026-06-01T00:00:00Z'::timestamptz,
             '{"show":{"title":"C3"}}'::jsonb, 'onboarding_scan', '',
             true, $3, now(), '[]'::jsonb, 1)`,
    [DRIVE_FILE_ID, SESSION, APPROVER_EMAIL],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'C3.gsheet', 'applied')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'applied'`,
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
    `https://crew.fxav.test/api/admin/onboarding/staged/${SESSION}/${DRIVE_FILE_ID}/unapprove`,
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

describe("Task C3 — un-approve reverts a wizard row to staged (real DB)", () => {
  test.skipIf(!dbUp)(
    "an approved/applied row → after POST: wizard_approved=false + provenance nulled + manifest 'staged'",
    async () => {
      await seedApproved();
      // Precondition (derived from seed): the row is genuinely approved.
      expect((await pendingRow()).wizard_approved).toBe(true);
      expect(await manifestStatus()).toBe("applied");

      const response = await handleWizardStagedUnapprove(req(), context, {
        requireAdminIdentity: async () => ({ email: "doug@fxav.com" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "unapproved" });

      const row = await pendingRow();
      expect(row.wizard_approved).toBe(false);
      expect(row.wizard_approved_by_email).toBeNull();
      expect(row.wizard_approved_at).toBeNull();
      expect(row.wizard_reviewer_choices).toBeNull();
      expect(row.wizard_reviewer_choices_version).toBeNull();

      expect(await manifestStatus()).toBe("staged");
    },
  );

  test.skipIf(!dbUp)(
    "a superseded session → 409 WIZARD_SESSION_SUPERSEDED and the row is NOT mutated",
    async () => {
      // Seed the approved row for SESSION, but make a DIFFERENT session active so the
      // active-session CAS predicate matches 0 rows.
      await seedApproved();
      await sql!.unsafe(
        `update public.app_settings
            set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now()
          where id = 'default'`,
        [OTHER_SESSION],
      );

      const response = await handleWizardStagedUnapprove(req(), context, {
        requireAdminIdentity: async () => ({ email: "doug@fxav.com" }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });

      // The approved row is untouched (no partial mutation on the superseded path).
      const row = await pendingRow();
      expect(row.wizard_approved).toBe(true);
      expect(row.wizard_approved_by_email).toBe(APPROVER_EMAIL);
      expect(await manifestStatus()).toBe("applied");
    },
  );

  test.skipIf(!dbUp)("a non-admin caller gets 403", async () => {
    await seedApproved();

    const response = await handleWizardStagedUnapprove(req(), context, {
      requireAdminIdentity: async () => {
        throw { code: "ADMIN_FORBIDDEN" };
      },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });

    expect((await pendingRow()).wizard_approved).toBe(true);
  });
});

// STAGE_UNAPPROVED outcome-ref telemetry. DB-independent: injects a fake withRowTx +
// tx so the emit-only-after-commit contract is exercised without a live Postgres.
describe("Task — STAGE_UNAPPROVED outcome log (outcome-ref, emit after commit)", () => {
  const ADMIN_EMAIL = "doug@fxav.com";
  const revertedTx = {
    queryOne: async () => ({ unapproved: true }),
  } as unknown as WizardUnapproveRouteTx;
  const supersededTx = {
    queryOne: async () => null,
  } as unknown as WizardUnapproveRouteTx;

  function deps(overrides: WizardUnapproveRouteDeps = {}): WizardUnapproveRouteDeps {
    return {
      requireAdminIdentity: async () => ({ email: ADMIN_EMAIL }),
      withRowTx: async (_id, fn) => fn(revertedTx),
      ...overrides,
    };
  }

  beforeEach(() => {
    logAdminOutcomeMock.mockClear();
  });

  test("success → logAdminOutcome called once with the bound admin email + ids", async () => {
    const response = await handleWizardStagedUnapprove(req(), context, deps());
    expect(response.status).toBe(200);

    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "STAGE_UNAPPROVED",
        source: "api.admin.onboarding.staged.unapprove",
        actorEmail: ADMIN_EMAIL,
        driveFileId: DRIVE_FILE_ID,
        wizardSessionId: SESSION,
      }),
    );
  });

  test("409 superseded → logAdminOutcome NOT called", async () => {
    const response = await handleWizardStagedUnapprove(
      req(),
      context,
      deps({ withRowTx: async (_id, fn) => fn(supersededTx) }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });

  test("post-success commit failure → 500 and logAdminOutcome NOT called", async () => {
    const response = await handleWizardStagedUnapprove(
      req(),
      context,
      deps({
        withRowTx: async (_id, fn) => {
          await fn(revertedTx);
          throw new Error("commit failed");
        },
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });
});
