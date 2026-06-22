/**
 * Tasks 3.2 / 3.3 / 3.7 — mi11_approve_hold RPC.
 *
 * Approve applies the locked proposed_value disposition under the per-show advisory lock,
 * deletes the hold, and writes a source='mi11_approve' show_change_log row.
 *
 * Guards (in order, all BEFORE any mutation):
 *   - is_admin() (resolution #11)
 *   - disposition-validity: email_change ⇒ proposed_value.name = entity_key (resolution #22/PF32)
 *   - TWO staleness checks (resolution #26/PF40): observed==base AND base==expected
 *   - reservation-collision: jsonb_array_length(reservation_collisions)>0 → IDENTITY_WOULD_COLLIDE
 *     (resolution #23/PF37), BEFORE the collision graph / any mutation
 *
 * Claim-clear (resolution #27/PF45): every non-deletion approval whose email anchor moves ends
 * with claimed_via_oauth_at=NULL.
 *
 * All RPC calls use the AUTHED admin path (ADMIN_CLAIMS), exercising the is_admin() gate +
 * auth_email_canonical() stamp.
 */
import { afterAll, describe, expect, it } from "vitest";

import { messageFor } from "@/lib/messages/lookup";
import {
  ADMIN_EMAIL,
  asAdminTx,
  asNonAdminTx,
  callApprove,
  closeMi11Helpers,
  heldFromCrew,
  mi11Sql,
  readChangeLogByShow,
  readCrewByName,
  readHold,
  seedCrew,
  seedHold,
  seedShow,
  type Disposition,
} from "./_mi11Helpers";

afterAll(closeMi11Helpers);

const T0 = "2026-06-01T00:00:00.000Z";
const T1 = "2026-06-02T00:00:00.000Z";

