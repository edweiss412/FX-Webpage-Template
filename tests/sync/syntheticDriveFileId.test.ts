import { describe, expect, test } from "vitest";
import { isSyntheticDriveFileId } from "@/lib/sync/syntheticDriveFileId";

describe("isSyntheticDriveFileId", () => {
  test("matches the test-seed synthetic shapes", () => {
    // tests/db/_mi11Helpers.ts seedShow → drv-<uuid>
    expect(isSyntheticDriveFileId("drv-8bce1aa5-0f15-41ca-a1f9-d5f338f19f55")).toBe(true);
    // other db-test seeders → drive-<uuid>
    expect(isSyntheticDriveFileId("drive-2ebb9ba1-6f21-40d0-9113-cd29705c009a")).toBe(true);
    // picker e2e default → picker-e2e:<uuid>
    expect(isSyntheticDriveFileId("picker-e2e:3f8db170-7cc3-4ee9-95b5-8e6ba70a553a")).toBe(true);
    expect(isSyntheticDriveFileId("picker-e2e:anything")).toBe(true);
  });

  test("does NOT match real Google Drive ids (incl. those containing hyphens/underscores)", () => {
    // Real ids seen in this project's live folders.
    expect(isSyntheticDriveFileId("1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY")).toBe(false);
    expect(isSyntheticDriveFileId("1Ll_fx6Q24y6aTSqIV7YiruDKrYtezkkKrVCXVc4Cwkw")).toBe(false);
    expect(isSyntheticDriveFileId("1vyZMRTqeFAJgocbSJM2_HDDMsUUJFBiLKk6WKq-dUYo")).toBe(false);
  });

  test("UUID-anchoring prevents false positives on prefix-only lookalikes", () => {
    // A real id that merely STARTS with these letters but is not prefix+UUID.
    expect(isSyntheticDriveFileId("drive1234567890")).toBe(false);
    expect(isSyntheticDriveFileId("drv-not-a-uuid")).toBe(false);
    expect(isSyntheticDriveFileId("driver-8bce1aa5-0f15-41ca-a1f9-d5f338f19f55")).toBe(false);
    // Trailing junk after the UUID must not match (anchored end).
    expect(isSyntheticDriveFileId("drv-8bce1aa5-0f15-41ca-a1f9-d5f338f19f55x")).toBe(false);
  });
});
