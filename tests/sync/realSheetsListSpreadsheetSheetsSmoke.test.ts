import { describe, expect, test } from "vitest";
import { defaultDriveClient } from "@/lib/sync/runScheduledCronSync";
import { loadLocalEnv } from "../drive/loadLocalEnv";

loadLocalEnv();

const fixtureSpreadsheetId =
  process.env.M6_REAL_DRIVE_FIXTURE_SPREADSHEET_ID ??
  process.env.GOOGLE_DRIVE_SMOKE_SPREADSHEET_ID ??
  process.env.DRIVE_SMOKE_SPREADSHEET_ID;

const hasLiveDriveConfig = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && fixtureSpreadsheetId);

// Live-integration smoke for the PRODUCTION cron adapter's Sheets v4 call.
// Mocked-only coverage approved the schema-invalid `sheets.drawings.*` fields
// mask that the real API rejects with 400 INVALID_ARGUMENT (every cron full
// re-parse failed as SYNC_FILE_FAILED until 2026-06-12). This probe exercises
// the real spreadsheets.get so a schema-invalid mask can never pass review on
// mocks alone again.
describe.skipIf(!hasLiveDriveConfig)("real Sheets listSpreadsheetSheets smoke", () => {
  test("production adapter mask is accepted by the live Sheets v4 API", async () => {
    const client = defaultDriveClient();
    const sheets = await client.listSpreadsheetSheets!(fixtureSpreadsheetId as string);

    expect(sheets.length).toBeGreaterThan(0);
    for (const sheet of sheets) {
      expect(sheet.title).toBeTypeOf("string");
      expect(sheet.title.length).toBeGreaterThan(0);
      // Sheets v4 cannot enumerate floating drawn/embedded images, so the
      // adapter's degraded contract is always an empty embeddedObjects list.
      expect(sheet.embeddedObjects).toEqual([]);
    }
  }, 30_000);
});
