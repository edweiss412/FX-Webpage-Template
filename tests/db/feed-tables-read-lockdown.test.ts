/**
 * tests/db/feed-tables-read-lockdown.test.ts (Phase 1 Task 1.4 — spec §4.1 / §6.1 finding F9)
 *
 * sync_holds + show_change_log carry crew PII (email in held_value/proposed_value;
 * email/phone/role/... in before_image/after_image). They are admin-only / server-only:
 * RLS enabled, NO anon/authenticated SELECT. This test SEEDS one row in each table as a
 * privileged connection, then proves a `set_config('role','authenticated')` (non-admin
 * claims) and `set_config('role','anon')` SELECT returns ZERO rows / is denied — including
 * an explicit attempt to read before_image — while the privileged connection reads them.
 *
 * Anti-tautology: the assertion is not "a deny policy exists" — it actually runs the SELECT
 * as the untrusted role and asserts no row / no PII leaks back.
 */
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Privileged connection: connects as the DB owner (postgres) / service_role-equivalent.
// It bypasses RLS so it can seed + read the rows the untrusted roles must NOT see.
const priv: Sql = postgres(DB_URL, { max: 2, prepare: false });

const SECRET_EMAIL = `secret-${randomUUID()}@example.invalid`;
let showId = "";
let holdId = "";
let logId = "";

const nonAdminClaims = () =>
  JSON.stringify({
    sub: "00000000-0000-0000-0000-000000000099",
    email: `read-lockdown-nonadmin-${randomUUID()}@example.com`,
  });

beforeAll(async () => {
  const [show] = await priv`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${`drv-${randomUUID()}`}, ${`sh-${randomUUID().slice(0, 8)}`}, 'T', 'c', 'v')
    returning id
  `;
  showId = show.id as string;
  const [hold] = await priv`
    insert into public.sync_holds
      (show_id, drive_file_id, domain, entity_key, held_value,
       proposed_value, base_modified_time, kind, created_by)
    values (${showId}, 'drv', 'crew_email', 'Alice',
            ${priv.json({ email: SECRET_EMAIL, name: "Alice" })},
            ${priv.json({ disposition: "email_change", name: "Alice", email: "a@new" })},
            now(), 'mi11_pending', 'system')
    returning id
  `;
  holdId = hold.id as string;
  const [log] = await priv`
    insert into public.show_change_log
      (show_id, drive_file_id, source, change_kind, summary, before_image, after_image, status)
    values (${showId}, 'drv', 'auto_apply', 'crew_removed', 'removed Alice',
            ${priv.json({ email: SECRET_EMAIL, phone: "555" })}, ${priv.json({})}, 'applied')
    returning id
  `;
  logId = log.id as string;
});

afterAll(async () => {
  // Tear down seeded rows (cascades clean child rows via show delete).
  await priv`delete from public.shows where id = ${showId}`;
  await priv.end({ timeout: 5 });
});

// Run a SELECT as a given role/claims and return the rows it can see.
async function selectAs<T>(
  role: "anon" | "authenticated",
  claims: string | null,
  query: (tx: Sql) => Promise<T[]>,
): Promise<T[]> {
  let rows: T[] = [];
  const ROLLBACK = Symbol("rollback");
  try {
    await priv.begin(async (tx) => {
      await tx`select set_config('role', ${role}, true)`;
      if (claims) await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      rows = await query(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) {
      // A grant-level REVOKE surfaces as a thrown "permission denied" — that is
      // ALSO a pass (denied, not zero-rows). Normalize both to "saw nothing".
      const msg = String((err as Error).message ?? "");
      if (/permission denied/i.test(msg)) {
        return [];
      }
      throw err;
    }
  }
  return rows;
}

describe("feed tables are admin-only / server-only (F9)", () => {
  it("the privileged connection CAN read the seeded rows (anti-tautology: data exists)", async () => {
    const holds = await priv`
      select held_value->>'email' as email from public.sync_holds where id = ${holdId}
    `;
    const logs = await priv`
      select before_image->>'email' as email from public.show_change_log where id = ${logId}
    `;
    expect(holds[0]?.email).toBe(SECRET_EMAIL);
    expect(logs[0]?.email).toBe(SECRET_EMAIL);
  });

  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} SELECT on sync_holds returns no rows / is denied (incl. held_value PII)`, async () => {
      const rows = await selectAs(role, role === "authenticated" ? nonAdminClaims() : null, (tx) =>
        tx`select id, held_value->>'email' as email from public.sync_holds where id = ${holdId}`,
      );
      expect(rows).toHaveLength(0);
      expect(rows.map((r) => (r as { email?: string }).email)).not.toContain(SECRET_EMAIL);
    });

    it(`${role} SELECT on show_change_log returns no rows / is denied (incl. before_image PII)`, async () => {
      const rows = await selectAs(role, role === "authenticated" ? nonAdminClaims() : null, (tx) =>
        tx`select id, before_image->>'email' as email from public.show_change_log where id = ${logId}`,
      );
      expect(rows).toHaveLength(0);
      expect(rows.map((r) => (r as { email?: string }).email)).not.toContain(SECRET_EMAIL);
    });
  }
});