describe("mi11_approve_hold — plain email_change self-edge approve (Task 3.2)", () => {
  it("applies the new email, deletes the hold, writes an applied mi11_approve log", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const proposed: Disposition = {
      disposition: "email_change",
      name: "Alice",
      email: "alice@new",
    };
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: proposed,
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });

    const alice = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(alice?.email).toBe(proposed.email); // derived from seeded proposed_value
    expect(await readHold(mi11Sql, hold.id)).toBeNull(); // hold deleted

    const log = await readChangeLogByShow(mi11Sql, show.showId);
    const row = log.find((r) => r.source === "mi11_approve");
    expect(row?.change_kind).toBe("crew_email_changed");
    expect(row?.status).toBe("applied");
    expect(row?.created_by).toBe(ADMIN_EMAIL);
    expect(row?.after_image).toMatchObject({ name: "Alice", email: proposed.email });
  });

  it("non-admin authed caller → forbidden, no mutation", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "alice@new" },
      baseModifiedTime: T0,
    });

    await expect(
      asNonAdminTx((tx) => callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime)),
    ).rejects.toThrow();

    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe("alice@old");
    expect((await readHold(mi11Sql, hold.id))?.kind).toBe("mi11_pending");
  });

  it("claimed Alice → clears claimed_via_oauth_at; new email becomes claimable (PF45)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "alice@old",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    const proposed: Disposition = {
      disposition: "email_change",
      name: "Alice",
      email: "alice@new",
    };
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: proposed,
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });

    const alice = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(alice?.email).toBe(proposed.email);
    // (b) load-bearing: the cleared claim is what makes the new email claimable again. The picker
    // RPC (select_identity_atomic(slug, share_token, crew_member_id)) rejects any selection of a
    // claimed row (claimed_via_oauth_at IS NOT NULL → PICKER_IDENTITY_CLAIMED), so NULL here is the
    // exact precondition for a fresh claim by alice@new (resolution #27 / PF45).
    expect(alice?.claimed_via_oauth_at).toBeNull();
    expect(messageFor("PICKER_IDENTITY_CLAIMED")).toBeTruthy(); // verification-only (invariant 5)
  });

  it("stale Approve synced-retarget (observed==base but base!=expected) → MI11_TARGET_MOVED, zero mutation (PF40)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "alice@new" },
      baseModifiedTime: T0,
    });
    const expectedToken = hold.baseModifiedTime; // T0 — the OLD token the admin saw.

    // synced retarget: a sync re-evaluated the hold in place → base bumped to T1.
    await mi11Sql`
      update public.sync_holds
         set proposed_value = ${mi11Sql.json({ disposition: "rename", name: "Alicia", email: "alice@new" })},
             base_modified_time = ${T1}::timestamptz
       where id = ${hold.id}`;
    const before = await readCrewByName(mi11Sql, show.showId, "Alice");

    // Drive moved too: observed=T1 == base=T1 (guard (a) passes); expected=T0 (guard (b) fires).
    const res = await asAdminTx((tx) => callApprove(tx, hold.id, T1, expectedToken));
    expect(res).toEqual({ ok: false, code: "MI11_TARGET_MOVED" });

    const after = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(after).toEqual(before); // byte-identical pre-image
    expect((await readHold(mi11Sql, hold.id))?.kind).toBe("mi11_pending");
    expect((await readChangeLogByShow(mi11Sql, show.showId)).length).toBe(0);
    expect(messageFor("MI11_TARGET_MOVED")).toBeTruthy();
  });

  it("malformed email_change (proposed.name != entity_key) → typed error, no mutation (PF32)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      // name 'Alicia' ≠ entity_key 'Alice' — a rename masquerading as an email_change.
      proposedValue: { disposition: "email_change", name: "Alicia", email: "alice@new" },
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: false, code: "IDENTITY_WOULD_COLLIDE" });

    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe("alice@old");
    expect((await readHold(mi11Sql, hold.id))?.kind).toBe("mi11_pending");
    expect((await readChangeLogByShow(mi11Sql, show.showId)).length).toBe(0);
  });

  it("reservation-collision (suppressed distinct row) → IDENTITY_WOULD_COLLIDE, zero mutation (PF37)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "x@new" },
      baseModifiedTime: T0,
      reservationCollisions: [{ name: "Alicia", email: "x@new" }],
    });
    const before = await readCrewByName(mi11Sql, show.showId, "Alice");

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: false, code: "IDENTITY_WOULD_COLLIDE" });

    expect(await readCrewByName(mi11Sql, show.showId, "Alice")).toEqual(before); // byte-identical
    expect((await readChangeLogByShow(mi11Sql, show.showId)).length).toBe(0);
    const after = await readHold(mi11Sql, hold.id);
    expect(after?.kind).toBe("mi11_pending");
    expect(after?.reservation_collisions).toEqual([{ name: "Alicia", email: "x@new" }]); // intact
    expect(messageFor("IDENTITY_WOULD_COLLIDE")).toBeTruthy();
  });

  it("empty reservation_collisions ('[]') approves normally — guard fires only when >0 (PF37 control)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const proposed: Disposition = {
      disposition: "email_change",
      name: "Alice",
      email: "alice@new",
    };
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: proposed,
      baseModifiedTime: T0,
      reservationCollisions: [],
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });
    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe(proposed.email);
    expect(await readHold(mi11Sql, hold.id)).toBeNull();
    const row = (await readChangeLogByShow(mi11Sql, show.showId)).find(
      (r) => r.source === "mi11_approve",
    );
    expect(row?.change_kind).toBe("crew_email_changed");
    expect(row?.status).toBe("applied");
  });
});

