import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import { cleanupAbandonedFinalize } from "@/lib/onboarding/sessionLifecycle";

/**
 * F1 Task 1.3 (plan R25-1/R29-1) — Phase B lock-order overlap regression.
 *
 * cleanupAbandonedFinalize takes `finalize:<session>` THEN `app_settings FOR UPDATE`
 * (lib/onboarding/sessionLifecycle.ts cleanupAbandonedFinalize). Before the reorder,
 * handleOnboardingFinalize took the app_settings FOR UPDATE row lock FIRST (readActiveSession)
 * and only then touched the finalize lock — the AB-BA inversion. This regression runs both
 * concurrently against the real local DB and asserts BOTH settle without a deadlock
 * (SQLSTATE 40P01 — would surface as finalize 500 ONBOARDING_FINALIZE_INTERNAL_ERROR or a
 * cleanup OnboardingSessionInfraError mentioning "deadlock"), and that the pair serializes to
 * exactly one effective owner of the session at a time.
 *
 * Structural pin (red-on-main shape) lives in tests/auth/advisoryLockRpcDeadlock.test.ts.
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1).
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "7a7a7a7a-3333-4333-8333-7a7a7a7a7a7a";
const FOLDER = "finalize-cleanup-overlap-folder";
const DRIVE_FILE_ID = "finalize-cleanup-overlap-file";
const STAGED_INSTANT = "2026-06-10T08:00:00.000Z";

const PARSE_RESULT = {
  show: {
    title: "Overlap Fixture",
    client_label: "Client",
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: {
      travelIn: "2026-05-07",
      set: "2026-05-08",
      showDays: ["2026-05-09"],
      travelOut: "2026-05-10",
    },
    event_details: {},
    agenda_links: [],
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

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.sync_audit where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.shows where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.pending_syncs where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.shows_pending_changes where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE_FILE_ID}'`,
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
        set pending_wizard_session_id = $1::uuid,
            pending_wizard_session_at = now() - interval '25 hours',
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, staged_modified_time, parse_result, triggered_review_items,
        source_kind, warning_summary, wizard_session_id,
        wizard_approved, wizard_reviewer_choices, wizard_reviewer_choices_version,
        wizard_approved_by_email, wizard_approved_at)
     values ($1, $2::timestamptz, $3::jsonb, '[]'::jsonb, 'onboarding_scan', '', $4::uuid,
             true, '[]'::jsonb, 1, 'approver@fxav.com', now())`,
    [DRIVE_FILE_ID, STAGED_INSTANT, PARSE_RESULT, SESSION],
  );
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'overlap.gsheet', 'applied')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'applied'`,
    [FOLDER, SESSION, DRIVE_FILE_ID],
  );
}

function finalizeDeps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: STAGED_INSTANT,
    }),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(() => {
  if (!dbUp) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  // Guard: the handlers under test must resolve to the local loopback, never validation.
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
  await seed();
});

afterAll(async () => {
  if (!dbUp) {
    if (sql) await sql.end().catch(() => {});
    return;
  }
  await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("finalize vs cleanupAbandonedFinalize overlap (Phase B lock order)", () => {
  test.skipIf(!dbUp)(
    "concurrent finalize + cleanup for the same session both settle without SQLSTATE 40P01 and one wins",
    async () => {
      const finalizePromise = handleOnboardingFinalize(
        new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" }),
        finalizeDeps(),
      );
      await delay(20); // let finalize enter its transaction before cleanup contends
      const cleanupPromise = cleanupAbandonedFinalize(SESSION, {
        requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
      });

      const [finalizeSettled, cleanupSettled] = await Promise.allSettled([
        finalizePromise,
        cleanupPromise,
      ]);

      // Finalize never rejects (typed-500 wrapper) — but a deadlock would surface as a 500
      // ONBOARDING_FINALIZE_INTERNAL_ERROR. Assert it did NOT.
      expect(finalizeSettled.status).toBe("fulfilled");
      const response = (finalizeSettled as PromiseFulfilledResult<Response>).value;
      const body = (await response.json()) as { code?: string; status?: string };
      expect(
        response.status,
        `finalize must not 500 (deadlock class): body=${JSON.stringify(body)}`,
      ).not.toBe(500);
      expect([200, 409]).toContain(response.status);

      // Cleanup settles as cleaned/already_cleaned (or a typed stale-session refusal) — never an
      // infra error carrying the 40P01 deadlock.
      if (cleanupSettled.status === "fulfilled") {
        expect(["cleaned", "already_cleaned"]).toContain(cleanupSettled.value.status);
      } else {
        const reason = cleanupSettled.reason as Error & { code?: string };
        expect(
          `${reason.name}: ${reason.message}`,
          "cleanup must not fail with a deadlock-class infra error",
        ).not.toMatch(/deadlock|40P01/i);
        expect(reason.code).toBe("CLEANUP_REQUIRES_STALE_SESSION");
      }

      // Exactly one effective owner at a time: if cleanup won the finalize lock first, finalize
      // observed CONCURRENT_FINALIZE_IN_FLIGHT or the supersession re-check 409; if finalize won,
      // it completed its batch (200) and cleanup serialized BEHIND it.
      if (response.status === 200) {
        expect(body.status).toBeDefined();
      } else {
        expect(["CONCURRENT_FINALIZE_IN_FLIGHT", "WIZARD_SESSION_SUPERSEDED"]).toContain(body.code);
      }
    },
  );
});
