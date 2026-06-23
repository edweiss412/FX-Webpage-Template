/**
 * Phase 2 Task 2.7 — proposed-target reservation (F16 / PF37 / resolution #23).
 *
 * An open hold's proposed email+name is RESERVED: any DIFFERENT-entity parse row colliding with
 * the reservation is suppressed (nothing leaks pre-Approve) AND recorded in the hold's
 * reservation_collisions jsonb (re-derived fresh each apply; back to [] when the colliding row
 * leaves the parse). DB-backed; assertions read the DB hold row + crew_members (anti-tautology).
 *
 * Fixture note: the held crew's sheet row keeps its proposed email (the normal MI-11 progression),
 * so proposed_value stays stable and the DISTINCT colliding person is the thing under test. The
 * "held entity's email re-targets" interaction is Task 2.8's domain.
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

async function setupXNewHold(tx: Sql) {
  const { showId, driveFileId } = await seedShow(tx);
  const aliceLive = crew("Alice", { email: "alice@old" });
  const aliceRow = await seedCrew(tx, showId, aliceLive);
  await writeMi11Holds(holdPort(tx), {
    showId,
    driveFileId,
    mi11Items: [
      {
        id: "1",
        invariant: "MI-11",
        crew_name: "Alice",
        prior_email: "alice@old",
        new_email: "x@new",
      },
    ],
    liveCrewByName: new Map([["Alice", aliceLive]]),
    baseModifiedTime: MT,
  });
  return { showId, driveFileId, aliceLive, aliceRow };
}

describe("hold-aware apply — proposed-target reservation (Task 2.7, F16/PF37)", () => {
  it("an added row colliding with an open hold's proposed email is suppressed AND recorded", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setupXNewHold(tx);
      // Sheet keeps Alice at her proposed x@new AND adds a DISTINCT person Alicia: x@new.
      const next = parseResult([
        crew("Alice", { email: "x@new" }),
        crew("Alicia", { email: "x@new" }),
      ]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      // No live row has x@new (the add was suppressed; Alice's identity is pinned to alice@old).
      expect(rows.find((r) => r.email === "x@new")).toBeUndefined();
      expect(rows.find((r) => r.name === "Alicia")).toBeUndefined();
      const alice = rows.find((r) => r.name === "Alice")!;
      expect(alice.email).toBe("alice@old"); // pinned

      const holds = await readHolds(tx, showId);
      expect(holds[0]!.proposed_value).toMatchObject({ email: "x@new" });
      expect(holds[0]!.reservation_collisions).toEqual([{ name: "Alicia", email: "x@new" }]);
    });
  });

  it("reservation also covers a colliding proposed NAME and records it", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "alice@old" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      // Seed a hold whose proposed_value.name is "Alicia" (a folded rename target).
      await tx.unsafe(
        `insert into public.sync_holds
           (show_id, drive_file_id, domain, entity_key, held_value, proposed_value, base_modified_time, kind, created_by)
         values ($1,$2,'crew_email','Alice',$3::jsonb,$4::jsonb,$5::timestamptz,'mi11_pending','system')`,
        [
          showId,
          driveFileId,
          { name: "Alice", email: "alice@old" },
          { disposition: "rename", name: "Alicia", email: "x@new" },
          MT,
        ] as never,
      );
      // Alice's sheet row carries the proposed email x@new (so the hold neither reconciles to the
      // old email nor re-targets); an unrelated added row named Alicia with a DIFFERENT email
      // collides under the RESERVED name.
      const next = parseResult([
        crew("Alice", { email: "x@new" }),
        crew("Alicia", { email: "other@x" }),
      ]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Alicia")).toBeUndefined(); // suppressed under reserved name
      const holds = await readHolds(tx, showId);
      expect(holds[0]!.reservation_collisions).toEqual([{ name: "Alicia", email: "other@x" }]);
    });
  });

  it("reservation_collisions RELEASES to [] when the sheet stops adding the colliding row", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId, aliceLive, aliceRow } = await setupXNewHold(tx);
      const snap = snapshot(showId, [prevMember(aliceRow, aliceLive)]);
      const port = holdPort(tx);
      // First apply: Alicia collides → recorded.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([
          crew("Alice", { email: "x@new" }),
          crew("Alicia", { email: "x@new" }),
        ]),
        snapshot: snap,
        holds: { port, baseModifiedTime: MT2 },
      });
      expect((await readHolds(tx, showId))[0]!.reservation_collisions).toEqual([
        { name: "Alicia", email: "x@new" },
      ]);

      // Second apply: sheet DROPS Alicia → collisions return to [].
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Alice", { email: "x@new" })]),
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port, baseModifiedTime: MT3 },
      });
      expect((await readHolds(tx, showId))[0]!.reservation_collisions).toEqual([]);
    });
  });

  it("P2-F4 — a PRE-EXISTING live crew member owning the reserved email is NOT deleted", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      // prior: [Alice(a@old), Bob(b@x)] — Bob is a real, pre-existing live crew member.
      const aliceLive = crew("Alice", { email: "a@old" });
      const bobLive = crew("Bob", { email: "b@x" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      const bobRow = await seedCrew(tx, showId, bobLive);
      // Alice MI-11 to Bob's EXISTING email b@x → the hold reserves b@x.
      await writeMi11Holds(holdPort(tx), {
        showId,
        driveFileId,
        mi11Items: [
          {
            id: "1",
            invariant: "MI-11",
            crew_name: "Alice",
            prior_email: "a@old",
            new_email: "b@x",
          },
        ],
        liveCrewByName: new Map([["Alice", aliceLive]]),
        baseModifiedTime: MT,
      });

      // next: [Alice(b@x), Bob(b@x)] — Alice now claims Bob's email; Bob unchanged & still present.
      const next = parseResult([crew("Alice", { email: "b@x" }), crew("Bob", { email: "b@x" })]);
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: next,
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive), prevMember(bobRow, bobLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      // Bob (a pre-existing live owner of the reserved email) must NOT be deleted.
      const bob = rows.find((r) => r.name === "Bob");
      expect(bob).toBeDefined();
      expect(bob!.email).toBe("b@x");
      // Alice's identity stays pinned to her old email until Approve.
      expect(rows.find((r) => r.name === "Alice")!.email).toBe("a@old");
    });
  });
});