describe("mi11_approve_hold — rename + removal dispositions (Task 3.3)", () => {
  it("rename: deletes old row, inserts new identity, copies non-identity fields, crew_renamed log", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old", role: "A2" });
    const before = await readCrewByName(mi11Sql, show.showId, "Alice");
    const proposed: Disposition = { disposition: "rename", name: "Alicia", email: "alice@new" };
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: proposed,
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });

    expect(await readCrewByName(mi11Sql, show.showId, "Alice")).toBeNull(); // old gone
    const alicia = await readCrewByName(mi11Sql, show.showId, "Alicia");
    expect(alicia?.email).toBe(proposed.email);
    expect(alicia?.role).toBe(before?.role); // non-identity field copied
    expect(alicia?.phone).toBe(before?.phone);
    expect(alicia?.id).not.toBe(before?.id); // delete+insert → FRESH id, not the old PK (P3-F2, spec §5.4)
    expect(await readHold(mi11Sql, hold.id)).toBeNull();

    const row = (await readChangeLogByShow(mi11Sql, show.showId)).find(
      (r) => r.source === "mi11_approve",
    );
    expect(row?.change_kind).toBe("crew_renamed");
    expect(row?.status).toBe("applied");
    expect(row?.created_by).toBe(ADMIN_EMAIL);
    expect(row?.before_image).toMatchObject({ name: "Alice", email: "alice@old" });
    expect(row?.after_image).toMatchObject({ name: "Alicia", email: proposed.email });
  });

  it("rename-with-changed-email: new identity starts UNCLAIMED — does NOT inherit the deleted claim (PF45)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "alice@old",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    const proposed: Disposition = { disposition: "rename", name: "Alicia", email: "alice@new" };
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: proposed,
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });

    const alicia = await readCrewByName(mi11Sql, show.showId, "Alicia");
    expect(alicia?.email).toBe(proposed.email);
    expect(alicia?.claimed_via_oauth_at).toBeNull(); // born unclaimed
  });

  it("removal: deletes the crew row (claim gone with it), crew_removed log", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "alice@old",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "removal" },
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });

    expect(await readCrewByName(mi11Sql, show.showId, "Alice")).toBeNull(); // row deleted, no orphan
    expect(await readHold(mi11Sql, hold.id)).toBeNull();

    const row = (await readChangeLogByShow(mi11Sql, show.showId)).find(
      (r) => r.source === "mi11_approve",
    );
    expect(row?.change_kind).toBe("crew_removed");
    expect(row?.status).toBe("applied");
    expect(row?.created_by).toBe(ADMIN_EMAIL);
    expect(row?.before_image).toMatchObject({ name: "Alice", email: "alice@old" });
  });
});

describe("mi11_approve_hold — before_image carries id + claimed_via_oauth_at (P3-F1 / PF38 / resolution #24)", () => {
  it("approved removal: crew_removed before_image carries the LIVE row's id + claimed_via_oauth_at", async () => {
    const show = await seedShow(mi11Sql);
    const seeded = await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "alice@old",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    // held_value DELIBERATELY lacks id + claimed_via_oauth_at (writeMi11Holds excludes them) — the fix
    // must read the live row under the lock, NOT trust held_value.
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "removal" },
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });

    const row = (await readChangeLogByShow(mi11Sql, show.showId)).find(
      (r) => r.source === "mi11_approve",
    );
    expect(row?.change_kind).toBe("crew_removed");
    const before = row?.before_image as Record<string, unknown>;
    expect(before.id).toBe(seeded.id); // derived from the seeded live row (anti-tautology)
    expect(new Date(before.claimed_via_oauth_at as string).toISOString()).toBe(
      seeded.claimed_via_oauth_at,
    );
  });

  it("approved rename: crew_renamed before_image carries the OLD row's id + claimed_via_oauth_at", async () => {
    const show = await seedShow(mi11Sql);
    const seeded = await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "alice@old",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "rename", name: "Alicia", email: "alice@new" },
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });

    const row = (await readChangeLogByShow(mi11Sql, show.showId)).find(
      (r) => r.source === "mi11_approve",
    );
    expect(row?.change_kind).toBe("crew_renamed");
    const before = row?.before_image as Record<string, unknown>;
    expect(before.id).toBe(seeded.id); // OLD row's id, for Phase-4 undo restore (resolution #24)
    expect(new Date(before.claimed_via_oauth_at as string).toISOString()).toBe(
      seeded.claimed_via_oauth_at,
    );
  });

  it("approved email_change: before_image carries id + claim; the row KEEPS its id (same person)", async () => {
    const show = await seedShow(mi11Sql);
    const seeded = await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "alice@old",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "alice@new" },
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) =>
      callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
    );
    expect(res).toEqual({ ok: true });

    const row = (await readChangeLogByShow(mi11Sql, show.showId)).find(
      (r) => r.source === "mi11_approve",
    );
    const before = row?.before_image as Record<string, unknown>;
    expect(before.id).toBe(seeded.id);
    expect(new Date(before.claimed_via_oauth_at as string).toISOString()).toBe(
      seeded.claimed_via_oauth_at,
    );
    // email_change is the same person — the PK is preserved, only email moves (claim cleared per #27).
    const alice = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(alice?.id).toBe(seeded.id);
    expect(alice?.claimed_via_oauth_at).toBeNull();
  });
});

