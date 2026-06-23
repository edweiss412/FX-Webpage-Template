import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";

/**
 * whole-diff R1 HIGH — demoted finalize-failure rows block finish on the RETRY (real DB).
 *
 * spec §7.3 narrowed `unresolvedManifestCount` to count only the canonical blocking set
 * `{ hard_failed, live_row_conflict, discard_retryable }`, dropping plain `staged` so a FRESH
 * unchecked-clean row (→ Held) no longer 409s. But `demotePending` resets a FAILED finalize row
 * to `status='staged'` and sets `pending_syncs.last_finalize_failure_code`. The Task-B2 selector
 * (selectFinishableCleanRows) EXCLUDES such a demoted row (`wizard_approved=true OR
 * last_finalize_failure_code is null`), so on a SECOND /finalize call it sees zero selected rows;
 * if `unresolvedManifestCount` also ignored the demoted `staged` row, finalize would advance to
 * all_batches_complete and finalize-cas would promote the folder, silently bypassing the failed
 * sheet (which then gets purged/reaped with no recovery).
 *
 * The fix counts, as unresolved, a `staged` manifest row whose `pending_syncs` row carries a
 * non-null `last_finalize_failure_code`. This test pins:
 *   - NEGATIVE (the bug): a session whose ONLY remaining row is DEMOTED → 409 ONBOARDING_NOT_RESOLVED
 *     (NOT 200/all_batches_complete). Before the fix this 200'd (demoted row bypassed finish).
 *   - POSITIVE (no over-block): a FRESH unchecked-clean staged row (no failure code) does NOT 409 —
 *     it finishes and creates a Held show. Proves the demoted condition didn't re-block plain staged.
 */

// Phase-wide DB convention: TEST_DATABASE_URL is the VALIDATION project in this repo — every
// *.db.test.ts pins BOTH env vars to local loopback (plan R19-1), because the route's
// databaseUrl() prefers TEST_DATABASE_URL ?? DATABASE_URL.
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "5d5d5d5d-2222-4222-8222-5d5d5d5d5d5d";
const FOLDER = "demoted-block-folder";

const FILE_DEMOTED = "demoted-block-demoted-file";
const FILE_FRESH = "demoted-block-fresh-file";
const ALL_FILES = [FILE_DEMOTED, FILE_FRESH];

const STAGED_INSTANT = "2026-06-14T07:30:00.040Z";
const FINALIZER_EMAIL = "finalizer@fxav.com";
const DEMOTED_FAILURE_CODE = "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE";

