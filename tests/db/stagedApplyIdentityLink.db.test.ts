/**
 * Spec 2026-08-03-staged-identitylink-rename-identity: a staged `rename` reviewer choice on an
 * MI-12/13/14 pair threads `identityLinkRenames` into Phase 2, so the apply lands as an in-place
 * UPDATE that preserves `crew_members.id` + `claimed_via_oauth_at`. `independent` stays remove+add.
 *
 * Harness framing: `runStagedApply` uses `feedPolicy: choice_aware` — the finalize-cas (Phase D)
 * configuration. Identity assertions hold for every caller (the link computation ignores
 * feedPolicy); FEED assertions are meaningful only for this configuration.
 */
import type { RoleFlag } from "@/lib/parser/types";
import { afterAll, describe, expect, it } from "vitest";

import {
  closeHoldsHelpers,
  holdsSql,
  readChangeLog,
  readCrewByName,
  runAutoApply,
  runStagedApply,
  seedMi11Hold,
  seedShowWithCrew,
  type SeededHoldsShow,
} from "./_holdsHelpers";

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

const LEAD_FLAGS: RoleFlag[] = ["LEAD", "A1"];

/**
 * Seed one `undo_override` hold directly (no helper exists — `seedMi11Hold` is hardcoded to
 * `mi11_pending`/`crew_email`). The schema's `sync_holds_kind_shape_chk` requires
 * `proposed_value IS NULL` for this kind. Raw insert is the established pattern for this kind
 * (tests/sync/writeMi11Holds.test.ts:263, tests/db/sync-holds-schema.test.ts:264).
 */
async function seedUndoOverrideHold(
  show: SeededHoldsShow,
  opts: {
    domain: "crew_email" | "crew_identity";
    entityKey: string;
    held: Record<string, unknown>;
  },
): Promise<void> {
  await holdsSql`
    insert into public.sync_holds
      (show_id, drive_file_id, domain, entity_key, held_value, proposed_value,
       base_modified_time, kind, created_by)
    values (${show.showId}, ${show.driveFileId}, ${opts.domain}, ${opts.entityKey},
            ${holdsSql.json(opts.held as never)}, null, null, 'undo_override', 'test-seed')`;
}

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

