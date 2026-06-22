/**
 * tests/db/resetValidationData.test.ts (Task 2)
 *
 * Real-DB behavioural test for public.reset_validation_data(): with the gate
 * enabled + an admin JWT, seed a full show graph + staging + validation_state +
 * app_settings pointers, call the RPC, and assert the precise post-state.
 *
 * Regressions pinned here:
 *   - reports is a NON-cascade FK child of shows (confdeltype 'a' = NO ACTION).
 *     If the RPC deleted shows WITHOUT pre-deleting reports, the DELETE would
 *     raise a foreign-key violation. The seeded reports row proves the RPC
 *     deletes reports first.
 *   - deferred_ingestions (suppression residue) has NO FK to shows, so
 *     `delete from shows` does NOT clear it; it must be explicit-deleted.
 *   - onboarding_scan_manifest is a SET NULL child (confdeltype 'n'), so
 *     `delete from shows` only NULLs created_show_id; the rows must be
 *     explicit-deleted too.
 *   - app_settings PERSISTS (the singleton row is not deleted) but the
 *     pending_wizard_* / pending_folder_* pointers are NULLed; watched_folder_id
 *     is left UNCHANGED.
 *   - admin_emails rows are preserved (not validation data).
 */
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });

const ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});

async function callResetAsAdmin(): Promise<{ clearedShows: number }> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'authenticated', true)`;
    await tx`select set_config('request.jwt.claims', ${ADMIN_CLAIMS}, true)`;
    const [row] = await tx`select public.reset_validation_data() as result`;
    if (!row) throw new Error("reset_validation_data returned no row");
    return (row as unknown as { result: { clearedShows: number } }).result;
  }) as Promise<{ clearedShows: number }>;
}

async function count(table: string, where = ""): Promise<number> {
  const [row] = await sql.unsafe(`select count(*)::int n from public.${table} ${where}`);
  if (!row) throw new Error(`count(${table}) returned no row`);
  return (row as unknown as { n: number }).n;
}

type Seeded = { showId: string; driveFileId: string };

/** Seed one show + full cascade graph + reports + staging + a deferred-ingestion residue. */
async function seedShowGraph(): Promise<Seeded> {
  const showId = randomUUID();
  const driveFileId = `drive-${randomUUID()}`;
  await sql`
    insert into public.shows (id, drive_file_id, slug, title, client_label, template_version,
                              archived, published, picker_epoch)
    values (${showId}::uuid, ${driveFileId}, ${`slug-${showId.slice(0, 8)}`}, 'Reset Test Show',
            'Client', 'v1', false, true, 1)`;
  // Cascade children (on delete cascade) — cleared by `delete from shows`.
  await sql`insert into public.crew_members (show_id, name, role) values (${showId}::uuid, 'Crew One', 'Audio')`;
  await sql`insert into public.hotel_reservations (show_id, ordinal) values (${showId}::uuid, 1)`;
  await sql`insert into public.rooms (show_id, kind, name) values (${showId}::uuid, 'green_room', 'GR-1')`;
  await sql`insert into public.transportation (show_id) values (${showId}::uuid)`;
  await sql`insert into public.contacts (show_id, kind) values (${showId}::uuid, 'production')`;
  // NON-cascade FK child (NO ACTION) — the RPC must pre-delete this before shows.
  await sql`insert into public.reports (show_id, reported_by_kind, reported_by, context)
            values (${showId}::uuid, 'crew', 'crew-member', '{}'::jsonb)`;
  // Staging / clear-explicit residue keyed by drive_file_id.
  await sql`insert into public.pending_syncs (drive_file_id, staged_modified_time, parse_result, source_kind, warning_summary, wizard_session_id)
            values (${driveFileId}, now(), '{}'::jsonb, 'cron', '', null)`;
  await sql`insert into public.pending_ingestions (drive_file_id, drive_file_name, last_error_code, last_error_message, wizard_session_id)
            values (${driveFileId}, 'sheet.xlsx', 'PARSE_FAILED', 'boom', null)`;
  // Suppression residue — has NO FK to shows; must be explicit-deleted.
  await sql`insert into public.deferred_ingestions (drive_file_id, deferred_kind, deferred_by_email, wizard_session_id)
            values (${driveFileId}, 'permanent_ignore', 'dlarson@fxav.net', null)`;
  return { showId, driveFileId };
}

beforeEach(async () => {
  // Clean slate + gate enabled for the reset to be allowed.
  await sql`update public.destructive_reset_gate set enabled = true where id = 'default'`;
});

afterAll(async () => {
  await sql`update public.destructive_reset_gate set enabled = false where id = 'default'`;
  await sql.end({ timeout: 5 });
});

describe("reset_validation_data() — full reset behaviour", () => {
  test("deletes shows + cascade children + reports + staging + deferred residue + validation_state; preserves app_settings row (pointers nulled, watched_folder_id unchanged) and admin_emails; returns correct clearedShows", async () => {
    // --- arrange ---
    const a = await seedShowGraph();
    const b = await seedShowGraph();

    // validation_state singleton.
    await sql`
      insert into public.validation_state (key, combos_materialized, seeded_by, seeded_supabase_project_ref)
      values ('validation_seed', array['R1']::text[], 'reset-test', 'local')
      on conflict (key) do update set combos_materialized = excluded.combos_materialized`;

    // app_settings pointers set; watched_folder_id is the preserve-anchor.
    const watchedFolder = `watched-${randomUUID()}`;
    await sql`
      update public.app_settings set
        watched_folder_id = ${watchedFolder},
        pending_wizard_session_id = ${randomUUID()}::uuid,
        pending_wizard_session_at = now(),
        pending_folder_id = 'pending-folder',
        pending_folder_name = 'Pending Folder',
        pending_folder_set_by_email = 'dlarson@fxav.net',
        pending_folder_set_at = now()
      where id = 'default'`;

    // admin_emails preserve-anchor (NOT validation data). Idempotent insert.
    const adminEmail = `reset-test-${randomUUID()}@example.invalid`;
    await sql`insert into public.admin_emails (email) values (${adminEmail}) on conflict do nothing`;

    const showsBefore = await count("shows");
    expect(showsBefore).toBeGreaterThanOrEqual(2);

    // --- act ---
    const result = await callResetAsAdmin();

    // --- assert: counts ---
    expect(result.clearedShows).toBe(showsBefore);
    expect(await count("shows")).toBe(0);
    // Cascade children gone.
    expect(await count("crew_members")).toBe(0);
    expect(await count("hotel_reservations")).toBe(0);
    expect(await count("rooms")).toBe(0);
    expect(await count("transportation")).toBe(0);
    expect(await count("contacts")).toBe(0);
    // Non-cascade FK child gone (the reports regression).
    expect(await count("reports")).toBe(0);
    // Staging + suppression residue gone.
    expect(await count("pending_syncs")).toBe(0);
    expect(await count("pending_ingestions")).toBe(0);
    expect(await count("deferred_ingestions")).toBe(0);
    // validation_state cleared.
    expect(await count("validation_state")).toBe(0);

    // --- assert: app_settings persists, pointers nulled, watched_folder_id unchanged ---
    const [settings] = await sql`
      select id, watched_folder_id, pending_wizard_session_id, pending_wizard_session_at,
             pending_folder_id, pending_folder_name, pending_folder_set_by_email, pending_folder_set_at
        from public.app_settings where id = 'default'`;
    expect(settings, "app_settings 'default' row must PERSIST").toBeTruthy();
    expect(settings!.watched_folder_id).toBe(watchedFolder); // UNCHANGED
    expect(settings!.pending_wizard_session_id).toBeNull();
    expect(settings!.pending_wizard_session_at).toBeNull();
    expect(settings!.pending_folder_id).toBeNull();
    expect(settings!.pending_folder_name).toBeNull();
    expect(settings!.pending_folder_set_by_email).toBeNull();
    expect(settings!.pending_folder_set_at).toBeNull();

    // --- assert: admin_emails preserved ---
    expect(await count("admin_emails", `where email = '${adminEmail}'`)).toBe(1);

    // cleanup the admin_emails sentinel (it's not validation data, the RPC won't).
    await sql`delete from public.admin_emails where email = ${adminEmail}`;
    void a;
    void b;
  });

  test("returns clearedShows: 0 on an already-empty database (idempotent re-run)", async () => {
    // After the first test cleared everything; a fresh reset over an empty DB is a no-op.
    const result = await callResetAsAdmin();
    expect(result.clearedShows).toBe(await count("shows")); // both 0
    expect(result.clearedShows).toBe(0);
  });
});
