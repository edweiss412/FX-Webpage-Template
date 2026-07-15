/**
 * tests/db/geocodeCacheCoordExpiry.test.ts
 *
 * Pins migration 20260715000000_geocode_cache_reset_and_expire.sql's one-shot
 * DO block (spec docs/superpowers/specs/2026-07-15-geocode-cache-legacy-coords.md §3.1):
 *   1. structural: lock-table fence BEFORE the fuse count; fused UPDATE with a real
 *      WHERE (safeupdate); past-shifted expiry (now() - interval '1 day').
 *   2. behavioral fuse: >1000 fresh coord-less rows → RAISE, zero rows mutated
 *      (a DO block is a single statement — its failure is atomic, so no wrapper
 *      transaction is needed to guarantee the no-mutation assertion).
 *   3. behavioral expiry: both coord-less shapes (city set / city NULL) expire into
 *      the past; a coords-bearing sibling keeps its future expiry. Runs INSIDE a
 *      rolled-back transaction so the block's global effect (it matches EVERY fresh
 *      coord-less row, not just fixtures) never leaks into the shared local DB.
 *   4. miss-path integration proof (spec test 5): the REAL readGeocodeCache — the
 *      supabase-js service-role client against local PostgREST (SUPABASE_URL pinned
 *      to 127.0.0.1:54321 below; createSupabaseServiceRoleClient falls back to the
 *      local demo service key, lib/supabase/server.ts:80-90) — returns
 *      { kind: "miss" } for a row expired with the migration's exact shift, and a
 *      hit for the coords-bearing sibling. (Committed seed rows, prefix-cleaned;
 *      the DO block itself is not re-run here — test 3 proves the block produces
 *      exactly this expires_at shift, test 1 pins the shift constant in the source.)
 */
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql } from "postgres";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// SAFETY: tests 2-4 write to public.geocode_cache — never run against a remote DB
// (same guard shape as tests/db/resetValidationDataPostgrest.test.ts:32-40; message
// redacts credentials — the guard fires exactly when a secret-bearing URL leaked).
function redactedDbHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "<unparseable>";
  }
}
const LOCAL_DB_URL_REGEX =
  /^postgres(?:ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i;
if (!LOCAL_DB_URL_REGEX.test(DB_URL)) {
  throw new Error(
    `geocodeCacheCoordExpiry.test.ts: TEST_DATABASE_URL host '${redactedDbHost(DB_URL)}' is not local — refusing.`,
  );
}

// Force the Supabase READ boundary to the same local instance the fixtures are
// written to: readGeocodeCache builds its client from ambient SUPABASE_URL at call
// time (lib/supabase/server.ts:80-90). In an env-sourced shell that could silently
// point at validation/prod — pin it to local PostgREST + the demo service key
// fallback (same posture as resetValidationDataPostgrest.test.ts:42-45).
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import { readGeocodeCache } from "@/lib/geocoding/cache";

const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260715000000_geocode_cache_reset_and_expire.sql",
);

/** The migration's one-shot expiry DO block, extracted verbatim. */
function expiryDoBlock(): string {
  const source = readFileSync(MIGRATION, "utf8");
  const m = source.match(/do \$\$[\s\S]*?end \$\$;/i);
  if (!m) throw new Error("no DO block found in 20260715000000 migration");
  return m[0];
}

