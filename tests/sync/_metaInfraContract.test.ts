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
});