describe("mi11_approve_hold — live crew row vanished before approve → fail-safe, zero mutation (P3-F3)", () => {
  for (const disp of [
    {
      kind: "email_change",
      proposed: { disposition: "email_change", name: "Alice", email: "alice@new" },
    },
    { kind: "removal", proposed: { disposition: "removal" } },
    { kind: "rename", proposed: { disposition: "rename", name: "Alicia", email: "alice@new" } },
  ] as const) {
    it(`${disp.kind}: live row deleted, hold remains → MI11_TARGET_MOVED, NO phantom log, hold kept`, async () => {
      const show = await seedShow(mi11Sql);
      await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
      const hold = await seedHold(mi11Sql, show, {
        domain: disp.kind === "email_change" ? "crew_email" : "crew_identity",
        entityKey: "Alice",
        heldValue: heldFromCrew("Alice", "alice@old"),
        proposedValue: disp.proposed as Disposition,
        baseModifiedTime: T0,
      });
      // Some other path deleted Alice's live crew row while the hold remained open.
      await mi11Sql`delete from public.crew_members where show_id = ${show.showId} and name = 'Alice'`;

      const res = await asAdminTx((tx) =>
        callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime),
      );
      expect(res).toEqual({ ok: false, code: "MI11_TARGET_MOVED" });

      // ZERO mutation: NO phantom applied log row, the hold is STILL present, no crew row created.
      expect((await readChangeLogByShow(mi11Sql, show.showId)).length).toBe(0);
      expect((await readHold(mi11Sql, hold.id))?.kind).toBe("mi11_pending");
      expect(await readCrewByName(mi11Sql, show.showId, "Alice")).toBeNull();
      expect(await readCrewByName(mi11Sql, show.showId, "Alicia")).toBeNull();
      expect(messageFor("MI11_TARGET_MOVED")).toBeTruthy();
    });
  }
});

describe("mi11_approve_hold — stale-target guard, last_seen_modified_time insufficient (Task 3.7/F13)", () => {
  it("rejects on the PASSED observed Drive modtime even when shows.last_seen_modified_time == base", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "alice@new" },
      baseModifiedTime: T0,
    });
    // shows.last_seen_modified_time set to T0 (== base) — would ADMIT a stale approve if the RPC
    // used it for the guard. The passed observed Drive modtime is T1 (an edit landed in the sync→approve
    // window), so the RPC MUST reject on T1 != base, not consult last_seen.
    await mi11Sql`update public.shows set last_seen_modified_time = ${T0}::timestamptz where id = ${show.showId}`;

    // p_observed=T1, p_expected=T0 (matches base → feed-token guard passes; observed!=base is the rejecter).
    const res = await asAdminTx((tx) => callApprove(tx, hold.id, T1, hold.baseModifiedTime));
    expect(res).toEqual({ ok: false, code: "MI11_TARGET_MOVED" });

    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe("alice@old"); // no mutation
    expect((await readHold(mi11Sql, hold.id))?.kind).toBe("mi11_pending");
  });
});
