/**
 * Phase 4 P4-F1 (HIGH) — rename supersession must follow the SUCCESSOR identity, not only the OLD
 * name. Per resolution #19 a crew_renamed row is keyed entity_ref = the PRIOR name (Alice), while
 * later changes to the SUCCESSOR identity (Alicia) are logged under the NEW name. The original
 * same-entity_ref cleanup never matched those, so undo_change(originalRename) stayed callable and
 * restored a STALE Alice that no longer matches the sheet — phantom restore / identity corruption.
 *
 * Fix: cleanup_superseded_before_images ALSO supersedes a crew_renamed row when a NEWER same-show
 * row's identity (entity_ref OR email) matches THIS rename row's successor (after_image->>'name' /
 * after_image->>'email'). The existing same-entity_ref (fresh-same-name re-add / PF28) match stays.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import {
  callUndoAsAdmin,
  closeHoldsHelpers,
  holdsSql,
  readChangeLog,
  readCrew,
  readCrewByName,
  readHoldsByShow,
  seedShowWithCrew,
} from "./_holdsHelpers";

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

/** Insert a crew_renamed row (entity_ref = prior name; after_image = the successor identity). */
async function seedRenameRow(
  showId: string,
  driveFileId: string,
  args: {
    priorName: string;
    priorEmail: string | null;
    successorName: string;
    successorEmail: string | null;
    occurredAt: string;
    priorRowId: string;
  },
): Promise<string> {
  const [row] = (await holdsSql`
    insert into public.show_change_log
      (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary,
       before_image, after_image, status)
    values (${showId}, ${driveFileId}, ${args.occurredAt}::timestamptz, 'auto_apply', 'crew_renamed',
            ${args.priorName}, 's',
            ${holdsSql.json({
              id: args.priorRowId,
              name: args.priorName,
              email: args.priorEmail,
              phone: "555-OLD",
              role: "A1",
              role_flags: ["A1"],
              date_restriction: { kind: "none" },
              stage_restriction: { kind: "none" },
              flight_info: null,
              claimed_via_oauth_at: null,
            })},
            ${holdsSql.json({ name: args.successorName, email: args.successorEmail })}, 'applied')
    returning id`) as unknown as Array<{ id: string }>;
  return row!.id as string;
}

async function seedNewerCrewRow(
  showId: string,
  driveFileId: string,
  args: { changeKind: string; entityRef: string; afterEmail: string | null; occurredAt: string },
): Promise<void> {
  await holdsSql`
    insert into public.show_change_log
      (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary,
       before_image, after_image, status)
    values (${showId}, ${driveFileId}, ${args.occurredAt}::timestamptz, 'auto_apply', ${args.changeKind},
            ${args.entityRef}, 's', null,
            ${holdsSql.json({ name: args.entityRef, email: args.afterEmail })}, 'applied')`;
}

