/**
 * Phase 4 Task 4.4 — undo_change guards.
 *
 *  - UNDO_SUPERSEDED: single status<>'applied' check (covers double-submit AND newer-supersession
 *    via cleanup_superseded_before_images flipping the row to 'superseded' + nulling before_image).
 *  - UNDO_EMAIL_CLAIMED: prior email now owned by a DIFFERENT crew member (claimed OR unclaimed,
 *    matching the partial unique index) → typed result, ZERO mutation, NOT a raw 23505.
 *  - change_kind security boundary (PF22): a non-undoable applied row (crew_email_changed /
 *    section_shrunk / field_changed) → UNDO_NOT_FOUND, ZERO mutation.
 *  - Double-undo idempotency (PF16): 1st ok, 2nd UNDO_SUPERSEDED; exactly one undo row + one hold.
 *  - Stale-undo no-corruption (PF19 end-to-end): a superseded crew_removed row rejects instead of
 *    tombstone-deleting current crew.
 */
import type { TriggeredReviewItem } from "@/lib/parser/types";
import { afterAll, describe, expect, it } from "vitest";

import { messageFor } from "@/lib/messages/lookup";

import {
  callUndoAsAdmin,
  closeHoldsHelpers,
  holdsSql,
  readChangeLog,
  readCrew,
  readCrewByName,
  readHold,
  readHoldsByShow,
  runAutoApply,
  seedShowWithCrew,
} from "./_holdsHelpers";

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

