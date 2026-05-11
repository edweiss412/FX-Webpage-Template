import { createHash, randomUUID } from "node:crypto";
import type {
  EmbeddedImageStub,
  LinkedFolderItemStub,
  ParseResult,
  ParseWarning,
  PersistedEmbeddedImage,
  PersistedLinkedFolderItem,
} from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { BoundedByteResult } from "@/lib/sync/boundedBytes";

export type PendingSnapshotUploadRow = {
  showId: string;
  driveFileId: string;
  tempPrefix: string;
  snapshotRevisionId: string;
  assetCount: number;
};

export type SnapshotAssetsTx = {
  insertPendingSnapshotUpload(row: PendingSnapshotUploadRow): Promise<void>;
  markPendingSnapshotDeleteStarted?(snapshotRevisionId: string): Promise<void>;
};

export type SnapshotAssetsStorage = {
  upload(path: string, bytes: Uint8Array, options: { contentType: string }): Promise<void>;
};

export type SnapshotAssetBytes = Uint8Array | BoundedByteResult;

export type SnapshotAssetsDrive = {
  fetchEmbeddedImageBytes(entry: EmbeddedImageStub): Promise<SnapshotAssetBytes | null>;
  fetchLinkedRevisionBytes(entry: LinkedFolderItemStub): Promise<SnapshotAssetBytes | null>;
};

export type PendingDiagramsPayload = {
  revision_id: string;
  snapshot_revision_id: string;
  snapshot_status: "complete" | "partial_failure" | "partial_failure_restage_required";
  linkedFolder: ParseResult["diagrams"]["linkedFolder"];
  embeddedImages: PersistedEmbeddedImage[];
  linkedFolderItems: PersistedLinkedFolderItem[];
};

export type SnapshotAssetsResult = {
  snapshotRevisionId: string;
  runUuid: string;
  tempPrefix: string;
  pending: PendingDiagramsPayload;
  warnings: ParseWarning[];
};

export type SnapshotAssetsArgs = {
  showId: string;
  driveFileId: string;
  diagrams: ParseResult["diagrams"];
  tx: SnapshotAssetsTx;
  storage: SnapshotAssetsStorage;
  drive: SnapshotAssetsDrive;
  uuid?: () => string;
};

function extForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function md5Hex(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

function bytePayload(asset: SnapshotAssetBytes): Uint8Array {
  return asset instanceof Uint8Array ? asset : asset.bytes;
}

function assetSha256(asset: SnapshotAssetBytes): string {
  return asset instanceof Uint8Array ? sha256Base64Url(asset) : asset.sha256Base64Url;
}

function assetMd5(asset: SnapshotAssetBytes): string {
  return asset instanceof Uint8Array ? md5Hex(asset) : asset.md5Hex;
}

function warning(code: string, message: string): ParseWarning {
  return { severity: "warn", code, message };
}

function canonicalPrefix(showId: string, snapshotRevisionId: string): string {
  return `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/`;
}

function tempPrefix(showId: string, runUuid: string): string {
  return `diagram-snapshots/shows/${showId}/_pending/${runUuid}/`;
}

function statusFor(
  embeddedImages: PersistedEmbeddedImage[],
  linkedFolderItems: PersistedLinkedFolderItem[],
): PendingDiagramsPayload["snapshot_status"] {
  const unresolved = [...embeddedImages, ...linkedFolderItems].filter(
    (entry) => !entry.snapshotPath,
  );
  if (unresolved.length === 0) return "complete";
  if (
    unresolved.length > 0 &&
    unresolved.every(
      (entry) =>
        "recovery_disposition" in entry && entry.recovery_disposition === "restage_required",
    )
  ) {
    return "partial_failure_restage_required";
  }
  return "partial_failure";
}

export async function snapshotAssets(args: SnapshotAssetsArgs): Promise<SnapshotAssetsResult> {
  const uuid = args.uuid ?? randomUUID;
  const snapshotRevisionId = uuid();
  const runUuid = uuid();
  const temp = tempPrefix(args.showId, runUuid);
  const canonical = canonicalPrefix(args.showId, snapshotRevisionId);
  const warnings: ParseWarning[] = [];
  const assetCount = args.diagrams.embeddedImages.length + args.diagrams.linkedFolderItems.length;

  await args.tx.insertPendingSnapshotUpload({
    showId: args.showId,
    driveFileId: args.driveFileId,
    snapshotRevisionId,
    tempPrefix: temp,
    assetCount,
  });

  const embeddedImages: PersistedEmbeddedImage[] = [];
  try {
    for (const entry of args.diagrams.embeddedImages) {
      const assetKey = `embedded-${entry.objectId}.${extForMime(entry.mimeType)}`;
      let snapshotPath: string | null = null;

      if (entry.embeddedFingerprint && entry.recovery_disposition !== "restage_required") {
        const bytes = await args.drive.fetchEmbeddedImageBytes(entry);
        if (bytes && assetSha256(bytes) === entry.embeddedFingerprint) {
          await args.storage.upload(`${temp}${assetKey}`, bytePayload(bytes), {
            contentType: entry.mimeType,
          });
          snapshotPath = `${canonical}${assetKey}`;
        } else {
          warnings.push(
            warning("EMBEDDED_ASSET_DRIFTED", `Embedded diagram ${entry.objectId} drifted.`),
          );
        }
      }

      embeddedImages.push({ ...entry, snapshotPath });
    }

    const linkedFolderItems: PersistedLinkedFolderItem[] = [];
    for (const entry of args.diagrams.linkedFolderItems) {
      const assetKey = `folder-${entry.driveFileId}.${extForMime(entry.mimeType)}`;
      let snapshotPath: string | null = null;
      const bytes = await args.drive.fetchLinkedRevisionBytes(entry);
      if (bytes && assetMd5(bytes) === entry.md5Checksum) {
        await args.storage.upload(`${temp}${assetKey}`, bytePayload(bytes), {
          contentType: entry.mimeType,
        });
        snapshotPath = `${canonical}${assetKey}`;
      } else {
        warnings.push(
          warning("LINKED_ASSET_DRIFTED", `Linked diagram ${entry.driveFileId} drifted.`),
        );
      }
      linkedFolderItems.push({ ...entry, snapshotPath });
    }

    const pending: PendingDiagramsPayload = {
      revision_id: snapshotRevisionId,
      snapshot_revision_id: snapshotRevisionId,
      snapshot_status: statusFor(embeddedImages, linkedFolderItems),
      linkedFolder: args.diagrams.linkedFolder,
      embeddedImages,
      linkedFolderItems,
    };

    return {
      snapshotRevisionId,
      runUuid,
      tempPrefix: temp,
      pending,
      warnings,
    };
  } catch (error) {
    await args.tx.markPendingSnapshotDeleteStarted?.(snapshotRevisionId);
    throw error;
  }
}
