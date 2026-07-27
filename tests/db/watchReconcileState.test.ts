// Spec: docs/superpowers/specs/observability/2026-07-26-watch-reconcile-backoff-v2-design.md §3.2/§3.3
// (§6 classes 4 and 20). Serial DB project.
//
// Guard pattern copied from tests/db/watchRenewalDue.test.ts:14-29: guarded URL,
// {max:1, idle_timeout:1, prepare:false}, RUN-scoped cleanup in beforeAll AND
// afterAll, await sql.end() in afterAll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { BACKOFF_LADDER_MS } from "@/lib/drive/watchErrors";
import { assertLocalDbUrl } from "./_localDbUrl";

const databaseUrl = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sql = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });

const RUN = `plan-t3-${process.pid}-${Date.now()}`;
const FOLDER = `${RUN}-folder`;
const cleanup = () =>
  sql`delete from drive_watch_reconcile_state where watched_folder_id like ${RUN + "%"}`;

describe("drive_watch_reconcile_state (spec §3.2, §6 class 4)", () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await sql.end();
  });

  it("rejects a ReconcileOutcome value in last_attempt_outcome — the narrowing pin", async () => {
    await expect(
      sql`insert into drive_watch_reconcile_state (watched_folder_id, last_attempt_outcome)
          values (${FOLDER + "-chk"}, 'still_orphaned')`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("accepts both writable attempt outcomes and NULL", async () => {
    await sql`insert into drive_watch_reconcile_state (watched_folder_id, last_attempt_outcome)
              values (${FOLDER + "-ok1"}, 'failed')`;
    await sql`insert into drive_watch_reconcile_state (watched_folder_id, last_attempt_outcome)
              values (${FOLDER + "-ok2"}, 'succeeded')`;
    await sql`insert into drive_watch_reconcile_state (watched_folder_id)
              values (${FOLDER + "-ok3"})`;
    const rows =
      await sql`select count(*)::int as n from drive_watch_reconcile_state where watched_folder_id like ${FOLDER + "-ok%"}`;
    expect(rows[0]!.n).toBe(3);
  });

  it("rejects out-of-union error class and negative failures", async () => {
    await expect(
      sql`insert into drive_watch_reconcile_state (watched_folder_id, last_error_class)
          values (${FOLDER + "-ec"}, 'network')`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`insert into drive_watch_reconcile_state (watched_folder_id, consecutive_failures)
          values (${FOLDER + "-neg"}, -1)`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("watch_backoff_ms matches the independent table incl. defensive floor (class 20)", async () => {
    // Independent literal table — NEVER derived from BACKOFF_LADDER_MS.
    const cases: Array<[number | null, number]> = [
      [0, 900_000],
      [1, 900_000],
      [2, 1_800_000],
      [3, 3_600_000],
      [4, 7_200_000],
      [5, 7_200_000],
      [8, 7_200_000],
      [null, 900_000],
    ];
    for (const [n, want] of cases) {
      const [row] = await sql`select public.watch_backoff_ms(${n}::int) as ms`;
      expect(Number(row!.ms), `n=${n}`).toBe(want);
    }
    // TS-side sanity: the SQL cap and the constant's last rung agree.
    expect(BACKOFF_LADDER_MS.at(-1)).toBe(7_200_000);
  });
});
