/**
 * Phase 4 Task 4.3 — undo_change Direction B: crew_added tombstone (F11).
 *
 * Undo of an applied add has no before_image to restore — instead DELETE the added row, revoke its
 * claim (the DELETE removes claimed_via_oauth_at), and write a held-ABSENT undo_override the apply
 * honors by suppressing the re-add until the sheet stops listing them.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  callUndoAsAdmin,
  closeHoldsHelpers,
  holdsSql,
  readChangeLog,
  readCrew,
  readHold,
  runAutoApply,
  seedShowWithCrew,
} from "./_holdsHelpers";

const BOB = { name: "Bob", email: "bob@x" };
const CAROL = { name: "Carol", email: "carol@new" };

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

describe("undo_change Direction B — crew_added tombstone (F11)", () => {
  it("undone add is not re-created while sheet still lists them; removing from sheet releases the tombstone", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([BOB]);
    await runAutoApply(driveFileId, { crew: [BOB, CAROL] }); // adds Carol
    const added = await readChangeLog(showId, {
      change_kind: "crew_added",
      entity_ref: CAROL.name,
    });
    expect(added.before_image).toBeNull();

    const res = await callUndoAsAdmin(added.id);
    expect(res.ok).toBe(true);

    // (1) Carol removed; Bob untouched.
    expect((await readCrew(showId)).map((c) => c.name)).toEqual([BOB.name]);

    // (3) held-absent tombstone with symmetric baseline {kind:'add'}.
    const hold = await readHold(showId, { entity_key: CAROL.name });
    expect(hold!.proposed_value).toBeNull();
    expect(hold!.held_value).toEqual({
      absent: true,
      name: CAROL.name,
      email: CAROL.email,
      baseline: { kind: "add", added: { name: CAROL.name, email: CAROL.email } },
    });

    // original crew_added row flipped to undone + undo log row written.
    const log = await readChangeLog(showId);
    expect(log.all.find((r) => r.id === added.id)!.status).toBe("undone");
    expect(log.all.some((r) => r.source === "undo" && r.undo_of === added.id)).toBe(true);

    // (4) F11 core: next sync, sheet UNCHANGED → Carol NOT re-created.
    await runAutoApply(driveFileId, { crew: [BOB, CAROL] });
    expect((await readCrew(showId)).map((c) => c.name)).toEqual([BOB.name]);

    // (5) release: a sync that DROPS Carol releases the tombstone.
    await runAutoApply(driveFileId, { crew: [BOB] });
    expect(await readHold(showId, { entity_key: CAROL.name })).toBeNull();
  });

  it("a CLAIMED added member's claim is revoked with the row on tombstone", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([BOB]);
    await runAutoApply(driveFileId, { crew: [BOB, CAROL] });
    // Simulate Carol claiming after the add (claim lives on crew_members.claimed_via_oauth_at).
    await holdsSql`
      update public.crew_members set claimed_via_oauth_at = now()
       where show_id = ${showId} and name = ${CAROL.name}`;
    const added = await readChangeLog(showId, {
      change_kind: "crew_added",
      entity_ref: CAROL.name,
    });
    const res = await callUndoAsAdmin(added.id);
    expect(res.ok).toBe(true);
    // Carol's row (and thus her claim) is gone.
    expect((await readCrew(showId)).find((c) => c.name === CAROL.name)).toBeUndefined();
  });

  it("double-undo of a tombstone → 2nd is UNDO_SUPERSEDED; exactly one tombstone hold", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([BOB]);
    await runAutoApply(driveFileId, { crew: [BOB, CAROL] });
    const added = await readChangeLog(showId, {
      change_kind: "crew_added",
      entity_ref: CAROL.name,
    });
    expect((await callUndoAsAdmin(added.id)).ok).toBe(true);
    const second = await callUndoAsAdmin(added.id);
    expect(second.ok).toBe(false);
    expect(second.code).toBe("UNDO_SUPERSEDED");
    const holds = (await readChangeLog(showId)).all; // smoke: only one undo row
    expect(holds.filter((r) => r.source === "undo" && r.undo_of === added.id)).toHaveLength(1);
  });
});
