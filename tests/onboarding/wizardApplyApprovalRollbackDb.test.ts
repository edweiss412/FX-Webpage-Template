import { afterAll, beforeEach, describe, expect, test } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { applyStaged } from "@/lib/sync/applyStaged";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";
import type { DriveListedFile } from "@/lib/drive/list";

/**
 * BL-APPLYSTAGED-SUPERSESSION-ROLLBACK (PR #87) real-DB partial-commit regression.
 *
 * applyStaged_unlocked's wizard branch APPROVES the pending sync (a committed
 * UPDATE on the per-show-locked tx), then marks the manifest applied. If the
 * manifest UPDATE 0-rows because the session was superseded mid-apply, the code
 * MUST throw WizardSessionSupersededRollbackError (not return) so the locked tx
 * (withPostgresSyncPipelineLock = sql.begin) ABORTS and the approve UPDATE rolls
 * back. The route-level test (wizardScopedReapply) proves the catch maps the
 * throw to 409; THIS proves the throw actually rolls back the wizard_approved
 * write against a real Postgres — the partial-commit the old `return` leaked.
 *
 * The supersession is injected at exactly the 1105 site by stubbing
 * markWizardManifestApplied to return false (a 0-row manifest update); every
 * other dep runs against the real DB.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "a1a1a1a1-2222-4222-8222-a1a1a1a1a1a1";
const FOLDER = "apply-rollback-folder";
const DRIVE_FILE_ID = "drive-apply-rollback-1";
const T0 = "2026-06-11T00:00:00.000Z";
const T1 = "2026-06-12T09:30:00.000Z";

const WIZARD_PARSE = {
  show: {
    title: "Apply Rollback Fixture",
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
    po: "PO-1",
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
    `delete from public.pending_syncs where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.pending_ingestions where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.onboarding_scan_manifest where drive_file_id = '${DRIVE_FILE_ID}'`,
    `delete from public.shows where drive_file_id = '${DRIVE_FILE_ID}'`,
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
  await sql!.unsafe(
    `insert into public.shows
       (drive_file_id, slug, title, client_label, template_version,
        last_seen_modified_time, published, last_sync_status)
     values ($1, 'slug-apply-rollback-1', 'Apply Rollback Live', 'Client', 'v4', $2::timestamptz, true, 'ok')`,
    [DRIVE_FILE_ID, T0],
  );
  // The wizard staged row via the REAL writer (production-true jsonb shape),
  // left UNAPPROVED (wizard_approved defaults false) — the apply will approve it.
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
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'apply-rollback.gsheet', 'staged')
     on conflict (wizard_session_id, drive_file_id) do update set status = 'staged'`,
    [FOLDER, SESSION, DRIVE_FILE_ID],
  );
}

const driveMetaInScope: DriveListedFile = {
  driveFileId: DRIVE_FILE_ID,
  name: "apply-rollback.gsheet",
  mimeType: "application/vnd.google-apps.spreadsheet",
  // modifiedTime matches the staged revision → the apply reverify is "ok"
  // (no revision_race), so the apply reaches the approve + manifest path.
  modifiedTime: T1,
  parents: [FOLDER],
};

describe.skipIf(!dbUp)("applyStaged wizard apply — partial-commit rollback (real DB)", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    if (sql) await sql.end({ timeout: 5 }).catch(() => {});
  });

  test("an in-apply supersession (manifest 0-rows) rolls back the committed wizard_approved UPDATE", async () => {
    const stagedId = one<{ staged_id: string }>(
      await sql!.unsafe(
        `select staged_id from public.pending_syncs
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [DRIVE_FILE_ID, SESSION],
      ),
    ).staged_id;

    // Pre-condition: not yet approved.
    expect(
      one<{ wizard_approved: boolean }>(
        await sql!.unsafe(
          `select wizard_approved from public.pending_syncs
            where drive_file_id = $1 and wizard_session_id = $2::uuid`,
          [DRIVE_FILE_ID, SESSION],
        ),
      ).wizard_approved,
    ).toBe(false);

    await expect(
      applyStaged(
        {
          sourceScope: "wizard",
          wizardSessionId: SESSION,
          driveFileId: DRIVE_FILE_ID,
          stagedId,
          reviewerChoices: [],
          appliedByEmail: "applier@fxav.com",
        },
        {
          fetchDriveFileMetadata: async () => driveMetaInScope,
          // Inject the 1105 supersession: the manifest UPDATE 0-rows AFTER the
          // approve UPDATE already committed-in-tx.
          markWizardManifestApplied: async () => false,
        },
      ),
    ).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);

    // The approve UPDATE ran on the per-show-locked tx; the throw aborted it, so
    // wizard_approved must be back to false (NOT the leaked partial commit).
    expect(
      one<{ wizard_approved: boolean }>(
        await sql!.unsafe(
          `select wizard_approved from public.pending_syncs
            where drive_file_id = $1 and wizard_session_id = $2::uuid`,
          [DRIVE_FILE_ID, SESSION],
        ),
      ).wizard_approved,
    ).toBe(false);
  });

  // Control (anti-tautology): the SAME apply path WITHOUT a supersession commits
  // the approve. Proves the rollback test's `false` is a real abort of a real
  // write, not the approve simply never happening.
  test("without a supersession the approve commits (wizard_approved = true)", async () => {
    const stagedId = one<{ staged_id: string }>(
      await sql!.unsafe(
        `select staged_id from public.pending_syncs
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [DRIVE_FILE_ID, SESSION],
      ),
    ).staged_id;

    const result = await applyStaged(
      {
        sourceScope: "wizard",
        wizardSessionId: SESSION,
        driveFileId: DRIVE_FILE_ID,
        stagedId,
        reviewerChoices: [],
        appliedByEmail: "applier@fxav.com",
      },
      {
        fetchDriveFileMetadata: async () => driveMetaInScope,
        markWizardManifestApplied: async () => true,
      },
    );

    expect(result).toMatchObject({ outcome: "wizard_applied" });
    expect(
      one<{ wizard_approved: boolean }>(
        await sql!.unsafe(
          `select wizard_approved from public.pending_syncs
            where drive_file_id = $1 and wizard_session_id = $2::uuid`,
          [DRIVE_FILE_ID, SESSION],
        ),
      ).wizard_approved,
    ).toBe(true);
  });
});
