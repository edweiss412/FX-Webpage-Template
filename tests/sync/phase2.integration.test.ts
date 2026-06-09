/**
 * Phase 2 Task 2.10 — end-to-end mixed-parse integration through runPhase2 (real DB).
 * Composes: MI-11 email hold + crew add + same-crew phone edit + change-log, all in one apply.
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { TriggeredReviewItem } from "@/lib/parser/types";
import { Phase2GateBypassError, runPhase2 } from "@/lib/sync/phase2";

import {
  crew,
  parseResult,
  phase2Tx,
  phase2TxNoHoldPort,
  readChangeLog,
  readCrew,
  readHolds,
  seedCrew,
  seedShow,
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

function runArgs(driveFileId: string, next: ReturnType<typeof parseResult>, modifiedTime: string) {
  const mi11Items: TriggeredReviewItem[] = [
    { id: "1", invariant: "MI-11", crew_name: "Alice", prior_email: "a@old", new_email: "a@new" },
  ];
  return {
    driveFileId,
    mode: "cron" as const,
    fileMeta: {
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime,
      parents: ["f"],
    },
    parseResult: next,
    binding: { bindingToken: "tok", modifiedTime },
    verifyReelOnApply: false as const,
    mi11Items: mi11Items as never,
    // No crew add/remove/rename diff items here beyond the held Alice + the added Dana; the writer
    // derives crew_added for Dana from the prev/next sets regardless of triggeredItems.
    notableItems: [] as TriggeredReviewItem[],
  };
}

describe("Phase 2 Task 2.10 — mixed-parse integration", () => {
  it("MI-11 email hold + crew add + same-crew phone edit, all in one locked apply", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedCrew(tx, showId, crew("Alice", { email: "a@old", phone: "555-OLD" }));

      const next = parseResult([
        crew("Alice", { email: "a@new", phone: "555-NEW" }), // MI-11 email + phone edit
        crew("Dana", { email: "d@x" }), // crew add
      ]);
      const result = await runPhase2(phase2Tx(tx) as never, runArgs(driveFileId, next, MT));
      expect(result.outcome).toBe("applied");

      const rows = await readCrew(tx, showId);
      const alice = rows.find((r) => r.name === "Alice")!;
      // (a) Alice's email held; her phone followed the sheet (F17).
      expect(alice.email).toBe("a@old");
      expect(alice.phone).toBe("555-NEW");
      // (b) Dana added.
      expect(rows.find((r) => r.name === "Dana")).toBeDefined();
      // (d) exactly one mi11_pending hold for Alice.
      const holds = await readHolds(tx, showId);
      expect(holds.filter((h) => h.entity_key === "Alice" && h.kind === "mi11_pending")).toHaveLength(1);

      const log = await readChangeLog(tx, showId);
      // (b) Dana has a crew_added row.
      expect(log.find((r) => r.change_kind === "crew_added" && r.entity_ref === "Dana")).toBeDefined();
      // (e) no auto_apply row double-logs Alice's held email.
      expect(log.filter((r) => r.entity_ref === "Alice")).toHaveLength(0);
    });
  });

  it("idempotent re-run of the same sheet state writes no new holds and no new change-log rows", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedCrew(tx, showId, crew("Alice", { email: "a@old", phone: "555-OLD" }));
      const next = parseResult([
        crew("Alice", { email: "a@new", phone: "555-NEW" }),
        crew("Dana", { email: "d@x" }),
      ]);

      await runPhase2(phase2Tx(tx) as never, runArgs(driveFileId, next, MT));
      const holdsAfter1 = (await readHolds(tx, showId)).length;
      const logAfter1 = (await readChangeLog(tx, showId)).length;

      // Re-run the SAME parse (Dana now exists, Alice still held).
      await runPhase2(phase2Tx(tx) as never, runArgs(driveFileId, next, MT));
      const holdsAfter2 = (await readHolds(tx, showId)).length;
      const logAfter2 = (await readChangeLog(tx, showId)).length;

      // ON CONFLICT dedups the hold; Dana is no longer an add the second time → no new crew_added.
      expect(holdsAfter2).toBe(holdsAfter1);
      expect(logAfter2).toBe(logAfter1);
    });
  });

  it("P2-F2 — a reservation-suppressed crew add gets NO crew_added show_change_log row", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedCrew(tx, showId, crew("Alice", { email: "alice@old" }));

      // Hold Alice alice@old→x@new; sheet keeps Alice at x@new AND adds a DISTINCT Alicia/x@new
      // (reservation-suppressed, never inserted into crew_members).
      const next = parseResult([
        crew("Alice", { email: "x@new" }),
        crew("Alicia", { email: "x@new" }),
      ]);
      const result = await runPhase2(phase2Tx(tx) as never, {
        driveFileId,
        mode: "cron" as const,
        fileMeta: { driveFileId, name: "s", mimeType: "x", modifiedTime: MT, parents: ["f"] },
        parseResult: next,
        binding: { bindingToken: "t", modifiedTime: MT },
        verifyReelOnApply: false as const,
        mi11Items: [
          { id: "1", invariant: "MI-11", crew_name: "Alice", prior_email: "alice@old", new_email: "x@new" },
        ] as never,
        notableItems: [] as TriggeredReviewItem[],
      });
      expect(result.outcome).toBe("applied");

      const rows = await readCrew(tx, showId);
      // (a) Alicia is ABSENT from crew_members (suppressed).
      expect(rows.find((r) => r.name === "Alicia")).toBeUndefined();

      const log = await readChangeLog(tx, showId);
      // (b) NO crew_added show_change_log row for the never-inserted Alicia.
      expect(log.find((r) => r.change_kind === "crew_added" && r.entity_ref === "Alicia")).toBeUndefined();
    });
  });

  it("P2-F6 — an MI-11 parse with NO holdPort FAILS CLOSED: throws and applies nothing", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      await seedCrew(tx, showId, crew("Alice", { email: "a@old" }));

      // Alice's email changes a@old→a@new (a real MI-11 identity change), but the tx exposes NO
      // holdPort — the gate cannot be honored, so the apply must REFUSE rather than apply ungated.
      const next = parseResult([crew("Alice", { email: "a@new" })]);
      await expect(
        runPhase2(phase2TxNoHoldPort(tx) as never, {
          driveFileId,
          mode: "cron" as const,
          fileMeta: { driveFileId, name: "s", mimeType: "x", modifiedTime: MT, parents: ["f"] },
          parseResult: next,
          binding: { bindingToken: "t", modifiedTime: MT },
          verifyReelOnApply: false as const,
          mi11Items: [
            { id: "1", invariant: "MI-11", crew_name: "Alice", prior_email: "a@old", new_email: "a@new" },
          ] as never,
          notableItems: [] as TriggeredReviewItem[],
        }),
        // (b) fail-closed signal: a typed gate-bypass error, NOT a silent pass.
      ).rejects.toBeInstanceOf(Phase2GateBypassError);

      // (a) the raw identity change did NOT reach crew_members — Alice's email is unchanged.
      const alice = (await readCrew(tx, showId)).find((r) => r.name === "Alice")!;
      expect(alice.email).toBe("a@old");
      // No MI-11 hold was written either (we refused before any mutation).
      expect(await readHolds(tx, showId)).toHaveLength(0);
    });
  });
});
