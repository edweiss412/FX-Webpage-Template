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
  runStagedApply,
  seedMi11Hold,
  seedShowWithCrew,
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
});
