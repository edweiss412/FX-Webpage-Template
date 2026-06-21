import { describe, it, expect } from "vitest";
import {
  seedLiveShowWithToken,
  seedFinalizeOwnedShow,
  asAdminRpc,
  readShow,
  readShareToken,
  scratchCount,
  archiveRaceExactlyOnce,
} from "@/tests/db/_b2Helpers";

describe("archive_show", () => {
  it("archives a Live show: archived/published/archived_at/token-null/share_token-rotated/picker_epoch-bumped + invalidation", async () => {
    const { showId, originalToken, originalEpoch } = await seedLiveShowWithToken();
    await asAdminRpc("archive_show", { p_show_id: showId });
    const s = await readShow(showId);
    expect(s.archived).toBe(true);
    expect(s.published).toBe(false);
    expect(s.archived_at).not.toBeNull();
    expect(s.unpublish_token).toBeNull();
    expect(s.picker_epoch).toBe(originalEpoch + 1);
    const tok = await readShareToken(showId);
    expect(tok.share_token).not.toBe(originalToken); // rotated
  });

  it("is idempotent: second (sequential) archive leaves share_token + picker_epoch UNCHANGED (early-return under lock; core did not re-run)", async () => {
    const { showId } = await seedLiveShowWithToken();
    await asAdminRpc("archive_show", { p_show_id: showId });
    const afterFirst = {
      epoch: (await readShow(showId)).picker_epoch,
      token: (await readShareToken(showId)).share_token,
    };
    await asAdminRpc("archive_show", { p_show_id: showId });
    const afterSecond = {
      epoch: (await readShow(showId)).picker_epoch,
      token: (await readShareToken(showId)).share_token,
    };
    expect(afterSecond.epoch).toBe(afterFirst.epoch);
    expect(afterSecond.token).toBe(afterFirst.token);
  });

  it("CONCURRENT double-archive (two connections, both begin while archived=false) rotates token + bumps epoch EXACTLY ONCE", async () => {
    const { showId, originalToken, originalEpoch } = await seedLiveShowWithToken();
    await archiveRaceExactlyOnce(showId);
    const s = await readShow(showId);
    expect(s.picker_epoch).toBe(originalEpoch + 1); // bumped exactly once, not twice
    const tok = (await readShareToken(showId)).share_token;
    expect(tok).not.toBe(originalToken); // rotated once
    expect((await readShareToken(showId)).share_token).toBe(tok); // stable — no second rotation in flight
  });

  it("refuses a finalize-owned (Publishing) row → FINALIZE_OWNED_SHOW and leaves archived/token/epoch UNCHANGED", async () => {
    const { showId, originalToken, originalEpoch } = await seedFinalizeOwnedShow();
    await expect(asAdminRpc("archive_show", { p_show_id: showId })).rejects.toThrow(
      /FINALIZE_OWNED_SHOW/,
    );
    const s = await readShow(showId);
    expect(s.archived).toBe(false); // NOT archived
    expect(s.picker_epoch).toBe(originalEpoch); // NOT bumped
    expect((await readShareToken(showId)).share_token).toBe(originalToken); // NOT rotated
  });

  it("clears live non-wizard pending_syncs/pending_ingestions/deferred_ingestions on a normal Live archive", async () => {
    const { showId, driveFileId } = await seedLiveShowWithToken({ withScratch: true });
    await asAdminRpc("archive_show", { p_show_id: showId });
    expect(await scratchCount(driveFileId)).toEqual({
      pending_syncs: 0,
      pending_ingestions: 0,
      deferred_ingestions: 0,
    });
  });
});
