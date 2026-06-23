import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { PostgresOnboardingScanTx, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";

/**
 * Task B2 — finalize creates a Held show for EVERY clean row (checked AND unchecked).
 *
 * The widened selector (selectFinishableCleanRows) picks up unchecked-clean first-seen rows
 * (wizard_approved=false), and processApprovedRow's 4-branch logic creates a Held show
 * (published=false, publish_intent=false) for them — vs the checked branch (publish_intent=true).
 * The existing-show-unchecked branch is a D10 no-op (no shadow, no shows write). The data-loss
 * guard (case d) is the sequencing-hazard regression: a batch of ONLY unchecked-clean rows must
 * still create N Held shows and consume N pending rows — never purge-without-a-show.
 *
 * Every expectation derives from the fixtures (counts/field values), never hardcoded
 * (anti-tautology rule). publish_intent / created_show_id / applied_by are read back from the DB.
 */

// Phase-wide DB-connection convention: TEST_DATABASE_URL is the VALIDATION project in this
// repo — every *.db.test.ts pins BOTH env vars to the local loopback (plan R19-1), because the
// route's databaseUrl() prefers TEST_DATABASE_URL ?? DATABASE_URL.
const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "7c7c7c7c-4444-4444-8444-7c7c7c7c7c7c";
const FOLDER = "held-creation-folder";

// Distinct drive_file_ids per case (a/b/c) + two for the data-loss guard (d) + two for (e).
const FILE_CHECKED = "held-creation-checked-file";
const FILE_UNCHECKED = "held-creation-unchecked-file";
const FILE_EXISTING_UNCHECKED = "held-creation-existing-unchecked-file";
const FILE_GUARD_A = "held-creation-guard-a-file";
const FILE_GUARD_B = "held-creation-guard-b-file";
const FILE_DEMOTED = "held-creation-demoted-file";
const FILE_FRESH = "held-creation-fresh-file";
const ALL_FILES = [
  FILE_CHECKED,
  FILE_UNCHECKED,
  FILE_EXISTING_UNCHECKED,
  FILE_GUARD_A,
  FILE_GUARD_B,
  FILE_DEMOTED,
  FILE_FRESH,
];

const STAGED_INSTANT = "2026-06-14T07:30:00.040Z";
const APPROVED_AT = "2026-06-14T09:15:00.000Z";
const FINALIZER_EMAIL = "finalizer@fxav.com";
const APPROVER_EMAIL = "approver@fxav.com";

// Minimal-but-complete first-seen parse fixture (shape is production-true; the existing full-apply
// db test pins child-table fidelity). Title varies per file so each created show is distinguishable.
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
    rooms: [
      {
        kind: "ballroom",
        name: "Main",
        dimensions: null,
        floor: null,
        setup: null,
        set_time: null,
        show_time: null,
        strike_time: null,
        audio: null,
        video: null,
        lighting: null,
        scenic: null,
        power: null,
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
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

// Manifest row — the created_show_id / publish_intent provenance target.
async function stageManifest(driveFileId: string, status = "applied"): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet', $4)
     on conflict (wizard_session_id, drive_file_id) do update set status = excluded.status`,
    [FOLDER, SESSION, driveFileId, status],
  );
}

// Mark a staged pending row CHECKED (approver ≠ finalizer, Apply-click instant pinned).
async function markApproved(driveFileId: string): Promise<void> {
  await sql!.unsafe(
    `update public.pending_syncs
        set wizard_approved = true,
            wizard_reviewer_choices_version = 1,
            wizard_reviewer_choices = '[]'::jsonb,
            wizard_approved_by_email = $3,
            wizard_approved_at = $4::timestamptz
      where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [driveFileId, SESSION, APPROVER_EMAIL, APPROVED_AT],
  );
}

// Seed a LIVE show (wizard_session_id NULL) so a finalize row is "existing-show".
async function seedLiveShow(driveFileId: string): Promise<string> {
  const row = one(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          published, last_seen_modified_time, last_sync_status)
       values ($1, $2, 'Live Existing Show', 'Acme Corp', 'v4',
               true, $3::timestamptz, 'ok')
       returning id`,
      [driveFileId, `live-${driveFileId}`, STAGED_INSTANT],
    ),
  ) as { id: string };
  return row.id;
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

async function manifestRow(
  driveFileId: string,
): Promise<{ status: string; created_show_id: string | null; publish_intent: boolean }> {
  return one(
    await sql!.unsafe(
      `select status, created_show_id, publish_intent
         from public.onboarding_scan_manifest
        where wizard_session_id = $1::uuid and drive_file_id = $2`,
      [SESSION, driveFileId],
    ),
  ) as { status: string; created_show_id: string | null; publish_intent: boolean };
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

describe("Task B2 — finalize creates a Held show for every clean row (real DB)", () => {
  test.skipIf(!dbUp)(
    "(a) first-seen CHECKED → Held show (published=false), manifest publish_intent=true + created_show_id",
    async () => {
      await stagePending(FILE_CHECKED, "Checked First Seen");
      await markApproved(FILE_CHECKED);
      await stageManifest(FILE_CHECKED);

      const response = await handleOnboardingFinalize(request(), deps());
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        per_row: Array<{ drive_file_id: string; code: string }>;
      };
      expect(body.per_row.find((r) => r.drive_file_id === FILE_CHECKED)?.code).toBe("OK");

      const show = await showRow(FILE_CHECKED);
      expect(show).toBeDefined();
      expect(show!.published).toBe(false); // born Held; CAS (B3) flips checked → Live

      const manifest = await manifestRow(FILE_CHECKED);
      expect(manifest.publish_intent).toBe(true); // checked
      expect(manifest.created_show_id).toBe(show!.id);

      expect(await pendingCount(FILE_CHECKED)).toBe(0); // consumed
    },
  );

  test.skipIf(!dbUp)(
    "(b) first-seen UNCHECKED → Held show (published=false), publish_intent=false, audit applied_by = FINALIZER",
    async () => {
      // Unchecked = staged + manifest, but NOT approved (no markApproved). The widened selector
      // must still pick it up. wizard_approved defaults false; approver email/at/choices null.
      await stagePending(FILE_UNCHECKED, "Unchecked First Seen");
      await stageManifest(FILE_UNCHECKED, "staged"); // unchecked rows sit at manifest 'staged'

      const response = await handleOnboardingFinalize(request(), deps());
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        per_row: Array<{ drive_file_id: string; code: string }>;
      };
      expect(body.per_row.find((r) => r.drive_file_id === FILE_UNCHECKED)?.code).toBe("OK");

      const show = await showRow(FILE_UNCHECKED);
      expect(show).toBeDefined();
      expect(show!.published).toBe(false); // Held — never flipped (publish_intent=false)

      const manifest = await manifestRow(FILE_UNCHECKED);
      expect(manifest.publish_intent).toBe(false); // unchecked
      expect(manifest.created_show_id).toBe(show!.id);

      // Audit actor for an unchecked first-seen apply is the FINALIZER (the row has no approver).
      const audit = one(
        await sql!.unsafe(`select applied_by from public.sync_audit where drive_file_id = $1`, [
          FILE_UNCHECKED,
        ]),
      ) as { applied_by: string };
      expect(audit.applied_by).toBe(FINALIZER_EMAIL);

      expect(await pendingCount(FILE_UNCHECKED)).toBe(0); // consumed
    },
  );

  test.skipIf(!dbUp)(
    "(c) existing-show UNCHECKED → D10 no-op: live show UNCHANGED, no shadow, pending consumed, manifest resolved",
    async () => {
      const liveShowId = await seedLiveShow(FILE_EXISTING_UNCHECKED);
      await stagePending(FILE_EXISTING_UNCHECKED, "Existing Unchecked");
      await stageManifest(FILE_EXISTING_UNCHECKED, "staged");

      const response = await handleOnboardingFinalize(request(), deps());
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        per_row: Array<{ drive_file_id: string; code: string }>;
      };
      expect(body.per_row.find((r) => r.drive_file_id === FILE_EXISTING_UNCHECKED)?.code).toBe(
        "OK",
      );

      // Live show UNCHANGED: still published=true, same id.
      const show = one(
        await sql!.unsafe(`select id, published from public.shows where drive_file_id = $1`, [
          FILE_EXISTING_UNCHECKED,
        ]),
      ) as { id: string; published: boolean };
      expect(show.id).toBe(liveShowId);
      expect(show.published).toBe(true); // untouched

      // NO shadow staged for the existing-show-unchecked no-op:
      expect(
        (
          await sql!.unsafe(`select 1 from public.shows_pending_changes where drive_file_id = $1`, [
            FILE_EXISTING_UNCHECKED,
          ])
        ).length,
      ).toBe(0);

      const manifest = await manifestRow(FILE_EXISTING_UNCHECKED);
      expect(manifest.publish_intent).toBe(false);
      expect(manifest.created_show_id).toBeNull(); // flip-excluded
      expect(manifest.status).toBe("applied"); // resolved → non-blocking

      expect(await pendingCount(FILE_EXISTING_UNCHECKED)).toBe(0); // consumed
    },
  );

  test.skipIf(!dbUp)(
    "(d) DATA-LOSS GUARD: a batch of ONLY unchecked-clean first-seen rows creates ALL Held shows + consumes ALL pending rows",
    async () => {
      // Zero checked rows; two unchecked-clean first-seen rows. The widened selector MUST pick
      // both up; both get Held shows; both pending rows are consumed (none silently purged).
      await stagePending(FILE_GUARD_A, "Guard A");
      await stageManifest(FILE_GUARD_A, "staged");
      await stagePending(FILE_GUARD_B, "Guard B");
      await stageManifest(FILE_GUARD_B, "staged");

      const response = await handleOnboardingFinalize(request(), deps());
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        per_row: Array<{ drive_file_id: string; code: string }>;
      };
      // Both processed OK (derived: count == number of staged guard files):
      const guardFiles = [FILE_GUARD_A, FILE_GUARD_B];
      const okGuardRows = body.per_row.filter(
        (r) => guardFiles.includes(r.drive_file_id) && r.code === "OK",
      );
      expect(okGuardRows.length).toBe(guardFiles.length);

      for (const file of guardFiles) {
        const show = await showRow(file);
        expect(show).toBeDefined();
        expect(show!.published).toBe(false); // Held
        const manifest = await manifestRow(file);
        expect(manifest.publish_intent).toBe(false);
        expect(manifest.created_show_id).toBe(show!.id);
        expect(await pendingCount(file)).toBe(0); // consumed — NOT purged-without-a-show
      }

      // No guard pending rows left behind anywhere in the session:
      expect(
        (
          await sql!.unsafe(
            `select drive_file_id from public.pending_syncs where wizard_session_id = $1::uuid`,
            [SESSION],
          )
        ).length,
      ).toBe(0);
    },
  );

  test.skipIf(!dbUp)(
    "(e) a DEMOTED row (last_finalize_failure_code set, wizard_approved=false) is NOT re-processed; a fresh unchecked sibling IS",
    async () => {
      // A demoted-not-yet-reapplied row must wait for operator re-apply — it must NOT be picked up
      // by the widened selector every batch (it would just re-fail and never let finish complete).
      // A fresh unchecked sibling (no failure code) MUST still be processed into a Held show. This
      // pins the selector's `wizard_approved=true OR last_finalize_failure_code is null` predicate.
      await stagePending(FILE_DEMOTED, "Demoted Awaiting Reapply");
      await stageManifest(FILE_DEMOTED, "staged");
      // Simulate the post-demote state: wizard_approved=false + failure code set (manifest 'staged').
      await sql!.unsafe(
        `update public.pending_syncs
            set wizard_approved = false, last_finalize_failure_code = 'STAGED_PARSE_SOURCE_OUT_OF_SCOPE'
          where drive_file_id = $1 and wizard_session_id = $2::uuid`,
        [FILE_DEMOTED, SESSION],
      );

      await stagePending(FILE_FRESH, "Fresh Unchecked Sibling");
      await stageManifest(FILE_FRESH, "staged");

      const response = await handleOnboardingFinalize(request(), deps());
      // The fresh sibling is in the finishable batch, so the route processes it (200 batch_complete);
      // the demoted row stays unresolved (manifest 'staged') and is simply not in the batch — finish
      // is later blocked by unresolvedManifestCount (B1's domain) until it is re-applied or resolved.
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        per_row?: Array<{ drive_file_id: string; code: string }>;
      };

      // The fresh unchecked sibling → Held show created + pending consumed.
      const freshShow = await showRow(FILE_FRESH);
      expect(freshShow).toBeDefined();
      expect(freshShow!.published).toBe(false);
      expect(await pendingCount(FILE_FRESH)).toBe(0);

      // The demoted row was NOT processed: no show created, pending row survives (awaiting re-apply),
      // and it never appears in per_row (it was excluded from the finishable batch).
      expect(await showRow(FILE_DEMOTED)).toBeUndefined();
      expect(await pendingCount(FILE_DEMOTED)).toBe(1);
      expect(body.per_row?.some((r) => r.drive_file_id === FILE_DEMOTED)).not.toBe(true);
    },
  );
});
