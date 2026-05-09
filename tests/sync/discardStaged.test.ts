import { describe, expect, test, vi } from "vitest";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  discardStaged_unlocked,
  PENDING_SYNC_NOT_FOUND,
  STALE_DISCARD_REJECTED,
  WIZARD_SCOPE_NOT_YET_IMPLEMENTED,
  type DiscardStagedDeps,
  type PendingSyncForDiscard,
} from "@/lib/sync/discardStaged";

type FakeTx = SyncPipelineTx & {
  held: boolean;
  queryOneCalls: Array<{ sql: string; params: unknown[] }>;
};

function fakeTx(held = true): FakeTx {
  return {
    held,
    queryOneCalls: [],
    async queryOne<T>(sql: string, params: unknown[]) {
      this.queryOneCalls.push({ sql, params });
      if (/pg_locks/i.test(sql)) return { held: this.held } as T;
      throw new Error(`unexpected SQL in fakeTx: ${sql}`);
    },
    async readShowForPhase1() {
      throw new Error("not reached");
    },
    async readLivePendingSync() {
      return null;
    },
    async upsertLivePendingIngestion() {},
    async deleteLivePendingIngestion() {},
    async upsertLivePendingSync() {
      return { stagedId: "unused" };
    },
    async updateShowParseError() {},
    async updateShowPendingReview() {},
    async deleteWizardPendingSyncsExcept() {},
    async applyShowSnapshot() {
      return { outcome: "updated", showId: "show-1", previousCrewNames: [] };
    },
    async deleteCrewMembersNotIn() {},
    async upsertCrewMembers() {},
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {},
    async replaceRooms() {},
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal() {},
  };
}

function pending(overrides: Partial<PendingSyncForDiscard> = {}): PendingSyncForDiscard {
  return {
    driveFileId: "drive-file-1",
    driveFileName: "Show Sheet",
    stagedId: "staged-live",
    sourceKind: "manual",
    wizardSessionId: null,
    stagedModifiedTime: "2026-05-08T12:00:00.000Z",
    priorLastSyncStatus: "ok",
    priorLastSyncError: null,
    ...overrides,
  };
}

function deps(overrides: Partial<DiscardStagedDeps> = {}): DiscardStagedDeps {
  const base: DiscardStagedDeps = {
    readLivePendingSyncForDiscard: vi.fn(async () => pending()),
    readShowForDiscard: vi.fn(async () => ({ showId: "show-1" })),
    restoreShowStatus: vi.fn(async () => undefined),
    deleteLivePendingSync: vi.fn(async () => undefined),
    upsertLiveDeferral: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides };
}

describe("discardStaged live-scope", () => {
  test("existing-show default discard restores prior status and deletes only the live pending row", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps();

    const result = await discardStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        variant: "try_again",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "discarded", variant: "try_again" });
    expect(syncDeps.readLivePendingSyncForDiscard).toHaveBeenCalledWith(tx, "drive-file-1");
    expect(syncDeps.restoreShowStatus).toHaveBeenCalledWith(tx, "drive-file-1", "ok", null);
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(
      tx,
      "drive-file-1",
      "staged-live",
    );
    expect(syncDeps.upsertLiveDeferral).not.toHaveBeenCalled();
  });

  test("first-seen default discard deletes the live row without status restore", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({ readShowForDiscard: vi.fn(async () => null) });

    const result = await discardStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        variant: "try_again",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "discarded", variant: "try_again" });
    expect(syncDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test.each([
    ["defer_until_modified", "defer_until_modified"],
    ["permanent_ignore", "permanent_ignore"],
  ] as const)("first-seen %s writes live deferred_ingestions then deletes", async (variant, kind) => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({ readShowForDiscard: vi.fn(async () => null) });

    const result = await discardStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        variant,
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "discarded", variant });
    expect(syncDeps.upsertLiveDeferral).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "drive-file-1",
        deferredKind: kind,
        wizardSessionId: null,
      }),
    );
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test("missing live row returns PENDING_SYNC_NOT_FOUND without touching wizard rows", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({ readLivePendingSyncForDiscard: vi.fn(async () => null) });

    const result = await discardStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        variant: "try_again",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "not_found", code: PENDING_SYNC_NOT_FOUND });
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
  });

  test("staged_id CAS mismatch returns STALE_DISCARD_REJECTED without mutation", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps();

    const result = await discardStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-from-stale-tab",
        variant: "try_again",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "stale", code: STALE_DISCARD_REJECTED });
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
    expect(syncDeps.upsertLiveDeferral).not.toHaveBeenCalled();
  });

  test("wizard scope is explicitly deferred behind a 501 code", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps();

    const result = await discardStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "wizard",
        wizardSessionId: "11111111-1111-4111-8111-111111111111",
        stagedId: "staged-wizard",
        variant: "try_again",
      },
      syncDeps,
    );

    expect(result).toEqual({
      outcome: "wizard_deferred",
      code: WIZARD_SCOPE_NOT_YET_IMPLEMENTED,
    });
    expect(syncDeps.readLivePendingSyncForDiscard).not.toHaveBeenCalled();
  });
});
