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
    helper: "getActiveWatchedFolderId",
    path: "lib/appSettings/getWatchedFolderId.ts",
    contract: "app_settings watched-folder lookup faults become typed infra_error results",
  },
  {
    helper: "snapshotAssets",
    path: "lib/sync/snapshotAssets.ts",
    contract:
      "asset snapshotting uses explicit tx/storage/drive ports; Supabase boundary faults surface at the caller-owned port layer",
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
});
