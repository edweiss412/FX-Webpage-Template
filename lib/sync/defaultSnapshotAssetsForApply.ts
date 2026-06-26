import type { drive_v3 } from "googleapis";
import { getDriveAccessToken, getDriveClient } from "@/lib/drive/client";
import { createStallGuard, DRIVE_ASSET_STALL_TIMEOUT_MS } from "@/lib/drive/stallGuard";
import type { EmbeddedImageStub, LinkedFolderItemStub, ParseResult } from "@/lib/parser/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { readBoundedNodeStream, readBoundedWebStream } from "@/lib/sync/boundedBytes";
import {
  snapshotAssets,
  type PendingSnapshotUploadRow,
  type SnapshotAssetBytes,
  type SnapshotAssetsResult,
} from "@/lib/sync/snapshotAssets";

const DIAGRAM_BUCKET = "diagram-snapshots";
const MAX_SINGLE_ASSET_BYTES = 50 * 1024 * 1024;

export type SnapshotAssetsApplyTx = {
  insertPendingSnapshotUpload(row: PendingSnapshotUploadRow): Promise<void>;
  markPendingSnapshotDeleteStarted?(snapshotRevisionId: string): Promise<void>;
};

function bytesFrom(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return null;
}

/**
 * The default snapshot `fetchEmbeddedImageBytes` body, extracted as an injectable
 * + directly-unit-testable function (DXT-2), with an idle stall guard: a stalled
 * download trips at `timeoutMs` and returns null (fail-soft), while a healthy slow
 * download stays alive via `onChunk`. The `readBoundedWebStream` read stays inline
 * (per `_streamingHashContract`). Mirror of assetRecovery's helper.
 */
export async function snapshotFetchEmbeddedImageBytesTimed(
  entry: EmbeddedImageStub,
  deps: { fetch?: typeof fetch; getAccessToken?: () => Promise<string>; timeoutMs?: number } = {},
): Promise<SnapshotAssetBytes | null> {
  if (!entry.contentUrl) return null;
  const fetchImpl = deps.fetch ?? fetch;
  const token = await (deps.getAccessToken ?? getDriveAccessToken)();
  const guard = createStallGuard(deps.timeoutMs ?? DRIVE_ASSET_STALL_TIMEOUT_MS);
  try {
    const response = await fetchImpl(entry.contentUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: guard.signal,
    });
    if (!response.ok || !response.body) return null;
    return await readBoundedWebStream(response.body, MAX_SINGLE_ASSET_BYTES, {
      onChunk: () => guard.reset(),
    });
  } catch (error) {
    if (guard.timedOut()) return null;
    throw error;
  } finally {
    guard.clear();
  }
}

/**
 * The default snapshot `fetchLinkedRevisionBytes` body, extracted as an injectable
 * + directly-unit-testable function (DXT-2). Same idle stall guard; the Node-stream
 * branch also `destroy()`s the stream on timeout. Both bounded readers stay inline
 * (per `_streamingHashContract`). Mirror of assetRecovery's helper.
 */
export async function snapshotFetchLinkedRevisionBytesTimed(
  entry: LinkedFolderItemStub,
  deps: { drive?: drive_v3.Drive; timeoutMs?: number } = {},
): Promise<SnapshotAssetBytes | null> {
  const drive = deps.drive ?? getDriveClient();
  const guard = createStallGuard(deps.timeoutMs ?? DRIVE_ASSET_STALL_TIMEOUT_MS);
  const onChunk = () => guard.reset();
  try {
    const { data } = await drive.revisions.get(
      { fileId: entry.driveFileId, revisionId: entry.headRevisionId, alt: "media" },
      { responseType: "stream", signal: guard.signal },
    );
    if (data instanceof ReadableStream) {
      return await readBoundedWebStream(data, MAX_SINGLE_ASSET_BYTES, { onChunk });
    }
    if (data && typeof data === "object" && "pipe" in data) {
      const nodeStream = data as NodeJS.ReadableStream & { destroy?: (error?: Error) => void };
      const onAbort = () => nodeStream.destroy?.(new Error("drive revision stream stalled"));
      guard.signal.addEventListener("abort", onAbort);
      try {
        return await readBoundedNodeStream(nodeStream, MAX_SINGLE_ASSET_BYTES, { onChunk });
      } finally {
        guard.signal.removeEventListener("abort", onAbort);
      }
    }
    return bytesFrom(data);
  } catch (error) {
    if (guard.timedOut()) return null;
    throw error;
  } finally {
    guard.clear();
  }
}

export function makeSnapshotAssetsForApply(
  showId: string,
  tx: SnapshotAssetsApplyTx,
): (args: {
  driveFileId: string;
  diagrams: ParseResult["diagrams"];
}) => Promise<SnapshotAssetsResult> {
  const supabase = createSupabaseServiceRoleClient();
  const drive = getDriveClient();
  return async (args) =>
    await snapshotAssets({
      showId,
      driveFileId: args.driveFileId,
      diagrams: args.diagrams,
      tx,
      storage: {
        async upload(path, bytes, options) {
          const objectPath = path.startsWith(`${DIAGRAM_BUCKET}/`)
            ? path.slice(DIAGRAM_BUCKET.length + 1)
            : path;
          const { error } = await supabase.storage.from(DIAGRAM_BUCKET).upload(objectPath, bytes, {
            contentType: options.contentType,
            upsert: true,
          });
          if (error) throw error;
        },
      },
      drive: {
        fetchEmbeddedImageBytes: (entry) => snapshotFetchEmbeddedImageBytesTimed(entry),
        fetchLinkedRevisionBytes: (entry) =>
          snapshotFetchLinkedRevisionBytesTimed(entry, { drive }),
      },
    });
}
