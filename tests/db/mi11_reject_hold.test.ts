/**
 * Task 3.1 — mi11_reject_hold RPC: convert a pending hold → disposition-appropriate
 * undo_override + write a reject show_change_log row.
 *
 * Reject is DISPOSITION-AWARE (resolution #20 / PF30): a flat proposed_value=null is
 * correct ONLY for email_change; rename/removal must carry the suppression baseline on
 * held_value.baseline, else the next unchanged sync re-applies the rejected change.
 *
 * Staleness (resolution #26 / PF40): the feed-rendered base_modified_time is submitted
 * back as p_expected_base_modified_time; base IS DISTINCT FROM expected → MI11_TARGET_MOVED,
 * zero mutation.
 *
 * All RPC calls go through the AUTHED admin path (request.jwt.claims=ADMIN_CLAIMS), NOT the
 * service-role superuser, so the body's is_admin() gate + auth_email_canonical() stamp run.
 */
import { afterAll, describe, expect, it } from "vitest";

import { messageFor } from "@/lib/messages/lookup";
import {
  ADMIN_EMAIL,
  asAdminTx,
  asNonAdminTx,
  callReject,
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

describe("mi11_reject_hold — disposition-aware undo_override + reject log (Task 3.1)", () => {
  it("email_change → undo_override crew_email, no baseline, old email kept, reject log", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const proposed: Disposition = {
      disposition: "email_change",
      name: "Alice",
      email: "alice@new",
    };
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_email",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: proposed,
      baseModifiedTime: "2026-06-01T00:00:00.000Z",
    });

    const res = await asAdminTx((tx) => callReject(tx, hold.id, hold.baseModifiedTime));
    expect(res).toEqual({ ok: true });

    const after = await readHold(mi11Sql, hold.id);
    expect(after?.kind).toBe("undo_override");
    expect(after?.domain).toBe("crew_email");
    expect(after?.proposed_value).toBeNull();
    expect((after?.held_value as Record<string, unknown>).baseline).toBeUndefined();

    // Reject keeps the OLD identity — Alice's crew email is still the old value.
    const alice = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(alice?.email).toBe("alice@old");

    const log = await readChangeLogByShow(mi11Sql, show.showId);
    const rejectRow = log.find((r) => r.source === "mi11_reject");
    expect(rejectRow).toBeTruthy();
    expect(rejectRow?.change_kind).toBe("crew_email_changed");
    expect(rejectRow?.status).toBe("rejected");
    expect(rejectRow?.entity_ref).toBe("Alice");
    expect(rejectRow?.created_by).toBe(ADMIN_EMAIL);
    expect(rejectRow?.before_image).toMatchObject({ name: "Alice", email: "alice@old" });
  });

  it("rename → undo_override crew_identity, baseline.suppressed_added derived from proposed_value", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const proposed: Disposition = { disposition: "rename", name: "Alicia", email: "alice@new" };
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: proposed,
      baseModifiedTime: "2026-06-01T00:00:00.000Z",
    });

    const res = await asAdminTx((tx) => callReject(tx, hold.id, hold.baseModifiedTime));
    expect(res).toEqual({ ok: true });

    const after = await readHold(mi11Sql, hold.id);
    expect(after?.kind).toBe("undo_override");
    expect(after?.domain).toBe("crew_identity");
    expect(after?.proposed_value).toBeNull();
    // baseline derived from the SEEDED proposed_value (anti-tautology), not literals.
    expect((after?.held_value as Record<string, unknown>).baseline).toEqual({
      kind: "rename",
      suppressed_added: { name: proposed.name, email: proposed.email },
    });

    const log = await readChangeLogByShow(mi11Sql, show.showId);
    const rejectRow = log.find((r) => r.source === "mi11_reject");
    expect(rejectRow?.change_kind).toBe("crew_renamed");
    expect(rejectRow?.status).toBe("rejected");
    expect(rejectRow?.created_by).toBe(ADMIN_EMAIL);
  });

  it("removal → undo_override crew_identity, baseline={kind:removal}, row still present", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "removal" },
      baseModifiedTime: "2026-06-01T00:00:00.000Z",
    });

    const res = await asAdminTx((tx) => callReject(tx, hold.id, hold.baseModifiedTime));
    expect(res).toEqual({ ok: true });

    const after = await readHold(mi11Sql, hold.id);
    expect(after?.kind).toBe("undo_override");
    expect(after?.domain).toBe("crew_identity");
    expect(after?.proposed_value).toBeNull();
    expect((after?.held_value as Record<string, unknown>).baseline).toEqual({ kind: "removal" });

    // Reject keeps Alice present.
    const alice = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(alice).toBeTruthy();

    const log = await readChangeLogByShow(mi11Sql, show.showId);
    const rejectRow = log.find((r) => r.source === "mi11_reject");
    expect(rejectRow?.change_kind).toBe("crew_removed");
    expect(rejectRow?.status).toBe("rejected");
    expect(rejectRow?.created_by).toBe(ADMIN_EMAIL);
  });

  it("non-admin authenticated caller → forbidden (42501), no mutation", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_email",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "alice@new" },
      baseModifiedTime: "2026-06-01T00:00:00.000Z",
    });

    await expect(
      asNonAdminTx((tx) => callReject(tx, hold.id, hold.baseModifiedTime)),
    ).rejects.toThrow();

    const after = await readHold(mi11Sql, hold.id);
    expect(after?.kind).toBe("mi11_pending"); // unchanged
    const log = await readChangeLogByShow(mi11Sql, show.showId);
    expect(log.length).toBe(0);
  });

  it("non-existent / already-released hold → MI11_HOLD_ALREADY_RESOLVED, no log row", async () => {
    const show = await seedShow(mi11Sql);
    const res = await asAdminTx((tx) =>
      callReject(tx, "00000000-0000-0000-0000-0000000000aa", "2026-06-01T00:00:00.000Z"),
    );
    expect(res).toEqual({ ok: false, code: "MI11_HOLD_ALREADY_RESOLVED" });
    const log = await readChangeLogByShow(mi11Sql, show.showId);
    expect(log.length).toBe(0);
  });

  it("stale Reject (base retargeted since render) → MI11_TARGET_MOVED, zero mutation", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const T0 = "2026-06-01T00:00:00.000Z";
    const T1 = "2026-06-02T00:00:00.000Z";
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_email",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "alice@new" },
      baseModifiedTime: T0,
    });
    // Capture T0 as the feed-rendered expected token.
    const expectedToken = hold.baseModifiedTime;
    expect(new Date(expectedToken).toISOString()).toBe(T0);

    // SIMULATE Phase-2 Task-2.8 in-place re-eval: disposition flipped + anchor bumped to T1.
    await mi11Sql`
      update public.sync_holds
         set proposed_value = ${mi11Sql.json({ disposition: "rename", name: "Alicia", email: "alice@new" })},
             base_modified_time = ${T1}::timestamptz
       where id = ${hold.id}`;

    const res = await asAdminTx((tx) => callReject(tx, hold.id, expectedToken));
    expect(res).toEqual({ ok: false, code: "MI11_TARGET_MOVED" });

    // ZERO mutation: still mi11_pending, retargeted proposed_value/base intact.
    const after = await readHold(mi11Sql, hold.id);
    expect(after?.kind).toBe("mi11_pending");
    expect(after?.proposed_value).toMatchObject({ disposition: "rename", name: "Alicia" });
    expect(new Date(after!.base_modified_time as string).toISOString()).toBe(T1);

    const log = await readChangeLogByShow(mi11Sql, show.showId);
    expect(log.length).toBe(0);

    // invariant 5 — the code resolves to non-null copy (verification-only).
    expect(messageFor("MI11_TARGET_MOVED")).toBeTruthy();
  });
});
