// Backoff spec §3.3a statements (A)/(B) + gate read through the REAL
// PostgresWatchTx against the local DB (§6 classes 16c persistence half, 16d,
// and the port row-shape pins). Serial DB project.
//
// TWO separate connections so the concurrency case genuinely races distinct
// sessions. Guard pattern per tests/db/watchRenewalDue.test.ts:14-29.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createPostgresWatchTx } from "@/lib/drive/watch";
import { assertLocalDbUrl } from "./_localDbUrl";

const databaseUrl = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sqlA = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });
const sqlB = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });

const RUN = `plan-t4-${process.pid}-${Date.now()}`;
const F = `${RUN}-a`;
const F2 = `${RUN}-b`;
const F3c = `${RUN}-c`;
const F4 = `${RUN}-d`;
const F5 = `${RUN}-e`;
const F6 = `${RUN}-f`;

const cleanup = () =>
  sqlA`delete from drive_watch_reconcile_state where watched_folder_id like ${RUN + "%"}`;

const txA = createPostgresWatchTx(sqlA);
const txB = createPostgresWatchTx(sqlB);
const failVia = (tx: ReturnType<typeof createPostgresWatchTx>, folder: string) =>
  tx.recordAttemptFailure(folder, "drive_api", "probe message");
const succeedVia = (tx: ReturnType<typeof createPostgresWatchTx>, folder: string) =>
  tx.recordAttemptSuccess(folder);

describe("drive_watch_reconcile_state writes through PostgresWatchTx (spec §3.3a)", () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await sqlA.end();
    await sqlB.end();
  });

  it("two concurrent failures on separate sessions both count (16d)", async () => {
    await Promise.all([failVia(txA, F), failVia(txB, F)]);
    const [row] =
      await sqlA`select consecutive_failures from drive_watch_reconcile_state where watched_folder_id = ${F}`;
    expect(row!.consecutive_failures).toBe(2);
  });

  it("two SEQUENTIAL failures from a stale in-memory zero still reach 2 (class 4)", async () => {
    await failVia(txA, F4);
    await failVia(txA, F4); // no read-modify-write anywhere
    const [row] =
      await sqlA`select consecutive_failures from drive_watch_reconcile_state where watched_folder_id = ${F4}`;
    expect(row!.consecutive_failures).toBe(2);
  });

  it("first failure inserts 1, not 0, and follows the ladder", async () => {
    const r = await failVia(txA, F5);
    expect(r.consecutiveFailures).toBe(1);
    // ladder rung 1 = 15m: next_attempt_at ~= now + 900s (DB clock; wide tolerance)
    const [row] =
      await sqlA`select extract(epoch from (next_attempt_at - now()))::float as wait from drive_watch_reconcile_state where watched_folder_id = ${F5}`;
    expect(row!.wait).toBeGreaterThan(800);
    expect(row!.wait).toBeLessThan(1000);
  });

  it("(B) commits, then a delayed (A) lands failed/1 - the accepted bounded race end state (spec §3.3a/16d)", async () => {
    await succeedVia(txB, F2);
    await failVia(txA, F2);
    const [row] =
      await sqlA`select consecutive_failures, last_attempt_outcome from drive_watch_reconcile_state where watched_folder_id = ${F2}`;
    expect(row).toMatchObject({ consecutive_failures: 1, last_attempt_outcome: "failed" });
  });

  it("three sequential failures persist consecutive_failures === 3 (16c persistence half)", async () => {
    await failVia(txA, F3c);
    await failVia(txA, F3c);
    await failVia(txA, F3c);
    const [row] =
      await sqlA`select consecutive_failures from drive_watch_reconcile_state where watched_folder_id = ${F3c}`;
    expect(row!.consecutive_failures).toBe(3);
  });

  it("BOTH port methods return camelCase ISO strings (row-shape pin)", async () => {
    const rf = await failVia(txA, F6);
    expect(typeof rf.nextAttemptAt).toBe("string");
    expect(Number.isFinite(Date.parse(rf.nextAttemptAt))).toBe(true);
    expect(rf.consecutiveFailures).toBe(1);
    const rs = await succeedVia(txA, F6);
    expect(typeof rs.nextAttemptAt).toBe("string");
    expect(Number.isFinite(Date.parse(rs.nextAttemptAt))).toBe(true);
    expect(rs.consecutiveFailures).toBe(0);
    // success resets and clears error columns
    const [row] =
      await sqlA`select consecutive_failures, last_attempt_outcome, last_error_class, last_error_message from drive_watch_reconcile_state where watched_folder_id = ${F6}`;
    expect(row).toMatchObject({
      consecutive_failures: 0,
      last_attempt_outcome: "succeeded",
      last_error_class: null,
      last_error_message: null,
    });
  });

  it("gate verdict SQL is strictly-greater in the DB clock domain (boundary pin)", async () => {
    // The normative predicate is `next_attempt_at > now()` (spec D8). A DB
    // wall-clock test cannot hold `now()` at exact equality, so the literal is
    // pinned at the source level and the past-due arm behaviorally.
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/drive/watch.ts", "utf8")).toContain(
      "next_attempt_at > now() as waiting",
    );
    await sqlA`insert into drive_watch_reconcile_state (watched_folder_id, next_attempt_at)
               values (${RUN + "-due"}, now() - interval '1 millisecond')`;
    const gate = await txA.readReconcileGate(`${RUN}-due`);
    expect(gate!.waiting).toBe(false);
  });

  it("readReconcileGate returns waiting boolean + ISO string against the real DB", async () => {
    await failVia(txA, F6);
    const gate = await txA.readReconcileGate(F6);
    expect(gate).not.toBeNull();
    expect(gate!.waiting).toBe(true); // rung-1 wait is 15m out
    expect(gate!.consecutiveFailures).toBe(1);
    expect(typeof gate!.nextAttemptAt).toBe("string");
    const missing = await txA.readReconcileGate(`${RUN}-no-such-row`);
    expect(missing).toBeNull();
  });
});
