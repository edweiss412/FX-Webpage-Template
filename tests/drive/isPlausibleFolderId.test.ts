import { describe, expect, test } from "vitest";
import { isPlausibleDriveFolderId } from "@/lib/drive/isPlausibleFolderId";

describe("isPlausibleDriveFolderId", () => {
  test("accepts real Drive folder ids", () => {
    // The live fxav-test-shows folder + a real II- show spreadsheet id.
    expect(isPlausibleDriveFolderId("1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C")).toBe(true);
    expect(isPlausibleDriveFolderId("1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY")).toBe(true);
  });

  test("accepts the test-fixture folder ids used across the suite", () => {
    expect(isPlausibleDriveFolderId("settings-folder-y")).toBe(true);
    expect(isPlausibleDriveFolderId("bootstrap-folder")).toBe(true);
    expect(isPlausibleDriveFolderId("env-folder-x")).toBe(true);
  });

  test("rejects the PAGES-4 poison value `.`", () => {
    // A literal `.` in GOOGLE_DRIVE_FOLDER_ID produced `'.' in parents` Drive
    // queries → 404 `File not found: .` hammered 73x by the cron sync.
    expect(isPlausibleDriveFolderId(".")).toBe(false);
  });

  test("rejects empty, whitespace, and other implausible values", () => {
    expect(isPlausibleDriveFolderId("")).toBe(false);
    expect(isPlausibleDriveFolderId("   ")).toBe(false);
    expect(isPlausibleDriveFolderId(" 1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C ")).toBe(false);
    expect(isPlausibleDriveFolderId("a")).toBe(false);
    expect(isPlausibleDriveFolderId("too-short")).toBe(false); // 9 chars, below floor
    expect(isPlausibleDriveFolderId("has/slash/in/it")).toBe(false);
    expect(isPlausibleDriveFolderId("has spaces here")).toBe(false);
    expect(isPlausibleDriveFolderId("..")).toBe(false);
    expect(isPlausibleDriveFolderId(null)).toBe(false);
    expect(isPlausibleDriveFolderId(undefined)).toBe(false);
  });
});
