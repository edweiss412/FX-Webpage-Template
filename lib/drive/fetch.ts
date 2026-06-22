import type { drive_v3 } from "googleapis";
import { getDriveAccessToken, getDriveClient } from "@/lib/drive/client";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import type { DriveListedFile } from "@/lib/drive/list";

export const MARKDOWN_EXPORT_MIME_TYPE = "text/markdown";
export const XLSX_EXPORT_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const DRIVE_FILE_METADATA_FIELDS =
  "id, name, mimeType, modifiedTime, parents, trashed, headRevisionId, md5Checksum";
export const DRIVE_EXPORT_METADATA_FIELDS = `${DRIVE_FILE_METADATA_FIELDS}, exportLinks`;

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
  if (typeof file.trashed === "boolean") metadata.trashed = file.trashed;
  if (file.headRevisionId) metadata.headRevisionId = file.headRevisionId;
  if (file.md5Checksum) metadata.md5Checksum = file.md5Checksum;
  return metadata;
}

function bindingToken(file: drive_v3.Schema$File | DriveListedFile): string {
  const token = file.headRevisionId ?? file.modifiedTime;
  if (!token) {
    const fileId = "driveFileId" in file ? file.driveFileId : file.id;
    throw new DriveFetchError(`Drive files.get response omitted revision token for ${fileId}`);
  }
  return token;
}

async function fetchFileForExport(
  driveFileId: string,
  drive: drive_v3.Drive,
): Promise<drive_v3.Schema$File> {
  const response = await drive.files.get({
    fileId: driveFileId,
    fields: DRIVE_EXPORT_METADATA_FIELDS,
    supportsAllDrives: true,
  });
  if (
    !response.data.id ||
    !response.data.name ||
    !response.data.mimeType ||
    !response.data.modifiedTime
  ) {
    throw new DriveFetchError("Drive files.get response omitted required metadata");
  }
  return response.data;
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

/**
 * @internal: tests only. Production sync paths must call
 * fetchSheetAsMarkdownAtRevision with a binding token captured before parsing.
 */
export async function fetchSheetAsMarkdown(
  driveFileId: string,
  options: DriveFetchOptions = {},
): Promise<string> {
  const drive = options.drive ?? getDriveClient();
  const metadata = await fetchDriveFileMetadata(driveFileId, { ...options, drive });
  return fetchSheetAsMarkdownAtRevision(driveFileId, bindingToken(metadata), {
    ...options,
    drive,
  });
}

export async function fetchSheetAsMarkdownAtRevision(
  driveFileId: string,
  revisionId: string,
  options: DriveFetchOptions = {},
): Promise<string> {
  const { markdown } = await fetchSheetMarkdownAndBytesAtRevision(driveFileId, revisionId, options);
  return markdown;
}

/**
 * Task 5: fetch the XLSX bytes ONCE and return both the synthesized markdown and the raw
 * bytes in a single Drive export, using the same before/after binding-token race guard as
 * fetchSheetAsMarkdownAtRevision. Callers that need both artifacts (markdown for parsing,
 * bytes for extractSourceAnchors) use this to avoid a second Drive export.
 */
export async function fetchSheetMarkdownAndBytesAtRevision(
  driveFileId: string,
  revisionId: string,
  options: DriveFetchOptions = {},
): Promise<{ markdown: string; bytes: ArrayBuffer }> {
  const drive = options.drive ?? getDriveClient();
  const before = await fetchFileForExport(driveFileId, drive);
  const beforeToken = bindingToken(before);
  if (beforeToken !== revisionId) {
    throw new DriveFetchError(
      `Drive bound revision token for ${driveFileId} changed before xlsx export`,
    );
  }

  const exportUrl = before.exportLinks?.[XLSX_EXPORT_MIME_TYPE];
  if (!exportUrl) {
    throw new DriveFetchError(
      `Drive revision token ${revisionId} for ${driveFileId} did not include an xlsx export link`,
    );
  }
  const accessToken = await (options.getAccessToken ?? getDriveAccessToken)();
  const fetchImpl = options.fetch ?? fetch;
  const exportResponse = await fetchImpl(exportUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: XLSX_EXPORT_MIME_TYPE,
    },
  });
  if (!exportResponse.ok) {
    throw new DriveFetchError(
      `Drive revision xlsx export failed with HTTP ${exportResponse.status}`,
    );
  }

  const bytes = await exportResponse.arrayBuffer();
  const after = await fetchFileForExport(driveFileId, drive);
  const afterToken = bindingToken(after);
  if (afterToken !== revisionId) {
    throw new DriveFetchError(`Drive revision token for ${driveFileId} changed during xlsx export`);
  }

  return { markdown: synthesizeMarkdownFromXlsx(bytes), bytes };
}
