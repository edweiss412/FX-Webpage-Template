import { describe, expect, test } from "vitest";
import { getDriveClient } from "@/lib/drive/client";
import { fetchSheetAsMarkdownAtRevision, XLSX_EXPORT_MIME_TYPE } from "@/lib/drive/fetch";
import { loadLocalEnv } from "./loadLocalEnv";

loadLocalEnv();

const fixtureSpreadsheetId =
  process.env.M6_REAL_DRIVE_FIXTURE_SPREADSHEET_ID ??
  process.env.GOOGLE_DRIVE_SMOKE_SPREADSHEET_ID ??
  process.env.DRIVE_SMOKE_SPREADSHEET_ID;

const hasLiveDriveConfig = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && fixtureSpreadsheetId);

describe.skipIf(!hasLiveDriveConfig)("real Drive markdown export smoke", () => {
  test(
    "live fixture exposes xlsx export and fetches through the bound wrapper",
    async () => {
      const drive = getDriveClient();
      const metadata = await drive.files.get({
        fileId: fixtureSpreadsheetId as string,
        fields: "id, name, mimeType, modifiedTime, headRevisionId, exportLinks",
        supportsAllDrives: true,
      });
      const bindingToken = metadata.data.headRevisionId ?? metadata.data.modifiedTime;

      expect(bindingToken, "fixture spreadsheet must expose a bindable revision token").toBeTruthy();
      expect(metadata.data.exportLinks).toHaveProperty(XLSX_EXPORT_MIME_TYPE);

      const markdown = await fetchSheetAsMarkdownAtRevision(
        fixtureSpreadsheetId as string,
        bindingToken as string,
        { drive },
      );

      expect(markdown.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
