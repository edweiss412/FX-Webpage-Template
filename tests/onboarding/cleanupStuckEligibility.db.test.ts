import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_remediationHelpers";

import {
  cleanupAbandonedFinalize,
  CleanupRequiresStaleSessionError,
} from "@/lib/onboarding/sessionLifecycle";

/**
 * Thread 2b (spec 2026-07-05-finalize-resume-deadlock §5.1/§5.4) — provably-stuck
 * eligibility, against the REAL local DB so the finishable/unresolved counts derive
 * from the actual SQL predicates (finishableCleanCount mirrors
 * finalize/route.ts:countRemainingCleanRows; unresolvedManifestDriveFileIds mirrors
 * finalize/route.ts:unresolvedManifestCount), not a fake tx.
 *
 * T7  — fresh (<24h) STUCK session (0 finishable + 1 hard_failed unresolved) is
 *       cleaned immediately; a provenance-linked PUBLISHED show survives; a
 *       provenance-linked UNPUBLISHED interim show is deleted.
 * T8  — fresh NOT-stuck (a finishable clean row present) → session_too_fresh.
 * T9  — fresh empty session (0 finishable, 0 unresolved → NOT stuck) → session_too_fresh.
 * T9b — fresh STUCK session with an in_progress checkpoint touched 2 min ago is still
 *       cleaned — the recency gate does NOT block a stuck session.
 */

// Whole-diff R1 HIGH: validate loopback at module eval, BEFORE any postgres()
// handle opens or dbUp flips true. A mispointed LOCAL_TEST_DATABASE_URL now throws
// here (module load fails) instead of letting the probe connect + afterAll issue
// DELETE/UPDATE against the remote (TEST_DATABASE_URL is the validation project).
const LOCAL_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const SESSION = "5e5e5e5e-2b2b-4b2b-8b2b-5e5e5e5e5e5e";
const FOLDER = "stuck-eligibility-folder";
const D_FAIL = "stuck-eligibility-fail";
const D_PUB = "stuck-eligibility-published";
const D_INTERIM = "stuck-eligibility-interim";
const D_OK = "stuck-eligibility-ok";
const STAGED_INSTANT = "2026-06-10T08:00:00.000Z";

const PARSE_RESULT = {
  show: {
    title: "Stuck Fixture",
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

const ALL_DRIVE_FILES = [D_FAIL, D_PUB, D_INTERIM, D_OK];

async function reset(): Promise<void> {
  if (!sql) return;
  for (const stmt of [
    `delete from public.shows where drive_file_id = any($1::text[])`,
    `delete from public.pending_syncs where drive_file_id = any($1::text[])`,
    `delete from public.shows_pending_changes where drive_file_id = any($1::text[])`,
    `delete from public.onboarding_scan_manifest where wizard_session_id = '${SESSION}'::uuid`,
    `delete from public.wizard_finalize_checkpoints where wizard_session_id = '${SESSION}'::uuid`,
    `update public.app_settings set pending_wizard_session_id = null, pending_wizard_session_at = null, pending_folder_id = null where id = 'default'`,
  ]) {
    await sql.unsafe(stmt, stmt.includes("$1") ? [ALL_DRIVE_FILES] : []).catch(() => {});
  }
}

async function setSession(ageInterval: string): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid,
            pending_wizard_session_at = now() - interval '${ageInterval}',
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
}

async function insertManifest(
  driveFileId: string,
  status: string,
  createdShowId: string | null,
): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status, created_show_id)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', $3, $4, $5)
     on conflict (wizard_session_id, drive_file_id) do update set status = excluded.status, created_show_id = excluded.created_show_id`,
    [FOLDER, SESSION, driveFileId, status, createdShowId],
  );
}

async function insertFinishablePendingSync(driveFileId: string): Promise<void> {
  await sql!.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, staged_modified_time, parse_result, triggered_review_items,
        source_kind, warning_summary, wizard_session_id,
        wizard_approved, wizard_reviewer_choices, wizard_reviewer_choices_version,
        wizard_approved_by_email, wizard_approved_at)
     values ($1, $2::timestamptz, $3::jsonb, '[]'::jsonb, 'onboarding_scan', '', $4::uuid,
             true, '[]'::jsonb, 1, 'approver@fxav.com', now())`,
    [driveFileId, STAGED_INSTANT, PARSE_RESULT, SESSION],
  );
}

async function insertShow(driveFileId: string, slug: string, published: boolean): Promise<string> {
  const rows = (await sql!.unsafe(
    `insert into public.shows (drive_file_id, title, slug, published, client_label, template_version, wizard_created_session_id)
     values ($1, $2, $3, $4, 'Fixture Client', 'v4', $5::uuid)
     returning id`,
    [driveFileId, `Stuck ${slug}`, slug, published, SESSION],
  )) as Array<{ id: string }>;
  return rows[0]!.id;
}

