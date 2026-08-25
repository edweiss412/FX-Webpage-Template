/**
 * tests/supabase/_metaRetryableRpcVolatility.test.ts — Task 2 of the transient-502 plan.
 *
 * Guards RETRYABLE_RPCS in BOTH directions, because a retry is only safe if the database can
 * prove the call cannot have written:
 *
 *   SAFETY       every name in the set is non-VOLATILE AND completes inside a READ ONLY
 *                transaction. Volatility alone is NECESSARY AND NOT SUFFICIENT: a STABLE
 *                function can still write through a VOLATILE callee (spec §4.2), and the
 *                READ ONLY arm is what catches that at any call depth.
 *   COMPLETENESS every non-VOLATILE function name appearing as a string literal in the
 *                product tree is in the set or in EXCLUSIONS with a reason. Discovery matches
 *                literals against the CATALOG rather than recognizing call sites, because two
 *                call-site rules failed one round apart (spec §4.4).
 *
 * The arms FAIL when the catalog is unreachable; they never skip. Every other DB suite here
 * skips, and that is right for them — a skip loses coverage OF THE DATABASE. This one verifies
 * a safety precondition of product code that ships either way, so a skip would leave the retry
 * set unverified while the suite reported pass. The suite lives in tests/supabase/, which is
 * NOT in PARALLEL_TEST_GLOBS and therefore runs in the serial project, which is the tier that
 * boots Supabase.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { RETRYABLE_RPCS } from "@/lib/supabase/retryEligibility";
import { premise } from "../_shared/premise";
import {
  EXCLUSIONS,
  completenessViolations,
  literalsInProductTree,
  safetyViolations,
  type Catalog,
} from "./retryableRpcVolatilityScan";

const sql = postgres(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, prepare: false },
);
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

let catalog: Catalog = new Map();

beforeAll(async () => {
  const rows = await sql<{ proname: string; provolatile: string }[]>`
    select p.proname, p.provolatile
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'`;
  catalog = new Map(rows.map((r) => [r.proname, { volatile: r.provolatile === "v" }]));
});

describe("RETRYABLE_RPCS — premises", () => {
  test("the catalog resolved, so an empty result cannot pass this suite vacuously", () => {
    premise("public functions in the catalog", catalog.size, 0);
  });

  test("the product-tree walk found literals", () => {
    premise("string literals in the product tree", literalsInProductTree().size, 0);
  });
});

describe("RETRYABLE_RPCS — safety arm", () => {
  test("every member is non-VOLATILE in the live catalog", () => {
    premise("catalog rows to judge the set against", catalog.size, 0);
    expect(safetyViolations(RETRYABLE_RPCS, catalog)).toEqual([]);
  });

  test("PLANT: a VOLATILE name in the set fails the arm", () => {
    const volatileName = [...catalog].find(([, r]) => r.volatile)?.[0];
    premise("a VOLATILE function exists to plant with", volatileName === undefined ? 0 : 1, 0);
    expect(safetyViolations([volatileName!], catalog)).toHaveLength(1);
  });

  test("PLANT: a name absent from the catalog fails rather than being skipped", () => {
    // The premise is the catalog being NON-empty: against an empty one every name is
    // unresolvable, so this plant would pass for the wrong reason.
    premise("catalog rows the planted name is genuinely absent from", catalog.size, 0);
    expect(safetyViolations(["no_such_function_anywhere"], catalog)).toHaveLength(1);
  });

  test("every member completes inside a READ ONLY transaction", async () => {
    premise("members to execute inside the READ ONLY transaction", RETRYABLE_RPCS.size, 0);
    for (const name of RETRYABLE_RPCS) {
      const args = await sql<{ n: number }[]>`
        select count(*)::int as n from pg_proc p
          join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname = 'public' and p.proname = ${name} and p.pronargs = 0`;
      if (args[0]!.n === 0) continue; // arg-taking members are covered by the planted probe below
      await sql.begin(async (tx) => {
        await tx`set transaction read only`;
        // The assertion is that this DID NOT RAISE. Never a row count: three members are
        // set-returning and correctly return zero rows, so a row-count assertion would be
        // tautological and false-failing at once.
        await tx.unsafe(`select public.${name}()`);
        await tx`rollback`;
      });
    }
  });

  test("PLANT: a STABLE function that writes through a VOLATILE callee fails the READ ONLY arm", async () => {
    premise("a live connection to build the planted pair on", catalog.size, 0);
    // This is the plant that discriminates the READ ONLY arm from volatility-only checking.
    // Without it, deleting the arm entirely would leave this suite green, because every real
    // member is genuinely read-only.
    let raised = false;
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`create table _probe_t(x int)`);
        await tx.unsafe(
          `create function _probe_vol() returns void language plpgsql volatile as $$ begin insert into _probe_t values (1); end $$`,
        );
        await tx.unsafe(
          `create function _probe_stable_calls_vol() returns void language plpgsql stable as $$ begin perform _probe_vol(); end $$`,
        );
        await tx`set transaction read only`;
        await tx.unsafe(`select _probe_stable_calls_vol()`);
      });
    } catch {
      raised = true;
    }
    expect(raised).toBe(true);
  });
});

describe("RETRYABLE_RPCS — completeness arm", () => {
  test("every non-VOLATILE name in the product tree is retryable or excluded", () => {
    premise("literals walked out of the product tree", literalsInProductTree().size, 0);
    expect(
      completenessViolations(literalsInProductTree(), catalog, RETRYABLE_RPCS, EXCLUSIONS),
    ).toEqual([]);
  });

  test("PLANT: removing a member from the set fails the arm", () => {
    const shrunk = new Set(RETRYABLE_RPCS);
    const dropped = [...RETRYABLE_RPCS].find((n) => literalsInProductTree().has(n));
    premise("a member is named in the product tree", dropped === undefined ? 0 : 1, 0);
    shrunk.delete(dropped!);
    expect(
      completenessViolations(literalsInProductTree(), catalog, shrunk, EXCLUSIONS).length,
    ).toBeGreaterThan(0);
  });
});
