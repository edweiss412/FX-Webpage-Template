import { describe, it, expect } from "vitest";
import {
  seedHeldShow, seedArchivedShow, seedFinalizeOwnedShow, asAdminRpc, readShow, readShareToken,
} from "@/tests/db/_b2Helpers";

describe("publish_show (atomic freshness gate)", () => {
  it("Held + clean (requires_resync=false, no scratch) → published=true + invalidation", async () => {
    const { showId } = await seedHeldShow({ requiresResync: false });
    await asAdminRpc("publish_show", { p_show_id: showId });
    expect((await readShow(showId)).published).toBe(true);
  });

  it("refuses requires_resync=true → PUBLISH_BLOCKED_PENDING_REVIEW", async () => {
    const { showId } = await seedHeldShow({ requiresResync: true });
    await expect(asAdminRpc("publish_show", { p_show_id: showId })).rejects.toThrow(/PUBLISH_BLOCKED_PENDING_REVIEW/);
  });

  it("refuses a live pending_syncs / pending_ingestions / deferred_ingestions row → PUBLISH_BLOCKED_PENDING_REVIEW", async () => {
    for (const t of ["pending_syncs", "pending_ingestions", "deferred_ingestions"] as const) {
      const { showId } = await seedHeldShow({ requiresResync: false, scratch: t });
      await expect(asAdminRpc("publish_show", { p_show_id: showId })).rejects.toThrow(/PUBLISH_BLOCKED_PENDING_REVIEW/);
    }
  });

  it("refuses an archived show → SHOW_ARCHIVED_IMMUTABLE (no publish)", async () => {
    const { showId } = await seedArchivedShow();
    await expect(asAdminRpc("publish_show", { p_show_id: showId })).rejects.toThrow(/SHOW_ARCHIVED_IMMUTABLE/);
    expect((await readShow(showId)).published).toBe(false);
  });

  it("refuses a finalize-owned (Publishing) show → FINALIZE_OWNED_SHOW (no publish)", async () => {
    const { showId } = await seedFinalizeOwnedShow();
    await expect(asAdminRpc("publish_show", { p_show_id: showId })).rejects.toThrow(/FINALIZE_OWNED_SHOW/);
    expect((await readShow(showId)).published).toBe(false);
  });

  it("is idempotent on an already-published show (no-op, no throw)", async () => {
    const { showId } = await seedHeldShow({ requiresResync: false });
    await asAdminRpc("publish_show", { p_show_id: showId });
    await asAdminRpc("publish_show", { p_show_id: showId }); // second call no-ops
    expect((await readShow(showId)).published).toBe(true);
  });
});
