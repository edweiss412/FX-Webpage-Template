/**
 * Sync infra-failure contract registry.
 *
 * M6 sync helpers that touch Supabase must not collapse infrastructure
 * failures into benign "skip" / "not found" outcomes. Each helper gets a row
 * here as it ships.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { Phase1Tx } from "@/lib/sync/phase1";
import type { Phase2Tx } from "@/lib/sync/phase2";

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
          binding: { headRevisionId: "head-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
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
          binding: { headRevisionId: "head-1", modifiedTime: "2026-05-08T12:00:00.000Z" },
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
});
