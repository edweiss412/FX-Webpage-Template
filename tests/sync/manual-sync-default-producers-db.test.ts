import postgres from "postgres";
import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import { runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";
import type { ProcessOneFileDeps } from "@/lib/sync/runScheduledCronSync";

const DB_URL = process.env.TEST_DATABASE_URL;

function fileMeta(driveFileId: string): DriveListedFile {
  return {
    driveFileId,
    name: "Manual DB Fixture",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

const parseResult = {
  show: { title: "Manual DB Fixture" },
  warnings: [],
} as unknown;

async function insertShow(sql: postgres.Sql, driveFileId: string, suffix: string): Promise<string> {
  const [show] = await sql<{ id: string }[]>`
    insert into public.shows (
      drive_file_id, slug, title, client_label, template_version, published, archived,
      last_seen_modified_time, last_sync_status, last_sync_error
    )
    values (
      ${driveFileId}, ${`manual-db-${suffix}`}, 'Manual DB Fixture', 'Client', 'v4', true, false,
      '2026-05-08T11:00:00.000Z'::timestamptz, 'ok', null
    )
    returning id
  `;
  return show!.id;
}

async function cleanup(sql: postgres.Sql, driveFileId: string, showId?: string): Promise<void> {
  if (showId) {
    await sql`delete from public.admin_alerts where show_id = ${showId}::uuid`;
  }
  await sql`delete from public.sync_log where drive_file_id = ${driveFileId}`;
  await sql`delete from public.shows where drive_file_id = ${driveFileId}`;
}

describe("runManualSyncForShow default-path real DB producers", () => {
  test.skipIf(!DB_URL)(
    "hard_fail emits one PARSE_ERROR_LAST_GOOD occurrence on the default processOneFile path",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `hard-fail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `drive-${suffix}`;
      let showId: string | undefined;

      try {
        showId = await insertShow(sql, driveFileId, suffix);
        const processDeps = {
          perFileProcessor: vi.fn(async () => ({
            outcome: "proceed" as const,
            mode: "manual" as const,
          })),
          captureBinding: vi.fn(async () => ({
            bindingToken: "binding-1",
            modifiedTime: "2026-05-08T12:00:00.000Z",
          })),
          fetchMarkdownAtRevision: vi.fn(async () => "# v4\nShow"),
          parseSheet: vi.fn(() => parseResult),
          enrichWithDrivePins: vi.fn(async () => parseResult),
          runPhase1: vi.fn(async () => ({
            outcome: "hard_fail" as const,
            code: "MI-4_NO_CREW",
            failedCodes: ["MI-4_NO_CREW"],
            message: "Crew missing",
          })),
        } as unknown as ProcessOneFileDeps;

        await expect(
          runManualSyncForShow(driveFileId, "manual", {
            checkFinalizeOwnership: async () => false,
            getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
            fetchDriveFileMetadata: vi.fn(async () => fileMeta(driveFileId)),
            processDeps,
          }),
        ).resolves.toEqual({ outcome: "hard_fail", code: "MI-4_NO_CREW" });

        const rows = await sql<{ occurrence_count: number; sheet_name: string | null }[]>`
          select occurrence_count, context->>'sheet_name' as sheet_name
            from public.admin_alerts
           where show_id = ${showId}::uuid
             and code = 'PARSE_ERROR_LAST_GOOD'
             and resolved_at is null
        `;
        expect(rows).toEqual([{ occurrence_count: 1, sheet_name: "Manual DB Fixture" }]);
      } finally {
        await cleanup(sql, driveFileId, showId);
        await sql.end({ timeout: 5 });
      }
    },
  );

  test.skipIf(!DB_URL)(
    "drive_error emits one DRIVE_FETCH_FAILED occurrence on the default processOneFile path",
    async () => {
      const sql = postgres(DB_URL!, { max: 1, prepare: false });
      const suffix = `drive-error-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const driveFileId = `drive-${suffix}`;
      let showId: string | undefined;

      try {
        showId = await insertShow(sql, driveFileId, suffix);
        const processDeps = {
          perFileProcessor: vi.fn(async () => ({
            outcome: "proceed" as const,
            mode: "manual" as const,
          })),
          captureBinding: vi.fn(async () => ({
            bindingToken: "binding-1",
            modifiedTime: "2026-05-08T12:00:00.000Z",
          })),
          fetchMarkdownAtRevision: vi.fn(async () => {
            throw new Error("Drive revision markdown export failed with HTTP 500");
          }),
        } as unknown as ProcessOneFileDeps;

        await expect(
          runManualSyncForShow(driveFileId, "manual", {
            checkFinalizeOwnership: async () => false,
            getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
            fetchDriveFileMetadata: vi.fn(async () => fileMeta(driveFileId)),
            processDeps,
          }),
        ).resolves.toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED" });

        const rows = await sql<{ occurrence_count: number; sheet_name: string | null }[]>`
          select occurrence_count, context->>'sheet_name' as sheet_name
            from public.admin_alerts
           where show_id = ${showId}::uuid
             and code = 'DRIVE_FETCH_FAILED'
             and resolved_at is null
        `;
        expect(rows).toEqual([{ occurrence_count: 1, sheet_name: "Manual DB Fixture" }]);
      } finally {
        await cleanup(sql, driveFileId, showId);
        await sql.end({ timeout: 5 });
      }
    },
  );
});
