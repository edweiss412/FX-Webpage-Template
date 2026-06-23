/**
 * tests/sync/discardStagedRevalidate.test.ts (nav-perf tag-caching, plan Task 9)
 *
 * The discardStaged WRAPPER revalidates the show's data-cache tag POST-COMMIT
 * ONLY on the live restore-status discard (which reverts shows.last_sync_status —
 * projected by getShowForViewer → StaleFooter), and only after the pipeline
 * lock/tx resolves. The deferral / pending-delete / wizard paths surface no
 * showId → no revalidate.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { showCacheTag } from "@/lib/data/showCacheTag";
import type { DiscardStagedResult } from "@/lib/sync/discardStaged";

const order: string[] = [];
const revalidateTag = vi.fn((tag: string, _profile?: unknown) => {
  order.push(`revalidate:${tag}`);
});
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: (tag: string, profile: unknown) => revalidateTag(tag, profile),
  revalidatePath: vi.fn(),
}));

// The wrapper's only post-commit boundary is `withPostgresSyncPipelineLock` resolving. Mock it to
// push `committed` and return a controlled result (bypassing the inner DB-touching deps).
const lockResult = { value: null as DiscardStagedResult | { skipped: string } | null };
vi.mock("@/lib/sync/runScheduledCronSync", () => ({
  withPostgresSyncPipelineLock: async (_id: string) => {
    order.push("committed");
    return lockResult.value;
  },
  // discardStaged imports these names from runScheduledCronSync via applyStaged re-exports; the
  // wrapper only uses withPostgresSyncPipelineLock, but the module must export the type token.
  STAGED_PARSE_REVISION_RACE: "STAGED_PARSE_REVISION_RACE",
}));

const { discardStaged } = await import("@/lib/sync/discardStaged");

beforeEach(() => {
  order.length = 0;
  revalidateTag.mockClear();
});

describe("discardStaged wrapper post-commit revalidate", () => {
  test("revalidates AFTER commit on a live restore-status discard (showId present)", async () => {
    lockResult.value = { outcome: "discarded", variant: "try_again", showId: "show-42" };
    const result = await discardStaged({
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "staged-live",
      discardedByEmail: "doug@fxav.test",
      variant: "try_again",
    });
    expect(result).toEqual({ outcome: "discarded", variant: "try_again", showId: "show-42" });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag("show-42"), { expire: 0 });
    expect(order).toEqual(["committed", `revalidate:${showCacheTag("show-42")}`]);
  });

  test("does NOT revalidate a discard with no showId (deferral / first-seen path)", async () => {
    lockResult.value = { outcome: "discarded", variant: "defer_until_modified" };
    await discardStaged({
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "staged-live",
      discardedByEmail: "doug@fxav.test",
      variant: "defer_until_modified",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("does NOT revalidate a non-discarded outcome (stale)", async () => {
    lockResult.value = { outcome: "stale", code: "STALE_DISCARD_REJECTED" };
    await discardStaged({
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "staged-live",
      discardedByEmail: "doug@fxav.test",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  test("does NOT revalidate a ConcurrentSyncSkipped result", async () => {
    lockResult.value = { skipped: "CONCURRENT_SYNC_SKIPPED" };
    await discardStaged({
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "staged-live",
      discardedByEmail: "doug@fxav.test",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