const PREFIX = "test-coord-expiry-";
afterEach(async () => {
  await sql`delete from public.geocode_cache where query_hash like ${PREFIX + "%"}`;
});
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("20260715000000 one-shot coord-less expiry DO block", () => {
  test("structural pin: lock fence before the fuse count, fused UPDATE with real WHERE, past-shifted expiry", () => {
    const block = expiryDoBlock();
    const lockAt = block.search(/lock table public\.geocode_cache in share row exclusive mode/i);
    const countAt = block.search(/select count\(\*\)/i);
    const updateAt = block.search(/update public\.geocode_cache/i);
    expect(lockAt, "lock-table fence must exist (R6 fuse atomicity)").toBeGreaterThan(-1);
    expect(countAt, "fuse count must exist (R5)").toBeGreaterThan(-1);
    expect(updateAt, "expiry UPDATE must exist").toBeGreaterThan(-1);
    expect(lockAt, "fence must precede the count (READ COMMITTED divergence)").toBeLessThan(
      countAt,
    );
    expect(countAt, "count must precede the UPDATE (fuse-before-mutate)").toBeLessThan(updateAt);
    expect(block).toMatch(/raise exception/i); // the fuse aborts, not warns
    // Past-shifted expiry (R8 clock skew) with a WHERE on both statements (safeupdate).
    expect(block).toMatch(/set expires_at = now\(\) - interval '1 day'/i);
    expect(block).toMatch(/where \(lat is null or lng is null\)\s*and expires_at > now\(\)/i);
  });

  test("fuse: >1000 fresh coord-less rows abort with zero mutation", async () => {
    // 1001 coord-less rows trip the 1000-row fuse (spec §3.1 R5). A DO block is one
    // statement: its RAISE aborts atomically, so no real row is mutated either.
    await sql.unsafe(`
      insert into public.geocode_cache (query_hash, venue_name, city, lat, lng, expires_at)
      select '${PREFIX}fuse-' || g, 'Fuse Venue ' || g, 'Chicago', null, null, now() + interval '10 days'
        from generate_series(1, 1001) g
    `);
    await expect(sql.unsafe(expiryDoBlock())).rejects.toThrow(/exceeds the 1000-row fuse/i);
    const [row] = await sql`
      select count(*)::int as n from public.geocode_cache
       where query_hash like ${PREFIX + "%"} and expires_at > now()
    `;
    expect((row as { n: number }).n, "abort must leave every seeded row unexpired").toBe(1001);
  });

  test("expiry: both coord-less shapes expire into the past; coords-bearing sibling untouched (rolled back)", async () => {
    const ROLLBACK_MSG = "assertions done — roll back";
    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into public.geocode_cache (query_hash, venue_name, city, lat, lng, expires_at)
          values
            (${PREFIX + "legacy-city"}, 'Legacy City Venue', 'Chicago', null, null, now() + interval '10 days'),
            (${PREFIX + "legacy-nullcity"}, 'Legacy NullCity Venue', null, null, null, now() + interval '10 days'),
            (${PREFIX + "healthy"}, 'Healthy Venue', 'Chicago', 41.88, -87.63, now() + interval '10 days')
        `;
        await tx.unsafe(expiryDoBlock());
        const rows = await tx<{ query_hash: string; expired: boolean; future: boolean }[]>`
          select query_hash,
                 expires_at < now() - interval '12 hours' as expired,
                 expires_at > now() as future
            from public.geocode_cache
           where query_hash like ${PREFIX + "%"}
           order by query_hash
        `;
        const byHash = Object.fromEntries(rows.map((r) => [r.query_hash, r]));
        // Past-shifted well beyond any plausible app/DB clock skew (R8: 1 day > 12h check).
        expect(byHash[PREFIX + "legacy-city"]?.expired, "city-set legacy row must expire").toBe(
          true,
        );
        expect(
          byHash[PREFIX + "legacy-nullcity"]?.expired,
          "null-city legacy row must expire (goal 3)",
        ).toBe(true);
        expect(
          byHash[PREFIX + "healthy"]?.future,
          "coords-bearing row must keep future expiry",
        ).toBe(true);
        // The block's global reach (every fresh coord-less row in the DB) must NOT
        // leak into the shared local DB — force a rollback.
        throw new Error(ROLLBACK_MSG);
      }),
    ).rejects.toThrow(ROLLBACK_MSG);
    // Rollback proof: the fixtures are gone without afterEach having run yet.
    const [row] = await sql`
      select count(*)::int as n from public.geocode_cache where query_hash like ${PREFIX + "%"}
    `;
    expect((row as { n: number }).n, "transaction must have rolled back").toBe(0);
  });

  test("miss-path integration proof: real readGeocodeCache misses the expired row, hits the sibling", async () => {
    // Seed the EXACT post-expiry shape the DO block writes (test 3 proves the block
    // produces this shift; test 1 pins the constant in the migration source).
    await sql`
      insert into public.geocode_cache (query_hash, venue_name, city, lat, lng, expires_at)
      values
        (${PREFIX + "miss"}, 'Miss Venue', 'Chicago', null, null, now() - interval '1 day'),
        (${PREFIX + "hit"}, 'Hit Venue', 'Chicago', 41.88, -87.63, now() + interval '10 days')
    `;
    // REAL Supabase read boundary: local PostgREST + demo service key fallback.
    const missRead = await readGeocodeCache(PREFIX + "miss");
    const hitRead = await readGeocodeCache(PREFIX + "hit");
    expect(missRead, "expired coord-less row must read as a MISS").toEqual({ kind: "miss" });
    expect(hitRead.kind, "coords-bearing sibling must still read as a HIT").toBe("hit");
    if (hitRead.kind === "hit") {
      expect(hitRead.city).toBe("Chicago");
      expect(hitRead.lat).toBe(41.88);
      expect(hitRead.lng).toBe(-87.63);
    }
  });
});
