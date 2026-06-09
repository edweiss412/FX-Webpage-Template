/**
 * Phase 4 Task 4.2 — undo_change Direction A: undo of removal/rename re-inserts from before_image.
 *
 * Identity continuity (PF38 / resolution #24): the restored row keeps the ORIGINAL id +
 * claimed_via_oauth_at (so the picker cookie keyed on crew_members.id still matches and the OAuth
 * claim survives). Held-present undo_override carries held_value.baseline = the undone-change
 * signature (PF13 / resolution #16) so Phase 2 releases against what the SHEET asserts, not against
 * held_value. All expected values are derived from the seeded/captured live row, never hardcoded.
 */
import type { TriggeredReviewItem } from "@/lib/parser/types";
import { afterAll, describe, expect, it } from "vitest";

import {
  callUndoAsAdmin,
  callUndoAsNonAdmin,
  closeHoldsHelpers,
  holdsSql,
  newHoldsConn,
  readChangeLog,
  readCrew,
  readCrewByName,
  readHold,
  runAutoApply,
  seedShowWithCrew,
  ADMIN_EMAIL,
} from "./_holdsHelpers";

const ALICE_CLAIMED_AT = "2026-05-01T09:00:00.000Z";

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

describe("undo_change Direction A — restore removed/renamed crew", () => {
  it("undo of a CLAIMED removal restores the same id + claim; sibling untouched; held override + undo log written", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Alice", email: "alice@old", claimed: ALICE_CLAIMED_AT },
      { name: "Bob", email: "bob@x" },
    ]);
    // Capture Alice's PRE-apply live row (anti-tautology: post-undo compares against captured values).
    const aliceLive = await readCrewByName(showId, "Alice");
    const ALICE_ID = aliceLive!.id;
    const ALICE_CLAIM = aliceLive!.claimed_via_oauth_at;
    const bobLive = await readCrewByName(showId, "Bob");

    await runAutoApply(driveFileId, { crew: [{ name: "Bob", email: "bob@x" }] }); // removes Alice
    const removed = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });

    // Non-admin authed caller is forbidden (42501) and mutates nothing.
    const denied = await callUndoAsNonAdmin(removed.id);
    expect(denied.forbidden).toBe(true);
    expect((await readCrew(showId)).map((c) => c.name)).toEqual(["Bob"]); // still removed

    const res = await callUndoAsAdmin(removed.id);
    expect(res.ok).toBe(true);

    // (1) Alice restored with the SAME id + SAME claim; Bob untouched.
    const aliceBack = await readCrewByName(showId, "Alice");
    expect(aliceBack).not.toBeNull();
    expect(aliceBack!.email).toBe("alice@old");
    expect(aliceBack!.id).toBe(ALICE_ID); // identity continuity — NOT a fresh uuid
    expect(new Date(aliceBack!.claimed_via_oauth_at as string).toISOString()).toBe(
      new Date(ALICE_CLAIM as string).toISOString(),
    );
    expect(aliceBack!.claimed_via_oauth_at).not.toBeNull();
    const bobBack = await readCrewByName(showId, "Bob");
    expect(bobBack!.id).toBe(bobLive!.id);
    expect(bobBack!.email).toBe("bob@x");

    // (2) undo_override hold with baseline {kind:'removal'}.
    const hold = await readHold(showId, { entity_key: "Alice" });
    expect(hold!.domain).toBe("crew_identity");
    expect(hold!.kind).toBe("undo_override");
    expect(hold!.held_value.email).toBe("alice@old");
    expect(hold!.proposed_value).toBeNull();
    expect(hold!.held_value.baseline).toEqual({ kind: "removal" });

    // (3) undo log row: source/status/undo_of + created_by = admin email (NOT 'system').
    const undoRow = await readChangeLog(showId, { source: "undo" } as never);
    const undo = undoRow.all.find((r) => r.source === "undo")!;
    expect(undo.status).toBe("undone");
    expect(undo.undo_of).toBe(removed.id);
    expect(undo.created_by).toBe(ADMIN_EMAIL);
    // original row flipped to undone.
    const origAfter = undoRow.all.find((r) => r.id === removed.id)!;
    expect(origAfter.status).toBe("undone");
  });

  it("UNCLAIMED control: restore keeps the same id and a NULL claim (no spurious claim)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Alice", email: "alice@old" }, // never claimed
    ]);
    const aliceLive = await readCrewByName(showId, "Alice");
    const ALICE_ID = aliceLive!.id;
    expect(aliceLive!.claimed_via_oauth_at).toBeNull();

    await runAutoApply(driveFileId, { crew: [] }); // removes Alice (now empty)
    const removed = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    const res = await callUndoAsAdmin(removed.id);
    expect(res.ok).toBe(true);

    const aliceBack = await readCrewByName(showId, "Alice");
    expect(aliceBack!.id).toBe(ALICE_ID);
    expect(aliceBack!.claimed_via_oauth_at).toBeNull();
  });

  it("undo of a RENAME restores the prior row; baseline records suppressed_added name+email", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Alice", email: "alice@old", claimed: ALICE_CLAIMED_AT },
    ]);
    const aliceLive = await readCrewByName(showId, "Alice");
    const ALICE_ID = aliceLive!.id;

    // Rename Alice → Alicia(alicia@new). MI-12 triggers a crew_renamed feed row (entity_ref = prior name).
    const items: TriggeredReviewItem[] = [
      { id: "1", invariant: "MI-12", removed_name: "Alice", added_name: "Alicia", email: "alicia@new" },
    ];
    await runAutoApply(driveFileId, {
      crew: [{ name: "Alicia", email: "alicia@new" }],
      triggeredItems: items,
    });
    const renamed = await readChangeLog(showId, { change_kind: "crew_renamed", entity_ref: "Alice" });
    expect(renamed.before_image?.id).toBe(ALICE_ID);

    const res = await callUndoAsAdmin(renamed.id);
    expect(res.ok).toBe(true);

    const aliceBack = await readCrewByName(showId, "Alice");
    expect(aliceBack!.id).toBe(ALICE_ID); // restored under the prior name with original id
    const hold = await readHold(showId, { entity_key: "Alice" });
    expect(hold!.held_value.baseline).toEqual({
      kind: "rename",
      suppressed_added: { name: "Alicia", email: "alicia@new" },
    });
  });

  // ---- PF13 next-sync baseline behavior: release against the SHEET signature, not held_value. ----

  it("(a) undo-removal holds across an UNCHANGED sheet (no re-removal)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Alice", email: "alice@old" },
      { name: "Bob", email: "bob@x" },
    ]);
    await runAutoApply(driveFileId, { crew: [{ name: "Bob", email: "bob@x" }] });
    const removed = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    expect((await callUndoAsAdmin(removed.id)).ok).toBe(true);
    // Next sync, sheet STILL omits Alice → Alice STAYS (baseline {kind:'removal'} retains her).
    await runAutoApply(driveFileId, { crew: [{ name: "Bob", email: "bob@x" }] });
    expect((await readCrew(showId)).map((c) => c.name).sort()).toEqual(["Alice", "Bob"]);
    expect(await readHold(showId, { entity_key: "Alice" })).not.toBeNull();
  });

  it("(b) undo-rename suppresses a DIFFERENT-named replacement (matched by baseline email)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    const items: TriggeredReviewItem[] = [
      { id: "1", invariant: "MI-12", removed_name: "Alice", added_name: "Alicia", email: "alicia@new" },
    ];
    await runAutoApply(driveFileId, {
      crew: [{ name: "Alicia", email: "alicia@new" }],
      triggeredItems: items,
    });
    const renamed = await readChangeLog(showId, { change_kind: "crew_renamed", entity_ref: "Alice" });
    expect((await callUndoAsAdmin(renamed.id)).ok).toBe(true);
    // Sheet now lists the replacement under YET ANOTHER name but the same email.
    await runAutoApply(driveFileId, { crew: [{ name: "Alyx", email: "alicia@new" }] });
    const names = (await readCrew(showId)).map((c) => c.name);
    expect(names).toContain("Alice"); // restored Alice STAYS
    expect(names).not.toContain("Alyx"); // replacement NOT re-added (matched by baseline email)
  });

  it("(c) release on reconcile — sheet re-contains the entity / drops the replacement", async () => {
    // removal case: sheet re-adds Alice → hold releases, sheet value applies.
    const a = await seedShowWithCrew([
      { name: "Alice", email: "alice@old" },
      { name: "Bob", email: "bob@x" },
    ]);
    await runAutoApply(a.driveFileId, { crew: [{ name: "Bob", email: "bob@x" }] });
    const removed = await readChangeLog(a.showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    await callUndoAsAdmin(removed.id);
    await runAutoApply(a.driveFileId, {
      crew: [
        { name: "Alice", email: "alice@old" },
        { name: "Bob", email: "bob@x" },
      ],
    });
    expect(await readHold(a.showId, { entity_key: "Alice" })).toBeNull(); // released

    // rename case: sheet drops the replacement entirely → hold releases.
    const b = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    const items: TriggeredReviewItem[] = [
      { id: "1", invariant: "MI-12", removed_name: "Alice", added_name: "Alicia", email: "alicia@new" },
    ];
    await runAutoApply(b.driveFileId, {
      crew: [{ name: "Alicia", email: "alicia@new" }],
      triggeredItems: items,
    });
    const renamed = await readChangeLog(b.showId, { change_kind: "crew_renamed", entity_ref: "Alice" });
    await callUndoAsAdmin(renamed.id);
    await runAutoApply(b.driveFileId, { crew: [{ name: "Alice", email: "alice@old" }] });
    expect(await readHold(b.showId, { entity_key: "Alice" })).toBeNull(); // released
  });

  it("concurrent show-lock holder serializes undo (no deadlock; undo blocks then completes, PF11)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    await runAutoApply(driveFileId, { crew: [] }); // remove Alice → R1
    const r1 = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });

    // A second connection holds the per-show advisory lock (the sync-path lock) in an OPEN txn.
    const blocker = newHoldsConn();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let undoStarted = false;
    let undoFinished = false;
    const blockerTxn = blocker
      .begin(async (tx) => {
        await tx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
        await held; // hold the lock until the test releases it
      })
      .catch(() => {});

    // Give the blocker time to acquire the lock, then fire undo — it must BLOCK on the advisory lock
    // (advisory-before-row order means no deadlock), not error.
    await new Promise((r) => setTimeout(r, 150));
    const undoPromise = (async () => {
      undoStarted = true;
      const res = await callUndoAsAdmin(r1.id);
      undoFinished = true;
      return res;
    })();

    // While the blocker holds the lock, undo has started but not finished (it's waiting on the lock).
    await new Promise((r) => setTimeout(r, 200));
    expect(undoStarted).toBe(true);
    expect(undoFinished).toBe(false);

    // Release the blocker → undo proceeds and succeeds (serialized, no deadlock).
    release();
    await blockerTxn;
    const res = await undoPromise;
    expect(res.ok).toBe(true);
    expect(undoFinished).toBe(true);
    expect(await readCrewByName(showId, "Alice")).not.toBeNull();
    await blocker.end({ timeout: 5 });
  });
});
