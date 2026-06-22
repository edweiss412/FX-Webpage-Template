/**
 * Phase 2 Task 2.8 — §4.3 release / re-evaluation of mi11_pending holds on later syncs.
 * DB-backed; assertions read the sync_holds + crew_members rows.
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { applyParseResult } from "@/lib/sync/applyParseResult";
import { writeMi11Holds } from "@/lib/sync/holds/writeMi11Holds";

import {
  applyTx,
  crew,
  holdPort,
  parseResult,
  prevMember,
  readCrew,
  readHolds,
  seedCrew,
  seedShow,
  snapshot,
} from "./_holdAwareTestkit";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });
afterAll(async () => {
  await sql.end({ timeout: 5 });
});

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

const MT = "2026-06-08T12:00:00.000Z";
const MT2 = "2026-06-08T13:00:00.000Z";
const MT3 = "2026-06-08T14:00:00.000Z";

async function setup(tx: Sql, newEmail: string) {
  const { showId, driveFileId } = await seedShow(tx);
  const aliceLive = crew("Alice", { email: "a@old" });
  const aliceRow = await seedCrew(tx, showId, aliceLive);
  await writeMi11Holds(holdPort(tx), {
    showId,
    driveFileId,
    mi11Items: [
      {
        id: "1",
        invariant: "MI-11",
        crew_name: "Alice",
        prior_email: "a@old",
        new_email: newEmail,
      },
    ],
    liveCrewByName: new Map([["Alice", aliceLive]]),
    baseModifiedTime: MT,
  });
  return { showId, driveFileId, aliceLive, aliceRow };
}

describe("hold release / re-eval (Task 2.8, §4.3)", () => {
  it("sheet reconciles back to held_value → mi11_pending releases (row deleted)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx, "a@new");
      // Later sheet sets Alice's email BACK to a@old (matches held_value).
      const next = parseResult([crew("Alice", { email: "a@old" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      expect(await readHolds(tx, showId)).toHaveLength(0);
      const alice = (await readCrew(tx, showId)).find((r) => r.name === "Alice")!;
      expect(alice.email).toBe("a@old");
    });
  });

  it("oscillating new email re-evaluates proposed_value + base_modified_time in place (single row)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx, "a@new");
      // Later sheet proposes a@newer (still MI-11 vs held a@old).
      const next = parseResult([crew("Alice", { email: "a@newer" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const holds = await readHolds(tx, showId);
      expect(holds).toHaveLength(1);
      expect(holds[0]!.proposed_value).toMatchObject({
        disposition: "email_change",
        email: "a@newer",
      });
      expect(new Date(holds[0]!.base_modified_time as unknown as string).toISOString()).toBe(MT2);
      // Email still pinned to old until Approve.
      const alice = (await readCrew(tx, showId)).find((r) => r.name === "Alice")!;
      expect(alice.email).toBe("a@old");
    });
  });

  it("escalation precedence: email_change → rename → removal leaves one row at the latest disposition", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx, "a@new");
      const snap = () => snapshot(showId, [prevMember(aliceRow, aliceLive)]);
      const port = holdPort(tx);

      // Step 1: email_change re-eval (a@newer).
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Alice", { email: "a@newer" })]),
        snapshot: snap(),
        holds: { port, baseModifiedTime: MT2 },
      });
      // Step 2: rename (Alice→Alicia carrying the proposed email a@newer).
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Alicia", { email: "a@newer" })]),
        snapshot: snap(),
        holds: { port, baseModifiedTime: MT3 },
      });
      let holds = await readHolds(tx, showId);
      expect(holds).toHaveLength(1);
      expect(holds[0]!.proposed_value).toMatchObject({ disposition: "rename", name: "Alicia" });

      // Step 3: removal (Alicia dropped too; no row carries the held/proposed email).
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Zoe", { email: "z@x" })]),
        snapshot: snap(),
        holds: { port, baseModifiedTime: "2026-06-08T15:00:00.000Z" },
      });
      holds = await readHolds(tx, showId);
      expect(holds).toHaveLength(1);
      // Derive the expected final disposition from the last step (removal), not a literal earlier value.
      expect(holds[0]!.proposed_value).toEqual({ disposition: "removal" });
    });
  });
});
