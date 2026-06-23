import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";

/**
 * Task B1 — the batch finish gate (`unresolvedManifestCount`, finalize/route.ts) drops `staged`.
 *
 * Spec §7.3 `finishable` set: blocking statuses = { hard_failed, live_row_conflict,
 * discard_retryable }. A clean `staged` row (unchecked → Held) is NO LONGER counted as
 * unresolved, so `ONBOARDING_NOT_RESOLVED` 409 fires ONLY on a genuine error/conflict row.
 *
 * The gate is observable at the `approvedRows.length === 0` branch (finalize/route.ts:911-928):
 * with no finishable clean rows left to process, the post-discovery `unresolvedManifestCount`
 * decides between `all_batches_complete` (200) and `ONBOARDING_NOT_RESOLVED` (409).
 *
 * Concrete failure mode this pins:
 *   (a) BEFORE B1 a leftover clean `staged` manifest row counted as unresolved → the finish call
 *       409'd `ONBOARDING_NOT_RESOLVED` forever (no finishable pending row to consume it). AFTER
 *       B1 it is non-blocking → finish completes (`all_batches_complete`, 200).
 *   (b) a `hard_failed` manifest row must STILL 409 `ONBOARDING_NOT_RESOLVED` (stays blocking).
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "5c5c5c5c-3333-4333-8333-5c5c5c5c5c5c";
const FOLDER = "finalize-gate-staged-folder";
const DRIVE_CLEAN = "drive-gate-staged-clean";
const DRIVE_FAILED = "drive-gate-staged-failed";

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

const ALL_DRIVES = [DRIVE_CLEAN, DRIVE_FAILED];

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const drive of ALL_DRIVES) {
    for (const tbl of [
      "show_change_log",
      "sync_audit",
      "shows",
      "pending_syncs",
      "pending_ingestions",
      "shows_pending_changes",
      "onboarding_scan_manifest",
    ]) {
      await sql
        .unsafe(`delete from public.${tbl} where drive_file_id = $1`, [drive])
        .catch(() => {});
    }
  }
  await sql
    .unsafe(`delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`, [
      SESSION,
    ])
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

async function seedSession(checkpointStatus: string): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.wizard_finalize_checkpoints (wizard_session_id, status, batches_completed)
     values ($1::uuid, $2, 1)
     on conflict (wizard_session_id) do update set status = excluded.status`,
    [SESSION, checkpointStatus],
  );
}

async function seedManifestRow(drive: string, status: string): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet', $4)
     on conflict (wizard_session_id, drive_file_id) do update set status = excluded.status`,
    [FOLDER, SESSION, drive, status],
  );
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" });
}

function deps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: "2026-06-12T07:30:00.040Z",
    }),
  };
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

describe("Task B1 — finish gate drops 'staged' (real DB)", () => {
  test.skipIf(!dbUp)(
    "(a) a clean 'staged' manifest row (no finishable pending row) does NOT 409 — finish completes",
    async () => {
      // Checkpoint already all_batches_complete; a single clean 'staged' manifest row with NO
      // finishable pending_syncs row to consume it (approvedRows.length === 0). BEFORE B1 the
      // 'staged' row counted as unresolved → 409 ONBOARDING_NOT_RESOLVED forever. AFTER B1 it is
      // non-blocking → the all_batches_complete short-circuit (route.ts:911-922) returns 200.
      await seedSession("all_batches_complete");
      await seedManifestRow(DRIVE_CLEAN, "staged");

      const response = await handleOnboardingFinalize(request(), deps());
      const body = (await response.clone().json()) as { code?: string; status?: string };
      expect(response.status).not.toBe(409);
      expect(body.code).not.toBe("ONBOARDING_NOT_RESOLVED");
      expect(response.status).toBe(200);
      expect(body.status).toBe("all_batches_complete");
    },
  );

  test.skipIf(!dbUp)(
    "(b) a hard_failed manifest row STILL 409s ONBOARDING_NOT_RESOLVED",
    async () => {
      // A genuine error row — must still block finish (spec §7.3: hard_failed stays blocking).
      // No finishable clean row exists (the hard_failed manifest is not status in (staged,applied)
      // and has no pending row), so approvedRows.length === 0 and the gate is what fires.
      await seedSession("all_batches_complete");
      await seedManifestRow(DRIVE_FAILED, "hard_failed");

      const response = await handleOnboardingFinalize(request(), deps());
      expect(response.status).toBe(409);
      const body = (await response.json()) as { code: string; unresolved_manifest_count: number };
      expect(body.code).toBe("ONBOARDING_NOT_RESOLVED");
      expect(body.unresolved_manifest_count).toBe(1);
    },
  );
});
