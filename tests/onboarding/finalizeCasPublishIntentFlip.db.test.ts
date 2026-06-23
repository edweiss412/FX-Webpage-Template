import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import postgres from "postgres";

import { handleOnboardingFinalizeCas } from "@/app/api/admin/onboarding/finalize-cas/route";

/**
 * Task B3 — the CAS publish flip (`publishAppliedWizardShows`, finalize-cas/route.ts) publishes
 * ONLY session-created first-seen shows whose manifest `publish_intent = true`.
 *
 * Spec §7.4: a CHECKED (publish_intent=true) first-seen show is published (→ Live); an UNCHECKED
 * (publish_intent=false) Held show is NOT flipped (stays published=false / Held).
 *
 * Concrete failure mode this pins: BEFORE B3 the flip selected every session-created
 * `status='applied' AND created_show_id IS NOT NULL` row and force-published BOTH — an unchecked
 * Held show would be wrongly published to Live. AFTER B3 the `AND publish_intent = true` predicate
 * (on BOTH the manifest SELECT and the UPDATE join) leaves the unchecked Held show at
 * published=false while the checked one becomes published=true.
 */

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const SESSION = "3d3d3d3d-7777-4777-8777-3d3d3d3d3d3d";
const FOLDER = "finalize-cas-publish-intent-folder";
const STAGED = "2026-06-13T12:00:00.040Z";

// The two session-created first-seen shows under test. Identifiers are derived in seed() from
// these drive ids — never hardcoded show uuids (anti-tautology rule).
const DRIVE_CHECKED = "drive-cas-pi-checked"; // publish_intent=true  → must publish (Live)
const DRIVE_UNCHECKED = "drive-cas-pi-unchecked"; // publish_intent=false → must stay Held

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 3,
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

const ALL_DRIVES = [DRIVE_CHECKED, DRIVE_UNCHECKED];

async function cleanup(): Promise<void> {
  if (!sql) return;
  for (const drive of ALL_DRIVES) {
    for (const tbl of [
      "show_change_log",
      "sync_audit",
      "shows_pending_changes",
      "shows",
      "pending_syncs",
      "pending_ingestions",
      "onboarding_scan_manifest",
    ]) {
      await sql
        .unsafe(`delete from public.${tbl} where drive_file_id = $1`, [drive])
        .catch(() => {});
    }
  }
  await sql
    .unsafe(`delete from public.deferred_ingestions where wizard_session_id = $1::uuid`, [SESSION])
    .catch(() => {});
  await sql
    .unsafe(`delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`, [
      SESSION,
    ])
    .catch(() => {});
  await sql
    .unsafe(
      `update public.app_settings
          set pending_wizard_session_id = null, pending_wizard_session_at = null,
              pending_folder_id = null, watched_folder_id = null, watched_folder_name = null
        where id = 'default'`,
    )
    .catch(() => {});
}

async function seedSession(): Promise<void> {
  await sql!.unsafe(
    `update public.app_settings
        set pending_wizard_session_id = $1::uuid, pending_wizard_session_at = now(),
            pending_folder_id = $2
      where id = 'default'`,
    [SESSION, FOLDER],
  );
  await sql!.unsafe(
    `insert into public.wizard_finalize_checkpoints (wizard_session_id, status, batches_completed)
     values ($1::uuid, 'all_batches_complete', 1)
     on conflict (wizard_session_id) do update set status = 'all_batches_complete'`,
    [SESSION],
  );
}

// A session-created first-seen show: published=false, wizard_created_session_id=SESSION (the
// show-side discriminator the flip join requires).
async function seedCreatedShow(drive: string): Promise<string> {
  const row = one<{ id: string }>(
    await sql!.unsafe(
      `insert into public.shows
         (drive_file_id, slug, title, client_label, template_version,
          last_seen_modified_time, published, wizard_created_session_id, last_sync_status)
       values ($1, $2, $3, 'Client', 'v4', $4::timestamptz, false, $5::uuid, 'ok')
       returning id`,
      [drive, `slug-${drive}`, `Title ${drive}`, STAGED, SESSION],
    ),
  );
  return row.id;
}

// Manifest row matching the session-created first-seen shape the flip publishes: status='applied',
// created_show_id set, and publish_intent set explicitly (checked vs unchecked).
async function seedManifestRow(
  drive: string,
  opts: { createdShowId: string; publishIntent: boolean },
): Promise<void> {
  await sql!.unsafe(
    `insert into public.onboarding_scan_manifest
       (folder_id, wizard_session_id, drive_file_id, mime_type, name, status, created_show_id,
        publish_intent)
     values ($1, $2::uuid, $3, 'application/vnd.google-apps.spreadsheet', 'fixture.gsheet',
             'applied', $4::uuid, $5)
     on conflict (wizard_session_id, drive_file_id)
       do update set status = 'applied', created_show_id = excluded.created_show_id,
                     publish_intent = excluded.publish_intent`,
    [FOLDER, SESSION, drive, opts.createdShowId, opts.publishIntent],
  );
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize-cas", {
    method: "POST",
  });
}

function deps() {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.com" }),
    subscribeToWatchedFolder: async () => undefined,
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
  await seedSession();
});

afterAll(async () => {
  if (dbUp) await cleanup();
  vi.unstubAllEnvs();
  if (sql) await sql.end().catch(() => {});
});

describe("Task B3 — CAS flip publishes only publish_intent=true shows (real DB)", () => {
  test.skipIf(!dbUp)(
    "checked (publish_intent=true) first-seen show is published; unchecked (false) stays Held",
    async () => {
      const checkedShowId = await seedCreatedShow(DRIVE_CHECKED);
      const uncheckedShowId = await seedCreatedShow(DRIVE_UNCHECKED);
      await seedManifestRow(DRIVE_CHECKED, {
        createdShowId: checkedShowId,
        publishIntent: true,
      });
      await seedManifestRow(DRIVE_UNCHECKED, {
        createdShowId: uncheckedShowId,
        publishIntent: false,
      });

      // No shadow rows for these drives → readShadowRows is empty → the apply loop is a no-op;
      // the run reaches publishAppliedWizardShows directly.
      const res = await handleOnboardingFinalizeCas(request(), deps());
      expect(res.status).toBe(200);

      const published = async (id: string) =>
        one<{ published: boolean }>(
          await sql!.unsafe(`select published from public.shows where id = $1`, [id]),
        ).published;

      // BEFORE B3 BOTH would be true (the flip selected every created_show_id row). AFTER B3 the
      // publish_intent=true predicate publishes only the checked one.
      expect(await published(checkedShowId)).toBe(true);
      expect(await published(uncheckedShowId)).toBe(false);

      // Finalize completed (settings promoted, checkpoint final_cas_done) — the unchecked Held
      // show is a stable terminal state, not a blocker.
      expect(
        one<{ status: string }>(
          await sql!.unsafe(
            `select status from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
            [SESSION],
          ),
        ).status,
      ).toBe("final_cas_done");
    },
  );
});
