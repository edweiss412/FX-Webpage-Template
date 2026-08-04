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
import { afterAll, describe, expect, it, vi } from "vitest";

import { encodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";

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
  runStagedApply,
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
    const removed = await readChangeLog(showId, {
      change_kind: "crew_removed",
      entity_ref: "Alice",
    });

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
    const removed = await readChangeLog(showId, {
      change_kind: "crew_removed",
      entity_ref: "Alice",
    });
    const res = await callUndoAsAdmin(removed.id);
    expect(res.ok).toBe(true);

    const aliceBack = await readCrewByName(showId, "Alice");
    expect(aliceBack!.id).toBe(ALICE_ID);
    expect(aliceBack!.claimed_via_oauth_at).toBeNull();
  });

  it("LINKED-shape rename undo (spec 2026-07-10 §3.5, test 15): prior name restored on the SAME id, claim intact", async () => {
    // The identity-linked apply keeps the prior row's id under the new name, so the applied
    // crew_renamed row's before_image.id EQUALS the live successor's id. undo_change ships
    // UNCHANGED for this shape (no FK references crew_members(id) in the final schema); this
    // pins the round-trip: any future undo edit that loses the preserved identity goes red.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Undo Link A", email: "ula@x.example", claimed: ALICE_CLAIMED_AT },
    ]);
    const live = await readCrewByName(showId, "Undo Link A");
    const LINK_ID = live!.id;
    const LINK_CLAIM = live!.claimed_via_oauth_at;

    const items: TriggeredReviewItem[] = [
      {
        id: "1",
        invariant: "MI-12",
        removed_name: "Undo Link A",
        added_name: "Undo Link A2",
        email: "ula@x.example",
      },
    ];
    await runAutoApply(driveFileId, {
      crew: [{ name: "Undo Link A2", email: "ula@x.example" }],
      triggeredItems: items,
      identityLinkRenames: [{ removedName: "Undo Link A", addedName: "Undo Link A2" }],
    });
    // Linked shape landed: same id under the new name; before_image carries that same id.
    const successor = await readCrewByName(showId, "Undo Link A2");
    expect(successor!.id).toBe(LINK_ID);
    const renamed = await readChangeLog(showId, {
      change_kind: "crew_renamed",
      entity_ref: "Undo Link A",
    });
    expect(renamed.before_image?.id).toBe(LINK_ID);

    const res = await callUndoAsAdmin(renamed.id);
    expect(res.ok).toBe(true);

    const back = await readCrewByName(showId, "Undo Link A");
    expect(back).not.toBeNull();
    expect(back!.id).toBe(LINK_ID); // identity survives the full apply→undo round-trip
    expect(new Date(back!.claimed_via_oauth_at as string).toISOString()).toBe(
      new Date(LINK_CLAIM as string).toISOString(),
    );
    expect(await readCrewByName(showId, "Undo Link A2")).toBeNull();
    // Shared undo tail unchanged: held-present override + baseline signature.
    const hold = await readHold(showId, { entity_key: "Undo Link A" });
    expect(hold!.kind).toBe("undo_override");
    expect(hold!.held_value.baseline).toEqual({
      kind: "rename",
      suppressed_added: { name: "Undo Link A2", email: "ula@x.example" },
    });
  });

  it("REPLACED-shape rename undo regression (spec test 16): successor (distinct id) deleted, prior id restored", async () => {
    // HISTORICAL ROW, REPRODUCED DELIBERATELY — this test does NOT drive an apply, because no live
    // apply can produce this shape any more (spec 2026-08-03 §8). Since the landed-pairs correction,
    // the only source of a crew_renamed row is a rename that LANDED, and landing means
    // renameCrewMember's in-place `update ... set name` succeeded, which preserves crew_members.id
    // by construction. The "successor carries a DISTINCT id" shape is what the old triggeredItems
    // re-derivation wrote whenever a rename degraded to delete-old + insert-new. undo_change's
    // Direction A branch for it is historical-only, not dead: rows of this shape are already in the
    // change log and must stay undoable. So the crew state and the feed row are both seeded here to
    // the exact shape that path used to leave behind.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Undo Repl A", email: "ura@x.example" },
    ]);
    const prior = (await readCrewByName(showId, "Undo Repl A"))!;
    const PRIOR_ID = prior.id;

    // The crew mutation the historical delete+insert apply left: prior row gone, successor inserted
    // fresh (so it gets a NEW id — the whole point of the shape).
    await holdsSql`delete from public.crew_members where id = ${PRIOR_ID}`;
    await holdsSql`
      insert into public.crew_members
        (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
         flight_info, claimed_via_oauth_at)
      values (${showId}, 'Undo Repl A2', ${prior.email}, ${prior.phone}, ${prior.role},
              ${prior.role_flags}, ${holdsSql.json(prior.date_restriction as never)},
              ${holdsSql.json(prior.stage_restriction as never)}, ${prior.flight_info}, null)`;
    const successor = await readCrewByName(showId, "Undo Repl A2");
    expect(successor!.id).not.toBe(PRIOR_ID); // the replaced shape, not linked

    // The feed row that apply wrote, in the shape writeAutoApplyChanges' crew_renamed branch
    // produced: entity_ref = the PRIOR name, before_image = the pre-apply live row (id + claim).
    const [seeded] = (await holdsSql`
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, entity_ref, summary,
         before_image, after_image, status, created_by)
      values (${showId}, ${driveFileId}, 'auto_apply', 'crew_renamed', ${prior.name},
              ${`Crew member ${prior.name} renamed to Undo Repl A2`},
              ${holdsSql.json({
                id: PRIOR_ID,
                name: prior.name,
                email: prior.email,
                phone: prior.phone,
                role: prior.role,
                role_flags: prior.role_flags,
                date_restriction: prior.date_restriction,
                stage_restriction: prior.stage_restriction,
                flight_info: prior.flight_info,
                claimed_via_oauth_at: prior.claimed_via_oauth_at,
              } as never)},
              ${holdsSql.json({ name: "Undo Repl A2", email: prior.email } as never)},
              'applied', 'system')
      returning id`) as unknown as Array<{ id: string }>;

    const res = await callUndoAsAdmin(seeded!.id);
    expect(res.ok).toBe(true);

    expect(await readCrewByName(showId, "Undo Repl A2")).toBeNull(); // successor deleted
    expect((await readCrewByName(showId, "Undo Repl A"))!.id).toBe(PRIOR_ID); // prior id back
  });

  it("undo of a RENAME restores the prior row; baseline records suppressed_added name+email", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Alice", email: "alice@old", claimed: ALICE_CLAIMED_AT },
    ]);
    const aliceLive = await readCrewByName(showId, "Alice");
    const ALICE_ID = aliceLive!.id;

    // Rename Alice → Alicia(alicia@new). MI-12 triggers a crew_renamed feed row (entity_ref = prior name).
    const items: TriggeredReviewItem[] = [
      {
        id: "1",
        invariant: "MI-12",
        removed_name: "Alice",
        added_name: "Alicia",
        email: "alicia@new",
      },
    ];
    await runAutoApply(driveFileId, {
      crew: [{ name: "Alicia", email: "alicia@new" }],
      triggeredItems: items,
      // The feed derives renames from the pairs the apply LANDED, so the identity-link pair cron
      // emits for this MI-12 item rides along too (`lib/sync/identityLinkRenames.ts:20-23`).
      identityLinkRenames: [{ removedName: "Alice", addedName: "Alicia" }],
    });
    const renamed = await readChangeLog(showId, {
      change_kind: "crew_renamed",
      entity_ref: "Alice",
    });
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
    const removed = await readChangeLog(showId, {
      change_kind: "crew_removed",
      entity_ref: "Alice",
    });
    expect((await callUndoAsAdmin(removed.id)).ok).toBe(true);
    // Next sync, sheet STILL omits Alice → Alice STAYS (baseline {kind:'removal'} retains her).
    await runAutoApply(driveFileId, { crew: [{ name: "Bob", email: "bob@x" }] });
    expect((await readCrew(showId)).map((c) => c.name).sort()).toEqual(["Alice", "Bob"]);
    expect(await readHold(showId, { entity_key: "Alice" })).not.toBeNull();
  });

  it("(b) undo-rename suppresses a DIFFERENT-named replacement (matched by baseline email)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([{ name: "Alice", email: "alice@old" }]);
    const items: TriggeredReviewItem[] = [
      {
        id: "1",
        invariant: "MI-12",
        removed_name: "Alice",
        added_name: "Alicia",
        email: "alicia@new",
      },
    ];
    await runAutoApply(driveFileId, {
      crew: [{ name: "Alicia", email: "alicia@new" }],
      triggeredItems: items,
      identityLinkRenames: [{ removedName: "Alice", addedName: "Alicia" }],
    });
    const renamed = await readChangeLog(showId, {
      change_kind: "crew_renamed",
      entity_ref: "Alice",
    });
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
    const removed = await readChangeLog(a.showId, {
      change_kind: "crew_removed",
      entity_ref: "Alice",
    });
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
      {
        id: "1",
        invariant: "MI-12",
        removed_name: "Alice",
        added_name: "Alicia",
        email: "alicia@new",
      },
    ];
    await runAutoApply(b.driveFileId, {
      crew: [{ name: "Alicia", email: "alicia@new" }],
      triggeredItems: items,
      identityLinkRenames: [{ removedName: "Alice", addedName: "Alicia" }],
    });
    const renamed = await readChangeLog(b.showId, {
      change_kind: "crew_renamed",
      entity_ref: "Alice",
    });
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

  it("STAGED-driven linked rename: apply then undo restores the original id and claim (spec 2026-08-03 §4 item 5)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Stage Undo A", email: "sua@x.example", claimed: "2026-06-01T10:00:00.000Z" },
    ]);
    const live = await readCrewByName(showId, "Stage Undo A");
    const LINK_ID = live!.id;
    const LINK_CLAIM = live!.claimed_via_oauth_at;

    const result = await runStagedApply(driveFileId, {
      crew: [{ name: "Stage Undo A2", email: "sua@x.example" }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Stage Undo A",
          added_name: "Stage Undo A2",
          email: "sua@x.example",
        },
      ],
      reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Stage Undo A2" }],
    });
    expect(result).toMatchObject({ outcome: "applied" });
    expect((await readCrewByName(showId, "Stage Undo A2"))!.id).toBe(LINK_ID);

    const renamed = await readChangeLog(showId, {
      change_kind: "crew_renamed",
      entity_ref: "Stage Undo A",
    });
    const res = await callUndoAsAdmin(renamed.id);
    expect(res.ok).toBe(true);

    const back = await readCrewByName(showId, "Stage Undo A");
    expect(back!.id).toBe(LINK_ID);
    expect(new Date(back!.claimed_via_oauth_at as string).toISOString()).toBe(
      new Date(LINK_CLAIM as string).toISOString(),
    );
    expect(await readCrewByName(showId, "Stage Undo A2")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §3.6 / Unit D — selections_reset_at survives an undo.
//
// The marker is the picker-invalidation stamp: an admin reset writes
// clock_timestamp() onto crew_members.selections_reset_at and every device cookie
// picked at or before that instant is forced back to the picker. An undo that
// drops the marker silently REVALIDATES those cookies. Two producers had to carry
// it (crewImage → before_image) and the restore had to merge it with whatever the
// live successor holds — a before_image-only restore loses a reset stamped AFTER
// the change being undone.
// ---------------------------------------------------------------------------

const RESET_AT = "2026-06-15T08:00:00.000Z";
const RESET_OLDER = "2026-06-01T08:00:00.000Z";
const RESET_NEWER = "2026-06-20T08:00:00.000Z";

const iso = (value: string | Date | null): string | null =>
  value === null ? null : new Date(value).toISOString();

/** The admin picker-reset stamp, applied directly (the RPC path is covered elsewhere). */
async function stampReset(showId: string, name: string, at: string): Promise<void> {
  await holdsSql`
    update public.crew_members set selections_reset_at = ${at}::timestamptz
     where show_id = ${showId} and name = ${name}`;
}

/** Seed one linked rename (prior → successor) through the real Phase-2 apply. */
async function applyLinkedRename(
  driveFileId: string,
  from: string,
  to: string,
  email: string,
): Promise<void> {
  const items: TriggeredReviewItem[] = [
    { id: "1", invariant: "MI-12", removed_name: from, added_name: to, email },
  ];
  await runAutoApply(driveFileId, {
    crew: [{ name: to, email }],
    triggeredItems: items,
    identityLinkRenames: [{ removedName: from, addedName: to }],
  });
}

describe("undo_change — selections_reset_at continuity (§3.6)", () => {
  it("an undo of a crew_removed restores selections_reset_at from before_image", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Reset Rm A", email: "rra@x.example", selections_reset_at: RESET_AT },
      { name: "Reset Rm B", email: "rrb@x.example" },
    ]);
    const seeded = await readCrewByName(showId, "Reset Rm A");
    expect(seeded!.selections_reset_at).not.toBeNull();

    await runAutoApply(driveFileId, { crew: [{ name: "Reset Rm B", email: "rrb@x.example" }] });
    const removed = await readChangeLog(showId, {
      change_kind: "crew_removed",
      entity_ref: "Reset Rm A",
    });
    // crewImage is the producer: the marker must reach before_image at all.
    expect(iso((removed.before_image?.selections_reset_at as string | null) ?? null)).toBe(
      iso(seeded!.selections_reset_at),
    );

    expect((await callUndoAsAdmin(removed.id)).ok).toBe(true);
    const back = await readCrewByName(showId, "Reset Rm A");
    expect(iso(back!.selections_reset_at)).toBe(iso(seeded!.selections_reset_at));
  });

  it("CLEAN-INSERT path: a rename undo keeps a reset stamped on the successor after the rename", async () => {
    // THE COMMON PATH. A crew_renamed undo deletes the live successor first precisely so the restore
    // INSERT slot is free, so it never reaches ON CONFLICT — a greatest() living only in the
    // do-update branch fails HERE while every other test in this block still passes.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Reset Ren A", email: "rena@x.example" },
    ]);
    await applyLinkedRename(driveFileId, "Reset Ren A", "Reset Ren A2", "rena@x.example");
    // The admin resets AFTER the rename landed, so before_image (captured pre-apply) holds NULL and
    // only the live successor carries the marker.
    await stampReset(showId, "Reset Ren A2", RESET_AT);
    const successor = await readCrewByName(showId, "Reset Ren A2");
    expect(successor!.selections_reset_at).not.toBeNull();

    const renamed = await readChangeLog(showId, {
      change_kind: "crew_renamed",
      entity_ref: "Reset Ren A",
    });
    expect(renamed.before_image?.selections_reset_at ?? null).toBeNull();

    expect((await callUndoAsAdmin(renamed.id)).ok).toBe(true);
    const back = await readCrewByName(showId, "Reset Ren A");
    expect(iso(back!.selections_reset_at)).toBe(iso(successor!.selections_reset_at));
  });

  it("historical before_image with no selections_reset_at key falls through to the successor's marker", async () => {
    // Rows written before this unit have NO key at all. `->>'selections_reset_at'` on an absent key
    // is SQL NULL, so greatest() falls through to the captured successor value — old rows are
    // rescued by the capture, with no backfill migration.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Reset Hist A", email: "rha@x.example" },
    ]);
    await applyLinkedRename(driveFileId, "Reset Hist A", "Reset Hist A2", "rha@x.example");
    const renamed = await readChangeLog(showId, {
      change_kind: "crew_renamed",
      entity_ref: "Reset Hist A",
    });
    await holdsSql`
      update public.show_change_log
         set before_image = before_image - 'selections_reset_at'
       where id = ${renamed.id}`;
    const [stripped] = (await holdsSql`
      select before_image from public.show_change_log where id = ${renamed.id}`) as unknown as Array<{
      before_image: Record<string, unknown>;
    }>;
    expect(Object.keys(stripped!.before_image)).not.toContain("selections_reset_at");

    await stampReset(showId, "Reset Hist A2", RESET_AT);
    const successor = await readCrewByName(showId, "Reset Hist A2");

    expect((await callUndoAsAdmin(renamed.id)).ok).toBe(true);
    const back = await readCrewByName(showId, "Reset Hist A");
    expect(iso(back!.selections_reset_at)).toBe(iso(successor!.selections_reset_at));
  });

  it("ON CONFLICT branch keeps the NEWER of the live and before_image markers", async () => {
    // Reaching the do-update branch takes a live row already sitting on the restore slot with the
    // SAME email (the name-collision guard only rejects a DIFFERENT-email occupant).
    const occupy = async (
      showId: string,
      name: string,
      email: string,
      at: string,
    ): Promise<void> => {
      await holdsSql`
        insert into public.crew_members
          (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
           flight_info, claimed_via_oauth_at, selections_reset_at)
        values (${showId}, ${name}, ${email}, '555-OLD', 'A1', ${["A1"]},
                ${holdsSql.json({ kind: "none" })}, ${holdsSql.json({ kind: "none" })},
                null, null, ${at}::timestamptz)`;
    };

    // (a) the LIVE marker is newer → it must survive the restore.
    const a = await seedShowWithCrew([
      { name: "Reset Cf A", email: "rcfa@x.example", selections_reset_at: RESET_OLDER },
    ]);
    await runAutoApply(a.driveFileId, { crew: [] });
    const removedA = await readChangeLog(a.showId, {
      change_kind: "crew_removed",
      entity_ref: "Reset Cf A",
    });
    await occupy(a.showId, "Reset Cf A", "rcfa@x.example", RESET_NEWER);
    expect((await callUndoAsAdmin(removedA.id)).ok).toBe(true);
    expect(iso((await readCrewByName(a.showId, "Reset Cf A"))!.selections_reset_at)).toBe(
      new Date(RESET_NEWER).toISOString(),
    );

    // (b) the BEFORE_IMAGE marker is newer → it must win instead. A bare `excluded.` assignment
    // passes (b) and fails (a); a bare `crew_members.` assignment passes (a) and fails (b).
    const b = await seedShowWithCrew([
      { name: "Reset Cf B", email: "rcfb@x.example", selections_reset_at: RESET_NEWER },
    ]);
    await runAutoApply(b.driveFileId, { crew: [] });
    const removedB = await readChangeLog(b.showId, {
      change_kind: "crew_removed",
      entity_ref: "Reset Cf B",
    });
    await occupy(b.showId, "Reset Cf B", "rcfb@x.example", RESET_OLDER);
    expect((await callUndoAsAdmin(removedB.id)).ok).toBe(true);
    expect(iso((await readCrewByName(b.showId, "Reset Cf B"))!.selections_reset_at)).toBe(
      new Date(RESET_NEWER).toISOString(),
    );
  });

  it("an invalidated picker cookie stays invalidated across an undo", async () => {
    // Column-only assertions would miss a reader-side regression, so this drives the REAL resolver
    // over the REAL restored row (read back from the database, never hand-built).
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Reset Pk A", email: "rpa@x.example", selections_reset_at: RESET_AT },
    ]);
    await runAutoApply(driveFileId, { crew: [] });
    const removed = await readChangeLog(showId, {
      change_kind: "crew_removed",
      entity_ref: "Reset Pk A",
    });
    expect((await callUndoAsAdmin(removed.id)).ok).toBe(true);

    const back = await readCrewByName(showId, "Reset Pk A");
    const [showRow] = (await holdsSql`
      select picker_epoch, published, archived from public.shows
       where id = ${showId}`) as unknown as Array<{
      picker_epoch: number;
      published: boolean;
      archived: boolean;
    }>;
    const epoch = Number(showRow!.picker_epoch);
    // A pick made one second BEFORE the reset — invalidated iff the marker survived.
    const cookie = encodePickerCookie(
      {
        v: 1,
        selections: { [showId]: { id: back!.id, e: epoch, t: Date.parse(RESET_AT) - 1000 } },
      },
      "0".repeat(64),
    );

    type Chain = {
      select: () => Chain;
      eq: () => Chain;
      maybeSingle: () => Promise<{ data: unknown; error: null }>;
      single: () => Promise<{ data: unknown; error: null }>;
    };
    const chainFor = (row: unknown): Chain => {
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
      };
      return chain;
    };
    const crewRow = {
      id: back!.id,
      email: back!.email,
      claimed_via_oauth_at: iso(back!.claimed_via_oauth_at),
      selections_reset_at: iso(back!.selections_reset_at),
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        rpc: async () => ({ data: null, error: null }),
      }),
      createSupabaseServiceRoleClient: () => ({
        from: (table: string) =>
          chainFor(
            table === "shows"
              ? {
                  picker_epoch: epoch,
                  published: showRow!.published,
                  archived: showRow!.archived,
                }
              : crewRow,
          ),
      }),
    }));
    try {
      const { resolvePickerSelection } = await import("@/lib/auth/picker/resolvePickerSelection");
      const result = await resolvePickerSelection({ showId, cookie });
      expect(result.kind).toBe("selection_reset");
    } finally {
      vi.doUnmock("@/lib/supabase/server");
      vi.resetModules();
    }
  });

  it("a NULL selections_reset_at stays NULL through an undo (no spurious marker)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Reset Nl A", email: "rnla@x.example" },
    ]);
    expect((await readCrewByName(showId, "Reset Nl A"))!.selections_reset_at).toBeNull();
    await runAutoApply(driveFileId, { crew: [] });
    const removed = await readChangeLog(showId, {
      change_kind: "crew_removed",
      entity_ref: "Reset Nl A",
    });
    expect((await callUndoAsAdmin(removed.id)).ok).toBe(true);
    expect((await readCrewByName(showId, "Reset Nl A"))!.selections_reset_at).toBeNull();
  });
});
