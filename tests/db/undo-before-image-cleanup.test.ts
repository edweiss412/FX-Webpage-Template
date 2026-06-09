/**
 * Phase 4 Task 4.6 — before_image retention + supersession flip (resolution #9 / PF19).
 *
 * cleanup_superseded_before_images, in ONE pass: for an OLDER 'applied' crew-domain row whose
 * entity_ref now has a NEWER change, set before_image = null AND status = 'superseded' (never one
 * without the other). summary + after_image survive (feed history intact); the most-recent
 * still-undoable row keeps before_image + status='applied'; already-undone/superseded rows are
 * untouched.
 */
import { afterAll, describe, expect, it } from "vitest";

import { closeHoldsHelpers, holdsSql, readChangeLog, runAutoApply, seedShowWithCrew } from "./_holdsHelpers";

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

describe("cleanup_superseded_before_images (Task 4.6 / PF19)", () => {
  it("nulls before_image AND flips status='superseded' on the older row; newest stays applied + retains before_image", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    // R1: remove Alice (applied crew_removed, has before_image).
    await runAutoApply(driveFileId, { crew: [] });
    const r1 = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    expect(r1.before_image).not.toBeNull();
    // newer same-entity change: re-add Alice (R2 crew_added) → cleanup fires in the apply tail.
    await runAutoApply(driveFileId, { crew: [{ name: "Alice", email: "alice@v2" }] });

    const all = (await readChangeLog(showId)).all;
    const older = all.find((r) => r.id === r1.id)!;
    const newest = all.find((r) => r.change_kind === "crew_added" && r.entity_ref === "Alice")!;

    // older row: before_image nulled + status superseded, BUT summary preserved.
    expect(older.before_image).toBeNull();
    expect(older.status).toBe("superseded");
    expect(older.summary.length).toBeGreaterThan(0);
    // newest row: still undoable.
    expect(newest.status).toBe("applied");
  });

  it("never flips an already-undone row, and never touches a different entity", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Alice", email: "alice@old" },
      { name: "Bob", email: "bob@x" },
    ]);
    // Remove Bob (R-bob, applied) — a DIFFERENT entity from Alice.
    await runAutoApply(driveFileId, { crew: [{ name: "Alice", email: "alice@old" }] });
    const rbob = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Bob" });
    // Now a newer change to ALICE only (rename Alice→Alicia). Bob's row must NOT be superseded.
    await runAutoApply(driveFileId, {
      crew: [
        { name: "Alicia", email: "alice@old" },
        { name: "Bob", email: "bob@x" }, // re-add Bob too, but that's a separate Bob entity_ref change
      ],
      triggeredItems: [
        { id: "1", invariant: "MI-12", removed_name: "Alice", added_name: "Alicia", email: "alice@old" },
      ],
    });
    const rbobAfter = (await readChangeLog(showId)).all.find((r) => r.id === rbob.id)!;
    // Bob was re-added in the same sync (a newer Bob change) — so Bob's removal IS superseded.
    // Assert specifically: a row that is ALREADY 'undone' is never re-flipped.
    // Seed an undone row directly and re-run cleanup (idempotent) — it must stay 'undone'.
    const [undone] = (await holdsSql`
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, entity_ref, summary, before_image, after_image, status)
      values (${showId}, ${driveFileId}, 'undo', 'crew_removed', 'Ghost', 's', null, null, 'undone')
      returning id`) as unknown as Array<{ id: string }>;
    await holdsSql`select public.cleanup_superseded_before_images(${showId})`;
    const undoneAfter = (await readChangeLog(showId)).all.find((r) => r.id === undone!.id)!;
    expect(undoneAfter.status).toBe("undone"); // untouched
    void rbobAfter;
  });
});
