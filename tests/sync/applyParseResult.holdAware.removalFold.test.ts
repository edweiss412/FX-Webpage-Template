/**
 * Phase 2 Task 2.6 — fold a later removal of a held crew (F7). DB-backed.
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

async function setup(tx: Sql) {
  const { showId, driveFileId } = await seedShow(tx);
  const aliceLive = crew("Alice", { email: "a@old" });
  const aliceRow = await seedCrew(tx, showId, aliceLive);
  await writeMi11Holds(holdPort(tx), {
    showId,
    driveFileId,
    mi11Items: [
      { id: "1", invariant: "MI-11", crew_name: "Alice", prior_email: "a@old", new_email: "a@new" },
    ],
    liveCrewByName: new Map([["Alice", aliceLive]]),
    baseModifiedTime: MT,
  });
  return { showId, driveFileId, aliceLive, aliceRow };
}

describe("hold-aware apply — held-crew removal fold (Task 2.6, F7)", () => {
  it("later sheet removal of a held crew folds into a removal disposition", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx);
      // Alice dropped, NO added row carrying her email (genuine departure).
      const next = parseResult([crew("Bob", { email: "b@x" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      const alice = rows.find((r) => r.name === "Alice");
      expect(alice).toBeDefined(); // not silently removed (delete-suppression)
      expect(alice!.email).toBe("a@old"); // pinned

      const holds = await readHolds(tx, showId);
      expect(holds).toHaveLength(1);
      expect(holds[0]!.proposed_value).toEqual({ disposition: "removal" });
      expect(new Date(holds[0]!.base_modified_time as unknown as string).toISOString()).toBe(MT2);
    });
  });

  it("removal fold does not fire when a rename match exists (rename wins)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx);
      // Alice dropped BUT an added row carries her proposed email a@new → rename branch.
      const next = parseResult([crew("Alicia", { email: "a@new" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const holds = await readHolds(tx, showId);
      expect(holds[0]!.proposed_value).toEqual({
        disposition: "rename",
        name: "Alicia",
        email: "a@new",
      });
    });
  });
});
