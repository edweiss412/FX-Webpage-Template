import type { drive_v3 } from "googleapis";
import { getDriveAccessToken, getDriveClient } from "@/lib/drive/client";
import type { DriveListedFile } from "@/lib/drive/list";

export const MARKDOWN_EXPORT_MIME_TYPE = "text/markdown";
export const DRIVE_FILE_METADATA_FIELDS =
  "id, name, mimeType, modifiedTime, parents, headRevisionId, md5Checksum";

export type DriveFetchOptions = {
  drive?: drive_v3.Drive;
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string>;
};

export class DriveFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveFetchError";
  }
}

function dataToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof Uint8Array) return Buffer.from(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  throw new DriveFetchError("Drive export response was not text or bytes");
}

function toDriveFileMetadata(file: drive_v3.Schema$File): DriveListedFile {
  if (!file.id || !file.name || !file.mimeType || !file.modifiedTime) {
    throw new DriveFetchError("Drive files.get response omitted required metadata");
  }

  const metadata: DriveListedFile = {
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    parents: file.parents ?? [],
  };
  if (file.headRevisionId) metadata.headRevisionId = file.headRevisionId;
  if (file.md5Checksum) metadata.md5Checksum = file.md5Checksum;
  return metadata;
}

export async function fetchDriveFileMetadata(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<DriveListedFile> {
  const drive = options.drive ?? getDriveClient();
  const response = await drive.files.get({
    fileId: driveFileId,
    fields: DRIVE_FILE_METADATA_FIELDS,
    supportsAllDrives: true,
  });

  return toDriveFileMetadata(response.data);
}

export async function fetchSheetAsMarkdown(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<string> {
  const drive = options.drive ?? getDriveClient();
  const response = await drive.files.export(
    {
      fileId: driveFileId,
      mimeType: MARKDOWN_EXPORT_MIME_TYPE,
    },
    { responseType: "text" },
  );

  return dataToString(response.data);
}

export async function fetchSheetAsMarkdownAtRevision(
  driveFileId: string,
  revisionId: string,
  options: DriveFetchOptions = {},
): Promise<string> {
  const drive = options.drive ?? getDriveClient();
  const response = await drive.revisions.get({
    fileId: driveFileId,
    revisionId,
    fields: "exportLinks",
  });
  const exportUrl = response.data.exportLinks?.[MARKDOWN_EXPORT_MIME_TYPE];
  if (!exportUrl) {
    throw new DriveFetchError(
      `Drive revision ${revisionId} for ${driveFileId} did not include a markdown export link`,
    );
  }
  const accessToken = await (options.getAccessToken ?? getDriveAccessToken)();
  const fetchImpl = options.fetch ?? fetch;
  const exportResponse = await fetchImpl(exportUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: MARKDOWN_EXPORT_MIME_TYPE,
    },
  });
  if (!exportResponse.ok) {
    throw new DriveFetchError(
      `Drive revision markdown export failed with HTTP ${exportResponse.status}`,
    );
  }

  return exportResponse.text();
}
