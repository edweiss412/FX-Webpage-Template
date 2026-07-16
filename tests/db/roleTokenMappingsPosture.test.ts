/**
 * tests/db/roleTokenMappingsPosture.test.ts
 *   (spec 2026-07-15-extend-role-scope-vocab §3, Codex R2 F1 + R3 F1/F2)
 *
 * Two-sided read-posture proof for public.role_token_mappings. The table holds
 * the GLOBAL role-token vocabulary plus deciding-admin emails (decided_by); it
 * has NO client-session readers. Posture: RLS enabled with ZERO policies AND
 * SELECT/INSERT/UPDATE/DELETE revoked from anon+authenticated — either layer
 * may answer first, so an authenticated SELECT is denied OR empty (NEVER a
 * row). Every legitimate reader/writer is server-side service_role.
 *
 * Anti-tautology: this does not assert "a deny policy exists" — it seeds a row
 * as the privileged owner, then actually runs the SELECT under
 * set_config('role','authenticated') and asserts zero rows / denial, while the
 * privileged connection reads the same row back. The service-role round-trip
 * (insert -> select -> delete under set_config('role','service_role')) proves
 * the explicit `grant all ... to service_role` — so a privilege gap can't
 * masquerade as denial.
 *
 * DB-gated like the other tests/db/* files: uses TEST_DATABASE_URL / DATABASE_URL,
 * defaulting to the local stack. Real CI is the arbiter.
 */
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Privileged connection: connects as the DB owner (postgres). Bypasses RLS so it
// can seed + read the row the untrusted roles must NOT see.
const priv: Sql = postgres(DB_URL, { max: 2, prepare: false });

const SEED_TOKEN = `POSTURE ${randomUUID().slice(0, 8).toUpperCase()}`;
const SEED_DECIDED_BY = `posture-${randomUUID().slice(0, 8)}@test.local`;

const nonAdminClaims = () =>
  JSON.stringify({
    sub: "00000000-0000-0000-0000-000000000099",
    email: `role-token-posture-nonadmin-${randomUUID()}@example.com`,
  });

afterAll(async () => {
  await priv`delete from public.role_token_mappings where token = ${SEED_TOKEN}`;
  await priv.end({ timeout: 5 });
});

// Run a callback under a given role/claims inside a rolled-back transaction, and
// return whatever rows it saw. A grant-level REVOKE surfaces as a thrown
// "permission denied" — normalize that to "saw nothing" (denied is a pass).
async function runAs<T>(
  role: "anon" | "authenticated" | "service_role",
  claims: string | null,
  query: (tx: Sql) => Promise<T[]>,
): Promise<{ rows: T[]; denied: boolean }> {
  let rows: T[] = [];
  // `denied: true` is only ever produced by the early return in the catch below.
  const denied = false;
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
      const msg = String((err as Error).message ?? "");
      if (/permission denied/i.test(msg)) {
        return { rows: [], denied: true };
      }
      throw err;
    }
  }
  return { rows, denied };
}

describe("role_token_mappings read posture (spec §3)", () => {
  it("anti-tautology: the privileged connection CAN seed + read a row", async () => {
    await priv`
      insert into public.role_token_mappings (token, decided_by)
      values (${SEED_TOKEN}, ${SEED_DECIDED_BY})
      on conflict (token) do update set decided_by = excluded.decided_by
    `;
    const rows = await priv`
      select token, decided_by from public.role_token_mappings where token = ${SEED_TOKEN}
    `;
    expect(rows[0]?.token).toBe(SEED_TOKEN);
    expect(rows[0]?.decided_by).toBe(SEED_DECIDED_BY);
  });

  for (const role of ["anon", "authenticated"] as const) {
    it(`${role} SELECT leaks NO rows — denied OR empty are both conforming; NEVER a row`, async () => {
      const { rows } = await runAs(
        role,
        role === "authenticated" ? nonAdminClaims() : null,
        (tx) =>
          tx`select token, decided_by from public.role_token_mappings where token = ${SEED_TOKEN}`,
      );
      expect(rows).toHaveLength(0);
      expect(rows.map((r) => (r as { decided_by?: string }).decided_by)).not.toContain(
        SEED_DECIDED_BY,
      );
    });
  }

  it("service_role insert -> select -> delete round-trip succeeds", async () => {
    const rtToken = `POSTURE RT ${randomUUID().slice(0, 8).toUpperCase()}`;
    const rtDecidedBy = `posture-rt-${randomUUID().slice(0, 8)}@test.local`;
    // service_role holds the explicit `grant all` — the whole insert -> select ->
    // delete round-trip runs as service_role inside ONE rolled-back transaction
    // (so intermediate reads observe the write) and must NEVER be denied.
    const { rows, denied } = await runAs<{ step: string; token: string }>(
      "service_role",
      null,
      async (tx) => {
        const inserted = await tx`
          insert into public.role_token_mappings (token, decided_by)
          values (${rtToken}, ${rtDecidedBy})
          returning 'insert' as step, token
        `;
        const selected = await tx`
          select 'select' as step, token from public.role_token_mappings where token = ${rtToken}
        `;
        const deleted = await tx`
          delete from public.role_token_mappings where token = ${rtToken}
          returning 'delete' as step, token
        `;
        return [...inserted, ...selected, ...deleted] as { step: string; token: string }[];
      },
    );
    expect(denied).toBe(false);
    expect(rows.map((r) => r.step)).toEqual(["insert", "select", "delete"]);
    expect(rows.every((r) => r.token === rtToken)).toBe(true);
    // Ran inside a rolled-back transaction, so nothing persists; belt-and-
    // suspenders cleanup in case a future edit commits.
    await priv`delete from public.role_token_mappings where token = ${rtToken}`;
  });
});
