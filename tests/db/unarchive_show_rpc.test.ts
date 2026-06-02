import { describe, it, expect } from "vitest";
import {
  seedArchivedShow, seedLegacyArchivedShow, seedHeldShow, seedLiveShowWithToken,
  asAdminRpc, readShow, readShareToken, scratchCount,
} from "@/tests/db/_b2Helpers";

describe("unarchive_show (revival-sanitization chokepoint)", () => {
  it("Archived→Held: archived=false, archived_at=null, requires_resync=true, published stays false", async () => {
    const { showId } = await seedArchivedShow();
    await asAdminRpc("unarchive_show", { p_show_id: showId });
    const s = await readShow(showId);
    expect(s.archived).toBe(false);
    expect(s.archived_at).toBeNull();
    expect(s.published).toBe(false);     // Held
    expect(s.requires_resync).toBe(true);
  });

  it("rotates the share token + bumps picker_epoch + clears live non-wizard scratch/suppressors (version-skew chokepoint)", async () => {
    const { showId, driveFileId, originalToken, originalEpoch } = await seedLegacyArchivedShow({ withScratchAndDeferral: true });
    await asAdminRpc("unarchive_show", { p_show_id: showId });
    expect((await readShareToken(showId)).share_token).not.toBe(originalToken);
    expect((await readShow(showId)).picker_epoch).toBe(originalEpoch + 1);
    expect(await scratchCount(driveFileId)).toEqual({ pending_syncs: 0, pending_ingestions: 0, deferred_ingestions: 0 });
  });

  it("stale Unarchive on an already-HELD row is a no-op: token + picker_epoch UNCHANGED (early-return before rotation)", async () => {
    const { showId, originalEpoch } = await seedHeldShow({ requiresResync: false });
    const tokenBefore = (await readShareToken(showId)).share_token;
    await asAdminRpc("unarchive_show", { p_show_id: showId });
    expect((await readShareToken(showId)).share_token).toBe(tokenBefore);   // NOT rotated
    expect((await readShow(showId)).picker_epoch).toBe(originalEpoch);       // NOT bumped
  });

  it("stale Unarchive on an already-LIVE row does NOT rotate the active share_token (would strand crew links)", async () => {
    const { showId, originalToken, originalEpoch } = await seedLiveShowWithToken();
    await asAdminRpc("unarchive_show", { p_show_id: showId });
    expect((await readShareToken(showId)).share_token).toBe(originalToken);  // active token preserved
    expect((await readShow(showId)).picker_epoch).toBe(originalEpoch);       // NOT bumped
    expect((await readShow(showId)).published).toBe(true);                   // Live untouched
  });
});
