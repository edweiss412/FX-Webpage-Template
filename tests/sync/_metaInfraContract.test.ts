/**
 * Sync infra-failure contract registry.
 *
 * M6 sync helpers that touch Supabase must not collapse infrastructure
 * failures into benign "skip" / "not found" outcomes. Each helper gets a row
 * here as it ships.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DriveListedFile } from "@/lib/drive/list";
import type { Phase1Tx } from "@/lib/sync/phase1";
import type { Phase2Tx } from "@/lib/sync/phase2";

const infraRegistry = [
  {
    helper: "perFileProcessor",
    path: "lib/sync/perFileProcessor.ts",
    contract: "Supabase returned/thrown errors become SyncInfraError",
  },
  {
    helper: "readDriveFileIdForSlug",
    path: "app/api/admin/sync/[slug]/route.ts",
    contract: "Supabase returned/thrown slug lookup errors become SYNC_INFRA_ERROR",
  },
  {
    helper: "readAdminEmail",
    path: "app/api/admin/staged/[fileId]/apply/route.ts",
    contract: "Supabase returned/thrown admin-email lookup errors become SYNC_INFRA_ERROR",
  },
  {
    helper: "readAdminEmail",
    path: "app/api/admin/staged/[fileId]/discard/route.ts",
    contract: "Supabase returned/thrown admin-email lookup errors become SYNC_INFRA_ERROR",
  },
  {
    helper: "runOnboardingScan",
    path: "lib/sync/runOnboardingScan.ts",
    contract: "transaction-port faults become OnboardingScanInfraError",
  },
  {
    helper: "subscribeToWatchedFolder",
    path: "lib/drive/watch.ts",
    contract: "watch transaction-port faults become DriveWatchInfraError",
  },
  {
    helper: "refreshWatchSubscriptions",
    path: "lib/drive/watch.ts",
    contract: "watch renewal transaction-port faults become DriveWatchInfraError",
  },
  {
    helper: "gcWatchChannels",
    path: "lib/drive/watch.ts",
    contract: "watch GC transaction-port faults become DriveWatchInfraError",
  },
  {
    helper: "runPushSyncForShow",
    path: "lib/sync/runPushSyncForShow.ts",
    contract: "shared processOneFile infra faults propagate",
  },
  {
    helper: "readShowArchivedForPush",
    path: "lib/sync/runPushSyncForShow.ts",
    contract:
      "push DEF-4 archived preflight: returned AND thrown Supabase faults (construction/from) become SyncInfraError, never a per-file failure",
  },
  {
    helper: "handleDriveWebhook",
    path: "app/api/drive/webhook/route.ts",
    contract: "webhook transaction-port faults become DriveWebhookInfraError",
  },
  {
    helper: "discardStaged",
    path: "lib/sync/discardStaged.ts",
    contract:
      "discard transaction-port faults propagate instead of becoming benign discard outcomes",
  },
  {
    helper: "writeSyncLog",
    path: "lib/sync/syncLog.ts",
    contract: "sync_log sink thrown SQL faults propagate to the route/orchestrator caller",
  },
  {
    helper: "getAutoPublishCleanFirstSeen",
    path: "lib/appSettings/getAutoPublishCleanFirstSeen.ts",
    contract:
      "auto-publish toggle read: returned error AND thrown construction/query faults → { kind:'infra_error' } (never throws to callers; R8 — both the sync pipeline AND the settings page depend on the typed degraded result)",
  },
  {
    helper: "getActiveWatchedFolderId",
    path: "lib/appSettings/getWatchedFolderId.ts",
    contract: "app_settings watched-folder lookup faults become typed infra_error results",
  },
  {
    helper: "writeSyncCronHeartbeat",
    path: "lib/appSettings/writeSyncCronHeartbeat.ts",
    contract:
      "sync cron heartbeat writer destructures {data,error}, selects id, and maps returned/thrown/zero-row faults to typed infra_error",
  },
  {
    helper: "snapshotAssets",
    path: "lib/sync/snapshotAssets.ts",
    contract:
      "asset snapshotting uses explicit tx/storage/drive ports; Supabase boundary faults surface at the caller-owned port layer",
  },
  {
    helper: "promoteSnapshotUpload",
    path: "lib/sync/promoteSnapshot.ts",
    contract:
      "snapshot promotion uses explicit storage and Postgres boundaries; returned storage errors throw instead of silently continuing",
  },
  {
    helper: "assetRecovery",
    path: "lib/sync/assetRecovery.ts",
    contract:
      "asset recovery uses explicit tx/storage/drive ports; Supabase boundary faults surface at the caller-owned port layer",
  },
  {
    helper: "runAssetRecoveryCron",
    path: "app/api/cron/asset-recovery/route.ts",
    contract: "cron route delegates to the registered asset-recovery scheduler surface",
  },
  {
    helper: "DIAGRAM_BUCKET",
    path: "app/api/asset/diagram/[show]/[rev]/[key]/route.ts",
    contract:
      "diagram asset route destructures Supabase row and Storage download results; missing bytes map to 410",
  },
  {
    helper: "STUCK_AFTER_MS",
    path: "app/api/admin/show/[slug]/apply/[applyId]/status/route.ts",
    contract:
      "apply-promotion status route destructures Supabase show and ledger reads; faults become 404/500 discriminated responses",
  },
  {
    helper: "repairSnapshotRollback",
    path: "app/api/admin/snapshot-rollback/[id]/repair/route.ts",
    contract:
      "snapshot rollback repair route destructures Supabase ledger reads; faults become 404/500 discriminated responses before delegated repair",
  },
  {
    helper: "CACHE_CONTROL",
    path: "app/api/asset/reel/[show]/route.ts",
    contract:
      "reel asset route destructures Supabase show reads and Drive metadata/media reads; unavailable or drifted reels map to 410",
  },
  {
    helper: "PDF_MIME",
    path: "app/api/asset/agenda/[show]/[id]/route.ts",
    contract:
      "agenda asset route destructures Supabase show reads and Drive metadata/media reads; non-PDF or drifted files map to 410; infra faults surface as 500 with AGENDA_ASSET_LOOKUP_FAILED",
  },
  {
    helper: "verifyReelOnApply",
    path: "lib/sync/verifyReelOnApply.ts",
    contract:
      "apply-time reel re-verification uses an explicit Drive port; Drive permission and drift faults become warning-coded results",
  },
  {
    helper: "runDiagramGc",
    path: "lib/sync/diagramGc.ts",
    contract:
      "diagram GC uses explicit tx/storage ports; Supabase/storage boundary faults surface at the caller-owned port layer",
  },
  {
    helper: "runDiagramGc",
    path: "app/api/cron/diagram-gc/route.ts",
    contract: "diagram GC cron route delegates to the registered backend scheduler surface",
  },
  {
    helper: "unpublishShow",
    path: "lib/sync/unpublishShow.ts",
    contract:
      "unpublish route uses explicit Postgres transaction boundary; helper faults propagate to route caller",
  },
  {
    helper: "unpublishShowViaEmailedLink",
    path: "lib/sync/unpublishShow.ts",
    contract:
      "emailed-link wrapper re-validates the recipient binding FOR SHARE inside the locked transaction before any token-state branch; Postgres faults propagate to the route caller",
  },
  {
    helper: "POST",
    path: "app/api/show/[slug]/unpublish/route.ts",
    contract:
      "unpublish route delegates to registered locked backend helper and returns catalog codes only for token state",
  },
  {
    helper: "purgeAndRotateOnboardingSession",
    path: "lib/onboarding/sessionLifecycle.ts",
    contract:
      "onboarding session rotation runs in one transaction; transaction faults throw OnboardingSessionInfraError",
  },
  {
    helper: "purgeAndRotateIfStale",
    path: "lib/onboarding/sessionLifecycle.ts",
    contract:
      "stale onboarding rotation uses a SQL-clock transaction gate; transaction faults throw OnboardingSessionInfraError",
  },
  {
    helper: "cleanupAbandonedFinalize",
    path: "lib/onboarding/sessionLifecycle.ts",
    contract:
      "abandoned finalize cleanup uses admin auth and transaction guards; infra faults do not become cleaned results",
  },
  {
    helper: "startOverServerAction",
    path: "lib/onboarding/serverActions.ts",
    contract:
      "server action gates admin before delegating to the registered lifecycle helper and redirecting post-commit",
  },
  {
    helper: "rerunSetupServerAction",
    path: "lib/onboarding/serverActions.ts",
    contract:
      "server action gates admin before delegated rotation; finalize suppression redirects without purging",
  },
  {
    helper: "handleOnboardingScan",
    path: "app/api/admin/onboarding/scan/route.ts",
    contract:
      "scan route gates admin, validates Drive folder, reserves wizard session transactionally, and passes through OnboardingScanResult",
  },
  {
    helper: "handleOnboardingFinalize",
    path: "app/api/admin/onboarding/finalize/route.ts",
    contract:
      "finalize route gates admin, owns finalize checkpoint transactions, and demotes per-row races as catalog codes",
  },
  {
    helper: "handleOnboardingFinalizeCas",
    path: "app/api/admin/onboarding/finalize-cas/route.ts",
    contract:
      "finalize CAS route gates admin, checks checkpoint preconditions, promotes settings transactionally, and subscribes after commit",
  },
  {
    helper: "handleCleanupAbandonedFinalize",
    path: "app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts",
    contract:
      "cleanup route gates admin, writes before/after audit records, and delegates stale-session cleanup errors as typed 409 responses",
  },
  {
    helper: "handleWizardStagedApply",
    path: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts",
    contract:
      "wizard staged apply route gates admin and delegates to applyStaged_unlocked under caller-owned show lock",
  },
  {
    helper: "handleWizardStagedDiscard",
    path: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts",
    contract:
      "wizard staged discard route gates admin and delegates to discardStaged_unlocked under caller-owned show lock",
  },
  {
    helper: "retrySingleFile_unlocked",
    path: "lib/sync/retrySingleFile.ts",
    contract:
      "wizard single-file retry asserts caller-held show lock and preserves wizard CAS/provenance failures as typed outcomes",
  },
  {
    helper: "handleWizardPendingIngestionRetry",
    path: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
    contract:
      "wizard pending-ingestion retry gates admin, locks by drive_file_id, and delegates to retrySingleFile_unlocked",
  },
  {
    helper: "handleWizardPendingIngestionDeferUntilModified",
    path: "app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts",
    contract:
      "wizard pending-ingestion defer route gates admin and writes wizard-scoped deferrals under the show lock",
  },
  {
    helper: "handleWizardPendingIngestionPermanentIgnore",
    path: "app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts",
    contract:
      "wizard pending-ingestion permanent-ignore route gates admin and writes wizard-scoped deferrals under the show lock",
  },
  {
    helper: "runManualStageForFirstSeen",
    path: "lib/sync/runManualStageForFirstSeen.ts",
    contract:
      "live first-seen staging helper asserts caller-held show lock and forces Phase 1 review staging",
  },
  {
    helper: "runManualSyncForShow_unlocked",
    path: "lib/sync/runManualSyncForShow.ts",
    contract:
      "live pending-ingestion existing-show retry uses the exported unlocked manual sync helper under the route-owned show lock",
  },
  {
    helper: "handleLivePendingIngestionRetry",
    path: "app/api/admin/pending-ingestions/[id]/retry/route.ts",
    contract:
      "live pending-ingestion retry gates admin, bootstraps the lock key read-only, then re-selects under nonblocking show lock",
  },
  {
    helper: "handleLivePendingIngestionDiscard",
    path: "app/api/admin/pending-ingestions/[id]/discard/route.ts",
    contract:
      "live pending-ingestion discard gates admin, bootstraps the lock key read-only, then writes live deferrals under show lock",
  },
  {
    helper: "handleAdminAlertGlobalResolve",
    path: "app/api/admin/admin-alerts/[id]/resolve/route.ts",
    contract:
      "global alert resolve gates admin and refuses show-scoped alerts with cataloged redirect response",
  },
  {
    helper: "handleAdminAlertShowResolve",
    path: "app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts",
    contract:
      "show-scoped alert resolve gates admin and hides cross-show alert probes as not found",
  },
  {
    helper: "handleLiveStagedApply",
    path: "app/api/admin/show/staged/[stagedId]/apply/route.ts",
    contract:
      "live first-seen staged apply gates admin and delegates to applyStaged with live source scope",
  },
  {
    helper: "handleLiveStagedDiscard",
    path: "app/api/admin/show/staged/[stagedId]/discard/route.ts",
    contract:
      "live first-seen staged discard gates admin and delegates to discardStaged with live source scope",
  },
  {
    helper: "approveMi11Hold",
    path: "lib/sync/holds/mi11GateActions.ts",
    contract:
      "MI-11 approve gate action (P3-F4): a THROWN fault at every Supabase boundary (service-role construction, sync_holds lookup SELECT, authed client construction, supabase.rpc) AND a returned {error} both map to { ok:false, code:'SYNC_INFRA_ERROR' }; never an uncaught throw (invariant 9)",
  },
  {
    helper: "rejectMi11Hold",
    path: "lib/sync/holds/mi11GateActions.ts",
    contract:
      "MI-11 reject gate action (P3-F4): a THROWN authed-client-construction / supabase.rpc fault AND a returned {error} both map to { ok:false, code:'SYNC_INFRA_ERROR' }; never an uncaught throw (invariant 9)",
  },
  {
    helper: "readShowChangeFeed",
    path: "lib/sync/feed/readShowChangeFeed.ts",
    contract:
      "feed data-layer read (P5-F1): a THROWN service-role construction / .from() fault AND a returned {error} at every read (show_change_log / count / sync_holds) map to a typed SyncInfraError (operation + source); never a plain Error / uncaught throw, so the Phase-6 page boundary can catalog-render / degrade (invariant 9). Enforced by tests/sync/feed/readShowChangeFeed.infra.test.ts",
  },
  {
    helper: "undoChange",
    path: "lib/sync/holds/undoChange.ts",
    contract:
      "feed Undo action (WM-F5): a THROWN createSupabaseServerClient / supabase.rpc fault, a returned {error}, AND a null/unexpected RPC shape ALL map to { ok:false, code:'SYNC_INFRA_ERROR' }; a typed data.ok===false code (e.g. UNDO_SUPERSEDED) passes through unclobbered and data.ok===true → { ok:true }; never an uncaught throw / untyped admin 500 (invariant 9). Enforced by tests/sync/holds/undoChange.infra.test.ts",
  },
] as const;

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const infraMock = vi.hoisted(() => ({
  throwOnConstruct: false,
  throwOnFrom: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (infraMock.throwOnConstruct) {
      throw new Error("META: simulated service-role construction fault");
    }
    return {
      from: () => {
        if (infraMock.throwOnFrom) {
          throw new Error("META: simulated from() infrastructure fault");
        }
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    };
  },
}));

function fileMeta(): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
  };
}

async function importProcessor() {
  vi.resetModules();
  return import("@/lib/sync/perFileProcessor");
}

async function importWatchedFolderHelper() {
  vi.resetModules();
  return import("@/lib/appSettings/getWatchedFolderId");
}

async function importHeartbeatWriter() {
  vi.resetModules();
  return import("@/lib/appSettings/writeSyncCronHeartbeat");
}

async function importAutoPublishHelper() {
  vi.resetModules();
  return import("@/lib/appSettings/getAutoPublishCleanFirstSeen");
}

async function importPushSync() {
  vi.resetModules();
  const mod = await import("@/lib/sync/runPushSyncForShow");
  // Same module-registry instance (no reset in between) so the SyncInfraError class identity matches
  // the one runPushSyncForShow throws.
  const { SyncInfraError } = await import("@/lib/sync/perFileProcessor");
  return { runPushSyncForShow: mod.runPushSyncForShow, SyncInfraError };
}

beforeEach(() => {
  infraMock.throwOnConstruct = false;
  infraMock.throwOnFrom = false;
});

describe("sync Supabase infra-failure contract", () => {
  test("every M6 Supabase helper registered here points at a real helper", () => {
    for (const entry of infraRegistry) {
      const source = read(entry.path);
      expect(source, `${entry.helper} registry row points at missing source`).toContain(
        entry.helper,
      );
      expect(entry.contract.length).toBeGreaterThan(0);
    }
  });

  describe("perFileProcessor", () => {
    test("service-role construction throw → SyncInfraError", async () => {
      infraMock.throwOnConstruct = true;
      const { perFileProcessor, SyncInfraError } = await importProcessor();

      await expect(perFileProcessor("file-1", "cron", fileMeta())).rejects.toBeInstanceOf(
        SyncInfraError,
      );
    });

    test("Supabase .from() throw → SyncInfraError", async () => {
      infraMock.throwOnFrom = true;
      const { perFileProcessor, SyncInfraError } = await importProcessor();

      await expect(perFileProcessor("file-1", "cron", fileMeta())).rejects.toBeInstanceOf(
        SyncInfraError,
      );
    });
  });

  describe("readShowArchivedForPush (push DEF-4 archived preflight)", () => {
    // R6 regression: runPushSyncForShow runs the archived preflight BEFORE any Drive fetch; a Supabase
    // outage there must surface as SyncInfraError (→ SYNC_INFRA_ERROR at the webhook), NOT a per-file
    // failure that hides the dependency outage. Pre-fix the helper only mapped the returned {error}.
    test("service-role construction throw → SyncInfraError (not a per-file failure)", async () => {
      infraMock.throwOnConstruct = true;
      const { runPushSyncForShow, SyncInfraError } = await importPushSync();
      await expect(runPushSyncForShow("file-1")).rejects.toBeInstanceOf(SyncInfraError);
    });

    test("Supabase .from() throw → SyncInfraError (not a per-file failure)", async () => {
      infraMock.throwOnFrom = true;
      const { runPushSyncForShow, SyncInfraError } = await importPushSync();
      await expect(runPushSyncForShow("file-1")).rejects.toBeInstanceOf(SyncInfraError);
    });
  });

  describe("getAutoPublishCleanFirstSeen (auto-publish toggle read)", () => {
    // R8: the helper must NEVER throw to its callers — the sync pipeline converts a returned infra_error
    // to Phase1InfraError (retry) and the settings page renders the degraded toggle on infra_error. A
    // thrown construction/query fault used to escape and 500 the settings page.
    test("service-role construction throw → { kind:'infra_error' } (never throws)", async () => {
      infraMock.throwOnConstruct = true;
      const { getAutoPublishCleanFirstSeen } = await importAutoPublishHelper();
      await expect(getAutoPublishCleanFirstSeen()).resolves.toEqual({ kind: "infra_error" });
    });

    test("Supabase .from() throw → { kind:'infra_error' } (never throws)", async () => {
      infraMock.throwOnFrom = true;
      const { getAutoPublishCleanFirstSeen } = await importAutoPublishHelper();
      await expect(getAutoPublishCleanFirstSeen()).resolves.toEqual({ kind: "infra_error" });
    });
  });

  describe("getActiveWatchedFolderId", () => {
    test("service-role construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { getActiveWatchedFolderId } = await importWatchedFolderHelper();

      await expect(getActiveWatchedFolderId()).resolves.toMatchObject({
        kind: "infra_error",
        source: "thrown_error",
        operation: "createSupabaseServiceRoleClient",
      });
    });

    test("Supabase .from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { getActiveWatchedFolderId } = await importWatchedFolderHelper();

      await expect(getActiveWatchedFolderId()).resolves.toMatchObject({
        kind: "infra_error",
        source: "thrown_error",
        operation: "readActiveWatchedFolderId",
      });
    });
  });

  describe("writeSyncCronHeartbeat", () => {
    test("service-role construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { writeSyncCronHeartbeat } = await importHeartbeatWriter();

      await expect(writeSyncCronHeartbeat()).resolves.toEqual({ kind: "infra_error" });
    });

    test("Supabase .from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { writeSyncCronHeartbeat } = await importHeartbeatWriter();

      await expect(writeSyncCronHeartbeat()).resolves.toEqual({ kind: "infra_error" });
    });
  });

  describe("runPhase1", () => {
    test("transaction-port throw → Phase1InfraError", async () => {
      const { runPhase1, Phase1InfraError } = await import("@/lib/sync/phase1");
      const tx = {
        readShowForPhase1: async () => {
          throw new Error("META: simulated tx infrastructure fault");
        },
      } as unknown as Phase1Tx;

      await expect(
        runPhase1(tx, {
          driveFileId: "file-1",
          mode: "cron",
          fileMeta: fileMeta(),
          binding: { bindingToken: "token-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
          parseResult: {
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
            crewMembers: [
              {
                name: "Alice",
                email: "alice@example.com",
                phone: null,
                role: "A1",
                role_flags: ["A1"],
                date_restriction: { kind: "none" },
                stage_restriction: { kind: "none" },
                flight_info: null,
              },
            ],
            hotelReservations: [],
            rooms: [
              {
                kind: "gs",
                name: "General Session",
                dimensions: null,
                floor: null,
                setup: null,
                set_time: null,
                show_time: null,
                strike_time: null,
                audio: null,
                video: null,
                lighting: null,
                scenic: null,
                power: null,
                digital_signage: null,
                other: null,
                notes: null,
              },
            ],
            transportation: null,
            contacts: [],
            pullSheet: null,
            diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
            openingReel: null,
            raw_unrecognized: [],
            warnings: [],
            hardErrors: [],
          },
        }),
      ).rejects.toBeInstanceOf(Phase1InfraError);
    });
  });

  describe("runPhase2", () => {
    test("transaction-port throw → Phase2InfraError", async () => {
      const { runPhase2, Phase2InfraError } = await import("@/lib/sync/phase2");
      const tx = {
        applyShowSnapshot: async () => {
          throw new Error("META: simulated tx infrastructure fault");
        },
      } as unknown as Phase2Tx;

      await expect(
        runPhase2(tx, {
          driveFileId: "file-1",
          mode: "cron",
          fileMeta: fileMeta(),
          binding: { bindingToken: "token-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
          parseResult: {
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
            crewMembers: [
              {
                name: "Alice",
                email: "alice@example.com",
                phone: null,
                role: "A1",
                role_flags: ["A1"],
                date_restriction: { kind: "none" },
                stage_restriction: { kind: "none" },
                flight_info: null,
              },
            ],
            hotelReservations: [],
            rooms: [
              {
                kind: "gs",
                name: "General Session",
                dimensions: null,
                floor: null,
                setup: null,
                set_time: null,
                show_time: null,
                strike_time: null,
                audio: null,
                video: null,
                lighting: null,
                scenic: null,
                power: null,
                digital_signage: null,
                other: null,
                notes: null,
              },
            ],
            transportation: null,
            contacts: [],
            pullSheet: null,
            diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
            openingReel: null,
            raw_unrecognized: [],
            warnings: [],
            hardErrors: [],
          },
        }),
      ).rejects.toBeInstanceOf(Phase2InfraError);
    });
  });

  describe("runOnboardingScan", () => {
    test("transaction-port throw → OnboardingScanInfraError", async () => {
      const { runOnboardingScan, OnboardingScanInfraError } =
        await import("@/lib/sync/runOnboardingScan");

      await expect(
        runOnboardingScan("folder-1", "11111111-1111-4111-8111-111111111111", {
          tx: {
            ensureWizardIsolationIndexes: async () => {
              throw new Error("META: simulated onboarding transaction fault");
            },
          } as never,
        }),
      ).rejects.toBeInstanceOf(OnboardingScanInfraError);
    });
  });

  describe("Drive watch lifecycle", () => {
    test("subscribeToWatchedFolder DB-port throw → DriveWatchInfraError", async () => {
      const { subscribeToWatchedFolder, DriveWatchInfraError } = await import("@/lib/drive/watch");

      await expect(
        subscribeToWatchedFolder("folder-1", {
          tx: {
            insertPending: async () => {
              throw new Error("META: simulated watch insert fault");
            },
          } as never,
          uuid: () => "channel-1",
          webhookSecret: () => "secret-1",
          watchFolder: async () => ({
            id: "channel-1",
            resourceId: "resource-1",
            expiration: "2026-05-10T12:00:00.000Z",
          }),
        }),
      ).rejects.toBeInstanceOf(DriveWatchInfraError);
    });

    test("refreshWatchSubscriptions DB-port throw → DriveWatchInfraError", async () => {
      const { refreshWatchSubscriptions, DriveWatchInfraError } = await import("@/lib/drive/watch");

      await expect(
        refreshWatchSubscriptions({
          tx: {
            listExpiringActive: async () => {
              throw new Error("META: simulated watch renewal fault");
            },
          } as never,
        }),
      ).rejects.toBeInstanceOf(DriveWatchInfraError);
    });

    test("gcWatchChannels DB-port throw → DriveWatchInfraError", async () => {
      const { gcWatchChannels, DriveWatchInfraError } = await import("@/lib/drive/watch");

      await expect(
        gcWatchChannels({
          tx: {
            listGcCandidates: async () => {
              throw new Error("META: simulated watch GC fault");
            },
          } as never,
        }),
      ).rejects.toBeInstanceOf(DriveWatchInfraError);
    });
  });

  describe("Drive push webhook", () => {
    test("runPushSyncForShow propagates shared pipeline infra faults", async () => {
      const { runPushSyncForShow } = await import("@/lib/sync/runPushSyncForShow");
      const { SyncInfraError } = await import("@/lib/sync/perFileProcessor");
      const infraError = new SyncInfraError(
        "META processOneFile",
        "thrown_error",
        new Error("META: simulated push pipeline fault"),
      );

      await expect(
        runPushSyncForShow("file-1", {
          fileMeta: fileMeta(),
          processOneFile: async () => {
            throw infraError;
          },
        }),
      ).rejects.toBe(infraError);
    });

    test("handleDriveWebhook DB-port throw → DriveWebhookInfraError", async () => {
      const { handleDriveWebhook, DriveWebhookInfraError } =
        await import("@/app/api/drive/webhook/route");
      const { NextRequest } = await import("next/server");

      await expect(
        handleDriveWebhook(
          new NextRequest("https://crew.fxav.test/api/drive/webhook", {
            method: "POST",
            headers: {
              "X-Goog-Channel-ID": "channel-1",
              "X-Goog-Channel-Token": "secret-1",
              "X-Goog-Resource-ID": "resource-1",
              "X-Goog-Resource-State": "update",
            },
          }),
          {
            tx: {
              readActiveWatchChannel: async () => {
                throw new Error("META: simulated webhook lookup fault");
              },
            } as never,
          },
        ),
      ).rejects.toBeInstanceOf(DriveWebhookInfraError);
    });
  });

  // P3-F4 — pin the MI-11 gate actions' thrown-fault coverage here (registry rows above + behavior).
  // Self-contained via vi.doMock + isolated module registry so it does not perturb the shared mock.
  describe("mi11GateActions (P3-F4)", () => {
    async function importGateWithThrows(opts: {
      throwOnServiceConstruct?: boolean;
      throwOnServerConstruct?: boolean;
      throwOnRpc?: boolean;
    }) {
      vi.resetModules();
      vi.doMock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => undefined }));
      vi.doMock("@/lib/drive/fetch", () => ({
        fetchDriveFileMetadata: async () => ({ modifiedTime: "2026-06-02T00:00:00.000Z" }),
        DriveFetchError: class extends Error {},
      }));
      vi.doMock("@/lib/supabase/server", () => ({
        createSupabaseServiceRoleClient: () => {
          if (opts.throwOnServiceConstruct) throw new Error("META: service-role construct fault");
          return {
            from: () => ({
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { drive_file_id: "drive-1", show_id: "show-1" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
        createSupabaseServerClient: async () => {
          if (opts.throwOnServerConstruct) throw new Error("META: server construct fault");
          return {
            rpc: async () => {
              if (opts.throwOnRpc) throw new Error("META: rpc fault");
              return { data: { ok: true }, error: null };
            },
          };
        },
      }));
      const mod = await import("@/lib/sync/holds/mi11GateActions");
      return mod;
    }

    const INFRA = { ok: false, code: "SYNC_INFRA_ERROR" };

    test("approveMi11Hold: service-role construction throw → SYNC_INFRA_ERROR (no throw)", async () => {
      const { approveMi11Hold } = await importGateWithThrows({ throwOnServiceConstruct: true });
      await expect(approveMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
    });
    test("approveMi11Hold: rpc throw → SYNC_INFRA_ERROR (no throw)", async () => {
      const { approveMi11Hold } = await importGateWithThrows({ throwOnRpc: true });
      await expect(approveMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
    });
    test("rejectMi11Hold: server-client construction throw → SYNC_INFRA_ERROR (no throw)", async () => {
      const { rejectMi11Hold } = await importGateWithThrows({ throwOnServerConstruct: true });
      await expect(rejectMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
    });
    test("rejectMi11Hold: rpc throw → SYNC_INFRA_ERROR (no throw)", async () => {
      const { rejectMi11Hold } = await importGateWithThrows({ throwOnRpc: true });
      await expect(rejectMi11Hold("h1", "T0")).resolves.toEqual(INFRA);
    });
  });
});
