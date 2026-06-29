/**
 * tests/db/resetValidationDataDriveKeyedAudit.test.ts (Task 2)
 *
 * Structural drive-keyed completeness audit for public.reset_validation_data().
 *
 * Every table carrying a `drive_file_id` column is per-show data that a
 * validation reset must account for. This test derives that table list FROM
 * THE LIVE DB at test time (information_schema.columns where
 * column_name='drive_file_id') and asserts each table is present in the
 * DRIVE_KEYED_REGISTRY below with an explicit, verifiable disposition:
 *
 *   - clear-via-cascade : the table is an ON DELETE CASCADE FK child of
 *       public.shows, so `delete from public.shows` clears it. VERIFIED here
 *       against pg_constraint (confdeltype='c').
 *   - clear-explicit    : not a cascade child (no FK, or SET NULL/NO ACTION);
 *       must appear in the RPC's explicit delete set. VERIFIED here against the
 *       migration text. (The shows parent itself is `clear-explicit` — it is
 *       deleted by `delete from public.shows`.)
 *   - preserve(reason)  : intentionally not cleared. VERIFIED to be absent from
 *       the explicit delete set.
 *
 * A future migration that adds a new drive_file_id table without registering a
 * disposition fails the completeness assertion. A registry entry whose claimed
 * mechanism no longer matches the DB/migration fails its verification assertion.
 *
 * Per spec §8 dispositions:
 *   clear-via-cascade: show_change_log, sync_holds, pending_snapshot_uploads,
 *                      shows_pending_changes, sync_log, sync_audit
 *   clear-explicit:    shows (parent), pending_syncs, pending_ingestions,
 *                      deferred_ingestions, onboarding_scan_manifest,
 *                      revision_race_cooldowns
 *   (sync_log/sync_audit are ALSO cascade children in this schema — classified
 *    clear-via-cascade by their truthful mechanism; they reach true empty-state
 *    via `delete from public.shows`.)
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";
import { latestResetValidationDataBody } from "./_resetRpcSource.js";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

type Disposition =
  | { kind: "clear-via-cascade" }
  | { kind: "clear-explicit" }
  | { kind: "preserve"; reason: string };

/**
 * The canonical disposition registry. Every table with a drive_file_id column
 * MUST appear here. The completeness assertion below cross-checks this map
 * against the live DB so a new drive_file_id table cannot slip through.
 */
const DRIVE_KEYED_REGISTRY: Record<string, Disposition> = {
  // The parent: deleted by `delete from public.shows`.
  shows: { kind: "clear-explicit" },
  // ON DELETE CASCADE children of shows — cleared by deleting shows.
  show_change_log: { kind: "clear-via-cascade" },
  sync_holds: { kind: "clear-via-cascade" },
  pending_snapshot_uploads: { kind: "clear-via-cascade" },
  shows_pending_changes: { kind: "clear-via-cascade" },
  sync_log: { kind: "clear-via-cascade" },
  sync_audit: { kind: "clear-via-cascade" },
  // Not cascade children (no FK to shows, or SET NULL) — must be explicit-deleted.
  pending_syncs: { kind: "clear-explicit" },
  pending_ingestions: { kind: "clear-explicit" },
  deferred_ingestions: { kind: "clear-explicit" },
  onboarding_scan_manifest: { kind: "clear-explicit" }, // SET NULL child — delete from shows only NULLs the FK
  revision_race_cooldowns: { kind: "clear-explicit" },
  // Ephemeral per-show agenda-extraction lease: NOT show/onboarding data — it is
  // transient operational state with a ~330s TTL, GC'd on every claim
  // (DELETE WHERE expires_at <= now()) and owner-released at tx#2. Any residue
  // self-clears within the TTL, so reset_validation_data() does not truncate it.
  agenda_extract_leases: {
    kind: "preserve",
    reason:
      "ephemeral extraction lease (~330s TTL, GC'd on every claim, owner-released at persist); self-clears via expires_at, not persistent show data, so a validation reset need not truncate it",
  },
};

