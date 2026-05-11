/**
 * Tests for `projectOpeningReelHasVideo` (M7 Task 7.9 helper).
 *
 * Crew page renders the inline `<video src="/api/asset/reel/<show>">` ONLY
 * when ALL FOUR `shows.opening_reel_*` pin columns are non-NULL AND
 * `opening_reel_mime_type` starts with `video/`. Drift cases (any pin NULL)
 * suppress the request to the route so the crew page never even calls the
 * proxy for a drift-known state. See AC-7.25 cases (4 of them).
 */
import { describe, expect, test } from "vitest";

import { projectOpeningReelHasVideo } from "@/lib/data/openingReel";

describe("projectOpeningReelHasVideo", () => {
  test("all 4 pins non-NULL + video MIME → true", () => {
    expect(
      projectOpeningReelHasVideo({
        opening_reel_drive_file_id: "drv-1",
        opening_reel_drive_modified_time: "2026-04-30T12:00:00Z",
        opening_reel_head_revision_id: "rev-1",
        opening_reel_mime_type: "video/mp4",
      }),
    ).toBe(true);
  });

  test("driveFileId NULL → false (AC-7.25 text-only case)", () => {
    expect(
      projectOpeningReelHasVideo({
        opening_reel_drive_file_id: null,
        opening_reel_drive_modified_time: "2026-04-30T12:00:00Z",
        opening_reel_head_revision_id: "rev-1",
        opening_reel_mime_type: "video/mp4",
      }),
    ).toBe(false);
  });

  test("modified_time NULL → false", () => {
    expect(
      projectOpeningReelHasVideo({
        opening_reel_drive_file_id: "drv-1",
        opening_reel_drive_modified_time: null,
        opening_reel_head_revision_id: "rev-1",
        opening_reel_mime_type: "video/mp4",
      }),
    ).toBe(false);
  });

  test("head_revision_id NULL → false", () => {
    expect(
      projectOpeningReelHasVideo({
        opening_reel_drive_file_id: "drv-1",
        opening_reel_drive_modified_time: "2026-04-30T12:00:00Z",
        opening_reel_head_revision_id: null,
        opening_reel_mime_type: "video/mp4",
      }),
    ).toBe(false);
  });

  test("mime_type NULL → false", () => {
    expect(
      projectOpeningReelHasVideo({
        opening_reel_drive_file_id: "drv-1",
        opening_reel_drive_modified_time: "2026-04-30T12:00:00Z",
        opening_reel_head_revision_id: "rev-1",
        opening_reel_mime_type: null,
      }),
    ).toBe(false);
  });

  test("non-video MIME → false (defense in depth)", () => {
    expect(
      projectOpeningReelHasVideo({
        opening_reel_drive_file_id: "drv-1",
        opening_reel_drive_modified_time: "2026-04-30T12:00:00Z",
        opening_reel_head_revision_id: "rev-1",
        opening_reel_mime_type: "application/pdf",
      }),
    ).toBe(false);
  });

  test("all 4 NULL → false (AC-7.25 drift case)", () => {
    expect(
      projectOpeningReelHasVideo({
        opening_reel_drive_file_id: null,
        opening_reel_drive_modified_time: null,
        opening_reel_head_revision_id: null,
        opening_reel_mime_type: null,
      }),
    ).toBe(false);
  });
});
