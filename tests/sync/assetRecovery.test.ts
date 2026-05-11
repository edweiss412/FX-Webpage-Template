import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { PersistedDiagrams } from "@/lib/parser/types";
import {
  CONCURRENT_SYNC_SKIPPED,
  assetRecovery,
  runAssetRecoveryCron,
  type AssetRecoveryStorage,
} from "@/lib/sync/assetRecovery";

const showId = "11111111-1111-4111-8111-111111111111";
const driveFileId = "sheet-file-1";
const snapshotRevisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function md5Hex(value: string): string {
  return createHash("md5").update(new TextEncoder().encode(value)).digest("hex");
}

function partialDiagrams(): PersistedDiagrams {
  return {
    snapshot_revision_id: snapshotRevisionId,
    snapshot_status: "partial_failure",
    linkedFolder: null,
    embeddedImages: [
      {
        sheetTab: "DIAGRAMS",
        objectId: "embedded-1",
        mimeType: "image/png",
        sheetsRevisionId: "sheet-rev-1",
        embeddedFingerprint: sha256Base64Url(new TextEncoder().encode("embedded-bytes")),
        recovery_disposition: "normal",
        snapshotPath: null,
      },
    ],
    linkedFolderItems: [
      {
        driveFileId: "linked-1",
        mimeType: "image/jpeg",
        drive_modified_time: "2026-05-01T00:00:00.000Z",
        headRevisionId: "linked-rev-1",
        md5Checksum: md5Hex("linked-bytes"),
        snapshotPath: null,
      },
    ],
  };
}

function storage() {
  const uploads: Array<{ path: string; contentType: string }> = [];
  const removed: string[] = [];
  const storagePort: AssetRecoveryStorage = {
    async upload(path, _bytes, options) {
      uploads.push({ path, contentType: options.contentType });
    },
    async remove(path) {
      removed.push(path);
    },
  };
  return { storagePort, uploads, removed };
}

