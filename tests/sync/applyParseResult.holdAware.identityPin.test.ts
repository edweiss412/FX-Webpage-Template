/**
 * Phase 2 Task 2.4 — hold-aware apply: identity-only pin (F17) + delete-suppression.
 * DB-backed. Assertions read crew_members state (anti-tautology), not the parse object.
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

async function openAliceHold(
  tx: Sql,
  showId: string,
  driveFileId: string,
  aliceLive: ReturnType<typeof crew>,
  newEmail: string | null,
) {
  await writeMi11Holds(holdPort(tx), {
    showId,
    driveFileId,
    mi11Items: [
      {
        id: "1",
        invariant: "MI-11",
        crew_name: aliceLive.name,
        prior_email: aliceLive.email,
        new_email: newEmail,
      },
    ],
    liveCrewByName: new Map([[aliceLive.name, aliceLive]]),
    baseModifiedTime: MT,
  });
}

describe("hold-aware apply — identity pin + delete-suppression (Task 2.4)", () => {
  it("held email stays OLD while a same-crew PHONE edit auto-applies (F17)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@old", phone: "555-OLD", role: "A1" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      await openAliceHold(tx, showId, driveFileId, aliceLive, "a@new");

      // Sheet now has Alice with the NEW email AND a changed phone + role.
      const next = parseResult([crew("Alice", { email: "a@new", phone: "555-NEW", role: "A2" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT },
      });

      const rows = await readCrew(tx, showId);
      const alice = rows.find((r) => r.name === "Alice")!;
      expect(alice.email).toBe("a@old"); // pinned
      expect(alice.phone).toBe("555-NEW"); // followed the sheet
      expect(alice.role).toBe("A2"); // followed the sheet
    });
  });

  it("held crew is excluded from deleteCrewMembersNotIn", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@old" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      await openAliceHold(tx, showId, driveFileId, aliceLive, "a@new");

      // Sheet no longer lists Alice (would drop her), no rename match.
      const next = parseResult([crew("Bob", { email: "b@x" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT },
      });

      const rows = await readCrew(tx, showId);
      const alice = rows.find((r) => r.name === "Alice");
      expect(alice).toBeDefined();
      expect(alice!.email).toBe("a@old"); // still pinned, not deleted
    });
  });

  it("non-held crew follow the sheet entirely", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@old" });
      const bobLive = crew("Bob", { email: "b@old", phone: "555-B-OLD" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      const bobRow = await seedCrew(tx, showId, bobLive);
      await openAliceHold(tx, showId, driveFileId, aliceLive, "a@new");

      const next = parseResult([
        crew("Alice", { email: "a@new" }),
        crew("Bob", { email: "b@new", phone: "555-B-NEW" }),
      ]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive), prevMember(bobRow, bobLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT },
      });

      const rows = await readCrew(tx, showId);
      const bob = rows.find((r) => r.name === "Bob")!;
      expect(bob.email).toBe("b@new"); // not held → fully updated
      expect(bob.phone).toBe("555-B-NEW");
    });
  });
});
