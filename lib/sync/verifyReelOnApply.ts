import type { drive_v3 } from "googleapis";
import { getDriveClient } from "@/lib/drive/client";
import {
  DRIVE_FILES_GET_TIMEOUT_MS,
  withDriveRetry,
  type DriveRetryOptions,
} from "@/lib/drive/fetch";
import type { OpeningReelPinned } from "@/lib/parser/types";

export type DriftReason =
  | "TRASHED"
  | "PERMISSION_DENIED"
  | "REVISION_MISMATCH"
  | "MODTIME_MISMATCH"
  | "NON_VIDEO_MIME";

export type ReelWarningCode =
  | "REEL_DRIFTED"
  | "OPENING_REEL_PERMISSION_DENIED"
  | "OPENING_REEL_NOT_VIDEO";

export type ReelMetadata = {
  mimeType?: string | null;
  modifiedTime?: string | null;
  headRevisionId?: string | null;
  trashed?: boolean | null;
};

export type VerifyReelOnApplyDrive = {
  getFileMetadata(fileId: string): Promise<ReelMetadata>;
};

export type VerifyReelOnApplyResult = {
  openingReel: OpeningReelPinned | null;
  warningCode: ReelWarningCode | null;
  driftReason: DriftReason | null;
};

function permissionDenied(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    errors?: Array<{ reason?: unknown }>;
  };
  return (
    candidate.code === 403 ||
    candidate.status === 403 ||
    (candidate.errors ?? []).some((entry) => entry.reason === "permissionDenied")
  );
}

function definitiveGone(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown };
  return (
    candidate.code === 404 ||
    candidate.status === 404 ||
    candidate.code === 410 ||
    candidate.status === 410
  );
}

// Exported + injectable so the default metadata read is directly unit-testable
// (DXT-3). Bounds the previously-untimed `files.get` with a per-call gaxios
// timeout (gaxios-7 fires AbortSignal.timeout → "TimeoutError", which
// driveErrorStatus maps to a transient 504) and routes it through withDriveRetry;
// `retry: false` keeps withDriveRetry the single retry layer. A 403/404/410 is
// non-transient → propagates unchanged to verifyReelOnApply's drift handling.
export function defaultDrive(
  deps: { drive?: drive_v3.Drive; retry?: DriveRetryOptions; timeoutMs?: number } = {},
): VerifyReelOnApplyDrive {
  return {
    async getFileMetadata(fileId) {
      const driveClient = deps.drive ?? getDriveClient();
      // Named const thunk (like fetch.ts's driveFilesGetCall) so the
      // _scopeCheckContract attributes the .files.get to one exemptable site
      // (getFileMetadataCall) rather than an anonymous arrow.
      const getFileMetadataCall = () =>
        driveClient.files.get(
          {
            fileId,
            fields: "mimeType,modifiedTime,trashed,headRevisionId,md5Checksum",
            supportsAllDrives: true,
          },
          { timeout: deps.timeoutMs ?? DRIVE_FILES_GET_TIMEOUT_MS, retry: false },
        );
      // Apply path holds the per-show advisory xact lock, so bound the retry
      // budget tighter than the cron/scan default (1 retry ≈ 16s worst, vs the
      // default 3 ≈ 34s) — one retry covers a transient blip without sitting on
      // the lock for the full default budget. Tests inject deps.retry.
      const response = await withDriveRetry(getFileMetadataCall, deps.retry ?? { maxRetries: 1 });
      return response.data;
    },
  };
}

function drift(reason: DriftReason, warningCode: ReelWarningCode): VerifyReelOnApplyResult {
  return { openingReel: null, warningCode, driftReason: reason };
}

export async function verifyReelOnApply(
  staged: OpeningReelPinned | null,
  drive: VerifyReelOnApplyDrive = defaultDrive(),
): Promise<VerifyReelOnApplyResult> {
  if (!staged) {
    return { openingReel: null, warningCode: null, driftReason: null };
  }

  let current: ReelMetadata;
  try {
    current = await drive.getFileMetadata(staged.driveFileId);
  } catch (error) {
    if (permissionDenied(error)) {
      return drift("PERMISSION_DENIED", "OPENING_REEL_PERMISSION_DENIED");
    }
    if (definitiveGone(error)) {
      return drift("TRASHED", "REEL_DRIFTED");
    }
    throw error;
  }

  if (current.trashed) return drift("TRASHED", "REEL_DRIFTED");
  if (current.headRevisionId !== staged.headRevisionId) {
    return drift("REVISION_MISMATCH", "REEL_DRIFTED");
  }
  if (current.modifiedTime !== staged.drive_modified_time) {
    return drift("MODTIME_MISMATCH", "REEL_DRIFTED");
  }
  if (!current.mimeType?.startsWith("video/")) {
    return drift("NON_VIDEO_MIME", "OPENING_REEL_NOT_VIDEO");
  }

  return {
    openingReel: {
      driveFileId: staged.driveFileId,
      drive_modified_time: current.modifiedTime,
      headRevisionId: current.headRevisionId,
      mimeType: current.mimeType,
    },
    warningCode: null,
    driftReason: null,
  };
}
