import type { drive_v3 } from "googleapis";
import { getDriveClient } from "@/lib/drive/client";

export const GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
export const DRIVE_LIST_FIELDS =
  "nextPageToken, files(id, name, mimeType, modifiedTime, parents, headRevisionId, md5Checksum)";

export type DriveListedFile = {
  driveFileId: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents: string[];
  trashed?: boolean;
  headRevisionId?: string;
  md5Checksum?: string;
};

export type DriveListWarning = {
  code: "UNEXPECTED_PARENT";
  driveFileId: string;
  folderId: string;
  parents: string[];
};

export type ListFolderOptions = {
  drive?: drive_v3.Drive;
  onWarning?: (warning: DriveListWarning) => void;
};

function driveQueryString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function toListedFile(file: drive_v3.Schema$File): DriveListedFile | null {
  if (!file.id || !file.name || !file.mimeType || !file.modifiedTime) return null;
  const listed: DriveListedFile = {
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    parents: file.parents ?? [],
  };
  if (typeof file.trashed === "boolean") listed.trashed = file.trashed;
  if (file.headRevisionId) listed.headRevisionId = file.headRevisionId;
  if (file.md5Checksum) listed.md5Checksum = file.md5Checksum;
  return listed;
}

export async function listFolder(
  folderId: string,
  options: ListFolderOptions = {},
): Promise<DriveListedFile[]> {
  const drive = options.drive ?? getDriveClient();
  const q = `'${driveQueryString(folderId)}' in parents and mimeType = '${GOOGLE_SHEETS_MIME_TYPE}' and trashed = false`;
  const files: DriveListedFile[] = [];
  let pageToken: string | undefined;

  do {
    const params: drive_v3.Params$Resource$Files$List = {
      q,
      pageSize: 100,
      fields: DRIVE_LIST_FIELDS,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives",
    };
    if (pageToken) params.pageToken = pageToken;

    const response = await drive.files.list(params);
    for (const rawFile of response.data.files ?? []) {
      const file = toListedFile(rawFile);
      if (!file) continue;
      if (!file.parents.includes(folderId)) {
        options.onWarning?.({
          code: "UNEXPECTED_PARENT",
          driveFileId: file.driveFileId,
          folderId,
          parents: file.parents,
        });
        continue;
      }
      files.push(file);
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}
