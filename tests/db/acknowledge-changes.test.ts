/**
 * Flow-4 — acknowledge_changes SECURITY DEFINER RPC + acknowledged_at/acknowledged_by columns.
 *
 * Admin-only ack of un-dispositioned auto-applied change-log rows. All expected values are derived
 * from the seeded fixtures; every exclusion assertion is scoped to a specific row id (anti-tautology).
 * Commits its seed (like the Phase-4 undo tests) so the SECURITY DEFINER RPC — called from a separate
 * authed-admin transaction — sees committed rows.
 */
import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  ADMIN_EMAIL,
  asAdminTx,
  asNonAdminTx,
  closeHoldsHelpers,
  holdsSql,
  seedShowWithCrew,
} from "./_holdsHelpers";

type AckResult = { ok: boolean; count: number };

async function seedLog(
  showId: string,
  driveFileId: string,
  o: { source?: string; change_kind: string; status?: string; entity_ref?: string },
): Promise<string> {
  const [row] = await holdsSql`
    insert into public.show_change_log
      (show_id, drive_file_id, source, change_kind, entity_ref, summary, status)
    values (${showId}, ${driveFileId}, ${o.source ?? "auto_apply"}, ${o.change_kind},
            ${o.entity_ref ?? null}, 'rendered summary', ${o.status ?? "applied"})
    returning id`;
  return row!.id as string;
}

async function readAck(
  id: string,
): Promise<{ acknowledged_at: unknown; acknowledged_by: unknown }> {
  const [row] = await holdsSql`
    select acknowledged_at, acknowledged_by from public.show_change_log where id = ${id}`;
  return row as { acknowledged_at: unknown; acknowledged_by: unknown };
}

async function callAck(showId: string, ids: string[] | null): Promise<AckResult> {
  return asAdminTx(async (tx) => {
    const [row] = await (tx as unknown as Sql).unsafe(
      `select public.acknowledge_changes($1::uuid, $2::uuid[]) as r`,
      [showId, ids as never],
    );
    return (row as unknown as { r: AckResult }).r;
  });
}

async function callAckNonAdmin(
  showId: string,
  ids: string[],
): Promise<{ forbidden: boolean; errcode?: string }> {
  try {
    await asNonAdminTx(async (tx) => {
      await (tx as unknown as Sql).unsafe(
        `select public.acknowledge_changes($1::uuid, $2::uuid[]) as r`,
        [showId, ids as never],
      );
    });
    return { forbidden: false };
  } catch (err) {
    const e = err as { code?: string };
    return { forbidden: e.code === "42501", ...(e.code ? { errcode: e.code } : {}) };
  }
}

afterAll(async () => {
  await holdsSql`delete from public.shows where drive_file_id like 'drv-%'`;
  await closeHoldsHelpers();
});

