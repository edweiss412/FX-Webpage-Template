/**
 * Phase 2 Task 2.9 — write show_change_log on each auto-applied notable change.
 * DB-backed. before_image is the PRE-reconcile snapshot (incl. id + claimed_via_oauth_at, PF38);
 * entity_ref for a rename is the PRIOR name (resolution #19); change_kind is STRUCTURAL (never MI-*).
 */
import postgres, { type Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import type { TriggeredReviewItem } from "@/lib/parser/types";
import { writeAutoApplyChanges } from "@/lib/sync/changeLog/writeAutoApplyChanges";

import { crew, holdPort, prevMember, readChangeLog, seedCrew, seedShow } from "./_holdAwareTestkit";

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

describe("writeAutoApplyChanges (Task 2.9)", () => {
  it("auto-applied crew removal writes a row with the PRIOR crew row in before_image (incl id + claim)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@x" });
      const bobLive = crew("Bob", { email: "b@x", phone: "555-B", role: "V1" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      const bobRow = await seedCrew(tx, showId, bobLive, { claimed: true });

      // Bob removed (prior [Alice, Bob] → next [Alice]).
      await writeAutoApplyChanges({
        port: holdPort(tx),
        showId,
        driveFileId,
        previousCrewMembers: [prevMember(aliceRow, aliceLive), prevMember(bobRow, bobLive)],
        nextCrewMembers: [crew("Alice", { email: "a@x" })],
        triggeredItems: [],
        heldNames: new Set(),
      });

      const log = await readChangeLog(tx, showId);
      const removed = log.find((r) => r.change_kind === "crew_removed")!;
      expect(removed.source).toBe("auto_apply");
      expect(removed.change_kind).toBe("crew_removed"); // structural, never MI-*
      expect(removed.entity_ref).toBe("Bob");
      expect(removed.status).toBe("applied");
      // before_image is the pre-reconcile row (Bob's OLD values), even though Bob is gone.
      expect(removed.before_image!.email).toBe("b@x");
      expect(removed.before_image!.phone).toBe("555-B");
      // PF38: id + claim from the fixture.
      expect(removed.before_image!.id).toBe(bobRow.id);
      expect(removed.before_image!.claimed_via_oauth_at).toBe(bobRow.claimed_via_oauth_at);
      expect(removed.before_image!.claimed_via_oauth_at).not.toBeNull();
    });
  });

  it("an UNCLAIMED removed member has before_image.claimed_via_oauth_at = null", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const bobLive = crew("Bob", { email: "b@x" });
      const bobRow = await seedCrew(tx, showId, bobLive); // not claimed
      await writeAutoApplyChanges({
        port: holdPort(tx),
        showId,
        driveFileId,
        previousCrewMembers: [prevMember(bobRow, bobLive)],
        nextCrewMembers: [],
        triggeredItems: [],
        heldNames: new Set(),
      });
      const removed = (await readChangeLog(tx, showId)).find(
        (r) => r.change_kind === "crew_removed",
      )!;
      expect(removed.before_image!.claimed_via_oauth_at).toBeNull();
    });
  });

  it("auto-applied crew rename writes a crew_renamed row whose entity_ref is the PRIOR name (PF28)", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@x" });
      const aliceRow = await seedCrew(tx, showId, aliceLive, { claimed: true });
      const items: TriggeredReviewItem[] = [
        { id: "1", invariant: "MI-12", removed_name: "Alice", added_name: "Dana", email: "a@x" },
      ];
      await writeAutoApplyChanges({
        port: holdPort(tx),
        showId,
        driveFileId,
        previousCrewMembers: [prevMember(aliceRow, aliceLive)],
        nextCrewMembers: [crew("Dana", { email: "a@x" })],
        triggeredItems: items,
        heldNames: new Set(),
      });
      const renamed = (await readChangeLog(tx, showId)).find(
        (r) => r.change_kind === "crew_renamed",
      )!;
      expect(renamed.entity_ref).toBe("Alice"); // PRIOR/old name, NOT "Dana"
      expect(renamed.before_image!.id).toBe(aliceRow.id);
      expect(renamed.before_image!.claimed_via_oauth_at).toBe(aliceRow.claimed_via_oauth_at);
    });
  });

  it("no change_log row for a routine field-only sync that trips no invariant", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@x", phone: "555-OLD" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      // Only a phone change on an unchanged-identity crew; no MI fires (empty triggeredItems).
      await writeAutoApplyChanges({
        port: holdPort(tx),
        showId,
        driveFileId,
        previousCrewMembers: [prevMember(aliceRow, aliceLive)],
        nextCrewMembers: [crew("Alice", { email: "a@x", phone: "555-NEW" })],
        triggeredItems: [],
        heldNames: new Set(),
      });
      expect(await readChangeLog(tx, showId)).toHaveLength(0);
    });
  });

  it("MI-11-held change does NOT write an auto_apply row for the held crew", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const aliceLive = crew("Alice", { email: "a@old" });
      const aliceRow = await seedCrew(tx, showId, aliceLive);
      // Alice would look "removed" from a naive diff, but she's held → excluded.
      await writeAutoApplyChanges({
        port: holdPort(tx),
        showId,
        driveFileId,
        previousCrewMembers: [prevMember(aliceRow, aliceLive)],
        nextCrewMembers: [],
        triggeredItems: [],
        heldNames: new Set(["Alice"]),
      });
      const log = await readChangeLog(tx, showId);
      expect(log.filter((r) => r.entity_ref === "Alice")).toHaveLength(0);
    });
  });

  it("non-crew invariants write notification rows with before_image null", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const items: TriggeredReviewItem[] = [
        { id: "1", invariant: "MI-7", section: "hotel_reservations", prior_count: 4, new_count: 1 },
        { id: "2", invariant: "REEL_DRIFT_PENDING", reel_drive_file_id: "r1" },
      ];
      await writeAutoApplyChanges({
        port: holdPort(tx),
        showId,
        driveFileId,
        previousCrewMembers: [],
        nextCrewMembers: [],
        triggeredItems: items,
        heldNames: new Set(),
      });
      const log = await readChangeLog(tx, showId);
      const shrunk = log.find((r) => r.change_kind === "section_shrunk")!;
      const drift = log.find((r) => r.change_kind === "asset_drift")!;
      expect(shrunk.before_image).toBeNull();
      expect(drift.before_image).toBeNull();
    });
  });

  // Class C (parse-data-quality-warnings §5.3) de-dup guarantee: a recurring
  // re-sync where MULTIPLE stateful blocks fully disappear (new_count===0) still
  // writes EXACTLY ONE section_shrunk feed row and NO section_emptied — class C
  // adds no parallel feed mechanism, so the feed never double-logs a disappearance.
  it("Class C — multiple MI-7 new_count===0 items write exactly one section_shrunk row, no section_emptied", async () => {
    await inRollback(async (tx) => {
      const { showId, driveFileId } = await seedShow(tx);
      const items: TriggeredReviewItem[] = [
        { id: "1", invariant: "MI-7", section: "hotel_reservations", prior_count: 2, new_count: 0 },
        { id: "2", invariant: "MI-7", section: "rooms", prior_count: 3, new_count: 0 },
        { id: "3", invariant: "MI-7", section: "transportation", prior_count: 1, new_count: 0 },
      ];
      await writeAutoApplyChanges({
        port: holdPort(tx),
        showId,
        driveFileId,
        previousCrewMembers: [],
        nextCrewMembers: [],
        triggeredItems: items,
        heldNames: new Set(),
      });
      const log = await readChangeLog(tx, showId);
      const shrunk = log.filter((r) => r.change_kind === "section_shrunk");
      expect(shrunk.length).toBe(1);
      expect(log.some((r) => r.change_kind === "section_emptied")).toBe(false);
    });
  });
});
