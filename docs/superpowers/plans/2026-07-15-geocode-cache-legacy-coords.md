# Geocode-cache legacy coords expiry + reset coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship migration `20260715000000_geocode_cache_reset_and_expire.sql` — the reset RPC gains a `geocode_cache` delete, and a fused one-shot DO block expires every fresh coord-less cache row — plus the realdb tests pinning both.

**Architecture:** Single migration file, zero runtime-code changes (spec §3.1 R3 pivot). Two test surfaces: an extension to the existing reset-RPC realdb test, and a new realdb file exercising the DO block extracted verbatim from the migration.

**Tech Stack:** Postgres (plpgsql DO block, `lock table`, safeupdate discipline), postgres.js realdb tests (vitest serial project), existing `tests/db/_resetRpcSource.ts` auto-discovery.

**Spec:** `docs/superpowers/specs/2026-07-15-geocode-cache-legacy-coords.md` (adversarially approved R15). The spec is canonical; this plan implements it 1:1.

## Global Constraints

- Conventional commit per task (invariant 6); `--no-verify` in this worktree, so run `pnpm format:check` + `pnpm lint` + `pnpm typecheck` before push (Stage 4).
- Every DELETE/UPDATE in the RPC/DO block carries a real WHERE clause (safeupdate, per `20260622000003`).
- No runtime file may change: `lib/**` untouched (spec goal 3). If a step seems to need a `lib/` edit, STOP — that's a spec violation.
- Migration is the LATEST definer of `reset_validation_data()` → `tests/db/_resetRpcSource.ts` auto-points every body audit at it; do not hardcode the filename anywhere else.
- Local DB for tests is loopback `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (vitest does not load `.env.local`; `TEST_DATABASE_URL` fallback in `tests/db/resetValidationData.test.ts:28-31`).

## Meta-test inventory (mandatory declaration)

- **Extends:** `tests/db/resetValidationData.test.ts` (behavioral reset coverage).
- **Creates:** `tests/db/geocodeCacheCoordExpiry.test.ts` (structural pin + behavioral DO-block coverage; walks the migration file by content, not a hardcoded latest-name).
- **Auto-covering (no edits needed, must stay green):** `resetValidationDataFkAudit` / `resetValidationDataDriveKeyedAudit` / `advisoryLockRpcDeadlock` / `resetValidationDataPostgrest` / `resetValidationDataConcurrency` / `destructiveResetGate` — all read the latest RPC body via `_resetRpcSource.ts`. `_metaInfraContract` / observe read-only meta: surfaces untouched.
- **None applies for:** Supabase call-boundary registry (no new call sites), mutation-surface observability (no new route/action), sentinel-hiding, admin-alert catalog.

## Advisory-lock holder topology (mandatory declaration)

`reset_validation_data()` remains the SINGLE in-RPC holder of `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` over the union of shows/pending_syncs/pending_ingestions/deferred_ingestions keys — body copied verbatim from `20260622000003`, key set unchanged (`geocode_cache` has no `drive_file_id`). No JS-side or nested SECURITY DEFINER holder is added. `tests/auth/advisoryLockRpcDeadlock.test.ts` pins this against the new file automatically.

---

### Task 1: Migration + realdb tests (TDD)

**Files:**
- Create: `supabase/migrations/20260715000000_geocode_cache_reset_and_expire.sql`
- Create: `tests/db/geocodeCacheCoordExpiry.test.ts`
- Modify: `tests/db/resetValidationData.test.ts` (add geocode_cache seed + post-reset assertion)

**Interfaces:**
- Consumes: `latestResetValidationDataBody()` from `tests/db/_resetRpcSource.ts`; the `sql`/`count`/`seedShowGraph`/`callResetAsServiceRole` helpers already in `resetValidationData.test.ts`.
- Produces: the migration file (later tasks apply it to validation); test file `tests/db/geocodeCacheCoordExpiry.test.ts` exporting nothing (pure test).

- [ ] **Step 1: Extend the reset realdb test (failing first).** In `tests/db/resetValidationData.test.ts`:

(a) **Add the local-only refusal guard first** (P-R3: this file enables the destructive
gate and calls `reset_validation_data()`, but unlike `resetValidationDataPostgrest.test.ts:32-40`
it has NO remote-URL refusal — an env-sourced shell leaking the validation
`TEST_DATABASE_URL` into vitest would aim a destructive reset at validation). Insert
directly after the `DB_URL` constant (`tests/db/resetValidationData.test.ts:28-31`),
copying the existing guard's shape but with a credential-redacting message (P-R8: the
guard fires exactly when a credential-bearing remote URL leaked — never echo it):

```ts
// SAFETY: this test WIPES all shows via the reset RPC — never run it against a remote DB
// (same guard shape as tests/db/resetValidationDataPostgrest.test.ts, message redacted).
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
    `resetValidationData.test.ts: TEST_DATABASE_URL host '${redactedDbHost(DB_URL)}' is not local. ` +
      "reset_validation_data() wipes ALL shows — refusing to run against a remote URL.",
  );
}
```

(b) Find the main post-reset assertion block (the `test(...)` that calls `callResetAsServiceRole()` and asserts `count(...) === 0` for the residue tables) and add a geocode_cache seed before the reset + an assertion after. Seed (place alongside the existing seeds, before the RPC call):

```ts
// geocode_cache: venue-keyed quota cache — reset must clear it (spec 2026-07-15 §3.2).
// Seed both a coord-less legacy shape and a coords-bearing row; BOTH must be deleted.
await sql`
  insert into public.geocode_cache
    (query_hash, venue_name, venue_address, city, lat, lng, expires_at)
  values
    (${"test-reset-legacy-" + driveFileId}, 'Legacy Venue', '', 'Chicago', null, null, now() + interval '10 days'),
    (${"test-reset-coords-" + driveFileId}, 'Coords Venue', '', 'Chicago', 41.88, -87.63, now() + interval '10 days')
`;
```

Assertion (with the other post-reset `count` assertions):

```ts
expect(await count("geocode_cache")).toBe(0);
```

- [ ] **Step 2: Run it to verify it fails.**

Run: `pnpm vitest run tests/db/resetValidationData.test.ts`
Expected: FAIL — `expected 2 to be 0` (current RPC does not delete geocode_cache).

- [ ] **Step 3: Write the new expiry test file (failing).** Create `tests/db/geocodeCacheCoordExpiry.test.ts`:

```ts
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
 *      supabase-js service-role client against local PostgREST (vitest env is unset,
 *      so createSupabaseServiceRoleClient falls back to http://127.0.0.1:54321 + the
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
import { readGeocodeCache } from "@/lib/geocoding/cache";

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
    expect(lockAt, "fence must precede the count (READ COMMITTED divergence)").toBeLessThan(countAt);
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
      select '${"${PREFIX}"}fuse-' || g, 'Fuse Venue ' || g, 'Chicago', null, null, now() + interval '10 days'
        from generate_series(1, 1001) g
    `);
    await expect(sql.unsafe(expiryDoBlock())).rejects.toThrow(/exceeds the 1000-row fuse/i);
    const [row] = await sql`
      select count(*)::int as n from public.geocode_cache
       where query_hash like ${"${PREFIX + \"%\"}"} and expires_at > now()
    `;
    expect((row as { n: number }).n, "abort must leave every seeded row unexpired").toBe(1001);
  });

  test("expiry: both coord-less shapes expire into the past; coords-bearing sibling untouched (rolled back)", async () => {
    const ROLLBACK = new Error("assertions done — roll back");
    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into public.geocode_cache (query_hash, venue_name, city, lat, lng, expires_at)
          values
            (${"${PREFIX + \"legacy-city\"}"}, 'Legacy City Venue', 'Chicago', null, null, now() + interval '10 days'),
            (${"${PREFIX + \"legacy-nullcity\"}"}, 'Legacy NullCity Venue', null, null, null, now() + interval '10 days'),
            (${"${PREFIX + \"healthy\"}"}, 'Healthy Venue', 'Chicago', 41.88, -87.63, now() + interval '10 days')
        `;
        await tx.unsafe(expiryDoBlock());
        const rows = await tx<{ query_hash: string; expired: boolean; future: boolean }[]>`
          select query_hash,
                 expires_at < now() - interval '12 hours' as expired,
                 expires_at > now() as future
            from public.geocode_cache
           where query_hash like ${"${PREFIX + \"%\"}"}
           order by query_hash
        `;
        const byHash = Object.fromEntries(rows.map((r) => [r.query_hash, r]));
        // Past-shifted well beyond any plausible app/DB clock skew (R8: 1 day > 12h check).
        expect(byHash[PREFIX + "legacy-city"]?.expired, "city-set legacy row must expire").toBe(true);
        expect(byHash[PREFIX + "legacy-nullcity"]?.expired, "null-city legacy row must expire (goal 3)").toBe(true);
        expect(byHash[PREFIX + "healthy"]?.future, "coords-bearing row must keep future expiry").toBe(true);
        // The block's global reach (every fresh coord-less row in the DB) must NOT
        // leak into the shared local DB — force a rollback.
        throw ROLLBACK;
      }),
    ).rejects.toThrow(ROLLBACK.message);
    // Rollback proof: the fixtures are gone without afterEach having run yet.
    const [row] = await sql`
      select count(*)::int as n from public.geocode_cache where query_hash like ${"${PREFIX + \"%\"}"}
    `;
    expect((row as { n: number }).n, "transaction must have rolled back").toBe(0);
  });

  test("miss-path integration proof: real readGeocodeCache misses the expired row, hits the sibling", async () => {
    // Seed the EXACT post-expiry shape the DO block writes (test 3 proves the block
    // produces this shift; test 1 pins the constant in the migration source).
    await sql`
      insert into public.geocode_cache (query_hash, venue_name, city, lat, lng, expires_at)
      values
        (${"${PREFIX + \"miss\"}"}, 'Miss Venue', 'Chicago', null, null, now() - interval '1 day'),
        (${"${PREFIX + \"hit\"}"}, 'Hit Venue', 'Chicago', 41.88, -87.63, now() + interval '10 days')
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
```

Note for the implementer: the `${"${...}"}` fragments above are postgres.js tagged-template parameters — write them literally as `${PREFIX + "fuse-"}` etc. in the real file (the plan escapes them only to survive this markdown block).

- [ ] **Step 4: Run it to verify it fails.**

Run: `pnpm vitest run tests/db/geocodeCacheCoordExpiry.test.ts`
Expected: FAIL — every test throws `ENOENT ... 20260715000000_geocode_cache_reset_and_expire.sql` (migration doesn't exist yet).

- [ ] **Step 5: Write the migration.** Create `supabase/migrations/20260715000000_geocode_cache_reset_and_expire.sql`. The function body is the `20260622000003` body VERBATIM plus exactly one added DELETE line — do not re-derive it; copy from `supabase/migrations/20260622000003_validation_reset_safeupdate.sql:30-121` and add the marked line:

```sql
-- Spec docs/superpowers/specs/2026-07-15-geocode-cache-legacy-coords.md (approved R15).
--
-- Two fixes in one migration:
--
-- (1) reset_validation_data() gains `delete from public.geocode_cache` — the RPC
--     (20260622000001) predates the geocode_cache table (20260627000001) by 5 days,
--     so "Reset validation data" silently preserved cache rows (omission by timing).
--     geocode_cache has no drive_file_id and no FK to shows: the advisory-lock key
--     set is UNCHANGED (single in-RPC holder, tests/auth/advisoryLockRpcDeadlock),
--     and the delete sits with the other clear-explicit residue. Trade-off: a reset
--     costs a handful of Google geocode calls on the next scan; virgin state wins.
--     Concurrency scope (spec §3.2): venue enrichment writes geocode_cache OUTSIDE
--     the per-show advisory-lock window, so a reset racing an in-flight scan may be
--     followed by re-inserted cache rows — accepted (quota cache, self-correcting).
--
-- (2) One-shot expiry of every FRESH coord-less cache row. Rows geocoded before the
--     coords columns existed (20260709000000) carry city + NULL lat/lng and stay
--     "fresh" for their 30-day TTL; the unchanged read path treats a fresh hit as
--     terminal, so affected venues emit VENUE_TIMEZONE_UNRESOLVED on every parse
--     until 2026-07-28 (observed: all 7 validation staged parses, 6 cache rows).
--     Expiring them makes the next read a MISS → the existing cold path re-geocodes
--     with coords. Null-city rows are expired too (pre-coords ZERO_RESULTS and
--     OK-but-no-locality are indistinguishable): one re-geocode each, then terminal.
--     * lock table … share row exclusive: fences concurrent service-role cache
--       writes so the fuse's counted set IS the mutated set (READ COMMITTED would
--       otherwise let the UPDATE see rows committed after the count).
--     * 1000-row fuse: aborts the apply (zero mutation) if the blast radius is
--       implausibly large; observed cardinality is 6 rows on validation.
--     * expiry lands a full day in the PAST so an app clock lagging the DB clock
--       can never re-read the row as a hit (readGeocodeCache compares against the
--       app's new Date().toISOString()).
--     One-shot execution is owned by schema_migrations / the recorded surgical
--     validation apply. A manual RE-apply is NOT a strict no-op (it would expire
--     coord-less rows written after the first apply — bounded but wasteful).

-- ---------------------------------------------------------------------------
-- (2) one-shot expiry — runs BEFORE the function replacement so a failed fuse
-- stops the apply before anything lands. NOTE: plain `psql -f` autocommits per
-- statement — every surgical apply MUST use `psql --single-transaction` so a
-- fuse abort rolls back the whole file (the supabase CLI migration runner is
-- transactional per file already).
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
begin
  -- Fuse atomicity (spec R6): fence concurrent cache writes for the block's
  -- few milliseconds so the counted set is exactly the mutated set.
  lock table public.geocode_cache in share row exclusive mode;
  -- Blast-radius fuse (spec R5): enforced IN the transaction.
  select count(*) into n
    from public.geocode_cache
   where (lat is null or lng is null)
     and expires_at > now();
  if n > 1000 then
    raise exception
      'geocode_cache one-shot expiry: % coord-less rows exceeds the 1000-row fuse — batch the expiry instead of applying blind',
      n;
  end if;
  update public.geocode_cache
     set expires_at = now() - interval '1 day'
   where (lat is null or lng is null)
     and expires_at > now();
  get diagnostics n = row_count;
  raise notice 'geocode_cache one-shot expiry: % coord-less row(s) expired', n;
end $$;

-- ---------------------------------------------------------------------------
-- (1) reset_validation_data(): 20260622000003 body + the geocode_cache delete.
-- ---------------------------------------------------------------------------
create or replace function public.reset_validation_data() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_did text;
  v_cleared bigint;
begin
  if not coalesce((select enabled from public.destructive_reset_gate where id = 'default'), false) then
    raise exception 'destructive reset not enabled for this database';
  end if;

  -- Invariant 2: sorted single-holder per-show advisory locks over the distinct
  -- affected-key set, BEFORE any mutation. No nested SECURITY DEFINER re-acquire.
  for v_did in
    select drive_file_id
      from (
        select drive_file_id from public.shows
        union
        select drive_file_id from public.pending_syncs
        union
        select drive_file_id from public.pending_ingestions
        union
        select drive_file_id from public.deferred_ingestions
      ) u
     where drive_file_id is not null
     order by drive_file_id
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || v_did));
  end loop;

  select count(*) into v_cleared from public.shows;

  -- Every DELETE carries `where ctid is not null` (delete-all that safeupdate accepts).
  -- Non-cascade FK child (NO ACTION) — MUST precede `delete from public.shows`.
  delete from public.reports where ctid is not null;

  -- Cascade clears all on-delete-cascade children.
  delete from public.shows where ctid is not null;

  -- Clear-explicit: no FK to shows (or SET NULL) — not reached by the cascade.
  delete from public.pending_syncs where ctid is not null;
  delete from public.pending_ingestions where ctid is not null;
  delete from public.deferred_ingestions where ctid is not null;
  delete from public.onboarding_scan_manifest where ctid is not null;
  delete from public.revision_race_cooldowns where ctid is not null;
  delete from public.wizard_finalize_checkpoints where ctid is not null;
  -- Venue-keyed geocode quota cache (no drive_file_id, no FK to shows): virgin
  -- state includes it (spec 2026-07-15 §3.2). Costs one re-geocode per venue on
  -- the next scan.
  delete from public.geocode_cache where ctid is not null;

  -- Validation seed singleton.
  delete from public.validation_state where ctid is not null;

  -- Preserve the app_settings row; null only the pending pointers. watched_folder_id
  -- and every other column are left UNCHANGED. (Already qualified — safeupdate-safe.)
  update public.app_settings set
    pending_wizard_session_id = null,
    pending_wizard_session_at = null,
    pending_folder_id = null,
    pending_folder_name = null,
    pending_folder_set_by_email = null,
    pending_folder_set_at = null
  where id = 'default';

  return jsonb_build_object('clearedShows', v_cleared);
end;
$$;

-- Service-role-only (unchanged from 20260622000002/000003): re-asserted so this
-- migration is self-contained on any apply order.
revoke all on function public.reset_validation_data() from public, anon, authenticated;
grant execute on function public.reset_validation_data() to service_role;
```

- [ ] **Step 6: Apply the migration to the LOCAL DB.**

Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20260715000000_geocode_cache_reset_and_expire.sql`
Expected: `NOTICE:  geocode_cache one-shot expiry: N coord-less row(s) expired` (N ≥ 0), `CREATE FUNCTION`, `REVOKE`, `GRANT` — exit 0.

- [ ] **Step 7: Run both test files to verify they pass.**

Run: `pnpm vitest run tests/db/resetValidationData.test.ts tests/db/geocodeCacheCoordExpiry.test.ts`
Expected: PASS (all tests, including the pre-existing reset suite).

- [ ] **Step 8: Run the auto-covering audit suites (they re-parse the NEW latest RPC body).**

Run: `pnpm vitest run tests/db/resetValidationDataFkAudit.test.ts tests/db/resetValidationDataDriveKeyedAudit.test.ts tests/db/resetValidationDataPostgrest.test.ts tests/db/resetValidationDataConcurrency.test.ts tests/db/destructiveResetGate.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts`
Expected: PASS — the topology/safeupdate/FK audits accept the new definition.

- [ ] **Step 9: Regenerate the schema manifest (columns-only introspection — expect no diff).**

Run: `pnpm gen:schema-manifest && git status --short supabase/__generated__/schema-manifest.json`
Expected: no output from `git status` (no DDL changed). If it DOES change, commit the regenerated manifest in this task's commit.

- [ ] **Step 10: Commit.**

```bash
git add supabase/migrations/20260715000000_geocode_cache_reset_and_expire.sql \
        tests/db/geocodeCacheCoordExpiry.test.ts tests/db/resetValidationData.test.ts
git commit --no-verify -m "fix(db): reset clears geocode_cache; one-shot expiry of legacy coord-less rows"
```

### Task 2: Full local gates + validation apply + RPC proof

**Files:**
- No source changes. Runs commands; records the apply log for the PR body.

**Interfaces:**
- Consumes: the committed migration from Task 1; `TEST_DATABASE_URL` (validation pooler) from the MAIN checkout's `.env.local` (linked into this worktree).
- Produces: the "apply log" block for the PR description (spec §3.1 close-out steps 1-2 + §3.3 parity step 3).

- [ ] **Step 1: Full local suite (shared-chokepoint discipline — scoped gates miss regressions).**

Run: `pnpm test` — **from a shell that has NOT sourced `.env.local`** (P-R3: a sourced
shell leaks the validation `TEST_DATABASE_URL` into vitest; the realdb tests would
target the remote pooler and the reset tests would now refuse loudly via the Step-1a
guard — but don't rely on the guard, keep the envs separated). Steps 4-6 below source
`.env.local` in a SUBSHELL (`( set -a; source .env.local; set +a; psql ... )`) so the
suite shell stays clean.
Expected: PASS (pre-existing failures, if any, must be shown absent at merge-base before blaming this diff).

- [ ] **Step 2: Quality gates.**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all exit 0.

- [ ] **Step 3: Rollout gate (spec §3.1 R7) — verify validation's deployment runs the coords-capable WRITER.** Prove the runtime writer, not the schema migration (P-R6: the migration file landed in an earlier commit than the `lib/geocoding/cache.ts` coords write — a deploy between the two would pass a migration-file check yet still write coord-less rows). Positive content proof against the DEPLOYED sha, both halves of the write chain:

Run:
`git show <deployed-sha>:lib/geocoding/cache.ts | grep -c "lat: args.lat"` — expected `1` (the upsert persists coords, `lib/geocoding/cache.ts:124-125` at HEAD), and
`git show <deployed-sha>:lib/sync/enrichVenueGeocode.ts | grep -c "lat: res.data.lat"` — expected `1` (the enrichment caller passes them, `lib/sync/enrichVenueGeocode.ts:152` at HEAD).
Record the exact commands + SHA + outputs in the apply log. If either grep returns 0, STOP — deploy validation first. (The migration-file/ancestry check may be recorded as a schema-history supplement, but it is NOT the gate.)

- [ ] **Step 4: Fail-closed validation-target guard + preflight count.** (P-R11: every validation `psql` runs through a guard that proves the target IS the validation project BEFORE any mutation — an unset/stale/prod-valued `TEST_DATABASE_URL` must abort here, not be discovered by Step 7 after the DO block already ran.) All of Steps 4-6 run inside ONE subshell so the verified env can't drift between commands:

```bash
( set -a; source .env.local; set +a
  # fail-closed: set, non-local, AND the DB's project ref matches VALIDATION_SUPABASE_PROJECT_REF
  [ -n "$TEST_DATABASE_URL" ] || { echo "ABORT: TEST_DATABASE_URL unset"; exit 1; }
  case "$TEST_DATABASE_URL" in *127.0.0.1*|*localhost*) echo "ABORT: TEST_DATABASE_URL is local"; exit 1;; esac
  [ -n "$VALIDATION_SUPABASE_PROJECT_REF" ] || { echo "ABORT: VALIDATION_SUPABASE_PROJECT_REF unset"; exit 1; }
  case "$TEST_DATABASE_URL" in
    *"$VALIDATION_SUPABASE_PROJECT_REF"*) echo "target = validation ($VALIDATION_SUPABASE_PROJECT_REF) ✓";;
    *) echo "ABORT: TEST_DATABASE_URL does not reference the validation project ref"; exit 1;;
  esac

  # Step 4 — preflight count (courtesy; the in-DB fuse is the real guard)
  psql "$TEST_DATABASE_URL" -c "select count(*) from geocode_cache where (lat is null or lng is null) and expires_at > now();"

  # Step 5 — surgical apply (single transaction: a fuse abort rolls back the whole file)
  psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
    -f supabase/migrations/20260715000000_geocode_cache_reset_and_expire.sql
  psql "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"

  # Step 6 — reset-RPC proof (spec close-out step 2 — BEFORE any rescan)
  psql "$TEST_DATABASE_URL" -c "select pg_get_functiondef('public.reset_validation_data()'::regprocedure) like '%delete from public.geocode_cache%' as has_delete;"
)
```

Expected: guard prints `target = validation (vzakgrxqwcalbmagufjh) ✓`; Step-4 count small (6 at spec time — record it); Step-5 `NOTICE: geocode_cache one-shot expiry: 6 coord-less row(s) expired` (count from Step 4) + CREATE FUNCTION + REVOKE + GRANT (record the NOTICE verbatim); Step-6 `has_delete = t`. (The behavioral half — reset → `count(geocode_cache) = 0` — runs in the Stage-4 close-out when "Reset validation data" is actually pressed; the expired-but-still-present legacy rows are its seed.)

- [ ] **Steps 5-6: folded into the Step-4 subshell above** (single verified-env block; do not run them standalone).

- [ ] **Step 7: Validation-parity CI precondition check.**

Run (P-R9: the parity test falls back to the LOCAL DB when `TEST_DATABASE_URL` is unset — an unsourced run records a green gate that never touched validation; source in a subshell and fail closed):

```bash
( set -a; source .env.local; set +a;
  [ -n "$TEST_DATABASE_URL" ] || { echo "TEST_DATABASE_URL unset — parity not proven"; exit 1; }
  case "$TEST_DATABASE_URL" in *127.0.0.1*|*localhost*) echo "TEST_DATABASE_URL is local — parity not proven"; exit 1;; esac
  pnpm vitest run tests/db/validation-schema-parity.test.ts )
