import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import type { DriveListedFile } from "@/lib/drive/list";
import {
  processOneFile,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
} from "@/lib/sync/runScheduledCronSync";
import { writeSyncLog } from "@/lib/sync/syncLog";

export type RunPushSyncForShowDeps = {
  fileMeta?: DriveListedFile;
  fetchDriveFileMetadata?: (driveFileId: string) => Promise<DriveListedFile>;
  processOneFile?: (
    driveFileId: string,
    mode: "push",
    fileMeta: DriveListedFile,
    deps?: Pick<ProcessOneFileDeps, "logSync">,
  ) => Promise<ProcessOneFileResult>;
  logSync?: ProcessOneFileDeps["logSync"];
};

export async function runPushSyncForShow(
  driveFileId: string,
  deps: RunPushSyncForShowDeps = {},
): Promise<ProcessOneFileResult> {
  const fileMeta =
    deps.fileMeta ?? (await (deps.fetchDriveFileMetadata ?? fetchDriveFileMetadata)(driveFileId));
  const runOne = deps.processOneFile ?? processOneFile;
  return await runOne(driveFileId, "push", fileMeta, {
    logSync: deps.logSync ?? writeSyncLog,
  });
}
