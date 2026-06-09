/**
 * Tasks 3.4 / 3.5 — collision graph (_mi11_collision_group) + closed-group atomic swap-safe park.
 *
 * The graph is a directed transitive closure over {email, name} targets where the proposed value
 * differs from the row's own current value (satisfied self-edges for unchanged columns are skipped).
 * A chain ending at a live row with NO open vacating hold → IDENTITY_WOULD_COLLIDE, zero mutation.
 * A fully-closed group (swap/cycle/mixed) is approved atomically with a swap-safe park
 * (email→NULL via the partial unique index; name→'__hold:<uuid>' placeholder).
 *
 * Per-member validation pass (resolution #25/PF39): every group member is re-validated against the
 * SAME guard set as the submitted hold (staleness / reservation-collision / disposition-validity).
 *
 * Arity (Tasks 3.4-3.5): mi11_approve_hold($1::uuid, $2::timestamptz, $3::timestamptz).
 * For happy-path group approvals, pass observed == expected == the SUBMITTED hold's base.
 */
import { afterAll, describe, expect, it } from "vitest";

import { messageFor } from "@/lib/messages/lookup";
import {
  asAdminTx,
  callApprove,
  closeMi11Helpers,
  heldFromCrew,
  mi11Sql,
  readChangeLogByShow,
  readCrewByName,
  readHold,
  readHoldsByShow,
  seedCrew,
  seedHold,
  seedShow,
  type Disposition,
} from "./_mi11Helpers";

afterAll(closeMi11Helpers);

const T0 = "2026-06-01T00:00:00.000Z";
const T1 = "2026-06-02T00:00:00.000Z";

describe("mi11 collision graph — closure + IDENTITY_WOULD_COLLIDE (Task 3.4)", () => {
  it("chain terminating at a non-held live row → IDENTITY_WOULD_COLLIDE, zero mutation", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "bob@x" }); // live, NO open hold
    const beforeBob = await readCrewByName(mi11Sql, show.showId, "Bob");
    const hold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "bob@x" }, // wants Bob's email
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) => callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime));
    expect(res).toEqual({ ok: false, code: "IDENTITY_WOULD_COLLIDE" });

    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe("alice@old");
    expect(await readCrewByName(mi11Sql, show.showId, "Bob")).toEqual(beforeBob); // untouched
    expect((await readHold(mi11Sql, hold.id))?.kind).toBe("mi11_pending");
    expect((await readChangeLogByShow(mi11Sql, show.showId)).length).toBe(0);
    expect(messageFor("IDENTITY_WOULD_COLLIDE")).toBeTruthy();
  });

  it("self-edge is satisfied, not a collision: rename keeping email unchanged approves", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@old" });
    const proposed: Disposition = { disposition: "rename", name: "Alice2", email: "alice@old" }; // email UNCHANGED
    const hold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@old"),
      proposedValue: proposed,
      baseModifiedTime: T0,
    });

    const res = await asAdminTx((tx) => callApprove(tx, hold.id, hold.baseModifiedTime, hold.baseModifiedTime));
    expect(res).toEqual({ ok: true });
    expect(await readCrewByName(mi11Sql, show.showId, "Alice")).toBeNull();
    expect((await readCrewByName(mi11Sql, show.showId, "Alice2"))?.email).toBe("alice@old");
  });
});

