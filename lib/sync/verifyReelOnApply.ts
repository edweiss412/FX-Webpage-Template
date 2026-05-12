import { getDriveClient } from "@/lib/drive/client";
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

function defaultDrive(): VerifyReelOnApplyDrive {
  return {
    async getFileMetadata(fileId) {
      const response = await getDriveClient().files.get({
        fileId,
        fields: "mimeType,modifiedTime,trashed,headRevisionId,md5Checksum",
        supportsAllDrives: true,
      });
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