```

Expected: PASS (manifest unchanged + validation superset holds), with `TEST_DATABASE_URL` resolving to the validation session pooler.

### Task 3: Close-out gates (Stage 4, after merge/deploy — operational, recorded in PR)

**Files:** none — operator/orchestrator steps from spec §3.1, listed here so the executing session carries them to completion; each step's output is appended to the PR apply log.

- [ ] **Step 1: Validation close-out (spec R9/R12/R14, ordered).** (a) Run "Reset validation data" from the admin UI (or `select public.reset_validation_data();` as service-role with the gate enabled); (b) assert `select count(*) from geocode_cache` = 0 on validation — behavioral RPC proof seeded by the expired rows; (c) run a fresh onboarding rescan; (d) **positive recovery proof** (P-R4: a zero coord-less count is vacuously true on an EMPTY cache — a breaker-open scan writes nothing and would pass it):

```sql
-- both must hold; N = distinct venues in the rescanned folder (6 at spec time)
select count(*) from geocode_cache where lat is not null and lng is not null;  -- >= N
select count(*) from geocode_cache where lat is null or lng is null;           -- = 0
```

plus `pnpm observe staged --env validation --warnings-only --since all --limit 500` showing NEITHER `VENUE_TIMEZONE_UNRESOLVED` NOR `VENUE_GEOCODE_UNRESOLVED` (P-R10 class-sweep: `--since` defaults to 24h; a 500-row result means truncation — page until the full set is seen), plus a spot-check that a staged parse's venue timezone is populated (`pnpm observe staged --env validation --full --since all` → venue tz non-ET-fallback for a known non-Eastern venue, e.g. the Chicago shows). If any check fails, wait out the 60s breaker cooldown and re-run the rescan until all pass.

- [ ] **Step 2: Prod rollout gate (spec R7 — mirrors validation's).** BEFORE the prod DB apply: prove the ACTIVE prod deployment runs the coords-capable WRITER — same two runtime-writer greps as the validation gate (`git show <prod-deployed-sha>:lib/geocoding/cache.ts | grep -c "lat: args.lat"` = 1 AND `git show <prod-deployed-sha>:lib/sync/enrichVenueGeocode.ts | grep -c "lat: res.data.lat"` = 1; record commands + SHA + outputs in the apply log). If either grep returns 0, or if an older deployment could still serve traffic (mid-rollback), STOP — do not apply until all traffic is on a coords-capable build. (Prod migrations riding the deploy pipeline satisfy this by construction — the applying deploy IS a current-main build — but record the proof rather than assuming it.)

- [ ] **Step 3: Prod close-out (spec R10/R14).** After the prod apply (deploy pipeline), run `pnpm observe warnings --env prod --limit 500`, `pnpm observe staged --env prod --warnings-only --since all --limit 500`, `pnpm observe failures --env prod --since all --limit 500` (P-R10: `staged`/`failures` default `--since 24h` — older pending artifacts would be invisible; `--limit` clamps to 500, so if ANY command returns exactly 500 rows, treat the enumeration as truncated and page/narrow until the full set is seen — a capped result is NOT a proof), filtering for `VENUE_TIMEZONE_UNRESOLVED` and `VENUE_GEOCODE_UNRESOLVED`. All empty → record zero-affected proof. Any hit → per-show admin re-sync, then POSITIVELY confirm each re-synced venue's cache row EXISTS with `lat is not null and lng is not null` (existence + coords, not merely absence of coord-less rows — P-R4), repeat the enumeration until empty (60s breaker cooldown between attempts if Google is flaky).
