import { describe, it, expect, vi } from "vitest";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import { applyStaged_unlocked, type ApplyStagedArgs } from "@/lib/sync/applyStaged";
import {
  discardStaged_unlocked,
  type DiscardStagedArgs,
  type DiscardStagedDeps,
} from "@/lib/sync/discardStaged";

type Calls = Array<{ sql: string; params: unknown[] }>;

function fakeTx(archived: boolean): LockedShowTx<SyncPipelineTx> & { calls: Calls } {
  const calls: Calls = [];
  const tx = {
    calls,
    async queryOne<T>(sql: string, params: unknown[]) {
      calls.push({ sql, params });
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      if (/select archived from public\.shows/i.test(sql)) return { archived } as T;
      if (/update public\.shows/i.test(sql)) return { restored: true } as T;
      throw new Error(`unexpected SQL in fakeTx: ${sql}`);
    },
  };
  return tx as unknown as LockedShowTx<SyncPipelineTx> & { calls: Calls };
}

const applyArgs: ApplyStagedArgs = {
  driveFileId: "drive-1",
  sourceScope: "live",
  stagedId: "staged-1",
  reviewerChoices: [],
  appliedByEmail: "doug@fxav.test",
};

const discardArgs: DiscardStagedArgs = {
  driveFileId: "drive-1",
  sourceScope: "live",
  stagedId: "staged-1",
  discardedByEmail: "doug@fxav.test",
};

describe("DEF-2 — apply/discard refuse archived shows; discard clears requires_resync", () => {
  it("applyStaged_unlocked refuses an archived show → blocked/SHOW_ARCHIVED_IMMUTABLE, no consumption", async () => {
    const tx = fakeTx(true);
    const res = await applyStaged_unlocked(tx, applyArgs);
    expect(res).toEqual({ outcome: "blocked", code: "SHOW_ARCHIVED_IMMUTABLE" });
    // Guard fires before any consumption: only the lock-held probe + the archived re-read ran.
    expect(
      tx.calls.every(
        (c) => /pg_locks/i.test(c.sql) || /select archived from public\.shows/i.test(c.sql),
      ),
    ).toBe(true);
  });

  it("discardStaged_unlocked refuses an archived show → blocked/SHOW_ARCHIVED_IMMUTABLE", async () => {
    const tx = fakeTx(true);
    const res = await discardStaged_unlocked(tx, discardArgs);
    expect(res).toEqual({ outcome: "blocked", code: "SHOW_ARCHIVED_IMMUTABLE" });
  });

  it("discardStaged on a Held (non-archived) show clears requires_resync via the restore UPDATE", async () => {
    const tx = fakeTx(false);
    const deps: DiscardStagedDeps = {
      readLivePendingSyncForDiscard: vi.fn(async () => ({
        driveFileId: "drive-1",
        driveFileName: "Sheet",
        stagedId: "staged-1",
        sourceKind: "manual",
        wizardSessionId: null,
        stagedModifiedTime: "2026-05-08T12:00:00.000Z",
        priorLastSyncStatus: "ok",
        priorLastSyncError: null,
      })),
      readShowForDiscard: vi.fn(async () => ({ showId: "show-1" })),
      deleteLivePendingSync: vi.fn(async () => undefined),
      // restoreShowStatus intentionally NOT injected → the default runs against fakeTx.
    };
    const res = await discardStaged_unlocked(tx, discardArgs, deps);
    expect(res).toEqual({ outcome: "discarded", variant: "try_again" });
    const restoreCall = tx.calls.find(
      (c) => /update public\.shows/i.test(c.sql) && /requires_resync\s*=\s*false/i.test(c.sql),
    );
    expect(restoreCall).toBeTruthy();
  });
});
