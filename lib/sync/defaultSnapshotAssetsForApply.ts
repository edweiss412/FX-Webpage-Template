import { getDriveAccessToken, getDriveClient } from "@/lib/drive/client";
import type { ParseResult } from "@/lib/parser/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { readBoundedNodeStream, readBoundedWebStream } from "@/lib/sync/boundedBytes";
import {
  snapshotAssets,
  type PendingSnapshotUploadRow,
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
        async fetchEmbeddedImageBytes(entry) {
          if (!entry.contentUrl) return null;
          const token = await getDriveAccessToken();
          const response = await fetch(entry.contentUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok || !response.body) return null;
          return await readBoundedWebStream(response.body, MAX_SINGLE_ASSET_BYTES);
        },
        async fetchLinkedRevisionBytes(entry) {
          const { data } = await drive.revisions.get(
            {
              fileId: entry.driveFileId,
              revisionId: entry.headRevisionId,
              alt: "media",
              supportsAllDrives: true,
            },
            { responseType: "stream" },
          );
          if (data instanceof ReadableStream) {
            return await readBoundedWebStream(data, MAX_SINGLE_ASSET_BYTES);
          }
          if (data && typeof data === "object" && "pipe" in data) {
            return await readBoundedNodeStream(
              data as NodeJS.ReadableStream,
              MAX_SINGLE_ASSET_BYTES,
            );
          }
          return bytesFrom(data);
        },
      },
    });
}
