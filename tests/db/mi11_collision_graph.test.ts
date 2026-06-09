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
