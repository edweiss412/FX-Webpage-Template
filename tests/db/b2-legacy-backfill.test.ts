import { describe, it, expect } from "vitest";
import {
  seedLegacyArchivedShow,
  seedArchivedShow,
  applyMigrationBackfill,
  readShow,
  readShareToken,
  scratchCount,
} from "@/tests/db/_b2Helpers";

describe("B2 legacy backfill (idempotent, legacy-scoped)", () => {
  it("rotates token + bumps epoch + stamps archived_at + clears scratch, ONLY for archived_at IS NULL rows; idempotent", async () => {
    const legacy = await seedLegacyArchivedShow({
      archivedAtNull: true,
      withScratchAndDeferral: true,
    }); // original token
    const b2row = await seedArchivedShow(); // B2-shaped: archived_at NOT NULL (stamped by archive_show)
    await applyMigrationBackfill(); // helper runs only the backfill statements
    expect((await readShareToken(legacy.showId)).share_token).not.toBe(legacy.originalToken);
    expect((await readShow(legacy.showId)).archived_at).not.toBeNull(); // stamped
    expect(await scratchCount(legacy.driveFileId)).toEqual({
      pending_syncs: 0,
      pending_ingestions: 0,
      deferred_ingestions: 0,
    });
    const b2TokenBefore = (await readShareToken(b2row.showId)).share_token;
    // second apply → no-op for both (legacy now stamped; b2row was never archived_at IS NULL)
    const legacyTokenAfter1 = (await readShareToken(legacy.showId)).share_token;
    await applyMigrationBackfill();
    expect((await readShareToken(legacy.showId)).share_token).toBe(legacyTokenAfter1); // not re-rotated
    expect((await readShareToken(b2row.showId)).share_token).toBe(b2TokenBefore); // untouched
  });
});
