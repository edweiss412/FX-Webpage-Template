/**
 * Phase 4 Task 4.1 — before_image is the PRE-apply state, not post (F2 regression guard).
 *
 * Pins the Phase-2 contract Phase 4 depends on: a crew_removed change-log row must carry the
 * REMOVED member's pre-apply values (so undo can reconstruct the removed entity). If the writer
 * captured post-apply, before_image would be null/wrong and undo could never restore a removal.
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeHoldsHelpers,
  readChangeLog,
  readCrew,
  runAutoApply,
  seedShowWithCrew,
} from "./_holdsHelpers";

const ALICE = { name: "Alice", email: "alice@old" };
const BOB = { name: "Bob", email: "bob@x" };

afterAll(async () => {
  await closeHoldsHelpers();
});

describe("before_image is pre-apply (F2)", () => {
  it("a crew_removed change-log row captures the removed crew member's prior values", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([ALICE, BOB]);
    await runAutoApply(driveFileId, { crew: [BOB] }); // sheet drops Alice
    const row = await readChangeLog(showId, { change_kind: "crew_removed", entity_ref: ALICE.name });
    // pre-apply, not post — derived from the seed fixture constant, never hardcoded inline.
    expect(row.before_image?.email).toBe(ALICE.email);
    expect(row.before_image?.name).toBe(ALICE.name);
    const crew = await readCrew(showId);
    expect(crew.map((c) => c.name)).toEqual([BOB.name]); // Alice actually removed
  });
});
