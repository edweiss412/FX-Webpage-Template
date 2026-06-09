/**
 * P5-F4 / PF40 — the feed's gate.baseModifiedTime is the OPAQUE optimistic-
 * concurrency token the MI-11 RPCs compare EXACTLY
 * (`base_modified_time IS DISTINCT FROM p_expected_base_modified_time`,
 * 20260608000002_mi11_gate_rpcs.sql:60 reject / :281 approve). It MUST preserve
 * full PostgreSQL microsecond precision. JS `Date` drops postgres microseconds
 * (`...123456Z` → `...123Z`), so routing the token through `toIso()`/`Date`
 * would render a value that the RPC sees as DISTINCT FROM the stored one →
 * falsely MI11_TARGET_MOVED, making an un-retargeted hold un-approvable /
 * un-rejectable forever.
 *
 * This test seeds a hold whose base_modified_time carries microseconds, reads
 * the gate token through readShowChangeFeed, and drives the full round-trip
 * into mi11_approve_hold AND mi11_reject_hold — asserting SUCCESS (not
 * MI11_TARGET_MOVED). Negative-regression: route the same token through
 * `new Date().toISOString()` → the round-trip REDs with MI11_TARGET_MOVED,
 * proving the truncation is the bug. All expectations derive from the seeded
 * value (anti-tautology).
 */
import { afterAll, describe, expect, it } from "vitest";

import type { TransactionSql } from "postgres";

import { readShowChangeFeed } from "@/lib/sync/feed/readShowChangeFeed";
import {
  asAdminTx,
  closeMi11Helpers,
  mi11Sql,
  seedCrew,
  seedShow,
} from "@/tests/db/_mi11Helpers";

// Call the MI-11 RPCs binding the timestamp args as ($N::text)::timestamptz so
// postgres.js does NOT coerce the bound string through JS `Date` (which drops
// microseconds — the very boundary this test pins). The PRODUCTION path
// (supabase.rpc → PostgREST → ::timestamptz) preserves microseconds; only the
// postgres.js test driver would truncate, so route the test through text.
async function callApproveExact(
  tx: TransactionSql,
  holdId: string,
  observed: string,
  expectedBase: string,
): Promise<{ ok: boolean; code?: string }> {
  const [row] = await tx.unsafe(
    `select public.mi11_approve_hold($1::uuid, ($2::text)::timestamptz, ($3::text)::timestamptz) as r`,
    [holdId, observed, expectedBase],
  );
  return (row as unknown as { r: { ok: boolean; code?: string } }).r;
}

async function callRejectExact(
  tx: TransactionSql,
  holdId: string,
  expectedBase: string,
): Promise<{ ok: boolean; code?: string }> {
  const [row] = await tx.unsafe(
    `select public.mi11_reject_hold($1::uuid, ($2::text)::timestamptz) as r`,
    [holdId, expectedBase],
  );
  return (row as unknown as { r: { ok: boolean; code?: string } }).r;
}

afterAll(async () => {
  await closeMi11Helpers();
});

// A base_modified_time with sub-millisecond (microsecond) precision: the
// trailing 456 is exactly what JS Date truncates.
const MICRO_BASE = "2026-06-09T12:00:00.123456+00";

async function seedMicrosecondHold(showId: string, driveFileId: string, entityKey: string) {
  // Mirror _mi11Helpers.seedHold exactly (full column list incl.
  // reservation_collisions), but bind base_modified_time as (TEXT)::timestamptz
  // so postgres.js does NOT pre-coerce the string through JS Date (which would
  // drop the very microseconds this test pins) before it reaches the cast.
  const [row] = (await mi11Sql`
    insert into public.sync_holds
      (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
       base_modified_time, kind, reservation_collisions, created_by)
    values (${showId}, ${driveFileId}, 'crew_email', ${entityKey},
            ${mi11Sql.json({ name: entityKey, email: "alice@old" })},
            ${mi11Sql.json({ disposition: "email_change", name: entityKey, email: "alice@new" })},
            (${MICRO_BASE}::text)::timestamptz, 'mi11_pending', ${mi11Sql.json([])}, 'system')
    returning id`) as unknown as Array<{ id: string }>;
  return row!.id as string;
}

