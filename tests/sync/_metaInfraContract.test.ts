/**
 * Sync infra-failure contract registry.
 *
 * M6 sync helpers that touch Supabase must not collapse infrastructure
 * failures into benign "skip" / "not found" outcomes. Each helper gets a row
 * here as it ships.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";

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
});