describe("rename successor-identity supersession (P4-F1)", () => {
  it("a newer REMOVAL of the successor (Alicia) supersedes the original Alice→Alicia rename row", async () => {
    // Current sheet state: only Alicia exists (Alice was renamed to her). priorRowId is Alice's.
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alicia", email: "alicia@new" }]);
    const alicia = await readCrewByName(showId, "Alicia");
    const ALICE_ROW_ID = randomUUID();

    const renameId = await seedRenameRow(showId, driveFileId, {
      priorName: "Alice",
      priorEmail: "alice@old",
      successorName: "Alicia",
      successorEmail: "alicia@new",
      occurredAt: "2026-06-08T12:00:00.000Z",
      priorRowId: ALICE_ROW_ID,
    });
    // NEWER sync REMOVES Alicia (entity_ref='Alicia', occurred_at > rename).
    await seedNewerCrewRow(showId, driveFileId, {
      changeKind: "crew_removed",
      entityRef: "Alicia",
      afterEmail: null,
      occurredAt: "2026-06-08T13:00:00.000Z",
    });

    await holdsSql`select public.cleanup_superseded_before_images(${showId})`;

    const renameAfter = (await readChangeLog(showId)).all.find((r) => r.id === renameId)!;
    expect(renameAfter.status).toBe("superseded");
    expect(renameAfter.before_image).toBeNull();

    // undo_change(originalRename) → UNDO_SUPERSEDED, ZERO mutation (no stale Alice restored).
    const crewBefore = await readCrew(showId);
    const res = await callUndoAsAdmin(renameId);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_SUPERSEDED");
    expect(await readCrewByName(showId, "Alice")).toBeNull(); // no phantom Alice
    expect((await readCrew(showId)).map((c) => c.name)).toEqual(crewBefore.map((c) => c.name));
    expect((await readHoldsByShow(showId)).length).toBe(0);
    void alicia;
  });

  it("a newer RENAME of the successor (Alicia→Bob) supersedes the original Alice→Alicia rename row", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Bob", email: "alicia@new" }]);
    const ALICE_ROW_ID = randomUUID();
    const renameId = await seedRenameRow(showId, driveFileId, {
      priorName: "Alice",
      priorEmail: "alice@old",
      successorName: "Alicia",
      successorEmail: "alicia@new",
      occurredAt: "2026-06-08T12:00:00.000Z",
      priorRowId: ALICE_ROW_ID,
    });
    // NEWER rename Alicia→Bob (entity_ref='Alicia', the successor's prior name).
    await holdsSql`
      insert into public.show_change_log
        (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary,
         before_image, after_image, status)
      values (${showId}, ${driveFileId}, '2026-06-08T13:00:00.000Z'::timestamptz, 'auto_apply',
              'crew_renamed', 'Alicia', 's',
              ${holdsSql.json({ id: ALICE_ROW_ID, name: "Alicia", email: "alicia@new" })},
              ${holdsSql.json({ name: "Bob", email: "alicia@new" })}, 'applied')`;

    await holdsSql`select public.cleanup_superseded_before_images(${showId})`;
    const renameAfter = (await readChangeLog(showId)).all.find((r) => r.id === renameId)!;
    expect(renameAfter.status).toBe("superseded");
    expect(renameAfter.before_image).toBeNull();
    const res = await callUndoAsAdmin(renameId);
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNDO_SUPERSEDED");
    expect(await readCrewByName(showId, "Alice")).toBeNull();
  });

  it("a successor whose NAME changed but EMAIL persists is still caught (email signature)", async () => {
    // Newer row keyed by a different name, but carrying the successor's email.
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Carl", email: "alicia@new" }]);
    const ALICE_ROW_ID = randomUUID();
    const renameId = await seedRenameRow(showId, driveFileId, {
      priorName: "Alice",
      priorEmail: "alice@old",
      successorName: "Alicia",
      successorEmail: "alicia@new",
      occurredAt: "2026-06-08T12:00:00.000Z",
      priorRowId: ALICE_ROW_ID,
    });
    // Newer row entity_ref='Carl' (NOT 'Alicia') but after_image.email = the successor email.
    await seedNewerCrewRow(showId, driveFileId, {
      changeKind: "crew_renamed",
      entityRef: "Carl",
      afterEmail: "alicia@new",
      occurredAt: "2026-06-08T13:00:00.000Z",
    });
    await holdsSql`select public.cleanup_superseded_before_images(${showId})`;
    const renameAfter = (await readChangeLog(showId)).all.find((r) => r.id === renameId)!;
    expect(renameAfter.status).toBe("superseded");
  });

  it("scope: an unrelated show sharing the successor name does NOT trigger supersession", async () => {
    const a = await seedShowWithCrew([{ name: "Alicia", email: "alicia@new" }]);
    const b = await seedShowWithCrew([{ name: "Alicia", email: "alicia@new" }]);
    const renameId = await seedRenameRow(a.showId, a.driveFileId, {
      priorName: "Alice",
      priorEmail: "alice@old",
      successorName: "Alicia",
      successorEmail: "alicia@new",
      occurredAt: "2026-06-08T12:00:00.000Z",
      priorRowId: randomUUID(),
    });
    // A newer 'Alicia' change in a DIFFERENT show b must not supersede show a's rename row.
    await seedNewerCrewRow(b.showId, b.driveFileId, {
      changeKind: "crew_removed",
      entityRef: "Alicia",
      afterEmail: null,
      occurredAt: "2026-06-08T13:00:00.000Z",
    });
    await holdsSql`select public.cleanup_superseded_before_images(${a.showId})`;
    const renameAfter = (await readChangeLog(a.showId)).all.find((r) => r.id === renameId)!;
    expect(renameAfter.status).toBe("applied"); // unchanged — different show
  });
});
