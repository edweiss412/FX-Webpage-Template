import { describe, expect, test } from "vitest";
import { verifyReelOnApply } from "@/lib/sync/verifyReelOnApply";

const staged = {
  driveFileId: "reel-file-1",
  drive_modified_time: "2026-05-01T00:00:00.000Z",
  headRevisionId: "reel-rev-1",
  mimeType: "video/mp4",
};

describe("verifyReelOnApply", () => {
  test("preserves a matching video pin tuple", async () => {
    const result = await verifyReelOnApply(staged, {
      getFileMetadata: async () => ({
        mimeType: "video/mp4",
        modifiedTime: "2026-05-01T00:00:00.000Z",
        headRevisionId: "reel-rev-1",
        trashed: false,
      }),
    });

    expect(result).toEqual({
      openingReel: staged,
      warningCode: null,
      driftReason: null,
    });
  });

  test("revision or modified-time drift clears all reel columns with REEL_DRIFTED", async () => {
    const result = await verifyReelOnApply(staged, {
      getFileMetadata: async () => ({
        mimeType: "video/mp4",
        modifiedTime: "2026-05-01T00:01:00.000Z",
        headRevisionId: "reel-rev-2",
        trashed: false,
      }),
    });

    expect(result).toEqual({
      openingReel: null,
      warningCode: "REEL_DRIFTED",
      driftReason: "REVISION_MISMATCH",
    });
  });

  test("permission denied maps to OPENING_REEL_PERMISSION_DENIED without throwing", async () => {
    const result = await verifyReelOnApply(staged, {
      getFileMetadata: async () => {
        throw { code: 403, errors: [{ reason: "permissionDenied" }] };
      },
    });

    expect(result).toEqual({
      openingReel: null,
      warningCode: "OPENING_REEL_PERMISSION_DENIED",
      driftReason: "PERMISSION_DENIED",
    });
  });

  test("non-video MIME clears all reel columns with OPENING_REEL_NOT_VIDEO", async () => {
    const result = await verifyReelOnApply(staged, {
      getFileMetadata: async () => ({
        mimeType: "application/pdf",
        modifiedTime: "2026-05-01T00:00:00.000Z",
        headRevisionId: "reel-rev-1",
        trashed: false,
      }),
    });

    expect(result).toEqual({
      openingReel: null,
      warningCode: "OPENING_REEL_NOT_VIDEO",
      driftReason: "NON_VIDEO_MIME",
    });
  });
});
