import { describe, it, expect } from "vitest";
import {
  seedFinalizeOwnedShow,
  seedHeldShow,
  readFinalizeOwnedAsAdmin,
  callReadFinalizeOwnedAsNonAdmin,
} from "@/tests/db/_b2Helpers";

// R4 F2 [MEDIUM] trust-boundary regression. readfinalizeowned_b2 is SECURITY DEFINER and was granted to
// `authenticated`, so any signed-in NON-admin could call it via PostgREST and infer whether an arbitrary
// show UUID is finalize-owned (a read over admin-only wizard/finalize state). The fix adds an is_admin()
// guard inside the function. Negative-regression: stash the guard and the first test passes (the leak).
describe("readfinalizeowned_b2 admin gate (R4 F2)", () => {
  it("rejects a signed-in NON-admin direct caller (the trust-boundary leak)", async () => {
    const { showId } = await seedFinalizeOwnedShow();
    await expect(callReadFinalizeOwnedAsNonAdmin(showId)).rejects.toThrow(/forbidden|42501|admin/i);
  });

  it("still serves an ADMIN caller — true for a finalize-owned show (the dashboard path is unbroken)", async () => {
    const { showId } = await seedFinalizeOwnedShow();
    expect(await readFinalizeOwnedAsAdmin(showId)).toBe(true);
  });

  it("still serves an ADMIN caller — false for a plain Held (non-finalize-owned) show", async () => {
    const { showId } = await seedHeldShow({ requiresResync: false });
    expect(await readFinalizeOwnedAsAdmin(showId)).toBe(false);
  });
});
