import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { sheetsGetMock, sheetsFactoryMock } = vi.hoisted(() => {
  const sheetsGetMock = vi.fn();
  return {
    sheetsGetMock,
    sheetsFactoryMock: vi.fn(() => ({ spreadsheets: { get: sheetsGetMock } })),
  };
});

vi.mock("googleapis", () => ({
  google: {
    sheets: sheetsFactoryMock,
    drive: vi.fn(() => ({ revisions: { list: vi.fn() } })),
    auth: { GoogleAuth: vi.fn() },
  },
}));

vi.mock("@/lib/drive/client", () => ({
  GOOGLE_DRIVE_SCOPES: [],
  DriveConfigError: class DriveConfigError extends Error {},
  getDriveClient: vi.fn(),
  getDriveAuth: vi.fn(() => ({ kind: "auth" })),
  getDriveAccessToken: vi.fn(async () => "test-token"),
}));

import { defaultDriveClient } from "@/lib/sync/runScheduledCronSync";

describe("defaultDriveClient.listSpreadsheetSheets Sheets v4 fields mask", () => {
  beforeEach(() => {
    sheetsGetMock.mockReset();
    sheetsGetMock.mockResolvedValue({
      data: { sheets: [{ properties: { title: "DIAGRAMS" } }, { properties: { title: "Crew" } }] },
    });
  });

  // Concrete failure mode caught: the Sheets v4 `Sheet` schema has NO `drawings`
  // field, so any mask naming `sheets.drawings.*` makes the live API reject the
  // whole spreadsheets.get with 400 INVALID_ARGUMENT ("Cannot find matching
  // fields for path 'sheets.drawings.objectId'"). That GaxiosError falls through
  // classifySyncFailure as SYNC_FILE_FAILED, failing EVERY cron full re-parse.
  test("sends a schema-valid mask: exactly sheets(properties(title)), no drawings path", async () => {
    const client = defaultDriveClient();
    await client.listSpreadsheetSheets!("spreadsheet-id-1");

    expect(sheetsGetMock).toHaveBeenCalledTimes(1);
    const request = sheetsGetMock.mock.calls[0]![0] as { spreadsheetId: string; fields: string };
    expect(request.spreadsheetId).toBe("spreadsheet-id-1");
    expect(request.fields).toBe("sheets(properties(title))");
    expect(request.fields).not.toContain("drawings");
  });

  test("maps each sheet to { title, embeddedObjects: [] } (degraded, schema-honest shape)", async () => {
    const client = defaultDriveClient();
    const sheets = await client.listSpreadsheetSheets!("spreadsheet-id-1");

    expect(sheets).toEqual([
      { title: "DIAGRAMS", embeddedObjects: [] },
      { title: "Crew", embeddedObjects: [] },
    ]);
  });

  // Structural pin: no code path in the cron adapter may reference the
  // non-existent Sheets v4 `drawings` field again (request mask OR response
  // mapping). Embedded-diagram sourcing needs a feasible mechanism first —
  // see BACKLOG.md (Sheets v4 cannot enumerate drawings).
  test("adapter source never references the non-existent Sheets v4 drawings field", () => {
    const source = readFileSync(join(process.cwd(), "lib/sync/runScheduledCronSync.ts"), "utf8");
    expect(source).not.toMatch(/\bdrawings\b/);
  });
});
