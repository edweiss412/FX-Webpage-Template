/**
 * Phase 2 Task 2.10b — cutover: retire the live whole-parse pending_syncs staging path (PF31).
 * DB-backed. Verifies: the new decision rule never inserts a live pending_sync; the cutover clears
 * live rows + unblocks the publish gate predicate; wizard rows untouched; the cutover holds the
 * per-show advisory lock (PF33); idempotent residue-sweep (PF35).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { runPhase2 } from "@/lib/sync/phase2";

import { crew, parseResult, phase2Tx, seedCrew, seedShow } from "./_holdAwareTestkit";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

const CUTOVER_SQL = readFileSync(
  "supabase/migrations/20260608000004_retire_live_pending_syncs.sql",
  "utf8",
);

const ROLLBACK = Symbol("rollback");
async function inRollback<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  let out: T;
  try {
    await sql.begin(async (tx) => {
      out = await fn(tx as unknown as Sql);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return out!;
}

async function seedLivePendingSync(tx: Sql, driveFileId: string, wizard: boolean) {
  await tx`
    insert into public.pending_syncs
      (drive_file_id, staged_modified_time, parse_result, source_kind, warning_summary, wizard_session_id)
    values (${driveFileId}, now(), ${tx.json({ crewMembers: [] })}, 'cron', '',
            ${wizard ? randomUUID() : null})
  `;
}

const MT = "2026-06-08T12:00:00.000Z";

describe("cutover — retire live pending_syncs (Task 2.10b)", () => {
  it("the new decision rule NEVER inserts a live pending_sync row (MI-11 + FYI sync)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedCrew(tx, showId, crew("Alice", { email: "a@old" }));
      // MI-11 sync (Alice email change) + an added crew (FYI).
      const next = parseResult([crew("Alice", { email: "a@new" }), crew("Dana", { email: "d@x" })]);
      await runPhase2(phase2Tx(tx) as never, {
        driveFileId,
        mode: "cron",
        fileMeta: { driveFileId, name: "s", mimeType: "x", modifiedTime: MT, parents: ["f"] },
        parseResult: next,
        binding: { bindingToken: "t", modifiedTime: MT },
        verifyReelOnApply: false,
        mi11Items: [
          {
            id: "1",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "a@old",
            new_email: "a@new",
          },
        ] as never,
        notableItems: [],
      });
      const [row] = await tx<{ count: number }[]>`
        select count(*)::int as count from public.pending_syncs
        where drive_file_id = ${driveFileId} and wizard_session_id is null
      `;
      expect(row!.count).toBe(0);
    });
  });

  it("after the cutover, the publish gate predicate is no longer tripped for a previously-staged show", async () => {
    await inRollback(async (tx) => {
      const { driveFileId } = await seedShow(tx);
      await seedLivePendingSync(tx, driveFileId, false);
      // Pre-cutover the publish gate predicate is tripped.
      const tripped = async () =>
        (
          await tx<{ blocked: boolean }[]>`
            select exists (select 1 from public.pending_syncs
              where drive_file_id = ${driveFileId} and wizard_session_id is null) as blocked
          `
        )[0]!.blocked;
      expect(await tripped()).toBe(true);

      await tx.unsafe(CUTOVER_SQL);

      expect(await tripped()).toBe(false);
      // The show was reset so the next cron re-processes under the new rule.
      const [show] = await tx<
        { requires_resync: boolean; last_seen_modified_time: string | null }[]
      >`
        select requires_resync, last_seen_modified_time from public.shows where drive_file_id = ${driveFileId}
      `;
      expect(show!.requires_resync).toBe(true);
      expect(show!.last_seen_modified_time).toBeNull();
    });
  });

  it("the wizard pending_syncs path is untouched", async () => {
    await inRollback(async (tx) => {
      const { driveFileId } = await seedShow(tx);
      await seedLivePendingSync(tx, driveFileId, true); // wizard row
      await tx.unsafe(CUTOVER_SQL);
      const [row] = await tx<{ count: number }[]>`
        select count(*)::int as count from public.pending_syncs
        where drive_file_id = ${driveFileId} and wizard_session_id is not null
      `;
      expect(row!.count).toBe(1);
    });
  });

  it("idempotent residue-sweep: a second run after the cohort is gone mutates nothing (PF35)", async () => {
    await inRollback(async (tx) => {
      const { driveFileId } = await seedShow(tx);
      await seedLivePendingSync(tx, driveFileId, false);
      await tx.unsafe(CUTOVER_SQL); // clears the cohort
      // Second run finds zero live rows → no-op.
      await tx.unsafe(CUTOVER_SQL);
      const [row] = await tx<{ count: number }[]>`
        select count(*)::int as count from public.pending_syncs where wizard_session_id is null
          and drive_file_id = ${driveFileId}
      `;
      expect(row!.count).toBe(0);
    });
  });

  it("the cutover takes the per-show advisory lock before mutating (PF33 concurrency)", async () => {
    // Use two SEPARATE connections (advisory locks are session/txn scoped). Session A holds the
    // same hashtext('show:'||driveFileId) lock the sync path uses; the cutover (session B) must
    // BLOCK on that show until A releases.
    const driveFileId = `drv-${randomUUID()}`;
    const slug = `sh-${randomUUID().slice(0, 8)}`;
    const a = postgres(DB_URL, { max: 1, prepare: false });
    const b = postgres(DB_URL, { max: 1, prepare: false });
    try {
      // Seed a show + a live pending_sync (committed so both connections see it).
      const [show] = await sql`
        insert into public.shows (drive_file_id, slug, title, client_label, template_version)
        values (${driveFileId}, ${slug}, 'T', 'c', 'v') returning id
      `;
      await sql`
        insert into public.pending_syncs
          (drive_file_id, staged_modified_time, parse_result, source_kind, warning_summary, wizard_session_id)
        values (${driveFileId}, now(), ${sql.json({})}, 'cron', '', null)
      `;

      // Session A: open a txn holding the show lock; keep it open.
      let releaseA: (() => void) | null = null;
      const aHeld = new Promise<void>((resolve) => (releaseA = resolve));
      const aDone = a.begin(async (txa) => {
        await txa.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
        await aHeld; // hold until the test signals release
      });

      // Give A a moment to acquire.
      await new Promise((r) => setTimeout(r, 100));

      // Session B: run the cutover. It must BLOCK on this show's lock while A holds it.
      let bCompleted = false;
      const bDone = b.unsafe(CUTOVER_SQL).then(() => {
        bCompleted = true;
      });

      // Within a short window B must NOT complete (it's blocked on the advisory lock).
      await new Promise((r) => setTimeout(r, 400));
      expect(bCompleted).toBe(false);

      // Release A → B proceeds.
      releaseA!();
      await aDone;
      await bDone;
      expect(bCompleted).toBe(true);

      // After the cutover commit, no live pending_sync survives for that show.
      const [countRow] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.pending_syncs
        where drive_file_id = ${driveFileId} and wizard_session_id is null
      `;
      expect(countRow!.count).toBe(0);

      // Cleanup (committed rows).
      await sql`delete from public.pending_syncs where drive_file_id = ${driveFileId}`;
      await sql`delete from public.shows where id = ${show!.id}`;
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });
});
