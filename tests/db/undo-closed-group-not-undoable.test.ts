/**
 * Phase 4 P4-F4 (MEDIUM) — closed-group (multi-node) approvals are NOT individually undoable.
 *
 * A 2-person rename swap (Alice→Bob, Bob→Alice) approved atomically writes TWO applied crew_renamed
 * rows sharing occurred_at=now(); cleanup never supersedes them, but undoing one always fails the
 * restore-target name guard → a perpetually-failing Undo button. Fix: mi11_approve_hold writes
 * multi-node group rows with individually_undoable=false; undo_change rejects them (UNDO_NOT_FOUND,
 * zero mutation). Single-node approvals + Phase-2 auto-apply rows keep individually_undoable=true.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  asAdminTx,
  callApprove,
  closeMi11Helpers,
  heldFromCrew,
  mi11Sql,
  readChangeLogByShow,
  readCrewByName,
  seedCrew,
  seedHold,
  seedShow,
} from "./_mi11Helpers";

const T1 = "2026-06-08T12:00:00.000Z";

afterAll(async () => {
  await closeMi11Helpers();
});

async function callUndo(changeLogId: string): Promise<{ ok: boolean; code?: string }> {
  return asAdminTx(async (tx) => {
    const [row] = await tx.unsafe(`select public.undo_change($1::uuid) as r`, [changeLogId]);
    return (row as unknown as { r: { ok: boolean; code?: string } }).r;
  });
}

/** Read individually_undoable for a change-log row. */
async function readUndoable(changeLogId: string): Promise<boolean> {
  const [row] = (await mi11Sql`
    select individually_undoable from public.show_change_log where id = ${changeLogId}`) as unknown as Array<{
    individually_undoable: boolean;
  }>;
  return row!.individually_undoable;
}

describe("closed-group approvals are not individually undoable (P4-F4)", () => {
  it("a 2-person rename swap writes BOTH crew_renamed rows individually_undoable=false; undo → UNDO_NOT_FOUND, zero mutation", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "a@x" });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "b@x" });
    const aliceHold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "a@x"),
      proposedValue: { disposition: "rename", name: "Bob", email: "a@x" },
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "b@x"),
      proposedValue: { disposition: "rename", name: "Alice", email: "b@x" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, aliceHold.id, T1, T1));
    expect(res).toEqual({ ok: true });

    const log = await readChangeLogByShow(mi11Sql, show.showId);
    const renames = log.filter((r) => r.change_kind === "crew_renamed");
    expect(renames).toHaveLength(2);
    for (const r of renames) {
      expect(await readUndoable(r.id)).toBe(false); // multi-node → not individually undoable
    }

    // undo_change on either group row → UNDO_NOT_FOUND, ZERO mutation (the swap stays intact).
    const swapBefore = {
      bob: (await readCrewByName(mi11Sql, show.showId, "Bob"))?.email,
      alice: (await readCrewByName(mi11Sql, show.showId, "Alice"))?.email,
    };
    const undo = await callUndo(renames[0]!.id);
    expect(undo.ok).toBe(false);
    expect(undo.code).toBe("UNDO_NOT_FOUND");
    expect((await readCrewByName(mi11Sql, show.showId, "Bob"))?.email).toBe(swapBefore.bob);
    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe(swapBefore.alice);
    // the group row stays 'applied' (untouched) and no undo log row was written.
    const after = await readChangeLogByShow(mi11Sql, show.showId);
    expect(after.find((r) => r.id === renames[0]!.id)!.status).toBe("applied");
    expect(after.filter((r) => r.source === "undo")).toHaveLength(0);
  });

  it("CONTROL — a single-node rename approval row is individually_undoable=true and undo works (true reversal)", async () => {
    const show = await seedShow(mi11Sql);
    const seededAlice = await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "a@x",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    // Single-node rename Alice→Dana (Dana's name+email are free → group size 1).
    const aliceHold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "a@x"),
      proposedValue: { disposition: "rename", name: "Dana", email: "d@y" },
      baseModifiedTime: T1,
    });
    expect((await asAdminTx((tx) => callApprove(tx, aliceHold.id, T1, T1)))).toEqual({ ok: true });

    const renamed = (await readChangeLogByShow(mi11Sql, show.showId)).find(
      (r) => r.change_kind === "crew_renamed" && r.entity_ref === "Alice",
    )!;
    expect(await readUndoable(renamed.id)).toBe(true);

    const undo = await callUndo(renamed.id);
    expect(undo.ok).toBe(true);
    // Alice restored (true reversal P4-F3): her original id back, Dana gone.
    const aliceBack = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(aliceBack?.id).toBe(seededAlice.id);
    expect(await readCrewByName(mi11Sql, show.showId, "Dana")).toBeNull();
    void seededAlice;
  });
});
