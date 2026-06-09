/**
 * Phase 2 Task 2.8b — honor undo_override holds in the apply (PF10/resolution #14).
 *
 * Seeds undo_override holds directly (Phase 3/4 WRITE them; Phase 2 OWNS honoring them on the next
 * sync). All baseline reads go through held_value->'baseline' (PF18), never a sibling field.
 * DB-backed; next-sync semantics (seed hold → run ONE later applyParseResult → assert).
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { applyParseResult } from "@/lib/sync/applyParseResult";

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

const MT2 = "2026-06-08T13:00:00.000Z";

async function seedUndoOverride(
  tx: Sql,
  showId: string,
  driveFileId: string,
  domain: "crew_email" | "crew_identity",
  entityKey: string,
  heldValue: Record<string, unknown>,
) {
  await tx.unsafe(
    `insert into public.sync_holds
       (show_id, drive_file_id, domain, entity_key, held_value, kind, created_by)
     values ($1,$2,$3,$4,$5::jsonb,'undo_override','admin@x')`,
    [showId, driveFileId, domain, entityKey, heldValue] as never,
  );
}

describe("hold-aware apply — honor undo_override holds (Task 2.8b, PF10)", () => {
  it("(a) reject pins the old email terminally — crew_email undo_override", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@old" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      await seedUndoOverride(tx, showId, driveFileId, "crew_email", "Alice", {
        name: "Alice",
        email: "a@old",
      });

      // Next sync: sheet STILL says Alice: a@new (the rejected change).
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Alice", { email: "a@new" })]),
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const alice = (await readCrew(tx, showId)).find((r) => r.name === "Alice")!;
      expect(alice.email).toBe("a@old"); // override honored
      // terminal: no proposed_value, hold persists (still overriding)
      const holds = await readHolds(tx, showId);
      expect(holds).toHaveLength(1);
      expect(holds[0]!.kind).toBe("undo_override");
    });
  });

  it("(b) undo-of-removal: sheet STILL omits Alice → restored row STAYS (keyed off held_value.baseline)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@x" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      await seedUndoOverride(tx, showId, driveFileId, "crew_identity", "Alice", {
        name: "Alice",
        email: "a@x",
        phone: "555-OLD",
        role: "A1",
        role_flags: ["A1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
        baseline: { kind: "removal" },
      });

      // Next sync STILL omits Alice (the undone removal persists).
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Bob", { email: "b@x" })]),
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Alice")).toBeDefined(); // NOT re-removed
      expect((await readHolds(tx, showId)).find((h) => h.entity_key === "Alice")).toBeDefined();
    });
  });

  it("(b') undo-of-rename: replacement different name → restored stays AND replacement NOT re-added", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@old" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      await seedUndoOverride(tx, showId, driveFileId, "crew_identity", "Alice", {
        name: "Alice",
        email: "a@old",
        phone: "555-OLD",
        role: "A1",
        role_flags: ["A1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
        baseline: { kind: "rename", suppressed_added: { name: "Alicia", email: "a@new" } },
      });

      // Next sync still renames Alice→Alicia.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Alicia", { email: "a@new" })]),
        snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      const rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Alice")).toBeDefined(); // restored stays
      expect(rows.find((r) => r.name === "Alicia")).toBeUndefined(); // suppressed by baseline.suppressed_added
    });
  });

  it("(c) tombstone keeps the add ABSENT — crew_identity held-absent", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedUndoOverride(tx, showId, driveFileId, "crew_identity", "Zed", {
        absent: true,
        name: "Zed",
        email: "z@x",
        baseline: { kind: "add", added: { name: "Zed", email: "z@x" } },
      });

      // Sheet still lists Zed.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Zed", { email: "z@x" })]),
        snapshot: snapshot(showId, []),
        holds: { port: holdPort(tx), baseModifiedTime: MT2 },
      });

      expect((await readCrew(tx, showId)).find((r) => r.name === "Zed")).toBeUndefined();
    });
  });

  describe("(d) release-on-reconcile is SAME-SYNC (release + apply new value in one sync)", () => {
    it("crew_email override releases when the sheet reverts, applying the sheet value same-sync", async () => {
      await inRollback(async (tx) => {
        const { showId, driveFileId } = await seedShow(tx);
        const aliceLive = crew("Alice", { email: "a@old" });
        const aliceRow = await seedCrew(tx, showId, aliceLive);
        await seedUndoOverride(tx, showId, driveFileId, "crew_email", "Alice", {
          name: "Alice",
          email: "a@old",
        });
        // Sheet reverted Alice to a@old → release; sheet value applied same sync.
        await applyParseResult(applyTx(tx), {
          driveFileId,
          parseResult: parseResult([crew("Alice", { email: "a@old" })]),
          snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
          holds: { port: holdPort(tx), baseModifiedTime: MT2 },
        });
        expect(await readHolds(tx, showId)).toHaveLength(0);
        expect((await readCrew(tx, showId)).find((r) => r.name === "Alice")!.email).toBe("a@old");
      });
    });

    it("removal-baseline override releases when the sheet re-adds the crew, applying same-sync", async () => {
      await inRollback(async (tx) => {
        const { showId, driveFileId } = await seedShow(tx);
        const aliceLive = crew("Alice", { email: "a@x" });
        const aliceRow = await seedCrew(tx, showId, aliceLive);
        await seedUndoOverride(tx, showId, driveFileId, "crew_identity", "Alice", {
          name: "Alice",
          email: "a@x",
          phone: "555-OLD",
          role: "A1",
          role_flags: ["A1"],
          date_restriction: { kind: "none" },
          stage_restriction: { kind: "none" },
          flight_info: null,
          baseline: { kind: "removal" },
        });
        // Sheet RE-ADDS Alice with a new phone → release + the new value applies same-sync.
        await applyParseResult(applyTx(tx), {
          driveFileId,
          parseResult: parseResult([crew("Alice", { email: "a@x", phone: "555-NEW" })]),
          snapshot: snapshot(showId, [prevMember(aliceRow, aliceLive)]),
          holds: { port: holdPort(tx), baseModifiedTime: MT2 },
        });
        expect(await readHolds(tx, showId)).toHaveLength(0);
        expect((await readCrew(tx, showId)).find((r) => r.name === "Alice")!.phone).toBe("555-NEW");
      });
    });

    it("tombstone releases when the sheet drops the add", async () => {
      await inRollback(async (tx) => {
        const { showId, driveFileId } = await seedShow(tx);
        await seedUndoOverride(tx, showId, driveFileId, "crew_identity", "Zed", {
          absent: true,
          name: "Zed",
          email: "z@x",
          baseline: { kind: "add", added: { name: "Zed", email: "z@x" } },
        });
        // Sheet no longer lists Zed → tombstone releases.
        await applyParseResult(applyTx(tx), {
          driveFileId,
          parseResult: parseResult([crew("Bob", { email: "b@x" })]),
          snapshot: snapshot(showId, []),
          holds: { port: holdPort(tx), baseModifiedTime: MT2 },
        });
        expect(await readHolds(tx, showId)).toHaveLength(0);
      });
    });
  });

  it("(f) reject-produced rename undo_override sticks across an unchanged sync, releases on reconcile", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@old" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      // reject-produced hold carries the SAME held_value.baseline contract as an undo.
      await seedUndoOverride(tx, showId, driveFileId, "crew_identity", "Alice", {
        name: "Alice",
        email: "a@old",
        phone: "555-OLD",
        role: "A1",
        role_flags: ["A1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
        baseline: { kind: "rename", suppressed_added: { name: "Alicia", email: "a@new" } },
      });
      const snap = () => snapshot(showId, [prevMember(aliceRow, aliceLive)]);
      const port = holdPort(tx);

      // Unchanged sync: sheet STILL has the rename → old row retained, replacement NOT added.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Alicia", { email: "a@new" })]),
        snapshot: snap(),
        holds: { port, baseModifiedTime: MT2 },
      });
      let rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Alice")).toBeDefined();
      expect(rows.find((r) => r.name === "Alicia")).toBeUndefined();
      expect(await readHolds(tx, showId)).toHaveLength(1);

      // Reconcile: sheet restores Alice (rename gone) → override releases.
      await applyParseResult(applyTx(tx), {
        driveFileId,
        parseResult: parseResult([crew("Alice", { email: "a@old" })]),
        snapshot: snap(),
        holds: { port, baseModifiedTime: "2026-06-08T14:00:00.000Z" },
      });
      expect(await readHolds(tx, showId)).toHaveLength(0);
      rows = await readCrew(tx, showId);
      expect(rows.find((r) => r.name === "Alice")).toBeDefined();
    });
  });
});
