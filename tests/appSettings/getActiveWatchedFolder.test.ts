import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveWatchedFolder } from "@/lib/appSettings/getWatchedFolderId";
import * as supabaseServer from "@/lib/supabase/server";

function appSettingsClient(response: {
  data: { watched_folder_id: string | null; watched_folder_name: string | null } | null;
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

describe("getActiveWatchedFolder", () => {
  it("returns folderId + folderName when both stored", async () => {
    const result = await getActiveWatchedFolder(
      appSettingsClient({
        data: { watched_folder_id: "folder-id-0001", watched_folder_name: "Show Sheets 2026" },
        error: null,
      }) as never,
    );
    expect(result).toEqual({ folderId: "folder-id-0001", folderName: "Show Sheets 2026" });
  });

  it("name null but id present → { folderId, folderName: null }", async () => {
    const result = await getActiveWatchedFolder(
      appSettingsClient({
        data: { watched_folder_id: "folder-id-0002", watched_folder_name: null },
        error: null,
      }) as never,
    );
    expect(result).toEqual({ folderId: "folder-id-0002", folderName: null });
  });

  it("returned error → infra_error", async () => {
    const result = await getActiveWatchedFolder(
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

  it("thrown construction → infra_error", async () => {
    const spy = vi
      .spyOn(supabaseServer, "createSupabaseServiceRoleClient")
      .mockImplementation(() => {
        throw new Error("construction fault");
      });
    const result = await getActiveWatchedFolder();
    expect(result).toMatchObject({
      kind: "infra_error",
      operation: "createSupabaseServiceRoleClient",
      source: "thrown_error",
    });
    spy.mockRestore();
  });

  it("no row + env fallback id → { folderId: <env>, folderName: null }", async () => {
    process.env.GOOGLE_DRIVE_FOLDER_ID = "env-folder-bootstrap";
    const result = await getActiveWatchedFolder(
      appSettingsClient({
        data: null,
        error: null,
      }) as never,
    );
    expect(result).toEqual({ folderId: "env-folder-bootstrap", folderName: null });
  });

  it("an implausible persisted watched_folder_id (`.`) degrades to no-folder (FXAV-CREW-PAGES-4)", async () => {
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    delete process.env.DRIVE_FOLDER_ID;
    const result = await getActiveWatchedFolder(
      appSettingsClient({
        data: { watched_folder_id: ".", watched_folder_name: "poison" },
        error: null,
      }) as never,
    );
    expect(result).toEqual({ kind: "no_folder_configured" });
  });

  it("an implausible first-boot env folder id (`.`) is rejected, not used", async () => {
    process.env.GOOGLE_DRIVE_FOLDER_ID = ".";
    const result = await getActiveWatchedFolder(
      appSettingsClient({
        data: null,
        error: null,
      }) as never,
    );
    expect(result).toEqual({ kind: "no_folder_configured" });
  });
});