// The stored value AS RENDERED to full microsecond precision (the canonical
// comparison target — derived from the DB, never hardcoded).
async function storedMicroIso(holdId: string): Promise<string> {
  const [row] = (await mi11Sql`
    select to_char(base_modified_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t
    from public.sync_holds where id = ${holdId}`) as unknown as Array<{ t: string }>;
  return row!.t as string;
}

// Normalize any timestamptz string to the canonical YYYY-...US"Z" form VIA THE
// DB (so +00:00 vs Z spelling doesn't matter, only the microseconds do). Uses
// .unsafe()/$1 param binding — postgres.js template params coerce a bare string
// to Date (dropping precision) before it reaches the cast, so bind it raw.
async function normViaDb(value: string): Promise<string> {
  const [row] = (await mi11Sql.unsafe(
    `select to_char(($1::text)::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`,
    [value],
  )) as unknown as Array<{ t: string }>;
  return row!.t as string;
}

describe("readShowChangeFeed gate.baseModifiedTime preserves microseconds (P5-F4/PF40)", () => {
  it("gate token == stored full-precision base_modified_time (NOT millisecond-truncated)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const holdId = await seedMicrosecondHold(show.showId, show.driveFileId, "Alice");

    const { entries } = await readShowChangeFeed(show.showId);
    const pending = entries.find((e) => e.status === "pending");
    expect(pending?.gate?.holdId).toBe(holdId);

    const token = pending!.gate!.baseModifiedTime!;
    const storedFull = await storedMicroIso(holdId); // e.g. ...123456Z
    // The token must carry the SAME microseconds as the stored value.
    const tokenNorm = await normViaDb(token);
    expect(tokenNorm).toBe(storedFull);
    // Explicit truncation guard: the token must retain the 6th fractional digit.
    expect(storedFull).toContain("123456");
    expect(tokenNorm).toContain("123456");
    // And it must NOT equal the millisecond-truncated form Date would produce.
    expect(new Date(token).toISOString()).not.toBe(tokenNorm);

    await mi11Sql`delete from public.shows where id = ${show.showId}`;
  });

  it("the gate token round-trips through mi11_approve_hold WITHOUT MI11_TARGET_MOVED", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const holdId = await seedMicrosecondHold(show.showId, show.driveFileId, "Alice");

    const { entries } = await readShowChangeFeed(show.showId);
    const token = entries.find((e) => e.status === "pending")!.gate!.baseModifiedTime!;
    const storedFull = await storedMicroIso(holdId);

    // observed == base (no Drive move); expected == the feed-rendered token.
    const res = await asAdminTx((tx) => callApproveExact(tx, holdId, storedFull, token));
    expect(res).toEqual({ ok: true }); // NOT { ok:false, code:'MI11_TARGET_MOVED' }

    await mi11Sql`delete from public.shows where id = ${show.showId}`;
  });

  it("the gate token round-trips through mi11_reject_hold WITHOUT MI11_TARGET_MOVED", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    await seedMicrosecondHold(show.showId, show.driveFileId, "Alice");

    const { entries } = await readShowChangeFeed(show.showId);
    const token = entries.find((e) => e.status === "pending")!.gate!.baseModifiedTime!;

    const res = await asAdminTx((tx) => callRejectExact(tx, entries.find((e) => e.status === "pending")!.gate!.holdId, token));
    expect(res).toEqual({ ok: true }); // NOT MI11_TARGET_MOVED

    await mi11Sql`delete from public.shows where id = ${show.showId}`;
  });

  it("NEGATIVE-REGRESSION: a Date-truncated token DOES hit MI11_TARGET_MOVED (proves the truncation is the bug)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const holdId = await seedMicrosecondHold(show.showId, show.driveFileId, "Alice");

    const { entries } = await readShowChangeFeed(show.showId);
    const token = entries.find((e) => e.status === "pending")!.gate!.baseModifiedTime!;
    const storedFull = await storedMicroIso(holdId);

    // Routing the token through Date drops microseconds → the RPC sees it as
    // distinct from the stored ...123456Z → MI11_TARGET_MOVED.
    const truncated = new Date(token).toISOString(); // ...123Z
    const res = await asAdminTx((tx) => callApproveExact(tx, holdId, storedFull, truncated));
    expect(res).toEqual({ ok: false, code: "MI11_TARGET_MOVED" });

    await mi11Sql`delete from public.shows where id = ${show.showId}`;
  });
});
