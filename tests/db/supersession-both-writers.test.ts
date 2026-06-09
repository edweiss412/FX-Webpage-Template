/**
 * Phase 4 P4-F2 (HIGH) — supersession cleanup must run on EVERY writer of an APPLIED crew-identity
 * change-log row, not only the Phase-2 auto-apply tail. mi11_approve_hold ALSO writes applied
 * crew-domain rows (crew_removed / crew_renamed / crew_email_changed) and deletes the resolved
 * holds; without calling cleanup_superseded_before_images before returning, an OLDER auto-apply
 * rename/add row stays status='applied' with before_image intact, so undo_change(originalRename/Add)
 * is still accepted and restores/deletes STALE crew despite the newer approved change.
 *
 * Both-writers coverage: (1) auto-apply rename THEN mi11-approve removal of the successor; (2)
 * auto-apply add THEN mi11-approve a removal whose successor identity matches the added member; (3)
 * control — the Phase-2-only auto-apply→auto-apply path stays superseded.
 */
import type { TriggeredReviewItem } from "@/lib/parser/types";
import { afterAll, describe, expect, it } from "vitest";

import {
  callApproveAsAdmin,
  callUndoAsAdmin,
  closeHoldsHelpers,
  holdsSql,
  readChangeLog,
  readCrew,
  readCrewByName,
  readHoldsByShow,
  runAutoApply,
  seedMi11Hold,
  seedShowWithCrew,
} from "./_holdsHelpers";

const MT = "2026-06-08T15:00:00.000Z";

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

/** Build the crew_email held_value (prior live row) the approve path expects. */
function heldValue(name: string, email: string | null): Record<string, unknown> {
  return {
    name,
    email,
    phone: "555-OLD",
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

describe("supersession cleanup runs on BOTH applied-crew-identity writers (P4-F2)", () => {
  it("auto-apply rename THEN mi11_approve removal of the successor supersedes the original rename row", async () => {
    // Start: Alice. Auto-apply rename Alice→Alicia (older crew_renamed R1, entity_ref='Alice').
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    const items: TriggeredReviewItem[] = [
      { id: "1", invariant: "MI-12", removed_name: "Alice", added_name: "Alicia", email: "alicia@new" },
    ];
    await runAutoApply(driveFileId, {
      crew: [{ name: "Alicia", email: "alicia@new" }],
      triggeredItems: items,
    });
    const r1 = await readChangeLog(showId, { change_kind: "crew_renamed", entity_ref: "Alice" });
    expect(r1.status).toBe("applied");
    expect(r1.before_image).not.toBeNull();

    // MI-11 approve a REMOVAL of Alicia (the successor). Seed a pending hold + approve.
    const hold = await seedMi11Hold(
      { showId, driveFileId },
      {
        entityKey: "Alicia",
        heldValue: heldValue("Alicia", "alicia@new"),
        proposedValue: { disposition: "removal" },
        baseModifiedTime: MT,
      },
    );
    const approve = await callApproveAsAdmin(hold.id, MT, hold.baseModifiedTime);
    expect(approve.ok).toBe(true);
    expect(await readCrewByName(showId, "Alicia")).toBeNull(); // Alicia removed

    // R1 (the original rename) must now be superseded + before_image nulled by cleanup in approve.
    const r1After = (await readChangeLog(showId)).all.find((r) => r.id === r1.id)!;
    expect(r1After.status).toBe("superseded");
    expect(r1After.before_image).toBeNull();

    // undo_change(R1) → UNDO_SUPERSEDED, ZERO mutation (no stale Alice restored).
    const crewBefore = await readCrew(showId);
    const undo = await callUndoAsAdmin(r1.id);
    expect(undo.ok).toBe(false);
    expect(undo.code).toBe("UNDO_SUPERSEDED");
    expect(await readCrewByName(showId, "Alice")).toBeNull();
    expect((await readCrew(showId)).map((c) => c.name)).toEqual(crewBefore.map((c) => c.name));
  });

  it("auto-apply add THEN mi11_approve removal of that member supersedes the original add row", async () => {
    // Auto-apply adds Bob (older crew_added R2, entity_ref='Bob', before_image NULL).
    const { showId, driveFileId } = await seedShowWithCrew([]);
    await runAutoApply(driveFileId, { crew: [{ name: "Bob", email: "bob@x" }] });
    const r2 = await readChangeLog(showId, { change_kind: "crew_added", entity_ref: "Bob" });
    expect(r2.status).toBe("applied");

    // MI-11 approve a REMOVAL of Bob → newer applied crew_removed row entity_ref='Bob'.
    const hold = await seedMi11Hold(
      { showId, driveFileId },
      {
        entityKey: "Bob",
        heldValue: heldValue("Bob", "bob@x"),
        proposedValue: { disposition: "removal" },
        baseModifiedTime: MT,
      },
    );
    expect((await callApproveAsAdmin(hold.id, MT, hold.baseModifiedTime)).ok).toBe(true);

    const r2After = (await readChangeLog(showId)).all.find((r) => r.id === r2.id)!;
    expect(r2After.status).toBe("superseded");

    const undo = await callUndoAsAdmin(r2.id);
    expect(undo.ok).toBe(false);
    expect(undo.code).toBe("UNDO_SUPERSEDED");
    // No phantom Bob deleted/tombstoned (he's already gone; assert no new undo_override hold/log).
    expect((await readHoldsByShow(showId)).filter((h) => h.entity_key === "Bob")).toHaveLength(0);
  });

  it("CONTROL — the Phase-2 auto-apply→auto-apply successor path stays superseded (no regression)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    await runAutoApply(driveFileId, { crew: [] }); // remove Alice → R1
    const r1 = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    await runAutoApply(driveFileId, { crew: [{ name: "Alice", email: "alice@v2" }] }); // newer same-entity
    const r1After = (await readChangeLog(showId)).all.find((r) => r.id === r1.id)!;
    expect(r1After.status).toBe("superseded");
    expect(r1After.before_image).toBeNull();
  });
});
