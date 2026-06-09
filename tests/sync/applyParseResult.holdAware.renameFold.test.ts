/**
 * Phase 2 Task 2.5 — fold a later rename of a held crew (F8) + R9 (non-identity edits
 * on the rename row still auto-apply onto the pinned old row). DB-backed.
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
  const aliceLive = crew("Alice", { email: "a@old", phone: "555-OLD", role: "A1" });
  const aliceRow = await seedCrew(tx, showId, aliceLive);
  await writeMi11Holds(holdPort(tx), {
    showId,
    driveFileId,
    mi11Items: [{ id: "1", invariant: "MI-11", crew_name: "Alice", prior_email: "a@old", new_email: "a@new" }],
    liveCrewByName: new Map([["Alice", aliceLive]]),
    baseModifiedTime: MT,
  });
  return { showId, driveFileId, aliceLive, aliceRow };
}

describe("hold-aware apply — held-crew rename fold (Task 2.5, F8 + R9)", () => {
  it("rename of a held crew suppresses the added row and folds into proposed_value", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx);
      // Later parse: drop Alice, add Alicia with the same email a@new (MI-12 same-email rename).
      const next = parseResult([crew("Alicia", { email: "a@new" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Alicia")).toBeUndefined(); // added row suppressed
      const alice = rows.find((r) => r.name === "Alice")!;
      expect(alice.email).toBe("a@old"); // still pinned

      const holds = await readHolds(tx, showId);
      expect(holds).toHaveLength(1);
      expect(holds[0]!.proposed_value).toEqual({ disposition: "rename", name: "Alicia", email: "a@new" });
      expect(new Date(holds[0]!.base_modified_time as unknown as string).toISOString()).toBe(MT2);
    });
  });

  it("R9 — rename-while-held + non-identity edit: identity holds, phone/role auto-apply", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx);
      // Alicia carries email a@new AND a changed phone + role.
      const next = parseResult([crew("Alicia", { email: "a@new", phone: "555-NEW", role: "A2" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Alicia")).toBeUndefined();
      const alice = rows.find((r) => r.name === "Alice")!;
      expect(alice.name).toBe("Alice"); // identity pinned
      expect(alice.email).toBe("a@old"); // identity pinned
      expect(alice.phone).toBe("555-NEW"); // non-identity followed the sheet
      expect(alice.role).toBe("A2"); // non-identity followed the sheet

      const holds = await readHolds(tx, showId);
      expect(holds[0]!.proposed_value).toEqual({ disposition: "rename", name: "Alicia", email: "a@new" });
    });
  });

  it("P2-F1 — a folded rename row is NOT recorded as a reservation collision", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx);
      // Held Alice a@old→a@new; sheet drops Alice + adds Alicia/a@new → this is the held crew's
      // OWN rename target (consumed by the fold), NOT a different-entity collision.
      const next = parseResult([crew("Alicia", { email: "a@new" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const holds = await readHolds(tx, showId);
      // The fold consumed Alicia → proposed is the rename; reservation_collisions must be EMPTY so
      // Phase-3 Approve does not reject the valid folded rename with IDENTITY_WOULD_COLLIDE.
      expect(holds[0]!.proposed_value).toEqual({ disposition: "rename", name: "Alicia", email: "a@new" });
      expect(holds[0]!.reservation_collisions).toEqual([]);
    });
  });

  it("P2-F1 control — a GENUINE distinct collision (no fold) IS still recorded", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setup(tx);
      // Alice STILL present (no rename fold — she keeps her own row at a@new) AND a distinct Alicia
      // also claims a@new → genuine reservation collision, recorded.
      const next = parseResult([crew("Alice", { email: "a@new" }), crew("Alicia", { email: "a@new" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Alicia")).toBeUndefined(); // suppressed
      const holds = await readHolds(tx, showId);
      expect(holds[0]!.reservation_collisions).toEqual([{ name: "Alicia", email: "a@new" }]);
    });
  });
});
