import { createHash, randomUUID } from "node:crypto";
import type {
  EmbeddedImageStub,
  LinkedFolderItemStub,
  ParseResult,
  ParseWarning,
  PersistedDiagramFields,
  PersistedEmbeddedImage,
  PersistedLinkedFolderItem,
} from "@/lib/parser/types";
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { BoundedByteResult } from "@/lib/sync/boundedBytes";
import {
  generateDiagramVariants,
  type DiagramVariantFailureReason,
} from "@/lib/sync/diagramVariants";

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
  removePrefix?(prefix: string): Promise<void>;
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

/**
 * One diagram whose variant generation failed (spec §3). Produced INSIDE the
 * show advisory-lock tx, so it is carried out as data and emitted post-commit
 * by each consuming surface (invariant 10) — never logged here.
 */
export type DiagramVariantFailureRow = {
  assetKey: string;
  reason: DiagramVariantFailureReason;
  message: string;
};

export type SnapshotAssetsResult = {
  snapshotRevisionId: string;
  runUuid: string;
  tempPrefix: string;
  pending: PendingDiagramsPayload;
  warnings: ParseWarning[];
  variantFailures: DiagramVariantFailureRow[];
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

/**
 * Run the variant stage for one verified asset, upload each variant beside the
 * original under the SAME temp prefix, and return the §4 manifest fields.
 *
 * Nulls from the stage map to OMITTED fields (spec §4 serialization rule), so a
 * failed generation writes no field rather than a null one. The failure, if any,
 * is pushed onto `failures` for the caller to carry out — this function never
 * logs and never throws: the snapshot must not degrade because a resize failed.
 */
async function variantFieldsFor(args: {
  bytes: Uint8Array;
  mimeType: string;
  assetKey: string;
  tempPrefix: string;
  storage: SnapshotAssetsStorage;
  failures: DiagramVariantFailureRow[];
}): Promise<PersistedDiagramFields> {
  const result = await generateDiagramVariants({
    bytes: args.bytes,
    mimeType: args.mimeType,
    assetKey: args.assetKey,
  });

  if (result.failure) {
    args.failures.push({
      assetKey: args.assetKey,
      reason: result.failure.reason,
      message: result.failure.message,
    });
  }

  for (const variant of result.variants) {
    await args.storage.upload(`${args.tempPrefix}${variant.key}`, variant.bytes, {
      contentType: variant.mimeType,
    });
  }

  const fields: PersistedDiagramFields = {};
  if (result.variants.length > 0) {
    // key is the LAST PATH SEGMENT (spec §4); the route rebuilds the full path
    // as dirname(snapshotPath) + "/" + key (spec §5).
    fields.variants = result.variants.map((variant) => ({
      width: variant.width,
      key: variant.key,
    }));
  }
  if (result.blurDataURL !== null) fields.blurDataURL = result.blurDataURL;
  if (result.intrinsicWidth !== null) fields.intrinsicWidth = result.intrinsicWidth;
  if (result.intrinsicHeight !== null) fields.intrinsicHeight = result.intrinsicHeight;
  return fields;
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
  // Carried out to every consuming surface's POST-COMMIT sink (invariant 10).
  const variantFailures: DiagramVariantFailureRow[] = [];
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

      let variantFields: PersistedDiagramFields = {};

      if (entry.embeddedFingerprint && entry.recovery_disposition !== "restage_required") {
        const bytes = await args.drive.fetchEmbeddedImageBytes(entry);
        if (bytes && assetSha256(bytes) === entry.embeddedFingerprint) {
          // Variant stage runs AFTER fingerprint verification (never on unverified
          // bytes) and before the original's upload.
          variantFields = await variantFieldsFor({
            bytes: bytePayload(bytes),
            mimeType: entry.mimeType,
            assetKey,
            tempPrefix: temp,
            storage: args.storage,
            failures: variantFailures,
          });
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

      embeddedImages.push({ ...entry, ...variantFields, snapshotPath });
    }

    const linkedFolderItems: PersistedLinkedFolderItem[] = [];
    for (const entry of args.diagrams.linkedFolderItems) {
      const assetKey = `folder-${entry.driveFileId}.${extForMime(entry.mimeType)}`;
      let snapshotPath: string | null = null;
      let variantFields: PersistedDiagramFields = {};
      const bytes = await args.drive.fetchLinkedRevisionBytes(entry);
      if (bytes && assetMd5(bytes) === entry.md5Checksum) {
        // Same ordering as the embedded loop: post-md5-verification, pre-original.
        variantFields = await variantFieldsFor({
          bytes: bytePayload(bytes),
          mimeType: entry.mimeType,
          assetKey,
          tempPrefix: temp,
          storage: args.storage,
          failures: variantFailures,
        });
        await args.storage.upload(`${temp}${assetKey}`, bytePayload(bytes), {
          contentType: entry.mimeType,
        });
        snapshotPath = `${canonical}${assetKey}`;
      } else {
        warnings.push(
          warning("EMBEDDED_ASSET_DRIFTED", `Linked diagram ${entry.driveFileId} drifted.`),
        );
      }
      linkedFolderItems.push({ ...entry, ...variantFields, snapshotPath });
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
      variantFailures,
    };
  } catch (error) {
    // Both cleanups are best-effort and INDEPENDENT: each is wrapped, so a
    // failing marker cannot skip the prefix removal, and neither can replace the
    // error the caller needs to see. Marking first preserves the existing
    // ordering for the shapes where the enclosing tx commits despite the throw.
    try {
      await args.tx.markPendingSnapshotDeleteStarted?.(snapshotRevisionId);
    } catch {
      /* never mask the original error */
    }
    try {
      // The run-private _pending prefix is referenced by nobody (fresh runUuid).
      // Failure here is silent by contract (spec §1.1 R7) and the diagram-gc
      // _pending stage reclaims whatever survives (spec §4).
      await args.storage.removePrefix?.(temp);
    } catch {
      /* never mask the original error */
    }
    throw error;
  }
}
