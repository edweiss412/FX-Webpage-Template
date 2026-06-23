/**
 * M12.2-B2-DEF-1 — REAL-Postgres assertion that a CRON-path apply CLEARS requires_resync.
 *
 * Contract: a show left in `requires_resync = true` (e.g. by a failed/staged Unarchive catch-up —
 * lib/showLifecycle/unarchiveShow.ts:16; the Held state otherwise keeps it false per
 * lib/admin/showDisplay.ts:33) must have the flag cleared by a successful production cron apply.
 * The clearing lives in the UPDATE arm of PostgresPipelineTx.applyShowSnapshot:
 *   - lib/sync/runScheduledCronSync.ts:1122  (full write, skipDiagramsWrite=false)
 *   - lib/sync/runScheduledCronSync.ts:1096  (skipDiagramsWrite=true)
 * both set `requires_resync = false`.
 *
 * ANTI-TAUTOLOGY (the load-bearing reason this test exists): it drives the PRODUCTION
 * `makeSyncPipelineTx(tx).applyShowSnapshot(...)` — NOT the `_holdAwareTestkit` `applyTx`/`phase2Tx`
 * doubles, which omit the show-row UPDATE entirely and would let a broken/absent clearing path pass.
 * The clearing only fires on the UPDATE arm, which only runs when the show already EXISTS, so the
 * test seeds an existing show with requires_resync=true, then applies the same drive_file_id.
 *
 * Negative-regression proof (manual, recorded in the DEF-1 handoff): deleting `requires_resync = false`
 * from either UPDATE arm flips this test RED (readShow().requires_resync stays true), confirming the
 * assertion exercises the real clearing rather than a default-false seed artifact — the seed is
 * explicitly `true`, so a NO-OP apply cannot satisfy it.
 *
 * DB convention mirrors tests/sync/runScheduledCronSync.holdWrite.test.ts + phase2.integration.test.ts:
 * a rollback-wrapped real-postgres transaction (no cleanup, no env mutation). `test.skipIf(!dbUp)`
 * skips gracefully when no local Postgres is reachable (orchestrator runs it at close-out).
 */
import { randomUUID } from "node:crypto";

import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { makeSyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

import { parseResult } from "./_holdAwareTestkit";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Probe at module top-level so `test.skipIf` (evaluated at collection time) is accurate.
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

const MODIFIED_TIME = "2026-06-21T12:00:00.000Z";

/** Seed an EXISTING show pinned to requires_resync=true (NOT the default false). */
async function seedResyncShow(tx: Sql): Promise<{ showId: string; driveFileId: string }> {
  const driveFileId = `drv-def1-${randomUUID()}`;
  const slug = `sh-def1-${randomUUID().slice(0, 8)}`;
  const [row] = await tx`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, requires_resync)
    values (${driveFileId}, ${slug}, 'T', 'c', 'v', true)
    returning id
  `;
  return { showId: row!.id as string, driveFileId };
}

async function readRequiresResync(tx: Sql, showId: string): Promise<boolean> {
  const [row] = await tx`select requires_resync from public.shows where id = ${showId}`;
  return row!.requires_resync as boolean;
}

describe("M12.2-B2-DEF-1 — cron-path applyShowSnapshot clears requires_resync (real DB)", () => {
  it.skipIf(!dbUp)(
    "a successful full-write cron apply (skipDiagramsWrite=false) clears requires_resync",
    async () => {
      await inRollback(async (tx) => {
        const { showId, driveFileId } = await seedResyncShow(tx);
        // Precondition: the seed pinned it true (a NO-OP apply cannot satisfy the post-assertion).
        expect(await readRequiresResync(tx, showId)).toBe(true);

        const result = await makeSyncPipelineTx(tx).applyShowSnapshot({
          driveFileId,
          modifiedTime: MODIFIED_TIME,
          staleGuard: "less_than_or_equal",
          parseResult: parseResult([]),
          slug: "irrelevant-update-arm-only", // update arm matches on drive_file_id, not slug
        });

        expect(result.outcome).toBe("updated");
        // The production UPDATE arm (runScheduledCronSync.ts:1122) set requires_resync = false.
        expect(await readRequiresResync(tx, showId)).toBe(false);
      });
    },
  );

  it.skipIf(!dbUp)(
    "a successful skip-diagrams cron apply (skipDiagramsWrite=true) clears requires_resync",
    async () => {
      await inRollback(async (tx) => {
        const { showId, driveFileId } = await seedResyncShow(tx);
        expect(await readRequiresResync(tx, showId)).toBe(true);

        const result = await makeSyncPipelineTx(tx).applyShowSnapshot({
          driveFileId,
          modifiedTime: MODIFIED_TIME,
          staleGuard: "less_than_or_equal",
          parseResult: parseResult([]),
          slug: "irrelevant-update-arm-only",
          skipDiagramsWrite: true,
        });

        expect(result.outcome).toBe("updated");
        // The production skip-diagrams UPDATE arm (runScheduledCronSync.ts:1096) set it false.
        expect(await readRequiresResync(tx, showId)).toBe(false);
      });
    },
  );
});
