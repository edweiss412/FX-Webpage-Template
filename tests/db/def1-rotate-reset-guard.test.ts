import { describe, it, expect } from "vitest";
import {
  seedArchivedShow,
  seedFinalizeOwnedShow,
  seedLiveShowWithToken,
  seedHeldShow,
  asAdminRpc,
  archivedImmutabilityRace,
  readShow,
} from "@/tests/db/_b2Helpers";

describe("DEF-1 — rotate/reset RPCs gate on published && !archived && !finalize-owned", () => {
  for (const fn of ["rotate_show_share_token", "reset_picker_epoch_atomic"] as const) {
    it(`${fn} refuses an archived show → SHOW_ARCHIVED_IMMUTABLE`, async () => {
      const { showId } = await seedArchivedShow();
      await expect(asAdminRpc(fn, { p_show_id: showId })).rejects.toThrow(
        /SHOW_ARCHIVED_IMMUTABLE/,
      );
    });

    it(`${fn} refuses a finalize-owned show → FINALIZE_OWNED_SHOW`, async () => {
      const { showId } = await seedFinalizeOwnedShow();
      await expect(asAdminRpc(fn, { p_show_id: showId })).rejects.toThrow(/FINALIZE_OWNED_SHOW/);
    });

    it(`${fn} refuses a Held (unpublished, non-archived, non-finalize-owned) show → SHOW_NOT_PUBLISHED (adversarial R2)`, async () => {
      // Spec §2.6 precondition is published && !archived && !finalize-owned. A plain Held show (post-unarchive,
      // awaiting Publish) must NOT have its share token rotated / picker epoch reset outside the publish gate.
      const { showId } = await seedHeldShow({ requiresResync: false });
      await expect(asAdminRpc(fn, { p_show_id: showId })).rejects.toThrow(/SHOW_NOT_PUBLISHED/);
    });

    it(`${fn} succeeds on a Live show (resolves without throwing)`, async () => {
      const { showId } = await seedLiveShowWithToken();
      await expect(asAdminRpc(fn, { p_show_id: showId })).resolves.toBeUndefined();
    });

    it(`${fn} loses the race to a concurrent Archive → REFUSES post-lock (R32 TOCTOU negative-regression)`, async () => {
      const { showId } = await seedLiveShowWithToken();
      const { concurrentThrew } = await archivedImmutabilityRace(showId, fn);
      expect(concurrentThrew).toBe(true);
      expect((await readShow(showId)).archived).toBe(true); // A's archive landed
    });
  }
});