describe("assetRecovery", () => {
  test("retries missing embedded and linked entries, uploads to locked revision, and flips complete", async () => {
    const { storagePort, uploads } = storage();
    let persisted: unknown = null;

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_driveFileId, fn) =>
        await fn({
          readLockedShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
          updateRecoveredDiagrams: async (_showId, diagrams) => {
            persisted = diagrams;
            return true;
          },
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async () => undefined,
        }),
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    expect(result).toEqual({ outcome: "recovered", snapshotRevisionId });
    expect(uploads.map((upload) => upload.path)).toEqual([
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/embedded-embedded-1.png",
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/folder-linked-1.jpg",
    ]);
    expect(persisted).toMatchObject({
      snapshot_status: "complete",
      embeddedImages: [
        {
          snapshotPath:
            "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/embedded-embedded-1.png",
        },
      ],
      linkedFolderItems: [
        {
          snapshotPath:
            "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/folder-linked-1.jpg",
        },
      ],
    });
  });

  test("restage-only unresolved entries transition to partial_failure_restage_required and alert", async () => {
    const alerts: string[] = [];
    const diagrams = {
      ...partialDiagrams(),
      linkedFolderItems: [],
      embeddedImages: [
        {
          ...partialDiagrams().embeddedImages[0]!,
          embeddedFingerprint: null,
          recovery_disposition: "restage_required" as const,
        },
      ],
    };

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams }),
      withShowLock: async (_driveFileId, fn) =>
        await fn({
          readLockedShow: async () => ({ showId, driveFileId, diagrams }),
          updateRecoveredDiagrams: async (_showId, next) => {
            expect(next.snapshot_status).toBe("partial_failure_restage_required");
            return true;
          },
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async (_showId, code) => void alerts.push(code),
        }),
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => {
          throw new Error("restage-only entries must not be fetched");
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    });

    expect(result).toEqual({ outcome: "restage_required", snapshotRevisionId });
    expect(alerts).toEqual(["EMBEDDED_RECOVERY_REQUIRES_RESTAGE"]);
  });

  test("revision drift detected under lock writes cooldown before any canonical upload", async () => {
    const { storagePort, uploads } = storage();
    const cooldowns: unknown[] = [];
    const alerts: unknown[] = [];
    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_driveFileId, fn) =>
        await fn({
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams: { ...partialDiagrams(), snapshot_revision_id: "newer-rev" },
          }),
          updateRecoveredDiagrams: async () => {
            throw new Error("drifted recovery must not update diagrams");
          },
          upsertRecoveryCooldown: async (...args) => void cooldowns.push(args),
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async (...args) => void alerts.push(args),
        }),
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    expect(result).toEqual({
      outcome: "revision_drift",
      code: "ASSET_RECOVERY_REVISION_DRIFT",
      previewRevisionId: snapshotRevisionId,
    });
    expect(uploads).toEqual([]);
    expect(cooldowns).toEqual([[showId, snapshotRevisionId]]);
    expect(alerts).toEqual([
      [
        showId,
        "ASSET_RECOVERY_REVISION_DRIFT",
        {
          currentSnapshotRevisionId: "newer-rev",
          snapshotRevisionId,
        },
      ],
    ]);
  });

  test("revision drift after canonical upload removes uploaded recovery bytes", async () => {
    const { storagePort, uploads, removed } = storage();
    let lockCount = 0;

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_driveFileId, fn) => {
        lockCount += 1;
        return await fn({
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams:
              lockCount === 1
                ? partialDiagrams()
                : { ...partialDiagrams(), snapshot_revision_id: "newer-rev" },
          }),
          updateRecoveredDiagrams: async () => {
            throw new Error("drifted recovery must not update diagrams");
          },
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async () => undefined,
        });
      },
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    expect(result).toEqual({
      outcome: "revision_drift",
      code: "ASSET_RECOVERY_REVISION_DRIFT",
      previewRevisionId: snapshotRevisionId,
    });
    expect(removed).toEqual(uploads.map((upload) => upload.path));
  });

  test("no-op after canonical upload removes uploaded recovery bytes", async () => {
    const { storagePort, uploads, removed } = storage();
    let lockCount = 0;

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async (_driveFileId, fn) => {
        lockCount += 1;
        return await fn({
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams:
              lockCount === 1
                ? partialDiagrams()
                : { ...partialDiagrams(), snapshot_status: "complete" },
          }),
          updateRecoveredDiagrams: async () => {
            throw new Error("no-op recovery must not update diagrams");
          },
          upsertRecoveryCooldown: async () => undefined,
          deleteRecoveryCooldown: async () => undefined,
          upsertAdminAlert: async () => undefined,
        });
      },
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    expect(result).toEqual({ outcome: "no_op" });
    expect(removed).toEqual(uploads.map((upload) => upload.path));
  });

  test("busy show lock returns concurrent sync skipped", async () => {
    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      withShowLock: async () => ({ skipped: CONCURRENT_SYNC_SKIPPED }),
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
      },
    });

    expect(result).toEqual({ outcome: "skipped", code: CONCURRENT_SYNC_SKIPPED });
  });

  test("active drift cooldown returns before Drive fetches or lock acquisition", async () => {
    const alerts: unknown[] = [];
    const result = await assetRecovery(showId, {
      now: () => new Date("2026-05-10T00:01:00.000Z"),
      readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
      readRecoveryCooldown: async () => ({
        lastDriftAt: "2026-05-10T00:00:30.000Z",
        retryCount: 2,
      }),
      upsertAdminAlert: async (...args) => void alerts.push(args),
      withShowLock: async () => {
        throw new Error("cooldown gate must not acquire the show lock");
      },
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => {
          throw new Error("cooldown gate must not fetch Drive bytes");
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    });

    expect(result).toEqual({
      outcome: "drift_cooldown",
      code: "ASSET_RECOVERY_DRIFT_COOLDOWN",
    });
    expect(alerts).toEqual([[showId, "ASSET_RECOVERY_DRIFT_COOLDOWN", { snapshotRevisionId }]]);
  });

  test("entry-count byte ceiling aborts before Drive fetches or lock acquisition and alerts", async () => {
    const alerts: string[] = [];
    const diagrams: PersistedDiagrams = {
      ...partialDiagrams(),
      embeddedImages: Array.from({ length: 61 }, (_, index) => ({
        ...partialDiagrams().embeddedImages[0]!,
        objectId: `embedded-${index}`,
      })),
      linkedFolderItems: [],
    };

    const result = await assetRecovery(showId, {
      readPreviewShow: async () => ({ showId, driveFileId, diagrams }),
      withShowLock: async () => {
        throw new Error("byte-ceiling abort must not acquire the show lock");
      },
      upsertAdminAlert: async (_showId, code) => void alerts.push(code),
      storage: storage().storagePort,
      drive: {
        fetchEmbeddedImageBytes: async () => {
          throw new Error("byte-ceiling abort must not fetch bytes");
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    });

    expect(result).toEqual({ outcome: "bytes_exceeded", code: "ASSET_RECOVERY_BYTES_EXCEEDED" });
    expect(alerts).toEqual(["ASSET_RECOVERY_BYTES_EXCEEDED"]);
  });

  test("cron enumerates recoverable shows and invokes recovery for each show", async () => {
    const recovered: string[] = [];

    const result = await runAssetRecoveryCron({
      listRecoverableShows: async () => ["show-a", "show-b"],
      recover: async (id) => {
        recovered.push(id);
        return { outcome: "no_op" };
      },
    });

    expect(recovered).toEqual(["show-a", "show-b"]);
    expect(result.processed).toEqual([
      { showId: "show-a", result: { outcome: "no_op" } },
      { showId: "show-b", result: { outcome: "no_op" } },
    ]);
  });

  test("cron records one show failure and continues to later recoveries", async () => {
    const recovered: string[] = [];

    const result = await runAssetRecoveryCron({
      listRecoverableShows: async () => ["show-a", "show-b"],
      recover: async (id) => {
        recovered.push(id);
        if (id === "show-a") throw new Error("recovery failed");
        return { outcome: "no_op" };
      },
    });

    expect(recovered).toEqual(["show-a", "show-b"]);
    expect(result.processed).toEqual([
      { showId: "show-a", result: { outcome: "infra_error", code: "SYNC_INFRA_ERROR" } },
      { showId: "show-b", result: { outcome: "no_op" } },
    ]);
  });
});
