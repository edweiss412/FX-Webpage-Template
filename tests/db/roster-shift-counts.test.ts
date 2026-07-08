/**
 * Flow-4 — roster_shift_counts(uuid[]) service-role RPC.
 *
 * Grouped per-show {added,removed,renamed} over UN-DISPOSITIONED (acknowledged_at IS NULL) auto-applied
 * roster change-log rows. Excludes acked/undone/superseded rows and non-roster change_kinds. All expected
 * values are derived from the seeded fixtures; each exclusion is scoped to a specific row id.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { closeHoldsHelpers, holdsSql } from "./_holdsHelpers";

type CountRow = { show_id: string; added: number; removed: number; renamed: number };

async function seedShow(published: boolean): Promise<{ showId: string; driveFileId: string }> {
  const driveFileId = `drv-${randomUUID()}`;
  const slug = `sh-${randomUUID().slice(0, 8)}`;
  const [row] = await holdsSql`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, published)
    values (${driveFileId}, ${slug}, 'T', 'c', 'v', ${published})
    returning id`;
  return { showId: row!.id as string, driveFileId };
}

async function seedLog(
  showId: string,
  driveFileId: string,
  o: { source?: string; change_kind: string; status?: string },
): Promise<string> {
  const [row] = await holdsSql`
    insert into public.show_change_log
      (show_id, drive_file_id, source, change_kind, entity_ref, summary, status)
    values (${showId}, ${driveFileId}, ${o.source ?? "auto_apply"}, ${o.change_kind},
            'E', 'rendered summary', ${o.status ?? "applied"})
    returning id`;
  return row!.id as string;
}

async function callRosterCounts(ids: string[]): Promise<CountRow[]> {
  const rows = await holdsSql`
    select show_id, added, removed, renamed
    from public.roster_shift_counts(${ids}::uuid[])`;
  return rows as unknown as CountRow[];
}

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

describe("roster_shift_counts RPC", () => {
  it("groups un-dispositioned roster shifts per show; excludes disposed + non-roster rows", async () => {
    const a = await seedShow(true);
    // Counted: 2 added, 1 removed, 3 renamed (auto_apply/applied/unacked).
    const EXP_ADDED = 2;
    const EXP_REMOVED = 1;
    const EXP_RENAMED = 3;
    for (let i = 0; i < EXP_ADDED; i++)
      await seedLog(a.showId, a.driveFileId, { change_kind: "crew_added" });
    for (let i = 0; i < EXP_REMOVED; i++)
      await seedLog(a.showId, a.driveFileId, { change_kind: "crew_removed" });
    for (let i = 0; i < EXP_RENAMED; i++)
      await seedLog(a.showId, a.driveFileId, { change_kind: "crew_renamed" });

    // Excluded — each scoped to a specific id (anti-tautology).
    const ackedId = await seedLog(a.showId, a.driveFileId, { change_kind: "crew_added" });
    await holdsSql`update public.show_change_log set acknowledged_at = now() where id = ${ackedId}`;
    const undoneId = await seedLog(a.showId, a.driveFileId, {
      change_kind: "crew_removed",
      status: "undone",
    });
    const supersededId = await seedLog(a.showId, a.driveFileId, {
      change_kind: "crew_renamed",
      status: "superseded",
    });
    const mi11Id = await seedLog(a.showId, a.driveFileId, {
      source: "mi11_approve",
      change_kind: "crew_added",
    });
    const fieldId = await seedLog(a.showId, a.driveFileId, { change_kind: "field_changed" });
    const emailId = await seedLog(a.showId, a.driveFileId, { change_kind: "crew_email_changed" });
    // reference the excluded ids so the linter/reader sees they are intentional seeds.
    expect([ackedId, undoneId, supersededId, mi11Id, fieldId, emailId].every(Boolean)).toBe(true);

    const rows = await callRosterCounts([a.showId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      show_id: a.showId,
      added: EXP_ADDED,
      removed: EXP_REMOVED,
      renamed: EXP_RENAMED,
    });
  });

  it("is published-agnostic — both a published and an unpublished show are counted", async () => {
    const pub = await seedShow(true);
    const unpub = await seedShow(false);
    await seedLog(pub.showId, pub.driveFileId, { change_kind: "crew_added" });
    await seedLog(unpub.showId, unpub.driveFileId, { change_kind: "crew_added" });

    const rows = await callRosterCounts([pub.showId, unpub.showId]);
    const byShow = new Map(rows.map((r) => [r.show_id, r]));
    expect(byShow.get(pub.showId)).toMatchObject({ added: 1, removed: 0, renamed: 0 });
    expect(byShow.get(unpub.showId)).toMatchObject({ added: 1, removed: 0, renamed: 0 });
  });

  it("a show with zero un-dispositioned roster rows is absent from the result", async () => {
    const withRoster = await seedShow(true);
    await seedLog(withRoster.showId, withRoster.driveFileId, { change_kind: "crew_added" });
    const empty = await seedShow(true);
    // only a NON-roster row → contributes nothing.
    await seedLog(empty.showId, empty.driveFileId, { change_kind: "field_changed" });

    const rows = await callRosterCounts([withRoster.showId, empty.showId]);
    const ids = rows.map((r) => r.show_id);
    expect(ids).toContain(withRoster.showId);
    expect(ids).not.toContain(empty.showId);
  });

  it("grant boundary — execute is service-role-only (authenticated denied)", async () => {
    const [priv] = await holdsSql`
      select
        has_function_privilege('authenticated', 'public.roster_shift_counts(uuid[])', 'execute') as auth,
        has_function_privilege('service_role', 'public.roster_shift_counts(uuid[])', 'execute') as svc`;
    expect((priv as { auth: boolean }).auth).toBe(false);
    expect((priv as { svc: boolean }).svc).toBe(true);
  });
});
