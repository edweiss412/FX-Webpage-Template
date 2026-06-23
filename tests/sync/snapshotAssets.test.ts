import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";
import type { ParseResult } from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import { snapshotAssets, type SnapshotAssetsStorage } from "@/lib/sync/snapshotAssets";

const showId = "11111111-1111-4111-8111-111111111111";
const driveFileId = "sheet-file-1";

function md5Hex(bytes: string): string {
  return createHash("md5").update(new TextEncoder().encode(bytes)).digest("hex");
}

function diagrams(overrides: Partial<ParseResult["diagrams"]> = {}): ParseResult["diagrams"] {
  return {
    linkedFolder: null,
    embeddedImages: [],
    linkedFolderItems: [],
    ...overrides,
  };
}

function fakeStorage() {
  const uploaded: Array<{ path: string; bytes: Uint8Array; contentType: string }> = [];
  const storage: SnapshotAssetsStorage = {
    async upload(path, bytes, options) {
      uploaded.push({ path, bytes, contentType: options.contentType });
    },
  };
  return { storage, uploaded };
}

describe("snapshotAssets", () => {
  test("mints distinct revision ids and temp prefixes for repeated applies of the same source revision", async () => {
    const firstStorage = fakeStorage();
    const secondStorage = fakeStorage();
    const txRows: unknown[] = [];
    const baseDiagrams = diagrams({
      linkedFolderItems: [
        {
          driveFileId: "linked-1",
          mimeType: "image/png",
          drive_modified_time: "2026-05-01T00:00:00.000Z",
          headRevisionId: "rev-linked-1",
          md5Checksum: md5Hex("linked-bytes"),
          snapshotPath: null,
        },
      ],
    });

    const first = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: baseDiagrams,
      tx: { insertPendingSnapshotUpload: async (row) => void txRows.push(row) },
      storage: firstStorage.storage,
      drive: {
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
        fetchEmbeddedImageBytes: async () => null,
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });
    const second = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: baseDiagrams,
      tx: { insertPendingSnapshotUpload: async (row) => void txRows.push(row) },
      storage: secondStorage.storage,
      drive: {
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
        fetchEmbeddedImageBytes: async () => null,
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
        .mockReturnValueOnce("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
    });

    expect(first.snapshotRevisionId).not.toBe(second.snapshotRevisionId);
    expect(first.tempPrefix).not.toBe(second.tempPrefix);
    expect(txRows).toHaveLength(2);
    expect(firstStorage.uploaded[0]?.path).toContain(
      "_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/",
    );
    expect(secondStorage.uploaded[0]?.path).toContain(
      "_pending/dddddddd-dddd-4ddd-8ddd-dddddddddddd/",
    );
  });

  test("uploads verified linked and embedded bytes to the temp prefix and stores canonical paths in pending manifest", async () => {
    const { storage, uploaded } = fakeStorage();
    const embeddedBytes = new TextEncoder().encode("embedded-bytes");
    const linkedBytes = new TextEncoder().encode("linked-bytes");

    const result = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        embeddedImages: [
          {
            sheetTab: "DIAGRAMS",
            objectId: "obj-1",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: sha256Base64Url(embeddedBytes),
            recovery_disposition: "normal",
            snapshotPath: null,
          },
        ],
        linkedFolderItems: [
          {
            driveFileId: "linked-1",
            mimeType: "image/jpeg",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-linked-1",
            md5Checksum: createHash("md5").update(linkedBytes).digest("hex"),
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async () => undefined },
      storage,
      drive: {
        fetchEmbeddedImageBytes: async () => embeddedBytes,
        fetchLinkedRevisionBytes: async () => linkedBytes,
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });

    expect(uploaded.map((entry) => entry.path)).toEqual([
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/embedded-obj-1.png",
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/folder-linked-1.jpg",
    ]);
    expect(result.pending).toMatchObject({
      revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      snapshot_status: "complete",
    });
    expect(result.pending.embeddedImages[0]?.snapshotPath).toBe(
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/embedded-obj-1.png",
    );
    expect(result.pending.linkedFolderItems[0]?.snapshotPath).toBe(
      "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/folder-linked-1.jpg",
    );
  });

  test("fail-closed drift leaves snapshotPath null and marks partial failure", async () => {
    const { storage, uploaded } = fakeStorage();
    const result = await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        embeddedImages: [
          {
            sheetTab: "DIAGRAMS",
            objectId: "obj-1",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: sha256Base64Url(new TextEncoder().encode("approved")),
            recovery_disposition: "normal",
            snapshotPath: null,
          },
          {
            sheetTab: "DIAGRAMS",
            objectId: "obj-restage",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: null,
            recovery_disposition: "restage_required",
            snapshotPath: null,
          },
        ],
        linkedFolderItems: [
          {
            driveFileId: "linked-1",
            mimeType: "image/png",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-linked-1",
            md5Checksum: md5Hex("approved-linked"),
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async () => undefined },
      storage,
      drive: {
        fetchEmbeddedImageBytes: async () => new TextEncoder().encode("mutated"),
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("mutated-linked"),
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });

    expect(uploaded).toEqual([]);
    expect(result.pending.snapshot_status).toBe("partial_failure");
    expect(result.pending.embeddedImages.map((entry) => entry.snapshotPath)).toEqual([null, null]);
    expect(result.pending.linkedFolderItems.map((entry) => entry.snapshotPath)).toEqual([null]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "EMBEDDED_ASSET_DRIFTED",
      "EMBEDDED_ASSET_DRIFTED",
    ]);
  });

  test("inserts exactly one pending_snapshot_uploads ledger row per apply attempt", async () => {
    const ledgerRows: unknown[] = [];
    await snapshotAssets({
      showId,
      driveFileId,
      diagrams: diagrams({
        linkedFolderItems: [
          {
            driveFileId: "linked-1",
            mimeType: "image/png",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-linked-1",
            md5Checksum: md5Hex("linked-bytes"),
            snapshotPath: null,
          },
          {
            driveFileId: "linked-2",
            mimeType: "image/png",
            drive_modified_time: "2026-05-01T00:00:00.000Z",
            headRevisionId: "rev-linked-2",
            md5Checksum: md5Hex("linked-bytes"),
            snapshotPath: null,
          },
        ],
      }),
      tx: { insertPendingSnapshotUpload: async (row) => void ledgerRows.push(row) },
      storage: fakeStorage().storage,
      drive: {
        fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
        fetchEmbeddedImageBytes: async () => null,
      },
      uuid: vi
        .fn()
        .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    });

    expect(ledgerRows).toEqual([
      {
        showId,
        driveFileId,
        snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tempPrefix:
          "diagram-snapshots/shows/11111111-1111-4111-8111-111111111111/_pending/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/",
        assetCount: 2,
      },
    ]);
  });
});
