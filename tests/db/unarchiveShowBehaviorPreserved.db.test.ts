import { describe, it, expect } from "vitest";
import {
  seedLegacyArchivedShow,
  unarchiveShowReturning,
  readShow,
  readShareToken,
  scratchCount,
} from "@/tests/db/_b2Helpers";

// Task 3 (wizard blocker in-wizard resolution, 2026-07-16 spec §3.2): behavior-preservation safety net
// for the unarchive_show -> _unarchive_show_apply extraction (supabase/migrations/20260718000001_
// unarchive_show_apply_gate_free.sql). This test is written and run GREEN against the PRE-refactor
// unarchive_show (20260602000002_b2_r8_unarchive_returns_transition_flag.sql) as a baseline, then run
// again unchanged, still green, after the migration lands — proving the delegation is behavior-preserving.
describe("unarchive_show behavior is preserved across the _unarchive_show_apply extraction", () => {
  it("archived->held: state transition, token rotation, epoch bump, scratch purge, true return; idempotent no-op on second call", async () => {
    const { showId, driveFileId, originalToken, originalEpoch } = await seedLegacyArchivedShow({
      withScratchAndDeferral: true,
    });

    // First call: real archived -> held transition.
    expect(await unarchiveShowReturning(showId)).toBe(true);

    const show = await readShow(showId);
    expect(show.archived).toBe(false);
    expect(show.published).toBe(false);
    expect(show.archived_at).toBeNull();
    expect(show.requires_resync).toBe(true);
    expect(show.picker_epoch).toBe(originalEpoch + 1);

    const { share_token: newToken } = await readShareToken(showId);
    expect(newToken).not.toBe(originalToken);

    expect(await scratchCount(driveFileId)).toEqual({
      pending_syncs: 0,
      pending_ingestions: 0,
      deferred_ingestions: 0,
    });

    // Second call: already non-archived -> idempotent no-op. No further mutation.
    expect(await unarchiveShowReturning(showId)).toBe(false);

    const showAfterNoop = await readShow(showId);
    expect(showAfterNoop.picker_epoch).toBe(originalEpoch + 1); // unchanged
    const { share_token: tokenAfterNoop } = await readShareToken(showId);
    expect(tokenAfterNoop).toBe(newToken); // unchanged, NOT rotated again
  });
});