describe("staged apply identity-link renames", () => {
  it("staged MI-12 rename choice preserves crew id + oauth claim; feed row's before_image.id matches", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Bob", email: "bob@x.example", claimed: "2026-06-01T10:00:00.000Z" },
    ]);
    const PRIOR_ID = (await readCrewByName(showId, "Bob"))!.id;
    const result = await runStagedApply(driveFileId, {
      crew: [{ name: "Robert", email: "bob@x.example" }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Bob",
          added_name: "Robert",
          email: "bob@x.example",
        },
      ],
      reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Robert" }],
    });
    expect(result).toMatchObject({ outcome: "applied" });
    expect(await readCrewByName(showId, "Bob")).toBeNull();
    const successor = await readCrewByName(showId, "Robert");
    expect(successor!.id).toBe(PRIOR_ID); // identity preserved (the backlog bug)
    expect(successor!.claimed_via_oauth_at).not.toBeNull(); // oauth claim survives
    const renamed = await readChangeLog(showId, {
      change_kind: "crew_renamed",
      entity_ref: "Bob",
    });
    expect(renamed.before_image?.id).toBe(PRIOR_ID); // feed row consistent with live row
  });

  it("staged MI-13 independent choice stays remove+add: old row gone, fresh id, no claim", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Sam A", email: "sama@x.example", claimed: "2026-06-01T10:00:00.000Z" },
    ]);
    const PRIOR_ID = (await readCrewByName(showId, "Sam A"))!.id;
    const result = await runStagedApply(driveFileId, {
      crew: [{ name: "Sam B", email: "samb@x.example" }],
      triggeredItems: [{ id: "1", invariant: "MI-13", removed_name: "Sam A", added_name: "Sam B" }],
      reviewerChoices: [{ item_id: "1", action: "independent" }],
    });
    expect(result).toMatchObject({ outcome: "applied" });
    expect(await readCrewByName(showId, "Sam A")).toBeNull(); // old row genuinely removed
    const successor = await readCrewByName(showId, "Sam B");
    expect(successor!.id).not.toBe(PRIOR_ID); // genuinely a new person
    expect(successor!.claimed_via_oauth_at).toBeNull();
  });

  it("held-boundary: an MI-12 rename choice whose OLD name has an open MI-11 hold keeps the old row", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Held Old", email: "held@x.example", claimed: "2026-06-01T10:00:00.000Z" },
    ]);
    const PRIOR_ID = (await readCrewByName(showId, "Held Old"))!.id;
    await seedMi11Hold(
      { showId, driveFileId },
      {
        entityKey: "Held Old",
        heldValue: heldValue("Held Old", "held@x.example"),
        proposedValue: { disposition: "removal" },
        baseModifiedTime: "2026-06-08T11:00:00.000Z",
      },
    );
    const result = await runStagedApply(driveFileId, {
      crew: [{ name: "Held New", email: "held@x.example" }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Held Old",
          added_name: "Held New",
          email: "held@x.example",
        },
      ],
      reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Held New" }],
    });
    expect(result).toMatchObject({ outcome: "applied" });
    const retained = await readCrewByName(showId, "Held Old");
    expect(retained).not.toBeNull(); // old row retained, not renamed away
    expect(retained!.id).toBe(PRIOR_ID);
  });

  it("notice flip: rename unchanged-LEAD emits nothing; rename with delta emits one arm-(a) entry; independent holder emits loss+grant", async () => {
    // Case A: rename choice, holder, UNCHANGED flags gets NO roleFlagsNotice (cron shape, spec §3.4).
    const a = await seedShowWithCrew([
      { name: "Lead Old", email: "lead@x.example", role_flags: LEAD_FLAGS },
    ]);
    const resultA = await runStagedApply(a.driveFileId, {
      crew: [{ name: "Lead New", email: "lead@x.example", role_flags: LEAD_FLAGS }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Lead Old",
          added_name: "Lead New",
          email: "lead@x.example",
        },
      ],
      reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Lead New" }],
    });
    expect(resultA).toMatchObject({ outcome: "applied" });
    expect(resultA).not.toHaveProperty("roleFlagsNotice");

    // Case B: rename choice WITH capability delta: exactly one arm-(a) entry, prior flags via the
    // rename map (spec §4 item 4).
    const b = await seedShowWithCrew([
      { name: "Delta Old", email: "delta@x.example", role_flags: LEAD_FLAGS },
    ]);
    const resultB = await runStagedApply(b.driveFileId, {
      crew: [{ name: "Delta New", email: "delta@x.example", role_flags: ["A1"] }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Delta Old",
          added_name: "Delta New",
          email: "delta@x.example",
        },
      ],
      reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "Delta New" }],
    });
    expect(resultB).toMatchObject({
      outcome: "applied",
      roleFlagsNotice: {
        context: {
          changes: [{ crew_name: "Delta New", prior_flags: LEAD_FLAGS, new_flags: ["A1"] }],
        },
      },
    });

    // Case C: independent on a holder with a capability-holding successor: arms (c)+(b), loss for
    // the removed old identity AND grant for the added new identity (unchanged behavior, spec §3.4).
    const c = await seedShowWithCrew([
      { name: "Ind Old", email: "ind@x.example", role_flags: LEAD_FLAGS },
    ]);
    const resultC = await runStagedApply(c.driveFileId, {
      crew: [{ name: "Ind New", email: "ind2@x.example", role_flags: LEAD_FLAGS }],
      triggeredItems: [
        { id: "1", invariant: "MI-13", removed_name: "Ind Old", added_name: "Ind New" },
      ],
      reviewerChoices: [{ item_id: "1", action: "independent" }],
    });
    expect(resultC).toMatchObject({ outcome: "applied" });
    const changesC = (resultC as { roleFlagsNotice?: { context: { changes: unknown[] } } })
      .roleFlagsNotice?.context.changes;
    expect(changesC).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ crew_name: "Ind Old", prior_flags: LEAD_FLAGS, new_flags: [] }),
        expect.objectContaining({ crew_name: "Ind New", prior_flags: [], new_flags: LEAD_FLAGS }),
      ]),
    );
    expect(changesC).toHaveLength(2);
  });

  /**
   * Task 4 — the capability notice's arm (c) suppresses a loss on a SURVIVAL test, not a reason
   * test. Both cases need real hold state, so neither can live in tests/sync/phase2.test.ts:
   * `FakePhase2Tx` has no `holdPort` and `runPhase2` only enables the hold-aware apply through
   * `tx.holdPort?.()`.
   */
  it("capability: an unlanded pair whose SOURCE SURVIVED emits no capability-loss notice", async () => {
    // A crew_email undo_override delete-PROTECTS its entity_key without putting it back in the
    // applied crew list — the exact shape arm (c) must suppress. Feeding landedRenames to BOTH arms
    // (the naive swap) drops "Old" out of renamedAway and fires a phantom LEAD loss for a row that
    // is still live and still holds LEAD.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Old", email: "old@x.example", role_flags: LEAD_FLAGS },
    ]);
    const PRIOR_ID = (await readCrewByName(showId, "Old"))!.id;
    await seedUndoOverrideHold(
      { showId, driveFileId },
      { domain: "crew_email", entityKey: "Old", held: heldValue("Old", "old@x.example") },
    );

    const result = await runStagedApply(driveFileId, {
      crew: [{ name: "New", email: "new@x.example" }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Old",
          added_name: "New",
          email: "new@x.example",
        },
      ],
      reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "New" }],
    });

    expect(result).toMatchObject({ outcome: "applied" });
    // Premise, asserted rather than assumed: the pair did NOT land (the held source was skipped, so
    // the row keeps its own name AND its id) and the source row survived the delete carrying LEAD.
    const survivor = await readCrewByName(showId, "Old");
    expect(survivor).not.toBeNull();
    expect(survivor!.id).toBe(PRIOR_ID);
    expect(survivor!.role_flags).toEqual(LEAD_FLAGS);
    // The added row landed as an ordinary, independent addition (no capability flags of its own).
    expect((await readCrewByName(showId, "New"))!.id).not.toBe(PRIOR_ID);
    expect(result).not.toHaveProperty("roleFlagsNotice");
  });

  it("capability: a held pair whose hold kind did NOT delete-protect it still reports the loss", async () => {
    // The discriminator for a reason-proxy implementation. A crew_identity undo_override TOMBSTONE
    // (held_value.absent) adds its entity_key to heldNames but NOT to protectedNames, so the pair is
    // skipped for reason `name_held` while the source row is genuinely deleted. A renamedAway set
    // built from the SKIP REASON suppresses this real loss; one built from `sourceSurvived` reports
    // it. The sheet must keep listing "Old" with the held email or the tombstone releases itself
    // (lib/sync/holds/holdAwareApply.ts:83-91) and the hold never reaches the apply.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Old", email: "old@x.example", role_flags: LEAD_FLAGS },
    ]);
    await seedUndoOverrideHold(
      { showId, driveFileId },
      {
        domain: "crew_identity",
        entityKey: "Old",
        held: {
          absent: true,
          name: "Old",
          email: "old@x.example",
          baseline: { kind: "add", added: { name: "Old", email: "old@x.example" } },
        },
      },
    );

    const result = await runStagedApply(driveFileId, {
      crew: [
        { name: "Old", email: "old@x.example", role_flags: LEAD_FLAGS },
        { name: "New", email: "new@x.example" },
      ],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Old",
          added_name: "New",
          email: "new@x.example",
        },
      ],
      reviewerChoices: [{ item_id: "1", action: "rename", rename_value: "New" }],
    });

    expect(result).toMatchObject({ outcome: "applied" });
    // Premise: the tombstone suppressed the row, so the LEAD holder is genuinely gone.
    expect(await readCrewByName(showId, "Old")).toBeNull();
    const changes = (result as { roleFlagsNotice?: { context: { changes: unknown[] } } })
      .roleFlagsNotice?.context.changes;
    expect(changes).toEqual([{ crew_name: "Old", prior_flags: LEAD_FLAGS, new_flags: [] }]);
  });

  /**
   * Task 5 — the auto-apply feed derives `crew_renamed` from the pairs the apply LANDED (P2-F2),
   * never from a re-derivation over `triggeredItems`. `runAutoApply` is the harness for these (not
   * `runStagedApply`) because it takes `triggeredItems` and `identityLinkRenames` as INDEPENDENT
   * inputs — and that divergence IS the defect: the old `renamePairs()` accepted every MI-12/13/14
   * item unconditionally, with no accept gate and no suppression check.
   *
   * Fixture note for the hold-suppressed cases: a `crew_identity` undo_override TOMBSTONE keyed on
   * the ADDED name suppresses that row from the applied crew list (holdAwareApply.ts:442-445) while
   * the sheet keeps listing it, so the hold does not release itself (holdAwareApply.ts:85-91).
   */
  async function seedSuppressedTargetRename(): Promise<SeededHoldsShow> {
    const show = await seedShowWithCrew([{ name: "Old", email: "old@x.example" }]);
    await seedUndoOverrideHold(show, {
      domain: "crew_identity",
      entityKey: "New",
      held: {
        absent: true,
        name: "New",
        email: "new@x.example",
        baseline: { kind: "add", added: { name: "New", email: "new@x.example" } },
      },
    });
    await runAutoApply(show.driveFileId, {
      crew: [{ name: "New", email: "new@x.example" }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Old",
          added_name: "New",
          email: "new@x.example",
        },
      ],
      identityLinkRenames: [{ removedName: "Old", addedName: "New" }],
    });
    return show;
  }

  it("a hold-suppressed rename target yields crew_removed for the prior name and NO crew_renamed", async () => {
    const { showId } = await seedSuppressedTargetRename();
    // Premise, asserted rather than assumed: the target never landed, so the pair is unlanded for
    // `target_absent` — and with nothing protecting it, the prior row is genuinely gone.
    expect(await readCrewByName(showId, "New")).toBeNull();
    expect(await readCrewByName(showId, "Old")).toBeNull();

    const rows = (await readChangeLog(showId)).all;
    expect(rows.filter((r) => r.change_kind === "crew_renamed")).toEqual([]);
    // Asserting only the absent rename row would pass on a writer that dropped BOTH rows; the
    // removal is what the operator must actually see.
    expect(rows.filter((r) => r.change_kind === "crew_removed").map((r) => r.entity_ref)).toEqual([
      "Old",
    ]);
  });

  it("an unaccepted MI-13 with a surviving target yields crew_removed AND crew_added", async () => {
    // No `identityLinkRenames`: cron links an MI-13 heuristic pair ONLY on a version-bound accept
    // (lib/sync/identityLinkRenames.ts:18-24). The old writer ignored that gate entirely and wrote a
    // crew_renamed row anyway, silencing BOTH the removal and the addition.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Sam A", email: "sama@x.example" },
    ]);
    await runAutoApply(driveFileId, {
      crew: [{ name: "Sam B", email: "samb@x.example" }],
      triggeredItems: [{ id: "1", invariant: "MI-13", removed_name: "Sam A", added_name: "Sam B" }],
    });

    const rows = (await readChangeLog(showId)).all;
    expect(rows.filter((r) => r.change_kind === "crew_renamed")).toEqual([]);
    const crewRows = rows.filter((r) => r.change_kind.startsWith("crew_"));
    expect(crewRows.map((r) => `${r.change_kind}:${r.entity_ref}`).sort()).toEqual([
      "crew_added:Sam B",
      "crew_removed:Sam A",
    ]);
  });

  it("an accepted, landed rename still yields exactly one crew_renamed keyed on the PRIOR name", async () => {
    // Over-correction guard: a landed pair must keep producing its single rename row, and resolution
    // #19 pins entity_ref to the PRIOR name.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Old", email: "old@x.example" },
    ]);
    await runAutoApply(driveFileId, {
      crew: [{ name: "New", email: "old@x.example" }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Old",
          added_name: "New",
          email: "old@x.example",
        },
      ],
      identityLinkRenames: [{ removedName: "Old", addedName: "New" }],
    });

    expect((await readCrewByName(showId, "New")) !== null).toBe(true); // the rename really landed
    const rows = (await readChangeLog(showId)).all;
    const renamed = rows.filter((r) => r.change_kind === "crew_renamed");
    expect(renamed).toHaveLength(1);
    expect(renamed[0]?.entity_ref).toBe("Old");
    expect(rows.filter((r) => r.change_kind === "crew_removed")).toEqual([]);
    expect(rows.filter((r) => r.change_kind === "crew_added")).toEqual([]);
  });

  it("roster_shift_counts reports zero renamed for an unlanded pair", async () => {
    // The aggregate the operator reads on the dashboard badge — per-row assertions cannot see a
    // correct-rows/wrong-counts divergence. Expected numbers come from the fixture's roster, not a
    // guess: prior roster is exactly [Old], the parse's only row is hold-suppressed, so Old is the
    // sole departure (removed 1), nothing lands (added 0) and nothing is renamed (renamed 0).
    const { showId } = await seedSuppressedTargetRename();
    // No helper exists for this RPC; query it directly (pattern: tests/db/roster-shift-counts.test.ts:41).
    const [counts] = (await holdsSql`
      select added, removed, renamed
        from public.roster_shift_counts(${[showId]}::uuid[])`) as unknown as Array<{
      added: number;
      removed: number;
      renamed: number;
    }>;
    // All three, deliberately: selecting `added` without asserting it would let
    // { added: 999, removed: 1, renamed: 0 } pass.
    expect(Number(counts?.renamed)).toBe(0);
    expect(Number(counts?.removed)).toBe(1);
    expect(Number(counts?.added)).toBe(0);
  });

  it("field_changed attribution follows landed pairs, not requested ones", async () => {
    // Held SOURCE: a `crew_email` undo_override pins + delete-protects "Old"
    // (holdAwareApply.ts:432-438), so the requested pair is skipped for `name_held` while "New"
    // lands as an ordinary, independent addition.
    //
    // FIXTURE REQUIREMENT, probe-established: the successor must differ from the prior row in
    // NON-LEAD `role_flags` specifically. Measured against the current writer, a role-only,
    // phone-only or date_restriction-only delta produces NO field_changed row at all, so such a
    // fixture would leave this test green before the implementation and prove nothing.
    const { showId, driveFileId } = await seedShowWithCrew([
      { name: "Old", email: "old@x.example", role_flags: ["A1"] },
    ]);
    await seedUndoOverrideHold(
      { showId, driveFileId },
      { domain: "crew_email", entityKey: "Old", held: heldValue("Old", "old@x.example") },
    );
    await runAutoApply(driveFileId, {
      crew: [{ name: "New", email: "new@x.example", role_flags: ["A1", "V1"] }],
      triggeredItems: [
        {
          id: "1",
          invariant: "MI-12",
          removed_name: "Old",
          added_name: "New",
          email: "new@x.example",
        },
      ],
      identityLinkRenames: [{ removedName: "Old", addedName: "New" }],
    });

    // Premise: the pair did NOT land — the held source kept its own row and its own flags.
    const survivor = await readCrewByName(showId, "Old");
    expect(survivor).not.toBeNull();
    expect(survivor!.role_flags).toEqual(["A1"]);

    const rows = (await readChangeLog(showId)).all;
    // With the pair unlanded, "New" is a NEW person — its flags are not a delta on "Old", so the
    // role change must not be attributed through the prior name.
    expect(rows.filter((r) => r.change_kind === "field_changed")).toEqual([]);
    expect(rows.filter((r) => r.change_kind === "crew_renamed")).toEqual([]);
    expect(rows.filter((r) => r.change_kind === "crew_added").map((r) => r.entity_ref)).toEqual([
      "New",
    ]);
  });
});
