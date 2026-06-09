import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { Phase2GateBypassError } from "@/lib/sync/phase2";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  applyStaged,
  applyStaged_unlocked,
  DUPLICATE_REVIEWER_CHOICE,
  EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
  EXTRA_REVIEWER_CHOICE,
  INVALID_REVIEWER_ACTION,
  MISSING_REVIEWER_CHOICE,
  PENDING_SYNC_NOT_FOUND,
  STAGED_PARSE_OUTDATED,
  STAGED_PARSE_SOURCE_GONE,
  STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
  STAGED_PARSE_SUPERSEDED,
  STAGED_REVIEW_ITEMS_CORRUPT,
  STAGED_PARSE_RESULT_CORRUPT,
  WIZARD_SESSION_SUPERSEDED,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";

const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";

type FakeTx = SyncPipelineTx & {
  held: boolean;
  operations: string[];
  queryOneCalls: Array<{ sql: string; params: unknown[] }>;
};

function parseResult(): ParseResult {
  return {
    show: {
      title: "Show",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  };
}

function pending(overrides: Partial<PendingSyncForApply> = {}): PendingSyncForApply {
  return {
    driveFileId: "drive-file-1",
    stagedId: "staged-live",
    sourceKind: "manual",
    wizardSessionId: null,
    baseModifiedTime: "2026-05-08T10:00:00.000Z",
    stagedModifiedTime: "2026-05-08T12:00:00.000Z",
    parseResult: parseResult(),
    triggeredReviewItems: [],
    reviewItemsCorrupt: false,
    parseResultCorrupt: false,
    priorLastSyncStatus: "ok",
    priorLastSyncError: null,
    warningSummary: "none",
    ...overrides,
  };
}

function driveMeta(overrides: Partial<DriveListedFile & { trashed: boolean }> = {}) {
  return {
    driveFileId: "drive-file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["watched-folder"],
    headRevisionId: "head-1",
    trashed: false,
    ...overrides,
  };
}

function fakeTx(held = true): FakeTx {
  return {
    held,
    operations: [],
    queryOneCalls: [],
    async queryOne<T>(sql: string, params: unknown[]) {
      this.queryOneCalls.push({ sql, params });
      if (/pg_locks/i.test(sql)) return { held: this.held } as T;
      if (/select archived from public\.shows/i.test(sql)) return { archived: false } as T; // DEF-2 guard probe
      if (/upsert_admin_alert/i.test(sql)) return { id: "alert-row-1" } as T; // first-published tx-bound alert writer
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
      this.operations.push("applyShowSnapshot");
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

function deps(overrides: Partial<ApplyStagedDeps> = {}): ApplyStagedDeps {
  const base: ApplyStagedDeps = {
    readLivePendingSyncForApply: vi.fn(async () => pending()),
    readShowForApply: vi.fn(async () => ({
      showId: "show-1",
      lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
      diagrams: { snapshot_revision_id: "rev-prior" },
    })),
    readWatchedFolderId: vi.fn(async () => "watched-folder"),
    fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
    liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
    liveAssetReviewEffects: {
      parseResult: parseResult(),
      adminAlertCode: null,
      skipDiagramsWrite: false,
    },
    runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" })),
    insertSyncAudit: vi.fn(async () => "audit-1"),
    deleteLivePendingSync: vi.fn(async () => undefined),
    restoreShowStatus: vi.fn(async () => undefined),
    upsertLivePendingIngestion: vi.fn(async () => undefined),
    bumpReviewerAuthFloors: vi.fn(async () => undefined),
    upsertAdminAlert: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides };
}

describe("applyStaged live-scope", () => {
  test("wrapper performs live Drive metadata verification between two short show-lock windows", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const events: string[] = [];
    let lockCount = 0;
    const syncDeps = deps({
      withPipelineLock: vi.fn(async (_driveFileId, fn) => {
        lockCount += 1;
        events.push(`lock:${lockCount}:start`);
        const result = await fn(tx);
        events.push(`lock:${lockCount}:commit`);
        return result;
      }),
      readLivePendingSyncForApply: vi.fn(async () => {
        events.push("readPending");
        return pending();
      }),
      readShowForApply: vi.fn(async () => {
        events.push("readShow");
        return {
          showId: "show-1",
          lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
          diagrams: { snapshot_revision_id: "rev-prior" },
        };
      }),
      readWatchedFolderId: vi.fn(async () => {
        events.push("readFolder");
        return "watched-folder";
      }),
      fetchDriveFileMetadata: vi.fn(async () => {
        events.push("fetchMeta");
        return driveMeta();
      }),
      runPhase2: vi.fn(async () => {
        events.push("phase2");
        return { outcome: "applied" as const, showId: "show-1" };
      }),
    });

    const result = await applyStaged(
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({ outcome: "applied", showId: "show-1" });
    expect(events).toEqual([
      "lock:1:start",
      "readPending",
      "readShow",
      "readFolder",
      "lock:1:commit",
      "fetchMeta",
      "lock:2:start",
      "readPending",
      "readShow",
      "readFolder",
      "phase2",
      "lock:2:commit",
    ]);
  });

  test("wrapper aborts live Apply when staged_id changes between Drive verification and locked CAS", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const pendingRows = [
      pending(),
      pending({ stagedId: "staged-from-concurrent-reviewer" }),
    ];
    const syncDeps = deps({
      withPipelineLock: vi.fn(async (_driveFileId, fn) => fn(tx)),
      readLivePendingSyncForApply: vi.fn(async () => pendingRows.shift() ?? null),
      fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
    });

    const result = await applyStaged(
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "superseded", code: STAGED_PARSE_SUPERSEDED });
    expect(syncDeps.fetchDriveFileMetadata).toHaveBeenCalledOnce();
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
  });

  test("wrapper performs asset-review revision retry outside both live Apply lock windows", async () => {
    const item: TriggeredReviewItem = {
      id: "no-revision",
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: "sheet-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const events: string[] = [];
    let lockCount = 0;
    const priorDiagrams = {
      snapshot_revision_id: "prior-rev",
      snapshot_status: "complete",
    } as unknown as ParseResult["diagrams"];
    const syncDeps = deps({
      withPipelineLock: vi.fn(async (_driveFileId, fn) => {
        lockCount += 1;
        events.push(`lock:${lockCount}:start`);
        const result = await fn(tx);
        events.push(`lock:${lockCount}:commit`);
        return result;
      }),
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
        diagrams: priorDiagrams,
      })),
      fetchDriveFileMetadata: vi.fn(async () => {
        events.push("fetchMeta");
        return driveMeta();
      }),
      retryEmbeddedRevisionAvailability: vi.fn(async () => {
        events.push("retryRevision");
        return false;
      }),
    });

    const result = await applyStaged(
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "no-revision", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({
      outcome: "applied",
      adminAlertCode: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
    });
    expect(events).toEqual([
      "lock:1:start",
      "lock:1:commit",
      "fetchMeta",
      "retryRevision",
      "lock:2:start",
      "lock:2:commit",
    ]);
    expect(syncDeps.retryEmbeddedRevisionAvailability).toHaveBeenCalledWith("sheet-1");
    expect(syncDeps.runPhase2).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ skipDiagramsWrite: true }),
    );
  });

  test("Task 4.4: applying a FIRST_SEEN_REVIEW first-seen row routes through emitSuccessfulPhase2Tail with a 24h token", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const tail = vi.fn(async () => undefined);
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        // First-seen: baseModifiedTime must be null to match a null show watermark (else superseded).
        pending({ triggeredReviewItems: [{ id: "fs-1", invariant: "FIRST_SEEN_REVIEW" }], baseModifiedTime: null }),
      ),
      readShowForApply: vi.fn(async () => null), // first-seen: no show row yet
      liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
      runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-new" })),
      emitSuccessfulPhase2Tail: tail,
      createUnpublishToken: () => "tok-1",
      now: () => new Date("2026-05-08T12:00:00.000Z"),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "fs-1", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({ outcome: "applied", showId: "show-new" });
    // Adversarial R2: the SAME token must reach BOTH runPhase2 (→ applyShowSnapshot PERSISTS
    // shows.unpublish_token — the only persistence path) AND the tail (the SHOW_FIRST_PUBLISHED notice).
    // Passing it only to the tail emails a rollback link that unpublishShow can't honor (null token).
    const tokenPayload = { unpublishToken: "tok-1", unpublishTokenExpiresAt: "2026-05-09T12:00:00.000Z" };
    expect(syncDeps.runPhase2).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ autoPublishFirstSeen: tokenPayload }),
    );
    expect(tail).toHaveBeenCalledTimes(1);
    expect(tail).toHaveBeenCalledWith(
      expect.objectContaining({
        driveFileId: "drive-file-1",
        result: expect.objectContaining({ outcome: "applied", showId: "show-new" }),
        autoPublishFirstSeen: tokenPayload,
      }),
    );
  });

  test("Task 4.4 R3 negative-regression: the DEFAULT first-published alert writer is TX-BOUND (tx.queryOne → upsert_admin_alert), never the standalone service-role client", async () => {
    // R3 (adversarial, HIGH): the first-seen auto-publish tail wrote SHOW_FIRST_PUBLISHED through the
    // standalone service-role client — a SEPARATE DB connection that cannot see the apply tx's
    // just-created, uncommitted show, so admin_alerts.show_id → shows.id FK-fails and rolls back the
    // whole approval (proven against the real DB in tests/db/b2-first-published-alert-tx-boundary.test.ts).
    // This pins the FIX's wiring: with firstPublishedTailDeps NOT injected, applyStaged must default the
    // tail's upsertAdminAlert to a writer that runs on THIS apply tx (tx.queryOne), so the alert lands in
    // the same transaction as the show. Reverting the call site to defaultUpsertAdminAlert makes the
    // tx.queryOne(upsert_admin_alert) call vanish and fails this test.
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    // The REAL emitSuccessfulPhase2Tail runs (NOT injected) — its only working dep is upsertAdminAlert
    // (publishShowInvalidation/logSync are optional `?.`), so it reaches emitFirstPublishedNotice →
    // args.deps.upsertAdminAlert, which here is applyStaged's DEFAULT tx-bound writer.
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [{ id: "fs-1", invariant: "FIRST_SEEN_REVIEW" }], baseModifiedTime: null }),
      ),
      readShowForApply: vi.fn(async () => null),
      liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
      runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-new" })),
      createUnpublishToken: () => "tok-1",
      now: () => new Date("2026-05-08T12:00:00.000Z"),
      // emitSuccessfulPhase2Tail + firstPublishedTailDeps intentionally NOT injected → exercises BOTH the
      // real tail→writer linkage AND applyStaged's default tx-bound writer (the actual production path).
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "fs-1", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    const alertCall = tx.queryOneCalls.find((c) => /upsert_admin_alert/i.test(c.sql));
    expect(alertCall, "default first-published writer must route through tx.queryOne(upsert_admin_alert)").toBeDefined();
    // Exact production statement (same as tests/db/b2-first-published-alert-tx-boundary.test.ts).
    expect(alertCall!.sql).toBe("select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)::text as id");
    expect(alertCall!.params[0]).toBe("show-new");
    expect(alertCall!.params[1]).toBe("SHOW_FIRST_PUBLISHED");
    // Context passed RAW as an object (NOT JSON.stringify'd): postgres.js serializes the $3::jsonb param
    // once; pre-stringifying would double-encode to a jsonb string scalar. A string here = the bug.
    const ctx = alertCall!.params[2];
    expect(typeof ctx).toBe("object");
    expect(ctx).toMatchObject({
      drive_file_id: "drive-file-1",
      unpublish_token: "tok-1", // the SAME token runPhase2 persisted to shows.unpublish_token
    });
  });

  test("Task 4.4 negative-regression: a normal apply (no FIRST_SEEN_REVIEW) does NOT call emitSuccessfulPhase2Tail", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const tail = vi.fn(async () => undefined);
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending()), // no FIRST_SEEN_REVIEW sentinel
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
        diagrams: { snapshot_revision_id: "rev-prior" },
      })),
      liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
      runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" })),
      emitSuccessfulPhase2Tail: tail,
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({ outcome: "applied" });
    expect(tail).not.toHaveBeenCalled();
  });

  test("runs Phase 2 from stored parse_result, audits, and deletes only the live pending row", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps();

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({
      outcome: "applied",
      showId: "show-1",
      syncAuditId: "audit-1",
      derivedSideEffects: { revokeFloorForNames: [] },
    });
    expect(syncDeps.readLivePendingSyncForApply).toHaveBeenCalledWith(tx, "drive-file-1");
    expect(syncDeps.runPhase2).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "drive-file-1",
        mode: "manual",
        parseResult: pending().parseResult,
        binding: {
          bindingToken: "2026-05-08T12:00:00.000Z",
          modifiedTime: "2026-05-08T12:00:00.000Z",
        },
      }),
    );
    expect(syncDeps.insertSyncAudit).toHaveBeenCalledBefore(
      vi.mocked(syncDeps.deleteLivePendingSync!),
    );
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test("P2-F7: a LIVE staged row carrying an MI-11 item FAILS CLOSED (throws, never runs Phase 2)", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const mi11Item: TriggeredReviewItem = {
      id: "mi11-1",
      invariant: "MI-11",
      crew_name: "Alice",
      prior_email: "a@old",
      new_email: "a@new",
    };
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ wizardSessionId: null, triggeredReviewItems: [mi11Item] }),
      ),
    });

    // The reviewer-choice/validation passes (a valid `apply` choice for the MI-11 item), but the
    // legacy staged path would call runPhase2 with NO mi11Items → an UNGATED email change. The
    // fail-closed guard must throw BEFORE runPhase2, so the identity change is never applied.
    await expect(
      applyStaged_unlocked(
        tx,
        {
          driveFileId: "drive-file-1",
          sourceScope: "live",
          stagedId: "staged-live",
          reviewerChoices: [{ item_id: "mi11-1", action: "apply" }],
          appliedByEmail: "doug@fxav.test",
        },
        syncDeps,
      ),
    ).rejects.toBeInstanceOf(Phase2GateBypassError);

    // (a) no ungated apply: runPhase2 (which would upsert the new email) was NEVER invoked.
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    // (c) no crew upsert / no sync_holds write happened (the fake tx records crew/snapshot ops).
    expect(tx.operations).not.toContain("applyShowSnapshot");
  });

  test("missing live row returns PENDING_SYNC_NOT_FOUND without falling back to wizard rows", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({ readLivePendingSyncForApply: vi.fn(async () => null) });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "not_found", code: PENDING_SYNC_NOT_FOUND });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("a corrupt review gate fails closed: review_items_corrupt, no Phase 2 apply", async () => {
    // Fail-closed enforcement (Codex R2): a row whose triggered_review_items
    // could not be interpreted (reviewItemsCorrupt) must REFUSE Apply rather
    // than approve an empty review set and mutate shows unreviewed.
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ reviewItemsCorrupt: true })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({
      outcome: "review_items_corrupt",
      code: STAGED_REVIEW_ITEMS_CORRUPT,
    });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.insertSyncAudit).not.toHaveBeenCalled();
  });

  test("a corrupt parse_result refuses Apply with a typed parse_result_corrupt result, no throw, no Phase 2", async () => {
    // Codex R2 HIGH: asParseResult throws on genuinely-corrupt parse_result, but
    // the Apply routes call applyStaged directly and would 500 on a thrown reader.
    // The mapper flags parseResultCorrupt instead; applyStaged must REFUSE with a
    // typed (parseable) code BEFORE dereferencing parseResult.show.
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ parseResultCorrupt: true })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({
      outcome: "parse_result_corrupt",
      code: STAGED_PARSE_RESULT_CORRUPT,
    });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.insertSyncAudit).not.toHaveBeenCalled();
  });

  test("staged_id CAS mismatch returns STAGED_PARSE_SUPERSEDED without mutating", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps();

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-from-stale-tab",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "superseded", code: STAGED_PARSE_SUPERSEDED });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
  });

  test("base watermark CAS mismatch deletes stale live row and returns STAGED_PARSE_SUPERSEDED", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        diagrams: null,
      })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "superseded", code: STAGED_PARSE_SUPERSEDED });
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("existing-show Drive gone restores prior status and does not create pending_ingestions", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const goneDeps = deps({
      fetchDriveFileMetadata: vi.fn(async () => driveMeta({ trashed: true })),
      liveDriveReverify: { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE },
    });

    const gone = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      goneDeps,
    );

    expect(gone).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(goneDeps.restoreShowStatus).toHaveBeenCalledWith(tx, "drive-file-1", "ok", null);
    expect(goneDeps.upsertLivePendingIngestion).not.toHaveBeenCalled();
    expect(goneDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test("transient Drive metadata failures return SYNC_INFRA_ERROR without consuming the staged row", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const transient = Object.assign(new Error("drive unavailable"), { status: 503 });
    const syncDeps = deps({
      fetchDriveFileMetadata: vi.fn(async () => {
        throw transient;
      }),
      liveDriveReverify: undefined,
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "infra_error", code: "SYNC_INFRA_ERROR" });
    expect(syncDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(syncDeps.upsertLivePendingIngestion).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("first-seen Drive gone and out-of-scope failures route live recovery to pending_ingestions only", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const firstSeen = {
      showId: null,
      lastSeenModifiedTime: null,
      diagrams: null,
    };
    const goneDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ baseModifiedTime: null })),
      readShowForApply: vi.fn(async () => firstSeen),
      fetchDriveFileMetadata: vi.fn(async () => driveMeta({ trashed: true })),
      liveDriveReverify: { outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE },
    });

    const gone = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      goneDeps,
    );

    expect(gone).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(goneDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(goneDeps.upsertLivePendingIngestion).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "drive-file-1",
        lastErrorCode: STAGED_PARSE_SOURCE_GONE,
      }),
    );

    const movedDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ baseModifiedTime: null })),
      readShowForApply: vi.fn(async () => firstSeen),
      fetchDriveFileMetadata: vi.fn(async () => driveMeta({ parents: ["other-folder"] })),
      liveDriveReverify: {
        outcome: "source_out_of_scope",
        code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
      },
    });
    const moved = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      movedDeps,
    );

    expect(moved).toEqual({
      outcome: "source_out_of_scope",
      code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
    });
    expect(movedDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(movedDeps.upsertLivePendingIngestion).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ lastErrorCode: STAGED_PARSE_SOURCE_OUT_OF_SCOPE }),
    );
  });

  test("newer Drive modifiedTime restores prior status, deletes live row, and returns STAGED_PARSE_OUTDATED", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      fetchDriveFileMetadata: vi.fn(async () =>
        driveMeta({ modifiedTime: "2026-05-08T13:00:00.000Z" }),
      ),
      liveDriveReverify: { outcome: "outdated", code: STAGED_PARSE_OUTDATED },
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "outdated", code: STAGED_PARSE_OUTDATED });
    expect(syncDeps.restoreShowStatus).toHaveBeenCalledWith(tx, "drive-file-1", "ok", null);
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test("first-seen outdated Drive modifiedTime routes recovery back to pending_ingestions", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ baseModifiedTime: null })),
      readShowForApply: vi.fn(async () => ({
        showId: null,
        lastSeenModifiedTime: null,
        diagrams: null,
      })),
      fetchDriveFileMetadata: vi.fn(async () =>
        driveMeta({ modifiedTime: "2026-05-08T13:00:00.000Z" }),
      ),
      liveDriveReverify: { outcome: "outdated", code: STAGED_PARSE_OUTDATED },
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "outdated", code: STAGED_PARSE_OUTDATED });
    expect(syncDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(syncDeps.upsertLivePendingIngestion).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "drive-file-1",
        lastErrorCode: STAGED_PARSE_OUTDATED,
      }),
    );
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test("unparseable Drive modifiedTime returns SYNC_INFRA_ERROR without consuming the staged row", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      fetchDriveFileMetadata: vi.fn(async () => driveMeta({ modifiedTime: "not-a-date" })),
      liveDriveReverify: undefined,
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "infra_error", code: "SYNC_INFRA_ERROR" });
    expect(syncDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("missing reviewer choice returns MISSING_REVIEWER_CHOICE", async () => {
    const assetItem: TriggeredReviewItem = {
      id: "asset-1",
      invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
      drift_count: 1,
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [assetItem] }),
      ),
    });

    const missing = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );
    expect(missing).toEqual({ outcome: "invalid_request", code: MISSING_REVIEWER_CHOICE });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("extra reviewer choice returns EXTRA_REVIEWER_CHOICE", async () => {
    const assetItem: TriggeredReviewItem = {
      id: "asset-1",
      invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
      drift_count: 1,
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [assetItem] }),
      ),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [
          { item_id: "asset-1", action: "apply" },
          { item_id: "stale-item", action: "apply" },
        ],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "invalid_request", code: EXTRA_REVIEWER_CHOICE });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("duplicate reviewer choice returns DUPLICATE_REVIEWER_CHOICE", async () => {
    const assetItem: TriggeredReviewItem = {
      id: "asset-1",
      invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
      drift_count: 1,
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [assetItem] }),
      ),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [
          { item_id: "asset-1", action: "apply" },
          { item_id: "asset-1", action: "apply" },
        ],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "invalid_request", code: DUPLICATE_REVIEWER_CHOICE });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("invalid reviewer action returns INVALID_REVIEWER_ACTION", async () => {
    const assetItem: TriggeredReviewItem = {
      id: "asset-1",
      invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
      drift_count: 1,
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [assetItem] }),
      ),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "asset-1", action: "rename", rename_value: "Nope" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "invalid_request", code: INVALID_REVIEWER_ACTION });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("auth-sensitive review choices derive revoked-below-version floor bumps", async () => {
    // P2-F7: a LIVE staged row carrying an MI-11 item now FAILS CLOSED (it must be re-synced to be
    // gated), so MI-11 can no longer be applied via this legacy path. The rename/removal floor-bump
    // derivation (MI-12/13/14) is unaffected and still exercised here.
    const items: TriggeredReviewItem[] = [
      {
        id: "mi12",
        invariant: "MI-12",
        removed_name: "Bob",
        added_name: "Robert",
        email: "bob@test.test",
      },
      { id: "mi13", invariant: "MI-13-orphan-remove", removed_name: "Charlie" },
      { id: "mi14", invariant: "MI-14", removed_name: "Dana", added_name: "Dane" },
    ];
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: items })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [
          { item_id: "mi12", action: "rename", rename_value: "Robert" },
          { item_id: "mi13", action: "apply" },
          { item_id: "mi14", action: "rename", rename_value: "Dane" },
        ],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({
      outcome: "applied",
      derivedSideEffects: {
        revokeFloorForNames: ["Bob", "Charlie", "Dana", "Dane", "Robert"],
      },
    });
    expect(syncDeps.bumpReviewerAuthFloors).toHaveBeenCalledWith(tx, "show-1", [
      "Bob",
      "Charlie",
      "Dana",
      "Dane",
      "Robert",
    ]);
  });

  test("rename reviewer choices must match the staged added_name exactly", async () => {
    const item: TriggeredReviewItem = {
      id: "mi12",
      invariant: "MI-12",
      removed_name: "Bob",
      added_name: "Robert",
      email: "bob@test.test",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "mi12", action: "rename", rename_value: "Bobby" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "invalid_request", code: INVALID_REVIEWER_ACTION });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("non-rename reviewer choices reject stray rename_value payloads", async () => {
    const item: TriggeredReviewItem = {
      id: "mi13",
      invariant: "MI-13",
      removed_name: "Old Person",
      added_name: "New Person",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "mi13", action: "independent", rename_value: "Ignored" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "invalid_request", code: INVALID_REVIEWER_ACTION });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("reject reviewer choice routes through discard semantics before Phase 2", async () => {
    const item: TriggeredReviewItem = {
      id: "mi12",
      invariant: "MI-12",
      removed_name: "Bob",
      added_name: "Robert",
      email: "bob@test.test",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "mi12", action: "reject" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "discarded", variant: "try_again" });
    expect(syncDeps.restoreShowStatus).toHaveBeenCalledWith(tx, "drive-file-1", "ok", null);
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.insertSyncAudit).not.toHaveBeenCalled();
  });

  test("reject reviewer choice is invalid for first-seen rows with no show to restore", async () => {
    const item: TriggeredReviewItem = {
      id: "mi12",
      invariant: "MI-12",
      removed_name: "Bob",
      added_name: "Robert",
      email: "bob@test.test",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ baseModifiedTime: null, triggeredReviewItems: [item] }),
      ),
      readShowForApply: vi.fn(async () => ({
        showId: null,
        lastSeenModifiedTime: null,
        diagrams: null,
      })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "mi12", action: "reject" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "invalid_request", code: INVALID_REVIEWER_ACTION });
    expect(syncDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("MI-13 independent choice bumps the removed identity only", async () => {
    const item: TriggeredReviewItem = {
      id: "mi13",
      invariant: "MI-13",
      removed_name: "Old Person",
      added_name: "New Person",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "mi13", action: "independent" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({
      outcome: "applied",
      derivedSideEffects: { revokeFloorForNames: ["Old Person"] },
    });
    expect(syncDeps.bumpReviewerAuthFloors).toHaveBeenCalledWith(tx, "show-1", ["Old Person"]);
  });

  test("DIAGRAMS_EMBEDDED_NONE_FOUND mints an intentionally empty diagram snapshot", async () => {
    const item: TriggeredReviewItem = {
      id: "empty-diagrams",
      invariant: "DIAGRAMS_EMBEDDED_NONE_FOUND",
      spreadsheet_id: "sheet-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
      runPhase2,
      liveAssetReviewEffects: {
        parseResult: {
          ...parseResult(),
          diagrams: {
            linkedFolder: null,
            embeddedImages: [],
            linkedFolderItems: [],
            snapshot_revision_id: "snapshot-test-rev",
            snapshot_status: "complete",
          } as unknown as ParseResult["diagrams"],
        },
        adminAlertCode: null,
        skipDiagramsWrite: false,
      },
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "empty-diagrams", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    const phase2Args = runPhase2.mock.calls[0]?.[1];
    expect(phase2Args?.parseResult.diagrams).toMatchObject({
      linkedFolder: null,
      embeddedImages: [],
      linkedFolderItems: [],
      snapshot_status: "complete",
    });
    expect(
      typeof (phase2Args?.parseResult.diagrams as { snapshot_revision_id?: unknown })
        .snapshot_revision_id,
    ).toBe("string");
  });

  test("DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE retries before preserving prior diagrams", async () => {
    const item: TriggeredReviewItem = {
      id: "no-revision",
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: "sheet-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const retryEmbeddedRevisionAvailability = vi.fn(async () => false);
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));
    const priorDiagrams = {
      snapshot_revision_id: "prior-rev",
      snapshot_status: "complete",
    } as unknown as ParseResult["diagrams"];
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
        diagrams: priorDiagrams,
      })),
      retryEmbeddedRevisionAvailability,
      runPhase2,
      liveAssetReviewEffects: {
        parseResult: {
          ...parseResult(),
          diagrams: priorDiagrams,
          warnings: [
            {
              severity: "warn",
              code: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
              message: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
            },
          ],
        },
        adminAlertCode: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
        skipDiagramsWrite: true,
      },
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "no-revision", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(retryEmbeddedRevisionAvailability).not.toHaveBeenCalled();
    expect(runPhase2.mock.calls[0]?.[1]?.parseResult.diagrams).toBe(priorDiagrams);
    expect(runPhase2.mock.calls[0]?.[1]?.skipDiagramsWrite).toBe(true);
    expect(result).toMatchObject({
      outcome: "applied",
      adminAlertCode: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
    });
    expect(syncDeps.upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("embedded revision retry infra failures do not write alerts or consume the staged row", async () => {
    const item: TriggeredReviewItem = {
      id: "no-revision",
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: "sheet-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
      retryEmbeddedRevisionAvailability: vi.fn(async () => {
        throw Object.assign(new Error("drive unavailable"), { status: 503 });
      }),
      liveAssetReviewEffects: undefined,
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "no-revision", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "infra_error", code: "SYNC_INFRA_ERROR" });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.upsertAdminAlert).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
  });

  test("first-seen embedded revision unavailability returns SYNC_INFRA_ERROR instead of blaming reviewer input", async () => {
    const item: TriggeredReviewItem = {
      id: "no-revision",
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: "sheet-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ baseModifiedTime: null, triggeredReviewItems: [item] }),
      ),
      readShowForApply: vi.fn(async () => ({
        showId: null,
        lastSeenModifiedTime: null,
        diagrams: null,
      })),
      retryEmbeddedRevisionAvailability: vi.fn(async () => false),
      liveAssetReviewEffects: undefined,
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "no-revision", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "infra_error", code: "SYNC_INFRA_ERROR" });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
  });

  test("embedded revision retry success still requires re-stage instead of applying incomplete pins", async () => {
    const item: TriggeredReviewItem = {
      id: "no-revision",
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: "sheet-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const priorDiagrams = {
      snapshot_revision_id: "prior-rev",
      snapshot_status: "complete",
    } as unknown as ParseResult["diagrams"];
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: [item] })),
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
        diagrams: priorDiagrams,
      })),
      retryEmbeddedRevisionAvailability: vi.fn(async () => true),
      runPhase2,
      liveAssetReviewEffects: {
        parseResult: {
          ...parseResult(),
          diagrams: priorDiagrams,
          warnings: [
            {
              severity: "warn",
              code: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
              message: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
            },
          ],
        },
        adminAlertCode: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
        skipDiagramsWrite: true,
      },
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "no-revision", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(runPhase2.mock.calls[0]?.[1]?.parseResult.diagrams).toBe(priorDiagrams);
    expect(runPhase2.mock.calls[0]?.[1]?.skipDiagramsWrite).toBe(true);
    expect(syncDeps.upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("embedded revision recovery composes with reel drift side effects", async () => {
    const unavailable: TriggeredReviewItem = {
      id: "no-revision",
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: "sheet-1",
    };
    const reelDrift: TriggeredReviewItem = {
      id: "reel-drift",
      invariant: "REEL_DRIFT_PENDING",
      reel_drive_file_id: "reel-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));
    const priorDiagrams = {
      snapshot_revision_id: "prior-rev",
      snapshot_status: "complete",
    } as unknown as ParseResult["diagrams"];
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({
          triggeredReviewItems: [unavailable, reelDrift],
          parseResult: {
            ...parseResult(),
            openingReel: {
              driveFileId: "reel-1",
              drive_modified_time: "2026-05-08T10:00:00.000Z",
              headRevisionId: "reel-head-1",
              mimeType: "video/mp4",
            },
          },
        }),
      ),
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
        diagrams: priorDiagrams,
      })),
      retryEmbeddedRevisionAvailability: vi.fn(async () => false),
      runPhase2,
      liveAssetReviewEffects: {
        parseResult: {
          ...parseResult(),
          openingReel: null,
          diagrams: priorDiagrams,
          warnings: [
            { severity: "warn", code: "REEL_DRIFTED", message: "REEL_DRIFTED" },
            {
              severity: "warn",
              code: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
              message: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
            },
          ],
        },
        adminAlertCode: EMBEDDED_RECOVERY_REQUIRES_RESTAGE,
        skipDiagramsWrite: true,
      },
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [
          { item_id: "no-revision", action: "apply" },
          { item_id: "reel-drift", action: "apply" },
        ],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    const phase2Args = runPhase2.mock.calls[0]?.[1];
    expect(phase2Args?.parseResult.diagrams).toBe(priorDiagrams);
    expect(phase2Args?.parseResult.openingReel).toBeNull();
    expect(phase2Args?.parseResult.warnings).toContainEqual(
      expect.objectContaining({ code: "REEL_DRIFTED" }),
    );
    expect(phase2Args?.parseResult.warnings).toContainEqual(
      expect.objectContaining({ code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE" }),
    );
  });

  test("REEL_DRIFT_PENDING clears the stale opening reel and persists a warning without diagram mutation", async () => {
    const item: TriggeredReviewItem = {
      id: "reel-drift",
      invariant: "REEL_DRIFT_PENDING",
      reel_drive_file_id: "reel-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({
          triggeredReviewItems: [item],
          parseResult: {
            ...parseResult(),
            openingReel: {
              driveFileId: "reel-1",
              drive_modified_time: "2026-05-08T10:00:00.000Z",
              headRevisionId: "reel-head-1",
              mimeType: "video/mp4",
            },
          },
        }),
      ),
      runPhase2,
      liveAssetReviewEffects: {
        parseResult: {
          ...parseResult(),
          openingReel: null,
          warnings: [{ severity: "warn", code: "REEL_DRIFTED", message: "REEL_DRIFTED" }],
        },
        adminAlertCode: null,
        skipDiagramsWrite: false,
      },
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "reel-drift", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    const phase2Args = runPhase2.mock.calls[0]?.[1];
    expect(phase2Args?.parseResult.openingReel).toBeNull();
    expect(phase2Args?.parseResult.warnings).toContainEqual(
      expect.objectContaining({ code: "REEL_DRIFTED" }),
    );
    expect(phase2Args?.parseResult.diagrams).toEqual(parseResult().diagrams);
  });

  test("Phase 2 stale result restores prior status, deletes pending row, and skips side effects", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      runPhase2: vi.fn(async () => ({
        outcome: "stale" as const,
        code: "STALE_MANUAL_REPLAY_ABORTED" as const,
      })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "superseded", code: STAGED_PARSE_SUPERSEDED });
    expect(syncDeps.restoreShowStatus).toHaveBeenCalledWith(tx, "drive-file-1", "ok", null);
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
    expect(syncDeps.insertSyncAudit).not.toHaveBeenCalled();
    expect(syncDeps.bumpReviewerAuthFloors).not.toHaveBeenCalled();
    expect(syncDeps.upsertAdminAlert).not.toHaveBeenCalled();
  });

  test("first-seen Phase 2 stale routes recovery back to pending_ingestions", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ baseModifiedTime: null })),
      readShowForApply: vi.fn(async () => ({
        showId: null,
        lastSeenModifiedTime: null,
        diagrams: null,
      })),
      runPhase2: vi.fn(async () => ({
        outcome: "stale" as const,
        code: "STALE_MANUAL_REPLAY_ABORTED" as const,
      })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "superseded", code: STAGED_PARSE_SUPERSEDED });
    expect(syncDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(syncDeps.upsertLivePendingIngestion).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "drive-file-1",
        lastErrorCode: STAGED_PARSE_SUPERSEDED,
      }),
    );
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test("unlocked entrypoint rejects a forced cast when the show advisory lock is not held", async () => {
    const tx = fakeTx(false) as unknown as LockedShowTx<FakeTx>;

    await expect(
      applyStaged_unlocked(
        tx,
        {
          driveFileId: "drive-file-1",
          sourceScope: "live",
          stagedId: "staged-live",
          reviewerChoices: [],
          appliedByEmail: "doug@fxav.test",
        },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "LOCK_OWNERSHIP_ASSERTION_FAILED" });
  });

  test("outer wrapper uses admin blocking lock mode", () => {
    const source = readFileSync(join(process.cwd(), "lib/sync/applyStaged.ts"), "utf8");

    expect(source).toContain("?? withPostgresSyncPipelineLock");
    expect(source).toContain("{ tryOnly: false }");
  });

  test("wizard-scope Apply approves the staged row and manifest without Phase 2", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const readWizardPendingSyncForApply = vi.fn(async () =>
      pending({
        stagedId: "staged-wizard",
        sourceKind: "onboarding_scan",
        wizardSessionId: W1,
      }),
    );
    const approveWizardPendingSync = vi.fn(async () => true);
    const markWizardManifestApplied = vi.fn(async () => true);
    const syncDeps = {
      ...deps(),
      readWizardPendingSyncForApply,
      readActiveWizardSession: vi.fn(async () => W1),
      approveWizardPendingSync,
      markWizardManifestApplied,
    } as ApplyStagedDeps;

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "wizard",
        wizardSessionId: W1,
        stagedId: "staged-wizard",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({
      outcome: "wizard_applied",
      wizardSessionId: W1,
      stagedId: "staged-wizard",
    });
    expect(syncDeps.readLivePendingSyncForApply).not.toHaveBeenCalled();
    expect(readWizardPendingSyncForApply).toHaveBeenCalledWith(tx, "drive-file-1", W1);
    expect(approveWizardPendingSync).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "drive-file-1",
        wizardSessionId: W1,
        stagedId: "staged-wizard",
        appliedByEmail: "doug@fxav.test",
        reviewerChoices: [],
      }),
    );
    expect(markWizardManifestApplied).toHaveBeenCalledWith(tx, "drive-file-1", W1);
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.insertSyncAudit).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
  });

  test("wizard-scope Apply rejects stale wizard sessions without mutating", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = {
      ...deps(),
      readWizardPendingSyncForApply: vi.fn(async () =>
        pending({ stagedId: "staged-wizard", sourceKind: "onboarding_scan", wizardSessionId: W1 }),
      ),
      readActiveWizardSession: vi.fn(async () => W2),
      approveWizardPendingSync: vi.fn(async () => true),
      markWizardManifestApplied: vi.fn(async () => true),
    } as ApplyStagedDeps;

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "wizard",
        wizardSessionId: W1,
        stagedId: "staged-wizard",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED });
    expect(syncDeps.approveWizardPendingSync).not.toHaveBeenCalled();
    expect(syncDeps.markWizardManifestApplied).not.toHaveBeenCalled();
  });

  test("wizard-scope Apply treats zero-row approval CAS as superseded without touching manifest", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = {
      ...deps(),
      readWizardPendingSyncForApply: vi.fn(async () =>
        pending({ stagedId: "staged-wizard", sourceKind: "onboarding_scan", wizardSessionId: W1 }),
      ),
      readActiveWizardSession: vi.fn(async () => W1),
      approveWizardPendingSync: vi.fn(async () => false),
      markWizardManifestApplied: vi.fn(async () => true),
    } as ApplyStagedDeps;

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "wizard",
        wizardSessionId: W1,
        stagedId: "staged-wizard",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "wizard_superseded", code: WIZARD_SESSION_SUPERSEDED });
    expect(syncDeps.approveWizardPendingSync).toHaveBeenCalled();
    expect(syncDeps.markWizardManifestApplied).not.toHaveBeenCalled();
  });
});
