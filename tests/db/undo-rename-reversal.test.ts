/**
 * Phase 4 P4-F3 (HIGH) — crew_renamed undo must be a TRUE reversal: DELETE the rename SUCCESSOR
 * (named in after_image) THEN restore the prior row from before_image. A rename was applied as
 * delete-old + insert-new (Alice→Dana); undo without deleting Dana strands the case:
 *  - SAME-EMAIL rename (Alice(a@x)→Dana(a@x)): Dana still owns a@x under a different name → the
 *    generic email-collision guard wrongly returns UNDO_EMAIL_CLAIMED, so Alice can never be
 *    restored.
 *  - CHANGED-EMAIL rename (Alice(a@x)→Dana(b@y)): undo restores Alice but leaves Dana live → dual
 *    identity (corruption window) until a later sync.
 * The successor delete frees BOTH the successor's name and email, so the prior-email guard then only
 * trips on a GENUINELY unrelated owner.
 */
import type { TriggeredReviewItem } from "@/lib/parser/types";
import { afterAll, describe, expect, it } from "vitest";

import {
  callUndoAsAdmin,
  closeHoldsHelpers,
  holdsSql,
  readChangeLog,
  readCrew,
  readCrewByName,
  readHoldsByShow,
  runAutoApply,
  seedShowWithCrew,
} from "./_holdsHelpers";

const ALICE_CLAIMED_AT = "2026-05-01T09:00:00.000Z";

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

/** Auto-apply a rename of `prior` → `successor` (MI-12 crew_renamed) and return the rename row id. */
async function applyRename(
  showId: string,
  driveFileId: string,
  prior: { name: string; email: string },
  successor: { name: string; email: string },
): Promise<string> {
  const items: TriggeredReviewItem[] = [
    {
      id: "1",
      invariant: "MI-12",
      removed_name: prior.name,
      added_name: successor.name,
      email: successor.email,
    },
  ];
  await runAutoApply(driveFileId, {
    crew: [{ name: successor.name, email: successor.email }],
    triggeredItems: items,
  });
  const renamed = await readChangeLog(showId, { change_kind: "crew_renamed", entity_ref: prior.name });
  return renamed.id;
}

describe("crew_renamed undo is a true reversal (P4-F3)", () => {
  it("SAME-EMAIL rename — undo restores Alice with original id+claim and Dana is absent", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Alice", email: "a@x", claimed: ALICE_CLAIMED_AT },
    ]);
    const aliceLive = await readCrewByName(showId, "Alice");
    const ALICE_ID = aliceLive!.id;
    const renameId = await applyRename(showId, driveFileId, { name: "Alice", email: "a@x" }, { name: "Dana", email: "a@x" });
    // Dana now owns a@x; Alice is gone.
    expect((await readCrew(showId)).map((c) => c.name)).toEqual(["Dana"]);

    const res = await callUndoAsAdmin(renameId);
    expect(res.ok).toBe(true);

    const aliceBack = await readCrewByName(showId, "Alice");
    expect(aliceBack).not.toBeNull();
    expect(aliceBack!.email).toBe("a@x");
    expect(aliceBack!.id).toBe(ALICE_ID); // original id restored
    expect(aliceBack!.claimed_via_oauth_at).not.toBeNull(); // claim restored
    // Dana ABSENT immediately after undo (successor deleted).
    expect(await readCrewByName(showId, "Dana")).toBeNull();
    expect((await readCrew(showId)).map((c) => c.name)).toEqual(["Alice"]);

    // exactly one undo log + one undo_override hold.
    const log = (await readChangeLog(showId)).all;
    expect(log.filter((r) => r.source === "undo" && r.undo_of === renameId)).toHaveLength(1);
    expect((await readHoldsByShow(showId)).filter((h) => h.kind === "undo_override")).toHaveLength(1);
  });

  it("CHANGED-EMAIL rename — undo restores Alice(a@x) and Dana(b@y) is absent (no dual identity)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "a@x" }]);
    const aliceLive = await readCrewByName(showId, "Alice");
    const ALICE_ID = aliceLive!.id;
    const renameId = await applyRename(showId, driveFileId, { name: "Alice", email: "a@x" }, { name: "Dana", email: "b@y" });
    expect((await readCrew(showId)).map((c) => c.name)).toEqual(["Dana"]);

    const res = await callUndoAsAdmin(renameId);
    expect(res.ok).toBe(true);
    const aliceBack = await readCrewByName(showId, "Alice");
    expect(aliceBack!.email).toBe("a@x");
    expect(aliceBack!.id).toBe(ALICE_ID);
    expect(await readCrewByName(showId, "Dana")).toBeNull(); // Dana gone — no dual identity
    expect((await readCrew(showId)).map((c) => c.name)).toEqual(["Alice"]);
  });

  it("GENUINE collision control — prior email owned by an UNRELATED third member → UNDO_EMAIL_CLAIMED, zero mutation", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "a@x" }]);
    const renameId = await applyRename(showId, driveFileId, { name: "Alice", email: "a@x" }, { name: "Dana", email: "b@y" });
    // A different, UNRELATED member Carl now holds a@x (the prior email) — not the successor Dana.
    await holdsSql`
      insert into public.crew_members
        (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info, claimed_via_oauth_at)
      values (${showId}, 'Carl', 'a@x', '555', 'A1', ${["A1"]},
              ${holdsSql.json({ kind: "none" })}, ${holdsSql.json({ kind: "none" })}, null, null)`;
    const crewBefore = await readCrew(showId);

    const res = await callUndoAsAdmin(renameId);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_EMAIL_CLAIMED");
    // ZERO mutation: Dana still live (NOT deleted), Carl intact, no Alice, no undo row/hold.
    expect(await readCrewByName(showId, "Dana")).not.toBeNull();
    expect(await readCrewByName(showId, "Alice")).toBeNull();
    expect((await readCrew(showId)).map((c) => c.name).sort()).toEqual(crewBefore.map((c) => c.name).sort());
    expect((await readChangeLog(showId)).all.filter((r) => r.source === "undo")).toHaveLength(0);
    expect((await readHoldsByShow(showId)).filter((h) => h.kind === "undo_override")).toHaveLength(0);
  });
});
