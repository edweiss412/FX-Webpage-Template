/**
 * AC-1 live probe (spec docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md):
 * a pending-ingestion retry against an EXISTING, non-archived, non-finalize-owned show reaches
 * `processOneFile_unlocked` with a `prepared` value and completes with a real
 * `ProcessOneFileResult` — no `SyncInfraError("processOneFile_unlocked", ...)`.
 *
 * This case is env-bound on purpose. The shipped unit tests inject `processOneFile_unlocked`, which
 * is exactly why the defect never surfaced: mocked-only coverage observes what the test author
 * thought the surface required, not what it actually requires. Here `prepareProcessOneFile`,
 * `runManualSyncForShow_unlocked`, and the database are all REAL; only the Drive-facing metadata
 * fetch is stubbed.
 *
 * A Drive fetch failure downstream of preparation is a PASSING outcome for this probe: it returns
 * `kind: "fetch_failure"`, which `processOneFile_unlocked` routes into the same recovery cron uses,
 * and that recovery writes a `sync_log` row. What the probe rules out is the pre-change behavior —
 * an unconditional throw before ANY sync work.
 *
 * DB gate deliberately differs from tests/sync/resyncShrinkHold.db.test.ts: that file derives its
 * URL from `TEST_DATABASE_URL`, which on this project names the REMOTE validation project. A test
 * that SEEDS and DELETES rows must never be able to target it, so the URL here is pinned to
 * loopback and the gate is loopback reachability alone.
 */
import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { handleLivePendingIngestionRetry } from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import type { LivePendingIngestionRouteDeps } from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import { premiseHolds } from "@/tests/_shared/premise";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const FOLDER = "pending-retry-prepare-folder";
const DRIVE_PREFIX = "drive-prp-";

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

const shouldRun = dbUp;

let priorWatchedFolderId: string | null = null;

async function cleanup(): Promise<void> {
  if (!sql) return;
  await sql.unsafe(`delete from public.sync_log where drive_file_id like $1`, [`${DRIVE_PREFIX}%`]);
  await sql.unsafe(`delete from public.pending_ingestions where drive_file_id like $1`, [
    `${DRIVE_PREFIX}%`,
  ]);
  await sql.unsafe(`delete from public.shows where drive_file_id like $1`, [`${DRIVE_PREFIX}%`]);
}

beforeAll(async () => {
  if (!shouldRun || !sql) return;
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  await cleanup();
  // app_settings is a shared singleton — capture and restore, never leave a foreign folder behind.
  const rows = (await sql.unsafe(
    `select watched_folder_id from public.app_settings where id = 'default' limit 1`,
    [],
  )) as Array<{ watched_folder_id: string | null }>;
  priorWatchedFolderId = rows[0]?.watched_folder_id ?? null;
  await sql.unsafe(
    `insert into public.app_settings (id, watched_folder_id) values ('default', $1)
       on conflict (id) do update set watched_folder_id = excluded.watched_folder_id`,
    [FOLDER],
  );
});

afterAll(async () => {
  if (shouldRun && sql) {
    await cleanup();
    await sql.unsafe(`update public.app_settings set watched_folder_id = $1 where id = 'default'`, [
      priorWatchedFolderId,
    ]);
  }
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("pending-ingestion retry against a live existing show (AC-1)", () => {
  test.skipIf(!shouldRun)(
    "reaches real sync work with a prepared value and records a sync_log row",
    async () => {
      const driveFileId = `${DRIVE_PREFIX}${randomUUID().slice(0, 12)}`;
      const db = sql as ReturnType<typeof postgres>;

      await db.unsafe(
        `insert into public.shows (drive_file_id, slug, title, client_label, template_version)
         values ($1, $2, 'Retry Prepare Probe', 'Client', 'v4')`,
        [driveFileId, `retry-prepare-${driveFileId.slice(-8)}`],
      );
      const pendingRows = (await db.unsafe(
        `insert into public.pending_ingestions
           (drive_file_id, drive_file_name, last_error_code, last_error_message)
         values ($1, $2, 'STAGED_PARSE_FAILED', 'probe seed')
         returning id`,
        [driveFileId, `${driveFileId}.xlsx`],
      )) as Array<{ id: string }>;
      const pendingId = pendingRows[0]?.id as string;

      const existing = (await db.unsafe(
        `select count(*)::int as count from public.shows where drive_file_id = $1`,
        [driveFileId],
      )) as Array<{ count: number }>;
      premiseHolds(
        "the seeded row makes this the EXISTING-show branch, the one that threw",
        existing[0]?.count === 1 && Boolean(pendingId),
      );

      const routeDeps: LivePendingIngestionRouteDeps = {
        requireAdminIdentity: async () => ({ email: "retry-live@example.com" }),
        // The ONLY stub: Drive metadata. Its parents must contain the watched folder or the route
        // 409s SHEET_UNAVAILABLE before any preparation runs.
        fetchDriveFileMetadata: async () => ({
          driveFileId,
          name: `${driveFileId}.xlsx`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          modifiedTime: "2026-08-14T12:00:00.000Z",
          parents: [FOLDER],
          headRevisionId: "head-1",
        }),
      };

      const response = await handleLivePendingIngestionRetry(
        new Request("http://x", { method: "POST" }),
        { params: Promise.resolve({ id: pendingId }) },
        routeDeps,
      );

      // Pre-change, this call REJECTED with SyncInfraError("processOneFile_unlocked", ...) — the
      // five-argument forward — so a Response of any status is the behavioral change under test.
      expect(response).toBeInstanceOf(Response);
      expect(response.status).not.toBe(500);

      const logged = (await db.unsafe(
        `select count(*)::int as count from public.sync_log where drive_file_id = $1`,
        [driveFileId],
      )) as Array<{ count: number }>;
      expect(logged[0]?.count ?? 0).toBeGreaterThanOrEqual(1);
    },
    60_000,
  );
});
