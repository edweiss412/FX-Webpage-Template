/**
 * Task 7 — role-vocab drift-resync END-TO-END apply (spec 2026-07-16-role-vocab-mapping-convergence
 * §3.3 "Equal-watermark apply" + §6 item 6). DB-bound (local Supabase, rollback-wrapped).
 *
 * These drive the PRODUCTION runPhase2 over `makeSyncPipelineTx(rawTx)` — the real stale CAS
 * (strict_less_than vs less_than_or_equal, chosen by staleGuardForMode from `args.driftResync`),
 * the real role overlay, and the real shows_internal stamp write. A jsdom/fake tx cannot prove the
 * CAS (it's a SQL predicate on last_seen_modified_time), so the assertion has to hit real Postgres.
 *
 * ANTI-TAUTOLOGY: each case seeds a PRIOR state (role_flags WITHOUT the grant, applied_role_mappings
 * null, a stale UNKNOWN_ROLE_TOKEN warning), asserts that precondition, and derives every expected
 * value from the `GRANTS` fixture — never hardcoded. The stale cases (b)/(c) assert the prior state
 * is UNCHANGED, so an accidental apply reddens them.
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { runPhase2 } from "@/lib/sync/phase2";
import { makeSyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

import {
  driftArgs,
  driftParse,
  expectedRoleFlags,
  readInternal,
  readRoleFlags,
  seedDriftShow,
} from "./_roleVocabDriftApplyKit";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Probe at module top-level so `it.skipIf` (evaluated at collection time) is accurate.
let sql: Sql | null = null;
let dbUp = false;
try {
  const probe = postgres(DB_URL, { max: 2, idle_timeout: 2, connect_timeout: 3, prepare: false });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as Sql).end().catch(() => {});
  sql = null;
  dbUp = false;
}

afterAll(async () => {
  if (sql) await sql.end({ timeout: 5 }).catch(() => {});
});

const ROLLBACK = Symbol("rollback");
async function inRollback<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  let out: T;
  try {
    await sql!.begin(async (tx) => {
      out = await fn(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return out!;
}

// Unchanged-sheet watermark: the sheet has NOT been re-modified, so binding.modifiedTime equals the
// stored shows.last_seen_modified_time (the equal-watermark case the feature exists to converge).
const MT = "2026-06-21T12:00:00.000Z";
const MT_LATER = "2026-06-21T18:00:00.000Z"; // a concurrent real edit advanced the stored watermark

const TOKEN = "RVDA APPLY";
const BASE_FLAGS = ["A1"]; // role_flags BEFORE the mapping grant is applied
const GRANTS = ["A1", "V1"]; // the mapping fixture: the overlay unions these onto role_flags
const CREW = "Alice";

describe("Task 7 — drift-resync equal-watermark apply (real DB)", () => {
  it.skipIf(!dbUp)(
    "(a) drift-rescued cron run over an UNCHANGED sheet applies and rewrites role_flags + parse_warnings + stamp",
    async () => {
      await inRollback(async (tx) => {
        const seed = await seedDriftShow(tx, {
          storedModifiedTime: MT,
          crewName: CREW,
          baseFlags: BASE_FLAGS,
          token: TOKEN,
        });

        // Precondition (anti-tautology): a NO-OP apply cannot satisfy the post-assertions.
        expect(await readRoleFlags(tx, seed.showId, CREW)).toEqual(BASE_FLAGS);
        const before = await readInternal(tx, seed.showId);
        expect(before.applied_role_mappings).toBeNull();
        expect(before.parse_warnings?.[0]).toMatchObject({ code: "UNKNOWN_ROLE_TOKEN" });

        const parse = driftParse(CREW, BASE_FLAGS, TOKEN);
        const result = await runPhase2(
          makeSyncPipelineTx(tx as never) as never,
          driftArgs(seed.driveFileId, MT, {
            driftResync: true,
            token: TOKEN,
            grants: GRANTS,
            parse,
          }),
        );

        // Not merely "the gate proceeds" — the equal-watermark <= CAS actually landed.
        expect(result.outcome).toBe("applied");

        // role_flags gained the mapping grant (derived from GRANTS, not hardcoded).
        expect(new Set(await readRoleFlags(tx, seed.showId, CREW))).toEqual(
          new Set(expectedRoleFlags(BASE_FLAGS, GRANTS)),
        );

        const after = await readInternal(tx, seed.showId);
        // Stamp now describes the consumed token (grants derived from the fixture).
        expect(after.applied_role_mappings).toEqual([{ token: TOKEN, grants: GRANTS }]);
        // The consumed UNKNOWN_ROLE_TOKEN warning is gone from the persisted warnings.
        expect((after.parse_warnings ?? []).some((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toBe(
          false,
        );
      });
    },
  );

  it.skipIf(!dbUp)(
    "(b) identical cron run WITHOUT driftResync stays stale — strict guard rewrites nothing",
    async () => {
      await inRollback(async (tx) => {
        const seed = await seedDriftShow(tx, {
          storedModifiedTime: MT,
          crewName: CREW,
          baseFlags: BASE_FLAGS,
          token: TOKEN,
        });

        const parse = driftParse(CREW, BASE_FLAGS, TOKEN);
        const result = await runPhase2(
          makeSyncPipelineTx(tx as never) as never,
          driftArgs(seed.driveFileId, MT, {
            driftResync: false, // plain cron: strict_less_than → equal watermark is stale
            token: TOKEN,
            grants: GRANTS,
            parse,
          }),
        );

        expect(result).toEqual({ outcome: "stale", code: "STALE_WRITE_ABORTED" });

        // Nothing rewritten: prior state intact.
        expect(await readRoleFlags(tx, seed.showId, CREW)).toEqual(BASE_FLAGS);
        const after = await readInternal(tx, seed.showId);
        expect(after.applied_role_mappings).toBeNull();
        expect(after.parse_warnings?.[0]).toMatchObject({ code: "UNKNOWN_ROLE_TOKEN" });
      });
    },
  );

  it.skipIf(!dbUp)(
    "(c) concurrent real edit advanced the watermark past binding.modifiedTime → drift run ends stale",
    async () => {
      await inRollback(async (tx) => {
        // Stored watermark is AHEAD of the binding's modifiedTime: even the <= guard fails.
        const seed = await seedDriftShow(tx, {
          storedModifiedTime: MT_LATER,
          crewName: CREW,
          baseFlags: BASE_FLAGS,
          token: TOKEN,
        });

        const parse = driftParse(CREW, BASE_FLAGS, TOKEN);
        const result = await runPhase2(
          makeSyncPipelineTx(tx as never) as never,
          driftArgs(seed.driveFileId, MT, {
            driftResync: true, // <= guard, but stored (MT_LATER) > binding (MT) → still stale
            token: TOKEN,
            grants: GRANTS,
            parse,
          }),
        );

        expect(result).toEqual({ outcome: "stale", code: "STALE_WRITE_ABORTED" });

        // Race posture unchanged: nothing rewritten.
        expect(await readRoleFlags(tx, seed.showId, CREW)).toEqual(BASE_FLAGS);
        const after = await readInternal(tx, seed.showId);
        expect(after.applied_role_mappings).toBeNull();
      });
    },
  );
});
