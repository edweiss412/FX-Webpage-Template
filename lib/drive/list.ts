import type { drive_v3 } from "googleapis";
import { getDriveClient } from "@/lib/drive/client";
import { withDriveRetry, type DriveRetryOptions } from "@/lib/drive/fetch";

export const GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
export const DRIVE_LIST_FIELDS =
  "nextPageToken, files(id, name, mimeType, modifiedTime, parents, headRevisionId, md5Checksum)";

/**
 * Per-page wall-clock budget for the folder `files.list`. `listFolder` is the
 * FIRST Drive call in the onboarding scan (`prepareOnboardingFiles`), so an
 * unbounded stall here hangs the whole pass before any sheet is read — the same
 * silent-stall class as the export/`files.get` fixes, on the same hot path. A
 * gaxios-7 per-call `timeout` fires via `AbortSignal.timeout` (GaxiosError
 * `code: "TimeoutError"`), which `driveErrorStatus` maps to a transient 504 so
 * the wrapping `withDriveRetry` retries with a fresh budget then throws a typed
 * error. `retry: false` keeps `withDriveRetry` the single retry layer. The budget
 * is PER PAGE (each `withDriveRetry` call wraps one `files.list` page), so 10s is
 * wide headroom for a page of <=100 files while keeping the listing's contribution
 * to the per-sheet aggregate worst case small (see DRIVE_FILES_GET_TIMEOUT_MS).
 */
export const DRIVE_LIST_TIMEOUT_MS = 10_000;

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
  retry?: DriveRetryOptions;
  /**
   * Per-page wall-clock budget for the `files.list`. Defaults to
   * {@link DRIVE_LIST_TIMEOUT_MS}. Tests pass a tiny value to exercise the stall
   * guard without waiting.
   */
  listTimeoutMs?: number;
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

    // Retry transient 429/5xx on the folder list too (BL-ONBOARDING-SCAN-TRANSIENT-
    // THROTTLE-RETRY): completes withDriveRetry's coverage so the onboarding scan's
    // raised prepare concurrency can't be aborted by a single transient list blip.
    // `params` (which carries supportsAllDrives + includeItemsFromAllDrives) is
    // passed by reference so the shared-Drive-support contract resolves both flags.
    // The per-call gaxios `timeout` bounds a silent stall on this (hot-path,
    // first) Drive call; `retry: false` keeps withDriveRetry the single retry layer.
    const response = await withDriveRetry(
      () =>
        drive.files.list(params, {
          timeout: options.listTimeoutMs ?? DRIVE_LIST_TIMEOUT_MS,
          retry: false,
        }),
      options.retry,
    );
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