describe("mi11 closed-group atomic swap-safe park (Task 3.5)", () => {
  it("two-person email swap: both reassigned, both holds deleted, two applied logs", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "a@x" });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "b@x" });
    const aliceHold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "a@x"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "b@x" },
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "b@x"),
      proposedValue: { disposition: "email_change", name: "Bob", email: "a@x" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, aliceHold.id, T1, T1));
    expect(res).toEqual({ ok: true });

    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe("b@x");
    expect((await readCrewByName(mi11Sql, show.showId, "Bob"))?.email).toBe("a@x");
    expect((await readHoldsByShow(mi11Sql, show.showId)).length).toBe(0);
    const applied = (await readChangeLogByShow(mi11Sql, show.showId)).filter(
      (r) => r.source === "mi11_approve" && r.status === "applied",
    );
    expect(applied.length).toBe(2);
  });

  it("3-way email cycle A:1→2 B:2→3 C:3→1 closes; all holds gone", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "A", { email: "1@x" });
    await seedCrew(mi11Sql, show.showId, "B", { email: "2@x" });
    await seedCrew(mi11Sql, show.showId, "C", { email: "3@x" });
    const aHold = await seedHold(mi11Sql, show, {
      entityKey: "A",
      heldValue: heldFromCrew("A", "1@x"),
      proposedValue: { disposition: "email_change", name: "A", email: "2@x" },
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      entityKey: "B",
      heldValue: heldFromCrew("B", "2@x"),
      proposedValue: { disposition: "email_change", name: "B", email: "3@x" },
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      entityKey: "C",
      heldValue: heldFromCrew("C", "3@x"),
      proposedValue: { disposition: "email_change", name: "C", email: "1@x" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, aHold.id, T1, T1));
    expect(res).toEqual({ ok: true });
    expect((await readCrewByName(mi11Sql, show.showId, "A"))?.email).toBe("2@x");
    expect((await readCrewByName(mi11Sql, show.showId, "B"))?.email).toBe("3@x");
    expect((await readCrewByName(mi11Sql, show.showId, "C"))?.email).toBe("1@x");
    expect((await readHoldsByShow(mi11Sql, show.showId)).length).toBe(0);
  });

  it("mixed rename + email swap exercises NOT-NULL name parking", async () => {
    // Alice renames to 'Bob' (a name held by a vacating member); Bob renames to 'Alice'.
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "a@x" });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "b@x" });
    const aliceHold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "a@x"),
      proposedValue: { disposition: "rename", name: "Bob", email: "a@x" },
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "b@x"),
      proposedValue: { disposition: "rename", name: "Alice", email: "b@x" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, aliceHold.id, T1, T1));
    expect(res).toEqual({ ok: true });
    // Names swapped (rename = delete+insert), emails unchanged on each renamed identity.
    expect((await readCrewByName(mi11Sql, show.showId, "Bob"))?.email).toBe("a@x");
    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe("b@x");
    expect((await readHoldsByShow(mi11Sql, show.showId)).length).toBe(0);
  });

  it("closed-group RENAME node = delete+insert: replacement gets a FRESH id, before_image keeps the old id (P3-F2)", async () => {
    // A rename node inside a closed group must match single-node rename semantics (spec §5.4):
    // the renamed replacement is a NEW crew_members row (fresh id, unclaimed), NOT the old PK reused.
    const show = await seedShow(mi11Sql);
    const seededAlice = await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "a@x",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "b@x" });
    // Alice renames to 'Bob' (Bob vacates his name+email by also renaming to 'Alice').
    const aliceHold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "a@x"),
      proposedValue: { disposition: "rename", name: "Bob", email: "a@x" },
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "b@x"),
      proposedValue: { disposition: "rename", name: "Alice", email: "b@x" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, aliceHold.id, T1, T1));
    expect(res).toEqual({ ok: true });

    // The replacement row named 'Bob' (Alice→Bob) is a FRESH identity: different id, unclaimed.
    const newBob = await readCrewByName(mi11Sql, show.showId, "Bob");
    expect(newBob?.email).toBe("a@x");
    expect(newBob?.id).not.toBe(seededAlice.id); // NOT the old Alice PK reused
    expect(newBob?.claimed_via_oauth_at).toBeNull();

    // crew_renamed before_image for Alice→Bob carries Alice's OLD id + claim (P3-F1).
    const log = await readChangeLogByShow(mi11Sql, show.showId);
    const aliceRename = log.find(
      (r) => r.change_kind === "crew_renamed" && r.entity_ref === "Alice",
    );
    const before = aliceRename?.before_image as Record<string, unknown>;
    expect(before.id).toBe(seededAlice.id);
    expect(new Date(before.claimed_via_oauth_at as string).toISOString()).toBe(
      seededAlice.claimed_via_oauth_at,
    );
  });

  it("closed-group reassignment clears the participating node's claim (PF45)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", {
      email: "a@x",
      claimed: "2026-05-31T23:00:00.000Z",
    });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "b@x" });
    const aliceHold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "a@x"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "b@x" },
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "b@x"),
      proposedValue: { disposition: "email_change", name: "Bob", email: "a@x" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, aliceHold.id, T1, T1));
    expect(res).toEqual({ ok: true });
    const alice = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(alice?.email).toBe("b@x");
    expect(alice?.claimed_via_oauth_at).toBeNull(); // step (3) clears the moved-anchor claim
  });

  it("closed group with a removal node: email_change targets the freed email (PF29/PF32)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@x" });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "bob@x" });
    const aliceHold = await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@x"),
      // email_change → ONLY the freed EMAIL; name stays 'Alice'.
      proposedValue: { disposition: "email_change", name: "Alice", email: "bob@x" },
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "bob@x"),
      proposedValue: { disposition: "removal" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, aliceHold.id, T1, T1));
    expect(res).toEqual({ ok: true });
    expect(await readCrewByName(mi11Sql, show.showId, "Bob")).toBeNull(); // removed
    const alice = await readCrewByName(mi11Sql, show.showId, "Alice");
    expect(alice?.name).toBe("Alice"); // name unchanged
    expect(alice?.email).toBe("bob@x"); // got Bob's freed email
    expect((await readHoldsByShow(mi11Sql, show.showId)).length).toBe(0);
    const log = await readChangeLogByShow(mi11Sql, show.showId);
    expect(log.filter((r) => r.change_kind === "crew_removed" && r.status === "applied").length).toBe(1);
    expect(log.filter((r) => r.change_kind === "crew_email_changed" && r.status === "applied").length).toBe(1);
  });

  it("name-takeover variant uses a rename node → crew_renamed, NOT crew_email_changed (PF32)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "alice@x" });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "bob@x" });
    const aliceHold = await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "alice@x"),
      proposedValue: { disposition: "rename", name: "Bob", email: "alice2@x" }, // takes Bob's freed NAME
      baseModifiedTime: T1,
    });
    await seedHold(mi11Sql, show, {
      domain: "crew_identity",
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "bob@x"),
      proposedValue: { disposition: "removal" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, aliceHold.id, T1, T1));
    expect(res).toEqual({ ok: true });
    expect((await readCrewByName(mi11Sql, show.showId, "Bob"))?.email).toBe("alice2@x"); // Alice→Bob
    const log = await readChangeLogByShow(mi11Sql, show.showId);
    expect(log.filter((r) => r.change_kind === "crew_removed" && r.status === "applied").length).toBe(1);
    expect(log.filter((r) => r.change_kind === "crew_renamed" && r.status === "applied").length).toBe(1);
    expect(log.filter((r) => r.change_kind === "crew_email_changed").length).toBe(0);
  });

  it("stale non-submitted group member → MI11_TARGET_MOVED, zero mutation (PF39)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "a@x" });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "b@x" });
    await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "a@x"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "b@x" },
      baseModifiedTime: T0, // STALE relative to the submitted/observed T1
    });
    const bobHold = await seedHold(mi11Sql, show, {
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "b@x"),
      proposedValue: { disposition: "email_change", name: "Bob", email: "a@x" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, bobHold.id, T1, T1));
    expect(res).toEqual({ ok: false, code: "MI11_TARGET_MOVED" });

    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe("a@x");
    expect((await readCrewByName(mi11Sql, show.showId, "Bob"))?.email).toBe("b@x");
    const holds = await readHoldsByShow(mi11Sql, show.showId);
    expect(holds.length).toBe(2);
    expect(holds.every((h) => h.kind === "mi11_pending")).toBe(true);
    expect((await readChangeLogByShow(mi11Sql, show.showId)).length).toBe(0);
  });

  it("collision-blocked non-submitted group member → IDENTITY_WOULD_COLLIDE, zero mutation (PF39)", async () => {
    const show = await seedShow(mi11Sql);
    await seedCrew(mi11Sql, show.showId, "Alice", { email: "a@x" });
    await seedCrew(mi11Sql, show.showId, "Bob", { email: "b@x" });
    await seedHold(mi11Sql, show, {
      entityKey: "Alice",
      heldValue: heldFromCrew("Alice", "a@x"),
      proposedValue: { disposition: "email_change", name: "Alice", email: "b@x" },
      baseModifiedTime: T1,
      reservationCollisions: [{ name: "Alicia", email: "b@x" }], // Alice's hold is collision-blocked
    });
    const bobHold = await seedHold(mi11Sql, show, {
      entityKey: "Bob",
      heldValue: heldFromCrew("Bob", "b@x"),
      proposedValue: { disposition: "email_change", name: "Bob", email: "a@x" },
      baseModifiedTime: T1,
    });

    const res = await asAdminTx((tx) => callApprove(tx, bobHold.id, T1, T1));
    expect(res).toEqual({ ok: false, code: "IDENTITY_WOULD_COLLIDE" });

    expect((await readCrewByName(mi11Sql, show.showId, "Alice"))?.email).toBe("a@x");
    expect((await readCrewByName(mi11Sql, show.showId, "Bob"))?.email).toBe("b@x");
    const holds = await readHoldsByShow(mi11Sql, show.showId);
    expect(holds.length).toBe(2);
    const aliceHold = holds.find((h) => h.entity_key === "Alice");
    expect(aliceHold?.reservation_collisions).toEqual([{ name: "Alicia", email: "b@x" }]); // intact
    expect((await readChangeLogByShow(mi11Sql, show.showId)).length).toBe(0);
  });
});