describe("undo_change guards", () => {
  it("SUPERSEDED — a newer same-entity sync flips R1 to superseded; undo(R1) → UNDO_SUPERSEDED, no stale restore", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    await runAutoApply(driveFileId, { crew: [] }); // remove Alice → R1 crew_removed
    const r1 = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    // newer change to the SAME entity: re-add Alice with a new email.
    await runAutoApply(driveFileId, { crew: [{ name: "Alice", email: "alice@v2" }] });

    // R1 is now superseded + before_image nulled by cleanup.
    const r1After = (await readChangeLog(showId)).all.find((r) => r.id === r1.id)!;
    expect(r1After.status).toBe("superseded");
    expect(r1After.before_image).toBeNull();

    const res = await callUndoAsAdmin(r1.id);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_SUPERSEDED");
    // Alice still alice@v2 — no stale restore of alice@old.
    expect((await readCrewByName(showId, "Alice"))!.email).toBe("alice@v2");
  });

  it("EMAIL_CLAIMED (claimed) — prior email now held by a different CLAIMED member → typed, zero mutation", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    await runAutoApply(driveFileId, { crew: [] }); // remove Alice → R1
    const r1 = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    // a DIFFERENT member Dana now holds alice@old, claimed.
    await holdsSql`
      insert into public.crew_members
        (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, claimed_via_oauth_at)
      values (${showId}, 'Dana', 'alice@old', '555', 'A1', ${["A1"]},
              ${holdsSql.json({ kind: "none" })}, ${holdsSql.json({ kind: "none" })}, null, now())`;

    const res = await callUndoAsAdmin(r1.id);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_EMAIL_CLAIMED");
    // no Alice insert; Dana intact + claimed.
    expect(await readCrewByName(showId, "Alice")).toBeNull();
    const dana = await readCrewByName(showId, "Dana");
    expect(dana!.claimed_via_oauth_at).not.toBeNull();
    expect(await readHold(showId, { entity_key: "Alice" })).toBeNull();
  });

  it("EMAIL_CLAIMED (unclaimed, PF27) — prior email held by a different UNCLAIMED member → typed, NOT a raw 23505", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    await runAutoApply(driveFileId, { crew: [] });
    const r1 = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    await holdsSql`
      insert into public.crew_members
        (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, claimed_via_oauth_at)
      values (${showId}, 'Dana', 'alice@old', '555', 'A1', ${["A1"]},
              ${holdsSql.json({ kind: "none" })}, ${holdsSql.json({ kind: "none" })}, null, null)`;

    const res = await callUndoAsAdmin(r1.id); // typed result, NOT a thrown unique-violation
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_EMAIL_CLAIMED");
    expect(await readCrewByName(showId, "Alice")).toBeNull();
    expect(await readHoldsByShow(showId)).toHaveLength(0);
  });

  it("name-collision (PF28 defense-in-depth) — restore-target name held by a DIFFERENT-email live row → UNDO_SUPERSEDED", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    await runAutoApply(driveFileId, { crew: [] });
    const r1 = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    // A different-email live row already occupies the name "Alice" (cleanup has NOT yet flipped R1).
    await holdsSql`
      insert into public.crew_members
        (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, claimed_via_oauth_at)
      values (${showId}, 'Alice', 'alice@fresh', '555', 'A1', ${["A1"]},
              ${holdsSql.json({ kind: "none" })}, ${holdsSql.json({ kind: "none" })}, null, null)`;
    const res = await callUndoAsAdmin(r1.id);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_SUPERSEDED");
    // the newer live Alice row is untouched.
    expect((await readCrewByName(showId, "Alice"))!.email).toBe("alice@fresh");
  });

  it("change_kind security boundary (PF22) — crew_email_changed / section_shrunk / field_changed → UNDO_NOT_FOUND, zero mutation", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@x" }]);
    // Seed three non-undoable APPLIED rows directly (a crew_email_changed HAS a before_image).
    const [emailChanged] = (await holdsSql`
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, entity_ref, summary, before_image, after_image, status)
      values (${showId}, ${driveFileId}, 'mi11_approve', 'crew_email_changed', 'Alice', 's',
              ${holdsSql.json({ id: "x", name: "Alice", email: "alice@x" })}, null, 'applied')
      returning id`) as unknown as Array<{ id: string }>;
    const [shrunk] = (await holdsSql`
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, entity_ref, summary, before_image, after_image, status)
      values (${showId}, ${driveFileId}, 'auto_apply', 'section_shrunk', null, 's', null, null, 'applied')
      returning id`) as unknown as Array<{ id: string }>;
    const [fieldChanged] = (await holdsSql`
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, entity_ref, summary, before_image, after_image, status)
      values (${showId}, ${driveFileId}, 'auto_apply', 'field_changed', null, 's', null, null, 'applied')
      returning id`) as unknown as Array<{ id: string }>;

    const crewBefore = await readCrew(showId);
    for (const row of [emailChanged!, shrunk!, fieldChanged!]) {
      const res = await callUndoAsAdmin(row.id);
      expect(res.ok).toBe(false);
      expect(res.code).toBe("UNDO_NOT_FOUND");
    }
    // zero mutation: crew unchanged, no holds, the orig rows stay 'applied'.
    expect(await readCrew(showId)).toEqual(crewBefore);
    expect(await readHoldsByShow(showId)).toHaveLength(0);
    const log = (await readChangeLog(showId)).all;
    expect(log.filter((r) => r.source === "undo")).toHaveLength(0);
    expect(log.find((r) => r.id === emailChanged!.id)!.status).toBe("applied");
  });

  it("UNDO_NOT_FOUND for a nonexistent change-log id", async () => {
    const res = await callUndoAsAdmin("00000000-0000-0000-0000-0000000000ff");
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_NOT_FOUND");
  });

  it("double-undo (Direction A) — 1st ok, 2nd UNDO_SUPERSEDED; exactly one undo row + one hold", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Alice", email: "alice@old" },
      { name: "Bob", email: "bob@x" },
    ]);
    await runAutoApply(driveFileId, { crew: [{ name: "Bob", email: "bob@x" }] }); // remove Alice
    const removed = await readChangeLog(showId, {
      change_kind: "crew_removed",
      entity_ref: "Alice",
    });
    expect((await callUndoAsAdmin(removed.id)).ok).toBe(true);
    const second = await callUndoAsAdmin(removed.id);
    expect(second.ok).toBe(false);
    expect(second.code).toBe("UNDO_SUPERSEDED");

    const log = (await readChangeLog(showId)).all;
    expect(log.filter((r) => r.source === "undo" && r.undo_of === removed.id)).toHaveLength(1);
    expect(log.find((r) => r.id === removed.id)!.status).toBe("undone");
    const aliceHolds = (await readHoldsByShow(showId)).filter(
      (h) => h.entity_key === "Alice" && h.kind === "undo_override",
    );
    expect(aliceHolds).toHaveLength(1);
  });

  it("undoable codes resolve to non-null catalog copy (invariant 5)", () => {
    for (const code of ["UNDO_SUPERSEDED", "UNDO_EMAIL_CLAIMED", "UNDO_NOT_FOUND"] as const) {
      expect(messageFor(code)).not.toBeNull();
    }
  });

  it("STALE-UNDO NO-CORRUPTION (PF19 end-to-end) — superseded crew_removed rejects, does NOT tombstone current crew", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    await runAutoApply(driveFileId, { crew: [] }); // remove Alice → R1 (applied, has before_image)
    const r1 = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: "Alice" });
    // a newer same-entity sync (re-add Alice) fires cleanup.
    const items: TriggeredReviewItem[] = [];
    await runAutoApply(driveFileId, {
      crew: [{ name: "Alice", email: "alice@v2" }],
      triggeredItems: items,
    });
    const r1After = (await readChangeLog(showId)).all.find((r) => r.id === r1.id)!;
    expect(r1After.status).toBe("superseded");
    expect(r1After.before_image).toBeNull();

    const res = await callUndoAsAdmin(r1.id);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_SUPERSEDED");
    // current Alice still present (NOT tombstone-deleted via a null-before_image fallthrough).
    expect((await readCrewByName(showId, "Alice"))!.email).toBe("alice@v2");
  });
});
