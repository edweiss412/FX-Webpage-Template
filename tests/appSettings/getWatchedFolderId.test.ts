import { afterEach, describe, expect, test, vi } from "vitest";
import { getActiveWatchedFolderId } from "@/lib/appSettings/getWatchedFolderId";

function appSettingsClient(response: {
  data: { watched_folder_id: string | null } | null;
  error: { message: string } | null;
}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => response),
        })),
      })),
    })),
  };
}

const originalGoogleDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
const originalDriveFolderId = process.env.DRIVE_FOLDER_ID;

function restoreFolderEnv() {
  if (originalGoogleDriveFolderId === undefined) delete process.env.GOOGLE_DRIVE_FOLDER_ID;
  else process.env.GOOGLE_DRIVE_FOLDER_ID = originalGoogleDriveFolderId;
  if (originalDriveFolderId === undefined) delete process.env.DRIVE_FOLDER_ID;
  else process.env.DRIVE_FOLDER_ID = originalDriveFolderId;
}

afterEach(() => {
  restoreFolderEnv();
});

describe("getActiveWatchedFolderId", () => {
  test("app_settings watched_folder_id wins over first-boot env fallback", async () => {
    process.env.GOOGLE_DRIVE_FOLDER_ID = "env-folder-x";

    const result = await getActiveWatchedFolderId(
      appSettingsClient({
        data: { watched_folder_id: "settings-folder-y" },
        error: null,
      }) as never,
    );

    expect(result).toEqual({ folderId: "settings-folder-y" });
  });

  test("env folder is only a first-boot fallback when the app_settings row is absent", async () => {
    process.env.GOOGLE_DRIVE_FOLDER_ID = "bootstrap-folder";

    const result = await getActiveWatchedFolderId(
      appSettingsClient({
        data: null,
        error: null,
      }) as never,
    );

    expect(result).toEqual({ folderId: "bootstrap-folder" });
  });

  test("null watched_folder_id with no env fallback returns a typed no-folder result", async () => {
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    delete process.env.DRIVE_FOLDER_ID;

    const result = await getActiveWatchedFolderId(
      appSettingsClient({
        data: { watched_folder_id: null },
        error: null,
      }) as never,
    );

    expect(result).toEqual({ kind: "no_folder_configured" });
  });

  test("Supabase returned errors become typed infra errors", async () => {
    const result = await getActiveWatchedFolderId(
      appSettingsClient({
        data: null,
        error: { message: "db offline" },
      }) as never,
    );

    expect(result).toMatchObject({
      kind: "infra_error",
      operation: "readActiveWatchedFolderId",
      source: "returned_error",
    });
  });
});
