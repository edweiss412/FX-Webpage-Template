/**
 * AC-4's post-commit half (spec docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md §3.4):
 * a committed live staged apply's `sync_log` row resolves a `show_id` even at SHOW BIRTH.
 *
 * That property is purely about WHERE the emit sits. Attribution resolves in the sink's subselect
 * over `public.shows`, so an emit inside the apply transaction — where the tail sits — would write
 * a permanently NULL-attributed row for a first-seen apply. Only a post-commit emit can attribute.
 * A unit test cannot observe this at all: `SyncLogEntry` carries no `show_id` field.
 *
 * What is REAL here: the advisory-lock pipeline transaction, the show INSERT inside it, the
 * production `writeSyncLog` default (no sink injected), and the attribution subselect. The staged
 * row reader, Drive reverify, and the post-apply bookkeeping are injected — none of them affects
 * whether the show row is visible when the emit runs.
 *
 * DB gate pins loopback (see tests/api/admin/pendingIngestionRetryPrepare.db.test.ts for the
 * reasoning): TEST_DATABASE_URL names the REMOTE validation project on this machine, and a test
 * that INSERTS and DELETES rows must never be able to target it.
 */
import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import {
  applyStaged,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";
import { premiseHolds } from "@/tests/_shared/premise";

const LOCAL_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DRIVE_PREFIX = "drive-asl-";

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

async function cleanup(): Promise<void> {
  if (!sql) return;
  await sql.unsafe(`delete from public.sync_log where drive_file_id like $1`, [`${DRIVE_PREFIX}%`]);
  await sql.unsafe(`delete from public.shows where drive_file_id like $1`, [`${DRIVE_PREFIX}%`]);
}

beforeAll(async () => {
  if (!shouldRun) return;
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  await cleanup();
});

afterAll(async () => {
  if (shouldRun) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

function parseResultFixture(): ParseResult {
  return {
    show: {
      title: "Staged Apply Attribution",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: null, set: "2026-08-14", showDays: [], travelOut: null },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
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
    archivedPullSheetTabs: [],
    hardErrors: [],
  };
}

describe("live staged apply attributes its sync_log row at show birth (AC-4)", () => {
  test.skipIf(!shouldRun)(
    "a first-seen apply's applied row carries a non-NULL show_id",
    async () => {
      const db = sql as ReturnType<typeof postgres>;
      const driveFileId = `${DRIVE_PREFIX}${randomUUID().slice(0, 12)}`;

      const before = (await db.unsafe(
        `select count(*)::int as count from public.shows where drive_file_id = $1`,
        [driveFileId],
      )) as Array<{ count: number }>;
      // An EXISTING show would attribute even from an in-tx write and prove nothing. The whole
      // property under test is that the emit happens after the show becomes visible.
      premiseHolds(
        "no shows row exists before the apply (genuine first-seen)",
        before[0]?.count === 0,
      );

      const driveMeta: DriveListedFile & { trashed: boolean } = {
        driveFileId,
        name: `${driveFileId}.xlsx`,
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-08-14T12:00:00.000Z",
        parents: ["watched-folder"],
        headRevisionId: "head-1",
        trashed: false,
      };
      const pending: PendingSyncForApply = {
        driveFileId,
        stagedId: "staged-live",
        sourceKind: "manual",
        wizardSessionId: null,
        // First-seen: no shows row, so the staged baseline is null.
        baseModifiedTime: null,
        stagedModifiedTime: "2026-08-14T12:00:00.000Z",
        parseResult: parseResultFixture(),
        triggeredReviewItems: [
          { id: "fs-1", invariant: "FIRST_SEEN_REVIEW" } as unknown as TriggeredReviewItem,
        ],
        reviewItemsCorrupt: false,
        parseResultCorrupt: false,
        priorLastSyncStatus: null,
        priorLastSyncError: null,
        warningSummary: "none",
        pullSheetOverrideApplied: null,
      };

      const deps: ApplyStagedDeps = {
        readLivePendingSyncForApply: async () => pending,
        readShowForApply: async () => null,
        readWatchedFolderId: async () => "watched-folder",
        fetchDriveFileMetadata: async () => driveMeta,
        liveDriveReverify: { outcome: "ok", metadata: driveMeta },
        liveAssetReviewEffects: {
          parseResult: parseResultFixture(),
          adminAlertCode: null,
          skipDiagramsWrite: false,
        },
        // The show is created HERE, inside the real pipeline transaction — so it is invisible to
        // any connection but this one until that transaction commits.
        runPhase2: (async (tx: { queryOne<T>(sql: string, params: unknown[]): Promise<T> }) => {
          const row = await tx.queryOne<{ id: string }>(
            `insert into public.shows (drive_file_id, slug, title, client_label, template_version)
             values ($1, $2, 'Staged Apply Attribution', 'Client', 'v4')
             returning id::text as id`,
            [driveFileId, `staged-attr-${driveFileId.slice(-8)}`],
          );
          return {
            outcome: "applied" as const,
            showId: row.id,
            appliedRoleMappings: [],
            parseWarnings: [],
          };
        }) as unknown as NonNullable<ApplyStagedDeps["runPhase2"]>,
        insertSyncAudit: async () => "audit-1",
        deleteLivePendingSync: async () => undefined,
        restoreShowStatus: async () => undefined,
        upsertLivePendingIngestion: async () => undefined,
        bumpReviewerAuthFloors: async () => undefined,
        upsertAdminAlert: async () => undefined,
        resolveAdminAlerts: async () => undefined,
        readLandedSnapshotStatus: async () => null,
        // logSync deliberately NOT injected: the production default is the surface under test.
      };

      const result = await applyStaged(
        {
          driveFileId,
          sourceScope: "live",
          stagedId: "staged-live",
          reviewerChoices: [{ item_id: "fs-1", action: "apply" }],
          appliedByEmail: "doug@fxav.test",
        },
        deps,
      );

      expect(result).toMatchObject({ outcome: "applied" });

      const rows = (await db.unsafe(
        `select status, show_id from public.sync_log where drive_file_id = $1`,
        [driveFileId],
      )) as Array<{ status: string; show_id: string | null }>;
      // RED before this arc: the live staged apply wrote NO row at all.
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("applied");
      expect(rows[0]?.show_id).not.toBeNull();
    },
    60_000,
  );
});