const deps = { requireAdminIdentity: async () => ({ email: "doug@example.com" }) };

beforeAll(() => {
  if (!dbUp) return;
  vi.stubEnv("TEST_DATABASE_URL", LOCAL_URL);
  vi.stubEnv("DATABASE_URL", LOCAL_URL);
  expect(LOCAL_URL).toMatch(/127\.0\.0\.1|localhost/);
});

beforeEach(async () => {
  if (!dbUp) return;
  await reset();
});

afterAll(async () => {
  if (dbUp) await reset();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("cleanupAbandonedFinalize stuck-eligibility (real DB)", () => {
  test.skipIf(!dbUp)(
    "T7: fresh STUCK session is cleaned; published show survives, unpublished interim deleted",
    async () => {
      await setSession("30 minutes"); // fresh — well under 24h
      // unresolved blocker → makes the session stuck (0 finishable + 1 unresolved)
      await insertManifest(D_FAIL, "hard_failed", null);
      // a published, provenance-linked show (already live from an earlier batch) — no pending_syncs
      const pubId = await insertShow(D_PUB, "stuck-pub", true);
      await insertManifest(D_PUB, "applied", pubId);
      // an unpublished, provenance-linked interim show — must be deleted
      const interimId = await insertShow(D_INTERIM, "stuck-interim", false);
      await insertManifest(D_INTERIM, "applied", interimId);

      const result = await cleanupAbandonedFinalize(SESSION, deps);
      expect(result.status).toBe("cleaned");

      const pub = await sql!.unsafe(`select id, published from public.shows where id = $1::uuid`, [
        pubId,
      ]);
      expect(pub.length, "published show must survive discard").toBe(1);
      expect((pub[0] as unknown as { published: boolean }).published).toBe(true);

      const interim = await sql!.unsafe(`select id from public.shows where id = $1::uuid`, [
        interimId,
      ]);
      expect(interim.length, "unpublished interim show must be deleted").toBe(0);

      // session rotated + manifest purged for the session
      const manifest = await sql!.unsafe(
        `select count(*)::int as c from public.onboarding_scan_manifest where wizard_session_id = $1::uuid`,
        [SESSION],
      );
      expect((manifest[0] as unknown as { c: number }).c).toBe(0);
      const owner = await sql!.unsafe(
        `select pending_wizard_session_id from public.app_settings where id = 'default'`,
      );
      expect(
        (owner[0] as unknown as { pending_wizard_session_id: string | null })
          .pending_wizard_session_id,
      ).not.toBe(SESSION);
    },
  );

  test.skipIf(!dbUp)(
    "T8: fresh NOT-stuck (a finishable clean row) → session_too_fresh",
    async () => {
      await setSession("30 minutes");
      await insertManifest(D_OK, "applied", null);
      await insertFinishablePendingSync(D_OK); // finishable > 0 → not stuck

      await expect(cleanupAbandonedFinalize(SESSION, deps)).rejects.toMatchObject({
        code: "CLEANUP_REQUIRES_STALE_SESSION",
        reason: "session_too_fresh",
      });
      // nothing purged
      const still = await sql!.unsafe(
        `select id from public.pending_syncs where drive_file_id = $1`,
        [D_OK],
      );
      expect(still.length).toBe(1);
    },
  );

  test.skipIf(!dbUp)(
    "T9: fresh EMPTY session (0 finishable, 0 unresolved) → session_too_fresh",
    async () => {
      await setSession("30 minutes"); // session set but no manifest/pending rows

      await expect(cleanupAbandonedFinalize(SESSION, deps)).rejects.toBeInstanceOf(
        CleanupRequiresStaleSessionError,
      );
    },
  );

  test.skipIf(!dbUp)(
    "T9b: fresh STUCK session with a 2-min-old in_progress checkpoint is cleaned (recency does not block)",
    async () => {
      await setSession("30 minutes");
      await insertManifest(D_FAIL, "hard_failed", null); // stuck
      await sql!.unsafe(
        `insert into public.wizard_finalize_checkpoints
           (wizard_session_id, status, batches_completed, last_processed_at)
         values ($1::uuid, 'in_progress', 1, now() - interval '2 minutes')`,
        [SESSION],
      );

      const result = await cleanupAbandonedFinalize(SESSION, deps);
      expect(result.status).toBe("cleaned");
      const chk = await sql!.unsafe(
        `select count(*)::int as c from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
        [SESSION],
      );
      expect((chk[0] as unknown as { c: number }).c).toBe(0);
    },
  );
});