describe("acknowledge_changes RPC + acknowledged_at/acknowledged_by", () => {
  it("stamps only the targeted un-dispositioned auto_apply row; returns {ok,count}", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([]);
    const id1 = await seedLog(showId, driveFileId, {
      change_kind: "crew_added",
      entity_ref: "Alice",
    });
    const id2 = await seedLog(showId, driveFileId, {
      change_kind: "crew_removed",
      entity_ref: "Bob",
    });

    const res = await callAck(showId, [id1]);
    expect(res).toEqual({ ok: true, count: 1 });

    const a1 = await readAck(id1);
    expect(a1.acknowledged_at).not.toBeNull();
    expect(a1.acknowledged_by).toBe(ADMIN_EMAIL);
    // sibling id2 (NOT in p_ids) untouched.
    const a2 = await readAck(id2);
    expect(a2.acknowledged_at).toBeNull();
    expect(a2.acknowledged_by).toBeNull();
  });

  it("is idempotent — a second identical call acks nothing (count:0)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([]);
    const id1 = await seedLog(showId, driveFileId, { change_kind: "crew_added" });
    expect((await callAck(showId, [id1])).count).toBe(1);
    expect(await callAck(showId, [id1])).toEqual({ ok: true, count: 0 });
  });

  it("empty p_ids acks nothing (count:0)", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([]);
    await seedLog(showId, driveFileId, { change_kind: "crew_added" });
    expect(await callAck(showId, [])).toEqual({ ok: true, count: 0 });
  });

  it("NULL p_ids raises SQLSTATE 22004", async () => {
    const { showId } = await seedShowWithCrew([]);
    await expect(callAck(showId, null)).rejects.toMatchObject({ code: "22004" });
  });

  it("a non-admin caller is forbidden (42501) and acks nothing", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([]);
    const id1 = await seedLog(showId, driveFileId, { change_kind: "crew_added" });
    const denied = await callAckNonAdmin(showId, [id1]);
    expect(denied.forbidden).toBe(true);
    expect((await readAck(id1)).acknowledged_at).toBeNull();
  });

  it("does NOT ack a mi11_approve-source row nor an undone/superseded row", async () => {
    const { showId, driveFileId } = await seedShowWithCrew([]);
    const mi11Id = await seedLog(showId, driveFileId, {
      source: "mi11_approve",
      change_kind: "crew_added",
    });
    const undoneId = await seedLog(showId, driveFileId, {
      change_kind: "crew_removed",
      status: "undone",
    });
    const supersededId = await seedLog(showId, driveFileId, {
      change_kind: "crew_renamed",
      status: "superseded",
    });

    // all three ids passed; none qualifies (source/status filters) → count 0, all stay unacked.
    expect(await callAck(showId, [mi11Id, undoneId, supersededId])).toEqual({ ok: true, count: 0 });
    expect((await readAck(mi11Id)).acknowledged_at).toBeNull();
    expect((await readAck(undoneId)).acknowledged_at).toBeNull();
    expect((await readAck(supersededId)).acknowledged_at).toBeNull();
  });

  it("p_show_id scopes the update — an id from another show is not acked", async () => {
    const a = await seedShowWithCrew([]);
    const b = await seedShowWithCrew([]);
    const idA = await seedLog(a.showId, a.driveFileId, { change_kind: "crew_added" });
    const idB = await seedLog(b.showId, b.driveFileId, { change_kind: "crew_added" });

    // Pass BOTH ids but scope to show A → only idA is acked.
    const res = await callAck(a.showId, [idA, idB]);
    expect(res).toEqual({ ok: true, count: 1 });
    expect((await readAck(idA)).acknowledged_at).not.toBeNull();
    expect((await readAck(idB)).acknowledged_at).toBeNull();
  });

  it("backfill: pre-migration auto_apply/applied rows were stamped; new rows default NULL", async () => {
    // The one-shot forward-only backfill stamped rows that existed when the migration ran. A sentinel
    // auto_apply/applied row was inserted BEFORE the migration (persistent drive_file_id, not swept by
    // the 'drv-%' cleanup) so the backfill's effect is observable here.
    const [sentinel] = await holdsSql`
      select acknowledged_at from public.show_change_log
      where drive_file_id = 'backfill-sentinel-show' and entity_ref = '__backfill_sentinel__'
      limit 1`;
    expect(sentinel).toBeTruthy();
    expect((sentinel as { acknowledged_at: unknown }).acknowledged_at).not.toBeNull();

    // A row inserted AFTER the migration is NOT auto-stamped (no trigger; column defaults NULL).
    const { showId } = await seedShowWithCrew([]);
    const [fresh] = await holdsSql`
      insert into public.show_change_log
        (show_id, drive_file_id, source, change_kind, entity_ref, summary, status)
      values (${showId}, ${`drv-${randomUUID()}`}, 'auto_apply', 'crew_added', 'New', 's', 'applied')
      returning acknowledged_at`;
    expect((fresh as { acknowledged_at: unknown }).acknowledged_at).toBeNull();
  });
});