// Minimal-but-complete first-seen parse fixture (shape is production-true; sibling db tests pin
// child-table fidelity). Title varies per file so each created show is distinguishable.
function parseResultFor(title: string) {
  return {
    show: {
      title,
      client_label: "Acme Corp",
      client_contact: { primary: { name: "Pat", email: "pat@example.com" } },
      template_version: "v4",
      venue: { name: "Grand Hall" },
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: { theme: "Annual" },
      agenda_links: [],
      coi_status: null,
      po: "PO-77",
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [
      {
        name: "Ada",
        email: "Ada@Example.com",
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
}

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 4,
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
  for (const file of ALL_FILES) {
    for (const stmt of [
      `delete from public.show_change_log where drive_file_id = '${file}'`,
      `delete from public.sync_audit where drive_file_id = '${file}'`,
      `delete from public.shows where drive_file_id = '${file}'`,
      `delete from public.pending_syncs where drive_file_id = '${file}'`,
      `delete from public.pending_ingestions where drive_file_id = '${file}'`,
      `delete from public.shows_pending_changes where drive_file_id = '${file}'`,
      `delete from public.onboarding_scan_manifest where drive_file_id = '${file}'`,
    ]) {
      await sql.unsafe(stmt, []).catch(() => {});
    }
  }
  await sql
    .unsafe(
      `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
      [],
    )
    .catch(() => {});
  await sql
    .unsafe(
      `update public.app_settings
          set pending_wizard_session_id = null, pending_wizard_session_at = null,
              pending_folder_id = null
        where id = 'default'`,
      [],
    )
    .catch(() => {});
}

async function setActiveSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
}

// Stage a clean pending_syncs row via the real wizard-staging writer (production-true jsonb).
async function stagePending(driveFileId: string, title: string): Promise<void> {
  await sql!.begin(async (rawTx) => {
    const tx = new PostgresOnboardingScanTx(
      rawTx as unknown as PostgresTransaction,
      FOLDER,
      SESSION,
    );
    await tx.upsertLivePendingSync({
      driveFileId,
      wizardSessionId: SESSION,
      baseModifiedTime: null,
      stagedModifiedTime: STAGED_INSTANT,
      parseResult: parseResultFor(title) as never,
      triggeredReviewItems: [],
      priorLastSyncStatus: null,
      priorLastSyncError: null,
      sourceKind: "onboarding_scan",
      warningSummary: "",
    });
  });
}

// Manifest row — defaults to 'staged' (the post-demote / fresh-unchecked manifest state).
async function stageManifest(driveFileId: string, status = "staged"): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet', $4)
     on conflict (wizard_session_id, drive_file_id) do update set status = excluded.status`,
    [FOLDER, SESSION, driveFileId, status],
  );
}

// A fresh in_progress checkpoint — matches the real flow where finalize's ensureCheckpoint has
// already created it (the FOR UPDATE re-read path), and the all_batches_complete short-circuit
// does NOT apply.
async function seedCheckpoint(): Promise<void> {
  await sql!.unsafe(
    `insert into public.wizard_finalize_checkpoints (wizard_session_id, status, batches_completed)
     values ($1::uuid, 'in_progress', 0)
     on conflict (wizard_session_id) do update set status = 'in_progress'`,
    [SESSION],
  );
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" });
}

function deps() {
  return {
    requireAdminIdentity: async () => ({ email: FINALIZER_EMAIL }),
    fetchDriveFileMetadata: async (driveFileId: string) => ({
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [FOLDER],
      modifiedTime: STAGED_INSTANT,
    }),
  };
}

async function showRow(
  driveFileId: string,
): Promise<{ id: string; published: boolean } | undefined> {
  return one(
    await sql!.unsafe(`select id, published from public.shows where drive_file_id = $1`, [
      driveFileId,
    ]),
  ) as { id: string; published: boolean } | undefined;
}

async function pendingCount(driveFileId: string): Promise<number> {
  return (
    await sql!.unsafe(`select 1 from public.pending_syncs where drive_file_id = $1`, [driveFileId])
  ).length;
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
  await setActiveSession();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("whole-diff R1 HIGH — demoted finalize-failure rows block finish on retry (real DB)", () => {
  test.skipIf(!dbUp)(
    "DEMOTED-only session → 409 ONBOARDING_NOT_RESOLVED (NOT all_batches_complete)",
    async () => {
      // Seed a session whose ONLY remaining row is a DEMOTED one: manifest 'staged', pending_syncs
      // wizard_approved=false + a non-null last_finalize_failure_code, plus a checkpoint. This is
      // the exact state demotePending leaves behind after a failed finalize batch row. On the
      // RETRY: selectFinishableCleanRows excludes it (no auto-Held re-create), and the fix counts
      // it as unresolved so the gate refuses instead of advancing to all_batches_complete.
      await stagePending(FILE_DEMOTED, "Demoted Awaiting Reapply");
      await stageManifest(FILE_DEMOTED, "staged");
      await sql!.unsafe(
        `update public.pending_syncs
            set wizard_approved = false,
                last_finalize_failure_code = $3
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [FILE_DEMOTED, SESSION, DEMOTED_FAILURE_CODE],
      );
      await seedCheckpoint();

      const response = await handleOnboardingFinalize(request(), deps());

      // The demoted row blocks finish — finalize REFUSES, it does not promote past the failed sheet.
      expect(response.status).toBe(409);
      const body = (await response.json()) as {
        code: string;
        status?: string;
        unresolved_manifest_count?: number;
      };
      expect(body.code).toBe("ONBOARDING_NOT_RESOLVED");
      // Crucially NOT the advance-to-finish response:
      expect(body.status).not.toBe("all_batches_complete");
      // The demoted staged row is counted as the one unresolved blocker.
      expect(body.unresolved_manifest_count).toBe(1);

      // No show created; the demoted pending row survives for operator re-apply (NOT purged).
      expect(await showRow(FILE_DEMOTED)).toBeUndefined();
      expect(await pendingCount(FILE_DEMOTED)).toBe(1);
    },
  );

  test.skipIf(!dbUp)(
    "FRESH unchecked-clean staged row (no failure code) does NOT 409 — finishes / creates Held (no over-block)",
    async () => {
      // The positive guard: a fresh unchecked-clean staged row (wizard_approved=false but NO
      // last_finalize_failure_code) must STILL be non-blocking. It is in the finishable batch, gets
      // a Held show, and the route returns 200 — proving the demoted condition did not re-block
      // plain `staged`.
      await stagePending(FILE_FRESH, "Fresh Unchecked Sibling");
      await stageManifest(FILE_FRESH, "staged"); // wizard_approved defaults false, no failure code
      await seedCheckpoint();

      const response = await handleOnboardingFinalize(request(), deps());

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        status: string;
        per_row: Array<{ drive_file_id: string; code: string }>;
      };
      // Processed (not 409'd): a Held show is created and the pending row consumed.
      expect(body.per_row.find((r) => r.drive_file_id === FILE_FRESH)?.code).toBe("OK");

      const freshShow = await showRow(FILE_FRESH);
      expect(freshShow).toBeDefined();
      expect(freshShow!.published).toBe(false); // born Held
      expect(await pendingCount(FILE_FRESH)).toBe(0); // consumed
    },
  );
});