/** Is `table` an ON DELETE CASCADE FK child of public.shows? */
async function isCascadeChildOfShows(table: string): Promise<boolean> {
  const rows = await sql<{ ok: boolean }[]>`
    select exists (
      select 1 from pg_constraint
       where conrelid = ${"public." + table}::regclass
         and confrelid = 'public.shows'::regclass
         and contype = 'f'
         and confdeltype = 'c'
    ) as ok`;
  return rows[0]?.ok ?? false;
}

describe("reset_validation_data() — drive-keyed completeness audit", () => {
  test("every table with a drive_file_id column is registered with a verified disposition", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'drive_file_id'
       order by table_name`;
    const driveKeyedTables = rows.map((r) => r.table_name).sort();

    // Completeness: every live drive_file_id table is in the registry, and vice-versa.
    const registered = Object.keys(DRIVE_KEYED_REGISTRY).sort();
    expect(
      driveKeyedTables,
      "DRIVE_KEYED_REGISTRY must list exactly the live drive_file_id tables (add/remove a row to match)",
    ).toEqual(registered);

    const body = latestResetValidationDataBody();

    for (const table of driveKeyedTables) {
      const disp = DRIVE_KEYED_REGISTRY[table]!;
      const explicitDeleteRe = new RegExp(`delete\\s+from\\s+public\\.${table}\\b`, "i");
      const inExplicitDeleteSet = explicitDeleteRe.test(body);

      if (disp.kind === "clear-via-cascade") {
        // VERIFY: it really IS an on-delete-cascade child of shows.
        expect(
          await isCascadeChildOfShows(table),
          `"${table}" is registered clear-via-cascade but is NOT an ON DELETE CASCADE FK child of shows`,
        ).toBe(true);
      } else if (disp.kind === "clear-explicit") {
        // VERIFY: it appears in the RPC's explicit delete set.
        expect(
          inExplicitDeleteSet,
          `"${table}" is registered clear-explicit but has no "delete from public.${table}" in reset_validation_data()`,
        ).toBe(true);
      } else {
        // preserve: VERIFY it is NOT explicit-deleted.
        expect(
          inExplicitDeleteSet,
          `"${table}" is registered preserve(${disp.reason}) but appears in the RPC delete set`,
        ).toBe(false);
      }
    }
  });

  test("revision_race_cooldowns (clean-reset regression) is explicit-deleted and reaches empty-state", async () => {
    // Seed a residue row, run the reset as admin, assert it is gone. revision_race_cooldowns
    // has NO FK to shows, so only an explicit delete clears it.
    await sql`update public.destructive_reset_gate set enabled = true where id = 'default'`;
    try {
      await sql`
        insert into public.revision_race_cooldowns (drive_file_id, raced_head_revision_id)
        values ('reset-audit-drive', 'rev-1')
        on conflict do nothing`;
      const before = await sql`select count(*)::int n from public.revision_race_cooldowns`;
      expect((before[0] as { n: number }).n).toBeGreaterThanOrEqual(1);

      const ADMIN_CLAIMS = JSON.stringify({
        sub: "00000000-0000-0000-0000-000000000020",
        email: "dlarson@fxav.net",
        app_metadata: { role: "admin" },
      });
      await sql.begin(async (tx) => {
        // service-role-only (hotfix 20260622000002): the wipe runs via the service-role
        // client; admin identity is enforced upstream by the action's session assert.
        await tx`select set_config('role', 'service_role', true)`;
        await tx`select set_config('request.jwt.claims', ${ADMIN_CLAIMS}, true)`;
        await tx`select public.reset_validation_data()`;
      });

      const after = await sql`select count(*)::int n from public.revision_race_cooldowns`;
      expect((after[0] as { n: number }).n).toBe(0);
    } finally {
      await sql`update public.destructive_reset_gate set enabled = false where id = 'default'`;
    }
  });
});
