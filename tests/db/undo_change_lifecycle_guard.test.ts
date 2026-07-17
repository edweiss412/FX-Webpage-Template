/**
 * BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD — undo_change archived + finalize-owned guard.
 *
 * undo_change must refuse an archived (read-only) or mid-finalize show, returning a structured
 * { ok:false, code } (matching its UNDO_NOT_FOUND pattern). It is NOT published-gated — a Held
 * (unpublished, non-finalize) show must still be undoable (the key negative-regression).
 *
 * Each refusal case exercises the Direction-B path: undo of a `crew_added` row delegates to
 * _undo_tombstone (20260608000003:151). The guard is placed BEFORE that delegation, so the archived
 * case proves the guard fires first (crew row-count unchanged on refusal).
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  callUndoAsAdmin,
  closeHoldsHelpers,
  holdsSql,
  readChangeLog,
  readCrew,
  runAutoApply,
  seedShowWithCrew,
} from "./_holdsHelpers";

const BOB = { name: "Bob", email: "bob@x" };
const CAROL = { name: "Carol", email: "carol@new" };

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

/** Seed a Live show + Bob, auto-apply adding Carol (a crew_added / Direction-B change), return the log id. */
async function seedCrewAddedRow(): Promise<{
  showId: string;
  driveFileId: string;
  addedId: string;
}> {
  const { showId, driveFileId } = await seedShowWithCrew([BOB]);
  await runAutoApply(driveFileId, { crew: [BOB, CAROL] });
  const added = await readChangeLog(showId, { change_kind: "crew_added", entity_ref: CAROL.name });
  return { showId, driveFileId, addedId: added.id };
}

async function setArchived(driveFileId: string): Promise<void> {
  await holdsSql`update public.shows set archived=true, published=false where drive_file_id=${driveFileId}`;
}
async function setHeld(driveFileId: string): Promise<void> {
  await holdsSql`update public.shows set published=false where drive_file_id=${driveFileId}`;
}
async function setFinalizeOwned(showId: string, driveFileId: string): Promise<void> {
  await holdsSql`update public.shows set published=false where drive_file_id=${driveFileId}`;
  const [w] = await holdsSql<{ wid: string }[]>`select gen_random_uuid() as wid`;
  await holdsSql`
    insert into public.shows_pending_changes (wizard_session_id, drive_file_id, show_id, payload, applied_by_email, applied_at_intent)
    values (${w!.wid}::uuid, ${driveFileId}, ${showId}::uuid, '{}'::jsonb, 'dlarson@fxav.net', now())`;
  await holdsSql`
    insert into public.wizard_finalize_checkpoints (wizard_session_id, status)
    values (${w!.wid}::uuid, 'in_progress')`;
}

describe("undo_change — archived + finalize-owned lifecycle guard", () => {
  it("archived show → UNDO_SHOW_ARCHIVED (Direction B; crew row-count unchanged)", async () => {
    const { showId, driveFileId, addedId } = await seedCrewAddedRow();
    const before = (await readCrew(showId)).length;
    await setArchived(driveFileId);
    const res = await callUndoAsAdmin(addedId);
    expect(res).toMatchObject({ ok: false, code: "UNDO_SHOW_ARCHIVED" });
    expect((await readCrew(showId)).length).toBe(before); // guard fired before _undo_tombstone deleted Carol
  });

  it("finalize-owned show → UNDO_FINALIZE_OWNED", async () => {
    const { showId, driveFileId, addedId } = await seedCrewAddedRow();
    await setFinalizeOwned(showId, driveFileId);
    const res = await callUndoAsAdmin(addedId);
    expect(res).toMatchObject({ ok: false, code: "UNDO_FINALIZE_OWNED" });
  });

  it("Held (unpublished, non-finalize) show → undo SUCCEEDS (NOT published-gated)", async () => {
    const { showId, driveFileId, addedId } = await seedCrewAddedRow();
    await setHeld(driveFileId);
    const res = await callUndoAsAdmin(addedId);
    expect(res.ok).toBe(true); // undo works on a Held show being re-prepared
    expect((await readCrew(showId)).map((c) => c.name)).toEqual([BOB.name]); // Carol undone
  });

  it("Live show → undo SUCCEEDS (unchanged happy path)", async () => {
    const { showId, addedId } = await seedCrewAddedRow();
    const res = await callUndoAsAdmin(addedId);
    expect(res.ok).toBe(true);
    expect((await readCrew(showId)).map((c) => c.name)).toEqual([BOB.name]);
  });
});
